/**
 * Moteur de règles (RIPAM / COLREG) et comportement des navires cibles.
 *
 * roleOf(A, B) : rôle de A vis-à-vis de B.
 *  - visibilité réduite → R19 (aucun privilégié) ;
 *  - rattrapement (R13) prioritaire : A vient de plus de 22,5° sur l'arrière du travers de B et va plus vite ;
 *  - R18 : un navire à propulsion mécanique s'écarte des navires en pêche, à voile, NUC, RAM ;
 *  - R14 : routes opposées à ±12° et l'autre dans l'axe à ±12° ;
 *  - R15 : celui qui a l'autre sur tribord (0–112,5°) s'écarte.
 */
import { S, type Behaviour, type OwnShip, type Role, type Target, type TargetType, type Visibility } from '../core/state';
import { SPECIAL } from '../core/data';
import { K2N, adiff, brgOf, cpaOf, fMin, n360, pm, rnd, vec } from '../core/util';
import { gv } from './physics';
import { depthAt, laneOf, laneSteer } from './chart';

export interface Vessel { x: number; y: number; hdg: number; stw: number; type: TargetType | 'power' }

export function roleOf(A: Vessel, B: Vessel, vis: Visibility): Role {
  if (vis === 'poor') return 'R19';
  const tb = n360(brgOf(B.x - A.x, B.y - A.y) - A.hdg); // B vu de A (relèvement relatif)
  const ob = n360(brgOf(A.x - B.x, A.y - B.y) - B.hdg); // A vu de B
  if (ob > 112.5 && ob < 247.5 && A.stw > B.stw) return 'overtaking';
  if (tb > 112.5 && tb < 247.5 && B.stw > A.stw) return 'overtaken';
  const sa = SPECIAL.has(A.type as TargetType), sb = SPECIAL.has(B.type as TargetType);
  if (sa && !sb) return 'standon18';
  if (sb && !sa) return 'giveway18';
  if (sa && sb) return 'standon18';
  if (Math.abs(adiff(A.hdg, B.hdg + 180)) < 12 && (tb < 12 || tb > 348)) return 'headon';
  return tb <= 112.5 ? 'giveway' : 'standon';
}

/** Tirage du comportement d'une cible selon le niveau de discipline du trafic. */
export function pickBeh(): Behaviour {
  const c = S.env.comp, r = Math.random();
  if (c === 'disc') return 'good';
  if (c === 'real') return r < 0.65 ? 'good' : r < 0.85 ? 'late' : r < 0.95 ? 'passive' : 'wrong';
  return r < 0.3 ? 'good' : r < 0.55 ? 'late' : r < 0.85 ? 'passive' : 'wrong';
}

const GIVE: ReadonlySet<Role> = new Set<Role>(['giveway', 'overtaking', 'headon', 'giveway18', 'R19']);

/** Plus petite abattée (pas de 5°) dans la direction dir donnant un CPA ≥ want. */
export function findAlt(t: Target, o: OwnShip, dir: number, minA: number, want: number): number {
  for (let a = minA; a <= 90; a += 5) {
    const g = gv(t.hdg + dir * a, t.stw, t.wind);
    const c = cpaOf(o.x - t.x, o.y - t.y, (o.vx - g.x) * K2N, (o.vy - g.y) * K2N);
    if (c.cpa >= want || c.tcpa < 0) return a;
  }
  return 90;
}

