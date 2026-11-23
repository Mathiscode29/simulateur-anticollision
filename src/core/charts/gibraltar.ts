/**
 * Carte du détroit de Gibraltar — données libres et publiées uniquement.
 *
 * ⚠ Carte d'entraînement SCHÉMATIQUE, NON DESTINÉE À LA NAVIGATION.
 *
 * Sources :
 *  - Trait de côte (Espagne, Gibraltar, Maroc, Ceuta) : © contributeurs OpenStreetMap (ODbL), polygones terrestres
 *    « earth-lands-100m » du projet simonepri/geo-maps v0.6.0, découpés et simplifiés (fichier gibraltar-land.ts).
 *  - Dispositif de séparation du trafic « In the Strait of Gibraltar » : positions officielles (WGS 84, carte de
 *    référence n° 445 de l'Instituto Hidrográfico de la Marina) de l'OMI, COLREG.2/Circ.66, annexe 1, en vigueur le
 *    1er juin 2015 (numéros de position conservés en commentaire). Les zones de séparation (a) et (b) sont définies par
 *    l'OMI comme larges de 0,5 NM et centrées sur une ligne : leurs bords sont calculés ici par décalage de ± 0,25 NM.
 *  - Feux : positions publiées (Wikipedia, d'après les livres des feux NGA Pub. 113 et les autorités de phares).
 *    Les positions marquées `approx: true` sont arrondies à la minute (NGA Pub. 131).
 *  - Bathymétrie : modèle SCHÉMATIQUE (fond de référence de 400 m, remontée régulière vers la côte). Le détroit a
 *    300 à 900 m de profondeur ; aucun haut-fond n'est représenté faute de source libre fiable (les bancs de Tarifa,
 *    dont Los Cabezos, ne figurent pas sur cette carte).
 */
import { GIB_LAND } from './gibraltar-land';
import { P, band, mid, offsetLine, type ChartSource, type LL } from './types';

// ---------- Positions du DST (COLREG.2/Circ.66, annexe 1, WGS 84). Longitudes ouest : degrés négatifs.
const T: Record<string, LL> = {
  p1: P(35, 59.01, -5, 25.68), p2: P(35, 58.36, -5, 28.19),
  p3: P(35, 56.70, -5, 34.71), p4: P(35, 56.21, -5, 36.48), p5: P(35, 56.21, -5, 44.98),
  p6: P(36, 2.80, -5, 19.68),
  p7: P(36, 1.21, -5, 25.68), p8: P(36, 0.35, -5, 28.98),
  p9: P(35, 58.68, -5, 35.44), p10: P(35, 58.41, -5, 36.48), p11: P(35, 58.41, -5, 44.98),
  p12: P(35, 52.51, -5, 44.98), p13: P(35, 53.81, -5, 36.48), p14: P(35, 54.55, -5, 33.90),
  p15: P(35, 56.35, -5, 27.40), p16: P(35, 56.84, -5, 25.68),
  p17: P(35, 58.78, -5, 18.55),
  p18: P(35, 54.45, -5, 25.68), p19: P(35, 54.88, -5, 27.40),
  p20: P(35, 52.87, -5, 36.70), p21: P(35, 52.06, -5, 36.30), p22: P(35, 51.10, -5, 36.20), p23: P(35, 52.18, -5, 34.00),
  p24: P(35, 51.20, -5, 32.40), p25: P(35, 49.09, -5, 44.98),
};
/** Lignes centrales des zones de séparation (a) et (b), parcourues d'est en ouest. */
const A = [T.p1, T.p2], B = [T.p3, T.p4, T.p5];
const aN = offsetLine(A, 0.25), aS = offsetLine(A, -0.25), bN = offsetLine(B, 0.25), bS = offsetLine(B, -0.25);

