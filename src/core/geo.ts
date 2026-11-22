/**
 * Géoréférencement WGS 84 du repère local de simulation.
 *
 * Le moteur travaille dans un plan local (x = est, y = nord, en milles nautiques) autour d'une origine
 * (lat0, lon0) propre à chaque carte. La projection est équirectangulaire à la latitude de l'origine :
 *   x = (lon − lon0) · 60 · cos(lat0)      y = (lat − lat0) · 60
 * Sur l'emprise du Pas-de-Calais (± 25 NM autour de 51°N), l'erreur d'échelle reste inférieure à 0,5 %,
 * suffisante pour un simulateur d'entraînement (et sans effet sur la cinématique relative, calculée dans le plan).
 */
import { D2R } from './util';

export interface GeoRef { lat0: number; lon0: number }

/** Origine courante (mise à jour au chargement d'une carte). */
export const GEO: GeoRef = { lat0: 47.5, lon0: -6.5 };

export function setGeoRef(lat0: number, lon0: number): void {
  GEO.lat0 = lat0; GEO.lon0 = lon0;
}

const kx = (r: GeoRef) => 60 * Math.cos(r.lat0 * D2R);

/** Latitude / longitude (degrés décimaux) → plan local (NM). */
export function toXY(lat: number, lon: number, r: GeoRef = GEO): { x: number; y: number } {
  return { x: (lon - r.lon0) * kx(r), y: (lat - r.lat0) * 60 };
}

/** Plan local (NM) → latitude / longitude (degrés décimaux). */
export function toLL(x: number, y: number, r: GeoRef = GEO): { lat: number; lon: number } {
  return { lat: r.lat0 + y / 60, lon: r.lon0 + x / kx(r) };
}

function dmText(v: number, degW: number, pos: string, neg: string): string {
  const a = Math.abs(v);
  let d = Math.floor(a), m = (a - d) * 60;
  if (m >= 59.9995) { d++; m = 0; }
  return `${String(d).padStart(degW, '0')}°${m.toFixed(3).padStart(6, '0').replace('.', ',')}'${v >= 0 ? pos : neg}`;
}

/** Latitude au format marin : 51°02,345'N. */
export const fmtLat = (lat: number): string => dmText(lat, 2, 'N', 'S');
/** Longitude au format marin : 001°23,456'E. */
export const fmtLon = (lon: number): string => dmText(lon, 3, 'E', 'W');

/** Position courante au format marin, à partir du plan local. */
export function fmtPos(x: number, y: number): string {
  const p = toLL(x, y);
  return `${fmtLat(p.lat)} ${fmtLon(p.lon)}`;
}
