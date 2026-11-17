/** Types et état global de la simulation. Aucun accès au DOM ici. */
import { SHIPS } from './data';

export type TargetType = 'power' | 'small' | 'fish' | 'sail' | 'nuc' | 'ram';
export type Role = 'giveway' | 'standon' | 'headon' | 'overtaking' | 'overtaken' | 'giveway18' | 'standon18' | 'R19';
export type Behaviour = 'good' | 'late' | 'passive' | 'wrong';
export type Visibility = 'good' | 'poor';
export type Compliance = 'disc' | 'real' | 'hostile';
export type MsgLevel = 'ok' | 'warn' | 'bad' | 'info';
export type Msg = [MsgLevel, string];

export interface ShipModel { n: string; L: number; max: number; Kp: number; Tp: number; wind: number; acc: number; dec: number }

export interface OwnShip {
  x: number; y: number; hdg: number; cmdHdg: number; stw: number; rot: number; rud: number;
  tele: number; ap: boolean; manRud: number; rudLim: number; ship: ShipModel; type: 'power'; L: number; vx: number; vy: number;
}

/** Écho radar tel que peint au dernier passage du faisceau (position relative au porteur). */
export interface Echo { dx: number; dy: number; b: number; r: number; t: number }

export interface TargetAI { state: 'transit' | 'avoid'; role: Role | null; cool: number; want?: number; actT?: number; info?: string; done?: string }

export interface Target {
  id: number; type: TargetType; name: string; L: number;
  x: number; y: number; hdg: number; stw: number; cmdHdg: number; cmdStw: number; baseHdg: number; baseStw: number; rot: number;
  maxRot: number; tau: number; acc: number; dec: number; wind: number; rcs: number;
  beh: Behaviour; ai: TargetAI; echo: Echo | null; nextFish: number; vx: number; vy: number;
}

export interface TrialResult { cpa: number; tcpa: number; px: number; py: number; rvx: number; rvy: number }

export interface Track {
  n: number; tid: number; t0: number; obs: { t: number; x: number; y: number }[]; last: number;
  state: 'ACQ' | 'TRK' | 'LOST'; est: { x: number; y: number; vx: number; vy: number; vok: boolean } | null;
  lostT?: number; range: number; brg: number; cpa: number; tcpa: number; brate: number;
  bcr: number | null; bct: number | null; danger: boolean; crs: number; spd: number; trial?: TrialResult;
}

export interface ActionRec { t: number; tcpa: number; r: number; tb: number; tgtActed: boolean; dir?: number }

/** Suivi d'une situation de rapprochement entre le porteur et une cible (vérité terrain). */
export interface Encounter {
  tid: number; role: Role; t0: number; h0: number; v0: number; th0: number; tv0: number; tb0: number; weOvertake: boolean;
  minR: number; fc: (ActionRec & { dir: number }) | null; fs: ActionRec | null; maxDev: number; maxRed: number;
  crossedAhead: boolean; side: number | null; tgtActT: number | null; closed: boolean; tracked: boolean;
  res?: { pen: number; m: Msg[] };
}

export interface ReportItem { label: string; name: string; L: number; role: string; msgs: Msg[]; other: string }
export interface Report { score: number; grade: string; scen: string; duration: number; global: Msg[]; items: ReportItem[]; collided: boolean }

export interface RadarSettings {
  range: number; orient: 'HU' | 'NU' | 'CU'; cuRef: number; vec: 'REL' | 'TRUE'; vecMin: number; stab: 'GND' | 'SEA';
  trail: 'OFF' | 'REL' | 'TRUE'; trailMin: number; ac: number; ebl: { b: number; r: number } | null;
  cpaLim: number; tcpaLim: number; autoAcq: boolean; trial: boolean; trialHdg: number; trialSpd: number; trialDelay: number;
}

export interface Env { windFrom: number; windKn: number; curSet: number; curKn: number; vis: Visibility; night: boolean; comp: Compliance }

export interface ClutterPt { b: number; r: number; s: number; t: number }
export interface HistPt { t: number; ox: number; oy: number; p: Record<number, [number, number]> }
export interface LogEntry { t: number; txt: string; cls: string }

export interface State {
  t: number; ts: number; paused: boolean; started: boolean; over: boolean;
  own: OwnShip; targets: Target[]; tracks: Track[]; clutter: ClutterPt[]; hist: HistPt[];
  enc: Record<number, Encounter>; log: LogEntry[]; sweep: number; sel: number | null; trackSeq: number; nextTid: number;
  aiAcc: number; encAcc: number; histAcc: number; spdPoor: [number, number]; shipKey: string; scen: string;
  collided: number | null; report: Report | null; env: Env; radar: RadarSettings;
}

function defaultOwn(): OwnShip {
  const ship = SHIPS.ferry;
  return { x: 0, y: 0, hdg: 0, cmdHdg: 0, stw: 0, rot: 0, rud: 0, tele: 2, ap: true, manRud: 0, rudLim: 20, ship, type: 'power', L: ship.L, vx: 0, vy: 0 };
}

export const S: State = {
  t: 0, ts: 1, paused: true, started: false, over: false,
  own: defaultOwn(), targets: [], tracks: [], clutter: [], hist: [], enc: {}, log: [], sweep: 0, sel: null, trackSeq: 1, nextTid: 1,
  aiAcc: 0, encAcc: 0, histAcc: 0, spdPoor: [0, 0], shipKey: 'ferry', scen: 'r15', collided: null, report: null,
  env: { windFrom: 240, windKn: 18, curSet: 90, curKn: 1.2, vis: 'good', night: true, comp: 'real' },
  radar: {
    range: 6, orient: 'HU', cuRef: 0, vec: 'REL', vecMin: 6, stab: 'GND', trail: 'REL', trailMin: 6, ac: 0.35, ebl: null,
    cpaLim: 1, tcpaLim: 12, autoAcq: false, trial: false, trialHdg: 0, trialSpd: 0, trialDelay: 0,
  },
};

/** Journal de passerelle (le plus récent en tête). */
export function logE(txt: string, cls = ''): void {
  S.log.unshift({ t: S.t, txt, cls });
  if (S.log.length > 200) S.log.pop();
}
