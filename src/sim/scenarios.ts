/**
 * Génération des scénarios.
 * Chaque situation est construite à rebours : on choisit le type de rencontre, le TCPA (min) et le CPA visé,
 * puis on place la cible pour que le mouvement relatif passe au CPA voulu. Le rôle obtenu est vérifié par roleOf.
 * Une rencontre peut être prévue après un point tournant de la route (référence « porteur virtuel » au point).
 * Exercices du Pas-de-Calais : position de départ et points tournants géographiques (WGS 84), trafic qui suit
 * les voies du DST (laneShip, laneMeet, laneAhead, laneFill).
 */
import { S, logE, newTssWatch, type Behaviour, type Env, type Route, type Target, type TargetType, type Visibility } from '../core/state';
import { DEFAULT_SHIP, SHIPS, SHIP_NAMES, TELE, TELE_SEA, TT } from '../core/data';
import { K2N, adiff, brgOf, clamp, n360, p3, pick, pm, rnd, vec } from '../core/util';
import { gv, initOwnDynamics } from './physics';
import { pickBeh, roleOf } from './rules';
import { makeRoute } from './route';
import { depthAt, laneOf, loadChart, pointAt, polyLength, projOnPolyline, tssAt, type ChartKey } from './chart';
import { makeAis } from './ais';
import { toXY } from '../core/geo';

export type Kind = 'headon' | 'gw' | 'so' | 'overtake' | 'overtaken' | 'fish' | 'nuc' | 'sail' | 'any';

export interface Scenario {
  n: string; d: string;
  /** 1 = fondamentaux, 2 = situations combinées, 3 = avancé, 4 = Pas-de-Calais (DST) */
  lvl: 1 | 2 | 3 | 4;
  /** Carte : large (défaut, cap initial aléatoire) ou Pas-de-Calais (départ et route géographiques imposés). */
  chart?: ChartKey;
  /** Départ [latitude, longitude] et points tournants géographiques (degrés décimaux, WGS 84). */
  start?: [number, number];
  wpts?: [number, number][];
  vis: Visibility | null;
  /** Réglages d'environnement imposés à la sélection (modifiables ensuite). */
  env?: Partial<Env>;
  /** Route : [abattée (°), longueur (NM)] par segment ; défaut : une seule route droite de 60 NM. */
  legs?: [number, number][];
  build: () => void;
}

/** Référence de placement : porteur réel maintenant, ou porteur virtuel à un point tournant à l'instant t0 (s). */
interface Ref { x: number; y: number; hdg: number; stw: number; vx: number; vy: number; t0: number }

export const LEVELS: Record<number, string> = { 1: 'Fondamentaux', 2: 'Situations combinées', 3: 'Avancé', 4: 'Pas-de-Calais (DST, règle 10)' };

const dm = (d: number, m: number): number => d + m / 60;

