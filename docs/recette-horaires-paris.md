# Horaires des vacations — correction Paris

Les valeurs sans fuseau reçues par les API vacations (création, modification, bulk et chevauchements) sont désormais interprétées en Europe/Paris. Les ISO avec Z ou offset conservent leur instant. Aucun décalage fixe de deux heures.

Les formulaires de création/modification transmettent un ISO UTC explicite ; leurs préremplissages et les libellés horaires des événements sont affichés en heure de Paris. Une borne de modification inchangée conserve l'instant original, notamment lors de l'heure doublée d'octobre. Pour une nouvelle saisie, les heures inexistantes ou ambiguës sont refusées ; un appel API avec offset explicite permet de distinguer les deux occurrences.

## Recette après déploiement

1. Créer une vacation de recette du 10 septembre 2026 de 20 h à 23 h : stockage attendu 18:00Z–21:00Z ; affichage Paris 20 h–23 h.
2. Modifier les horaires puis rouvrir les détails : aucune dérive.
3. Refaire avec janvier : 20 h Paris correspond à 19:00Z.
4. Vérifier une mission de nuit : dates et ordre des bornes préservés.
5. Vérifier le rejet du 29 mars 2026 à 02:30 et du 25 octobre 2026 à 02:30 sans offset. Une vacation existante avec offset explicite doit rester modifiable sans changer une borne intacte.

## Limites et prudence

- Aucune donnée existante corrigée automatiquement : vérifier séparément les vacations enregistrées avant le correctif.
- Pas de changement des règles de pointage ou de sécurité.
- FullCalendar et certaines fonctions de propagation/statistiques utilisent encore le fuseau local du navigateur ; ce lot corrige la saisie et la persistance, pas une refonte de tous les calculs calendaires. Pour la recette de la grille, utiliser un appareil réglé sur Paris. Une harmonisation complète du calendrier demandera un lot séparé.
- Tests de conversion sous UTC, Paris, New York et Tokyo dans des processus isolés. Tests de régression prépaie conservés.
- Aucun déploiement ni création de mission en ligne effectué pour ces tests.
