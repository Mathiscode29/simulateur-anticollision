/** Types communs des cartes (données sourcées, coordonnées WGS 84 en degrés décimaux). */

/** [latitude, longitude] */
export type LL = [number, number];
/** Degrés + minutes décimales → degrés décimaux (négatif : saisir des degrés négatifs pour W / S). */
export const dm = (d: number, m: number): number => (d < 0 || Object.is(d, -0) ? d - m / 60 : d + m / 60);
export const P = (latD: number, latM: number, lonD: number, lonM: number): LL => [dm(latD, latM), dm(lonD, lonM)];

/** lh : phare à terre (pas d'écho radar propre, feu de grande portée). */
export type MarkKind = 'N' | 'S' | 'E' | 'W' | 'special' | 'safe' | 'lv' | 'light' | 'lh';
export interface ChartMark { id: string; name: string; lat: number; lon: number; kind: MarkKind; light?: string; range?: number; elev?: number; approx?: boolean; racon?: boolean; src: string }
export interface ChartBank { name: string; lat: number; lon: number; len: number; wid: number; orient: number; min: number; src: string }
export interface TssZone { id: string; name: string; pts: LL[] }
/** Voie de circulation : un ou plusieurs polygones, et l'axe orienté dans le sens du trafic (suivi des cibles). */
export interface TssLane { id: string; name: string; polys: LL[][]; axis: LL[] }
/** Relief schématique de la vue extérieure : sommet, hauteur (m), rayon (NM), falaise claire ou non. */
export type Relief = [number, number, number, number, boolean];

export interface ChartSource {
  key: string; name: string; lat0: number; lon0: number;
  /** Emprise de la grille bathymétrique : latitude min/max, longitude min/max. */
  bbox: [number, number, number, number];
  land: number[][];
  lanes: TssLane[]; zones: TssZone[]; lines: LL[][]; itz: TssZone[]; dw: LL[][];
  /** Zones de prudence (precautionary areas). */
  prec?: TssZone[];
  marks: ChartMark[]; banks: ChartBank[];
  anch?: ChartAnchorage[];
  /** Profondeur de référence hors bancs et hors côte (m), et échelle de remontée vers la côte (NM), modèle schématique. */
  baseDepth: number; coastScale?: number;
  /** Relief : altitude de base des terres (m) et sommets notables. */
  landBase?: number; relief?: Relief[];
  attribution: string;
}

/** Zone de mouillage circulaire (centre, rayon en NM). */
export interface ChartAnchorage { name: string; lat: number; lon: number; r: number; src: string }

/**
 * Ligne décalée de d NM (d > 0 : à droite du sens de parcours) d'une polyligne géographique,
 * en projection équirectangulaire locale (suffisante à l'échelle d'un détroit), avec raccord en onglet.
 */
export function offsetLine(pts: LL[], d: number): LL[] {
  const la0 = pts[0][0], k = Math.cos((la0 * Math.PI) / 180);
  const xy = pts.map(([la, lo]) => [lo * 60 * k, la * 60]);
  const nrm = (i: number): number[] => {
    const a = xy[i], b = xy[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; // normale à droite
  };
  return xy.map((p, i) => {
    let n: number[];
    if (i === 0) n = nrm(0);
    else if (i === xy.length - 1) n = nrm(i - 1);
    else {
      const n1 = nrm(i - 1), n2 = nrm(i), s = [n1[0] + n2[0], n1[1] + n2[1]], c = (s[0] * n1[0] + s[1] * n1[1]) / Math.hypot(...s);
      n = [s[0] / Math.hypot(...s) / c, s[1] / Math.hypot(...s) / c];
    }
    return [(p[1] + n[1] * d) / 60, (p[0] + n[0] * d) / (60 * k)] as LL;
  });
}
/** Zone de séparation de largeur w NM centrée sur une polyligne. */
export const band = (pts: LL[], w: number): LL[] => [...offsetLine(pts, w / 2), ...offsetLine(pts, -w / 2).reverse()];
/** Milieu de deux positions. */
export const mid = (a: LL, b: LL): LL => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
