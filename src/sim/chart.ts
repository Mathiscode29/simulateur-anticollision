/**
 * Carte côté simulation (sans DOM) : géométrie en plan local, bathymétrie schématique, zones du DST,
 * requêtes de profondeur, d'appartenance aux voies et lancer de rayons pour les échos de côte.
 *
 * Cartes :
 *  - « open » : zone d'entraînement au large (eau profonde, sans terre), utilisée par les exercices historiques ;
 *  - « pdc »  : Pas-de-Calais (voir src/core/charts/pasdecalais.ts pour les sources et les limites) ;
 *  - « gib »  : détroit de Gibraltar (voir src/core/charts/gibraltar.ts).
 */
import { PAS_DE_CALAIS } from '../core/charts/pasdecalais';
import { GIBRALTAR } from '../core/charts/gibraltar';
import type { ChartBank, ChartMark, ChartSource, Relief } from '../core/charts/types';
import { setGeoRef, toXY } from '../core/geo';
import { brgOf, clamp, vec } from '../core/util';

export type ChartKey = 'open' | 'pdc' | 'gib';
export interface XY { x: number; y: number }
export interface LaneG { id: string; name: string; polys: XY[][]; axis: XY[] }
export interface AnchG { name: string; x: number; y: number; r: number }
export interface ZoneG { id: string; name: string; poly: XY[] }
export interface Grid { x0: number; y0: number; dx: number; nx: number; ny: number; d: Float32Array }

export interface Chart {
  key: ChartKey; name: string; lat0: number; lon0: number;
  land: XY[][]; lanes: LaneG[]; zones: ZoneG[]; lines: XY[][]; itz: ZoneG[]; dw: XY[][]; prec: ZoneG[]; anch: AnchG[];
  marks: (ChartMark & XY)[]; banks: (ChartBank & XY)[];
  /** Relief de la vue extérieure (plan local) : altitude de base et sommets. */
  landBase: number; relief: { x: number; y: number; h: number; r: number; cliff: boolean }[];
  grid: Grid | null;
  /** Segments de côte (x1, y1, x2, y2) pour le lancer de rayons. */
  edges: Float64Array;
  /** Profondeur hors grille (m). */
  deep: number;
  attribution: string;
}

/** Zone d'entraînement au large : 47°30'N 006°30'W, plus de 2 000 m d'eau (pas de terre). */
const OPEN: Chart = {
  key: 'open', name: 'Zone d\'entraînement au large (eau profonde)', lat0: 47.5, lon0: -6.5,
  land: [], lanes: [], zones: [], lines: [], itz: [], dw: [], prec: [], anch: [], marks: [], banks: [], grid: null, landBase: 18, relief: [],
  edges: new Float64Array(0), deep: 2000, attribution: 'Zone d\'entraînement fictive en eau profonde',
};

const SOURCES: Record<Exclude<ChartKey, 'open'>, ChartSource> = { pdc: PAS_DE_CALAIS, gib: GIBRALTAR };
const cache: Partial<Record<ChartKey, Chart>> = { open: OPEN };
/** Carte courante. */
export let CHART: Chart = OPEN;

export function loadChart(key: ChartKey): Chart {
  const c = cache[key] ?? (cache[key] = compile(SOURCES[key as Exclude<ChartKey, 'open'>]));
  setGeoRef(c.lat0, c.lon0);
  CHART = c;
  return c;
}

const llxy = (p: [number, number]): XY => toXY(p[0], p[1], ref);
let ref = { lat0: 0, lon0: 0 };

