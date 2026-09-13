# Compteurs planning — sous-lot Paris

## Correction ciblée

- Les fenêtres de nuit existantes (21 h–6 h) sont résolues en Europe/Paris ; leurs intersections comptent le temps réellement écoulé.
- Les journées de départ et les séries de jours consécutifs utilisent les dates civiles Paris.
- Les semaines sont bornées du lundi minuit Paris au lundi suivant, soit éventuellement 167 ou 169 heures réelles. Une mission chevauchante contribue aux deux semaines sans inventer un repos au début de la seconde.
- Les repos quotidiens et chevauchements comparent déjà des instants : logique conservée et testée aux changements d'heure.
- Aucun seuil ni règle métier modifié ou juridiquement validé. Aucune donnée existante modifiée.

## Constats restant à traiter séparément

1. `agentWeeklyHours` et `agentMonthlyHours` totalisent tous deux la période filtrée. Ils ne constituent pas deux agrégations distinctes. La comparaison avec un contrat mensuel en vue Jour/Semaine ou avec filtre site est donc à revoir.
2. La colonne « RÉALISÉ » compte les vacations planifiées, non les pointages.
3. Les vacations annulées restent comptées dans les heures, comme avant ce correctif ; elles sont exclues de certaines alertes seulement. Décider explicitement de la convention métier avant modification.
4. Les alertes exploitent les événements chargés, parfois hors période visible. Une absence d'alerte ne garantit pas le respect du repos si les données sont incomplètes. Ne pas présenter ces indicateurs comme un certificat de conformité.
5. Le nombre de jours travaillés conserve la convention du jour de début de la mission, pas tous les jours traversés par une nuit.

## Recette

Sur des données de test, comparer UTC et Paris : une mission 20 h–4 h compte 8 h dont 7 h de nuit ordinairement, 7 h dont 6 h la nuit du 28–29 mars 2026, 9 h dont 8 h la nuit du 24–25 octobre 2026. Les heures d'une mission à cheval sur une période doivent être tronquées aux bornes sélectionnées. Les alertes de repos gardent les durées réelles, pas une simple soustraction des heures affichées.

Tests automatisés des fonctions réelles sous UTC, Paris, New York et Tokyo ; recette visuelle à effectuer avant publication. Aucun commit ou déploiement dans ce sous-lot.
