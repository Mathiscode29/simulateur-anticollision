# Feuille de route

Objectif : un simulateur d'anticollision de niveau chef de quart / commandant, partageable avec la promo par une simple URL.

## Phase 0 — Mise en place
- [x] Dépôt GitHub
- [x] Code découpé en modules TypeScript (core / sim / ui), simulation testable sans navigateur
- [x] Tests du moteur de règles et des scénarios (Vitest)
- [x] CLAUDE.md et feuille de route
- [x] Déploiement GitHub Pages automatique
- [ ] Mode hors ligne (PWA : manifeste + service worker) pour l'utilisation à bord
- [ ] Bandeau « outil d'entraînement, non agréé STCW » dans l'interface

## Phase 1 — Moteur
- [ ] Modèle de manœuvrabilité 3 DDL type MMG (dérive, embardée, lacet) avec caractéristiques de navires réels
- [ ] Effet des petits fonds (squat, perte de manœuvrabilité)
- [ ] Courant de marée variable dans l'espace et le temps
- [ ] Inertie machine réaliste (délais de renversement, crash stop)

## Phase 2 — Zone réelle et DST
- [ ] Zone du Pas-de-Calais ou d'Ouessant à partir de données libres (OpenStreetMap, coordonnées publiées des DST)
- [ ] Côte, échos de terre, zones d'ombre radar
- [ ] Trafic IA conforme à R10 : flux dans les voies, ferries traversiers, pêcheurs dans la zone de séparation
- [ ] Interaction entre cibles (elles s'évitent entre elles)

## Phase 3 — Interface professionnelle
- [ ] Présentation radar conforme IEC 62388 / MSC.192(79) (cartouches, curseur, données cibles, symbologie)
- [ ] AIS avec ses erreurs (latence, cap/vitesse faux, cibles sans AIS)
- [ ] Gestion des alertes (alarmes, avertissements, acquittement)
- [ ] ECDIS simplifié

## Phase 4 — Pédagogie
- [ ] Rejeu chronologique du débrief
- [ ] Éditeur de scénarios pour instructeur, partage par lien
- [ ] Progression de difficulté et banque de scénarios
- [ ] Validation des scénarios par un professeur d'exploitation de l'ENSM

## Phase 5 — Vue passerelle 3D
- [ ] Vue extérieure (Three.js) liée au radar
- [ ] Feux et marques conformes au RIPAM, jour / nuit / brume

## Garde-fous permanents
- Ergonomie inspirée des consoles du marché, sans logo ni charte de constructeur : la norme IEC suffit
- Outil complémentaire, non agréé STCW
- Moteur de règles testé avant chaque diffusion à la promo
