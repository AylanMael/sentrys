# SEC-01 — Comptes : politique, recette et conditions de livraison

Branche de travail : `agent/platform-access`, base `b0af7ac`. Ce lot complète le garde plateforme SEC-02 sans modifier les worktrees historiques `sentrys` et `sentrys-stabilisation-l2`.

## Politique implémentée

- Les champs `role`, `tenantId`, `status`, `agentId`, `uid`, `createdAt`, `createdBy` du compte sont gérés exclusivement côté serveur.
- Aucun navigateur, y compris connecté comme propriétaire, administrateur d'agence ou administrateur plateforme, ne peut créer/supprimer un compte ou modifier ses champs d'autorisation directement dans Firestore.
- L'autoédition autorisée est limitée à `name` et `updatedAt` sur un compte actif. Les champs modifiés doivent garder leur type ; nom de 1 à 120 caractères, date de type timestamp. `updatedAt` est une métadonnée de profil, pas une preuve d'audit serveur.
- Ajout, suppression et remplacement des champs sont contrôlés avec `affectedKeys()` dans ce bloc de règles. Pas de liste noire incomplète ni de branche administrateur concurrente.
- La lecture de son propre compte demeure possible pour afficher le diagnostic de connexion, même désactivé. Les lectures d'autres comptes conservent les restrictions de rôle et d'agence, avec membre actif requis.
- Le garde API principal `requireTenantUser` refuse désormais un statut absent ou nul, au lieu d'assumer un compte actif.

## Compatibilité vérifiée par lecture

Le login lit `tenantUsers` avec `getDoc`. Aucun appel frontend d'écriture directe à cette collection n'a été trouvé dans le périmètre inspecté. Les opérations de gestion des utilisateurs passent par les API utilisant l'Admin SDK, dont les transactions et contrôles existants sont conservés.

Ce constat ne remplace pas une recette navigateur ni un inventaire d'intégrations externes. Les éventuels anciens clients écrivant directement autre chose que leur nom/date seront désormais refusés.

## Exécuter les tests

Prérequis : Node 22, Java 21, installation des dépendances du lockfile. Les versions directes des outils de test sont verrouillées : `@firebase/rules-unit-testing` 3.0.4 et `firebase-tools` 15.27.0.

```sh
npm ci
npm test
npm run test:rules:accounts
npm run typecheck
npm run lint:ci
npm run security:check
```

`test:rules:accounts` démarre uniquement Firestore avec `firebase.emulators.json` et le projet fictif `demo-sentrys-accounts`. Firestore écoute sur `127.0.0.1:8091`, hub sur 4411 et logs sur 4511. L'interface d'administration des émulateurs est désactivée. La configuration de déploiement `firebase.json` n'est pas modifiée.

Le runner refuse de démarrer sans adresse d'émulateur explicite, avec un hôte non loopback ou un projet contradictoire. Il ne charge ni `.env.local`, ni Admin SDK, ni identifiants de production. Les fixtures ont des identifiants uniques, sont nettoyées après chaque cas et n'effacent pas arbitrairement une base entière.

Les refus attendus doivent avoir exactement le code `permission-denied` : une panne de connexion, un timeout ou un émulateur absent ne constitue jamais un test réussi. Les logs SDK des refus attendus sont silencieux ; les assertions et échecs de tests restent visibles.

## Scénarios couverts

- Agent, client, viewer, manager, admin, owner, super_admin d'agence et super_admin plateforme.
- Sur soi et sur un tiers : ajout/suppression/remplacement de chaque champ d'autorité.
- Remplacement complet de document, création et suppression.
- Autoédition autorisée, types invalides, bornes du nom, champs hors liste, suppression des champs de profil.
- Compte désactivé ou sans statut : pas de réactivation ni d'écriture métier sur les chemins sélectionnés.
- Compte non connecté ou sans document de rattachement : refus des écritures.
- Témoins positifs de lectures et d'opérations métier légitimes ; témoin de lecture inter-agences refusée.
- Préservation des données après refus et capacité de provisioning serveur au travers du bypass de fixtures de l'émulateur.
- Avec le vrai code d'authentification API et dépendances simulées : statut absent refusé avant opération métier, y compris sur les onze handlers plateforme.

Le bypass de fixture ne teste pas l'ensemble des transactions de provisioning de l'API en conditions réelles.

## Résultats locaux du 8 septembre 2026

- `npm test` : 138 tests réussis, aucun échec (code 0).
- `npm run test:rules:accounts` : 596 tests réussis, aucun échec (code 0), émulateurs arrêtés à la fin.
- TypeScript, lint, contrôles de sécurité et vérification du diff : code 0.
- Revue indépendante : GO technique sur le périmètre SEC-01 ; réexécution finale demandée et réussie.

Les tests API utilisent des dépendances externes simulées ; les tests de règles exécutent les règles réelles du candidat dans l'émulateur. Ni l'un ni l'autre ne valide un déploiement de production. Builds, installation fraîche après modification du lockfile, CI distante et recette navigateur non exécutés pour ce lot. Aucun commit, push ou déploiement.

Le workflow CI lance explicitement la suite Firestore. Le script local `quality:check` ne l'inclut pas : lancer aussi `npm run test:rules:accounts`.

## Avant toute livraison

1. Inventorier sans réparation automatique les comptes dont `status` est absent, nul ou non canonique. Faire valider leur état métier puis les régulariser par une opération serveur tracée.
2. Vérifier qu'un administrateur plateforme légitime et un administrateur d'agence actif peuvent toujours se connecter et gérer les utilisateurs via les API.
3. Vérifier un compte désactivé et un agent dont `agentId` diffère de l'UID Firebase.
4. Exécuter la CI de la révision à livrer, les builds et la recette authentifiée. Le nouveau contrôle d'émulateur est ajouté au workflow avec Java 21 ; sa réussite distante doit être observée, pas supposée.
5. Valider règles et code comme une livraison coordonnée. Ne pas annuler une correction critique en rétablissant aveuglément les anciennes règles ; toute procédure de retour arrière doit maintenir les protections d'autorisation.
6. Obtenir l'accord de déploiement puis vérifier la révision et les règles réellement servies.

## Limites explicitement ouvertes

- `requireTenantUser` normalise encore la casse et les espaces du statut ; les règles demandent la chaîne exacte `active`. Les écritures serveur devraient produire la valeur canonique. La normalisation globale reste à harmoniser.
- `/api/me` et les gardes historiques ne sont pas réécrits dans ce lot. Pas de revendication d'équivalence de tous les chemins d'accès.
- Suspension d'agence, modification directe du document `tenants`, immutabilité générale des autres collections et garanties des opérations métier restent SEC-03 et lots suivants.
- Pas de preuve de l'état des règles/IAM en production ni d'absence de données déjà altérées avant correction.
- L'ajout du CLI de test augmente le graphe de dépendances de développement et npm a réactualisé dix versions transitives partagées. Cette modification est inscrite au lockfile ; pas de mise à niveau des dépendances applicatives directes. Installation propre et tests doivent faire partie de la CI candidate.

Cette recette autorise une réception technique du périmètre testé, pas une certification de sécurité globale de Sentrys.