export const SCEN: Record<string, Scenario> = {
  // ----- Fondamentaux
  r14: { n: 'Face à face (R14)', d: 'Un navire à contre-bord, quasiment route opposée.', lvl: 1, vis: 'good',
    build() { add('headon', rnd(14, 18), pm(0, 0.15)); add('any', rnd(16, 26), pm(2, 3.5)); } },
  r15: { n: 'Croisement : non privilégié (R15/16)', d: 'Un navire vous croise en venant de tribord.', lvl: 1, vis: 'good',
    build() { add('gw', rnd(15, 20), pm(0, 0.2)); add('any', rnd(16, 26), pm(2, 3.5)); } },
  r17: { n: 'Croisement : privilégié (R17)', d: 'Un navire arrive de bâbord. Réagira-t-il à temps ?', lvl: 1, vis: 'good',
    build() { const t = add('so', rnd(16, 20), pm(0, 0.15)); if (t && Math.random() < 0.55) t.beh = 'passive'; add('any', rnd(16, 26), pm(2, 3.5)); } },
  r13: { n: 'Rattrapement (R13)', d: "Vous rattrapez un navire plus lent… pendant qu'un autre croise.", lvl: 1, vis: 'good',
    build() { add('overtake', rnd(28, 36), pm(0, 0.12)); add('gw', rnd(24, 32), pm(0, 0.3)); } },
  r18: { n: 'Pêche, voile, NUC (R18)', d: 'Chalutier, voilier et navire à propulsion mécanique.', lvl: 1, vis: 'good',
    build() { add('fish', rnd(12, 16), pm(0, 0.2)); add('sail', rnd(20, 26), pm(0, 0.2)); add(pick(['so', 'nuc'] as const), rnd(24, 30), pm(0, 0.3)); } },
  r19: { n: 'Visibilité réduite (R19)', d: 'Brume : radar seul. Trois échos, dont un rattrapant.', lvl: 1, vis: 'poor',
    build() { add('gw', rnd(16, 20), pm(0, 0.2)); add('so', rnd(24, 30), pm(0, 0.25)); add('overtaken', rnd(30, 38), pm(0, 0.2)); } },

  // ----- Situations combinées
  c_wp: { n: 'Changement de route au point tournant', d: 'Abattée de 60° sur tribord au WP1 : un croiseur vous attend sur la nouvelle route.', lvl: 2, vis: 'good',
    legs: [[0, 4], [60, 50]],
    build() { addAfterWp(1, 'gw', 12, pm(0, 0.2)); add('any', rnd(10, 20), pm(2, 3.5)); add('any', rnd(25, 35), pm(2, 4)); } },
  c_double: { n: 'Double croisement', d: "Un navire sur tribord, un autre sur bâbord, presque en même temps : à qui s'adresse quoi ?", lvl: 2, vis: 'good',
    build() { add('gw', rnd(16, 18), pm(0, 0.2)); add('so', rnd(17, 19), pm(0, 0.2)); add('any', rnd(20, 30), pm(2.5, 4)); } },
  c_headover: { n: 'Face à face et rattrapant', d: "Un navire de face, un autre vous rattrape : attention à l'abattée sur tribord.", lvl: 2, vis: 'good',
    build() { add('headon', rnd(15, 17), pm(0, 0.15)); add('overtaken', rnd(18, 22), pm(0.3, 0.6)); } },
  c_passif: { n: 'Le non privilégié ne manœuvre pas', d: "Croiseur venant de bâbord qui ne réagira qu'au dernier moment : R17a(ii) puis R17b.", lvl: 2, vis: 'good',
    build() { const t = add('so', rnd(16, 19), pm(0, 0.1)); if (t) t.beh = 'passive'; add('any', rnd(18, 28), pm(2.5, 4)); } },
  c_contre: { n: 'Manœuvre à contresens', d: 'Face à face avec un navire qui vient sur bâbord. Saurez-vous le détecter à temps ?', lvl: 2, vis: 'good',
    build() { const t = add('headon', rnd(16, 18), pm(0, 0.1)); if (t) t.beh = 'wrong'; add('any', rnd(18, 28), pm(2.5, 4)); } },
  c_avarie: { n: 'Avarie en croisement (R18)', lvl: 2, vis: 'good',
    d: 'Un navire croise de bâbord : vous êtes privilégié. Il tombe en avarie de machine et devient non maître de sa manœuvre : la situation s’inverse.',
    build() {
      // l'avarie survient à TCPA ≈ 5,5 à 7 min : le navire perd son erre près de votre route
      const T = rnd(16, 19), t = add('so', T, pm(0, 0.2));
      if (t) { t.beh = 'late'; t.fault = { kind: 'engine', active: false, at: S.t + (T - rnd(5.5, 7)) * 60 }; }
      add('overtaken', rnd(26, 30), pm(0.4, 0.6));
    } },
  mix: { n: 'Trafic mixte', d: 'Six navires dont trois en route de collision, échelonnés.', lvl: 2, vis: null,
    build() {
      const k = shuffle<Kind>(['headon', 'gw', 'so', 'fish', 'overtake', 'sail']);
      add(k[0], rnd(12, 15), pm(0, 0.2)); add(k[1], rnd(22, 26), pm(0, 0.25)); add(k[2], rnd(32, 36), pm(0, 0.25));
      for (let i = 0; i < 3; i++) add('any', rnd(14, 35), pm(1.8, 4));
    } },

  // ----- Avancé
  a_voilier: { n: 'Petit voilier de nuit par mer formée', d: 'Écho faible noyé dans le clutter (vent 28 kn) : réglez gain et anti-clutter.', lvl: 3, vis: 'good',
    env: { windKn: 28, night: true },
    build() { add('sail', rnd(13, 16), pm(0, 0.15)); add('gw', rnd(24, 28), pm(0, 0.25)); } },
  a_peche: { n: 'Flottille de chalutiers', d: 'Quatre chalutiers qui changent de route en pêchant, et un caboteur qui croise.', lvl: 3, vis: 'good',
    build() { for (const T of [12, 15, 19, 24]) add('fish', T + rnd(0, 2), pm(0.2, 1.2)); add('so', rnd(20, 26), pm(0, 0.3)); } },
  a_nuc: { n: 'NUC en dérive et croiseur', d: 'Un navire non maître de sa manœuvre dérive sur votre route pendant qu’un autre croise.', lvl: 3, vis: 'good',
    env: { windKn: 22 },
    build() { add('nuc', rnd(14, 17), pm(0, 0.2)); add('gw', rnd(17, 21), pm(0, 0.25)); } },
  a_grains: { n: 'Grains et bande X', d: 'Des grains masquent une partie des échos. Comparez bandes X et S, réglez l’anti-clutter pluie.', lvl: 3, vis: 'good',
    env: { rain: true, windKn: 20 },
    build() { add('gw', rnd(15, 18), pm(0, 0.2)); add('headon', rnd(22, 26), pm(0, 0.2)); add('any', rnd(15, 30), pm(2, 4)); } },
  dense: { n: 'Trafic dense', d: 'Onze navires, cinq situations à risque. Rythme soutenu.', lvl: 3, vis: null,
    build() {
      const k = shuffle<Kind>(['headon', 'gw', 'so', 'fish', 'overtake', 'gw', 'sail']);
      [10, 16, 22, 30, 40].forEach((T, i) => add(k[i], T + rnd(0, 3), pm(0, 0.3)));
      for (let i = 0; i < 6; i++) add('any', rnd(10, 40), pm(1.5, 4));
    } },
  a_brume_dense: { n: 'Trafic dense en brume', d: 'Le trafic dense, au radar seul : R19 sur cinq situations.', lvl: 3, vis: 'poor',
    build() {
      const k = shuffle<Kind>(['headon', 'gw', 'so', 'overtake', 'gw', 'overtaken']);
      [11, 17, 23, 30, 38].forEach((T, i) => add(k[i], T + rnd(0, 3), pm(0, 0.3)));
      for (let i = 0; i < 5; i++) add('any', rnd(10, 40), pm(1.5, 4));
    } },
  a_wp_brume: { n: 'Changement de route en brume', d: 'Abattée de 45° sur bâbord au WP1, brume, trafic de part et d’autre.', lvl: 3, vis: 'poor',
    legs: [[0, 4], [-45, 50]],
    build() { add('so', rnd(12, 15), pm(0, 0.2)); addAfterWp(1, 'gw', 14, pm(0, 0.2)); addAfterWp(1, 'headon', 22, pm(0, 0.2)); } },

  // ----- Pas-de-Calais (carte réelle, DST du détroit de Douvres)
  pdc_cross: { n: 'Traversée du DST (R10c)', lvl: 4, vis: 'good', chart: 'pdc',
    d: 'Traverser les deux voies à angle droit près de la bouée MPC, dans un trafic dense montant puis descendant. Courant de flot portant au NE.',
    start: [dm(51, 2.5), dm(1, 46.7)], wpts: [[dm(51, 10.0), dm(1, 34.8)], [dm(51, 18.7), dm(1, 42.7)]],
    env: { windFrom: 240, windKn: 15, curSet: 45, curKn: 1.2, night: false },
    build() {
      laneMeet('NE', rnd(10, 12), pm(0.15, 0.4), rnd(13, 17));
      laneMeet('NE', rnd(17, 19), pm(0.3, 0.6), rnd(11, 15));
      laneMeet('SW', rnd(28, 30), pm(0.15, 0.4), rnd(13, 18));
      laneMeet('SW', rnd(33, 35), pm(0.3, 0.7), rnd(11, 16));
      laneFill('NE', 5); laneFill('SW', 5);
    } },
  pdc_varne: { n: 'Rattrapement en brume, voie NE', lvl: 4, vis: 'poor', chart: 'pdc',
    d: 'Brume entre le Colbart et le Varne : un navire lent devant vous dans la voie montante, un rapide qui vous rattrape, un transbordeur qui coupe le DST.',
    start: [dm(50, 48.0), dm(1, 24.9)], wpts: [[dm(50, 53.8), dm(1, 27.4)], [dm(51, 0.3), dm(1, 34.0)], [dm(51, 6.0), dm(1, 43.0)], [dm(51, 8.7), dm(1, 50.5)]],
    env: { windFrom: 200, windKn: 10, curSet: 30, curKn: 1.5, rain: false },
    build() {
      laneAhead('NE', 3.6, pm(0, 0.12), 7);
      laneAhead('NE', -2.8, rnd(0.4, 0.6), 19);
      laneAhead('NE', 9.5, pm(0.5, 0.9), 11);
      const f = add('gw', rnd(17, 21), pm(0, 0.3));
      if (f) { f.name = 'Transbordeur'; f.L = 190; }
      laneFill('SW', 4);
    } },
  pdc_rogue: { n: 'Navire à contresens (voie SW)', lvl: 4, vis: 'good', chart: 'pdc',
    d: 'De nuit dans la voie descendante, au large de Douvres : un navire remonte la voie à contresens. Le détecter tôt (radar, AIS) et l’éviter.',
    start: [dm(51, 13.0), dm(1, 43.2)], wpts: [[dm(51, 4.6), dm(1, 31.5)], [dm(50, 58.3), dm(1, 22.0)], [dm(50, 52.6), dm(1, 13.5)]],
    env: { windFrom: 30, windKn: 14, curSet: 225, curKn: 1.0, night: true },
    build() {
      const r = laneAhead('SW', 10.5, pm(0.05, 0.2), 12, { dir: -1, beh: Math.random() < 0.5 ? 'late' : 'passive' });
      if (r) r.name = 'Cargo (à contresens)';
      laneAhead('SW', 3.2, pm(0.6, 1.0), 10.5);
      laneAhead('SW', 6.8, pm(0.6, 1.1), 12);
      laneAhead('SW', -3, rnd(0.35, 0.5), 18.5);
      laneFill('NE', 5);
    } },
};

