/**
 * Utilitaires mathématiques et conventions.
 *
 * Conventions du projet :
 *  - repère plan local : x vers l'est, y vers le nord, en milles nautiques (NM) ;
 *  - relèvements et caps en degrés, comptés de 0 à 360 dans le sens horaire depuis le nord ;
 *  - vitesses en nœuds (kn), temps en secondes.
 */
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
/** Conversion nœuds -> NM par seconde. */
export const K2N = 1 / 3600;
/** Conversion nœuds -> m/s. */
export const MS = 0.514444;

export interface Vec { x: number; y: number }

export const n360 = (a: number): number => ((a % 360) + 360) % 360;
/** Différence angulaire a - b ramenée dans ]-180, 180]. */
export const adiff = (a: number, b: number): number => { const d = n360(a - b); return d > 180 ? d - 360 : d; };
/** Vecteur de relèvement b (deg) et de longueur l. */
export const vec = (b: number, l: number): Vec => ({ x: Math.sin(b * D2R) * l, y: Math.cos(b * D2R) * l });
/** Relèvement (deg) du vecteur (x, y). */
export const brgOf = (x: number, y: number): number => n360(Math.atan2(x, y) * R2D);
export const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
/** Valeur aléatoire de signe aléatoire, de module entre a et b. */
export const pm = (a: number, b: number): number => (Math.random() < 0.5 ? -1 : 1) * rnd(a, b);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const gauss = (): number => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
/** Cap ou relèvement sur 3 chiffres. */
export const p3 = (a: number): string => String(Math.round(n360(a)) % 360).padStart(3, '0');
/** Durée en hh:mm:ss (ou mm:ss). */
export const fT = (s: number): string => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60;
  return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
};
export const fMin = (s: number): string => (s / 60).toFixed(1) + ' min';

/**
 * CPA/TCPA à partir de la position relative (NM) et de la vitesse relative (NM/s).
 * tcpa en secondes, négatif si le point de rapprochement est dépassé.
 */
export function cpaOf(px: number, py: number, vx: number, vy: number): { cpa: number; tcpa: number } {
  const v2 = vx * vx + vy * vy;
  if (v2 < 1e-14) return { cpa: Math.hypot(px, py), tcpa: Infinity };
  const t = -(px * vx + py * vy) / v2;
  return { cpa: Math.hypot(px + vx * t, py + vy * t), tcpa: t };
}
