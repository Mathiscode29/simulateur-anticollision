# Simulateur anticollision — Radar ARPA

Simulateur web pour s'entraîner à l'anticollision et à l'application du RIPAM, pensé pour les élèves officiers et officiers de la marine marchande. Il fonctionne dans le navigateur, de préférence sur ordinateur.

> Outil d'entraînement complémentaire. Ce n'est **pas** un simulateur agréé au titre de la convention STCW.

## Ce qu'il fait

- **Navire porteur** : pétrolier VLCC 320 m (KVLCC2) simulé par un modèle hydrodynamique MMG 3 DDL (méthode standard publiée, critères OMI de manœuvrabilité vérifiés automatiquement, voir [docs/manoeuvrabilite.md](docs/manoeuvrabilite.md)). Pilote automatique ou barre manuelle, transmetteur d'ordres avec inertie machine et renversement de marche. Un porte-conteneurs est prévu.
- **Environnement** : vent (dérive selon la prise au vent), courant, visibilité bonne ou réduite, jour ou nuit.
- **Radar / ARPA** : balayage, clutter de mer, petites cibles fluctuantes, acquisition manuelle ou automatique, CPA/TCPA, BCR/BCT, évolution du relèvement, vecteurs relatifs ou vrais, stabilisation sol ou eau, sillages, EBL/VRM, manœuvre d'essai avec délai.
- **Trafic** : les autres navires appliquent les règles 13 à 19, plus ou moins bien selon le niveau choisi (discipliné, réaliste, imprévisible). Navires en pêche, à voile, non maîtres de leur manœuvre, à capacité de manœuvre restreinte.
- **Observation** : feux selon l'aspect et leur portée, marques de jour, signaux de brume.
- **Bilan** : chaque situation est évaluée règle par règle (moment et ampleur de la manœuvre, côté, passage sur l'avant, R17, R19).

## Scénarios

Face à face (R14), croisement non privilégié (R15/16), croisement privilégié (R17), rattrapement (R13), responsabilités réciproques (R18), visibilité réduite (R19), trafic mixte, trafic dense.

## Développement

```bash
npm install
npm run dev      # serveur local
npm test         # tests
npm run build    # build de production dans dist/
```

Chaque push sur `main` lance les tests puis publie le site sur GitHub Pages.

Architecture, conventions et références : [CLAUDE.md](CLAUDE.md). Suite du projet : [ROADMAP.md](ROADMAP.md).

## Droits

© 2026 Mathis THOMAS — tous droits réservés. Voir [LICENSE](LICENSE).
