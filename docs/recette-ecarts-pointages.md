# Recette des écarts de pointage

Lot limité à une lecture descriptive des pointages et du planning actuel. Aucun
pointage n’est corrigé, aucune tolérance métier n’est appliquée et aucune sanction
ou conclusion sur la présence physique n’est déduite.

## Cas à vérifier avec des données fictives locales

- Prise à l’heure et sortie à l’heure : aucun encadré d’écart.
- Prise enregistrée 31 min 10 s après le début : durée exacte et une ligne à contrôler.
- Sortie avant la fin prévue : conserver « Service terminé » et afficher l’écart séparément.
- Retard et sortie anticipée sur la même mission : deux messages, une seule ligne à contrôler.
- Fin prévue dépassée avec prise mais sans sortie : « Sortie manquante » et message de vérification.
- Aucune prise après le début : préciser que cela ne confirme pas une absence sur le site.
- Données incohérentes : ne pas afficher de conclusions chiffrées.
- Mission de nuit et changement d’heure : comparer les instants absolus.

Les compteurs restent limités aux lignes chargées. Les écarts sont comparés au
planning actuel, pas à un historique contractuel. Une modification ultérieure du
planning peut donc modifier l’écart affiché, sans modifier les pointages.

## Vérification automatisée

`node --import tsx --test --experimental-test-isolation=none tests/attendance.test.mjs tests/attendance-observations.test.mjs tests/pointage-verification-notice.test.mjs`

La validation visuelle dans l’application et la validation en production doivent
être suivies séparément des tests automatisés. Ne pas créer de faux pointages en
production pour cette recette.
