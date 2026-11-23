/** Données de référence : navires porteurs, transmetteur, types de cibles, textes. */
import type { Role, ShipModel, TargetType } from './state';
import { KVLCC2 } from './ships/kvlcc2';

/**
 * Navire porteur. Un seul type pour l'instant : le pétrolier KVLCC2 (modèle MMG, coefficients publiés).
 * Prochain navire prévu : porte-conteneurs KCS, dès qu'un jeu de coefficients publié complet est disponible.
 */
export const SHIPS: Record<string, ShipModel> = {
  vlcc: { n: 'Pétrolier VLCC 320 m (KVLCC2)', L: 320, max: 15.5, mmg: KVLCC2,
    src: 'MMG standard method, Yasukawa & Yoshimura (2015), coefficients KVLCC2' },
};
export const DEFAULT_SHIP = 'vlcc';

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

/**
 * Noms de navires fictifs (AIS, messages). Tirés sans doublon dans un exercice.
 * Commerce, pêche et plaisance ont chacun leur liste.
 */
export const SHIP_NAMES: Record<'merchant' | 'fish' | 'sail', string[]> = {
  merchant: ['ALCYON', 'AQUILA', 'ARGO', 'BOREAS', 'CALYPSO', 'CASSIOPEE', 'CORMORAN', 'DELPHINUS', 'EOLE', 'FULMAR',
    'GOELAND', 'HALCYON', 'IROISE', 'KESTREL', 'LYRA', 'MISTRAL', 'NEREIDE', 'ORION', 'PEGASE', 'PETREL', 'POLARIS',
    'SIRIUS', 'SKUA', 'TRITON', 'VEGA', 'ZEPHYR', 'NORD STAR', 'BALTIC WAVE', 'ATLANTIC DAWN', 'NORTH SEA TRADER',
    'CAP FREHEL', 'MERIDIAN', 'OCEAN PRIDE', 'SEA HARMONY', 'STELLA MARIS', 'TRADEWIND', 'ANDROMEDA', 'ALDEBARAN', 'ALTAIR', 'RIGEL'],
  fish: ['AR VAG', 'PEN HIR', 'MARIE-LOUISE', 'SAINT-GUENOLE', 'LES DEUX FRERES', 'KER ANNA', 'BREIZH IZEL', 'L\'ESPERANCE',
    'NOTRE-DAME', 'MOR BRAS', 'GWALARN', 'STEREDENN'],
  sail: ['ALIZE', 'SAMSARA', 'TANGAROA', 'KALLISTE', 'ODYSSEE', 'LIBERTALIA', 'NAUSICAA', 'FREYA', 'MELUSINE', 'SILLAGE'],
};
