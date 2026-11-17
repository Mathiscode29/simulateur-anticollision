/** Données de référence : navires porteurs, transmetteur, types de cibles, textes. */
import type { Role, ShipModel, TargetType } from './state';
import { KVLCC2 } from './ships/kvlcc2';

/**
 * Navires porteurs. Modèle de Nomoto du 1er ordre adimensionnel :
 * K = Kp·U/L, T = Tp·L/U. wind = coefficient de dérive au vent (prise au vent),
 * acc/dec = constantes de temps (s) d'accélération / de décélération.
 */
export const SHIPS: Record<string, ShipModel> = {
  pax: { n: "Navire d'expédition 131 m", L: 131, max: 15.5, Kp: 1.15, Tp: 1.3, wind: 0.045, acc: 100, dec: 170 },
  ferry: { n: 'Ferry ro-pax 194 m', L: 194, max: 21, Kp: 1.05, Tp: 1.5, wind: 0.05, acc: 140, dec: 230 },
  bulk: { n: 'Vraquier 190 m (chargé)', L: 190, max: 14, Kp: 0.85, Tp: 2.0, wind: 0.02, acc: 300, dec: 540 },
  ptc: { n: 'Porte-conteneurs 366 m', L: 366, max: 21, Kp: 0.8, Tp: 2.3, wind: 0.055, acc: 380, dec: 660 },
  vlcc: { n: 'Pétrolier VLCC 320 m (KVLCC2, modèle MMG)', L: 320, max: 15.5, Kp: 0, Tp: 0, wind: 0, acc: 0, dec: 0, mmg: KVLCC2,
    src: 'MMG standard method, Yasukawa & Yoshimura (2015), coefficients KVLCC2' },
};

/** Transmetteur d'ordres : fraction de la vitesse max. */
export const TELE: readonly { n: string; f: number }[] = [
  { n: 'AR toute', f: -0.5 }, { n: 'AR demie', f: -0.3 }, { n: 'Stop', f: 0 }, { n: 'AV très lente', f: 0.25 },
  { n: 'AV lente', f: 0.4 }, { n: 'AV demie', f: 0.6 }, { n: 'AV toute', f: 0.8 }, { n: 'Allure mer', f: 1 },
];
export const TELE_SEA = TELE.length - 1;

export const TT: Record<TargetType, { n: string[]; L: [number, number] }> = {
  power: { n: ['Porte-conteneurs', 'Pétrolier', 'Vraquier', 'Cargo', 'Roulier', 'Méthanier', 'Transporteur de voitures'], L: [110, 330] },
  small: { n: ['Caboteur', 'Navire de servitude', 'Cargo côtier'], L: [45, 95] },
  fish: { n: ['Chalutier en pêche'], L: [18, 45] },
  sail: { n: ['Voilier'], L: [10, 18] },
  nuc: { n: ['Navire non maître de sa manœuvre'], L: [90, 190] },
  ram: { n: ['Navire à capacité de manœuvre restreinte (câblier)'], L: [60, 130] },
};
/** Types bénéficiant de la règle 18 face à un navire à propulsion mécanique. */
export const SPECIAL: ReadonlySet<TargetType> = new Set<TargetType>(['fish', 'sail', 'nuc', 'ram']);

export const ROLE_TXT: Partial<Record<Role, string>> = {
  giveway: 'Croisement — vous êtes non privilégié (R15, R16)',
  standon: 'Croisement — vous êtes privilégié (R17)',
  headon: 'Rencontre de face (R14)',
  overtaking: 'Vous rattrapez (R13 : vous vous écartez)',
  overtaken: 'Vous êtes rattrapé (R13 / R17 : vous maintenez)',
  giveway18: 'Navire privilégié au titre de R18 : vous vous écartez',
  R19: 'Visibilité réduite (R19) : ni privilégié ni non privilégié',
};

export const RANGES = [0.75, 1.5, 3, 6, 12, 24];
export const RINGS: Record<number, number> = { 0.75: 0.25, 1.5: 0.25, 3: 0.5, 6: 1, 12: 2, 24: 4 };
