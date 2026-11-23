/**
 * Le Havre et ses abords : chenal d'accès, avant-port, Port 2000, cap de la Hève, Antifer (carte schématique).
 *
 * Sources :
 *  - trait de côte : © contributeurs OpenStreetMap (ODbL), voir lehavre-land.ts ;
 *  - feux et bouée LHA : NGA Pub. 114 (2016), domaine public ;
 *  - repères de la ville : église Saint-Joseph (107 m, 49°29'27,5"N 0°06'04"E, Wikipedia / Structurae), hôtel de ville (≈ 72 m),
 *    Porte Océane, sémaphore (hauteurs : pss-archi), pont de Normandie (pylônes de 214,77 m, travée de 856 m, Structurae) ;
 *  - Port 2000 : quai du Havre de 4,2 km (HAROPA) ; géométrie des bassins retracée schématiquement.
 * Profondeurs, bouées latérales du chenal, zone d'attente et quartiers sont schématiques (non relevés) : carte non destinée à la navigation.
 */
import type { ChartSource, Landmark, LL, UrbanZone } from './types';
import { P, dm } from './types';
import { LH_LAND } from './lehavre-land';

const ll = (p: LL) => ({ lat: p[0], lon: p[1] });
const N114 = 'NGA Pub. 114 (2016)';

/** Axe du chenal d'accès : bouée LHA → passe entre les musoirs des digues Nord et Sud → avant-port. */
const LH_AXIS: LL[] = [[dm(49, 31.4), -dm(0, 9.9)], [49.4858, 0.0870]];
const LH_INNER: LL[] = [[49.4832, 0.1000]];
/** Accès à Port 2000 : se détache du chenal principal, entre par l'ouest et longe le quai du Havre. */
const P2_AXIS: LL[] = [[49.4985, 0.0200], [49.4638, 0.1030]];
const P2_INNER: LL[] = [[49.4628, 0.1650]];

/** Bouées latérales schématiques du chenal d'accès (tribord vertes au sud, bâbord rouges au nord, en entrant). */
function channelBuoys(): ChartSource['marks'] {
  const out: ChartSource['marks'] = [], [a, b] = LH_AXIS, n = 9;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), la = a[0] + (b[0] - a[0]) * t, lo = a[1] + (b[1] - a[1]) * t;
    // normale à l'axe (≈ 104°) : ± 0,09 NM
    const dLa = (0.09 / 60) * Math.cos((14 * Math.PI) / 180), dLo = (0.09 / 60 / Math.cos((49.5 * Math.PI) / 180)) * Math.sin((14 * Math.PI) / 180);
    out.push({ id: `LHG${i}`, name: `LH ${2 * i - 1}`, lat: la - dLa, lon: lo - dLo, kind: 'lg', light: 'Fl G 4s', approx: true, src: 'balisage latéral schématique (positions non relevées)' });
    out.push({ id: `LHR${i}`, name: `LH ${2 * i}`, lat: la + dLa, lon: lo + dLo, kind: 'lr', light: 'Fl R 4s', approx: true, src: 'balisage latéral schématique (positions non relevées)' });
  }
  return out;
}

/** Portiques à conteneurs le long du quai du Havre (Port 2000), flèche relevée vers le bassin. */
function cranes(): Landmark[] {
  const out: Landmark[] = [];
  for (let lo = 0.1150, i = 0; lo < 0.1680; lo += 0.0019, i++) {
    if (i % 4 === 3) continue; // postes sans portique
    out.push({ name: 'Portique', lat: 49.4660, lon: lo, kind: 'crane', w: 30, d: 30, h: 76, col: i % 2 ? '#2f6fa8' : '#d9d6cc', src: 'schématique' });
  }
  return out;
}

const URBAN: UrbanZone[] = [
  { name: 'Centre reconstruit (Perret)', pts: [[49.4880, 0.0955], [49.4872, 0.1150], [49.4985, 0.1160], [49.4985, 0.0960]], h: [14, 26], step: 100, col: '#d4cdbb' },
  { name: 'Quartiers est', pts: [[49.4880, 0.1150], [49.4862, 0.1600], [49.5050, 0.1600], [49.4990, 0.1150]], h: [9, 18], step: 140, col: '#cbbfa8' },
  { name: 'Sainte-Adresse', pts: [[49.4990, 0.0800], [49.4985, 0.0960], [49.5110, 0.1000], [49.5110, 0.0820]], h: [8, 14], step: 120, col: '#ddd4c2' },
  { name: 'Zone portuaire', pts: [[49.4670, 0.1150], [49.4668, 0.1700], [49.4760, 0.2000], [49.4780, 0.1300]], h: [10, 22], step: 230, col: '#b9b4a8' },
];