function compile(s: ChartSource): Chart {
  ref = { lat0: s.lat0, lon0: s.lon0 };
  const land = s.land.map((r) => { const o: XY[] = []; for (let i = 0; i < r.length; i += 2) o.push(toXY(r[i + 1], r[i], ref)); return o; });
  const e: number[] = [];
  for (const r of land) for (let i = 0; i < r.length - 1; i++) e.push(r[i].x, r[i].y, r[i + 1].x, r[i + 1].y);
  const c: Chart = {
    key: s.key as ChartKey, name: s.name, lat0: s.lat0, lon0: s.lon0, land,
    lanes: s.lanes.map((l) => ({ id: l.id, name: l.name, polys: l.polys.map((p) => p.map(llxy)), axis: l.axis.map(llxy) })),
    prec: (s.prec ?? []).map((z) => ({ id: z.id, name: z.name, poly: z.pts.map(llxy) })),
    anch: (s.anch ?? []).map((a) => ({ name: a.name, r: a.r, ...toXY(a.lat, a.lon, ref) })),
    landBase: s.landBase ?? 18,
    relief: (s.relief ?? []).map(([la, lo, h, r, cliff]: Relief) => ({ ...toXY(la, lo, ref), h, r, cliff })),
    zones: s.zones.map((z) => ({ id: z.id, name: z.name, poly: z.pts.map(llxy) })),
    lines: s.lines.map((l) => l.map(llxy)), itz: s.itz.map((z) => ({ id: z.id, name: z.name, poly: z.pts.map(llxy) })),
    dw: s.dw.map((l) => l.map(llxy)),
    marks: s.marks.map((m) => ({ ...m, ...toXY(m.lat, m.lon, ref) })),
    banks: s.banks.map((b) => ({ ...b, ...toXY(b.lat, b.lon, ref) })),
    grid: null, edges: Float64Array.from(e), deep: s.baseDepth, attribution: s.attribution,
  };
  c.grid = buildGrid(c, s);
  return c;
}

// ---------------------------------------------------------------- géométrie

export function inPoly(p: XY[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Point le plus proche sur une polyligne : indice du segment, abscisse projetée, distance signée (+ = droite du sens). */
export function projOnPolyline(pl: XY[], x: number, y: number): { i: number; t: number; d: number; brg: number; s: number } {
  let best = { i: 0, t: 0, d: Infinity, brg: 0, s: 0 }, acc = 0;
  for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1], lx = b.x - a.x, ly = b.y - a.y, L = Math.hypot(lx, ly) || 1e-9;
    const t = clamp(((x - a.x) * lx + (y - a.y) * ly) / (L * L), 0, 1);
    const qx = a.x + lx * t, qy = a.y + ly * t, dd = Math.hypot(x - qx, y - qy);
    if (dd < Math.abs(best.d)) {
      const side = Math.sign(ly * (x - a.x) - lx * (y - a.y)) || 1; // > 0 : à droite du segment
      best = { i, t, d: side * dd, brg: brgOf(lx, ly), s: acc + t * L };
    }
    acc += L;
  }
  return best;
}

/** Point de la polyligne à l'abscisse curviligne s (NM). */
export function pointAt(pl: XY[], s: number): XY & { brg: number } {
  let acc = 0;
  for (let i = 0; i < pl.length - 1; i++) {
    const a = pl[i], b = pl[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= acc + L || i === pl.length - 2) {
      const t = L > 0 ? (s - acc) / L : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, brg: brgOf(b.x - a.x, b.y - a.y) };
    }
    acc += L;
  }
  return { ...pl[0], brg: 0 };
}

export function polyLength(pl: XY[]): number {
  let L = 0;
  for (let i = 0; i < pl.length - 1; i++) L += Math.hypot(pl[i + 1].x - pl[i].x, pl[i + 1].y - pl[i].y);
  return L;
}

// ---------------------------------------------------------------- bathymétrie schématique

const LAND_D = -10;

/**
 * Grille de profondeur (pas 0,2 NM) :
 *  - terre (remplissage des polygones par balayage de lignes) ;
 *  - remontée vers la côte : d = fond · (1 − e^(−distance / échelle)), échelle propre à la carte (1,2 NM par défaut),
 *    distance par transformée de chanfrein ;
 *  - bancs en « gélule » : profondeur minimale sur l'axe, remontée lissée sur 0,9 NM de part et d'autre.
 */
