/** Types et état global de la simulation. Aucun accès au DOM ici. */
import { DEFAULT_SHIP, SHIPS } from './data';
import type { MMGParams } from '../sim/mmg';

export type TargetType = 'power' | 'small' | 'fish' | 'sail' | 'nuc' | 'ram';
export type Role = 'giveway' | 'standon' | 'headon' | 'overtaking' | 'overtaken' | 'giveway18' | 'standon18' | 'R19';
export type Behaviour = 'good' | 'late' | 'passive' | 'wrong';
export type Visibility = 'good' | 'poor';
export type Compliance = 'disc' | 'real' | 'hostile';
export type MsgLevel = 'ok' | 'warn' | 'bad' | 'info';
export type Msg = [MsgLevel, string];

/** Navire porteur : modèle MMG 3 DDL (src/sim/mmg.ts). max = vitesse de service (kn). */
export interface ShipModel {
  n: string; L: number; max: number;
  mmg: MMGParams;
  /** Source des données, affichée dans l'interface. */
  src: string;
}

export interface OwnShip {
  x: number; y: number; hdg: number; cmdHdg: number; stw: number; rot: number; rud: number;
  tele: number; ap: boolean; manRud: number; rudLim: number; ship: ShipModel; type: 'power'; L: number; vx: number; vy: number;
  /** Modèle MMG : vitesses surface dans le repère navire (m/s, rad/s), régime hélice (tr/s), fin de l'attente de renversement (s). */
  u: number; v: number; r: number; n: number; revUntil: number;
}

/** Écho radar tel que peint au dernier passage du faisceau : position géographique (NM), relèvement et distance depuis le porteur. */
export interface Echo { x: number; y: number; b: number; r: number; t: number }

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
  /** Acquisition automatique (zone) : symbole d'acquisition rouge jusqu'à l'acquittement. */
  auto: boolean;
  /** Positions passées estimées (échantillonnées toutes les 15 s). */
  past: { t: number; x: number; y: number }[];
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
  range: number; orient: 'HU' | 'NU' | 'CU'; cuRef: number;
  /** Mouvement relatif ou vrai (MSC.192(79) 5.20). */
  motion: 'RM' | 'TM';
  /** Centre d'affichage en mouvement vrai (position géographique, NM). */
  tmC: { x: number; y: number };
  /** Décentrage en mouvement relatif : vecteur porteur → centre (NM). */
  offMode: 'OFF' | 'FWD' | 'CUR'; off: { x: number; y: number };
  vec: 'REL' | 'TRUE'; vecMin: number; stab: 'GND' | 'SEA';
  trail: 'OFF' | 'REL' | 'TRUE'; trailMin: number;
  /** Positions passées des cibles suivies : intervalle (min), 0 = masquées. */
  pastMin: number;
  /** Réglages vidéo (0-100), anti-clutter mer automatique, bande. */
  gain: number; sea: number; seaAuto: boolean; rain: number; band: 'X' | 'S';
  /** Deux EBL et deux VRM (MSC.192(79) 5.12, 5.15), relèvements vrais. */
  ebl: [number | null, number | null]; vrm: [number | null, number | null]; eblRef: 'T' | 'R';
  /** Quatre lignes parallèles indexées : relèvement de la ligne (°) et distance latérale signée (NM). */
  pi: ({ b: number; d: number } | null)[];
  /** Outil affecté au clic sur le scope. */
  tool: 'EV1' | 'EV2' | 'PI' | 'NONE';
  cpaLim: number; tcpaLim: number;
  /** Zone d'acquisition automatique : rayon (NM), 0 = désactivée. */
  zone: number;
  trial: boolean; trialHdg: number; trialSpd: number; trialDelay: number; trialT0: number;
  palette: 'DAY' | 'DUSK' | 'NIGHT';
}

export type AlertCat = 'alarm' | 'warning' | 'caution';
/** Alerte de passerelle (logique inspirée de la gestion des alertes de passerelle, MSC.302(87)). */
export interface Alert { id: string; cat: AlertCat; text: string; t0: number; active: boolean; acked: boolean; event: boolean }

export interface Env { windFrom: number; windKn: number; curSet: number; curKn: number; vis: Visibility; night: boolean; comp: Compliance; rain: boolean }
export interface RainCell { x: number; y: number; r: number }

export interface ClutterPt { b: number; r: number; s: number; t: number }
export interface HistPt { t: number; ox: number; oy: number; p: Record<number, [number, number]> }
export interface LogEntry { t: number; txt: string; cls: string }

export interface State {
  t: number; ts: number; paused: boolean; started: boolean; over: boolean;
  own: OwnShip; targets: Target[]; tracks: Track[]; clutter: ClutterPt[]; hist: HistPt[];
  enc: Record<number, Encounter>; log: LogEntry[]; sweep: number; sel: number | null; trackSeq: number; nextTid: number;
  aiAcc: number; encAcc: number; histAcc: number; spdPoor: [number, number]; shipKey: string; scen: string;
  collided: number | null; report: Report | null; env: Env; radar: RadarSettings;
  alerts: Alert[]; rainCells: RainCell[]; silencedUntil: number;
}

function defaultOwn(): OwnShip {
  const ship = SHIPS[DEFAULT_SHIP];
  return { x: 0, y: 0, hdg: 0, cmdHdg: 0, stw: 0, rot: 0, rud: 0, tele: 2, ap: true, manRud: 0, rudLim: 20, ship, type: 'power', L: ship.L, vx: 0, vy: 0, u: 0, v: 0, r: 0, n: 0, revUntil: 0 };
}

export const S: State = {
  t: 0, ts: 1, paused: true, started: false, over: false,
  own: defaultOwn(), targets: [], tracks: [], clutter: [], hist: [], enc: {}, log: [], sweep: 0, sel: null, trackSeq: 1, nextTid: 1,
  aiAcc: 0, encAcc: 0, histAcc: 0, spdPoor: [0, 0], shipKey: DEFAULT_SHIP, scen: 'r15', collided: null, report: null,
  env: { windFrom: 240, windKn: 18, curSet: 90, curKn: 1.2, vis: 'good', night: true, comp: 'real', rain: false },
  radar: {
    range: 6, orient: 'NU', cuRef: 0, motion: 'RM', tmC: { x: 0, y: 0 }, offMode: 'OFF', off: { x: 0, y: 0 },
    vec: 'TRUE', vecMin: 6, stab: 'SEA', trail: 'REL', trailMin: 6, pastMin: 1,
    gain: 60, sea: 35, seaAuto: true, rain: 0, band: 'X',
    ebl: [null, null], vrm: [null, null], eblRef: 'T', pi: [null, null, null, null], tool: 'EV1',
    cpaLim: 1, tcpaLim: 12, zone: 0, trial: false, trialHdg: 0, trialSpd: 0, trialDelay: 0, trialT0: 0, palette: 'DUSK',
  },
  alerts: [], rainCells: [], silencedUntil: 0,
};

/** Journal de passerelle (le plus récent en tête). */
export function logE(txt: string, cls = ''): void {
  S.log.unshift({ t: S.t, txt, cls });
  if (S.log.length > 200) S.log.pop();
}
