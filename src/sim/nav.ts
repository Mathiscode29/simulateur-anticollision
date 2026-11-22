/**
 * Surveillance de navigation, sans DOM (appelée toutes les secondes) :
 *  - alarmes ECDIS (inspirées de MSC.232(82)) : franchissement anticipé du contour de sécurité sur le vecteur
 *    route fond (durée d'anticipation réglable), profondeur sous le porteur inférieure au contour de sécurité ;
 *  - échouement quand la profondeur devient inférieure au tirant d'eau (fin de l'exercice) ;
 *  - suivi de la règle 10 (DST) : voie et sens de circulation, traversées, zone de séparation, zone côtière.
 */
import { S, logE, type AlertCat } from '../core/state';
import { adiff, brgOf, fMin } from '../core/util';
import { CHART, depthAt, projOnPolyline, tssAt } from './chart';
import { raiseEvent } from './alerts';

const KIND_TXT: Record<string, string> = {
  laneNE: 'voie montante (NE)', laneSW: 'voie descendante (SW)', sep: 'zone de séparation', itz: 'zone de navigation côtière', none: 'hors DST',
};

/** Direction de la voie la plus proche (pour juger une traversée de zone de séparation). */
function nearestLaneDir(x: number, y: number): number | null {
  let best: number | null = null, bd = Infinity;
  for (const l of CHART.lanes) {
    const p = projOnPolyline(l.axis, x, y);
    if (Math.abs(p.d) < bd) { bd = Math.abs(p.d); best = p.brg; }
  }
  return best;
}

/** Écart (°) entre le cap et la perpendiculaire à la direction de la voie. */
export const perpDev = (hdg: number, laneDir: number): number => Math.abs(90 - Math.abs(adiff(hdg, laneDir)));

export function navStep(dt: number): void {
  const o = S.own, cond: { id: string; cat: AlertCat; text: string }[] = [];
  S.navAlerts = cond;
  if (!CHART.grid) return;

  // ---- profondeur, contour de sécurité, échouement
  const draft = o.ship.mmg.d, dHere = depthAt(o.x, o.y), sc = S.ecdis.safety;
  if (dHere < draft) {
    S.grounded = true;
    logE(`ÉCHOUEMENT par ${Math.max(0, dHere).toFixed(1)} m de fond (tirant d'eau ${draft.toFixed(1)} m)`, 'bad');
    return;
  }
  if (dHere < sc) cond.push({ id: 'ecdis-depth', cat: 'alarm', text: `ECDIS : fonds de ${dHere.toFixed(0)} m, inférieurs au contour de sécurité (${sc} m)` });
  else {
    const sog = Math.hypot(o.vx, o.vy), cog = brgOf(o.vx, o.vy), dist = sog * (S.ecdis.look / 60);
    if (sog > 0.5) {
      const u = { x: Math.sin((cog * Math.PI) / 180), y: Math.cos((cog * Math.PI) / 180) }, n = { x: u.y, y: -u.x };
      for (let s = 0.1; s <= dist; s += 0.1) {
        let hit = false;
        for (const l of [-0.1, 0, 0.1]) if (depthAt(o.x + u.x * s + n.x * l, o.y + u.y * s + n.y * l) < sc) hit = true;
        if (hit) {
          cond.push({ id: 'ecdis-sc', cat: 'alarm', text: `ECDIS : contour de sécurité (${sc} m) franchi dans ${fMin((s / sog) * 3600)} sur la route fond` });
          break;
        }
      }
    }
  }

  // ---- règle 10
  if (!CHART.lanes.length) return;
  const w = S.tss, info = tssAt(o.x, o.y);
  w.t += dt;
  if (info.kind !== w.kind) {
    if (w.cur && w.kind !== 'sep') { if (w.cur.t > 60) w.crossings.push(w.cur); w.cur = null; }
    if (info.kind !== 'none') logE(`Entrée : ${KIND_TXT[info.kind]}`);
    else if (w.kind !== 'none') logE('Sortie du DST');
    if (info.kind === 'laneNE' || info.kind === 'laneSW') raiseEvent(`tss-${info.kind}-${Math.round(S.t)}`, 'caution', `ECDIS : entrée dans le DST, ${KIND_TXT[info.kind]}`);
    w.kind = info.kind;
  }
  if ((info.kind === 'laneNE' || info.kind === 'laneSW') && info.dir !== null) {
    const dev = Math.abs(adiff(o.hdg, info.dir)), name = info.kind === 'laneNE' ? 'NE' : 'SW';
    // ≤ 25° : suit la voie ; 25-45° : route oblique (une manœuvre d'évitement reste admise) ;
    // 45-135° : traversée, jugée sur l'écart à la perpendiculaire ; ≥ 155° : contresens.
    if (dev <= 25) w.inLane += dt;
    else if (dev >= 155) {
      w.wrong += dt;
      cond.push({ id: 'tss-wrong', cat: 'warning', text: `DST : cap opposé au sens de circulation de la ${KIND_TXT[info.kind]} (R10b)` });
    } else if (dev >= 45 && dev <= 135) {
      const pd = perpDev(o.hdg, info.dir);
      if (!w.cur || w.cur.lane !== name) w.cur = { lane: name, maxDev: 0, t: 0 };
      w.cur.maxDev = Math.max(w.cur.maxDev, pd); w.cur.t += dt;
    } else w.oblique += dt;
  } else if (info.kind === 'sep') {
    const ld = nearestLaneDir(o.x, o.y), dev = ld === null ? 0 : Math.abs(adiff(o.hdg, ld));
    if (!(dev >= 60 && dev <= 120)) {
      w.sep += dt;
      cond.push({ id: 'tss-sep', cat: 'caution', text: 'DST : navigation dans une zone de séparation (R10e)' });
    }
  } else if (info.kind === 'itz') {
    w.itz += dt;
    cond.push({ id: 'tss-itz', cat: 'caution', text: 'DST : zone de navigation côtière (R10d)' });
  }
}