// ---------------------------------------------------------------- trafic des voies du DST

interface LaneOpt { type?: TargetType; dir?: 1 | -1; beh?: Behaviour }

/** Navire qui suit une voie : abscisse s (NM) sur l'axe, décalage latéral off (NM, + = tribord du sens réglementaire). */
export function laneShip(id: 'NE' | 'SW', s: number, off: number, spd: number, o: LaneOpt = {}): Target | null {
  const l = laneOf(id);
  if (!l) return null;
  const p = pointAt(l.axis, clamp(s, 0, polyLength(l.axis))), n = vec(p.brg + 90, off), dir = o.dir ?? 1;
  const t = mkT(o.type ?? 'power', n360(dir > 0 ? p.brg : p.brg + 180), spd, p.x + n.x, p.y + n.y);
  t.lane = id; t.laneDir = dir; t.laneOff = off;
  if (o.beh) t.beh = o.beh;
  return t;
}

/** Navire de voie placé à `ds` NM devant (ou derrière si < 0) le porteur le long de l'axe, décalé de `dOff` NM vers tribord. */
export function laneAhead(id: 'NE' | 'SW', ds: number, dOff: number, spd: number, o: LaneOpt = {}): Target | null {
  const l = laneOf(id);
  if (!l) return null;
  const me = S.own, p = projOnPolyline(l.axis, me.x, me.y), sgn = Math.abs(adiff(me.hdg, p.brg)) < 90 ? 1 : -1;
  return laneShip(id, p.s + sgn * ds, p.d + dOff, spd, o);
}

