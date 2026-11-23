/**
 * Signaux sonores (RIPAM partie D et annexe III), sans DOM : la simulation produit les signaux, l'interface les joue.
 *
 * - R35, visibilité réduite (intervalle de 2 minutes au plus ; ici 105 à 119 s, phase propre à chaque navire) :
 *   (a) navire à propulsion mécanique faisant route : un son prolongé ;
 *   (b) faisant route mais stoppé et n'ayant plus d'erre : deux sons prolongés séparés d'environ 2 s ;
 *   (c) non maître de sa manœuvre, capacité restreinte, voilier, navire en pêche : un prolongé suivi de deux brefs ;
 *   (g) au mouillage : cloche pendant 5 s environ, à intervalles d'une minute au plus ; navire de 100 m et plus :
 *       cloche sur l'avant puis gong sur l'arrière.
 * - R34, navires en vue : (a) 1 son bref = je viens sur tribord, 2 brefs = sur bâbord, 3 brefs = je bats en arrière ;
 *   (d) doute sur les intentions ou les manœuvres de l'autre : au moins 5 sons brefs et rapides.
 * - Annexe III § 1 : fréquence fondamentale et portée d'audibilité selon la longueur du navire.
 * - R32 : son bref ≈ 1 s, son prolongé 4 à 6 s (ici 5 s).
 *
 * Les signaux de manœuvre des cibles sont émis quand elles changent de cap ou de vitesse en vue du porteur, à
 * portée d'audibilité. Le signal de doute est émis par une cible privilégiée quand le porteur, non privilégié,
 * ne manœuvre pas (CPA < 0,5 NM, TCPA de 1 à 7 min, à moins de 2 NM, en bonne visibilité).
 */
import { S, logE, type SoundSig, type Target } from '../core/state';
import { K2N, adiff, brgOf, cpaOf, n360 } from '../core/util';
import { roleOf } from './rules';

/** Portée d'audibilité (NM) selon la longueur (annexe III § 1 c). */
export function audibleRange(L: number): number {
  return L >= 200 ? 2 : L >= 75 ? 1.5 : L >= 20 ? 1 : 0.5;
}

/** Fréquence fondamentale (Hz) choisie dans la plage de l'annexe III § 1 a. */
export function fundamental(L: number): number {
  return L >= 200 ? 110 : L >= 75 ? 200 : 420;
}

/** Durée totale d'un motif (s) : P 5 s, C 1 s, B et G 5 s ; ≈ 1 s entre brefs, 2 s après un prolongé. */
export function patDuration(pat: string): number {
  let d = 0;
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    d += c === 'C' ? 1 : 5;
    if (i < pat.length - 1) d += c === 'C' ? 1 : c === 'B' ? 0.5 : 2;
  }
  return d;
}

/** Description d'un motif pour le journal (« un son prolongé suivi de deux brefs »…). */
export function patText(pat: string): string {
  const T: Record<string, string> = {
    P: 'un son prolongé', PP: 'deux sons prolongés', PCC: 'un son prolongé suivi de deux brefs',
    B: 'cloche (5 s)', BG: 'cloche sur l\'avant puis gong sur l\'arrière',
    C: 'un son bref (« je viens sur tribord »)', CC: 'deux sons brefs (« je viens sur bâbord »)',
    CCC: 'trois sons brefs (« je bats en arrière »)', CCCCC: 'cinq sons brefs (doute)',
  };
  return T[pat] ?? pat;
}

/** Signal de brume d'une cible (R35). */
export function fogPattern(t: Target): string {
  if (t.type === 'anchor') return t.L >= 100 ? 'BG' : 'B';
  if (t.type === 'nuc' || t.type === 'ram' || t.type === 'sail' || t.type === 'fish') return 'PCC';
  return t.stw > 0.3 ? 'P' : 'PP';
}
/** Signal de brume du porteur (R35a ou b). */
export const ownFogPattern = (): string => (S.own.stw > 0.3 ? 'P' : 'PP');
/** Intervalle des signaux de brume (s), 2 min au plus (1 min au mouillage). */
const fogEvery = (t: Target): number => (t.type === 'anchor' ? 52 + (t.id % 7) : 105 + (t.id % 15));

/** Identifiant de source du porteur. */
export const OWN = -1;

function emit(src: number, pat: string, kind: SoundSig['kind'], x: number, y: number, L: number): SoundSig {
  const s: SoundSig = { id: S.snd.seq++, src, t: S.t, pat, kind, x, y, L };
  S.snd.list.push(s);
  while (S.snd.list.length && S.snd.list[0].t < S.t - 60) S.snd.list.shift();
  if (src === OWN) S.snd.own.push({ t: S.t, pat });
  return s;
}

