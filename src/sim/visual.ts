/**
 * Observation visuelle et auditive d'une cible (RIPAM partie C et D).
 * Portées des feux (annexe I / R22) : ≥ 50 m : mât 6 NM, côtés 3, poupe 3, tous horizons 3.
 */
import { S, type Target } from '../core/state';
import { SPECIAL } from '../core/data';
import { brgOf, n360 } from '../core/util';

export function lights(t: Target, r: number, ob: number): string[] {
  const L = t.L, mk = t.stw > 0.3, res: string[] = [];
  const mhR = L >= 50 ? 6 : L >= 20 ? 5 : L >= 12 ? 3 : 2, sdR = L >= 50 ? 3 : L >= 12 ? 2 : 1, stR = L >= 50 ? 3 : 2, arR = L >= 50 ? 3 : 2;
  const fwd = ob <= 112.5 || ob >= 247.5, green = ob <= 112.5 || ob >= 357.5, red = ob >= 247.5 || ob <= 2.5;
  const open = ob < 4 || ob > 356 ? 'alignés' : ob <= 180 ? 'ouverts, le navire se dirige vers votre droite' : 'ouverts, le navire se dirige vers votre gauche';
  const mh = (n: number) => { if (fwd && r <= mhR) res.push(n === 2 ? `deux feux de tête de mât (${open})` : 'un feu de tête de mât'); };
  switch (t.type) {
    case 'fish': if (r <= arR) res.push('vert sur blanc, tous horizons'); if (L >= 50) mh(1); break;
    case 'nuc': if (r <= arR) res.push('deux rouges superposés, tous horizons'); break;
    case 'ram': if (r <= arR) res.push('rouge-blanc-rouge superposés'); if (mk) mh(L >= 50 ? 2 : 1); break;
    case 'sail': break;
    default: mh(L >= 50 ? 2 : 1);
  }
  if (mk) {
    if (r <= sdR) {
      if (green && red) res.push('vert et rouge');
      else if (green) res.push('feu de côté vert');
      else if (red) res.push('feu de côté rouge');
    }
    if (!fwd && r <= stR) res.push('feu de poupe blanc');
  }
  return res;
}

export function visual(t: Target): string {
  const o = S.own, rx = o.x - t.x, ry = o.y - t.y, r = Math.hypot(rx, ry), ob = n360(brgOf(rx, ry) - t.hdg);
  if (S.env.vis === 'poor' && r > 0.25) {
    let s = 'Non visible (brume).';
    if (r < 2) {
      const sig = SPECIAL.has(t.type) ? 'un son prolongé suivi de deux brefs' : t.stw > 0.3 ? 'un son prolongé' : 'deux sons prolongés';
      s += ` Signal de brume entendu, direction incertaine : ${sig}.`;
    }
    return s;
  }
  if (!S.env.night) {
    const vr = t.L >= 100 ? 8 : t.L >= 50 ? 6 : t.L >= 20 ? 4 : 2.5;
    if (r > vr) return 'Hors de portée visuelle.';
    const asp = ob <= 180 ? `vert ${Math.round(ob)}°` : `rouge ${Math.round(360 - ob)}°`;
    const sh = ({ fish: 'deux cônes pointes réunies', nuc: 'deux boules noires', ram: 'boule-bicône-boule' } as Record<string, string>)[t.type];
    return `${t.name} d'environ ${t.L} m, aspect ${asp}${sh ? ' · marque : ' + sh : ''}.`;
  }
  const L = lights(t, r, ob);
  return L.length ? 'Feux : ' + L.join(' + ') + '.' : 'Aucun feu visible à cette distance.';
}

/** Feu de navigation en coordonnées du navire : a vers l'avant, b vers tribord, z au-dessus de l'eau (m). */
export interface Light3D { a: number; b: number; z: number; col: 'W' | 'R' | 'G'; range: number }
/** Marque de jour : position sur le mât et forme (R24 à R27). */
export interface Shape3D { a: number; z: number; shape: 'ball' | 'coneUp' | 'coneDown' | 'diamond' }

