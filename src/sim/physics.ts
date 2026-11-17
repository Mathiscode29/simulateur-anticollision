/**
 * Cinématique et manœuvrabilité.
 *
 * Porteur : modèle de Nomoto du 1er ordre  T·r' + r = K·δ  (r en °/s, δ en °),
 * avec K = Kp·U/L et T = Tp·L/U (U vitesse effective dans l'écoulement, souffle d'hélice compris),
 * appareil à gouverner limité à 2,5 °/s, pilote automatique PD réglé pour ζ ≈ 0,95.
 * Vitesse : 1er ordre vers la consigne du transmetteur, perte de vitesse en giration.
 * Dérive : vecteur surface + dérive au vent (perpendiculaire au cap) + courant.
 */
import { S, type OwnShip, type Target } from '../core/state';
import { TELE } from '../core/data';
import { K2N, MS, adiff, clamp, n360, vec, type Vec } from '../core/util';

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
  const o: OwnShip = S.own, sh = o.ship, f = TELE[o.tele].f;
  const Ums = Math.abs(o.stw) * MS * (o.stw >= 0 ? 1 : 0.25);
  const wash = f > 0 ? 0.55 * f * sh.max * MS : 0;
  const Ue = Math.max(Ums, wash, 0.05);
  const K = (sh.Kp * Ue) / sh.L, T = (sh.Tp * sh.L) / Math.max(Ue, 0.3);
  let rc: number;
  if (o.ap) {
    const a = 1.6, e = adiff(o.cmdHdg, o.hdg);
    let b = (2 * 0.95 * Math.sqrt((K * a) / T) * T - 1) / (K * a);
    b = clamp(b, 0, 200);
    rc = clamp(a * (e - b * o.rot), -o.rudLim, o.rudLim);
  } else rc = o.manRud;
  const rr = 2.5 * dt;
  o.rud += clamp(rc - o.rud, -rr, rr);
  o.rot += ((K * o.rud - o.rot) / T) * dt;
  o.hdg = n360(o.hdg + o.rot * dt);
  const tgt = f * sh.max * (1 - (f > 0 ? (0.35 * Math.abs(o.rud)) / 35 : 0));
  let tau = tgt > o.stw && o.stw >= 0 ? sh.acc : sh.dec;
  if (f < 0 && o.stw > 0) tau = sh.dec * 0.45;
  if (f >= 0 && o.stw < 0) tau = sh.acc * 0.6;
  o.stw += ((tgt - o.stw) / tau) * dt;
  const g = gv(o.hdg, o.stw, sh.wind);
  o.vx = g.x; o.vy = g.y;
  o.x += g.x * K2N * dt; o.y += g.y * K2N * dt;
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
