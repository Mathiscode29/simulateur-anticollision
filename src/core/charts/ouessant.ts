/**
 * Ouessant : dispositif de séparation du trafic « Off Ushant », zone de navigation côtière, phares (carte schématique).
 *
 * Sources :
 *  - DST : OMI SN/Circ.232, annexe A (positions WGS 84, en vigueur le 1er mai 2003), arrêté du préfet maritime de
 *    l'Atlantique n° 2003/11 ; usage de la route à double sens modifié par COLREG.2/Circ.64 et COLREG.2/Circ.75.
 *    Coquille corrigée : le point 3 de la zone de séparation extérieure est imprimé « 005°60'.60 W » ; on retient 005°50'.60 W
 *    (point commun avec le point 6 de la voie descendante).
 *  - Phares : NGA Pub. 113 (2021), domaine public (n° 4 à 116).
 *  - Trait de côte : © contributeurs OpenStreetMap (ODbL), voir ouessant-land.ts.
 * Profondeurs schématiques : carte non destinée à la navigation.
 */
import type { ChartSource, LL } from './types';
import { P } from './types';
import { USH_LAND } from './ouessant-land';

const W = (d: number, m: number): number => -(d + m / 60);
const N = (d: number, m: number): number => d + m / 60;
const p = (la: [number, number], lo: [number, number]): LL => [N(...la), W(...lo)];
const midLL = (a: LL, b: LL): LL => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const ll = (q: LL) => ({ lat: q[0], lon: q[1] });
const N113 = 'NGA Pub. 113 (2021)';

// Voie descendante (vers le SW), points 1 à 6
const S1 = p([49, 1.1], [5, 36.05]), S2 = p([48, 57.0], [5, 32.5]), S3 = p([48, 52.05], [5, 45.0]), S4 = p([48, 39.7], [5, 55.2]), S5 = p([48, 42.0], [6, 1.6]), S6 = p([48, 55.6], [5, 50.6]);
// Voie montante (vers le NE), points 1 à 6
const M1 = p([48, 52.75], [5, 28.6]), M2 = p([48, 48.6], [5, 25.1]), M3 = p([48, 45.0], [5, 34.3]), M4 = p([48, 35.1], [5, 42.3]), M5 = p([48, 37.4], [5, 48.6]), M6 = p([48, 48.6], [5, 39.6]);
// Zones de séparation, route à double sens, zone de navigation côtière
const OUT: LL[] = [p([49, 2.0], [5, 36.8]), S1, S6, S5, p([48, 42.6], [6, 2.8]), p([48, 56.4], [5, 51.6])];
const INNER: LL[] = [S2, M1, M6, M5, S4, S3];
const SEP1: LL[] = [M2, p([48, 39.7], [5, 14.7]), p([48, 30.6], [5, 26.3]), M4, M3];
const SEP2: LL[] = [p([48, 38.0], [5, 12.9]), p([48, 37.2], [5, 11.9]), p([48, 29.39], [5, 22.05]), p([48, 29.8], [5, 23.5])];
const ITZ: LL[] = [p([48, 37.2], [5, 11.9]), p([48, 27.96], [5, 1.32]), p([48, 25.33], [5, 8.04]), p([48, 29.39], [5, 22.05])];

