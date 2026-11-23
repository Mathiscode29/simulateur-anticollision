# Feuille de route

Objectif : un simulateur d'anticollision de niveau chef de quart / commandant, sur ordinateur, partageable par une simple URL, suffisamment abouti pour être présenté à un armement. Positionnement : entraînement individuel « de poche » en complément des simulateurs certifiés (référence de qualité : DNV-ST-0033, classe D).

## Phase 0 — Mise en place
- [x] Dépôt GitHub
- [x] Code découpé en modules TypeScript (core / sim / ui), simulation testable sans navigateur
- [x] Tests du moteur de règles et des scénarios (Vitest)
- [x] CLAUDE.md et feuille de route
- [x] Déploiement GitHub Pages automatique
- [x] Licence : tous droits réservés
- [ ] Mode hors ligne (PWA : manifeste + service worker) pour l'utilisation à bord
- [x] Bandeau « outil d'entraînement, non agréé STCW » dans l'interface

## Phase 1 — Moteur (axe 1 : vrais modèles de navire)
- [x] Modèle MMG 3 DDL (méthode standard Yasukawa & Yoshimura 2015), intégration RK4
- [x] Premier navire validé : KVLCC2 (VLCC 320 m)
- [x] Tests automatiques des critères OMI MSC.137(76) + rapport `docs/manoeuvrabilite.md`
- [x] Machine : variation de régime limitée, attente au renversement, arrêt d'urgence
- [x] Vent appliqué en efforts (fardage) sur le modèle MMG
- [ ] Comparaison chiffrée avec les essais libres publiés (SIMMAN) et recalage
- [x] Un seul navire porteur pour l'instant (KVLCC2) ; anciens modèles simplifiés retirés
- [ ] Porte-conteneurs KCS (230 m) : en attente d'un jeu de coefficients MMG publié complet (voir CLAUDE.md), puis validation contre les giration en essais libres (avance ≈ 2,9 L, diamètre tactique ≈ 2,9 L Td / 2,6 L Bd)
- [ ] Ensuite seulement : grand porte-conteneurs (ULCV) avec fardage des piles de conteneurs
- [ ] Secteur aveugle sur l'avant (SOLAS V/22) pour les porte-conteneurs
- [ ] Effet des petits fonds (squat, perte de manœuvrabilité)
- [ ] Courant de marée variable dans l'espace et le temps

## Phase 1 bis — Exercices et route
- [x] Route prévue en rouge sur le radar, couloir d'écart, points tournants, XTE / distance et relèvement du WP
- [x] Tenue de route dans le bilan (écart maximal, temps hors couloir, reprise de la route)
- [x] 22 exercices sur quatre niveaux (fondamentaux, situations combinées, avancé, Pas-de-Calais), dont rencontres après point tournant et avarie en croisement
- [ ] Éditeur d'exercices et partage par lien (voir phase 4)

## Phase 2 — Zone réelle et DST
- [x] Zone du Pas-de-Calais à partir de données libres (trait de côte OpenStreetMap, DST d'après COLREG.2/Circ.59), géoréférencement WGS 84
- [x] Côte, échos de terre et de bouées, zones d'ombre radar (masquage derrière la terre)
- [x] Trafic IA qui suit les voies du DST, ferry traversier, navire à contresens ; évaluation de la règle 10
- [x] Trois exercices du Pas-de-Calais (traversée R10c, rattrapement en brume voie NE, navire à contresens voie SW)
- [ ] Bathymétrie réelle libre (EMODnet) à la place du modèle schématique ; marée (hauteur et courants)
- [ ] Pêcheurs dans la zone de séparation, routes des ferries Douvres–Calais
- [ ] Zone d'Ouessant (DST d'Ouessant)
- [x] Interaction entre cibles : elles s'évitent entre elles selon le RIPAM, mal en trafic imprévisible (quasi-abordages, abordages)
- [x] Avaries (machine, barre, abordage) et changements de statut annoncés par VHF / AIS, rôle du porteur réévalué (R18)

## Phase 3 — Interface professionnelle (priorité ordinateur)
- [x] Présentation radar selon MSC.192(79) / SN.1/Circ.243 : échelles, RM/TM, décentrage, 2 EBL/VRM, 4 PI, curseur, symboles, positions passées, données cible (grille : docs/conformite-radar.md)
- [x] Vidéo : gain, anti-clutter mer (auto/manuel) et pluie, bandes X/S, grains
- [x] Gestion des alertes (alarme / avertissement / attention, acquittement, son)
- [x] Mise en page poste fixe et raccourcis clavier ; palettes jour / crépuscule / nuit
- [x] AIS : classes A et B, cadences, cibles sans AIS, association radar/AIS, superposition au radar
- [ ] Erreurs AIS (cap ou vitesse faux, MMSI dupliqué, position décalée), filtrage des cibles AIS
- [ ] Confrontation à la norme d'essai IEC 62388
- [x] ECDIS simplifié : position en latitude / longitude, carte de la zone, isobathes et hauts-fonds, contour de sécurité et alarme, DST, AIS/ARPA, EBL/VRM, tracé et vérification de route ; vues Radar / ECDIS / côte à côte
- [ ] ECDIS : couloir de route par segment, alarmes d'arrivée au WP, suivi de route automatique (track control), superposition radar sur la carte
- [ ] Interface en anglais (langue de travail des équipages internationaux)
- [ ] Ordres à la barre à la voix en anglais SMCP (reconnaissance vocale du navigateur)

## Phase 4 — Pédagogie
- [ ] Rejeu chronologique du débrief
- [ ] Éditeur de scénarios pour instructeur, partage par lien
- [ ] Progression de difficulté et banque de scénarios
- [ ] Validation des scénarios par un professeur d'exploitation de l'ENSM
- [ ] Bilan rattaché aux compétences STCW (tableau A-II/1)
- [ ] Zones sur les routes de l'armement (Pas-de-Calais, Gibraltar, détroit de Singapour)

## Phase 5 — Vue passerelle
- [x] Vue extérieure liée à la simulation (canvas 2D en perspective, sans bibliothèque 3D) : regard sur 180°, jumelles 7×, horizon et rotondité, brume, nuit, côte, bouées
- [x] Feux de navigation selon les secteurs de l'annexe I et marques de jour, jour / nuit / brume
- [x] Disposition « Passerelle » : triangle du chef de quart (visuel en haut, radar en bas à gauche, ECDIS en bas à droite)
- [ ] Mouvements de plate-forme (roulis, tangage) et état de la mer selon le vent
- [ ] Signaux sonores (brume, R34) audibles et relevés au visuel

## Garde-fous permanents
- Ergonomie inspirée des consoles du marché, sans logo ni charte de constructeur : la norme IEC suffit
- Outil complémentaire, non agréé STCW
- Moteur de règles testé avant chaque diffusion à la promo