/**
 * Navire de voie qui passera, dans `Tmin` minutes, au point où le porteur coupe l'axe de la voie,
 * décalé de `miss` NM le long de la voie (> 0 : il passe devant le point de rencontre).
 */
export function laneMeet(id: 'NE' | 'SW', Tmin: number, miss: number, spd: number, o: LaneOpt = {}): Target | null {
  const l = laneOf(id);
  if (!l) return null;
  const me = S.own, T = Tmin * 60, dir = o.dir ?? 1;
  const P = { x: me.x + me.vx * K2N * T, y: me.y + me.vy * K2N * T }, pr = projOnPolyline(l.axis, P.x, P.y);
  const g = gv(dir > 0 ? pr.brg : pr.brg + 180, spd, 0.035), u = vec(pr.brg, 1), vAlong = g.x * u.x + g.y * u.y;
  return laneShip(id, pr.s + miss - vAlong * K2N * T, pr.d + pm(0, 0.15), spd, o);
}

/** Trafic de fond dans une voie : n navires répartis le long de l'axe, à distance du porteur et entre eux. */
export function laneFill(id: 'NE' | 'SW', n: number): void {
  const l = laneOf(id);
  if (!l) return;
  const L = polyLength(l.axis), me = S.own;
  for (let k = 0, placed = 0; k < 60 && placed < n; k++) {
    const s = rnd(0.5, L - 0.5), off = pm(0, 1.3), p = pointAt(l.axis, s), q = vec(p.brg + 90, off), x = p.x + q.x, y = p.y + q.y;
    if (Math.hypot(x - me.x, y - me.y) < 2.5 || S.targets.some((t) => Math.hypot(t.x - x, t.y - y) < 1)) continue;
    if (depthAt(x, y) < 30 || tssAt(x, y).kind !== (id === 'NE' ? 'laneNE' : 'laneSW')) continue;
    laneShip(id, s, off, rnd(10, 19), { type: Math.random() < 0.2 ? 'small' : 'power' });
    placed++;
  }
}

