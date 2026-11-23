# Journal des versions

Convention : chaque mise à jour publiée augmente la version d'un dixième (V1.0, V1.1 … V1.9, V2.0 …). La version
affichée dans l'en-tête vient de `src/core/version.ts`.

La **version initiale** (état du 23 novembre 2026, avant les mises à jour V1.x) est sauvegardée :
- dans la branche `version-initiale` de ce dépôt ;
- dans un dépôt de sauvegarde séparé, `simulateur-anticollision-version-initiale`.

## V1.1 — 23 novembre 2026
Vue extérieure en 3D (WebGL, three.js).
- Mer : vagues de Gerstner selon la force de Beaufort, vaguelettes, reflets du ciel (Fresnel), reflet du soleil, moutons.
- Ciel jour / nuit / brume, étoiles ; brouillard exponentiel selon la visibilité ; rotondité de la Terre avec réfraction.
- Relief côtier tiré du trait de côte et du relief de la carte (Rocher de Gibraltar, Djebel Moussa, falaises de Douvres), lumières de côte la nuit ; les feux et navires sont masqués par la terre.
- Silhouettes par type de navire : porte-conteneurs, pétrolier, vraquier, cargo, roulier, méthanier, ferry, chalutier, voilier, câblier ; fenêtres éclairées la nuit, vague d'étrave et sillage.
- Feux de navigation selon les secteurs de l'annexe I, reflets sur l'eau ; bouées, bateaux-feux et phares en 3D.
- Pont du VLCC vu de la passerelle, roulis et tangage.
- Bouton « 3D » pour revenir au rendu 2D allégé sur un ordinateur modeste (choix mémorisé).

## V1.0 — 23 novembre 2026
Point de départ, identique à la version initiale.
- Navire porteur VLCC KVLCC2 (modèle MMG), radar / ARPA, ECDIS, AIS, trafic IA selon le RIPAM, avaries.
- Zones : large, Pas-de-Calais, détroit de Gibraltar ; 25 exercices sur cinq niveaux.
- Vue extérieure et disposition passerelle ; répétiteurs barre et ROT, transmetteur d'ordres −10…+10.
- Bilan règle par règle et débrief rejoué.
