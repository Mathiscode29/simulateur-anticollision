/**
 * Génération des scénarios.
 * Chaque situation est construite à rebours : on choisit le type de rencontre, le TCPA (min) et le CPA visé,
 * puis on place la cible pour que le mouvement relatif passe au CPA voulu. Le rôle obtenu est vérifié par roleOf.
 * Une rencontre peut être prévue après un point tournant de la route (référence « porteur virtuel » au point).
 * Exercices sur carte réelle (Pas-de-Calais, détroit de Gibraltar) : position de départ et points tournants géographiques
 * (WGS 84), trafic qui suit les voies du DST (laneShip, laneMeet, laneMeetRoute, laneAhead, laneAt, laneFill).
 * Navires au mouillage : anchorAhead (sur l'avant du porteur) et anchorGeo (position géographique).
 */
import { S, logE, newSoundState, newTssWatch, type Behaviour, type Env, type Route, type Target, type TargetType, type Visibility } from '../core/state';
import { DEFAULT_SHIP, SHIPS, SHIP_NAMES, TELE, TELE_SEA, TT } from '../core/data';
import { K2N, adiff, brgOf, clamp, n360, p3, pick, pm, rnd, vec } from '../core/util';
import { gv, initOwnDynamics } from './physics';
import { pickBeh, roleOf } from './rules';
import { makeRoute } from './route';
import { CHART, depthAt, laneOf, loadChart, pointAt, polyLength, projOnPolyline, tssAt, type ChartKey } from './chart';
import { makeAis } from './ais';
import { newRecording } from './debrief';
import { toXY } from '../core/geo';

export type Kind = 'headon' | 'gw' | 'so' | 'overtake' | 'overtaken' | 'fish' | 'nuc' | 'sail' | 'any';

export interface Scenario {
  n: string; d: string;
  /** 1 = fondamentaux, 2 = situations combinées, 3 = avancé, 4 = Pas-de-Calais (DST), 5 = détroit de Gibraltar (DST) */
  lvl: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Carte : large (défaut, cap initial aléatoire), Pas-de-Calais ou Gibraltar (départ et route géographiques imposés). */
  chart?: ChartKey;
  /** Départ [latitude, longitude] et points tournants géographiques (degrés décimaux, WGS 84). */
  start?: [number, number];
  wpts?: [number, number][];
  vis: Visibility | null;
  /** Réglages d'environnement imposés à la sélection (modifiables ensuite). */
  env?: Partial<Env>;
  /** Exercice de port : tirant d'eau d'exercice (m), vitesse initiale (kn), cran initial du transmetteur, demi-largeur du couloir de route (NM). */
  draft?: number; startKn?: number; tele?: number; xte?: number;
  /** Route : [abattée (°), longueur (NM)] par segment ; défaut : une seule route droite de 60 NM. */
  legs?: [number, number][];
  build: () => void;
}

/** Référence de placement : porteur réel maintenant, ou porteur virtuel à un point tournant à l'instant t0 (s). */
interface Ref { x: number; y: number; hdg: number; stw: number; vx: number; vy: number; t0: number }

export const LEVELS: Record<number, string> = { 1: 'Fondamentaux', 2: 'Situations combinées', 3: 'Avancé', 4: 'Pas-de-Calais (DST, règle 10)', 5: 'Détroit de Gibraltar (DST, règle 10)', 6: 'Le Havre (port, chenal, règle 9)', 7: 'Ouessant (DST, règle 10)' };

const dm = (d: number, m: number): number => d + m / 60;
/** Longitude ouest : degrés et minutes → degrés décimaux négatifs. */
const dmW = (d: number, m: number): number => -(d + m / 60);