/** Messages de bilan relatifs à la règle 10 et pénalité associée. */
export function tssReport(): { pen: number; m: [ 'ok' | 'warn' | 'bad' | 'info', string][] } {
  const w = S.tss, m: ['ok' | 'warn' | 'bad' | 'info', string][] = [];
  let pen = 0;
  if (!CHART.lanes.length || w.t < 1) return { pen, m };
  const cr = [...w.crossings, ...(w.cur ? [w.cur] : [])];
  if (w.inLane > 60) m.push(['ok', `Voie suivie dans la direction générale du trafic pendant ${fMin(w.inLane)} : R10(b)(i).`]);
  if (w.wrong > 30) { pen += 30; m.push(['bad', `Navigation à contresens dans une voie pendant ${fMin(w.wrong)} : contraire à R10(b)(i).`]); }
  if (w.oblique > 300) { pen += 5; m.push(['warn', `Route oblique dans une voie pendant ${fMin(w.oblique)} : suivre la direction générale du trafic (R10(b)(i)), ou traverser à angle droit (R10(c)).`]); }
  for (const c of cr.filter((x) => x.t > 60)) {
    const v = `Traversée de la voie ${c.lane} : cap à ${Math.round(c.maxDev)}° au plus de la perpendiculaire`;
    if (c.maxDev <= 15) m.push(['ok', `${v}, conforme à R10(c).`]);
    else if (c.maxDev <= 30) { pen += 5; m.push(['warn', `${v} : R10(c) demande un cap aussi proche que possible de la perpendiculaire.`]); }
    else { pen += 10; m.push(['bad', `${v} : traversée trop oblique, contraire à R10(c).`]); }
  }
  if (w.sep > 30) { pen += 10; m.push(['warn', `Présence dans une zone de séparation pendant ${fMin(w.sep)} sans la traverser : R10(e).`]); }
  if (w.itz > 60) { pen += 5; m.push(['warn', `Zone de navigation côtière utilisée pendant ${fMin(w.itz)} : R10(d), un navire de cette taille doit utiliser la voie adjacente.`]); }
  return { pen, m };
}