function buildGrid(c: Chart, s: ChartSource): Grid {
  const [la0, la1, lo0, lo1] = s.bbox, a = toXY(la0, lo0, ref), b = toXY(la1, lo1, ref), dx = 0.2;
  const nx = Math.ceil((b.x - a.x) / dx) + 1, ny = Math.ceil((b.y - a.y) / dx) + 1;
  const N = nx * ny, dist = new Float32Array(N).fill(1e9), d = new Float32Array(N);
  // terre : balayage ligne par ligne
  for (let j = 0; j < ny; j++) {
    const y = a.y + j * dx, xs: number[] = [];
    for (const r of c.land) for (let i = 0, k = r.length - 1; i < r.length; k = i++) {
      const p = r[i], q = r[k];
      if ((p.y > y) !== (q.y > y)) xs.push(p.x + ((y - p.y) * (q.x - p.x)) / (q.y - p.y));
    }
    xs.sort((u, v) => u - v);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const i0 = Math.max(0, Math.ceil((xs[m] - a.x) / dx)), i1 = Math.min(nx - 1, Math.floor((xs[m + 1] - a.x) / dx));
      for (let i = i0; i <= i1; i++) dist[j * nx + i] = 0;
    }
  }
  // distance à la terre (chanfrein 3-4, en mailles)
  const S2 = Math.SQRT2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let v = dist[k];
    if (i > 0) v = Math.min(v, dist[k - 1] + 1);
    if (j > 0) { v = Math.min(v, dist[k - nx] + 1); if (i > 0) v = Math.min(v, dist[k - nx - 1] + S2); if (i < nx - 1) v = Math.min(v, dist[k - nx + 1] + S2); }
    dist[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let v = dist[k];
    if (i < nx - 1) v = Math.min(v, dist[k + 1] + 1);
    if (j < ny - 1) { v = Math.min(v, dist[k + nx] + 1); if (i < nx - 1) v = Math.min(v, dist[k + nx + 1] + S2); if (i > 0) v = Math.min(v, dist[k + nx - 1] + S2); }
    dist[k] = v;
  }
  const base = s.baseDepth, sc = s.coastScale ?? 1.2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (dist[k] === 0) { d[k] = LAND_D; continue; }
    const x = a.x + i * dx, y = a.y + j * dx;
    let v = base * (1 - Math.exp(-(dist[k] * dx) / sc));
    for (const bk of c.banks) v = Math.min(v, bankDepth(bk, x, y, base));
    d[k] = v;
  }
  return { x0: a.x, y0: a.y, dx, nx, ny, d };
}

function bankDepth(b: ChartBank & XY, x: number, y: number, base: number): number {
  const u = Math.sin((b.orient * Math.PI) / 180), v = Math.cos((b.orient * Math.PI) / 180);
  const px = x - b.x, py = y - b.y, half = Math.max(0, b.len / 2 - b.wid / 2);
  const along = clamp(px * u + py * v, -half, half);
  const s = Math.hypot(px - along * u, py - along * v) - b.wid / 2;
  if (s <= 0) return b.min;
  const f = clamp(s / 0.9, 0, 1), sm = f * f * (3 - 2 * f);
  return b.min + (base - b.min) * sm;
}

