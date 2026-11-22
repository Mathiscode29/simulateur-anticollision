# Simulateur anticollision — instructions projet

Simulateur radar/ARPA web pour s'entraîner à l'anticollision (RIPAM / COLREG). Public : élèves officiers de l'ENSM, niveau visé chef de quart puis commandant. Porteur du projet : Mathis (élève officier, brevet de chef de quart). Feuille de route : `ROADMAP.md`.

## Commandes

- `npm run dev` : serveur de développement (Vite)
- `npm test` : tests (Vitest), à faire passer avant tout commit
- `npm run build` : vérification TypeScript + build dans `dist/`
- `npm run manoeuvrabilite` : régénère `docs/manoeuvrabilite.md` (manœuvres OMI simulées des navires MMG)
- Déploiement : automatique sur GitHub Pages à chaque push sur `main` (`.github/workflows/deploy.yml`)

## Architecture

```
src/core/   util.ts (maths, conventions), data.ts (navires, transmetteur, types de cibles), state.ts (types + état global S)
            ships/ (jeux de paramètres MMG sourcés, un fichier par navire)
src/sim/    mmg.ts (modèle MMG 3 DDL, SI), manoeuvres.ts (giration, zigzag, arrêt, critères OMI MSC.137(76)),
            physics.ts (porteur MMG, machine, vent/courant, cinématique des cibles), radar.ts (balayage, gain/mer/pluie, bandes X/S,
            grains, poursuite TT, zone d'acquisition, trial), alerts.ts (alertes et acquittement, sans DOM),
            route.ts (route prévue, points tournants, écart latéral XTE),
            rules.ts (roleOf + IA des cibles), assessment.ts (suivi des situations, évaluation, rapport),
            scenarios.ts (18 exercices sur 3 niveaux, rencontres après point tournant), visual.ts (feux, marques, signaux de brume), loop.ts (pas de simulation)
src/ui/     render.ts (scope PPI : modes RM/TM, décentrage, symboles SN.1/Circ.243, EBL/VRM/PI, curseur, palettes),
            controls.ts (DOM, panneaux, alertes, clavier/souris, son), style.css (palettes jour/crépuscule/nuit)
tests/      rules.test.ts (moteur de règles), simulation.test.ts (scénarios sans affichage, évaluation),
            manoeuvrabilite.test.ts (critères OMI sur chaque navire MMG), alertes.test.ts (cycle des alertes radar),
            route.test.ts (XTE, points tournants, rencontres après abattée)
docs/       manoeuvrabilite.md (généré), conformite-radar.md (grille MSC.192(79) / SN.1/Circ.243, à tenir à jour)
scripts/    manoeuvrabilite.ts (rapport de manœuvrabilité)
```

Règle d'architecture : **`src/core` et `src/sim` n'accèdent jamais au DOM**. Toute la simulation doit tourner en test sans navigateur. L'interface lit `S` et appelle les fonctions de `sim/`.

## Conventions

- Langue : interface, commentaires, messages de commit et docs en **français**, vocabulaire professionnel maritime (CPA/TCPA, relèvement, aspect, abattée, privilégié/non privilégié…).
- Unités : milles nautiques, nœuds, degrés, secondes. Repère local x = est, y = nord ; caps et relèvements de 0 à 360 dans le sens horaire depuis le nord.
- Pas de simulation fixe de 0,25 s (`DT`), indépendant de l'affichage et de l'accélération du temps.
- L'évaluation du chef de quart (`assessment.ts`) utilise la vérité terrain ; chaque message de bilan cite la règle RIPAM concernée. Exception : la tenue de route (écart, reprise de la route) relève de la bonne pratique et du plan de traversée, sans pénalité sur la note.
- Un nouvel exercice = une entrée de `SCEN` avec niveau, description, environnement imposé éventuel et route ; le test générique de `simulation.test.ts` le couvre automatiquement.
- Toute modification de `rules.ts` ou `assessment.ts` s'accompagne d'un test dans `tests/`.

## Références métier

- RIPAM (règlement international pour prévenir les abordages en mer, COLREG 1972 amendé), règles 5 à 19, 35, annexe I.
- Radar/ARPA : résolution OMI MSC.192(79) et symboles SN.1/Circ.243/Rev.2 (grille de suivi : `docs/conformite-radar.md`, à mettre à jour à chaque évolution du radar). Norme d'essai IEC 62388 non consultée (payante).
- Manœuvrabilité : méthode MMG standard (Yasukawa & Yoshimura, J. Mar. Sci. Technol. 20:37-52, 2015). **Un seul navire porteur** pour l'instant (KVLCC2) ; pas de sélecteur de navire tant qu'il n'y en a qu'un.
- Prochain navire : porte-conteneurs KCS (230 m). Bloquant : obtenir un jeu complet de coefficients MMG publiés (piste : Yasukawa et al., J. Mar. Sci. Technol. 28:98-116, 2023, DOI 10.1007/s00773-022-00908-3, accès payant). Cibles de validation en essais libres (moyenne multi-bassins, Fr 0,26, barre 35°) : avance ≈ 2,9 L ; diamètre tactique ≈ 2,9 L sur tribord et 2,6 L sur bâbord ; vitesse en giration ≈ 0,46 U.
- Critères OMI de manœuvrabilité : résolution MSC.137(76).
- Grille de référence des simulateurs : DNV-ST-0033 (révision 2025).

## Règles pour les modèles de navire

- Un navire MMG = un fichier dans `src/core/ships/` avec la **source publiée** de chaque coefficient ; toute valeur estimée est signalée comme telle en commentaire.
- Tout nouveau navire MMG doit passer `tests/manoeuvrabilite.test.ts` (critères OMI) et figurer dans `docs/manoeuvrabilite.md` (relancer `npm run manoeuvrabilite`).
- Aucune valeur inventée présentée comme mesurée.

## Garde-fous

- Ne pas reproduire logos, noms de produits ni charte graphique de constructeurs (Wärtsilä, Furuno, JRC…). S'inspirer de l'ergonomie et suivre la norme IEC 62388.
- Données cartographiques uniquement libres (OpenStreetMap, coordonnées publiées des DST). Les ENC du SHOM ne sont pas libres.
- L'outil est un complément d'entraînement, **pas un simulateur agréé STCW** : le rappeler dans l'interface et le README.
- Cible prioritaire : **ordinateur** (écran ≥ 1280 px, souris et clavier). Le téléphone reste un usage de dépannage, sans être optimisé. À terme, fonctionnement hors ligne (PWA).
- Projet **tous droits réservés** (voir LICENSE) : ne pas ajouter de licence libre ni copier de code sous licence incompatible.
