# Carte du Havre — sources et limites

> Carte d'entraînement **schématique, non destinée à la navigation**. Elle sert à s'exercer à l'entrée et à l'appareillage d'un grand port (chenal, musoirs, évolutions dans un bassin) ; la géométrie du port est simplifiée.

## Sources

| Donnée | Source | Fichier |
|---|---|---|
| Trait de côte | © contributeurs OpenStreetMap, ODbL 1.0 : polygones terrestres « land-polygons-split » d'OpenStreetMap, tuiles PMTiles du dépôt Yucareux/Tellus-Land-Polygons (zoom 10, ≈ 100 m), vectorisés puis simplifiés | `src/core/charts/lehavre-land.ts` (reste sous ODbL) |
| Bassins (avant-port, bassin Théophile-Ducrocq, Port 2000) et digue sud de Port 2000 | **Retracés schématiquement** sur le trait de côte, calés sur les positions des feux de la NGA ; quai du Havre de 4,2 km (HAROPA) | idem |
| Feux : bouée LHA, digues Nord et Sud, môles du bassin Théophile-Ducrocq, alignement du quai d'escale, cap de la Hève, Antifer | NGA List of Lights, Pub. 114 (2016), domaine public | `src/core/charts/lehavre.ts` |
| Repères de la ville | Église Saint-Joseph : 107 m, 49°29'27,5"N 0°06'04"E (Wikipedia, Structurae) ; hôtel de ville ≈ 72 m, Porte Océane 47,5 m, sémaphore 53 m (pss-archi, positions approchées) ; pont de Normandie : pylônes de 214,77 m, travée de 856 m (Structurae) | idem |

## Ce qui est modélisé

- Chenal d'accès (axe LHA – musoirs, largeur 0,16 NM, profondeur draguée **schématique** de 17,5 m), accès à Port 2000 ; bassins dragués à 14–17,5 m (valeurs schématiques, sans marée).
- Grille de profondeur au pas de 0,04 NM ; dans les bassins et les chenaux, la profondeur est exacte jusqu'au quai.
- Heurt : l'étrave ou la poupe qui touche un quai, une digue ou la berge termine l'exercice (en plus de l'échouement au centre du navire).
- Règle 9 : temps passé sur la moitié bâbord du chenal, alerte et bilan.
- Trafic : voies de chenal entrante (le navire réduit puis s'arrête au port) et sortante ; navires au mouillage dans une zone d'attente **indicative**.
- Vue extérieure : quartiers générés en blocs (hauteurs tirées dans une plage par quartier), repères ponctuels, portiques, réservoirs, pont de Normandie.

## Limites connues

- Le porteur reste le VLCC KVLCC2 : un tirant d'eau d'exercice réduit (navire allégé) est imposé par chaque exercice, mais le modèle de manœuvrabilité est celui du navire en charge. Le porte-conteneurs et le transbordeur des pilot cards de l'ENSM conviendront mieux à ce port.
- La géométrie des bassins est approchée : à corriger avec une source libre détaillée (trait de côte OSM à pleine résolution ou données S-100 libres du SHOM si elles couvrent un jour Le Havre).
- Pas de marée, pas de remorqueurs, pas de pilote ; les bouées latérales du chenal sont placées schématiquement.
