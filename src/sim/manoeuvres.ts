/**
 * Manœuvres normalisées et critères de l'OMI (résolution MSC.137(76), « Standards for ship manoeuvrability »),
 * calculés par simulation en eau profonde, sans vent ni courant, à la vitesse de service.
 *
 * Critères :
 *  - giration (barre 35°) : avance ≤ 4,5 L, diamètre tactique ≤ 5 L ;
 *  - aptitude à l'abattée initiale (barre 10°) : distance parcourue pour 10° de changement de cap ≤ 2,5 L ;
 *  - zigzag 10°/10° : 1er dépassement ≤ 10° si L/V < 10 s, ≤ 20° si L/V ≥ 30 s, 5 + ½(L/V) entre les deux ;
 *    2e dépassement ≤ 25° si L/V < 10 s, ≤ 40° si L/V ≥ 30 s, 17,5 + 0,75(L/V) entre les deux ;
 *  - zigzag 20°/20° : 1er dépassement ≤ 25° ;
 *  - arrêt (machine en arrière toute) : distance parcourue ≤ 15 L (l'Administration peut admettre 20 L pour les grands navires).
 */
import { S, type OwnShip, type ShipModel } from '../core/state';
import { TELE, TELE_SEA } from '../core/data';
import { MS, adiff, n360 } from '../core/util';
import { initOwnDynamics, stepOwn } from './physics';

const DT = 0.25;

function withCalmShip<T>(ship: ShipModel, run: (o: OwnShip) => T): T {
  const saveOwn = S.own, saveEnv = { ...S.env }, saveT = S.t;
  Object.assign(S.env, { windKn: 0, curKn: 0 });
  const o: OwnShip = { x: 0, y: 0, hdg: 0, cmdHdg: 0, stw: ship.max, rot: 0, rud: 0, tele: TELE_SEA, ap: false, manRud: 0, rudLim: 35, ship, type: 'power', L: ship.L, vx: 0, vy: ship.max, u: 0, v: 0, r: 0, n: 0, revUntil: 0 };
  initOwnDynamics(o, ship.max);
  S.own = o; S.t = 0;
  try { return run(o); } finally { S.own = saveOwn; Object.assign(S.env, saveEnv); S.t = saveT; }
}
function step(): void { S.t += DT; stepOwn(DT); }
const NM = 1852;

export interface TurningResult { advance: number; transfer: number; tactical: number; steadyDiam: number; speedLoss: number; timeTo90: number }

/** Giration : barre à `rudder`° (positif = tribord). Distances en multiples de L. */
export function turningCircle(ship: ShipModel, rudder = 35): TurningResult {
  return withCalmShip(ship, (o) => {
    o.manRud = rudder;
    let advance = NaN, transfer = NaN, tactical = NaN, timeTo90 = NaN, turned = 0, prev = o.hdg;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 4 * 3600 && turned < 400; i++) {
      step();
      turned += Math.abs(adiff(o.hdg, prev)); prev = o.hdg;
      const x = (o.x * NM) / o.L, y = (o.y * NM) / o.L; // cap initial 000 : y = avance, x = transfert
      if (isNaN(advance) && turned >= 90) { advance = y; transfer = Math.abs(x); timeTo90 = S.t; }
      if (isNaN(tactical) && turned >= 180) tactical = Math.abs(x);
      if (turned >= 180) pts.push({ x, y });
    }
    let maxD = 0;
    for (const a of pts) for (const b of pts) maxD = Math.max(maxD, Math.hypot(a.x - b.x, a.y - b.y));
    return { advance, transfer, tactical, steadyDiam: maxD, speedLoss: 1 - o.u / (ship.max * MS), timeTo90 };
  });
}

/** Abattée initiale : distance (en L) parcourue quand le cap a changé de 10° avec 10° de barre. */
export function initialTurning(ship: ShipModel): number {
  return withCalmShip(ship, (o) => {
    o.manRud = 10;
    let dist = 0;
    for (let i = 0; i < 4 * 1200; i++) {
      step();
      dist += (Math.hypot(o.vx, o.vy) * MS * DT) / o.L;
      if (adiff(o.hdg, 0) >= 10) return dist;
    }
    return NaN;
  });
}

/** Zigzag a°/a° : dépassements successifs (°). */
export function zigzag(ship: ShipModel, a = 10): { first: number; second: number; LV: number } {
  return withCalmShip(ship, (o) => {
    let side = 1, extreme = 0;
    const over: number[] = [];
    o.manRud = a;
    for (let i = 0; i < 4 * 3600 && over.length < 2; i++) {
      step();
      const h = adiff(o.hdg, 0);
      if (side > 0) {
        if (h >= a && o.manRud > 0) { o.manRud = -a; extreme = h; }
        if (o.manRud < 0) { extreme = Math.max(extreme, h); if (o.rot < 0 && h < extreme) { over.push(extreme - a); side = -1; } }
      } else {
        if (h <= -a && o.manRud < 0) { o.manRud = a; extreme = h; }
        if (o.manRud > 0) { extreme = Math.min(extreme, h); if (o.rot > 0 && h > extreme) { over.push(-a - extreme); side = 1; } }
      }
    }
    return { first: over[0] ?? NaN, second: over[1] ?? NaN, LV: ship.L / (ship.max * MS) };
  });
}

/** Arrêt d'urgence : de l'allure mer à « AR toute ». Distance parcourue (en L) et durée (s). */
export function stopping(ship: ShipModel): { track: number; time: number } {
  return withCalmShip(ship, (o) => {
    o.tele = TELE.findIndex((t) => t.n === 'AR toute');
    o.ap = true; o.cmdHdg = 0; o.rudLim = 35;
    let dist = 0;
    for (let i = 0; i < 4 * 3600; i++) {
      step();
      dist += (Math.hypot(o.vx, o.vy) * MS * DT) / o.L;
      if (o.u <= 0) return { track: dist, time: S.t };
    }
    return { track: NaN, time: NaN };
  });
}

/** Changement de cap au pilote automatique : dépassement (°) après un ordre de `delta`°. */
export function autopilotChange(ship: ShipModel, delta = 30): number {
  return withCalmShip(ship, (o) => {
    o.ap = true; o.rudLim = 20; o.cmdHdg = n360(delta);
    let maxH = 0;
    for (let i = 0; i < 4 * 900; i++) { step(); maxH = Math.max(maxH, adiff(o.hdg, 0)); }
    return maxH - delta;
  });
}

export const IMO = {
  advance: 4.5, tactical: 5, initial: 2.5,
  zz10first: (LV: number) => (LV < 10 ? 10 : LV >= 30 ? 20 : 5 + LV / 2),
  zz10second: (LV: number) => (LV < 10 ? 25 : LV >= 30 ? 40 : 17.5 + 0.75 * LV),
  zz20first: 25, stop: 15, stopLarge: 20,
};
