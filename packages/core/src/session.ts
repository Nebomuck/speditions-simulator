// GameSession: kapselt Zustand + Simulationsschleife. Wird im Einzelspieler (Web Worker)
// und auf dem Multiplayer-Server identisch verwendet. Die Echtzeit wird in Spielminuten
// umgerechnet; die Simulation läuft in festen 1-Minuten-Schritten (deterministisch,
// unabhängig von Bildrate und Client).

import { applyCommand, type Command, type CommandResult } from './commands.ts';
import type { SimContext } from './context.ts';
import { tickMinute } from './sim.ts';
import type { GameState, Id } from './types.ts';

/** maximal so viele Spielminuten pro advance()-Aufruf (Schutz bei Hängern) */
const MAX_CATCHUP_MIN = 240;

export class GameSession {
  private carry = 0;
  /** wird nach jeder Zustandsänderung erhöht (für Synchronisation) */
  revision = 0;

  state: GameState;
  readonly ctx: SimContext;

  constructor(state: GameState, ctx: SimContext) {
    this.state = state;
    this.ctx = ctx;
  }

  command(actorId: Id, cmd: Command): CommandResult {
    let result: CommandResult;
    try {
      result = applyCommand(this.state, this.ctx, actorId, cmd);
    } catch (e) {
      result = { ok: false, error: `Interner Fehler: ${(e as Error).message}` };
    }
    if (result.ok) this.revision++;
    return result;
  }

  /** Echtzeit fortschreiben; liefert Anzahl simulierter Minuten. */
  advance(realMs: number): number {
    if (this.state.paused) {
      this.carry = 0;
      return 0;
    }
    this.carry += (realMs / 1000) * this.state.speed;
    const minutes = Math.min(MAX_CATCHUP_MIN, Math.floor(this.carry));
    this.carry -= minutes;
    if (this.carry > MAX_CATCHUP_MIN) this.carry = 0;
    for (let i = 0; i < minutes; i++) tickMinute(this.state, this.ctx);
    if (minutes > 0) this.revision++;
    return minutes;
  }

  /** Bruchteil der aktuellen Minute (für flüssige Interpolation auf dem Client). */
  get fraction() {
    return this.carry;
  }
}