export const OUESSANT: ChartSource = {
  key: 'ush', name: 'Ouessant — DST « Off Ushant »',
  lat0: 48.65, lon0: -5.35,
  bbox: [48.2, 49.1, -6.15, -4.6],
  land: USH_LAND,
  lanes: [
    // axes : milieux des limites d'entrée, du coude (relèvement 315° de Créac'h) et de sortie
    { id: 'SW', name: 'Voie descendante (SW)', polys: [[S1, S2, S3, S4, S5, S6]], axis: [midLL(S1, S2), midLL(S3, S6), midLL(S4, S5)] },
    { id: 'NE', name: 'Voie montante (NE)', polys: [[M1, M2, M3, M4, M5, M6]], axis: [midLL(M4, M5), midLL(M3, M6), midLL(M1, M2)] },
  ],
  zones: [
    { id: 'sepOut', name: 'Zone de séparation extérieure', pts: OUT },
    { id: 'sepIn', name: 'Zone de séparation intérieure', pts: INNER },
    { id: 'sep1', name: 'Zone de séparation (voie montante / route à double sens)', pts: SEP1 },
    { id: 'sep2', name: 'Zone de séparation (route à double sens / zone côtière)', pts: SEP2 },
  ],
  // route à double sens (réservée à certaines catégories de navires) : comprise entre les deux zones de séparation
  lines: [],
  itz: [{ id: 'itz', name: 'Zone de navigation côtière d\'Ouessant', pts: ITZ }],
  dw: [],
  marks: [
    { id: 'CREAC', name: 'Créac\'h', ...ll(P(48, 27.5, -5, 7.7)), kind: 'lh', light: 'Fl(2) 10s', range: 30, elev: 70, racon: true, src: `${N113}, n° 4` },
    { id: 'STIFF', name: 'Le Stiff', ...ll(P(48, 28.5, -5, 3.4)), kind: 'lh', light: 'Fl(2) R 20s', range: 22, elev: 85, src: `${N113}, n° 16` },
    { id: 'NIVID', name: 'Nividic', ...ll(P(48, 26.7, -5, 9.1)), kind: 'lh', light: 'VQ(9) 10s', range: 6, elev: 28, src: `${N113}, n° 20` },
    { id: 'JUMENT', name: 'La Jument', ...ll(P(48, 25.3, -5, 8.0)), kind: 'lh', light: 'Fl(3) R 12s', range: 10, elev: 36, src: `${N113}, n° 24` },
    { id: 'MENKORN', name: 'Men-Korn', ...ll(P(48, 28.0, -5, 1.3)), kind: 'lh', light: 'VQ(3) WR 5s', range: 8, elev: 21, src: `${N113}, n° 28` },
    { id: 'KEREON', name: 'Kéréon (Men-Tensel)', ...ll(P(48, 26.2, -5, 1.6)), kind: 'lh', light: 'Oc(3) WR 12s', range: 10, elev: 38, src: `${N113}, n° 38` },
    { id: 'FOUR', name: 'Le Four', ...ll(P(48, 31.4, -4, 48.4)), kind: 'lh', light: 'Fl(5) 15s', range: 22, elev: 28, src: `${N113}, n° 48` },
    { id: 'TREZIEN', name: 'Trézien', ...ll(P(48, 25.4, -4, 46.7)), kind: 'lh', light: 'Oc(2) 6s', range: 20, elev: 84, src: `${N113}, n° 76` },
    { id: 'KERMOR', name: 'Kermorvan', ...ll(P(48, 21.7, -4, 47.4)), kind: 'lh', light: 'Fl 5s', range: 22, elev: 20, src: `${N113}, n° 84` },
    { id: 'STMAT', name: 'Saint-Mathieu', ...ll(P(48, 19.8, -4, 46.3)), kind: 'lh', light: 'Fl 15s', range: 24, elev: 56, src: `${N113}, n° 104` },
    { id: 'PNOIRES', name: 'Les Pierres Noires', ...ll(P(48, 18.7, -4, 54.9)), kind: 'lh', light: 'Fl R 5s', range: 19, elev: 27, src: `${N113}, n° 116` },
    { id: 'STIFFP', name: 'Port du Stiff, môle E', ...ll(P(48, 28.2, -5, 3.2)), kind: 'port', light: 'Q W', range: 10, elev: 11, src: `${N113}, n° 18` },
  ],
  banks: [],
  baseDepth: 110, coastScale: 2.5,
  landBase: 25,
  relief: [
    [48.462, -5.085, 55, 1.6, true], // Ouessant : falaises de 40 à 60 m
    [48.395, -4.950, 15, 1.0, false], // Molène
    [48.40, -4.72, 45, 4.0, false], // pointe de Saint-Mathieu, Le Conquet
  ],
  attribution: '© contributeurs OpenStreetMap (ODbL) · DST : OMI SN/Circ.232 · phares : NGA Pub. 113 · bathymétrie schématique',
};
