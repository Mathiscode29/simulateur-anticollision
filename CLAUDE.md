# Simulateur anticollision — instructions projet

Simulateur radar/ARPA et ECDIS web pour s'entraîner à l'anticollision (RIPAM / COLREG). Public : élèves officiers de l'ENSM, niveau visé chef de quart puis commandant. Porteur du projet : Mathis (élève officier, brevet de chef de quart). Feuille de route : `ROADMAP.md`.

## Commandes

- `npm run dev` : serveur de développement (Vite)
- `npm test` : tests (Vitest), à faire passer avant tout commit
- `npm run build` : vérification TypeScript + build dans `dist/`
- `npm run manoeuvrabilite` : régénère `docs/manoeuvrabilite.md` (manœuvres OMI simulées des navires MMG)
- Déploiement : automatique sur GitHub Pages à chaque push sur `main` (`.github/workflows/deploy.yml`)

## Architecture

```
src/core/   util.ts (maths, conventions), data.ts (navires, transmetteur, types de cibles), state.ts (types + état global S),
            geo.ts (WGS 84 ↔ plan local, format marin), ships/ (jeux de paramètres MMG sourcés, un fichier par navire),
            charts/ (données de carte sourcées : types.ts, pasdecalais.ts, gibraltar.ts ; pasdecalais-land.ts et gibraltar-land.ts sous ODbL)
src/sim/    mmg.ts (modèle MMG 3 DDL, SI), manoeuvres.ts (giration, zigzag, arrêt, critères OMI MSC.137(76)),
            physics.ts (porteur MMG, machine, vent/courant, cinématique des cibles), radar.ts (balayage, gain/mer/pluie, bandes X/S,
            grains, échos de côte et de bouées, masquage, poursuite TT, zone d'acquisition, trial), alerts.ts (alertes et acquittement, sans DOM),
            chart.ts (carte compilée en plan local, bathymétrie schématique, isobathes, zones du DST, suivi de voie, lancer de rayons,
            vérification de route), ais.ts (AIS classes A/B, cadences, association radar/AIS), nav.ts (alarmes ECDIS, échouement, règle 10),
            route.ts (route prévue, points tournants, écart latéral XTE),
            rules.ts (roleOf + IA des cibles : évitement du porteur et des autres cibles, R17a(ii), dernière minute),
            faults.ts (avaries machine/barre, abordage entre cibles, réparation, messages VHF/AIS nominatifs), assessment.ts (suivi des situations, évaluation, rapport),
            scenarios.ts (25 exercices sur 5 niveaux, rencontres après point tournant, trafic des voies du DST), visual.ts (feux, marques,
            signaux de brume, feux et marques en 3D pour la vue extérieure), debrief.ts (enregistrement de l'exercice, analyse et moments clés
            du débrief), loop.ts (pas de simulation)
src/ui/     render.ts (scope PPI : modes RM/TM, décentrage, symboles SN.1/Circ.243, EBL/VRM/PI, curseur, côte, AIS, palettes),
            ecdis.ts (vue ECDIS : couches précalculées, DST, bouées, AIS/ARPA, route, EBL/VRM, HUD),
            debrief.ts (rejeu : tracé vrai / relatif, graphe des distances, commentaire des moments clés),
            outside.ts (vue extérieure canvas 2D en perspective : regard ± 90°, jumelles, horizon, brume, nuit, côte, cibles et feux,
            état de la mer, roulis / tangage, bouées, console d'instruments),
            rudder.ts (répétiteurs de l'onglet Barre : angle de barre réel et ordonné, ROT), telegraph.ts (transmetteur d'ordres vertical à manette, réponse machine),
            controls.ts (DOM, vues Radar / ECDIS / Radar + ECDIS / Visuel / Passerelle / Débrief, panneaux, alertes, clavier/souris, son), style.css (palettes jour/crépuscule/nuit)
tests/      rules.test.ts (moteur de règles), simulation.test.ts (scénarios sans affichage, évaluation),
            manoeuvrabilite.test.ts (critères OMI sur chaque navire MMG), alertes.test.ts (cycle des alertes radar),
            route.test.ts (XTE, points tournants, rencontres après abattée), pasdecalais.test.ts (géoréférencement, carte, AIS, R10, ECDIS),
            gibraltar.test.ts (DST COLREG.2/Circ.66, zones de prudence, trafic des voies, exercices),
            trafic.test.ts (évitement entre cibles, avaries, changement de rôle), visuel.test.ts (feux 3D et marques de jour),
            debrief.test.ts (enregistrement, interpolation, moments clés), radar.test.ts (datation des échos, balayage continu, vecteurs surface et fond)
docs/       manoeuvrabilite.md (généré), conformite-radar.md (grille MSC.192(79) / SN.1/Circ.243 / repères ECDIS, à tenir à jour),
            carte-pas-de-calais.md, carte-gibraltar.md (sources et limites des cartes)
scripts/    manoeuvrabilite.ts (rapport de manœuvrabilité)
```

