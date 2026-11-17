# Simulateur anticollision — instructions projet

Simulateur radar/ARPA web pour s'entraîner à l'anticollision (RIPAM / COLREG). Public : élèves officiers de l'ENSM, niveau visé chef de quart puis commandant. Porteur du projet : Mathis (élève officier, brevet de chef de quart). Feuille de route : `ROADMAP.md`.

## Commandes

- `npm run dev` : serveur de développement (Vite)
- `npm test` : tests (Vitest), à faire passer avant tout commit
- `npm run build` : vérification TypeScript + build dans `dist/`
- Déploiement : automatique sur GitHub Pages à chaque push sur `main` (`.github/workflows/deploy.yml`)

## Architecture

```
src/core/   util.ts (maths, conventions), data.ts (navires, transmetteur, types de cibles), state.ts (types + état global S)
src/sim/    physics.ts (Nomoto, dérive vent/courant), radar.ts (balayage, détection, ARPA, trial),
            rules.ts (roleOf + IA des cibles), assessment.ts (suivi des situations, évaluation, rapport),
            scenarios.ts, visual.ts (feux, marques, signaux de brume), loop.ts (pas de simulation)
src/ui/     render.ts (scope canvas), controls.ts (DOM, onglets, table ARPA, bilan), style.css
tests/      rules.test.ts (moteur de règles), simulation.test.ts (scénarios sans affichage, évaluation)
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
- Modèle de manœuvrabilité actuel : Nomoto 1er ordre ; évolution prévue vers un modèle MMG 3 DDL.

## Garde-fous

- Ne pas reproduire logos, noms de produits ni charte graphique de constructeurs (Wärtsilä, Furuno, JRC…). S'inspirer de l'ergonomie et suivre la norme IEC 62388.
- Données cartographiques uniquement libres (OpenStreetMap, coordonnées publiées des DST). Les ENC du SHOM ne sont pas libres.
- L'outil est un complément d'entraînement, **pas un simulateur agréé STCW** : le rappeler dans l'interface et le README.
- L'application doit rester utilisable sur téléphone (écran ~390 px) et à terme hors ligne (PWA).
