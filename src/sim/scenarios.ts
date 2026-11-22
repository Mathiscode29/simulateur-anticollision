/**
 * Génération des scénarios.
 * Chaque situation est construite à rebours : on choisit le type de rencontre, le TCPA (min) et le CPA visé,
 * puis on place la cible pour que le mouvement relatif passe au CPA voulu. Le rôle obtenu est vérifié par roleOf.
 * Une rencontre peut être prévue après un point tournant de la route (référence « porteur virtuel » au point).
 */
import { S, logE, type Env, type Target, type TargetType, type Visibility } from '../core/state';
import { DEFAULT_SHIP, SHIPS, TELE, TELE_SEA, TT } from '../core/data';
import { K2N, brgOf, clamp, n360, p3, pick, pm, rnd, vec } from '../core/util';
import { gv, initOwnDynamics } from './physics';
import { pickBeh, roleOf } from './rules';
import { makeRoute } from './route';

export type Kind = 'headon' | 'gw' | 'so' | 'overtake' | 'overtaken' | 'fish' | 'nuc' | 'sail' | 'any';

export interface Scenario {
  n: string; d: string;
  /** 1 = fondamentaux, 2 = situations combinées, 3 = avancé */
  lvl: 1 | 2 | 3;
  vis: Visibility | null;
  /** Réglages d'environnement imposés à la sélection (modifiables ensuite). */
  env?: Partial<Env>;
  /** Route : [abattée (°), longueur (NM)] par segment ; défaut : une seule route droite de 60 NM. */
  legs?: [number, number][];
  build: () => void;
}

/** Référence de placement : porteur réel maintenant, ou porteur virtuel à un point tournant à l'instant t0 (s). */
interface Ref { x: number; y: number; hdg: number; stw: number; vx: number; vy: number; t0: number }

export const LEVELS: Record<number, string> = { 1: 'Fondamentaux', 2: 'Situations combinées', 3: 'Avancé' };

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
};

function shuffle<T>(a: T[]): T[] { return a.sort(() => Math.random() - 0.5); }

const wOf = (type: TargetType): number => (type === 'sail' ? 0.01 : type === 'nuc' ? 0.06 : 0.035);

/** Applique les réglages imposés par un scénario (visibilité, vent, grains…). */
export function applyScenarioEnv(key: string): void {
  const sc = SCEN[key];
  if (sc.vis) S.env.vis = sc.vis;
  S.env.rain = false;
  if (sc.env) Object.assign(S.env, sc.env);
}

export function mkT(type: TargetType, hdg: number, stw: number, x: number, y: number): Target {
  const T = TT[type], L = Math.round(rnd(T.L[0], T.L[1]));
  const t: Target = {
    id: S.nextTid++, type, name: pick(T.n), L, x, y, hdg, stw, cmdHdg: hdg, cmdStw: stw, baseHdg: hdg, baseStw: stw, rot: 0,
    maxRot: L > 250 ? 0.45 : L > 150 ? 0.7 : L > 60 ? 1.1 : 2.5, tau: L > 150 ? 25 : L > 60 ? 14 : 6,
    acc: L > 150 ? 220 : 90, dec: L > 150 ? 380 : 130, wind: wOf(type), rcs: clamp(L / 70, 0.3, 5), beh: pickBeh(),
    ai: { state: 'transit', role: null, cool: 0 }, echo: null, nextFish: S.t + rnd(600, 1200), vx: 0, vy: 0,
  };
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
  const sh = SHIPS[S.shipKey] ?? SHIPS[DEFAULT_SHIP], H = Math.round(rnd(0, 359)), sc = SCEN[S.scen];
  S.own = { x: 0, y: 0, hdg: H, cmdHdg: H, stw: sh.max, rot: 0, rud: 0, tele: TELE_SEA, ap: true, manRud: 0, rudLim: 20, ship: sh, type: 'power', L: sh.L, vx: 0, vy: 0, u: 0, v: 0, r: 0, n: 0, revUntil: 0 };
  initOwnDynamics(S.own, sh.max);
  const w = vec(H, sh.max), c = vec(S.env.curSet, S.env.curKn);
  S.own.vx = w.x + c.x; S.own.vy = w.y + c.y;
  const lim = S.route?.xteLim ?? 1, show = S.route?.show ?? true;
  Object.assign(S, {
    t: 0, targets: [], tracks: [], clutter: [], hist: [], enc: {}, log: [], sweep: 0, sel: null, trackSeq: 1,
    aiAcc: 0, encAcc: 0, histAcc: 0, spdPoor: [0, 0], over: false, collided: null, report: null, started: false, paused: true,
    alerts: [], rainCells: [], silencedUntil: 0,
    route: { ...makeRoute(0, 0, H, sc.legs ?? [[0, 60]], lim), show },
  });
  Object.assign(S.radar, {
    cuRef: H, trialHdg: H, trialSpd: Math.round(sh.max), trial: false, trialT0: 0, tmC: { x: 0, y: 0 }, off: { x: 0, y: 0 }, offMode: 'OFF',
    ebl: [null, null], vrm: [null, null], pi: [null, null, null, null],
  });
  sc.build();
  logE(`Exercice : ${sc.n} — ${sh.n}, route ${p3(H)}°, ${TELE[TELE_SEA].n}`);
}