/** Décision d'une cible (appelée toutes les 2 s simulées). */
export function aiStep(t: Target): void {
  const o = S.own, a = t.ai, rx = o.x - t.x, ry = o.y - t.y, range = Math.hypot(rx, ry);
  const c = cpaOf(rx, ry, (o.vx - t.vx) * K2N, (o.vy - t.vy) * K2N);
  const ob = n360(brgOf(rx, ry) - t.hdg);
  // navire qui suit une voie du DST : la route de base suit l'axe de la voie (avec son décalage latéral)
  if (t.lane) {
    const l = laneOf(t.lane);
    if (l) {
      // se rapprocher de l'axe (profond) si des petits fonds approchent sur l'avant
      const h = vec(t.hdg, 1.5);
      if (t.laneOff && depthAt(t.x + h.x, t.y + h.y) < 25) t.laneOff *= 0.7;
      t.baseHdg = laneSteer(l, t.x, t.y, t.laneOff ?? 0, t.laneDir ?? 1);
      if (a.state === 'transit') t.cmdHdg = t.baseHdg;
    }
  }
  if (a.state === 'transit') {
    if (t.type === 'fish' && S.t > t.nextFish) {
      t.baseHdg = n360(t.baseHdg + pm(30, 80)); t.cmdHdg = t.baseHdg; t.nextFish = S.t + rnd(900, 1500);
    }
    if (S.t < a.cool || t.type === 'nuc') return;
    if (!a.role) {
      if (range < 12 && c.tcpa > 0 && c.tcpa < 2700 && c.cpa < 1.2) {
        a.role = roleOf(t, o, S.env.vis);
        const b = t.beh;
        a.want = b === 'good' ? rnd(1, 1.5) : b === 'late' ? rnd(0.5, 0.8) : rnd(0.6, 1);
        a.actT = (b === 'good' ? (a.role === 'R19' ? rnd(12, 16) : rnd(9, 14)) : b === 'late' ? rnd(4, 6.5) : rnd(5, 9)) * 60;
      } else return;
    }
    if (c.tcpa < 0) { a.role = null; return; }
    const role = a.role, want = a.want ?? 1, actT = a.actT ?? 600;
    if (GIVE.has(role) && t.beh !== 'passive' && c.cpa < want && c.tcpa < actT) {
      let dir = 1;
      if (role === 'R19' && ob >= 90 && ob <= 180) dir = -1; // R19d(ii) : ne pas venir vers un navire par le travers ou sur l'arrière
      if (role === 'overtaking') dir = findAlt(t, o, 1, 30, want) <= findAlt(t, o, -1, 30, want) ? 1 : -1;
      if (t.beh === 'wrong') dir = -dir;
      const alt = findAlt(t, o, dir, t.beh === 'late' ? 15 : 30, want);
      t.cmdHdg = n360(t.hdg + dir * alt);
      let sp = '';
      if (role === 'R19' && t.beh === 'good' && (ob < 70 || ob > 290)) { t.cmdStw = t.baseStw * 0.5; sp = ' et a réduit sa vitesse de moitié'; }
      a.state = 'avoid';
      a.info = `a viré de ${alt}° sur ${dir > 0 ? 'tribord' : 'bâbord'}${sp} à TCPA ${fMin(c.tcpa)} (${range.toFixed(1)} NM)`;
      return;
    }
    // Manœuvre de dernière minute (R17b) ou réveil tardif
    const lim = t.L > 150 ? 1 : 0.6;
    if (c.tcpa > 0 && c.cpa < 0.25 && range < lim) {
      let dir = role === 'R19' && ob >= 90 && ob <= 180 ? -1 : 1;
      if (t.beh === 'wrong') dir = -dir;
      t.cmdHdg = n360(t.hdg + dir * 90); t.cmdStw = t.baseStw * 0.6; a.state = 'avoid';
      a.info = `manœuvre de dernière minute : 90° sur ${dir > 0 ? 'tribord' : 'bâbord'} à ${range.toFixed(2)} NM`;
    }
  } else if (a.state === 'avoid') {
    if (c.tcpa < 0 && range > Math.max(1.2, c.cpa * 1.3)) {
      t.cmdHdg = t.baseHdg; t.cmdStw = t.baseStw; a.state = 'transit'; a.role = null; a.cool = S.t + 240;
      a.done = (a.done || '') + (a.info || '') + ' ; ';
    }
  }
}
