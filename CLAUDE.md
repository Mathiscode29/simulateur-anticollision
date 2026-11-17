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
            physics.ts (porteur MMG ou Nomoto, machine, vent/courant, cinématique des cibles), radar.ts (balayage, détection, ARPA, trial),
            rules.ts (roleOf + IA des cibles), assessment.ts (suivi des situations, évaluation, rapport),
            scenarios.ts, visual.ts (feux, marques, signaux de brume), loop.ts (pas de simulation)
src/ui/     render.ts (scope canvas), controls.ts (DOM, onglets, table ARPA, bilan), style.css
tests/      rules.test.ts (moteur de règles), simulation.test.ts (scénarios sans affichage, évaluation),
            manoeuvrabilite.test.ts (critères OMI sur chaque navire MMG)
scripts/    manoeuvrabilite.ts (rapport de manœuvrabilité)
```

Règle d'architecture : **`src/core` et `src/sim` n'accèdent jamais au DOM**. Toute la simulation doit tourner en test sans navigateur. L'interface lit `S` et appelle les fonctions de `sim/`.

## Conventions

- Langue : interface, commentaires, messages de commit et docs en **français**, vocabulaire professionnel maritime (CPA/TCPA, relèvement, aspect, abattée, privilégié/non privilégié…).
- Unités : milles nautiques, nœuds, degrés, secondes. Repère local x = est, y = nord ; caps et relèvements de 0 à 360 dans le sens horaire depuis le nord.
- Pas de simulation fixe de 0,25 s (`DT`), indépendant de l'affichage et de l'accélération du temps.
- L'évaluation du chef de quart (`assessment.ts`) utilise la vérité terrain ; chaque message de bilan cite la règle RIPAM concernée.
- Toute modification de `rules.ts` ou `assessment.ts` s'accompagne d'un test dans `tests/`.

## Références métier

- RIPAM (règlement international pour prévenir les abordages en mer, COLREG 1972 amendé), règles 5 à 19, 35, annexe I.
- Radar/ARPA : norme IEC 62388 et résolution OMI MSC.192(79) pour la présentation et la symbologie.
- Manœuvrabilité : méthode MMG standard (Yasukawa & Yoshimura, J. Mar. Sci. Technol. 20:37-52, 2015). Les navires sans paramètres MMG utilisent encore un modèle de Nomoto 1er ordre (à remplacer).
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
