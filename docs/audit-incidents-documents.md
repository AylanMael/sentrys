# Audit ciblé incidents et documents — 10 septembre 2026

Diagnostic puis correction applicative locale. Aucun déploiement dans ce lot.

## Incidents : défaut d’autorisation confirmé

Commande : `node scripts/check-incident-access-local.cjs` ; projet demo-sentrys-accounts, Auth 9099, Firestore 8091, Next 9002. Fixture `qa-incident-1789055396853`, données fictives conservées dans l’émulateur.

Sur 9 contrôles HTTP : 5 réussis, 4 échecs attendus comme régressions de sécurité.

- Incident du site accessible : 200, témoin positif.
- Incident d’un autre site de la même agence, sans autorisation site : **200, fuite de lecture confirmée**.
- Listes générale, filtrée par site, et paginée par site : **incluent cet incident inaccessible**.
- Commentaires du site inaccessible : 403.
- Incident d’une autre agence : 404.
- PATCH par agent : 403 ; titre de l’incident inchangé.

Cause : GET incidents et GET incidents/[id] contrôlent le tenant sans contrôler le périmètre site/role, contrairement aux commentaires. Corriger les trois chemins de liste et la lecture directe en maintenant la pagination, les droits backoffice et la séparation inter-agences. Le choix métier du partage des incidents entre agents autorisés sur un même site doit être explicite ; il ne faut pas confondre cela avec l’isolation stricte des vacations.

## Documents : résultats limités aux tests ciblés

`tests/agent-file-read.test.mjs` exécute le handler réel et les fonctions de chemins, avec stockage et authentification simulés. 7 tests réussis : propre fichier autorisé, collègue refusé, viewer refusé, autre tenant refusé, chemin étranger/traversée refusés avant lecture des octets, manager autorisé dans son tenant, réponse privée sans cache.

Avec `tests/incident-suspension.test.mjs`, 48 tests ciblés réussis. Ce résultat ne remplace pas un test du stockage réel.

Points à examiner ensuite : les règles Storage autorisent actuellement l’agent à écrire/supprimer ses propres fichiers alors que les routes de dépôt sont réservées aux responsables. Le fallback UID dans les règles Storage accepte l’UID même lorsqu’un agentId distinct est renseigné, contrairement au téléchargement API. Ce sont des divergences à tester avant conclusion, pas des exploitations démontrées dans ce lot.

Priorité : fermer la fuite de lecture incidents, puis tester directement Storage avec des fichiers fictifs et clarifier les droits d’édition des documents agents.

## Correction et revalidation

Un helper commun contrôle désormais le rôle et l’autorisation site pour les listes, détails et commentaires. Un agent doit préciser un site autorisé pour lister ; la vue globale reste réservée au backoffice. Les incidents restent partagés entre agents autorisés au même site. Réponses incidents sans cache. Aucun changement d’index ou de règles dans ce correctif API.

Fixture de revalidation `qa-incident-1789056008219` : **14 contrôles HTTP réussis**. Inclut deux pages sans répétition, refus du curseur sur un autre site autorisé (400), refus après révocation du site entre les pages (403), et refus strict 403 des trois listes interdites. L’autorisation retirée ne concerne que la fixture dédiée.

**563 tests applicatifs réussis**, TypeScript, lint ciblé et contrôles de sécurité validés. Revue indépendante favorable au contrôle d’accès ; ses réserves sur la pagination et le refus explicite ont été couvertes par les essais HTTP supplémentaires.

Limites hors correctif : le mode paginé historique ignore certains filtres métier, et les divergences de rôle avec les règles Firestore/Storage nécessitent un examen dédié. Ce résultat ne vaut pas audit exhaustif des accès aux incidents ou documents.
