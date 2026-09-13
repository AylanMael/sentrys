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
- Les calculs de statistiques/alertes et certains panneaux annexes restent à auditer séparément. Le calendrier, les modèles de site et les regroupements/affichages des impressions ci-dessous sont désormais explicitement en Paris ; ne pas présenter ce lot comme une correction exhaustive de tous les calculs métier.
- Tests de conversion sous UTC, Paris, New York et Tokyo dans des processus isolés. Tests de régression prépaie conservés.
- Aucun déploiement ni création de mission en ligne effectué pour ces tests.

## Sous-lot répétitions et collage

- Propagation hebdomadaire, mensuelle, jours ouvrés, reconduction de semaine et collage : les deux bornes sont déplacées dans le calendrier civil de Paris, sans conserver artificiellement une durée en millisecondes à travers le changement d'heure.
- Exemple : 20 h–4 h garde ses heures, mais peut durer réellement 7 h ou 9 h lors d'un changement d'heure.
- Toutes les cibles sont préparées avant le premier appel réseau. Si une borne cible est ambiguë/inexistante, aucune copie du lot n'est envoyée et un message explique le refus. Ceci n'est pas une garantie de transaction serveur en cas d'autre échec API.
- Une récurrence mensuelle au 31 vers un mois sans 31 est refusée, sans report silencieux au mois suivant. Ajuster la période ou créer séparément la vacation souhaitée.
- Le collage conserve son comportement d'ancrage : la première vacation commence à l'heure exacte cliquée ; les autres conservent leurs écarts civils Paris. La grille est désormais configurée en Paris.

### Recette ciblée (données de test uniquement)

1. Propager le 18 octobre 2026, 20 h–23 h, d'une semaine : le 25 octobre reste à 20 h–23 h (19:00Z–22:00Z).
2. Reconduire/copier une nuit 20 h–4 h vers le 28–29 mars puis le 24–25 octobre : vérifier les jours et les deux bornes.
3. Propager une vacation finissant à 02:30 vers le 25 octobre : message explicite, aucune création du lot.
4. Propager le 31 janvier mensuellement : message explicite, aucune création.
5. Copier deux vacations à 20 h les 24 et 25 octobre vers deux jours ordinaires : elles restent à la même heure, pas de décalage d'une heure pour la seconde.
6. Vérifier les options conserver agents/notes et ignorer les doublons ; aucune modification des vacations sources.

## Sous-lot grille, modèles et impressions

- FullCalendar 6.1.20 utilise son connecteur officiel Luxon 3 pour Europe/Paris (pas de simulation UTC du fuseau).
- Les blocs mensuels restent élargis aux jours couverts, mais les déplacements sont appliqués aux vrais horaires. Les identifiants contenant des tirets restent intacts.
- Le redimensionnement est désactivé en vue mensuelle : utiliser les détails ou une vue plus précise. Déplacer reste autorisé. Un refus serveur ou un horaire cible ambigu/inexistant annule le déplacement.
- Les modèles préparent toutes les dates civiles Paris avant de créer des vacations. L'aperçu affiche une erreur si une borne est invalide ; la génération du lot est bloquée.
- Le tableau agent et les impressions agent/site classent les missions par jour de départ Paris. Une fin au lendemain porte la mention `(+1j)` ; les bornes de période sont exclusives.

### Recette visuelle restant à effectuer

Avec des données de recette, répéter sous Paris puis avec le navigateur/appareil réglé sur UTC ou New York :

1. En vue Jour, une mission à 20 h Paris occupe le créneau 20 h. En vue Mois, déplacer le 18 octobre 20 h–23 h au 25 octobre : les détails restent à 20 h–23 h, pas à minuit.
2. En vue Jour/Semaine, modifier la fin ; rouvrir les détails. Tester un déplacement refusé : l'événement revient à sa position initiale.
3. Créer par modèle une vacation 20 h–4 h à cheval sur le changement d'heure. Vérifier le début, la fin et le refus explicite d'une borne à 02:30 lors du changement d'heure.
4. Diffuser une mission commençant le 11 septembre à 00:30 Paris : tableau agent, impression agent et impression site doivent la placer le 11, même sur un appareil UTC.
5. Imprimer une nuit 20 h–4 h : même colonne de départ et mention `(+1j)`, sans masquer les horaires. Contrôler la largeur des cellules et la lisibilité de l'aperçu avant impression.

Tests automatisés : moteur DateEnv/connector FullCalendar réel, permissions effectives d'événement, callbacks de déplacement, modèles et fonctions de regroupement/formatage extraites des vrais composants. La validation automatisée ne remplace pas cette recette visuelle authentifiée.