/** Côté d'où vient un signal entendu, en termes de quart (la direction d'un son en brume reste incertaine). */
export function sideOf(x: number, y: number): string {
  const rel = n360(brgOf(x - S.own.x, y - S.own.y) - S.own.hdg);
  return rel < 22.5 || rel >= 337.5 ? 'sur l\'avant' : rel < 67.5 ? 'sur l\'avant tribord' : rel < 112.5 ? 'par le travers tribord'
    : rel < 157.5 ? 'sur l\'arrière tribord' : rel < 202.5 ? 'sur l\'arrière' : rel < 247.5 ? 'sur l\'arrière bâbord'
      : rel < 292.5 ? 'par le travers bâbord' : 'sur l\'avant bâbord';
}

/** Signal émis par le porteur (sifflet ou cloche commandés depuis la passerelle). */
export function ownSignal(pat: string): void {
  const o = S.own, kind: SoundSig['kind'] = pat === 'CCCCC' ? 'doubt' : pat.startsWith('P') ? 'fog' : 'man';
  emit(OWN, pat, kind, o.x, o.y, o.L);
  if (kind === 'fog') S.snd.lastFog = S.t;
  logE(`Sifflet : ${patText(pat)}`);
}

/** Pas des signaux sonores (appelé toutes les secondes). */
export function soundStep(dt: number): void {
  const o = S.own, snd = S.snd, poor = S.env.vis === 'poor';
  // porteur : signal de brume automatique et suivi de R35
  if (poor) {
    if (snd.fogAuto && S.t - snd.lastFog >= 110) { emit(OWN, ownFogPattern(), 'fog', o.x, o.y, o.L); snd.lastFog = S.t; }
    if (S.t - snd.lastFog > 125) snd.missed += dt;
  }
  for (const t of S.targets) {
    const rx = t.x - o.x, ry = t.y - o.y, r = Math.hypot(rx, ry), heard = r <= audibleRange(t.L);
    // R35 : signaux de brume (phase initiale tirée pour désynchroniser les navires)
    if (poor) {
      const every = fogEvery(t);
      if (snd.tFog[t.id] === undefined) snd.tFog[t.id] = S.t - Math.random() * every;
      if (S.t - snd.tFog[t.id] >= every) {
        snd.tFog[t.id] = S.t;
        const pat = fogPattern(t);
        emit(t.id, pat, 'fog', t.x, t.y, t.L);
        if (heard) logE(`Signal de brume entendu ${sideOf(t.x, t.y)} : ${patText(pat)}`);
      }
    }
    if (poor || t.type === 'anchor') { snd.cmd[t.id] = t.cmdHdg; continue; }
    // R34(a) : changement de cap d'une cible en vue et à portée d'audibilité
    const prev = snd.cmd[t.id];
    snd.cmd[t.id] = t.cmdHdg;
    if (prev !== undefined && heard && t.ai.state !== 'transit' && Math.abs(adiff(t.cmdHdg, prev)) >= 12 && S.t - (snd.tMan[t.id] ?? -1e9) > 25 && t.type !== 'nuc') {
      snd.tMan[t.id] = S.t;
      const pat = adiff(t.cmdHdg, prev) > 0 ? 'C' : 'CC';
      emit(t.id, pat, 'man', t.x, t.y, t.L);
      logE(`Signal de manœuvre entendu ${sideOf(t.x, t.y)} : ${patText(pat)}`);
    }
    // R34(d) : le privilégié doute des intentions du porteur qui ne manœuvre pas
    if (heard && r <= 2 && !snd.tMan[-t.id] && t.ai.state === 'transit') {
      const role = roleOf(t, o, 'good');
      if (role === 'standon' || role === 'standon18' || role === 'overtaken') {
        const c = cpaOf(rx, ry, (t.vx - o.vx) * K2N, (t.vy - o.vy) * K2N);
        if (c.cpa < 0.5 && c.tcpa > 60 && c.tcpa < 420) {
          snd.tMan[-t.id] = S.t;
          emit(t.id, 'CCCCC', 'doubt', t.x, t.y, t.L);
          logE(`Signal de doute entendu ${sideOf(t.x, t.y)} : ${patText('CCCCC')} — ${t.vname} doute de vos intentions (R34d)`, 'warn');
        }
      }
    }
  }
}
