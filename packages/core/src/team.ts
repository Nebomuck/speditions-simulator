// Zusammenarbeit im kooperativen Multiplayer: Rollen, Rechtegrenzen (Ausgabenlimit, Standorte), interne
// Nachrichten, Aufgabenverteilung, gemeinsame Aktivitäten und Abstimmungen. Alles läuft über Commands und
// damit serverautoritativ; private Nachrichten filtert `playerView` vor dem Versand heraus.

import { CITY_BY_ID } from './data/cities.ts';
import { addLog, book, formatMoney } from './finance.ts';
import { newId } from './rng.ts';
import { MIN_PER_DAY, formatDateTime } from './time.ts';
import type {
  GameState, Id, InternalMessage, JointActivity, JointKind, Money, Needs, Permission, Player, TaskArea, TaskStatus, TeamRole, TeamState, TeamTask, TeamVote,
} from './types.ts';

type Result = { ok: true; id?: Id } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

// ---------------------------------------------------------------- Kataloge

export interface RoleDef {
  name: string;
  text: string;
  permissions: Permission[];
}

export const TEAM_ROLES: Record<Exclude<TeamRole, 'custom'>, RoleDef> = {
  ceo: {
    name: 'Geschäftsführung',
    text: 'Investitionen, Finanzen, Unternehmensentwicklung, Verträge',
    permissions: ['dispatch', 'fleet', 'purchase', 'sellVehicles', 'personnel', 'fireStaff', 'finance', 'loans', 'expansion', 'admin'],
  },
  dispatcher: { name: 'Disposition', text: 'Aufträge, Fahrerzuweisung, Routenplanung, Live-Überwachung', permissions: ['dispatch'] },
  fleet_manager: { name: 'Fuhrparkleitung', text: 'Fahrzeuge, Reparaturen, Wartung, Fahrzeugbeschaffung', permissions: ['fleet', 'purchase', 'sellVehicles'] },
  hr_manager: { name: 'Personalleitung', text: 'Mitarbeiter, Gehälter, Urlaub, Weiterbildung, Personalgewinnung', permissions: ['personnel', 'fireStaff'] },
};

export const ROLE_LABEL: Record<TeamRole, string> = {
  ceo: TEAM_ROLES.ceo.name,
  dispatcher: TEAM_ROLES.dispatcher.name,
  fleet_manager: TEAM_ROLES.fleet_manager.name,
  hr_manager: TEAM_ROLES.hr_manager.name,
  custom: 'Individuell',
};