const LANDMARKS: Landmark[] = [
  { name: 'Église Saint-Joseph (tour-lanterne)', lat: 49.49097, lon: 0.10111, kind: 'tower', w: 20, d: 20, h: 107, col: '#cfc7b4', src: 'Wikipedia / Structurae (107 m)' },
  { name: 'Église Saint-Joseph (nef)', lat: 49.49097, lon: 0.10111, kind: 'bld', w: 48, d: 48, h: 24, col: '#cfc7b4', src: 'Wikipedia' },
  { name: 'Hôtel de ville (tour)', lat: 49.4935, lon: 0.1073, kind: 'tower', w: 24, d: 16, h: 72, col: '#d6d0c0', approx: true, src: 'pss-archi / Skyscraper Center (72 m) ; position approchée' },
  { name: 'Hôtel de ville (aile)', lat: 49.4932, lon: 0.1073, kind: 'bld', w: 140, d: 22, h: 15, rot: 90, col: '#d6d0c0', approx: true, src: 'position approchée' },
  { name: 'Porte Océane nord', lat: 49.4953, lon: 0.0962, kind: 'tower', w: 30, d: 16, h: 47.5, col: '#d8d2c2', approx: true, src: 'pss-archi (47,5 m) ; position approchée' },
  { name: 'Porte Océane sud', lat: 49.4938, lon: 0.0962, kind: 'tower', w: 30, d: 16, h: 47.5, col: '#d8d2c2', approx: true, src: 'pss-archi (47,5 m) ; position approchée' },
  { name: 'Sémaphore', lat: 49.4878, lon: 0.0925, kind: 'tower', w: 10, d: 10, h: 53, col: '#e8e6e0', approx: true, src: 'pss-archi (53 m) ; position approchée' },
  { name: 'Feu d\'alignement postérieur', lat: dm(49, 28.7), lon: dm(0, 7.6), kind: 'tower', w: 6, d: 6, h: 78, col: '#e8e6e0', src: `${N114}, n° 8636` },
  { name: 'Pont de Normandie, pylône nord', lat: 49.4397, lon: 0.2740, kind: 'pylon', w: 14, d: 22, h: 214.8, col: '#d9d7d0', src: 'Structurae (214,77 m, travée de 856 m)' },
  { name: 'Pont de Normandie, pylône sud', lat: 49.4320, lon: 0.2749, kind: 'pylon', w: 14, d: 22, h: 214.8, col: '#d9d7d0', src: 'Structurae' },
  { name: 'Pont de Normandie, tablier', lat: 49.4358, lon: 0.2744, kind: 'deck', w: 1400, d: 24, h: 4, z0: 58, rot: 5, col: '#c9c6bd', src: 'Structurae (longueur 2 141 m, tirant d\'air 53 m)' },
  // dépôt pétrolier (CIM) : réservoirs schématiques
  ...[0.122, 0.128, 0.134, 0.140, 0.146].flatMap((lo, i) => [0, 1].map((k) => ({ name: 'Réservoir', lat: 49.4705 + k * 0.0012, lon: lo + (k ? 0.002 : 0), kind: 'tank' as const, w: 60, d: 60, h: 18 + (i % 2) * 4, col: '#e1ddd2', src: 'schématique' }))),
  ...cranes(),
];

