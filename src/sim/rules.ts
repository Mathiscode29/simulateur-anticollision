/**
 * Moteur de règles (RIPAM / COLREG) et comportement des navires cibles.
 *
 * roleOf(A, B) : rôle de A vis-à-vis de B.
 *  - visibilité réduite → R19 (aucun privilégié) ;
 *  - rattrapement (R13) prioritaire : A vient de plus de 22,5° sur l'arrière du travers de B et va plus vite ;
 *  - R18 : un navire à propulsion mécanique s'écarte des navires en pêche, à voile, NUC, RAM ;
 *  - R14 : routes opposées à ±12° et l'autre dans l'axe à ±12° ;
 *  - R15 : celui qui a l'autre sur tribord (0–112,5°) s'écarte.
 *
 * aiStep : chaque cible évalue le porteur ET les autres cibles. Elle traite la menace la plus urgente :
 * non privilégiée, elle manœuvre (moment et ampleur selon son comportement) ; privilégiée, elle maintient
 * cap et vitesse (R17a) jusqu'à la manœuvre de dernière minute (R17b). Un trafic « imprévisible » contient
 * davantage de navires tardifs, passifs ou qui viennent du mauvais bord, entre eux comme avec le porteur.
 */
import { S, type Behaviour, type OwnShip, type Role, type Target, type TargetType, type Visibility } from '../core/state';
import { SPECIAL } from '../core/data';
import { K2N, adiff, brgOf, cpaOf, fMin, n360, pm, rnd, vec } from '../core/util';
import { gv } from './physics';
import { depthAt, laneOf, laneSteer } from './chart';
import { jammedHeading } from './faults';

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

/** Mobile évité : position et vitesse fond (kn). */
interface Mover { x: number; y: number; vx: number; vy: number }

/** Plus petite abattée (pas de 5°) dans la direction dir donnant un CPA ≥ want vis-à-vis de u. */
export function findAltVs(t: Target, u: Mover, dir: number, minA: number, want: number): number {
  for (let a = minA; a <= 90; a += 5) {
    const g = gv(t.hdg + dir * a, t.stw, t.wind);
    const c = cpaOf(u.x - t.x, u.y - t.y, (u.vx - g.x) * K2N, (u.vy - g.y) * K2N);
    if (c.cpa >= want || c.tcpa < 0) return a;
  }
  return 90;
}

/** Plus petite abattée (pas de 5°) dans la direction dir donnant un CPA ≥ want avec le porteur. */
export function findAlt(t: Target, o: OwnShip, dir: number, minA: number, want: number): number {
  return findAltVs(t, o, dir, minA, want);
}

/** Distance de sécurité visée et délai d'action selon le comportement (minutes de TCPA). */
function plan(b: Behaviour, role: Role, withOwn: boolean): { want: number; actT: number } {
  // entre cibles, distances un peu plus faibles qu'avec le porteur (habitude du trafic dense)
  const k = withOwn ? 1 : 0.75;
  const want = (b === 'good' ? rnd(1, 1.5) : b === 'late' ? rnd(0.5, 0.8) : rnd(0.6, 1)) * k;
  const actT = (b === 'good' ? (role === 'R19' ? rnd(12, 16) : rnd(9, 14)) : b === 'late' ? rnd(4, 6.5) : rnd(5, 9)) * 60;
  return { want, actT };
}

const nameOf = (u: Target | OwnShip): string => ('vname' in u ? u.vname : 'le porteur');

/** Manœuvre d'évitement vis-à-vis de u (porteur si vs = undefined). */
function avoid(t: Target, u: Target | OwnShip, vs: number | undefined, role: Role, want: number, c: { cpa: number; tcpa: number }, range: number): void {
  const a = t.ai, ob = n360(brgOf(u.x - t.x, u.y - t.y) - t.hdg);
  let dir = 1;
  if (role === 'R19' && ob >= 90 && ob <= 180) dir = -1; // R19d(ii) : ne pas venir vers un navire par le travers ou sur l'arrière
  if (role === 'overtaking') dir = findAltVs(t, u, 1, 30, want) <= findAltVs(t, u, -1, 30, want) ? 1 : -1;
  if (t.beh === 'wrong') dir = -dir;
  const alt = findAltVs(t, u, dir, t.beh === 'late' ? 15 : 30, want);
  t.cmdHdg = n360(t.hdg + dir * alt);
  let sp = '';
  if (role === 'R19' && t.beh === 'good' && (ob < 70 || ob > 290)) { t.cmdStw = t.baseStw * 0.5; sp = ' et a réduit sa vitesse de moitié'; }
  a.state = 'avoid'; a.vs = vs;
  a.info = `a viré de ${alt}° sur ${dir > 0 ? 'tribord' : 'bâbord'}${sp} à TCPA ${fMin(c.tcpa)} (${range.toFixed(1)} NM)${vs === undefined ? '' : ` pour éviter ${nameOf(u)}`}`;
}