export const SCEN: Record<string, Scenario> = {
  // ----- Fondamentaux
  r14: { n: 'Face à face (R14)', d: 'Un navire à contre-bord, quasiment route opposée.', lvl: 1, vis: 'good',
    build() { add('headon', rnd(14, 18), pm(0, 0.15)); add('any', rnd(16, 26), pm(2, 3.5)); } },
  r15: { n: 'Croisement : non privilégié (R15/16)', d: 'Un navire vous croise en venant de tribord.', lvl: 1, vis: 'good',
    build() { add('gw', rnd(15, 20), pm(0, 0.2)); add('any', rnd(16, 26), pm(2, 3.5)); } },
  r17: { n: 'Croisement : privilégié (R17)', d: 'Un navire arrive de bâbord. Réagira-t-il à temps ?', lvl: 1, vis: 'good',
    build() { const t = add('so', rnd(16, 20), pm(0, 0.15)); if (t && Math.random() < 0.55) t.beh = 'passive'; add('any', rnd(16, 26), pm(2, 3.5)); } },
  r13: { n: 'Rattrapement (R13)', d: "Vous rattrapez un navire plus lent… pendant qu'un autre croise.", lvl: 1, vis: 'good',
    build() { add('overtake', rnd(28, 36), pm(0, 0.12)); add('gw', rnd(24, 32), pm(0, 0.3)); } },
  r18: { n: 'Pêche, voile, NUC (R18)', d: 'Chalutier, voilier et navire à propulsion mécanique.', lvl: 1, vis: 'good',
    build() { add('fish', rnd(12, 16), pm(0, 0.2)); add('sail', rnd(20, 26), pm(0, 0.2)); add(pick(['so', 'nuc'] as const), rnd(24, 30), pm(0, 0.3)); } },
  r19: { n: 'Visibilité réduite (R19)', d: 'Brume : radar seul. Trois échos, dont un rattrapant.', lvl: 1, vis: 'poor',
    build() { add('gw', rnd(16, 20), pm(0, 0.2)); add('so', rnd(24, 30), pm(0, 0.25)); add('overtaken', rnd(30, 38), pm(0, 0.2)); } },

  // ----- Situations combinées
  c_wp: { n: 'Changement de route au point tournant', d: 'Abattée de 60° sur tribord au WP1 : un croiseur vous attend sur la nouvelle route.', lvl: 2, vis: 'good',
    legs: [[0, 4], [60, 50]],
    build() { addAfterWp(1, 'gw', 12, pm(0, 0.2)); add('any', rnd(10, 20), pm(2, 3.5)); add('any', rnd(25, 35), pm(2, 4)); } },
  c_double: { n: 'Double croisement', d: "Un navire sur tribord, un autre sur bâbord, presque en même temps : à qui s'adresse quoi ?", lvl: 2, vis: 'good',
    build() { add('gw', rnd(16, 18), pm(0, 0.2)); add('so', rnd(17, 19), pm(0, 0.2)); add('any', rnd(20, 30), pm(2.5, 4)); } },
  c_headover: { n: 'Face à face et rattrapant', d: "Un navire de face, un autre vous rattrape : attention à l'abattée sur tribord.", lvl: 2, vis: 'good',
    build() { add('headon', rnd(15, 17), pm(0, 0.15)); add('overtaken', rnd(18, 22), pm(0.3, 0.6)); } },
  c_passif: { n: 'Le non privilégié ne manœuvre pas', d: "Croiseur venant de bâbord qui ne réagira qu'au dernier moment : R17a(ii) puis R17b.", lvl: 2, vis: 'good',
    build() { const t = add('so', rnd(16, 19), pm(0, 0.1)); if (t) t.beh = 'passive'; add('any', rnd(18, 28), pm(2.5, 4)); } },
  c_contre: { n: 'Manœuvre à contresens', d: 'Face à face avec un navire qui vient sur bâbord. Saurez-vous le détecter à temps ?', lvl: 2, vis: 'good',
    build() { const t = add('headon', rnd(16, 18), pm(0, 0.1)); if (t) t.beh = 'wrong'; add('any', rnd(18, 28), pm(2.5, 4)); } },
  c_avarie: { n: 'Avarie en croisement (R18)', lvl: 2, vis: 'good',
    d: 'Un navire croise de bâbord : vous êtes privilégié. Il tombe en avarie de machine et devient non maître de sa manœuvre : la situation s’inverse.',
    build() {
      // l'avarie survient à TCPA ≈ 5,5 à 7 min : le navire perd son erre près de votre route
      const T = rnd(16, 19), t = add('so', T, pm(0, 0.2));
      if (t) { t.beh = 'late'; t.fault = { kind: 'engine', active: false, at: S.t + (T - rnd(5.5, 7)) * 60 }; }
      add('overtaken', rnd(26, 30), pm(0.4, 0.6));
    } },
  mix: { n: 'Trafic mixte', d: 'Six navires dont trois en route de collision, échelonnés.', lvl: 2, vis: null,
    build() {
      const k = shuffle<Kind>(['headon', 'gw', 'so', 'fish', 'overtake', 'sail']);
      add(k[0], rnd(12, 15), pm(0, 0.2)); add(k[1], rnd(22, 26), pm(0, 0.25)); add(k[2], rnd(32, 36), pm(0, 0.25));
      for (let i = 0; i < 3; i++) add('any', rnd(14, 35), pm(1.8, 4));
    } },
  c_mouillage: { n: 'Navires au mouillage, de nuit', d: 'Quatre navires au mouillage aux abords de la route, dont un droit devant ; un croiseur passe entre eux. Reconnaître les feux de mouillage (R30) et les éviter largement.', lvl: 2, vis: 'good',
    env: { night: true, windKn: 14 },
    build() {
      anchorAhead(rnd(14, 17), pm(0, 0.12));
      anchorAhead(rnd(19, 22), rnd(1, 1.4));
      anchorAhead(rnd(25, 28), -rnd(1, 1.4));
      anchorAhead(rnd(31, 34), pm(1.2, 1.6));
      add('gw', rnd(26, 30), pm(0, 0.25));
    } },

  // ----- Avancé
  a_voilier: { n: 'Petit voilier de nuit par mer formée', d: 'Écho faible noyé dans le clutter (vent 28 kn) : réglez gain et anti-clutter.', lvl: 3, vis: 'good',
    env: { windKn: 28, night: true },
    build() { add('sail', rnd(13, 16), pm(0, 0.15)); add('gw', rnd(24, 28), pm(0, 0.25)); } },
  a_peche: { n: 'Flottille de chalutiers', d: 'Quatre chalutiers qui changent de route en pêchant, et un caboteur qui croise.', lvl: 3, vis: 'good',
    build() { for (const T of [12, 15, 19, 24]) add('fish', T + rnd(0, 2), pm(0.2, 1.2)); add('so', rnd(20, 26), pm(0, 0.3)); } },
  a_nuc: { n: 'NUC en dérive et croiseur', d: 'Un navire non maître de sa manœuvre dérive sur votre route pendant qu’un autre croise.', lvl: 3, vis: 'good',
    env: { windKn: 22 },
    build() { add('nuc', rnd(14, 17), pm(0, 0.2)); add('gw', rnd(17, 21), pm(0, 0.25)); } },
  a_grains: { n: 'Grains et bande X', d: 'Des grains masquent une partie des échos. Comparez bandes X et S, réglez l’anti-clutter pluie.', lvl: 3, vis: 'good',
    env: { rain: true, windKn: 20 },
    build() { add('gw', rnd(15, 18), pm(0, 0.2)); add('headon', rnd(22, 26), pm(0, 0.2)); add('any', rnd(15, 30), pm(2, 4)); } },
  dense: { n: 'Trafic dense', d: 'Onze navires, cinq situations à risque. Rythme soutenu.', lvl: 3, vis: null,
    build() {
      const k = shuffle<Kind>(['headon', 'gw', 'so', 'fish', 'overtake', 'gw', 'sail']);
      [10, 16, 22, 30, 40].forEach((T, i) => add(k[i], T + rnd(0, 3), pm(0, 0.3)));
      for (let i = 0; i < 6; i++) add('any', rnd(10, 40), pm(1.5, 4));
    } },
  a_brume_dense: { n: 'Trafic dense en brume', d: 'Le trafic dense, au radar seul : R19 sur cinq situations.', lvl: 3, vis: 'poor',
    build() {
      const k = shuffle<Kind>(['headon', 'gw', 'so', 'overtake', 'gw', 'overtaken']);
      [11, 17, 23, 30, 38].forEach((T, i) => add(k[i], T + rnd(0, 3), pm(0, 0.3)));
      for (let i = 0; i < 5; i++) add('any', rnd(10, 40), pm(1.5, 4));
    } },
  a_wp_brume: { n: 'Changement de route en brume', d: 'Abattée de 45° sur bâbord au WP1, brume, trafic de part et d’autre.', lvl: 3, vis: 'poor',
    legs: [[0, 4], [-45, 50]],
    build() { add('so', rnd(12, 15), pm(0, 0.2)); addAfterWp(1, 'gw', 14, pm(0, 0.2)); addAfterWp(1, 'headon', 22, pm(0, 0.2)); } },

  // ----- Pas-de-Calais (carte réelle, DST du détroit de Douvres)
  pdc_cross: { n: 'Traversée du DST (R10c)', lvl: 4, vis: 'good', chart: 'pdc',
    d: 'Traverser les deux voies à angle droit près de la bouée MPC, dans un trafic dense montant puis descendant. Courant de flot portant au NE.',
    start: [dm(51, 2.5), dm(1, 46.7)], wpts: [[dm(51, 10.0), dm(1, 34.8)], [dm(51, 18.7), dm(1, 42.7)]],
    env: { windFrom: 240, windKn: 15, curSet: 45, curKn: 1.2, night: false },
    build() {
      laneMeet('NE', rnd(10, 12), pm(0.15, 0.4), rnd(13, 17));
      laneMeet('NE', rnd(17, 19), pm(0.3, 0.6), rnd(11, 15));
      laneMeet('SW', rnd(28, 30), pm(0.15, 0.4), rnd(13, 18));
      laneMeet('SW', rnd(33, 35), pm(0.3, 0.7), rnd(11, 16));
      laneFill('NE', 5); laneFill('SW', 5);
    } },
  pdc_varne: { n: 'Rattrapement en brume, voie NE', lvl: 4, vis: 'poor', chart: 'pdc',
    d: 'Brume entre le Colbart et le Varne : un navire lent devant vous dans la voie montante, un rapide qui vous rattrape, un transbordeur qui coupe le DST.',
    start: [dm(50, 48.0), dm(1, 24.9)], wpts: [[dm(50, 53.8), dm(1, 27.4)], [dm(51, 0.3), dm(1, 34.0)], [dm(51, 6.0), dm(1, 43.0)], [dm(51, 8.7), dm(1, 50.5)]],
    env: { windFrom: 200, windKn: 10, curSet: 30, curKn: 1.5, rain: false },
    build() {
      laneAhead('NE', 3.6, pm(0, 0.12), 7);
      laneAhead('NE', -2.8, rnd(0.4, 0.6), 19);
      laneAhead('NE', 9.5, pm(0.5, 0.9), 11);
      const f = add('gw', rnd(17, 21), pm(0, 0.3));
      if (f) { f.name = 'Transbordeur'; f.L = 190; }
      laneFill('SW', 4);
    } },
  pdc_rogue: { n: 'Navire à contresens (voie SW)', lvl: 4, vis: 'good', chart: 'pdc',
    d: 'De nuit dans la voie descendante, au large de Douvres : un navire remonte la voie à contresens. Le détecter tôt (radar, AIS) et l’éviter.',
    start: [dm(51, 13.0), dm(1, 43.2)], wpts: [[dm(51, 4.6), dm(1, 31.5)], [dm(50, 58.3), dm(1, 22.0)], [dm(50, 52.6), dm(1, 13.5)]],
    env: { windFrom: 30, windKn: 14, curSet: 225, curKn: 1.0, night: true },
    build() {
      const r = laneAhead('SW', 10.5, pm(0.05, 0.2), 12, { dir: -1, beh: Math.random() < 0.5 ? 'late' : 'passive' });
      if (r) r.name = 'Cargo (à contresens)';
      laneAhead('SW', 3.2, pm(0.6, 1.0), 10.5);
      laneAhead('SW', 6.8, pm(0.6, 1.1), 12);
      laneAhead('SW', -3, rnd(0.35, 0.5), 18.5);
      laneFill('NE', 5);
    } },

  // ----- Détroit de Gibraltar (carte réelle, DST « In the Strait of Gibraltar »)
  gib_west: { n: 'Transit vers l\'Atlantique (voie ouest)', lvl: 5, vis: 'good', chart: 'gib',
    d: 'De Europa Point à Tarifa dans la voie ouest, contre le courant entrant : un navire lent à rattraper, un plus rapide qui vous rattrape, et les transbordeurs rapides Tarifa / Tanger qui coupent le DST.',
    start: [dm(36, 0.45), dmW(5, 21.5)], wpts: [[dm(36, 0.2), dmW(5, 25.7)], [dm(35, 59.5), dmW(5, 28.6)], [dm(35, 57.8), dmW(5, 35.1)], [dm(35, 57.43), dmW(5, 36.5)], [dm(35, 57.4), dmW(5, 50.0)]],
    env: { windFrom: 270, windKn: 18, curSet: 85, curKn: 1.8, night: false },
    build() {
      laneAhead('W', 4.2, pm(0, 0.12), 8);
      laneAhead('W', -3, rnd(0.4, 0.6), 19);
      const f = add('gw', rnd(15, 18), pm(0, 0.25), ownRef(), 27);
      if (f) { f.name = 'Transbordeur rapide'; f.L = 90; }
      const g = addAfterWp(4, 'so', rnd(8, 11), pm(0, 0.3), 25);
      if (g) { g.name = 'Transbordeur rapide'; g.L = 100; g.beh = Math.random() < 0.5 ? 'late' : g.beh; }
      laneFill('E', 5); laneFill('W', 2);
      anchorZone(2);
    } },
  gib_tanger: { n: 'Appareillage de Tanger-Med, de nuit', lvl: 5, vis: 'good', chart: 'gib',
    d: 'Sortie de Tanger-Med vers l\'Atlantique : couper le flux montant vers la Méditerranée dans la zone de prudence, puis rallier la voie ouest. Feux de navires et phares de Tarifa, Carnero et Europa Point.',
    start: [dm(35, 54.6), dmW(5, 30.4)], wpts: [[dm(35, 57.6), dmW(5, 31.1)], [dm(35, 58.0), dmW(5, 35.0)], [dm(35, 57.45), dmW(5, 40.0)], [dm(35, 57.4), dmW(5, 50.0)]],
    env: { windFrom: 80, windKn: 12, curSet: 85, curKn: 1.5, night: true },
    build() {
      laneMeetRoute('E', rnd(0.2, 0.45), rnd(13, 16));
      laneMeetRoute('E', -rnd(0.5, 0.8), rnd(11, 14));
      const j = toXY(dm(35, 58.0), dmW(5, 35.0));
      laneAt('W', j, 3.2, pm(0.2, 0.4), rnd(13, 16));
      laneAt('W', j, -2.5, rnd(0.3, 0.5), 9);
      laneAt('W', j, -7, pm(0.2, 0.5), 18);
      laneFill('E', 4);
      anchorZone(3);
    } },
  gib_alge: { n: 'Arrivée à Algeciras par brume de Levant', lvl: 5, vis: 'poor', chart: 'gib',
    d: 'Venant de l\'Atlantique par la voie est, en brume : rattraper un navire lent, puis couper la voie ouest dans la zone de prudence est pour gagner la baie d\'Algeciras, avec un transbordeur Algeciras / Ceuta.',
    start: [dm(35, 54.6), dmW(5, 40.0)], wpts: [[dm(35, 54.9), dmW(5, 36.5)], [dm(35, 55.5), dmW(5, 34.2)], [dm(35, 57.25), dmW(5, 27.8)], [dm(35, 57.9), dmW(5, 24.5)], [dm(36, 1.6), dmW(5, 23.3)], [dm(36, 5.0), dmW(5, 23.0)]],
    env: { windFrom: 90, windKn: 22, curSet: 80, curKn: 1.5, rain: false },
    build() {
      laneAhead('E', 3.4, pm(0, 0.12), 7.5);
      laneAhead('E', -3, rnd(0.4, 0.6), 18);
      laneMeetRoute('W', rnd(0.2, 0.4), rnd(12, 15));
      laneMeetRoute('W', -rnd(0.4, 0.7), rnd(10, 13));
      const f = addAfterWp(4, 'headon', rnd(4, 6), pm(0.3, 0.5), 24);
      if (f) { f.name = 'Transbordeur rapide'; f.L = 95; }
      laneFill('W', 4);
      // baie d'Algeciras : navires au mouillage de part et d'autre de la route finale (positions indicatives)
      anchorGeo(dm(36, 3.6), dmW(5, 21.4)); anchorGeo(dm(36, 4.4), dmW(5, 24.6)); anchorGeo(dm(36, 2.6), dmW(5, 25.0));
    } },

  // ----- Le Havre (carte schématique, chenal et bassins ; navire allégé à 13,5 m)
  lh_entree: { n: 'Entrée au Havre par le chenal', lvl: 6, vis: 'good', chart: 'lh', draft: 13.5, startKn: 10, tele: 5, xte: 0.08,
    d: 'Du milieu du chenal aux musoirs puis à l\'avant-port : tenir la droite du chenal (R9), croiser un porte-conteneurs sortant, se laisser dépasser par un transbordeur, réduire l\'erre et évoluer dans l\'avant-port. Navire allégé (tirant d\'eau d\'exercice 13,5 m).',
    start: [49.5027, -0.0264], wpts: [[49.4858, 0.0870], [49.4832, 0.1000]],
    env: { windFrom: 230, windKn: 15, curSet: 100, curKn: 1, night: false },
    build() {
      const c = laneShip('LHout', 0.2, 0, 10); if (c) { c.name = 'Porte-conteneurs'; c.L = 300; }
      const o = S.own, q = vec(o.hdg, -1.5), f = mkT('power', o.hdg, 17, o.x + q.x, o.y + q.y);
      f.name = 'Transbordeur'; f.L = 185; f.lane = 'LHin'; f.laneDir = 1; f.laneOff = 0;
      add('fish', rnd(9, 12), pm(0.2, 0.5));
      anchorZone(3);
    } },
  lh_sortie: { n: 'Appareillage de l\'avant-port, de nuit', lvl: 6, vis: 'good', chart: 'lh', draft: 13.5, startKn: 0, tele: 2, xte: 0.08,
    d: 'Navire stoppé dans l\'avant-port, vent de travers : prendre de l\'erre, passer les musoirs, suivre le chenal en tenant la droite et croiser le trafic entrant (porte-conteneurs, transbordeur).',
    start: [49.4829, 0.1030], wpts: [[49.4859, 0.0905], [49.5233, -0.165], [49.5330, -0.2150]],
    env: { windFrom: 250, windKn: 20, curSet: 280, curKn: 0.8, night: true },
    build() {
      const a = laneShip('LHin', 4.5, 0, 12); if (a) { a.name = 'Porte-conteneurs'; a.L = 330; }
      const f = laneShip('LHin', 8.5, 0, 18); if (f) { f.name = 'Transbordeur'; f.L = 185; }
      const o = laneShip('LHout', 6, 0, 10); if (o) o.name = 'Vraquier';
      anchorZone(3);
    } },
  lh_p2000: { n: 'Appareillage de Port 2000', lvl: 6, vis: 'good', chart: 'lh', draft: 14.5, startKn: 0, tele: 2, xte: 0.1,
    d: 'Porte-conteneurs à quai au fond de Port 2000 (évolution du navire stoppé), sortie par l\'accès de Port 2000, croisement d\'un porte-conteneurs entrant, puis le chenal d\'accès jusqu\'à LHA.',
    start: [49.4628, 0.1480], wpts: [[49.4636, 0.1060], [49.4985, 0.0200], [49.5233, -0.165]],
    env: { windFrom: 270, windKn: 22, curSet: 95, curKn: 1.2, night: false },
    build() {
      const a = laneShip('P2in', 2.2, 0, 11); if (a) { a.name = 'Porte-conteneurs'; a.L = 366; }
      const b = laneShip('LHin', 3, 0, 12); if (b) b.name = 'Pétrolier';
      add('fish', rnd(18, 22), pm(0.3, 0.6));
    } },

  // ----- Ouessant (DST « Off Ushant »)
  ush_ne: { n: 'Remontée dans la voie montante d\'Ouessant', lvl: 7, vis: 'good', chart: 'ush',
    d: 'Entrée par le sud dans la voie montante (028° puis 060° au coude) : un navire lent à rattraper, des chalutiers dans la voie, la voie descendante chargée au large.',
    start: [48.560, -5.793], wpts: [[48.6042, -5.7575], [48.78, -5.6158], [48.8446, -5.4475], [48.895, -5.30]],
    env: { windFrom: 240, windKn: 20, curSet: 30, curKn: 1.5, night: false },
    build() {
      laneAhead('NE', 4.5, pm(0, 0.15), 9);
      add('fish', rnd(30, 36), pm(0, 0.4));
      laneAhead('NE', -3, rnd(0.4, 0.6), 19);
      laneFill('SW', 5); laneFill('NE', 2);
    } },
  ush_sw: { n: 'Descente de nuit dans la voie descendante', lvl: 7, vis: 'good', chart: 'ush',
    d: 'Voie descendante de nuit (240° puis 208°), feux de Créac\'h et du Stiff sur bâbord : trafic dense, un navire à contresens, un chalutier en pêche dans la voie.',
    start: [49.009, -5.5055], wpts: [[48.9842, -5.5713], [48.8971, -5.7967], [48.6808, -5.9733], [48.60, -6.03]],
    env: { windFrom: 300, windKn: 16, curSet: 200, curKn: 1.2, night: true },
    build() {
      laneAhead('SW', 5, pm(0, 0.15), 10);
      laneShip('SW', 14, pm(0.3, 0.6), 13, { dir: -1, beh: 'wrong' });
      add('fish', rnd(26, 32), pm(0, 0.4));
      laneFill('SW', 4); laneFill('NE', 5);
    } },
  ush_brume: { n: 'Rejoindre la voie montante par brume', lvl: 7, vis: 'poor', chart: 'ush',
    d: 'Venant du large au sud-ouest, rejoindre la voie montante à son extrémité sous un faible angle (R10b(iii)), radar seul, puis la suivre : trafic de la voie et navires qui la quittent.',
    start: [48.500, -5.960], wpts: [[48.6042, -5.7575], [48.78, -5.6158], [48.8446, -5.4475]],
    env: { windFrom: 200, windKn: 10, curSet: 40, curKn: 1, rain: false },
    build() {
      laneAhead('NE', 6, pm(0, 0.2), 11);
      laneMeetRoute('NE', rnd(0.4, 0.7), rnd(12, 15));
      laneFill('NE', 3); laneFill('SW', 4);
      add('gw', rnd(22, 28), pm(0, 0.3));
    } },
};