/** Hauteur du feu de tête de mât avant (m), proportionnée à la longueur. */
export const mastH = (L: number): number => Math.min(30, Math.max(6, 0.1 * L + 4));

/**
 * Feux visibles depuis un observateur situé au relèvement relatif `ob` (0 = sur l'avant de la cible),
 * selon les secteurs de l'annexe I : tête de mât 225° sur l'avant, côtés 112,5°, poupe 135°.
 * Les portées nominales (R22) sont jointes : l'appelant applique la distance et l'atmosphère.
 */
export function navLights3D(t: Target, ob: number): Light3D[] {
  const L = t.L, mk = t.stw > 0.3, B = Math.max(3, L / 7), hM = mastH(L), res: Light3D[] = [];
  const mhR = L >= 50 ? 6 : L >= 20 ? 5 : L >= 12 ? 3 : 2, sdR = L >= 50 ? 3 : L >= 12 ? 2 : 1, stR = L >= 50 ? 3 : 2, arR = L >= 50 ? 3 : 2;
  // léger recouvrement des feux de côté sur l'avant (annexe I, 9 a)
  const fwd = ob <= 112.5 || ob >= 247.5, green = ob <= 112.5 || ob >= 357.5, red = ob >= 247.5 || ob <= 2.5;
  const mh = (two: boolean) => {
    if (!fwd) return;
    res.push({ a: 0.25 * L, b: 0, z: hM, col: 'W', range: mhR });
    if (two) res.push({ a: -0.3 * L, b: 0, z: hM + Math.max(4.5, 0.04 * L), col: 'W', range: mhR });
  };
  switch (t.type) {
    case 'fish':
      res.push({ a: 0.2 * L, b: 0, z: hM + 2, col: 'G', range: arR }, { a: 0.2 * L, b: 0, z: hM, col: 'W', range: arR });
      if (L >= 50) mh(false);
      break;
    case 'nuc': res.push({ a: 0.1 * L, b: 0, z: hM + 2, col: 'R', range: arR }, { a: 0.1 * L, b: 0, z: hM, col: 'R', range: arR }); break;
    case 'ram':
      res.push({ a: 0.1 * L, b: 0, z: hM + 4, col: 'R', range: arR }, { a: 0.1 * L, b: 0, z: hM + 2, col: 'W', range: arR }, { a: 0.1 * L, b: 0, z: hM, col: 'R', range: arR });
      if (mk) mh(L >= 50);
      break;
    case 'sail':
      // feu tricolore en tête de mât (voilier de moins de 20 m)
      if (mk) res.push({ a: 0.05 * L, b: 0, z: 1.3 * L, col: green ? 'G' : red ? 'R' : 'W', range: L >= 12 ? 2 : 1 });
      return res;
    default: mh(L >= 50);
  }
  if (mk) {
    const aS = t.type === 'fish' ? 0.15 * L : -0.3 * L, zS = Math.max(3, 0.06 * L + 4);
    if (green) res.push({ a: aS, b: B / 2, z: zS, col: 'G', range: sdR });
    if (red) res.push({ a: aS, b: -B / 2, z: zS, col: 'R', range: sdR });
    if (!fwd) res.push({ a: -L / 2, b: 0, z: Math.max(2, 0.04 * L + 3), col: 'W', range: stR });
  }
  return res;
}

/** Marques de jour (diamètre 0,6 m environ) : pêche, NUC, RAM. */
export function dayShapes(t: Target): Shape3D[] {
  const a = 0.1 * t.L, z = mastH(t.L) - 1.5;
  if (t.type === 'fish') return [{ a, z: z + 0.7, shape: 'coneDown' }, { a, z, shape: 'coneUp' }];
  if (t.type === 'nuc') return [{ a, z: z + 1.5, shape: 'ball' }, { a, z, shape: 'ball' }];
  if (t.type === 'ram') return [{ a, z: z + 3, shape: 'ball' }, { a, z: z + 1.5, shape: 'diamond' }, { a, z, shape: 'ball' }];
  return [];
}