export const LE_HAVRE: ChartSource = {
  key: 'lh', name: 'Le Havre et ses abords (chenal, avant-port, Port 2000)',
  lat0: 49.5, lon0: 0.05,
  bbox: [49.36, 49.74, -0.22, 0.32],
  gridStep: 0.04,
  land: LH_LAND,
  lanes: [], zones: [], lines: [], itz: [], dw: [],
  fairways: [
    { id: 'LH', name: 'Chenal d\'accès du Havre', axis: LH_AXIS, inner: LH_INNER, width: 0.16, depth: 17.5, src: 'axe LHA – musoirs (NGA Pub. 114) ; largeur et profondeur schématiques' },
    { id: 'P2', name: 'Accès à Port 2000', axis: P2_AXIS, inner: P2_INNER, width: 0.14, depth: 17.5, src: 'schématique' },
  ],
  dredged: [
    { name: 'Avant-port', pts: [[49.4867, 0.0870], [49.4867, 0.0935], [49.4860, 0.0990], [49.4842, 0.1045], [49.4822, 0.1082], [49.4805, 0.1085], [49.4797, 0.1062], [49.4812, 0.1000], [49.4832, 0.0950], [49.4849, 0.0915], [49.4850, 0.0870]], depth: 16, src: 'schématique' },
    { name: 'Bassin Théophile-Ducrocq', pts: [[49.4806, 0.1028], [49.4797, 0.1062], [49.4800, 0.1140], [49.4812, 0.1250], [49.4838, 0.1262], [49.4842, 0.1170], [49.4826, 0.1090], [49.4818, 0.1040]], depth: 14, src: 'schématique' },
    { name: 'Port 2000', pts: [[49.4668, 0.1000], [49.4665, 0.1062], [49.4655, 0.1120], [49.4652, 0.1700], [49.4630, 0.1712], [49.4603, 0.1700], [49.4603, 0.1120], [49.4610, 0.1062], [49.4612, 0.1000]], depth: 17.5, src: 'schématique' },
  ],
  marks: [
    { id: 'LHA', name: 'LHA', ...ll(P(49, 31.4, -0, 9.9)), lon: -dm(0, 9.9), kind: 'safe', light: 'Mo(A) 12s', src: `${N114}, n° 8608` },
    { id: 'HEVE', name: 'Cap de la Hève', ...ll(P(49, 30.7, 0, 4.2)), kind: 'lh', light: 'Fl 5s', range: 24, elev: 123, src: `${N114}, n° 8628 ; portée retenue 24 M (à vérifier)` },
    { id: 'LHDN', name: 'Le Havre, digue Nord', ...ll(P(49, 29.2, 0, 5.4)), kind: 'port', light: 'Fl R 5s', elev: 15, src: `${N114}, n° 8648` },
    { id: 'LHDS', name: 'Le Havre, digue Sud', ...ll(P(49, 29.1, 0, 5.4)), kind: 'port', light: 'VQ(3) G 2s', elev: 15, src: `${N114}, n° 8656` },
    { id: 'LHBN', name: 'Bassin Théophile-Ducrocq, môle N', ...ll(P(49, 28.8, 0, 6.3)), kind: 'port', light: 'Oc(2) R 6s', elev: 7, src: `${N114}, n° 8660` },
    { id: 'LHBS', name: 'Bassin Théophile-Ducrocq, môle S', ...ll(P(49, 28.8, 0, 6.2)), kind: 'port', light: 'Oc(2) G 6s', elev: 7, src: `${N114}, n° 8664` },
    { id: 'LHAF', name: 'Alignement du quai d\'escale, antérieur', ...ll(P(49, 28.9, 0, 6.5)), kind: 'port', light: 'F W', elev: 36, range: 10, src: `${N114}, n° 8632` },
    { id: 'LHAR', name: 'Alignement du quai d\'escale, postérieur', ...ll(P(49, 28.7, 0, 7.6)), kind: 'port', light: 'F W', elev: 78, range: 10, src: `${N114}, n° 8636` },
    { id: 'ANTDG', name: 'Antifer, digue principale', ...ll(P(49, 39.7, 0, 7.1)), kind: 'port', light: 'Q R', elev: 20, src: `${N114}, n° 8708` },
    { id: 'ANTIF', name: 'Cap d\'Antifer', ...ll(P(49, 41.0, 0, 9.9)), kind: 'lh', light: 'Fl 20s', range: 22, elev: 128, src: `${N114}, n° 8740 ; portée retenue 22 M (à vérifier)` },
    ...channelBuoys(),
  ],
  banks: [
    { name: 'Hauts-fonds de l\'estuaire (schématique)', lat: 49.443, lon: 0.165, len: 7, wid: 1.4, orient: 75, min: 3, src: 'schématique (estuaire de la Seine)' },
  ],
  anch: [{ name: 'Zone d\'attente (indicative)', lat: 49.548, lon: -0.045, r: 1.0, src: 'position indicative, non relevée' }],
  baseDepth: 22, coastScale: 1.0,
  landBase: 5,
  relief: [
    [49.512, 0.071, 95, 0.55, true], // falaises du cap de la Hève
    [49.516, 0.090, 60, 0.5, false], // coteau de Sainte-Adresse
    [49.540, 0.140, 95, 1.6, false], // rebord du plateau de Caux au nord de la ville
    [49.680, 0.160, 90, 3.0, true], // falaises d'Antifer
    [49.408, 0.232, 100, 1.2, false], // côte de Grâce (Honfleur)
  ],
  urban: URBAN,
  landmarks: LANDMARKS,
  attribution: '© contributeurs OpenStreetMap (ODbL) · feux : NGA Pub. 114 · port, profondeurs et ville schématiques',
};
