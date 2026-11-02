import { describe, expect, it } from 'vitest';
import { inviteLine, normalizeServerUrl, parseInvite } from '../src/game/invite.ts';

describe('Multiplayer-Adressen und Einladungen', () => {
  it('ergänzt Protokoll und Standardport für Heimnetz- und Serveradressen', () => {
    expect(normalizeServerUrl('192.168.178.20')).toBe('ws://192.168.178.20:8787');
    expect(normalizeServerUrl('meinserver.de:9000')).toBe('ws://meinserver.de:9000');
    expect(normalizeServerUrl('wss://spiel.example.org')).toBe('wss://spiel.example.org');
    expect(normalizeServerUrl('')).toBe('ws://localhost:8787');
  });

  it('verbindet Tunnel-Adressen verschlüsselt ohne Port', () => {
    expect(normalizeServerUrl('abc-def.trycloudflare.com')).toBe('wss://abc-def.trycloudflare.com');
    expect(normalizeServerUrl('https://abc-def.trycloudflare.com')).toBe('wss://abc-def.trycloudflare.com');
  });

  it('erzeugt und zerlegt Internet-Einladungen, auch aus Nachrichtentext', () => {
    const line = inviteLine('https://pocket-roulette.trycloudflare.com', 'K7Q-2MX');
    expect(line).toBe('pocket-roulette.trycloudflare.com/K7Q-2MX');
    expect(parseInvite(line)).toEqual({ addr: 'pocket-roulette.trycloudflare.com', code: 'K7Q-2MX' });
    expect(parseInvite(`Komm in meine Spedition: ${line} !`)).toEqual({ addr: 'pocket-roulette.trycloudflare.com', code: 'K7Q-2MX' });
    expect(parseInvite('192.168.178.20:8787/k7q-2mx')).toEqual({ addr: '192.168.178.20:8787', code: 'K7Q-2MX' });
    expect(parseInvite('192.168.178.20')).toBeNull();
    expect(normalizeServerUrl(parseInvite(line)!.addr)).toBe('wss://pocket-roulette.trycloudflare.com');
  });
});