function shuffle<T>(a: T[]): T[] { return a.sort(() => Math.random() - 0.5); }

const wOf = (type: TargetType): number => (type === 'sail' ? 0.01 : type === 'nuc' ? 0.06 : 0.035);

/** Applique les réglages imposés par un scénario (visibilité, vent, grains…). */
export function applyScenarioEnv(key: string): void {
  const sc = SCEN[key];
  if (sc.vis) S.env.vis = sc.vis;
  S.env.rain = false;
  if (sc.env) Object.assign(S.env, sc.env);
}

/** Nom fictif sans doublon dans l'exercice. */
function shipName(type: TargetType): string {
  const list = SHIP_NAMES[type === 'fish' ? 'fish' : type === 'sail' ? 'sail' : 'merchant'];
  const free = list.filter((n) => !S.targets.some((t) => t.vname === n));
  return free.length ? pick(free) : `${pick(list)} ${S.nextTid}`;
}

export function mkT(type: TargetType, hdg: number, stw: number, x: number, y: number): Target {
  const T = TT[type], L = Math.round(rnd(T.L[0], T.L[1]));
  const t: Target = {
    id: S.nextTid++, type, name: pick(T.n), L, x, y, hdg, stw, cmdHdg: hdg, cmdStw: stw, baseHdg: hdg, baseStw: stw, rot: 0,
    maxRot: L > 250 ? 0.45 : L > 150 ? 0.7 : L > 60 ? 1.1 : 2.5, tau: L > 150 ? 25 : L > 60 ? 14 : 6,
    acc: L > 150 ? 220 : 90, dec: L > 150 ? 380 : 130, wind: wOf(type), rcs: clamp(L / 70, 0.3, 5), beh: pickBeh(),
    ai: { state: 'transit', role: null, cool: 0 }, echo: null, nextFish: S.t + rnd(600, 1200), vx: 0, vy: 0,
    ais: null, vname: shipName(type),
  };
  t.ais = makeAis(type, t.vname);
  const g = gv(hdg, stw, t.wind);
  t.vx = g.x; t.vy = g.y;
  S.targets.push(t);
  return t;
}