// ---------------------------------------------------------------- trafic des voies du DST

interface LaneOpt { type?: TargetType; dir?: 1 | -1; beh?: Behaviour }

/** Navire qui suit une voie : abscisse s (NM) sur l'axe, décalage latéral off (NM, + = tribord du sens réglementaire). */
export function laneShip(id: string, s: number, off: number, spd: number, o: LaneOpt = {}): Target | null {
  const l = laneOf(id);
  if (!l) return null;
  const p = pointAt(l.axis, clamp(s, 0, polyLength(l.axis))), n = vec(p.brg + 90, off), dir = o.dir ?? 1;
  const t = mkT(o.type ?? 'power', n360(dir > 0 ? p.brg : p.brg + 180), spd, p.x + n.x, p.y + n.y);
  t.lane = id; t.laneDir = dir; t.laneOff = off;
  if (o.beh) t.beh = o.beh;
  return t;
}

/** Navire de voie placé à `ds` NM devant (ou derrière si < 0) le porteur le long de l'axe, décalé de `dOff` NM vers tribord. */
export function laneAhead(id: string, ds: number, dOff: number, spd: number, o: LaneOpt = {}): Target | null {
  const l = laneOf(id);
  if (!l) return null;
  const me = S.own, p = projOnPolyline(l.axis, me.x, me.y), sgn = Math.abs(adiff(me.hdg, p.brg)) < 90 ? 1 : -1;
  return laneShip(id, p.s + sgn * ds, p.d + dOff, spd, o);
}

