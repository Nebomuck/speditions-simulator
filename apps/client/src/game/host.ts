// GameHost-Abstraktion: Die Oberfläche spricht immer mit einem Host – entweder dem lokalen
// Simulations-Worker (Einzelspieler) oder dem Multiplayer-Server über WebSocket.
// Beide liefern Zustandsschnappschüsse und führen Befehle aus.

import { applyPatch, type Command, type CommandResult, type GameState, type NewGameOptions } from '@spedsim/core';
import type { HostRequest, HostResponse, SaveMeta, Snapshot } from './protocol.ts';

export interface HostEvents {
  onSnapshot(s: Snapshot): void;
  onError(message: string): void;
  onStatus?(status: string): void;
}

export interface GameHost {
  readonly mode: 'local' | 'remote';
  command(cmd: Command): Promise<CommandResult>;
  save?(name: string): Promise<void>;
  exportSave?(): Promise<string>;
  close(): void;
  /** Multiplayer: Einladungscode */
  inviteCode?: string;
}

export class LocalHost implements GameHost {
  readonly mode = 'local' as const;
  private worker: Worker;
  private seq = 0;
  private pending = new Map<number, (r: HostResponse) => void>();

  constructor(events: HostEvents) {
    this.worker = new Worker(new URL('../worker/sim.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'snapshot') events.onSnapshot(m.snapshot);
      else if (m.type === 'error') events.onError(m.message);
      else if (m.type === 'response') {
        this.pending.get(m.id)?.(m.res);
        this.pending.delete(m.id);
      }
    };
  }

  request(req: HostRequest): Promise<HostResponse> {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, req });
    });
  }

  private async ok(req: HostRequest) {
    const r = await this.request(req);
    if (!r.ok) throw new Error(r.error);
    return r;
  }

  newGame(options: NewGameOptions) {
    return this.ok({ kind: 'new', options });
  }
  load(name: string) {
    return this.ok({ kind: 'load', name });
  }
  importSave(text: string) {
    return this.ok({ kind: 'import', text });
  }
  async listSaves(): Promise<SaveMeta[]> {
    return (await this.ok({ kind: 'listSaves' })).saves ?? [];
  }
  async deleteSave(name: string) {
    await this.ok({ kind: 'deleteSave', name });
  }
  async save(name: string) {
    await this.ok({ kind: 'save', name });
  }
  async exportSave() {
    return (await this.ok({ kind: 'export' })).text!;
  }
  async command(cmd: Command): Promise<CommandResult> {
    const r = await this.request({ kind: 'command', cmd });
    if (!r.ok) return { ok: false, error: r.error };
    return r.result!;
  }
  close() {
    this.request({ kind: 'close' });
  }
}

type RemoteEvents = HostEvents & {
  onWelcome?(w: { playerId: string; gameId: string; inviteCode: string; token: string }): void;
  onCompany?(gameId: string, company: string): void;
  /** vor jedem Wiederverbindungsversuch: aktuelle Server-Adresse ermitteln (Tunnel-Adresse kann wechseln) */
  resolveUrl?(): Promise<string | null>;
};

/** Multiplayer-Host: Verbindung zum serverautoritativen Spielserver. */
export class RemoteHost implements GameHost {
  readonly mode = 'remote' as const;
  private ws: WebSocket;
  private seq = 0;
  private pending = new Map<number, (r: CommandResult) => void>();
  inviteCode?: string;
  gameId?: string;
  private closed = false;
  private welcomed = false;
  private companyReported = false;
  /** Delta-Synchronisation: zuletzt empfangener Zustand und Zählstand */
  private state: GameState | null = null;
  private rev = -1;

  /** aktuelle Server-Adresse (kann sich bei Wiederverbindung ändern) */
  url: string;
  private hello: Record<string, unknown>;
  private events: RemoteEvents;

  constructor(url: string, hello: Record<string, unknown>, events: RemoteEvents) {
    this.url = url;
    this.hello = hello;
    this.events = events;
    this.ws = this.connect();
  }

  private connect(): WebSocket {
    const ws = new WebSocket(this.url);
    // neue Verbindung beginnt immer mit einem Vollzustand
    this.state = null;
    this.rev = -1;
    ws.onopen = () => {
      this.events.onStatus?.('verbunden');
      ws.send(JSON.stringify(this.hello));
    };
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.t === 'welcome') {
        this.welcomed = true;
        this.inviteCode = m.inviteCode;
        this.gameId = m.gameId;
        // bei Wiederverbindung als bestehender Spieler beitreten
        this.hello = { t: 'join', code: m.inviteCode, playerId: m.playerId, token: m.token };
        this.events.onWelcome?.(m);
      } else if (m.t === 'state' || m.t === 'patch') {
        if (m.t === 'patch') {
          // Delta passt nicht zum vorhandenen Stand → Vollzustand anfordern
          if (!this.state || m.base !== this.rev) {
            if (this.rev !== -2) ws.send(JSON.stringify({ t: 'resync' }));
            this.rev = -2;
            return;
          }
          this.state = applyPatch(this.state, m.ops);
        } else this.state = m.state as GameState;
        this.rev = m.rev;
        if (!this.companyReported && this.gameId) {
          this.companyReported = true;
          this.events.onCompany?.(this.gameId, this.state.company.name);
        }
        this.events.onSnapshot({ state: this.state, at: Date.now(), playerId: m.playerId });
      } else if (m.t === 'result') {
        this.pending.get(m.id)?.(m.result);
        this.pending.delete(m.id);
      } else if (m.t === 'error') {
        this.events.onError(m.message);
        // Beitritt abgelehnt (falscher Code/Token) → nicht endlos neu verbinden
        if (!this.welcomed) this.close();
      }
    };
    ws.onclose = () => {
      if (this.closed) return;
      // Erstverbindung gescheitert → melden statt still endlos zu wiederholen
      if (!this.welcomed) {
        this.close();
        this.events.onStatus?.('');
        this.events.onError(`Server ${this.url.replace(/^wss?:\/\//, '')} nicht erreichbar. Läuft das Spiel beim Host und ist die Adresse richtig?`);
        return;
      }
      this.events.onStatus?.('Verbindung getrennt – neuer Versuch …');
      for (const r of this.pending.values()) r({ ok: false, error: 'Verbindung getrennt.' });
      this.pending.clear();
      setTimeout(async () => {
        const fresh = await this.events.resolveUrl?.().catch(() => null);
        if (fresh) this.url = fresh;
        if (!this.closed) this.ws = this.connect();
      }, 2000);
    };
    return ws;
  }

  command(cmd: Command): Promise<CommandResult> {
    const id = ++this.seq;
    return new Promise((resolve) => {
      if (this.ws.readyState !== WebSocket.OPEN) return resolve({ ok: false, error: 'Nicht verbunden.' });
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ t: 'cmd', id, cmd }));
    });
  }

  close() {
    this.closed = true;
    this.ws.close();
  }
}
