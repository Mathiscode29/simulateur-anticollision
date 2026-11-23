# Journal des versions

Convention : chaque mise à jour publiée augmente la version d'un dixième (V1.0, V1.1 … V1.9, V2.0 …). La version
affichée dans l'en-tête vient de `src/core/version.ts`.

La **version initiale** (état du 23 novembre 2026, avant les mises à jour V1.x) est sauvegardée :
- dans la branche `version-initiale` de ce dépôt ;
- dans un dépôt de sauvegarde séparé, `simulateur-anticollision-version-initiale`.

## V1.3 — 23 novembre 2026
Pont du VLCC détaillé, nuages arrondis, rendu 3D retiré.
- Pont du pétrolier porteur : collecteurs de cargaison, passerelle de pont sur supports, manifold (traverses et colonnes montantes), grues de manutention des flexibles, panneaux de citerne, soupapes P/V, mât de dégazage, guindeaux ; l'épaisseur des tubes suit la perspective.
- Nuages en cumulus arrondis (bulles sur une base plate, ombre sous la base).
- Rendu 3D WebGL supprimé, ainsi que la bibliothèque three.js : le simulateur n'a plus aucune dépendance d'exécution.

## V1.2 — 23 novembre 2026
Vue extérieure en 2D « en blocs » par défaut, pour la fluidité.
- Retour au rendu 2D en perspective comme rendu par défaut : le rendu WebGL de la V1.1 était trop lourd sur les ordinateurs courants.
- Silhouettes en blocs par famille de navire, ombrées selon le soleil : porte-conteneurs (piles de conteneurs de couleurs), pétrolier (tuyautage, manifold), méthanier (sphères en gradins), vraquier (panneaux de cale, grues), roulier, transbordeur (ponts étagés), cargo et caboteur, chalutier (portique), câblier (portique arrière), voilier ; château avec passerelle, ailerons, fenêtres (éclairées la nuit) et cheminée.
- Niveau de détail selon la taille à l'écran : blocs détaillés au-delà de 45 pixels, silhouette simple en deçà.
- Ciel et mer en aplats par paliers, nuages en pavés qui dérivent avec le vent, relief côtier en gradins de 15 m avec herbe et grève, sillage en bande d'écume.
- Allègement : vagues regroupées en quelques remplissages, vue extérieure limitée à 30 images par seconde, résolution plafonnée à un pixel par point.
- Le rendu 3D reste disponible en essai (bouton « 3D », exige une bonne carte graphique) ; three.js n'est téléchargé qu'à ce moment-là (application principale ≈ 200 Ko au lieu de ≈ 790 Ko).

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