/**
 * Navire de voie qui passera, dans `Tmin` minutes, au point où le porteur coupe l'axe de la voie,
 * décalé de `miss` NM le long de la voie (> 0 : il passe devant le point de rencontre).
 */
export function laneMeet(id: string, Tmin: number, miss: number, spd: number, o: LaneOpt = {}): Target | null {
  const l = laneOf(id);
  if (!l) return null;
  const me = S.own, T = Tmin * 60, dir = o.dir ?? 1;
  const P = { x: me.x + me.vx * K2N * T, y: me.y + me.vy * K2N * T }, pr = projOnPolyline(l.axis, P.x, P.y);
  const g = gv(dir > 0 ? pr.brg : pr.brg + 180, spd, 0.035), u = vec(pr.brg, 1), vAlong = g.x * u.x + g.y * u.y;
  return laneShip(id, pr.s + miss - vAlong * K2N * T, pr.d + pm(0, 0.15), spd, o);
}

/** Navire de voie placé à `ds` NM le long de l'axe à partir de la projection du point `p`, décalé de `dOff` NM vers tribord. */
export function laneAt(id: string, p: { x: number; y: number }, ds: number, dOff: number, spd: number, o: LaneOpt = {}): Target | null {
  const l = laneOf(id);
  if (!l) return null;
  const pr = projOnPolyline(l.axis, p.x, p.y);
  return laneShip(id, pr.s + ds, pr.d + dOff, spd, o);
}