export const GIBRALTAR: ChartSource = {
  key: 'gib', name: 'Détroit de Gibraltar — DST « In the Strait of Gibraltar »',
  lat0: 36.0, lon0: -5.55,
  bbox: [35.74, 36.22, -5.97, -5.18],
  land: GIB_LAND,
  lanes: [
    // Voie ouest (trafic vers l'Atlantique) : (c) entre (a) et (7)-(8), (d) entre (b) et (9)-(10)-(11).
    { id: 'W', name: 'Voie ouest (vers l\'Atlantique)', polys: [[T.p7, T.p8, aN[1], aN[0]], [T.p9, T.p10, T.p11, bN[2], bN[1], bN[0]]],
      axis: [P(36, 0.6, -5, 19.0), mid(T.p7, aN[0]), mid(T.p8, aN[1]), mid(T.p9, bN[0]), mid(T.p10, bN[1]), mid(T.p11, bN[2]), P(35, 57.3, -5, 52.0)] },
    // Voie est (trafic vers la Méditerranée) : (e) entre (b) et (12)-(13)-(14), (f) entre (a) et (15)-(16).
    { id: 'E', name: 'Voie est (vers la Méditerranée)', polys: [[T.p12, T.p13, T.p14, bS[0], bS[1], bS[2]], [T.p15, T.p16, aS[0], aS[1]]],
      axis: [P(35, 52.6, -5, 52.0), mid(T.p12, bS[2]), mid(T.p13, bS[1]), mid(T.p14, bS[0]), mid(T.p15, aS[1]), mid(T.p16, aS[0]), P(35, 58.2, -5, 19.0)] },
  ],
  zones: [
    { id: 'a', name: 'Zone de séparation (a)', pts: band(A, 0.5) },
    { id: 'b', name: 'Zone de séparation (b)', pts: band(B, 0.5) },
  ],
  lines: [],
  prec: [
    // (g) zone de prudence est : (6), (7), (16), (17).
    { id: 'g', name: 'Zone de prudence est', pts: [T.p6, T.p7, T.p16, T.p17] },
    // (h) zone de prudence de Tanger-Med, avec sens de circulation recommandés : (8), (9), (14), (15).
    { id: 'h', name: 'Zone de prudence de Tanger-Med', pts: [T.p8, T.p9, T.p14, T.p15] },
  ],
  itz: [
    // ZNC nord : entre (7)…(11) et la côte espagnole, limitée par les méridiens de (7) et de (11) ; fermée côté terre.
    { id: 'itzN', name: 'Zone de navigation côtière (Espagne)', pts: [T.p7, T.p8, T.p9, T.p10, T.p11, P(36, 10, -5, 44.98), P(36, 10, -5, 25.68)] },
    // ZNC sud-est : (18), (16), (15), (19).
    { id: 'itzSE', name: 'Zone de navigation côtière (Maroc, est)', pts: [T.p18, T.p16, T.p15, T.p19] },
    // ZNC sud-ouest : (24), (23), (22), (21), (20), (14), (12), (25).
    { id: 'itzSW', name: 'Zone de navigation côtière (Maroc, ouest)', pts: [T.p24, T.p23, T.p22, T.p21, T.p20, T.p14, T.p12, T.p25] },
  ],
  dw: [],
  anch: [{ name: 'Mouillage Alpha', lat: 35 + 51.05 / 60, lon: -(5 + 40.34 / 60), r: 0.4, src: 'COLREG.2/Circ.66, annexe 1' }],
  marks: [
    { id: 'TARIFA', name: 'Tarifa', ...ll(P(36, 0.1, -5, 36.6)), kind: 'lh', light: 'Fl(3) WR 10s', racon: true, range: 26, elev: 41, src: 'NGA Pub. 113 (2021), n° 4116 (W 26 M, R 18 M) ; racon signalé' },
    { id: 'CARNERO', name: 'Punta Carnero', lat: 36.07714, lon: -5.42624, kind: 'lh', light: 'Fl(4)WR 20s', range: 16, elev: 42, src: 'Wikipedia (Faro de Punta Carnero, n° ES-20110)' },
    { id: 'EUROPA', name: 'Europa Point', lat: 36.10963, lon: -5.34480, kind: 'lh', light: 'Iso 10s', range: 18, elev: 49, src: 'Wikipedia / Trinity House (Iso W 10s, 18 M)' },
    { id: 'ALMINA', name: 'Punta Almina', lat: 35.89828, lon: -5.28081, kind: 'lh', light: 'Fl(2) 10s', range: 22, elev: 148, src: 'Wikipedia (liste des phares de Ceuta, d\'après NGA Pub. 113) ; la fiche du phare indique Oc(2) WRG 8s : caractère à vérifier' },
    { id: 'ALGE', name: 'Atterrissage Algeciras', ...ll(P(36, 9.0, -5, 24.1)), kind: 'safe', light: 'Mo(A) 12s', src: 'Imray, ILNW 281/21' },
    // feux de port et phares : NGA Pub. 113 (domaine public) ; feux de port sans portée relevée : 5 M retenus par défaut.
    { id: 'TARE', name: 'Tarifa, môle Est', ...ll(P(36, 0.4, -5, 36.2)), kind: 'port', light: 'Fl G 5s', elev: 11, src: 'NGA Pub. 113 (2021), n° 4124' },
    { id: 'TAR1', name: 'Tarifa, môle n° 1', ...ll(P(36, 0.6, -5, 36.1)), kind: 'port', light: 'Fl(2) R 7s', elev: 7, src: 'NGA Pub. 113 (2021), n° 4120' },
    { id: 'ALGN', name: 'Algeciras, digue N (musoir S)', ...ll(P(36, 7.1, -5, 26.2)), kind: 'port', light: 'Fl(4) G 11s', elev: 5, src: 'NGA Pub. 113 (2021), n° 4132' },
    { id: 'ALGIV', name: 'Algeciras, Isla Verde', ...ll(P(36, 8.0, -5, 25.4)), kind: 'port', light: 'Fl(2+1) G 12s', elev: 6, src: 'NGA Pub. 113 (2021), n° 4140' },
    { id: 'ALGBW', name: 'Algeciras, digue (musoir N)', ...ll(P(36, 8.1, -5, 25.1)), kind: 'port', light: 'Oc(2) R 6s', elev: 11, src: 'NGA Pub. 113 (2021), n° 4139' },
    { id: 'ALGNJ', name: 'Algeciras, jetée N', ...ll(P(36, 8.9, -5, 25.7)), kind: 'port', light: 'Fl R 5s', elev: 11, src: 'NGA Pub. 113 (2021), n° 4136' },
    { id: 'GIBSM', name: 'Gibraltar, South Mole (tête A)', lat: 36.1350, lon: -5.3633, kind: 'port', light: 'Fl 2s', elev: 18, src: 'NGA Pub. 113, n° 4224 (via Wikipedia, liste des phares de Gibraltar)' },
    { id: 'GIBDC', name: 'Gibraltar, môle détaché (tête C)', lat: 36.1433, lon: -5.3667, kind: 'port', light: 'Q G', range: 5, elev: 10, src: 'NGA Pub. 113, n° 4232 (via Wikipedia)' },
    { id: 'GIBND', name: 'Gibraltar, North Mole (tête D)', lat: 36.1450, lon: -5.3650, kind: 'port', light: 'Q R', range: 5, src: 'NGA Pub. 113, n° 4236 (via Wikipedia)' },
    { id: 'CEUW', name: 'Ceuta, digue de Poniente', ...ll(P(35, 53.8, -5, 18.7)), kind: 'port', light: 'Fl G 5s', range: 5, elev: 13, src: 'NGA Pub. 113 (2021), n° 22844' },
    { id: 'CEUE', name: 'Ceuta, digue de Levante', ...ll(P(35, 53.7, -5, 18.5)), kind: 'port', light: 'Fl R 5s', range: 5, elev: 13, src: 'NGA Pub. 113 (2021), n° 22848' },
    { id: 'CIRES', name: 'Punta Cires', ...ll(P(35, 54.4, -5, 28.9)), kind: 'lh', light: 'Fl(3) 12s', range: 18, elev: 44, src: 'NGA Pub. 113 (2021), n° 22864' },
    { id: 'MALAB', name: 'Pointe Malabata', ...ll(P(35, 49.0, -5, 44.9)), kind: 'lh', light: 'Fl 5s', range: 22, elev: 76, src: 'NGA Pub. 113 (2021), n° 22872' },
    { id: 'TNGBW', name: 'Tanger, grande jetée', ...ll(P(35, 47.5, -5, 47.6)), kind: 'port', light: 'Fl(3) 12s', src: 'NGA Pub. 113 (2021), n° 22888' },
    { id: 'TNGSM', name: 'Tanger, môle sud', ...ll(P(35, 47.3, -5, 47.9)), kind: 'port', light: 'Oc R 4s', range: 6, elev: 7, src: 'NGA Pub. 113 (2021), n° 22892' },
    { id: 'SPARTEL', name: 'Cap Spartel', ...ll(P(35, 47.5, -5, 55.4)), kind: 'lh', light: 'Fl(4) 20s', range: 30, elev: 95, src: 'NGA Pub. 113 (2021), n° 22896' },
  ],
  banks: [],
  baseDepth: 400, coastScale: 1.5,
  // relief schématique : Rocher de Gibraltar (426 m), Djebel Moussa (851 m), colline de Punta Carnero (≈ 200 m)
  landBase: 60,
  relief: [[36.1286, -5.3436, 330, 0.35, true], [36.1150, -5.3450, 250, 0.35, true], [35.899, -5.412, 740, 1.1, false], [36.075, -5.44, 140, 0.9, false]],
  attribution: '© contributeurs OpenStreetMap (ODbL) · DST : OMI COLREG.2/Circ.66 · bathymétrie schématique',
};

function ll(p: LL): { lat: number; lon: number } { return { lat: p[0], lon: p[1] }; }
