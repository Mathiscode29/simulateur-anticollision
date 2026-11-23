/**
 * Suivi des situations de rapprochement et évaluation règle par règle du chef de quart.
 * Les évaluations utilisent la vérité terrain (pas les données ARPA bruitées).
 * Chaque message doit citer la règle RIPAM concernée.
 */
import { S, logE, type Encounter, type Msg, type Report, type Target } from '../core/state';
import { ROLE_TXT } from '../core/data';
import { K2N, adiff, brgOf, cpaOf, fMin, fT, n360, vec } from '../core/util';
import { SCEN } from './scenarios';
import { roleOf } from './rules';
import { currentXte } from './route';
import { tssReport } from './nav';
import { depthAt } from './chart';
import { recClose } from './debrief';

export function tLabel(t: Target): string {
  const tr = S.tracks.find((k) => k.tid === t.id);
  return tr ? `cible ${tr.n}` : `écho non acquis (${t.name})`;
}

export function encStep(): void {
  const o = S.own;
  if (S.env.vis === 'poor') { S.spdPoor[0] += o.stw; S.spdPoor[1]++; }
  for (const t of S.targets) {
    const rx = t.x - o.x, ry = t.y - o.y, range = Math.hypot(rx, ry);
    const c = cpaOf(rx, ry, (t.vx - o.vx) * K2N, (t.vy - o.vy) * K2N);
    let e: Encounter | undefined = S.enc[t.id];
    if (!e) {
      if (range < 12 && c.tcpa > 0 && c.tcpa < 2700 && c.cpa < 1) {
        const ob = n360(brgOf(-rx, -ry) - t.hdg);
        e = S.enc[t.id] = {
          tid: t.id, role: roleOf(o, t, S.env.vis), t0: S.t, h0: o.hdg, v0: o.stw, th0: t.hdg, tv0: t.stw,
          tb0: n360(brgOf(rx, ry) - o.hdg), weOvertake: ob > 112.5 && ob < 247.5 && o.stw > t.stw,
          minR: range, fc: null, fs: null, maxDev: 0, maxRed: 0, crossedAhead: false, side: null, tgtActT: null, closed: false, tracked: false,
          type0: t.type,
        };
      } else continue;
    }
    if (e.closed) continue;
    // changement de statut de la cible (avarie, réparation) : nouvelle situation à partir de cet instant
    if (e.type0 !== undefined && t.type !== e.type0) {
      const nr = roleOf(o, t, S.env.vis), was = e.role;
      e.type0 = t.type;
      if (nr !== was) {
        e.chg = `Situation modifiée à T+${fT(S.t)} : ${t.vname} ${t.type === 'nuc' ? 'est devenu non maître de sa manœuvre' : 'a recouvré sa manœuvre'}, vous passez de « ${ROLE_TXT[was] || was} » à « ${ROLE_TXT[nr] || nr} »`
          + (nr === 'giveway18' ? ' : R18(a)(i), un navire à propulsion mécanique s\'écarte de la route d\'un navire non maître de sa manœuvre.' : '.');
        Object.assign(e, { role: nr, t0: S.t, h0: o.hdg, v0: o.stw, th0: t.hdg, tv0: t.stw, fc: null, fs: null, maxDev: 0, maxRed: 0, crossedAhead: false, side: null, tgtActT: null });
        logE(e.chg, 'warn');
      }
    }
    e.minR = Math.min(e.minR, range);
    if (S.tracks.some((k) => k.tid === t.id && k.state !== 'ACQ')) e.tracked = true;
    if (!e.tgtActT && (Math.abs(adiff(t.hdg, e.th0)) > 10 || t.stw < e.tv0 * 0.75)) e.tgtActT = S.t;
    const dev = adiff(o.hdg, e.h0), red = e.v0 > 1 ? 1 - o.stw / e.v0 : 0, tb = n360(brgOf(rx, ry) - o.hdg);
    if (!e.fc && Math.abs(dev) > 10) e.fc = { t: S.t, dir: Math.sign(dev), tcpa: c.tcpa, r: range, tb, tgtActed: !!e.tgtActT };
    if (!e.fs && red > 0.25) e.fs = { t: S.t, tcpa: c.tcpa, r: range, tb, tgtActed: !!e.tgtActT };
    if (e.fc && Math.sign(dev) === e.fc.dir) e.maxDev = Math.max(e.maxDev, Math.abs(dev));
    e.maxRed = Math.max(e.maxRed, red);
    // passage sur l'avant de la cible (tant qu'elle n'a pas manœuvré)
    if (!e.tgtActT) {
      const hv = vec(t.hdg, 1), ox = -rx, oy = -ry, side = Math.sign(hv.x * oy - hv.y * ox), ahead = hv.x * ox + hv.y * oy > 0;
      if (e.side !== null && side !== 0 && side !== e.side && ahead && range < 3) e.crossedAhead = true;
      if (side !== 0) e.side = side;
    }
    if (c.tcpa < 0 && range > Math.max(1.5, e.minR * 1.6)) {
      e.closed = true; e.res = evalEnc(e, t, false);
      logE(`Situation dégagée : ${tLabel(t)} (dist. min ${e.minR.toFixed(2)} NM)`);
    }
  }
}