/** Manœuvre de dernière minute (R17b) ou réveil tardif, quel que soit le rôle. */
function lastMinute(t: Target, u: Target | OwnShip, vs: number | undefined, role: Role | null, c: { cpa: number; tcpa: number }, range: number): void {
  const ob = n360(brgOf(u.x - t.x, u.y - t.y) - t.hdg);
  let dir = role === 'R19' && ob >= 90 && ob <= 180 ? -1 : 1;
  if (t.beh === 'wrong') dir = -dir;
  t.cmdHdg = n360(t.hdg + dir * 90); t.cmdStw = t.baseStw * 0.6; t.ai.state = 'avoid'; t.ai.vs = vs;
  t.ai.info = `manœuvre de dernière minute : 90° sur ${dir > 0 ? 'tribord' : 'bâbord'} à ${range.toFixed(2)} NM${vs === undefined ? '' : ` pour éviter ${nameOf(u)}`}`;
}

/** Autre cible la plus urgente (CPA < 0,8 NM, TCPA < 20 min, moins de 8 NM), en excluant éventuellement une cible. */
function otherThreat(t: Target, skip?: number): { u: Target; c: { cpa: number; tcpa: number }; range: number } | null {
  let best: { u: Target; c: { cpa: number; tcpa: number }; range: number } | null = null;
  for (const u of S.targets) {
    if (u === t || u.id === skip) continue;
    const rx = u.x - t.x, ry = u.y - t.y, range = Math.hypot(rx, ry);
    if (range > 8) continue;
    const c = cpaOf(rx, ry, (u.vx - t.vx) * K2N, (u.vy - t.vy) * K2N);
    if (c.tcpa > 0 && c.tcpa < 1200 && c.cpa < 0.8 && (!best || c.tcpa < best.c.tcpa)) best = { u, c, range };
  }
  return best;
}

/** Rôle et plan vis-à-vis d'une autre cible, figés au début de la rencontre. */
function relOf(t: Target, u: Target): { role: Role; want: number; actT: number } {
  const rel = (t.ai.rel ??= {});
  if (!rel[u.id]) { const role = roleOf(t, u, S.env.vis); rel[u.id] = { role, ...plan(t.beh, role, false) }; }
  return rel[u.id];
}

/** Situation d'urgence (CPA < 0,25 NM, à courte distance) la plus proche dans le temps, porteur compris. */
function emergency(t: Target): { u: Target | OwnShip; vs: number | undefined; c: { cpa: number; tcpa: number }; range: number } | null {
  let best: ReturnType<typeof emergency> = null;
  const test = (u: Target | OwnShip, vs: number | undefined) => {
    const rx = u.x - t.x, ry = u.y - t.y, range = Math.hypot(rx, ry), lim = (t.L > 150 ? 1 : 0.6) * (vs === undefined ? 1 : 0.7);
    if (range > lim) return;
    const c = cpaOf(rx, ry, (u.vx - t.vx) * K2N, (u.vy - t.vy) * K2N);
    if (c.tcpa > 0 && c.cpa < 0.25 && (!best || c.tcpa < best.c.tcpa)) best = { u, vs, c, range };
  };
  test(S.own, undefined);
  for (const u of S.targets) if (u !== t) test(u, u.id);
  return best;
}