function ownRef(): Ref {
  const o = S.own;
  return { x: o.x, y: o.y, hdg: o.hdg, stw: o.stw, vx: o.vx, vy: o.vy, t0: 0 };
}

/** Place une rencontre `Tmin` minutes après le passage au point tournant `wp` de la route. */
export function addAfterWp(wp: number, kind: Kind, Tmin: number, off: number): Target | null {
  const r = S.route, o = S.own;
  if (!r || wp >= r.wps.length - 1) return add(kind, Tmin, off);
  const p = r.wps[wp], q = r.wps[wp + 1], hdg = brgOf(q.x - p.x, q.y - p.y);
  const sog = Math.max(Math.hypot(o.vx, o.vy), 1), t0 = (Math.hypot(p.x - o.x, p.y - o.y) / sog) * 3600;
  const w = vec(hdg, o.stw), c = vec(S.env.curSet, S.env.curKn);
  return add(kind, t0 / 60 + Tmin, off, { x: p.x, y: p.y, hdg, stw: o.stw, vx: w.x + c.x, vy: w.y + c.y, t0 });
}

/** Place une cible du type demandé pour un rapprochement au CPA `off` (NM) dans `Tmin` minutes. */
export function add(kind: Kind, Tmin: number, off: number, ref: Ref = ownRef()): Target | null {
  const o = ref, H = o.hdg, os = o.stw, me = S.own;
  const want = ({ headon: 'headon', gw: 'giveway', so: 'standon', overtake: 'overtaking', overtaken: 'overtaken' } as Record<string, string>)[kind];
  const rMax = ref.t0 > 0 ? 14 : 11.5;
  for (let k = 0; k < 160; k++) {
    if (k === 80) Tmin *= 1.3;
    let type: TargetType = 'power', hdg: number, spd: number;
    switch (kind) {
      case 'headon': hdg = H + 180 + rnd(-4, 4); spd = rnd(10, 18); break;
      case 'gw': hdg = H - rnd(55, 125); spd = rnd(11, 19); break;
      case 'so': hdg = H + rnd(55, 125); spd = rnd(11, 19); break;
      case 'overtake': hdg = H + rnd(-10, 10); spd = os * rnd(0.4, 0.6); break;
      case 'overtaken': hdg = H + rnd(-12, 12); spd = Math.min(os + rnd(5, 9), 28); break;
      case 'fish': type = 'fish'; hdg = rnd(0, 360); spd = rnd(2.5, 4); break;
      case 'nuc': type = 'nuc'; hdg = rnd(0, 360); spd = 0; break;
      case 'sail': type = 'sail'; hdg = H + pm(40, 140); spd = rnd(4, 7); break;
      default: type = Math.random() < 0.25 ? 'small' : 'power'; hdg = rnd(0, 360); spd = rnd(8, 20);
    }
    hdg = n360(hdg);
    const tv = gv(hdg, spd, wOf(type)), T = Tmin * 60, dT = T - o.t0;
    if (dT < 120) continue;
    const mx = o.x + o.vx * K2N * dT, my = o.y + o.vy * K2N * dT;
    const rvx = tv.x - o.vx, rvy = tv.y - o.vy, rl = Math.hypot(rvx, rvy);
    if (rl < 1) continue;
    const nx = -rvy / rl, ny = rvx / rl;
    const x = mx - tv.x * K2N * T + nx * off, y = my - tv.y * K2N * T + ny * off;
    const r = Math.hypot(x - me.x, y - me.y);
    if (r < 2.5 || r > rMax) continue;
    if (depthAt(x, y) < 15) continue; // jamais à terre ni sur un banc
    // géométrie vue depuis la référence (au point tournant pour une rencontre après abattée)
    const px = x + tv.x * K2N * o.t0, py = y + tv.y * K2N * o.t0;
    const tb = n360(brgOf(px - o.x, py - o.y) - H);
    if (want && roleOf({ x: o.x, y: o.y, hdg: H, stw: os, type: 'power' }, { x: px, y: py, hdg, stw: spd, type }, 'good') !== want) continue;
    if ((kind === 'fish' || kind === 'nuc' || kind === 'sail') && tb > 100 && tb < 260) continue;
    return mkT(type, hdg, spd, x, y);
  }
  return null;
}

