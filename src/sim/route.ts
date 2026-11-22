/**
 * Route prévue (plan de traversée) et écart latéral (XTE), sans DOM.
 *
 * Convention : XTE > 0 quand le porteur est sur tribord de la route (à droite du segment parcouru).
 * Le passage au point tournant suivant se fait à 0,5 NM du point (cercle d'arrivée).
 * Les écarts sont suivis pour le bilan : l'anticollision prime, mais un chef de quart revient
 * sur sa route une fois paré et clair (bonne pratique, plan de traversée).
 */
import { S, logE, type Route } from '../core/state';
import { brgOf, p3, vec } from '../core/util';

export const ARRIVAL = 0.5;

/**
 * Construit une route depuis la position du porteur.
 * legs : [abattée (°, + = tribord) par rapport au segment précédent, longueur (NM)] ; le premier segment suit `hdg`.
 */
export function makeRoute(x: number, y: number, hdg: number, legs: [number, number][], xteLim = 1): Route {
  const back = vec(hdg, 2);
  const wps = [{ x: x - back.x, y: y - back.y }];
  let cx = x, cy = y, crs = hdg;
  legs.forEach(([turn, dist], i) => {
    crs += turn;
    const v = vec(crs, dist);
    if (i === 0) { cx = x + v.x; cy = y + v.y; } else { cx += v.x; cy += v.y; }
    wps.push({ x: cx, y: cy });
  });
  return { wps, leg: 0, xteLim, show: true, maxXte: 0, tOver: 0 };
}

/** Données de navigation sur le segment actif. */
export function legData(r: Route, px: number, py: number) {
  const a = r.wps[r.leg], b = r.wps[r.leg + 1];
  const lx = b.x - a.x, ly = b.y - a.y, len = Math.hypot(lx, ly) || 1e-9;
  const ux = lx / len, uy = ly / len, qx = px - a.x, qy = py - a.y;
  const along = qx * ux + qy * uy, xte = uy * qx - ux * qy;
  return { along, len, xte, crs: brgOf(lx, ly), dtw: Math.hypot(b.x - px, b.y - py), btw: brgOf(b.x - px, b.y - py) };
}

export function routeStep(dt: number): void {
  const r = S.route;
  if (!r) return;
  let d = legData(r, S.own.x, S.own.y);
  if (r.leg < r.wps.length - 2 && (d.dtw < ARRIVAL || d.along > d.len)) {
    r.leg++;
    d = legData(r, S.own.x, S.own.y);
    logE(`Point tournant ${r.leg} : nouvelle route ${p3(d.crs)}°`);
  }
  r.maxXte = Math.max(r.maxXte, Math.abs(d.xte));
  if (Math.abs(d.xte) > r.xteLim) r.tOver += dt;
}

/** Écart latéral courant (NM), null sans route. */
export function currentXte(): number | null {
  return S.route ? legData(S.route, S.own.x, S.own.y).xte : null;
}