export const TASK_AREA_LABEL: Record<TaskArea, string> = {
  dispatch: 'Disposition',
  fleet: 'Fuhrpark',
  personnel: 'Personal',
  finance: 'Finanzen',
  expansion: 'Ausbau',
  general: 'Allgemein',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = { open: 'Offen', doing: 'In Arbeit', done: 'Erledigt' };

export interface JointDef {
  name: string;
  hours: number;
  /** Kosten je Teilnehmer vom Privatkonto */
  cost: Money;
  effects: Partial<Needs>;
  text: string;
}

export const JOINT_ACTIVITIES: Record<JointKind, JointDef> = {
  dinner: { name: 'Zusammen essen gehen', hours: 2, cost: 55_00, effects: { hunger: 25, social: 14, leisure: 8, happiness: 4 }, text: 'Sättigung und Geselligkeit' },
  event: { name: 'Veranstaltung besuchen', hours: 4, cost: 80_00, effects: { leisure: 20, social: 12, stress: -8, happiness: 5 }, text: 'Konzert, Messe oder Spiel' },
  leisure: { name: 'Gemeinsame Freizeit', hours: 3, cost: 35_00, effects: { leisure: 16, social: 10, stress: -8, health: 2 }, text: 'Bowling, Kart oder Radtour' },
  meeting: {
    name: 'Geschäftsbesprechung',
    hours: 2,
    cost: 0,
    effects: { social: 5, stress: -2 },
    text: 'Abstimmung im Team: eine Woche lang +2 % auf neue Auftragsangebote',
  },
};

/** Gesellige Aktivitäten wirken je weiterem Teilnehmer etwas stärker */
const GROUP_BONUS = 0.15;
/** Teambesprechung: Preisaufschlag auf neue Angebote */
export const MEETING_PRICE_BONUS = 0.02;
const MEETING_DAYS = 7;
const INVITE_HOURS = 12;
const MAX_MESSAGES = 400;
const MAX_TASKS = 200;

// ---------------------------------------------------------------- Rechte

export function setRole(state: GameState, playerId: Id, role: TeamRole): Result {
  const p = state.players[playerId];
  if (!p) return fail('Spieler nicht gefunden.');
  if (p.isFounder) return fail('Die Rolle des Firmengründers kann nicht geändert werden.');
  p.role = role;
  if (role !== 'custom') p.permissions = [...TEAM_ROLES[role].permissions];
  addLog(state, { level: 'info', category: 'multiplayer', text: `${p.name} übernimmt die Rolle ${ROLE_LABEL[role]}.` });
  return { ok: true };
}

export function setPlayerLimits(state: GameState, playerId: Id, spendLimit: Money | null, locationIds: Id[]): Result {
  const p = state.players[playerId];
  if (!p) return fail('Spieler nicht gefunden.');
  if (p.isFounder) return fail('Für den Firmengründer gelten keine Grenzen.');
  if (spendLimit !== null && (!Number.isFinite(spendLimit) || spendLimit < 0)) return fail('Ungültiges Ausgabenlimit.');
  const known = new Set(state.company.locations.map((l) => l.id));
  const locs = [...new Set(locationIds)].filter((id) => known.has(id));
  if (spendLimit === null) delete p.spendLimit;
  else p.spendLimit = Math.round(spendLimit);
  if (locs.length) p.locationIds = locs;
  else delete p.locationIds;
  addLog(state, { level: 'info', category: 'multiplayer', text: `Grenzen für ${p.name}: ${spendLimit === null ? 'kein Ausgabenlimit' : `höchstens ${formatMoney(p.spendLimit!)} je Ausgabe`}, ${locs.length ? `Standorte ${locs.map((id) => CITY_BY_ID[state.company.locations.find((l) => l.id === id)!.cityId]?.name).join(', ')}` : 'alle Standorte'}.` });
  return { ok: true };
}

/** Darf der Spieler diesen Standort verwalten? */
export function mayManageLocation(p: Player, locationId: Id | undefined): boolean {
  if (!p.locationIds?.length || locationId === undefined) return true;
  return p.locationIds.includes(locationId);
}

// ---------------------------------------------------------------- Nachrichten

export function sendMessage(state: GameState, from: Id, to: Id[], subject: string, text: string, ref?: InternalMessage['ref']): Result {
  const recipients = [...new Set(to)].filter((id) => id !== from && state.players[id]);
  if (!recipients.length) return fail('Bitte mindestens einen Empfänger wählen.');
  const body = String(text ?? '').trim().slice(0, 2000);
  if (!body) return fail('Die Nachricht ist leer.');
  const msg: InternalMessage = {
    id: newId(state, 'msg'),
    t: state.time,
    from,
    to: recipients,
    subject: String(subject ?? '').trim().slice(0, 120) || '(ohne Betreff)',
    text: body,
    readBy: [from],
    ...(ref ? { ref } : {}),
  };
  state.team.messages.push(msg);
  if (state.team.messages.length > MAX_MESSAGES) state.team.messages.shift();
  return { ok: true, id: msg.id };
}

export function readMessage(state: GameState, playerId: Id, id: Id): Result {
  const m = state.team.messages.find((x) => x.id === id);
  if (!m || (m.from !== playerId && !m.to.includes(playerId))) return fail('Nachricht nicht gefunden.');
  if (!m.readBy.includes(playerId)) m.readBy.push(playerId);
  return { ok: true };
}

export const unreadMessages = (state: GameState, playerId: Id) =>
  (state.team?.messages ?? []).filter((m) => m.to.includes(playerId) && !m.readBy.includes(playerId)).length;

// ---------------------------------------------------------------- Aufgaben

export function createTask(state: GameState, by: Id, t: { title: string; note?: string; area?: TaskArea; assignee?: Id; due?: number }): Result {
  const title = String(t.title ?? '').trim().slice(0, 120);
  if (!title) return fail('Die Aufgabe braucht einen Titel.');
  if (t.assignee && !state.players[t.assignee]) return fail('Spieler nicht gefunden.');
  const area: TaskArea = t.area && t.area in TASK_AREA_LABEL ? t.area : 'general';
  const task: TeamTask = {
    id: newId(state, 'tsk'),
    title,
    ...(t.note?.trim() ? { note: t.note.trim().slice(0, 1000) } : {}),
    area,
    createdBy: by,
    ...(t.assignee ? { assignee: t.assignee } : {}),
    created: state.time,
    ...(t.due && t.due > state.time ? { due: Math.round(t.due) } : {}),
    status: 'open',
  };
  state.team.tasks.push(task);
  // erledigte Aufgaben zuerst aufräumen
  while (state.team.tasks.length > MAX_TASKS) {
    const i = state.team.tasks.findIndex((x) => x.status === 'done');
    state.team.tasks.splice(i >= 0 ? i : 0, 1);
  }
  const who = t.assignee ? state.players[t.assignee].name : 'offen';
  addLog(state, { level: 'info', category: 'multiplayer', text: `Neue Aufgabe von ${state.players[by].name} (${who}): ${title}` });
  return { ok: true, id: task.id };
}

export function updateTask(state: GameState, by: Id, id: Id, patch: { status?: TaskStatus; assignee?: Id | null }): Result {
  const t = state.team.tasks.find((x) => x.id === id);
  if (!t) return fail('Aufgabe nicht gefunden.');
  if (patch.assignee !== undefined) {
    if (patch.assignee === null) delete t.assignee;
    else if (!state.players[patch.assignee]) return fail('Spieler nicht gefunden.');
    else t.assignee = patch.assignee;
  }
  if (patch.status && patch.status !== t.status) {
    if (!(patch.status in TASK_STATUS_LABEL)) return fail('Ungültiger Status.');
    t.status = patch.status;
    if (patch.status === 'done') {
      t.done = state.time;
      addLog(state, { level: 'success', category: 'multiplayer', text: `${state.players[by].name} hat die Aufgabe erledigt: ${t.title}` });
    } else delete t.done;
  }
  return { ok: true };
}

export function deleteTask(state: GameState, by: Id, id: Id): Result {
  const i = state.team.tasks.findIndex((x) => x.id === id);
  if (i < 0) return fail('Aufgabe nicht gefunden.');
  const p = state.players[by];
  if (state.team.tasks[i].createdBy !== by && !p.permissions.includes('admin')) return fail('Nur wer die Aufgabe angelegt hat oder die Spielleitung darf sie löschen.');
  state.team.tasks.splice(i, 1);
  return { ok: true };
}

export const openTasksFor = (state: GameState, playerId: Id) => (state.team?.tasks ?? []).filter((t) => t.assignee === playerId && t.status !== 'done').length;

// ---------------------------------------------------------------- Gemeinsame Aktivitäten

const clamp = (v: number) => Math.max(0, Math.min(100, v));

function busyReason(state: GameState, p: Player): string | null {
  const c = p.character;
  if (c.sickUntil !== undefined && state.time < c.sickUntil) return `${p.name} ist krank.`;
  if (c.activity && state.time < c.activity.until) return `${p.name} ist beschäftigt (${c.activity.text}).`;
  return null;
}

export function proposeJoint(state: GameState, hostId: Id, kind: JointKind, playerIds: Id[]): Result {
  const def = JOINT_ACTIVITIES[kind];
  if (!def) return fail('Unbekannte Aktivität.');
  const invited = [...new Set(playerIds)].filter((id) => id !== hostId && state.players[id]);
  if (!invited.length) return fail('Lade mindestens einen Mitspieler ein.');
  const host = state.players[hostId];
  const busy = busyReason(state, host);
  if (busy) return fail(busy);
  if (host.character.privateAccount.balance < def.cost) return fail('Nicht genügend Geld auf dem Privatkonto.');
  if (state.team.activities.some((a) => a.status === 'pending' && a.host === hostId)) return fail('Du hast bereits eine offene Einladung.');
  const a: JointActivity = {
    id: newId(state, 'jnt'),
    kind,
    host: hostId,
    invited,
    accepted: [],
    declined: [],
    created: state.time,
    expires: state.time + INVITE_HOURS * 60,
    status: 'pending',
  };
  state.team.activities.push(a);
  if (state.team.activities.length > 60) state.team.activities.splice(state.team.activities.findIndex((x) => x.status !== 'pending'), 1);
  addLog(state, { level: 'info', category: 'multiplayer', text: `${host.name} lädt ein: ${def.name} (${invited.map((id) => state.players[id].name).join(', ')}).` });
  return { ok: true, id: a.id };
}

export function respondJoint(state: GameState, playerId: Id, id: Id, accept: boolean): Result {
  const a = state.team.activities.find((x) => x.id === id);
  if (!a || a.status !== 'pending') return fail('Die Einladung ist nicht mehr offen.');
  if (!a.invited.includes(playerId)) return fail('Du bist nicht eingeladen.');
  if (a.accepted.includes(playerId) || a.declined.includes(playerId)) return fail('Du hast bereits geantwortet.');
  if (accept) {
    const p = state.players[playerId];
    const busy = busyReason(state, p);
    if (busy) return fail(busy);
    if (p.character.privateAccount.balance < JOINT_ACTIVITIES[a.kind].cost) return fail('Nicht genügend Geld auf dem Privatkonto.');
    a.accepted.push(playerId);
  } else a.declined.push(playerId);
  // alle haben geantwortet → sofort durchführen
  if (a.accepted.length + a.declined.length === a.invited.length) finishJoint(state, a);
  return { ok: true };
}

export function cancelJoint(state: GameState, playerId: Id, id: Id): Result {
  const a = state.team.activities.find((x) => x.id === id);
  if (!a || a.status !== 'pending') return fail('Die Einladung ist nicht mehr offen.');
  if (a.host !== playerId) return fail('Nur der Gastgeber kann absagen.');
  // mit mindestens einer Zusage vorzeitig starten, sonst absagen
  if (a.accepted.length) finishJoint(state, a);
  else a.status = 'cancelled';
  return { ok: true };
}

/** Aktivität mit allen Zugesagten durchführen (bei keiner Zusage: abgesagt). */
function finishJoint(state: GameState, a: JointActivity) {
  const def = JOINT_ACTIVITIES[a.kind];
  const ids = [a.host, ...a.accepted].filter((id) => {
    const p = state.players[id];
    return p && !busyReason(state, p) && p.character.privateAccount.balance >= def.cost;
  });
  if (ids.length < 2) {
    a.status = a.accepted.length ? 'cancelled' : 'expired';
    addLog(state, { level: 'info', category: 'multiplayer', text: `${def.name} fällt aus – zu wenige Teilnehmer.` });
    return;
  }
  const factor = 1 + GROUP_BONUS * (ids.length - 2);
  for (const id of ids) {
    const p = state.players[id];
    const c = p.character;
    if (def.cost) book(state, `private:${id}`, -def.cost, 'living', def.name);
    for (const [k, v] of Object.entries(def.effects) as [keyof Needs, number][]) c.needs[k] = clamp(c.needs[k] + v * factor);
    c.activity = { id: `joint:${a.kind}`, until: state.time + def.hours * 60, text: def.name };
  }
  if (a.kind === 'meeting') state.team.meetingBonusUntil = Math.max(state.team.meetingBonusUntil ?? 0, state.time + MEETING_DAYS * MIN_PER_DAY);
  a.status = 'done';
  addLog(state, {
    level: 'success',
    category: 'multiplayer',
    text: `${def.name} mit ${ids.map((id) => state.players[id].name).join(', ')}${a.kind === 'meeting' ? ' – bessere Abstimmung im Vertrieb für eine Woche' : ''}.`,
  });
}

export const meetingBonus = (state: GameState) => ((state.team?.meetingBonusUntil ?? -1) > state.time ? MEETING_PRICE_BONUS : 0);

export const pendingInvitesFor = (state: GameState, playerId: Id) =>
  (state.team?.activities ?? []).filter((a) => a.status === 'pending' && a.invited.includes(playerId) && !a.accepted.includes(playerId) && !a.declined.includes(playerId)).length;

// ---------------------------------------------------------------- Abstimmungen

export function createVote(state: GameState, by: Id, question: string, options: string[], hours: number): Result {
  const q = String(question ?? '').trim().slice(0, 200);
  const opts = (options ?? []).map((o) => String(o).trim().slice(0, 80)).filter(Boolean).slice(0, 6);
  if (!q) return fail('Bitte eine Frage eingeben.');
  if (opts.length < 2) return fail('Mindestens zwei Antworten angeben.');
  const h = Math.max(1, Math.min(7 * 24, Math.round(hours || 24)));
  const v: TeamVote = { id: newId(state, 'vot'), question: q, options: opts, votes: {}, createdBy: by, created: state.time, closes: state.time + h * 60, status: 'open' };
  state.team.votes.push(v);
  if (state.team.votes.length > 50) state.team.votes.splice(state.team.votes.findIndex((x) => x.status === 'closed'), 1);
  addLog(state, { level: 'info', category: 'multiplayer', text: `Abstimmung von ${state.players[by].name}: ${q} (bis ${formatDateTime(v.closes)})` });
  return { ok: true, id: v.id };
}

export function castVote(state: GameState, by: Id, id: Id, option: number): Result {
  const v = state.team.votes.find((x) => x.id === id);
  if (!v || v.status !== 'open') return fail('Die Abstimmung ist beendet.');
  if (!Number.isInteger(option) || option < 0 || option >= v.options.length) return fail('Ungültige Antwort.');
  v.votes[by] = option;
  // alle haben abgestimmt → sofort auswerten
  if (Object.keys(state.players).every((id) => id in v.votes)) closeVoteNow(state, v);
  return { ok: true };
}

export function closeVote(state: GameState, by: Id, id: Id): Result {
  const v = state.team.votes.find((x) => x.id === id);
  if (!v || v.status !== 'open') return fail('Die Abstimmung ist bereits beendet.');
  if (v.createdBy !== by && !state.players[by].permissions.includes('admin')) return fail('Nur wer die Abstimmung gestartet hat oder die Spielleitung darf sie beenden.');
  closeVoteNow(state, v);
  return { ok: true };
}

export function voteCounts(v: TeamVote): number[] {
  const counts = v.options.map(() => 0);
  for (const o of Object.values(v.votes)) counts[o]++;
  return counts;
}

function closeVoteNow(state: GameState, v: TeamVote) {
  const counts = voteCounts(v);
  const max = Math.max(...counts);
  const winners = counts.flatMap((c, i) => (c === max && max > 0 ? [i] : []));
  v.status = 'closed';
  v.result = winners.length === 1 ? winners[0] : -1;
  addLog(state, {
    level: 'info',
    category: 'multiplayer',
    text: `Abstimmung beendet: ${v.question} → ${v.result >= 0 ? `„${v.options[v.result]}“ (${max} Stimme${max === 1 ? '' : 'n'})` : max ? 'Gleichstand' : 'keine Stimmen'}`,
  });
}

// ---------------------------------------------------------------- Simulation

/** Stündlich: abgelaufene Einladungen durchführen oder verfallen lassen, Abstimmungen schließen. */
export function hourlyTeam(state: GameState): void {
  const team = state.team;
  if (!team) return;
  for (const a of team.activities) if (a.status === 'pending' && state.time >= a.expires) finishJoint(state, a);
  for (const v of team.votes) if (v.status === 'open' && state.time >= v.closes) closeVoteNow(state, v);
}

/** Sicht eines Spielers: fremde interne Nachrichten werden entfernt. */
export function playerView(state: GameState, playerId: Id): GameState {
  const team = state.team;
  if (!team) return state;
  const messages = team.messages.filter((m) => m.from === playerId || m.to.includes(playerId));
  if (messages.length === team.messages.length) return state;
  return { ...state, team: { ...team, messages } as TeamState };
}
