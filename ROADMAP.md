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
- [ ] Bandeau « outil d'entraînement, non agréé STCW » dans l'interface

## Phase 1 — Moteur (axe 1 : vrais modèles de navire)
- [x] Modèle MMG 3 DDL (méthode standard Yasukawa & Yoshimura 2015), intégration RK4
- [x] Premier navire validé : KVLCC2 (VLCC 320 m)
- [x] Tests automatiques des critères OMI MSC.137(76) + rapport `docs/manoeuvrabilite.md`
- [x] Machine : variation de régime limitée, attente au renversement, arrêt d'urgence
- [x] Vent appliqué en efforts (fardage) sur le modèle MMG
- [ ] Comparaison chiffrée avec les essais libres publiés (SIMMAN) et recalage
- [ ] Porte-conteneurs : KCS (230 m) puis grand porte-conteneurs (ULCV) avec fardage des piles de conteneurs
- [ ] Remplacer les modèles Nomoto restants (ferry, navire d'expédition) par des jeux MMG sourcés
- [ ] Secteur aveugle sur l'avant (SOLAS V/22) pour les porte-conteneurs
- [ ] Effet des petits fonds (squat, perte de manœuvrabilité)
- [ ] Courant de marée variable dans l'espace et le temps

## Phase 2 — Zone réelle et DST
- [ ] Zone du Pas-de-Calais ou d'Ouessant à partir de données libres (OpenStreetMap, coordonnées publiées des DST)
- [ ] Côte, échos de terre, zones d'ombre radar
- [ ] Trafic IA conforme à R10 : flux dans les voies, ferries traversiers, pêcheurs dans la zone de séparation
- [ ] Interaction entre cibles (elles s'évitent entre elles)

## Phase 3 — Interface professionnelle (priorité ordinateur)
- [ ] Présentation radar conforme IEC 62388 / MSC.192(79) (cartouches, curseur, données cibles, symbologie)
- [ ] AIS avec ses erreurs (latence, cap/vitesse faux, cibles sans AIS)
- [ ] Gestion des alertes (alarmes, avertissements, acquittement)
- [ ] ECDIS simplifié
- [ ] Mise en page poste fixe (≥ 1280 px) : radar plein écran, conning, panneaux latéraux
- [ ] Interface en anglais (langue de travail des équipages internationaux)
- [ ] Ordres à la barre à la voix en anglais SMCP (reconnaissance vocale du navigateur)

## Phase 4 — Pédagogie
- [ ] Rejeu chronologique du débrief
- [ ] Éditeur de scénarios pour instructeur, partage par lien
- [ ] Progression de difficulté et banque de scénarios
- [ ] Validation des scénarios par un professeur d'exploitation de l'ENSM
- [ ] Bilan rattaché aux compétences STCW (tableau A-II/1)
- [ ] Zones sur les routes de l'armement (Pas-de-Calais, Gibraltar, détroit de Singapour)

## Phase 5 — Vue passerelle 3D
- [ ] Vue extérieure (Three.js) liée au radar
- [ ] Feux et marques conformes au RIPAM, jour / nuit / brume

## Garde-fous permanents
- Ergonomie inspirée des consoles du marché, sans logo ni charte de constructeur : la norme IEC suffit
- Outil complémentaire, non agréé STCW
- Moteur de règles testé avant chaque diffusion à la promo