/**
 * Comme laneMeet, mais au point où la ROUTE prévue du porteur (points tournants compris) coupe l'axe de la voie :
 * le navire de voie y passe au moment où le porteur l'atteint, décalé de `miss` NM le long de la voie.
 */
export function laneMeetRoute(id: string, miss: number, spd: number, o: LaneOpt = {}): Target | null {
  const l = laneOf(id), r = S.route, me = S.own;
  if (!l || !r) return null;
  const path = [{ x: me.x, y: me.y }, ...r.wps.slice(r.leg + 1)];
  let acc = 0, hit: { x: number; y: number; d: number } | null = null;
  for (let i = 0; i < path.length - 1 && !hit; i++) {
    const a = path[i], b = path[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y);
    let best = Infinity;
    for (let k = 0; k < l.axis.length - 1; k++) {
      const c = l.axis[k], e = l.axis[k + 1], den = (b.x - a.x) * (e.y - c.y) - (b.y - a.y) * (e.x - c.x);
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c.x - a.x) * (e.y - c.y) - (c.y - a.y) * (e.x - c.x)) / den, u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < best) best = t;
    }
    if (best <= 1) hit = { x: a.x + (b.x - a.x) * best, y: a.y + (b.y - a.y) * best, d: acc + L * best };
    acc += L;
  }
  if (!hit) return null;
  const T = (hit.d / Math.max(Math.hypot(me.vx, me.vy), 1)) * 3600, dir = o.dir ?? 1, pr = projOnPolyline(l.axis, hit.x, hit.y);
  const g = gv(dir > 0 ? pr.brg : pr.brg + 180, spd, 0.035), u = vec(pr.brg, 1), vAlong = g.x * u.x + g.y * u.y;
  return laneShip(id, pr.s + miss - vAlong * K2N * T, pr.d + pm(0, 0.15), spd, o);
}

