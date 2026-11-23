/**
 * Carte du Pas-de-Calais (détroit de Douvres) — données libres et publiées uniquement.
 *
 * ⚠ Carte d'entraînement SCHÉMATIQUE, NON DESTINÉE À LA NAVIGATION.
 *
 * Sources :
 *  - Trait de côte : © contributeurs OpenStreetMap (ODbL), polygones terrestres « earth-lands-100m » du projet
 *    simonepri/geo-maps v0.6.0 (dérivés d'OSM), découpés et simplifiés (résolution effective ≈ 0,5 à 1 km).
 *  - Dispositif de séparation du trafic « In the Strait of Dover and adjacent waters » : positions officielles
 *    (WGS 84) de l'OMI, COLREG.2/Circ.59, annexe 8 (numéros de position conservés en commentaire).
 *  - Bouées et bateaux-feux : positions publiées (MGN 364 Amendment 2, MAIB, NGA Pub. 114 et Pub. 191,
 *    Trinity House). Les positions marquées `approx: true` sont seulement indicatives (arrondies à la minute
 *    ou estimées) : elles ne sont pas présentées comme mesurées.
 *  - Bancs : emprises SCHÉMATIQUES (ellipses) d'après les descriptions des Instructions nautiques (NGA Pub. 191,
 *    sea-seek) et l'évaluation hydrographique DS1 (tête nord du Colbart). Profondeurs minimales indicatives.
 *  - Bathymétrie hors bancs : modèle schématique (fond de 45 m, remontée régulière vers la côte). Les isobathes
 *    10, 20 et 30 m qui en découlent sont des illustrations pédagogiques, pas des données hydrographiques.
 */
import { PDC_LAND } from './pasdecalais-land';

import { P, dm, type ChartSource, type LL } from './types';
export type { ChartBank, ChartMark, ChartSource, MarkKind } from './types';

// ---------- Positions du DST (COLREG.2/Circ.59, annexe 8, WGS 84)
const T: Record<string, LL> = {
  p6: P(51, 22.83, 2, 12.29), p7: P(51, 22.03, 1, 58.39), p8: P(51, 22.49, 1, 57.61), p9: P(51, 16.53, 1, 52.29),
  p11: P(51, 6.13, 1, 38.10),
  p12: P(51, 5.77, 1, 38.65), p13: P(51, 6.49, 1, 37.55), p14: P(50, 57.59, 1, 23.00), p15: P(50, 51.14, 1, 17.20),
  p16: P(50, 33.37, 0, 36.50), p19: P(50, 32.71, 0, 57.73), p20: P(50, 42.87, 1, 18.30), p21: P(50, 56.87, 1, 24.03),
  p23: P(51, 27.35, 1, 52.76), p24: P(51, 14.13, 1, 43.99), p25: P(51, 6.93, 1, 30.90), p26: P(50, 52.29, 1, 2.65),
  p39: P(50, 39.49, 1, 22.40), p40: P(50, 44.54, 1, 26.90), p41: P(50, 53.64, 1, 30.70), p42: P(51, 4.34, 1, 45.89),
  p44: P(51, 6.44, 1, 48.89), p45: P(51, 11.23, 2, 4.09), p46: P(51, 9.84, 2, 3.12),
  p48: P(51, 18.43, 2, 4.69), p49: P(51, 16.03, 2, 4.19), p50: P(51, 13.71, 2, 0.99), p51: P(51, 9.35, 1, 47.10),
  p52: P(51, 9.75, 1, 45.61), p53: P(51, 12.35, 1, 51.03), p54: P(51, 15.05, 1, 54.40),
  dw2: P(51, 10.26, 1, 43.74),
  v: P(51, 8.42, 1, 22.24), vi: P(51, 2.53, 1, 22.24), x: P(50, 52.10, 1, 34.96),
};