/** Décision d'une cible (appelée toutes les 2 s simulées). */
export function aiStep(t: Target): void {
  const o = S.own, a = t.ai, rx = o.x - t.x, ry = o.y - t.y, range = Math.hypot(rx, ry);
  const c = cpaOf(rx, ry, (o.vx - t.vx) * K2N, (o.vy - t.vy) * K2N);
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
  if (t.type === 'nuc') {
    const j = jammedHeading(t);
    if (j !== null) t.cmdHdg = j;
    return;
  }
  if (a.state === 'transit' && t.type === 'fish' && S.t > t.nextFish) {
    t.baseHdg = n360(t.baseHdg + pm(30, 80)); t.cmdHdg = t.baseHdg; t.nextFish = S.t + rnd(900, 1500);
  }
  // urgence (R17b ou réveil tardif) : quel que soit l'état, sauf si déjà en manœuvre d'urgence pour le même navire
  const em = emergency(t);
  if (em && !(a.state === 'avoid' && a.last && a.vs === em.vs)) {
    const role = em.vs === undefined ? a.role : relOf(t, em.u as Target).role;
    lastMinute(t, em.u, em.vs, role, em.c, em.range); a.last = true;
    return;
  }

  if (a.state === 'transit') {
    if (S.t < a.cool) return;
    // 1) le porteur
    if (!a.role && range < 12 && c.tcpa > 0 && c.tcpa < 2700 && c.cpa < 1.2) {
      a.role = roleOf(t, o, S.env.vis);
      const p = plan(t.beh, a.role, true);
      a.want = p.want; a.actT = p.actT;
    }
    if (a.role && c.tcpa < 0) a.role = null;
    if (a.role && GIVE.has(a.role) && t.beh !== 'passive' && c.cpa < (a.want ?? 1) && c.tcpa < (a.actT ?? 600)) {
      avoid(t, o, undefined, a.role, a.want ?? 1, c, range); return;
    }
    // 2) les autres cibles
    const th = otherThreat(t);
    if (!th) return;
    const r = relOf(t, th.u);
    if (t.beh === 'passive') return;
    if (GIVE.has(r.role) && th.c.cpa < r.want && th.c.tcpa < r.actT) { avoid(t, th.u, th.u.id, r.role, r.want, th.c, th.range); return; }
    // R17(a)(ii) : le privilégié (bien veillé) agit seul si le non-privilégié ne manœuvre pas
    if (t.beh === 'good' && !GIVE.has(r.role) && th.c.cpa < 0.3 && th.c.tcpa < 240 && th.range < 2.5) {
      avoid(t, th.u, th.u.id, r.role, 0.5, th.c, th.range);
      a.info += ' (R17a(ii), l\'autre ne manœuvrait pas)';
    }
  } else if (a.state === 'avoid') {
    // fin d'évitement : le navire évité est dégagé (TCPA négatif et distance qui s'ouvre)
    let clear: boolean;
    if (a.vs === undefined) clear = c.tcpa < 0 && range > Math.max(1.2, c.cpa * 1.3);
    else {
      const u = S.targets.find((x) => x.id === a.vs);
      if (!u) clear = true;
      else {
        const ux = u.x - t.x, uy = u.y - t.y, ur = Math.hypot(ux, uy), uc = cpaOf(ux, uy, (u.vx - t.vx) * K2N, (u.vy - t.vy) * K2N);
        clear = uc.tcpa < 0 && ur > Math.max(0.8, uc.cpa * 1.3);
        if (clear && a.rel) delete a.rel[u.id];
      }
    }
    if (clear) {
      t.cmdHdg = t.baseHdg; t.cmdStw = t.baseStw; a.state = 'transit'; a.cool = S.t + (a.vs === undefined ? 240 : 90);
      if (a.vs === undefined) a.role = null;
      a.done = (a.done || '') + (a.info || '') + ' ; '; a.vs = undefined; a.last = false;
      return;
    }
    // pendant l'évitement : une nouvelle menace (autre navire) plus pressante entraîne une nouvelle manœuvre
    if (t.beh === 'passive' || a.last) return;
    const th = otherThreat(t, a.vs);
    if (th && th.c.tcpa < 480) {
      const r = relOf(t, th.u);
      if (GIVE.has(r.role) && th.c.cpa < r.want * 0.8) {
        a.done = (a.done || '') + (a.info || '') + ' ; ';
        avoid(t, th.u, th.u.id, r.role, r.want, th.c, th.range);
      }
    }
  }
}