/** Trafic de fond dans une voie : n navires répartis le long de l'axe, à distance du porteur et entre eux. */
export function laneFill(id: string, n: number): void {
  const l = laneOf(id);
  if (!l) return;
  const L = polyLength(l.axis), me = S.own;
  for (let k = 0, placed = 0; k < 60 && placed < n; k++) {
    const s = rnd(0.5, L - 0.5), off = pm(0, 1.3), p = pointAt(l.axis, s), q = vec(p.brg + 90, off), x = p.x + q.x, y = p.y + q.y;
    if (Math.hypot(x - me.x, y - me.y) < 2.5 || S.targets.some((t) => Math.hypot(t.x - x, t.y - y) < 1)) continue;
    if (depthAt(x, y) < 30 || tssAt(x, y).kind !== `lane${id}`) continue;
    laneShip(id, s, off, rnd(10, 19), { type: Math.random() < 0.2 ? 'small' : 'power' });
    placed++;
  }
}

/** Navire au mouillage en (x, y) (NM), évité au vent (au courant par vent faible). */
export function anchorAt(x: number, y: number): Target | null {
  if (depthAt(x, y) < 15) return null;
  const e = S.env, lie = e.windKn >= 6 ? e.windFrom : n360(e.curSet + 180);
  const t = mkT('anchor', n360(lie + pm(0, 12)), 0, x, y);
  t.vx = 0; t.vy = 0;
  return t;
}
/** Navire au mouillage à `Tmin` minutes sur l'avant du porteur, à `off` NM sur le côté (positif = tribord). */
export function anchorAhead(Tmin: number, off: number): Target | null {
  const o = S.own, p = vec(o.hdg, (Math.max(o.stw, 5) * Tmin) / 60), q = vec(o.hdg + 90, off);
  return anchorAt(o.x + p.x + q.x, o.y + p.y + q.y);
}
/** Navire au mouillage à une position géographique (WGS 84). */
export function anchorGeo(lat: number, lon: number): Target | null {
  const p = toXY(lat, lon);
  return anchorAt(p.x, p.y);
}
/** Navires au mouillage dans la première zone de mouillage de la carte (Mouillage Alpha à Gibraltar, zone d'attente du Havre). */
function anchorZone(n: number): void {
  const a = CHART.anch[0];
  if (!a) return;
  for (let i = 0; i < n; i++) { const v = vec((360 / n) * i + rnd(0, 40), a.r * rnd(0.3, 0.8)); anchorAt(a.x + v.x, a.y + v.y); }
}