Règle d'architecture : **`src/core` et `src/sim` n'accèdent jamais au DOM**. Toute la simulation doit tourner en test sans navigateur. L'interface lit `S` et appelle les fonctions de `sim/`.

## Conventions

- Langue : interface, commentaires, messages de commit et docs en **français**, vocabulaire professionnel maritime (CPA/TCPA, relèvement, aspect, abattée, privilégié/non privilégié…).
- Unités : milles nautiques, nœuds, degrés, secondes. Repère local x = est, y = nord ; caps et relèvements de 0 à 360 dans le sens horaire depuis le nord.
- Pas de simulation fixe de 0,25 s (`DT`), indépendant de l'affichage et de l'accélération du temps. Le radar date chaque écho du passage du faisceau sur son relèvement ; l'écran radar est affiché avec un pas de retard (`tv = S.t − DT + fraction`) pour un balayage continu.
- L'évaluation du chef de quart (`assessment.ts`) utilise la vérité terrain ; chaque message de bilan cite la règle RIPAM concernée. Exception : la tenue de route (écart, reprise de la route) relève de la bonne pratique et du plan de traversée, sans pénalité sur la note.
- Un nouvel exercice = une entrée de `SCEN` avec niveau, description, environnement imposé éventuel et route ; le test générique de `simulation.test.ts` le couvre automatiquement. Exercice sur carte réelle : `chart: 'pdc'` ou `'gib'`, départ `start` et points tournants `wpts` en latitude / longitude WGS 84 ; trafic des voies avec `laneShip`, `laneMeet`, `laneMeetRoute` (au croisement de la route prévue), `laneAhead`, `laneAt`, `laneFill` (identifiants de voie : NE/SW au Pas-de-Calais, W/E à Gibraltar). Nouvelle carte : un `ChartSource` dans `src/core/charts/` (types communs dans `types.ts`), enregistré dans `SOURCES` de `sim/chart.ts`.
- Positions : le moteur travaille en plan local (NM) ; toute donnée géographique est saisie en WGS 84 et convertie par `core/geo.ts`. Affichage au format marin (51°02,345'N 001°23,456'E).
- Les vues (radar, ECDIS, vue extérieure) ne font que lire `S` : changer de vue n'interrompt jamais la simulation. La vue extérieure reste volontairement simple (canvas 2D, pas de bibliothèque 3D) pour rester fluide.
- Toute modification de `rules.ts` ou `assessment.ts` s'accompagne d'un test dans `tests/`.
- Les jalons du débrief (TCPA 12 min, seuil tardif 5 min / 6 min en brume, R17a(ii) à TCPA 8 min, R17b) restent alignés sur les seuils de `assessment.ts` ; ils sont présentés comme des repères de bonne pratique, pas comme des valeurs du RIPAM.
- Les tests qui supposent un trafic sans incident forcent `S.env.faults = 'off'` (les avaries aléatoires sont « rares » par défaut).
- Chaque cible a un nom (`vname`), repris par l'AIS : tout message concernant une cible la désigne par son nom, sa piste radar et sa position relative (`callName`).