export function newScenario(): void {
  const sh = SHIPS[S.shipKey] ?? SHIPS[DEFAULT_SHIP], sc = SCEN[S.scen];
  const chart = loadChart(sc.chart ?? 'open');
  const lim = S.route?.xteLim ?? 1, show = S.route?.show ?? true;
  let H: number, x0 = 0, y0 = 0, route: Route;
  if (sc.start && sc.wpts) {
    // départ et route géographiques
    const p0 = toXY(sc.start[0], sc.start[1]), w = sc.wpts.map(([la, lo]) => toXY(la, lo));
    const h = brgOf(w[0].x - p0.x, w[0].y - p0.y), back = vec(h, 2);
    H = Math.round(h); x0 = p0.x; y0 = p0.y;
    route = { wps: [{ x: x0 - back.x, y: y0 - back.y }, ...w], leg: 0, xteLim: lim, show, maxXte: 0, tOver: 0 };
  } else {
    H = Math.round(rnd(0, 359));
    route = { ...makeRoute(0, 0, H, sc.legs ?? [[0, 60]], lim), show };
  }
  S.own = { x: x0, y: y0, hdg: H, cmdHdg: H, stw: sh.max, rot: 0, rud: 0, tele: TELE_SEA, ap: true, manRud: 0, rudLim: 20, ship: sh, type: 'power', L: sh.L, vx: 0, vy: 0, u: 0, v: 0, r: 0, n: 0, revUntil: 0 };
  initOwnDynamics(S.own, sh.max);
  const w = vec(H, sh.max), c = vec(S.env.curSet, S.env.curKn);
  S.own.vx = w.x + c.x; S.own.vy = w.y + c.y;
  Object.assign(S, {
    t: 0, targets: [], tracks: [], clutter: [], hist: [], enc: {}, log: [], sweep: 0, sel: null, trackSeq: 1,
    aiAcc: 0, encAcc: 0, histAcc: 0, spdPoor: [0, 0], over: false, collided: null, report: null, started: false, paused: true,
    alerts: [], rainCells: [], silencedUntil: 0, route,
    chart: chart.key, coast: null, markEcho: {}, ownTrack: [], tss: newTssWatch(), grounded: false, navAlerts: [],
  });
  Object.assign(S.ecdis, { ebl: null, vrm: null, routeIssues: [] });
  Object.assign(S.radar, {
    cuRef: H, trialHdg: H, trialSpd: Math.round(sh.max), trial: false, trialT0: 0, tmC: { x: x0, y: y0 }, off: { x: 0, y: 0 }, offMode: 'OFF',
    ebl: [null, null], vrm: [null, null], pi: [null, null, null, null],
  });
  sc.build();
  logE(`Exercice : ${sc.n} — ${sh.n}, route ${p3(H)}°, ${TELE[TELE_SEA].n}`);
}