function shuffle<T>(a: T[]): T[] { return a.sort(() => Math.random() - 0.5); }

const wOf = (type: TargetType): number => (type === 'sail' ? 0.01 : type === 'nuc' ? 0.06 : 0.035);

/** Applique les réglages imposés par un scénario (visibilité, vent, grains…). */
export function applyScenarioEnv(key: string): void {
  const sc = SCEN[key];
  if (sc.vis) S.env.vis = sc.vis;
  S.env.rain = false;
  if (sc.env) Object.assign(S.env, sc.env);
}

/** Nom fictif sans doublon dans l'exercice. */
function shipName(type: TargetType): string {
  const list = SHIP_NAMES[type === 'fish' ? 'fish' : type === 'sail' ? 'sail' : 'merchant'];
  const free = list.filter((n) => !S.targets.some((t) => t.vname === n));
  return free.length ? pick(free) : `${pick(list)} ${S.nextTid}`;
}

export function mkT(type: TargetType, hdg: number, stw: number, x: number, y: number): Target {
  const T = TT[type], L = Math.round(rnd(T.L[0], T.L[1]));
  const t: Target = {
    id: S.nextTid++, type, name: pick(T.n), L, x, y, hdg, stw, cmdHdg: hdg, cmdStw: stw, baseHdg: hdg, baseStw: stw, rot: 0,
    maxRot: L > 250 ? 0.45 : L > 150 ? 0.7 : L > 60 ? 1.1 : 2.5, tau: L > 150 ? 25 : L > 60 ? 14 : 6,
    acc: L > 150 ? 220 : 90, dec: L > 150 ? 380 : 130, wind: wOf(type), rcs: clamp(L / 70, 0.3, 5), beh: pickBeh(),
    ai: { state: 'transit', role: null, cool: 0 }, echo: null, nextFish: S.t + rnd(600, 1200), vx: 0, vy: 0,
    ais: null, vname: shipName(type),
  };
  t.ais = makeAis(type, t.vname);
  const g = gv(hdg, stw, t.wind);
  t.vx = g.x; t.vy = g.y;
  S.targets.push(t);
  return t;
}

function ownRef(): Ref {
  const o = S.own;
  return { x: o.x, y: o.y, hdg: o.hdg, stw: o.stw, vx: o.vx, vy: o.vy, t0: 0 };
}

/** Place une rencontre `Tmin` minutes après le passage au point tournant `wp` de la route. */
export function addAfterWp(wp: number, kind: Kind, Tmin: number, off: number, spd?: number): Target | null {
  const r = S.route, o = S.own;
  if (!r || wp >= r.wps.length - 1) return add(kind, Tmin, off, ownRef(), spd);
  const p = r.wps[wp], q = r.wps[wp + 1], hdg = brgOf(q.x - p.x, q.y - p.y);
  const sog = Math.max(Math.hypot(o.vx, o.vy), 1), t0 = (Math.hypot(p.x - o.x, p.y - o.y) / sog) * 3600;
  const w = vec(hdg, o.stw), c = vec(S.env.curSet, S.env.curKn);
  return add(kind, t0 / 60 + Tmin, off, { x: p.x, y: p.y, hdg, stw: o.stw, vx: w.x + c.x, vy: w.y + c.y, t0 }, spd);
}