/** Profondeur (m) au point ; négative sur l'estran et à terre. */
export function depthAt(x: number, y: number, c: Chart = CHART): number {
  const g = c.grid;
  if (!g) return c.deep;
  const fx = (x - g.x0) / g.dx, fy = (y - g.y0) / g.dx;
  if (fx < 0 || fy < 0 || fx >= g.nx - 1 || fy >= g.ny - 1) return c.deep;
  const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * g.nx + i;
  const a = g.d[k], b = g.d[k + 1], cc = g.d[k + g.nx], dd = g.d[k + g.nx + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty;
}

/** Vrai si le point est à terre (polygones OSM). */
export function onLand(x: number, y: number, c: Chart = CHART): boolean {
  return c.land.some((r) => inPoly(r, x, y));
}

/**
 * Isobathes par la méthode des carrés marchants : segments [x1, y1, x2, y2] (NM) pour chaque niveau.
 */
export function contours(level: number, c: Chart = CHART): number[] {
  const g = c.grid, out: number[] = [];
  if (!g) return out;
  const { nx, ny, dx, x0, y0, d } = g;
  const lerp = (a: number, b: number) => (level - a) / (b - a);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k = j * nx + i, v0 = d[k], v1 = d[k + 1], v2 = d[k + nx + 1], v3 = d[k + nx];
    const idx = (v0 < level ? 1 : 0) | (v1 < level ? 2 : 0) | (v2 < level ? 4 : 0) | (v3 < level ? 8 : 0);
    if (idx === 0 || idx === 15) continue;
    const x = x0 + i * dx, y = y0 + j * dx;
    const B = [x + lerp(v0, v1) * dx, y], R = [x + dx, y + lerp(v1, v2) * dx], T = [x + lerp(v3, v2) * dx, y + dx], L = [x, y + lerp(v0, v3) * dx];
    const seg = (p: number[], q: number[]) => out.push(p[0], p[1], q[0], q[1]);
    switch (idx) {
      case 1: case 14: seg(L, B); break;
      case 2: case 13: seg(B, R); break;
      case 3: case 12: seg(L, R); break;
      case 4: case 11: seg(R, T); break;
      case 6: case 9: seg(B, T); break;
      case 7: case 8: seg(L, T); break;
      case 5: seg(L, T); seg(B, R); break;
      case 10: seg(L, B); seg(R, T); break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- dispositif de séparation du trafic

/** Voie : `lane` + identifiant de la voie (laneNE, laneSW au Pas-de-Calais ; laneW, laneE à Gibraltar). */
export type TssKind = 'none' | 'sep' | 'itz' | 'prec' | `lane${string}`;
export interface TssInfo { kind: TssKind; name: string; dir: number | null; lane: LaneG | null }
export const isLane = (k: string): boolean => k.startsWith('lane');

/** Élément du DST au point (zone de séparation prioritaire, puis voies, zones de prudence, zones de navigation côtière). */
export function tssAt(x: number, y: number, c: Chart = CHART): TssInfo {
  for (const z of c.zones) if (inPoly(z.poly, x, y)) return { kind: 'sep', name: z.name, dir: null, lane: null };
  for (const l of c.lanes) if (l.polys.some((p) => inPoly(p, x, y))) {
    return { kind: `lane${l.id}`, name: l.name, dir: projOnPolyline(l.axis, x, y).brg, lane: l };
  }
  for (const z of c.prec) if (inPoly(z.poly, x, y)) return { kind: 'prec', name: z.name, dir: null, lane: null };
  for (const z of c.itz) if (inPoly(z.poly, x, y)) return { kind: 'itz', name: z.name, dir: null, lane: null };
  return { kind: 'none', name: c.lanes.length ? 'Hors DST' : 'Large', dir: null, lane: null };
}

export const laneOf = (id: string, c: Chart = CHART): LaneG | undefined => c.lanes.find((l) => l.id === id);

/**
 * Cap de consigne d'un navire qui suit une voie : poursuite d'un point situé 1,5 NM plus loin sur l'axe,
 * décalé latéralement de `off` (NM, + = tribord du sens de la voie). dir = −1 : remontée à contresens.
 */
export function laneSteer(l: LaneG, x: number, y: number, off: number, dir: 1 | -1): number {
  const p = projOnPolyline(l.axis, x, y), L = polyLength(l.axis);
  // au-delà d'une extrémité de l'axe, le point visé est prolongé dans l'alignement du dernier tronçon (pas de demi-tour)
  const A = l.axis, n = A.length, A0 = A[0], A1 = A[1], B0 = A[n - 2], B1 = A[n - 1];
  const l0 = Math.hypot(A1.x - A0.x, A1.y - A0.y) || 1, l1 = Math.hypot(B1.x - B0.x, B1.y - B0.y) || 1;
  const bs = ((x - A0.x) * (A1.x - A0.x) + (y - A0.y) * (A1.y - A0.y)) / l0, be = ((x - B1.x) * (B1.x - B0.x) + (y - B1.y) * (B1.y - B0.y)) / l1;
  const s0 = be > 0 && p.s >= L - 1e-6 ? L + be : bs < 0 && p.s <= 1e-6 ? bs : p.s;
  const sv = s0 + dir * 1.5, q = pointAt(A, clamp(sv, 0, L)), ex = sv > L ? sv - L : sv < 0 ? sv : 0;
  if (ex !== 0) { const u = vec(q.brg, ex); q.x += u.x; q.y += u.y; }
  const nb = (q.brg + 90) * (Math.PI / 180), c = CHART, inLane = (u: number, v: number) => l.polys.some((pl) => inPoly(pl, u, v));
  // point acceptable : dans la voie, ou dans une zone de prudence, mais jamais dans une zone de séparation ni côtière
  const okAt = (u: number, v: number) => !c.zones.some((z) => inPoly(z.poly, u, v)) && !c.itz.some((z) => inPoly(z.poly, u, v))
    && (inLane(u, v) || c.prec.some((z) => inPoly(z.poly, u, v)) || !inLane(q.x, q.y));
  // voie qui se rétrécit (Gibraltar) : le décalage latéral est réduit pour garder 0,3 NM de marge
  // dans une zone de prudence (jonction des tronçons d'une voie), le flux se resserre sur l'axe
  let o = inLane(q.x, q.y) || !c.prec.some((z) => inPoly(z.poly, q.x, q.y)) ? off : clamp(off, -0.4, 0.4);
  const m = (v: number) => v + Math.sign(v) * 0.3;
  const okPath = (v: number) => { const u = q.x + Math.sin(nb) * m(v), w = q.y + Math.cos(nb) * m(v); return okAt(u, w) && okAt((u + x) / 2, (w + y) / 2); };
  for (let k = 0; k < 4 && o !== 0 && !okPath(o); k++) o = Math.abs(o) < 0.2 ? 0 : o * 0.5;
  const tx = q.x + Math.sin(nb) * o, ty = q.y + Math.cos(nb) * o;
  return brgOf(tx - x, ty - y);
}

// ---------------------------------------------------------------- radar : lancer de rayons sur la côte

export const NRAYS = 720;

/**
 * Pour chaque relèvement (pas de 0,5°) : distance de la première entrée à terre (r0) et de la sortie suivante (r1).
 * Tout ce qui se trouve au-delà de r0 est masqué par la terre (pas d'écho derrière le relief).
 */
export function coastRays(ox: number, oy: number, c: Chart = CHART): { r0: Float32Array; r1: Float32Array } {
  const r0 = new Float32Array(NRAYS).fill(Infinity), r1 = new Float32Array(NRAYS).fill(Infinity), e = c.edges;
  const step = 360 / NRAYS;
  for (let k = 0; k < e.length; k += 4) {
    const ax = e[k] - ox, ay = e[k + 1] - oy, bx = e[k + 2] - ox, by = e[k + 3] - oy;
    let b1 = brgOf(ax, ay), b2 = brgOf(bx, by);
    let span = ((b2 - b1 + 540) % 360) - 180;
    if (span < 0) { const t = b1; b1 = b2; b2 = t; span = -span; }
    const i0 = Math.ceil(b1 / step), i1 = Math.floor((b1 + span) / step);
    for (let ii = i0; ii <= i1; ii++) {
      const i = ((ii % NRAYS) + NRAYS) % NRAYS, th = (i * step * Math.PI) / 180, ux = Math.sin(th), uy = Math.cos(th);
      // intersection du rayon (t·u) et du segment a + s·(b − a)
      const sx = bx - ax, sy = by - ay, den = ux * sy - uy * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = (ax * sy - ay * sx) / den;
      if (t <= 0) continue;
      if (t < r0[i]) { r1[i] = r0[i]; r0[i] = t; } else if (t < r1[i]) r1[i] = t;
    }
  }
  return { r0, r1 };
}

export const rayIndex = (b: number): number => ((Math.round(b / (360 / NRAYS)) % NRAYS) + NRAYS) % NRAYS;

// ---------------------------------------------------------------- vérification de route

export interface RouteIssue { leg: number; x: number; y: number; depth: number }

/** Contrôle d'une route : points où la profondeur est inférieure au contour de sécurité (pas de 0,1 NM). */
export function checkRoute(wps: XY[], safety: number, c: Chart = CHART): RouteIssue[] {
  const out: RouteIssue[] = [];
  for (let i = 0; i < wps.length - 1; i++) {
    const a = wps[i], b = wps[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / 0.1));
    let last = -1;
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n, dp = depthAt(x, y, c);
      if (dp < safety && k - last > 5) { out.push({ leg: i + 1, x, y, depth: dp }); last = k; }
    }
  }
  return out;
}