export const PAS_DE_CALAIS: ChartSource = {
  key: 'pdc', name: 'Pas-de-Calais — DST du détroit de Douvres',
  lat0: 51.0, lon0: 1.5,
  bbox: [50.56, 51.44, 0.71, 2.44],
  land: PDC_LAND,
  lanes: [
    // Voie descendante (sud-ouest) : limite extérieure (23)-(24)-(25)-(26), limite intérieure (9)/(10)-(11) puis bord NW de la zone (f).
    { id: 'SW', name: 'Voie descendante (SW)', polys: [[T.p9, T.p23, T.p24, T.p25, T.p26, P(50, 47.23, 1, 8.23) /* pied de la perpendiculaire de (26) sur (15)-(16), fermeture */, T.p15, T.p14, T.p13, T.p11]],
      axis: [P(51, 19.0, 1, 50.6), P(51, 11.5, 1, 41.3), P(51, 4.6, 1, 31.5), P(50, 58.3, 1, 22.0), P(50, 52.6, 1, 13.5), P(50, 49.5, 1, 7.5)] },
    // Voie montante (nord-est) : bord SE de la zone (f), ligne (11)-(10), zone (c), puis limite extérieure (39)-(40)-(41)-(42), zone (43)-(46).
    { id: 'NE', name: 'Voie montante (NE)', polys: [[T.p20, T.p21, T.p12, T.p11, T.p9, T.p7, T.p6, T.p45, T.p44, T.p42, T.p41, T.p40, T.p39]],
      axis: [P(50, 41.0, 1, 21.0), P(50, 47.3, 1, 24.6), P(50, 53.8, 1, 27.4), P(51, 0.3, 1, 34.0), P(51, 6.0, 1, 43.0), P(51, 8.7, 1, 50.5), P(51, 12.0, 2, 1.0), P(51, 15.0, 2, 4.8)] },
  ],
  zones: [
    { id: 'f', name: 'Zone de séparation (Colbart)', pts: [T.p12, T.p13, T.p14, T.p15, T.p16, P(50, 26.91, 0, -1.09), P(50, 22.12, 0, 0.91), T.p19, T.p20, T.p21] },
    { id: 'c', name: 'Zone de séparation', pts: [T.p7, T.p8, T.p9] },
    { id: 'h', name: 'Zone de séparation (Calais)', pts: [T.p42, T.p44, T.p45, T.p46] },
    { id: 'i', name: 'Zone de séparation (Sandettie)', pts: [T.p48, T.p49, T.p50, T.p51, T.p52, T.p53, T.p54] },
  ],
  lines: [[T.p9, T.p11]],
  itz: [
    // ZNC anglaise : limite NE = méridien de South Foreland (v)-(vi) ; fermée côté terre (la terre la recouvre).
    { id: 'itzE', name: 'Zone de navigation côtière (Angleterre)', pts: [T.v, T.vi, T.p26, P(50, 55.0, 1, 2.65), P(51, 9.0, 1, 18.0)] },
    // ZNC française : limite NE = Cap Gris-Nez (x) – (ix) = (41) ; fermée côté terre.
    { id: 'itzF', name: 'Zone de navigation côtière (France)', pts: [T.x, T.p41, T.p40, T.p39, P(50, 36.0, 1, 24.0), P(50, 36.0, 1, 40.0), P(50, 52.1, 1, 38.0)] },
  ],
  // Route en eau profonde (i)-(ii)-(iii)-(iv) : (i) = (52), (iii) = (7), (iv) = (48).
  dw: [[T.p52, T.dw2, T.p7, T.p48]],
  marks: [
    { id: 'MPC', name: 'MPC', ...ll(P(51, 6.10, 1, 38.19)), kind: 'special', src: 'MGN 364 Amendment 2, §4.9' },
    { id: 'CS4', name: 'CS4', ...ll(P(51, 8.5, 1, 34.0)), kind: 'special', light: 'Fl(4)Y 15s', src: 'NGA Pub. 114 (2012), n° 1316' },
    { id: 'CS3', name: 'CS3', ...ll(P(50, 52, 1, 3)), kind: 'special', approx: true, src: 'NGA Pub. 191, §6.3 (minute près)' },
    { id: 'F1', name: 'F1', ...ll(P(51, 11.2, 1, 45.0)), kind: 'light', src: 'Instructions nautiques (position publiée)' },
    { id: 'SFALLS', name: 'South Falls', ...ll(P(51, 14, 1, 44)), kind: 'light', approx: true, src: 'NGA Pub. 191 (minute près)' },
    { id: 'RUYSW', name: 'Ruytingen SW', ...ll(P(51, 5, 1, 47)), kind: 'light', approx: true, src: 'NGA Pub. 191 (minute près)' },
    { id: 'RCE', name: 'RCE', ...ll(P(51, 2, 1, 53)), kind: 'light', approx: true, src: 'NGA Pub. 191 (minute près)' },
    { id: 'DOWNS', name: 'Downs', ...ll(P(51, 14.505, 1, 26.226)), kind: 'light', src: 'Trinity House' },
    { id: 'COLN', name: 'Colbart N', lat: 50.957, lon: 1.39, kind: 'N', approx: true, src: 'position estimée (tête nord du Colbart)' },
    { id: 'COLSW', name: 'Colbart SW', lat: 50.815, lon: 1.27, kind: 'S', approx: true, src: 'position estimée (extrémité SW du Colbart)' },
    { id: 'VARLV', name: 'Bateau-feu Varne', lat: 51.02092, lon: 1.39793, kind: 'lv', racon: true, src: 'Trinity House' },
    { id: 'SANLV', name: 'Bateau-feu Sandettie', ...ll(P(51, 9.32, 1, 47.23)), kind: 'lv', racon: true, src: 'Trinity House' },
    { id: 'EGLV', name: 'Bateau-feu East Goodwin', lat: dm(51, 13.3), lon: dm(1, 36.35), kind: 'lv', racon: true, src: 'Trinity House' },
    // phares et feux de port : NGA List of Lights (domaine public) ; portées des phares d'après les fiches publiées.
    // Feux de port sans portée relevée : 5 M retenus par défaut (feux de musoir usuels).
    { id: 'DUNGE', name: 'Dungeness', ...ll(P(50, 54.8, 0, 58.5)), kind: 'lh', light: 'Fl 10s', range: 21, elev: 40, src: 'NGA Pub. 114 (2016), A 0876' },
    { id: 'FOLKB', name: 'Folkestone, musoir', ...ll(P(51, 4.6, 1, 11.7)), kind: 'lh', light: 'Fl(2) 10s', range: 22, elev: 14, src: 'NGA Pub. 114 (2016), A 0892' },
    { id: 'DOVAP', name: 'Dover, Admiralty Pier', ...ll(P(51, 6.7, 1, 19.7)), kind: 'lh', light: 'Fl 7.5s', range: 20, elev: 21, src: 'NGA Pub. 114 (2016), A 0900' },
    { id: 'DOVSB', name: 'Dover, digue sud (musoir W)', ...ll(P(51, 6.8, 1, 19.8)), kind: 'port', light: 'Oc R 30s', range: 18, elev: 21, src: 'NGA Pub. 114 (2016), A 0924' },
    { id: 'DOVKN', name: 'Dover, Knuckle', ...ll(P(51, 7.0, 1, 20.5)), kind: 'port', light: 'Fl(4) WR 10s', range: 15, elev: 15, src: 'NGA Pub. 114 (2016), A 0926' },
    { id: 'DOVDM', name: 'Dover, môle détaché (musoir N)', ...ll(P(51, 7.2, 1, 20.6)), kind: 'port', light: 'Fl R 2.5s', range: 5, elev: 11, src: 'NGA Pub. 114 (2016), A 0928' },
    { id: 'DOVEA', name: 'Dover, Eastern Arm', ...ll(P(51, 7.3, 1, 20.6)), kind: 'port', light: 'Fl G 5s', range: 5, elev: 12, src: 'NGA Pub. 114 (2016), A 0929' },
    { id: 'ALPRECH', name: "Cap d'Alprech", ...ll(P(50, 41.9, 1, 33.8)), kind: 'lh', light: 'Fl(3) 15s', range: 23, elev: 62, src: 'NGA Pub. 114 (2016), n° 8844 ; portée : Lighthouse Digest' },
    { id: 'BOUCAR', name: 'Boulogne, digue Carnot', ...ll(P(50, 44.4, 1, 34.1)), kind: 'port', light: 'Fl(2+1) 15s', elev: 25, src: 'NGA Pub. 114 (2016), n° 8860' },
    { id: 'BOUNE', name: 'Boulogne, jetée NE', ...ll(P(50, 43.9, 1, 35.2)), kind: 'port', light: 'Q R', elev: 11, src: 'NGA Pub. 114 (2016), n° 8892' },
    { id: 'BOUSW', name: 'Boulogne, jetée SW', ...ll(P(50, 43.9, 1, 35.1)), kind: 'port', light: 'Q G', elev: 17, src: 'NGA Pub. 114 (2016), n° 8888' },
    { id: 'GRISNEZ', name: 'Cap Gris-Nez', ...ll(P(50, 52.1, 1, 35.0)), kind: 'lh', light: 'Fl 5s', range: 29, elev: 72, src: 'NGA Pub. 114 (2016), n° 8896 ; portée : Lighthouse Digest' },
    { id: 'SANGAT', name: 'Sangatte', ...ll(P(50, 57.2, 1, 46.5)), kind: 'port', light: 'Oc WG 4s', elev: 13, src: 'NGA Pub. 114 (2016), n° 8900' },
    { id: 'CALAIS', name: 'Calais', ...ll(P(50, 57.7, 1, 51.2)), kind: 'lh', light: 'Fl(4) 15s', range: 23, elev: 59, src: 'NGA Pub. 114 (2016), n° 8904 ; portée : Wikipedia (23,5 M)' },
    { id: 'CALJE', name: 'Calais, jetée Est', ...ll(P(50, 58.4, 1, 50.5)), kind: 'port', light: 'Fl(2) R 6s', elev: 12, src: 'NGA Pub. 114 (2016), n° 8908' },
    { id: 'CALJW', name: 'Calais, jetée Ouest', ...ll(P(50, 58.2, 1, 50.4)), kind: 'port', light: 'Iso G 3s', elev: 12, src: 'NGA Pub. 114 (2016), n° 8912' },
    { id: 'GRAVE', name: 'Gravelines, jetée Est', ...ll(P(51, 0.9, 2, 5.6)), kind: 'port', light: 'Fl(3) R 12s', elev: 9, src: 'NGA Pub. 114 (2016), n° 8924' },
    { id: 'GRAVW', name: 'Gravelines, jetée Ouest', ...ll(P(51, 0.9, 2, 5.5)), kind: 'port', light: 'Fl(2) WG 6s', elev: 9, src: 'NGA Pub. 114 (2016), n° 8928' },
    { id: 'DUNK', name: 'Dunkerque', ...ll(P(51, 2.9, 2, 21.9)), kind: 'lh', light: 'Fl(2) 10s', range: 26, elev: 59, src: 'NGA Pub. 114 (2016), n° 8964 ; portée : Wikipedia' },
    { id: 'DUNJE', name: 'Dunkerque, jetée Est', ...ll(P(51, 3.6, 2, 21.2)), kind: 'port', light: 'Fl(2) R 6s', elev: 12, src: 'NGA Pub. 114 (2016), n° 8996' },
    { id: 'DUNJW', name: 'Dunkerque, jetée Ouest', ...ll(P(51, 3.6, 2, 21.0)), kind: 'port', light: 'Fl(2) G 6s', elev: 35, src: 'NGA Pub. 114 (2016), n° 8992' },
  ],
  banks: [
    { name: 'Varne', lat: dm(50, 58.5), lon: dm(1, 20.0), len: 5.75, wid: 0.6, orient: 50, min: 2, src: 'sea-seek (50°58\'N 1°20\'E) / NGA Pub. 191 : 5,75 NM, orienté SW–NE' },
    { name: 'Le Colbart (The Ridge)', lat: dm(50, 53.0), lon: dm(1, 20.0), len: 10, wid: 0.9, orient: 30, min: 1.5, src: 'sea-seek / NGA Pub. 191 : 50°53\'N 1°20\'E, ≈ 10 NM, forme la séparation des voies' },
    { name: 'Sandettie', lat: dm(51, 13.4), lon: dm(1, 55.4), len: 13, wid: 0.8, orient: 56, min: 5, src: 'NGA Pub. 191 : ≈ 15 NM, moins 5 m ; emprise schématique calée sur la zone de séparation (i)' },
    { name: 'Goodwin Sands', lat: dm(51, 15.5), lon: dm(1, 33.0), len: 9, wid: 2.4, orient: 20, min: -1, src: 'bancs découvrants, emprise schématique' },
    { name: 'Ruytingen', lat: dm(51, 6.8), lon: dm(1, 54.5), len: 11, wid: 0.7, orient: 63, min: 4, src: 'banc de Flandre, emprise schématique depuis la bouée Ruytingen SW' },
    { name: 'Dyck', lat: dm(51, 4.0), lon: dm(2, 2.0), len: 10, wid: 0.6, orient: 60, min: 5, src: 'banc de Flandre, emprise schématique' },
    { name: 'Ridens de Calais', lat: dm(51, 0.75), lon: dm(1, 50.25), len: 4, wid: 0.5, orient: 52, min: 4, src: 'emprise schématique jusqu\'à la bouée RCE' },
  ],
  baseDepth: 45, coastScale: 1.2,
  // relief schématique : falaises de Douvres, South Foreland, Folkestone, caps Blanc-Nez et Gris-Nez
  landBase: 18,
  relief: [[51.128, 1.335, 100, 1.05, true], [51.142, 1.375, 90, 1.05, true], [51.096, 1.235, 70, 1.05, true], [50.925, 1.712, 130, 1.05, true], [50.871, 1.585, 45, 1.05, true]],
  attribution: '© contributeurs OpenStreetMap (ODbL) · DST : OMI COLREG.2/Circ.59 · bathymétrie schématique',
};

function ll(p: LL): { lat: number; lon: number } { return { lat: p[0], lon: p[1] }; }
