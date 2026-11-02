// Server-Adressen und Internet-Einladungen (ohne Abhängigkeiten, damit testbar).

export const DEFAULT_PORT = 8787;

/** Eingabe wie "192.168.1.20", "meinserver.de:9000", "xyz.trycloudflare.com" oder "ws://…" in eine WebSocket-URL umwandeln. */
export function normalizeServerUrl(input: string): string {
  let s = input.trim().replace(/^http(s?):\/\//i, 'ws$1://');
  if (!s) return `ws://localhost:${DEFAULT_PORT}`;
  // Tunnel-Adressen laufen verschlüsselt über Port 443
  if (!/^wss?:\/\//i.test(s)) s = /\.trycloudflare\.com(\/|$)/i.test(s) ? `wss://${s}` : `ws://${s}`;
  const u = new URL(s);
  if (!u.port && u.protocol === 'ws:') u.port = String(DEFAULT_PORT);
  return `${u.protocol}//${u.host}`;
}

/** Internet-Einladung: "<adresse>/<code>", z. B. "abc-def.trycloudflare.com/K7Q-2MX". */
export function inviteLine(tunnelUrl: string, code: string) {
  return `${tunnelUrl.replace(/^https?:\/\//, '')}/${code}`;
}

/** Eingefügte Einladung in Adresse und Code zerlegen (auch aus einem längeren Nachrichtentext). */
export function parseInvite(input: string): { addr: string; code: string } | null {
  const m = input.trim().match(/((?:https?:\/\/|wss?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?)\/([A-Z0-9]{3}-[A-Z0-9]{3})/i);
  return m ? { addr: m[1], code: m[2].toUpperCase() } : null;
}