## Références métier

- RIPAM (règlement international pour prévenir les abordages en mer, COLREG 1972 amendé), règles 5 à 19, 35, annexe I.
- Radar/ARPA : résolution OMI MSC.192(79) et symboles SN.1/Circ.243/Rev.2 (grille de suivi : `docs/conformite-radar.md`, à mettre à jour à chaque évolution du radar). Norme d'essai IEC 62388 non consultée (payante).
- Manœuvrabilité : méthode MMG standard (Yasukawa & Yoshimura, J. Mar. Sci. Technol. 20:37-52, 2015). **Un seul navire porteur** pour l'instant (KVLCC2) ; pas de sélecteur de navire tant qu'il n'y en a qu'un.
- Prochain navire : porte-conteneurs KCS (230 m). Bloquant : obtenir un jeu complet de coefficients MMG publiés (piste : Yasukawa et al., J. Mar. Sci. Technol. 28:98-116, 2023, DOI 10.1007/s00773-022-00908-3, accès payant). Cibles de validation en essais libres (moyenne multi-bassins, Fr 0,26, barre 35°) : avance ≈ 2,9 L ; diamètre tactique ≈ 2,9 L sur tribord et 2,6 L sur bâbord ; vitesse en giration ≈ 0,46 U.
- Critères OMI de manœuvrabilité : résolution MSC.137(76).
- DST du Pas-de-Calais : OMI COLREG.2/Circ.59, annexe 8 (positions WGS 84) ; MGN 364 Amendment 2 (navigation dans le détroit, bouées MPC et CS4).
- DST du détroit de Gibraltar : OMI COLREG.2/Circ.66, annexe 1 (positions WGS 84, en vigueur le 1er juin 2015).
- ECDIS : résolution MSC.232(82) (repères : contour de sécurité, alarmes, route) ; présentation inspirée de S-52 sans revendiquer la conformité.
- AIS : UIT-R M.1371 (cadences des messages de position), association radar / AIS selon MSC.192(79) 5.33.
- Grille de référence des simulateurs : DNV-ST-0033 (révision 2025).

## Règles pour les modèles de navire

- Un navire MMG = un fichier dans `src/core/ships/` avec la **source publiée** de chaque coefficient ; toute valeur estimée est signalée comme telle en commentaire.
- Tout nouveau navire MMG doit passer `tests/manoeuvrabilite.test.ts` (critères OMI) et figurer dans `docs/manoeuvrabilite.md` (relancer `npm run manoeuvrabilite`).
- Aucune valeur inventée présentée comme mesurée.

## Garde-fous

- Ne pas reproduire logos, noms de produits ni charte graphique de constructeurs (Wärtsilä, Furuno, JRC…). S'inspirer de l'ergonomie et suivre la norme IEC 62388.
- Données cartographiques uniquement libres (OpenStreetMap, coordonnées publiées des DST). Les ENC du SHOM ne sont pas libres. Toute donnée dérivée d'OSM garde l'attribution « © contributeurs OpenStreetMap » et reste sous ODbL (fichier dédié, signalé dans LICENSE). Bathymétrie et bancs schématiques : toujours afficher « carte schématique, non destinée à la navigation ».
- L'outil est un complément d'entraînement, **pas un simulateur agréé STCW** : le rappeler dans l'interface et le README.
- Cible prioritaire : **ordinateur** (écran ≥ 1280 px, souris et clavier). Le téléphone reste un usage de dépannage, sans être optimisé. À terme, fonctionnement hors ligne (PWA).
- Projet **tous droits réservés** (voir LICENSE) : ne pas ajouter de licence libre ni copier de code sous licence incompatible.
