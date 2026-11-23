/**
 * Sons de la passerelle (Web Audio) : bips d'alerte et signaux sonores du RIPAM produits par sim/sound.ts.
 *
 * - Sifflet : son fondamental selon la longueur (annexe III), timbre en dents de scie filtré, avec la quinte.
 * - Cloche : coups rapides (≈ 4 par seconde) à partiels inharmoniques ; gong : coups graves plus lents.
 * - Volume selon la distance (portée d'audibilité de l'annexe III), panoramique stéréo selon le relèvement relatif :
 *   en brume, la direction d'un son reste trompeuse, la stéréo n'est qu'un indice.
 * - En accéléré, les durées sont raccourcies ; au-delà de × 8, seuls les signaux du porteur sont joués.
 */
import { S } from '../core/state';
import { brgOf, clamp, n360 } from '../core/util';
import { OWN, audibleRange, fundamental } from '../sim/sound';

let audio: AudioContext | null = null;
/** Crée le contexte audio (à appeler sur un geste de l'utilisateur). */
export function ensureAudio(): void {
  if (!audio) { try { audio = new AudioContext(); } catch { audio = null; } }
  if (audio?.state === 'suspended') void audio.resume();
}
/** Bip d'alerte. */
export function beep(freq: number, dur: number, delay = 0): void {
  if (!audio) return;
  try {
    const t = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq; o.type = 'square'; g.gain.value = 0.04;
    o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + dur);
  } catch { /* son indisponible */ }
}

/** Signaux sonores audibles (réglage de l'onglet Barre). */
export const hornCfg = { on: true };
let lastId = 0;

function whistle(a: AudioContext, out: AudioNode, t: number, dur: number, f: number): void {
  const g = a.createGain(), lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(2400, f * 9);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.06); g.gain.setValueAtTime(1, t + dur - 0.12); g.gain.linearRampToValueAtTime(0, t + dur);
  for (const [k, type, v] of [[1, 'sawtooth', 0.6], [1.5, 'sawtooth', 0.35], [2, 'square', 0.12]] as const) {
    const o = a.createOscillator(), og = a.createGain();
    o.type = type; o.frequency.value = f * k; og.gain.value = v;
    o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.05);
  }
  lp.connect(g); g.connect(out);
}

function strike(a: AudioContext, out: AudioNode, t: number, base: number, parts: number[], decay: number, v: number): void {
  for (let i = 0; i < parts.length; i++) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = base * parts[i];
    g.gain.setValueAtTime(v / (i + 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + decay + 0.02);
  }
}

/** Joue un motif (P, C, B, G) ; renvoie sa durée (s). */
function play(pat: string, L: number, vol: number, pan: number, speed: number): void {
  const a = audio!;
  const out = a.createGain(), p = a.createStereoPanner();
  out.gain.value = vol; p.pan.value = clamp(pan, -1, 1);
  out.connect(p); p.connect(a.destination);
  const k = 1 / Math.max(1, speed), f = fundamental(L);
  let t = a.currentTime + 0.05;
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i];
    if (c === 'P' || c === 'C') {
      const d = Math.max(0.15, (c === 'P' ? 5 : 1) * k);
      whistle(a, out, t, d, f); t += d;
    } else {
      const d = Math.max(0.3, 5 * k), step = c === 'B' ? 0.24 : 0.45;
      for (let u = 0; u < d; u += step) c === 'B' ? strike(a, out, t + u, 1150, [1, 2.76, 5.4], 0.35, 0.5) : strike(a, out, t + u, 140, [1, 1.47, 2.09, 2.56], 1.1, 0.6);
      t += d;
    }
    if (i < pat.length - 1) t += Math.max(0.12, (c === 'C' ? 1 : c === 'B' ? 0.5 : 2) * k);
  }
}

/** Joue les signaux émis depuis le dernier appel (à appeler régulièrement par l'interface). */
export function hornTick(): void {
  const list = S.snd.list;
  if (!list.length) return;
  if (list[list.length - 1].id < lastId) lastId = 0; // nouvel exercice : numérotation repartie de 1
  const fresh = list.filter((s) => s.id > lastId);
  if (!fresh.length) return;
  lastId = list[list.length - 1].id;
  if (!audio || !hornCfg.on || S.paused) return;
  const o = S.own;
  for (const s of fresh) {
    if (S.t - s.t > 3) continue;
    if (s.src === OWN) { play(s.pat, o.L, 0.1, 0, S.ts); continue; }
    if (S.ts > 8) continue;
    const r = Math.hypot(s.x - o.x, s.y - o.y), R = audibleRange(s.L);
    if (r > R) continue;
    const rel = n360(brgOf(s.x - o.x, s.y - o.y) - o.hdg) * (Math.PI / 180);
    play(s.pat, s.L, 0.02 + 0.1 * (1 - r / R) ** 1.5, 0.8 * Math.sin(rel), S.ts);
  }
}
