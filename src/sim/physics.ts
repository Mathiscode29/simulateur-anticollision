/**
 * Cinématique et manœuvrabilité.
 *
 * Porteur : modèle MMG 3 DDL (voir mmg.ts), appareil à gouverner, pilote automatique et machine.
 * Cibles : cinématique simplifiée (giration à taux limité, vitesse du 1er ordre) ; leur dérive au vent
 * est approchée par un coefficient de prise au vent perpendiculaire au cap, plus le courant.
 */
import { S, type OwnShip, type Target } from '../core/state';
import { TELE } from '../core/data';
import { D2R, K2N, MS, R2D, adiff, clamp, n360, vec, type Vec } from '../core/util';
import { mmgStep, rpsForSpeed, type MMGParams } from './mmg';

/** Régime « allure mer » mis en cache par jeu de paramètres MMG. */
const nSeaCache = new WeakMap<MMGParams, number>();
export function nSea(p: MMGParams): number {
  let n = nSeaCache.get(p);
  if (n === undefined) { n = rpsForSpeed(p, p.Us); nSeaCache.set(p, n); }
  return n;
}

/** Initialise l'état MMG du porteur à une vitesse surface donnée (kn), en ligne droite. */
export function initOwnDynamics(o: OwnShip, stwKn: number): void {
  o.u = stwKn * MS; o.v = 0; o.r = 0; o.rot = 0; o.rud = 0; o.revUntil = 0;
  o.n = stwKn > 0 ? rpsForSpeed(o.ship.mmg, o.u) : 0;
}

/** Vecteur vitesse fond (kn) pour un cap, une vitesse surface et un coefficient de prise au vent. */
export function gv(hdg: number, stw: number, windage: number): Vec {
  const e = S.env;
  const w = vec(hdg, stw);
  const wt = vec(e.windFrom + 180, e.windKn);
  const n = vec(hdg + 90, 1);
  const wp = wt.x * n.x + wt.y * n.y;
  const lf = (windage * 1.5) / (1 + Math.abs(stw) / 8);
  const c = vec(e.curSet, e.curKn);
  return { x: w.x + n.x * wp * lf + c.x, y: w.y + n.y * wp * lf + c.y };
}

/** Vecteur surface du porteur tel que mesuré par gyro + loch (sans dérive au vent). */
export function ownWater(): Vec {
  const o = S.own;
  return vec(o.hdg, o.stw);
}

export function stepOwn(dt: number): void {
  stepOwnMMG(S.own, S.own.ship.mmg, dt);
}

/**
 * Porteur MMG : appareil à gouverner 2,5 °/s, pilote automatique PD (gains rapportés à L/U),
 * machine à régime limité en variation (pleine allure atteinte en ~60 s) et attente de 20 s
 * au renversement de marche (moteur lent deux temps).
 */
export function stepOwnMMG(o: OwnShip, p: MMGParams, dt: number): void {
  const f = TELE[o.tele].f, ns = nSea(p);
  // barre
  let rc: number;
  if (o.ap) {
    const U = Math.max(Math.hypot(o.u, o.v), 1), tL = p.L / U;
    const e = adiff(o.cmdHdg, o.hdg);
    rc = clamp(1.2 * e - 1.6 * tL * o.rot, -o.rudLim, o.rudLim);
  } else rc = o.manRud;
  const rr = 2.5 * dt;
  o.rud += clamp(rc - o.rud, -rr, rr);
  // machine
  const nT = f * ns;
  if (Math.sign(nT) !== Math.sign(o.n) && Math.abs(o.n) < 0.02 * ns && nT !== 0) {
    if (o.revUntil === 0) o.revUntil = S.t + 20;
    if (S.t >= o.revUntil) { o.n = Math.sign(nT) * 0.03 * ns; o.revUntil = 0; }
  } else {
    const rate = (ns / 60) * dt;
    const target = Math.sign(nT) !== Math.sign(o.n) && o.n !== 0 ? 0 : nT;
    o.n += clamp(target - o.n, -rate, rate);
  }
  // vent apparent dans le repère navire
  const e = S.env, wt = vec(e.windFrom + 180, e.windKn * MS); // vent vrai (vers où il va), m/s
  const wv = vec(o.hdg, 1), ws = vec(o.hdg + 90, 1);
  const shipE = { x: wv.x * o.u + ws.x * o.v, y: wv.y * o.u + ws.y * o.v };
  const ax = wt.x - shipE.x, ay = wt.y - shipE.y; // air relatif (vers où il va)
  const along = ax * wv.x + ay * wv.y, across = ax * ws.x + ay * ws.y;
  const windSpeed = Math.hypot(along, across), windAngle = Math.atan2(-across, -along); // d'où il vient, 0 = de l'avant
  const s = mmgStep(p, { u: o.u, v: o.v, r: o.r }, { delta: o.rud * D2R, n: o.n, windSpeed, windAngle }, dt);
  o.u = s.u; o.v = s.v; o.r = s.r;
  o.rot = o.r * R2D;
  o.hdg = n360(o.hdg + o.rot * dt);
  o.stw = o.u / MS;
  const c = vec(e.curSet, e.curKn);
  const f2 = vec(o.hdg, 1), s2 = vec(o.hdg + 90, 1);
  o.vx = (f2.x * o.u + s2.x * o.v) / MS + c.x;
  o.vy = (f2.y * o.u + s2.y * o.v) / MS + c.y;
  o.x += o.vx * K2N * dt; o.y += o.vy * K2N * dt;
}

/** Cibles : giration à taux limité vers le cap ordonné, vitesse du 1er ordre. */
export function stepT(t: Target, dt: number): void {
  const e = adiff(t.cmdHdg, t.hdg), rr = clamp(e * 0.06, -t.maxRot, t.maxRot);
  t.rot += (rr - t.rot) * Math.min(1, dt / t.tau);
  t.hdg = n360(t.hdg + t.rot * dt);
  if (t.type !== 'nuc') t.stw += ((t.cmdStw - t.stw) / (t.cmdStw < t.stw ? t.dec : t.acc)) * dt;
  const g = gv(t.hdg, t.stw, t.wind);
  t.vx = g.x; t.vy = g.y;
  t.x += g.x * K2N * dt; t.y += g.y * K2N * dt;
}
