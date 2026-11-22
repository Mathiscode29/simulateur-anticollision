/**
 * Génération des scénarios.
 * Chaque situation est construite à rebours : on choisit le type de rencontre, le TCPA (min) et le CPA visé,
 * puis on place la cible pour que le mouvement relatif passe au CPA voulu. Le rôle obtenu est vérifié par roleOf.
 */
import { S, logE, type Target, type TargetType, type Visibility } from '../core/state';
import { DEFAULT_SHIP, SHIPS, TELE, TELE_SEA, TT } from '../core/data';
import { K2N, brgOf, clamp, n360, p3, pick, pm, rnd, vec } from '../core/util';
import { gv, initOwnDynamics } from './physics';
import { pickBeh, roleOf } from './rules';

export type Kind = 'headon' | 'gw' | 'so' | 'overtake' | 'overtaken' | 'fish' | 'nuc' | 'sail' | 'any';

export interface Scenario { n: string; d: string; vis: Visibility | null; build: () => void }

export const SCEN: Record<string, Scenario> = {
  r14: { n: 'Face à face (R14)', d: 'Un navire à contre-bord, quasiment route opposée.', vis: 'good',
    build() { add('headon', rnd(14, 18), pm(0, 0.15)); add('any', rnd(16, 26), pm(2, 3.5)); } },
  r15: { n: 'Croisement : non privilégié (R15/16)', d: 'Un navire vous croise en venant de tribord.', vis: 'good',
    build() { add('gw', rnd(15, 20), pm(0, 0.2)); add('any', rnd(16, 26), pm(2, 3.5)); } },
  r17: { n: 'Croisement : privilégié (R17)', d: 'Un navire arrive de bâbord. Réagira-t-il à temps ?', vis: 'good',
    build() { const t = add('so', rnd(16, 20), pm(0, 0.15)); if (t && Math.random() < 0.55) t.beh = 'passive'; add('any', rnd(16, 26), pm(2, 3.5)); } },
  r13: { n: 'Rattrapement (R13)', d: "Vous rattrapez un navire plus lent… pendant qu'un autre croise.", vis: 'good',
    build() { add('overtake', rnd(28, 36), pm(0, 0.12)); add('gw', rnd(24, 32), pm(0, 0.3)); } },
  r18: { n: 'Pêche, voile, NUC (R18)', d: 'Chalutier, voilier et navire à propulsion mécanique.', vis: 'good',
    build() { add('fish', rnd(12, 16), pm(0, 0.2)); add('sail', rnd(20, 26), pm(0, 0.2)); add(pick(['so', 'nuc'] as const), rnd(24, 30), pm(0, 0.3)); } },
  r19: { n: 'Visibilité réduite (R19)', d: 'Brume : radar seul. Trois échos, dont un rattrapant.', vis: 'poor',
    build() { add('gw', rnd(16, 20), pm(0, 0.2)); add('so', rnd(24, 30), pm(0, 0.25)); add('overtaken', rnd(30, 38), pm(0, 0.2)); } },
  mix: { n: 'Trafic mixte', d: 'Six navires dont trois en route de collision, échelonnés.', vis: null,
    build() {
      const k = shuffle<Kind>(['headon', 'gw', 'so', 'fish', 'overtake', 'sail']);
      add(k[0], rnd(12, 15), pm(0, 0.2)); add(k[1], rnd(22, 26), pm(0, 0.25)); add(k[2], rnd(32, 36), pm(0, 0.25));
      for (let i = 0; i < 3; i++) add('any', rnd(14, 35), pm(1.8, 4));
    } },
  dense: { n: 'Trafic dense', d: 'Onze navires, cinq situations à risque. Rythme soutenu.', vis: null,
    build() {
      const k = shuffle<Kind>(['headon', 'gw', 'so', 'fish', 'overtake', 'gw', 'sail']);
      [10, 16, 22, 30, 40].forEach((T, i) => add(k[i], T + rnd(0, 3), pm(0, 0.3)));
      for (let i = 0; i < 6; i++) add('any', rnd(10, 40), pm(1.5, 4));
    } },
};

function shuffle<T>(a: T[]): T[] { return a.sort(() => Math.random() - 0.5); }

const wOf = (type: TargetType): number => (type === 'sail' ? 0.01 : type === 'nuc' ? 0.06 : 0.035);

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

/** Place une cible du type demandé pour un rapprochement au CPA `off` (NM) dans `Tmin` minutes. */
export function add(kind: Kind, Tmin: number, off: number): Target | null {
  const o = S.own, H = o.hdg, os = o.stw;
  const want = ({ headon: 'headon', gw: 'giveway', so: 'standon', overtake: 'overtaking', overtaken: 'overtaken' } as Record<string, string>)[kind];
  for (let k = 0; k < 120; k++) {
    if (k === 60) Tmin *= 1.4;
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
    const tv = gv(hdg, spd, wOf(type)), T = Tmin * 60;
    const mx = o.x + o.vx * K2N * T, my = o.y + o.vy * K2N * T;
    const rvx = tv.x - o.vx, rvy = tv.y - o.vy, rl = Math.hypot(rvx, rvy);
    if (rl < 1) continue;
    const nx = -rvy / rl, ny = rvx / rl;
    const x = mx - tv.x * K2N * T + nx * off, y = my - tv.y * K2N * T + ny * off;
    const r = Math.hypot(x - o.x, y - o.y);
    if (r < 2.5 || r > 11.5) continue;
    const tb = n360(brgOf(x - o.x, y - o.y) - H);
    if (want && roleOf(o, { x, y, hdg, stw: spd, type }, 'good') !== want) continue;
    if ((kind === 'fish' || kind === 'nuc' || kind === 'sail') && tb > 100 && tb < 260) continue;
    return mkT(type, hdg, spd, x, y);
  }
  return null;
}

export function newScenario(): void {
  const sh = SHIPS[S.shipKey] ?? SHIPS[DEFAULT_SHIP], H = Math.round(rnd(0, 359));
  S.own = { x: 0, y: 0, hdg: H, cmdHdg: H, stw: sh.max, rot: 0, rud: 0, tele: TELE_SEA, ap: true, manRud: 0, rudLim: 20, ship: sh, type: 'power', L: sh.L, vx: 0, vy: 0, u: 0, v: 0, r: 0, n: 0, revUntil: 0 };
  initOwnDynamics(S.own, sh.max);
  const w = vec(H, sh.max), c = vec(S.env.curSet, S.env.curKn);
  S.own.vx = w.x + c.x; S.own.vy = w.y + c.y;
  Object.assign(S, {
    t: 0, targets: [], tracks: [], clutter: [], hist: [], enc: {}, log: [], sweep: 0, sel: null, trackSeq: 1,
    aiAcc: 0, encAcc: 0, histAcc: 0, spdPoor: [0, 0], over: false, collided: null, report: null, started: false, paused: true,
    alerts: [], rainCells: [], silencedUntil: 0,
  });
  Object.assign(S.radar, {
    cuRef: H, trialHdg: H, trialSpd: Math.round(sh.max), trial: false, trialT0: 0, tmC: { x: 0, y: 0 }, off: { x: 0, y: 0 }, offMode: 'OFF',
    ebl: [null, null], vrm: [null, null], pi: [null, null, null, null],
  });
  SCEN[S.scen].build();
  logE(`Exercice : ${SCEN[S.scen].n} — ${sh.n}, cap ${p3(H)}°, ${TELE[TELE_SEA].n}`);
}