/** Place une cible du type demandé pour un rapprochement au CPA `off` (NM) dans `Tmin` minutes (vitesse imposée `spdOver`, kn). */
export function add(kind: Kind, Tmin: number, off: number, ref: Ref = ownRef(), spdOver?: number): Target | null {
  const o = ref, H = o.hdg, os = o.stw, me = S.own;
  const want = ({ headon: 'headon', gw: 'giveway', so: 'standon', overtake: 'overtaking', overtaken: 'overtaken' } as Record<string, string>)[kind];
  const rMax = ref.t0 > 0 ? 14 : 11.5;
  for (let k = 0; k < 160; k++) {
    if (k === 80) Tmin *= 1.3;
    let type: TargetType = 'power', hdg: number, spd: number;
    switch (kind) {
      case 'headon': hdg = H + 180 + rnd(-4, 4); spd = rnd(10, 18); break;
      case 'gw': hdg = H - rnd(55, 125); spd = rnd(11, 19); break;
      case 'so': hdg = H + rnd(55, 125); spd = rnd(11, 19); break;
      case 'overtake': hdg = H + rnd(-10, 10); spd = os * rnd(0.4, 0.6); break;
      case 'overtaken': hdg = H + rnd(-12, 12); spd = Math.min(os + rnd(5, 9), 28); break;
      case 'fish': type = 'fish'; hdg = rnd(0, 360); spd = rnd(2.5, 4); break;
      case 'nuc': type = 'nuc'; hdg = rnd(0, 360); spd = 0; break;
      case 'sail': type = 'sail'; hdg = H + pm(40, 140); spd = rnd(4, 7); break;
      default: type = Math.random() < 0.25 ? 'small' : 'power'; hdg = rnd(0, 360); spd = rnd(8, 20);
    }
    if (spdOver !== undefined) spd = spdOver;
    hdg = n360(hdg);
    const tv = gv(hdg, spd, wOf(type)), T = Tmin * 60, dT = T - o.t0;
    if (dT < 120) continue;
    const mx = o.x + o.vx * K2N * dT, my = o.y + o.vy * K2N * dT;
    const rvx = tv.x - o.vx, rvy = tv.y - o.vy, rl = Math.hypot(rvx, rvy);
    if (rl < 1) continue;
    const nx = -rvy / rl, ny = rvx / rl;
    const x = mx - tv.x * K2N * T + nx * off, y = my - tv.y * K2N * T + ny * off;
    const r = Math.hypot(x - me.x, y - me.y);
    if (r < 2.5 || r > rMax) continue;
    if (depthAt(x, y) < 15) continue; // jamais à terre ni sur un banc
    // géométrie vue depuis la référence (au point tournant pour une rencontre après abattée)
    const px = x + tv.x * K2N * o.t0, py = y + tv.y * K2N * o.t0;
    const tb = n360(brgOf(px - o.x, py - o.y) - H);
    if (want && roleOf({ x: o.x, y: o.y, hdg: H, stw: os, type: 'power' }, { x: px, y: py, hdg, stw: spd, type }, 'good') !== want) continue;
    if ((kind === 'fish' || kind === 'nuc' || kind === 'sail') && tb > 100 && tb < 260) continue;
    return mkT(type, hdg, spd, x, y);
  }
  return null;
}

export function newScenario(): void {
  const sh = SHIPS[S.shipKey] ?? SHIPS[DEFAULT_SHIP], sc = SCEN[S.scen];
  const chart = loadChart(sc.chart ?? 'open');
  const lim = sc.xte ?? (S.route && S.route.xteLim < 0.5 ? 1 : S.route?.xteLim ?? 1), show = S.route?.show ?? true;
  let H: number, x0 = 0, y0 = 0, route: Route;
  if (sc.start && sc.wpts) {
    // départ et route géographiques
    const p0 = toXY(sc.start[0], sc.start[1]), w = sc.wpts.map(([la, lo]) => toXY(la, lo));
    const h = brgOf(w[0].x - p0.x, w[0].y - p0.y), back = vec(h, sc.xte ? 0.15 : 2);
    H = Math.round(h); x0 = p0.x; y0 = p0.y;
    route = { wps: [{ x: x0 - back.x, y: y0 - back.y }, ...w], leg: 0, xteLim: lim, show, maxXte: 0, tOver: 0 };
  } else {
    H = Math.round(rnd(0, 359));
    route = { ...makeRoute(0, 0, H, sc.legs ?? [[0, 60]], lim), show };
  }
  const v0 = sc.startKn ?? sh.max, tele0 = sc.tele ?? TELE_SEA;
  S.own = { x: x0, y: y0, hdg: H, cmdHdg: H, stw: v0, rot: 0, rud: 0, tele: tele0, ap: true, manRud: 0, rudLim: 20, ship: sh, type: 'power', L: sh.L, vx: 0, vy: 0, u: 0, v: 0, r: 0, n: 0, revUntil: 0, draft: sc.draft };
  initOwnDynamics(S.own, v0);
  const w = vec(H, v0), c = vec(S.env.curSet, S.env.curKn);
  S.own.vx = w.x + c.x; S.own.vy = w.y + c.y;
  Object.assign(S, {
    t: 0, targets: [], tracks: [], clutter: [], hist: [], enc: {}, log: [], sweep: 0, sel: null, trackSeq: 1,
    aiAcc: 0, encAcc: 0, histAcc: 0, spdPoor: [0, 0], over: false, collided: null, report: null, started: false, paused: true,
    alerts: [], rainCells: [], silencedUntil: 0, route,
    chart: chart.key, coast: null, markEcho: {}, ownTrack: [], tss: newTssWatch(), grounded: false, contact: null, navAlerts: [], snd: newSoundState(),
  });
  Object.assign(S.ecdis, { ebl: null, vrm: null, routeIssues: [] });
  S.rec = newRecording();
  Object.assign(S.radar, {
    cuRef: H, trialHdg: H, trialSpd: Math.round(v0), trial: false, trialT0: 0, tmC: { x: x0, y: y0 }, off: { x: 0, y: 0 }, offMode: 'OFF',
    ebl: [null, null], vrm: [null, null], pi: [null, null, null, null],
  });
  if (sc.xte) S.radar.range = 1.5; // exercice de port : échelle courte
  // contour de sécurité : 15 m pour un navire allégé (chenal dragué à 17,5 m), 30 m sinon
  S.ecdis.safety = sc.draft ? 15 : S.ecdis.safety === 15 ? 30 : S.ecdis.safety;
  sc.build();
  logE(`Exercice : ${sc.n} — ${sh.n}, route ${p3(H)}°, ${TELE[tele0].n}${sc.draft ? `, tirant d'eau d'exercice ${sc.draft.toFixed(1)} m` : ''}`);
}