function firstAct(e: Encounter) {
  if (e.fc && e.fs) return e.fc.t <= e.fs.t ? e.fc : e.fs;
  return e.fc || e.fs;
}

export function evalEnc(e: Encounter, t: Target, unfinished: boolean): { pen: number; m: Msg[] } {
  const m: Msg[] = [], o = S.own;
  let pen = 0;
  const colD = ((o.L / 2 + t.L / 2) / 1852) * 0.7, A = firstAct(e), C = e.fc, r = e.role;
  if (e.chg) m.push(['info', e.chg]);
  if (e.minR < colD) { pen += 100; m.push(['bad', 'Abordage.']); }
  else if (e.minR < 0.25) { pen += 35; m.push(['bad', `Passage à ${e.minR.toFixed(2)} NM : situation très rapprochée.`]); }
  else if (e.minR < 0.5) { pen += 12; m.push(['warn', `Distance minimale ${e.minR.toFixed(2)} NM : marge faible en haute mer (R8d : passer à distance suffisante).`]); }
  else m.push(['ok', `Distance minimale ${e.minR.toFixed(2)} NM.`]);
  if (!e.tracked) { pen += 5; m.push(['warn', "Cible jamais suivie à l'ARPA : R7 demande une utilisation appropriée du radar (acquisition, observation systématique)."]); }

  if (r === 'giveway' || r === 'giveway18' || r === 'overtaking' || r === 'headon') {
    if (!A) {
      if (e.minR < 1) {
        pen += 30;
        m.push(['bad', r === 'headon' ? 'Aucune manœuvre en situation de face : R14 impose à chacun de venir sur tribord.' : 'Aucune manœuvre alors que vous deviez vous écarter (R16 : manœuvrer tôt et franchement).']);
      }
    } else {
      if (A.tcpa < 5 * 60) { pen += 12; m.push(['warn', `Manœuvre tardive (TCPA ${fMin(A.tcpa)} au déclenchement) : R8a, R16.`]); }
      else m.push(['ok', `Manœuvre engagée à TCPA ${fMin(A.tcpa)}, à ${A.r.toFixed(1)} NM.`]);
      if (e.maxDev < 30 && e.maxRed < 0.4) {
        pen += 10;
        m.push(['warn', `Manœuvre peu apparente (${Math.round(e.maxDev)}° max${e.maxRed > 0.05 ? ', vitesse −' + Math.round(e.maxRed * 100) + ' %' : ''}) : R8b demande un changement assez important pour être perçu au radar ou à vue.`]);
      }
      if (C && C.dir < 0 && C.tb < 112.5 && r !== 'overtaking') {
        if (r === 'headon') { pen += 30; m.push(['bad', 'Changement de cap sur bâbord : R14 impose de venir sur tribord.']); }
        else { pen += 15; m.push(['warn', "Abattée sur bâbord pour un navire situé sur tribord : contraire aux bons usages (risque de manœuvres opposées si l'autre agit au titre de R17)."]); }
      }
    }
    if (e.crossedAhead && (r === 'giveway' || r === 'giveway18')) { pen += 20; m.push(['bad', "Vous avez coupé la route sur l'avant du navire privilégié (R15 : éviter de croiser devant)."]); }
  } else if (r === 'standon' || r === 'overtaken') {
    if (A && !A.tgtActed && A.tcpa > 10 * 60) { pen += 15; m.push(['warn', `Manœuvre à TCPA ${fMin(A.tcpa)} alors que l'autre avait encore le temps d'agir : R17a(i) impose de maintenir cap et vitesse.`]); }
    else if (A && !A.tgtActed) m.push(['ok', `Manœuvre d'initiative à TCPA ${fMin(A.tcpa)}, l'autre n'ayant pas réagi : R17a(ii).`]);
    else if (A && A.tgtActed) m.push(['info', 'Vous avez manœuvré après le non privilégié : vérifiez que votre action ne contrarie pas la sienne.']);
    if (C && C.dir < 0 && r === 'standon' && C.tb > 247.5) { pen += 25; m.push(['bad', 'R17c : en croisement, ne pas venir sur bâbord pour un navire situé sur bâbord.']); }
    if (!A && !e.tgtActT && e.minR < 0.3) { pen += 25; m.push(['bad', "Ni lui ni vous n'avez manœuvré : R17b impose d'agir quand l'abordage ne peut plus être évité par le seul non privilégié."]); }
    if (!A && e.minR >= 0.5) m.push(['ok', 'Cap et vitesse maintenus comme navire privilégié : R17a(i).']);
  } else if (r === 'anchor') {
    // navire au mouillage : pas de règle de barre entre eux, le navire qui fait route l'évite (R2 bonne pratique, R8)
    if (e.minR >= 0.5) m.push(['ok', 'Navire au mouillage paré avec une marge suffisante (R2, R8d).']);
    if (e.crossedAhead && e.minR < 1) {
      pen += 5;
      m.push(['warn', "Passage sur l'avant d'un navire au mouillage à moins d'1 NM : bonne pratique (R2), passer sur son arrière, côté sous le vent ou aval du courant, pour ne pas être drossé sur lui ou sur sa chaîne."]);
    }
  } else if (r === 'R19') {
    const tb = C ? C.tb : e.tb0, fwd = tb < 90 || tb > 270;
    if (!A && e.minR < 1) { pen += 25; m.push(['bad', 'Aucune manœuvre : en visibilité réduite, le navire qui détecte au radar une situation très rapprochée doit manœuvrer largement à temps (R19d).']); }
    if (C) {
      if (C.dir < 0 && fwd && !e.weOvertake) { pen += 25; m.push(['bad', "R19d(i) : changement de cap sur bâbord pour un navire sur l'avant du travers."]); }
      if (!fwd && ((tb <= 180 && C.dir > 0) || (tb > 180 && C.dir < 0))) { pen += 25; m.push(['bad', "R19d(ii) : changement de cap vers un navire par le travers ou sur l'arrière du travers."]); }
      if (C.dir > 0 && fwd) m.push(['ok', "Venue sur tribord pour un navire sur l'avant du travers : conforme à R19d(i)."]);
    }
    if (A && A.tcpa < 6 * 60) { pen += 10; m.push(['warn', `Manœuvre tardive (TCPA ${fMin(A.tcpa)}) : R19d demande d'agir « largement à temps ».`]); }
    if (fwd && e.minR < 1 && e.maxRed < 0.3) { pen += 5; m.push(['warn', "Navire sur l'avant du travers à moins d'1 NM sans réduction de vitesse : R19e (réduire au minimum de manœuvre, casser l'erre si besoin)."]); }
  }
  // R34a : signal de manœuvre quand les navires sont en vue (bonne visibilité), vérifié autour du premier changement de cap
  if (C && r !== 'R19' && r !== 'anchor' && C.r <= 3) {
    const want = C.dir > 0 ? 'C' : 'CC', near = S.snd.own.filter((s) => Math.abs(s.t - C.t) <= 90 && (s.pat === 'C' || s.pat === 'CC'));
    if (near.some((s) => s.pat === want)) m.push(['ok', `Signal de manœuvre donné (R34a : ${want === 'C' ? 'un son bref, « je viens sur tribord »' : 'deux sons brefs, « je viens sur bâbord »'}).`]);
    else if (near.length) { pen += 10; m.push(['bad', `Signal de manœuvre contraire au sens de l'abattée : R34a (${want === 'C' ? 'un son bref pour tribord' : 'deux sons brefs pour bâbord'}).`]); }
    else m.push(['info', `R34a : votre changement de cap à ${C.r.toFixed(1)} NM, navires en vue, s'accompagne d'un signal au sifflet (${want === 'C' ? 'un son bref pour tribord' : 'deux sons brefs pour bâbord'}).`]);
  }
  if (unfinished) m.push(['info', "Situation non terminée au moment de l'évaluation."]);
  return { pen: Math.min(pen, 100), m };
}

/** Détection d'abordage (distance < 70 % de la somme des demi-longueurs). */
export function checkCol(): void {
  const o = S.own;
  for (const t of S.targets) {
    if (Math.hypot(t.x - o.x, t.y - o.y) < ((o.L / 2 + t.L / 2) / 1852) * 0.7) {
      logE(`ABORDAGE avec ${tLabel(t)} — ${t.name} ${t.L} m`, 'bad');
      S.collided = t.id;
      finish();
      return;
    }
  }
}

/** Termine l'exercice et construit le rapport (rendu par l'interface). */
export function finish(): void {
  if (S.over) return;
  S.over = true; S.paused = true;
  recClose();
  let pen = 0, unfinished = 0;
  const items: Report['items'] = [], global: Msg[] = [];
  for (const t of S.targets) {
    const e = S.enc[t.id];
    if (!e) continue;
    if (!e.closed) { e.res = evalEnc(e, t, true); unfinished++; }
    const res = e.res!;
    pen += res.pen;
    const info = (t.ai.done || '') + (t.ai.state === 'avoid' ? t.ai.info || '' : '');
    items.push({
      tid: t.id, label: tLabel(t), name: t.name, L: t.L, role: ROLE_TXT[e.role] || e.role, msgs: res.m,
      other: info ? info.replace(/ ; $/, '') : t.type === 'nuc' ? 'non maître de sa manœuvre, a dérivé' : t.type === 'anchor' ? 'au mouillage' : 'a maintenu cap et vitesse',
    });
  }
  if (S.spdPoor[1] > 60) {
    const avg = S.spdPoor[0] / S.spdPoor[1], max = S.own.ship.max;
    if (avg > 0.75 * max) { pen += 10; global.push(['warn', `Vitesse moyenne ${avg.toFixed(1)} kn en brume (${Math.round((avg / max) * 100)} % du max) : R6 et R19b, vitesse de sécurité.`]); }
    else global.push(['ok', `Vitesse adaptée à la visibilité réduite (${avg.toFixed(1)} kn de moyenne).`]);
  }
  // R35a/b : signal de brume du porteur toutes les 2 minutes au plus
  if (S.spdPoor[1] > 150) {
    const miss = S.snd.missed;
    if (miss > 60) { pen += miss > 0.5 * S.spdPoor[1] ? 15 : 8; global.push(['warn', `Signal de brume absent pendant ${fMin(miss)} en visibilité réduite : R35a (un son prolongé toutes les 2 minutes au plus en faisant route ; deux sons prolongés stoppé sans erre). Activez le signal automatique ou le sifflet.`]); }
    else global.push(['ok', 'Signaux de brume émis en visibilité réduite (R35).']);
  }
  if (S.route) {
    const r = S.route, xte = Math.abs(currentXte() ?? 0);
    global.push(['info', `Écart de route maximal ${r.maxXte.toFixed(2)} NM (couloir ±${r.xteLim} NM).`]);
    if (r.tOver > 60) global.push(['warn', `Hors du couloir pendant ${fMin(r.tOver)} : l'anticollision prime, mais l'écart doit rester maîtrisé (plan de traversée).`]);
    if (xte <= r.xteLim / 2) global.push(['ok', `Route reprise : écart final ${xte.toFixed(2)} NM.`]);
    else if (!unfinished) global.push(['warn', `Route non reprise en fin d'exercice (écart ${xte.toFixed(2)} NM) : une fois paré et clair, revenir sur la route prévue.`]);
  }
  const tr10 = tssReport();
  pen += tr10.pen; global.push(...tr10.m);
  const grounded = S.grounded;
  if (grounded) global.unshift(['bad', `Échouement (fonds ≈ ${Math.max(0, depthAt(S.own.x, S.own.y)).toFixed(1)} m pour ${S.own.ship.mmg.d.toFixed(1)} m de tirant d'eau) : R6(a)(vi) impose de tenir compte du tirant d'eau par rapport aux fonds disponibles ; surveiller le contour de sécurité ECDIS.`]);
  const collided = S.collided !== null;
  if (unfinished && !collided && !grounded) global.push(['info', `Exercice interrompu : ${unfinished} situation(s) encore en cours, la note ne porte que sur ce qui a été joué.`]);
  const score = collided || grounded ? 0 : Math.max(0, 100 - pen);
  const grade = collided ? 'Abordage' : grounded ? 'Échouement' : unfinished ? 'Exercice interrompu' : score >= 85 ? 'Très bien' : score >= 70 ? 'Correct' : score >= 50 ? 'Insuffisant' : 'Dangereux';
  S.report = { score, grade, scen: SCEN[S.scen].n, duration: S.t, global, items, collided, grounded };
}
