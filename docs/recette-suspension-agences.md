# SEC-03B — Suspension commerciale et suspension de sécurité

Décision utilisateur validée le 8 septembre 2026. Candidat sur `agent/platform-access`, départ `ab8f810`. Aucune modification de données, livraison ou fusion implicite.

## Contrat d'exploitation

| État | Consultation et exports selon RBAC | Écritures métier | Exception terrain |
| --- | --- | --- | --- |
| Non suspendu | Inchangés | Droits existants | Contrôles d'affectation |
| Suspension commerciale | Conservés | Refusées | Agent affecté : pointage et création d'incident sur mission commencée avant le cutoff, non terminée |
| Suspension sécurité | Refusés | Refusées | Aucune |

Connexion et contact support restent accessibles. Le diagnostic de sécurité ne renvoie que l'identité du tenant, son statut et son mode, pas le document métier complet. Un compte non actif ne reçoit pas les données du tenant.

Le début de mission est ici son début **planifié**, atteint au moment de la suspension. La règle temporelle est `startAt <= suspendedAt <= now < endAt`. À l'heure exacte de fin ou après, aucun pointage tardif n'est accepté en suspension commerciale, même si l'affectation reste `present`. Pas de prolongation implicite : régularisation contrôlée après réactivation. Il ne s'agit pas d'une astreinte ni d'un mécanisme de secours pour une situation urgente hors application.

L'agent est identifié par le rattachement actuel `tenantUsers.agentId`, avec fallback UID seulement si aucun identifiant exploitable n'existe. Le tenant, le site et `vacations.assignedAgentIds` sont vérifiés côté serveur. Missions annulées, closes, terminées, supprimées ou identifiées comme absence refusées. La classification historique par texte est conservée par prudence dans cette exception ; des notes contenant un mot d'absence peuvent donc entraîner un refus. Ce n'est pas une correction globale du moteur d'absences ou de prépaie.

## Enregistrement des états

- `status` reste `suspended` ; `suspensionMode` vaut `commercial` ou `security`.
- Une nouvelle suspension sans mode explicite est commerciale.
- Une suspension déjà enregistrée sans mode ou avec un mode invalide est traitée comme sécurité ; une requête ancienne sans mode ne la rétrograde pas.
- `suspendedAt` est un timestamp serveur lors de l'entrée en suspension. Un changement de mode conserve le cutoff original, même absent. Un cutoff absent empêche l'exception terrain.
- Réactivation réservée au compte plateforme autorisé, motif et confirmation conservés, historique des statuts et modes. Les anciens champs de suspension sont supprimés lors de la réactivation, y compris via le parcours d'activation.
- Les autres états historiques ne sont pas reclassifiés automatiquement. Un document tenant absent refuse l'accès métier ; les règles directes exigent aussi son existence. La récupération API par un super-administrateur plateforme actif demeure possible.

## Points d'application

- Garde API commun : consultation GET/HEAD, écritures pour les autres méthodes, admission terrain réservée à des handlers explicites. Elle ne suffit jamais seule à autoriser l'écriture.
- Pointages entrée/sortie et incidents : documents d'autorisation relus dans la transaction d'écriture pour gérer une réaffectation ou une suspension concurrente. Passage de `assigned` à `present`, puis `completed`, avec journalisation. Un second pointage incompatible retourne un conflit.
- Clients, devis, réconciliation : anciennes authentifications locales remplacées par le garde commun, listes de rôles conservées.
- Anciennes API administratives : claims toujours requis, mais vérification supplémentaire du membre actuel et du tenant. Les claims globaux/support seuls ne suffisent plus ; compte plateforme actif exigé. Le bootstrap n'est plus une auto-provision depuis des claims sans compte.
- Fonction HTTP `agentsAvailable` : membre et tenant actuels, non plus uniquement les claims du token.
- GET notifications et conformité : pas de génération de rappels en suspension commerciale. GET usage : pas de création implicite d'un document absent.
- Firestore : contrôle des lectures/écritures directes et exception bornée pour création d'incident. Pas d'exception sur commentaires, modifications d'incidents, profil, affectations ou suppression.
- Storage : consultation autorisée en commercial, écritures refusées ; lectures et écritures refusées en sécurité.
- Interface privée : message d'accès bloqué en sécurité, bannière de consultation en commercial et parcours `/dashboard/terrain`. Le diagnostic est rafraîchi au changement de page, au retour de focus et toutes les 30 secondes. Le serveur reste l'autorité à chaque requête ; l'affichage n'est pas une barrière de sécurité.
- Impression agent : suppression de la lecture anticipée depuis `localStorage`, une autorisation API est requise. Les documents déjà téléchargés ou affichés ne peuvent pas être rappelés à distance.

## Validation technique

Les tests serveur exécutent le code réel avec Firebase remplacé par des services mémoire. Ils ne prouvent pas le comportement réseau ni la concurrence distribuée réelle. Les tests de règles utilisent les émulateurs Firestore et Storage sur loopback et `demo-sentrys-accounts` ; aucune clé ni donnée de production.

```sh
npm test
npm run test:rules:accounts
npm run test:rules:integrity
npm run test:rules:suspension
npm run typecheck
npm run lint:ci
npm run security:check
npm --prefix functions run lint
npm --prefix functions run build
npm run build
```

Node 22 et Java 21 requis ; Storage écoute sur 9199 dans la configuration de test. Lancer les suites successivement, dans des processus distincts. La CI contient les trois commandes d'émulateur ; `quality:check` seul ne les exécute pas.

Les premiers essais ont révélé un dépassement de 1000 expressions sur l'exception Firestore. Les appels redondants ont été supprimés et les données du membre/tenant transmises au helper d'exception. Les témoins positifs sont conservés : un refus accidentel général ne peut pas rendre cette suite verte.

### Résultats locaux du 8 septembre 2026

| Vérification | Résultat |
| --- | --- |
| Tests serveur globaux | 308/308, code 0 |
| Émulateur comptes | 596/596, code 0 |
| Émulateur immutabilité | 104/104, code 0 |
| Émulateur document d'agence | 453/453, code 0 |
| Émulateurs suspension Firestore et Storage | 142/142, code 0 |
| TypeScript, lint, contrôles de sécurité, diff-check | Code 0 |
| Functions installation du lockfile hors réseau, scripts désactivés | Code 0, aucune dépendance modifiée |
| Functions lint et build | Code 0 |
| Build Next final, configuration isolée de démonstration | Code 0, 114 pages statiques générées ; artefact non destiné au déploiement |

Les 1 295 tests d'émulateur ont été exécutés successivement sur les règles finales. Émulateurs arrêtés en fin de suite. Les erreurs attendues de membre sans statut produisent un diagnostic Storage mais n'empêchent pas la réussite des assertions de refus.

Les deux revues indépendantes ne relèvent plus de blocage dans leur périmètre. Les échecs intermédiaires de limite d'expressions et les omissions de mocks ont été corrigés, puis les suites relancées intégralement ; aucun test n'a été supprimé pour obtenir ces résultats.

## Recette avant livraison

1. Compte plateforme actif : suspendre une agence commerciale avec motif, vérifier le journal et le cutoff ; passer en sécurité sans changer le cutoff, puis réactiver.
2. Agence commerciale : lire planning et exports ; refuser création, déplacement de mission, affectation, changement de profil et upload. Vérifier l'absence d'écriture à la consultation des notifications et de l'usage absent.
3. Agent dont l'identifiant diffère de l'UID : prise puis fin de service, déclaration d'incident sur une mission en cours ; refus sur autre agence, autre agent, mission future, close et fin dépassée.
4. Suspendre pour sécurité entre ouverture du formulaire et enregistrement : aucun incident/pointage écrit. Tester un changement d'affectation concurrent.
5. Vérifier portail, lien direct d'impression, retour de focus, déconnexion et reconnexion ; aucun document métier servi après blocage. Une copie déjà téléchargée demeure hors de contrôle du SaaS.
6. Vérifier l'index `assignments(tenantId, agentId, status, updatedAt DESC)` ajouté au dépôt. L'émulateur ne prouve pas sa disponibilité cloud. La liste terrain est bornée comme la liste existante ; contrôler les données réelles et afficher une erreur en cas d'index absent, pas une fausse liste vide.
7. Inventorier les suspensions historiques sans mode/cutoff, les membres sans statut actif et les anciennes URL Storage à jeton. Une URL publique préexistante ne dépend pas des règles SDK : sa révocation éventuelle est une migration séparée à autoriser, pas une garantie de ce patch.
8. Observer la CI distante et réaliser une recette navigateur multi-rôles, mobile et géolocalisation. Le build local ne remplace pas cette recette.
9. Après accord explicite, livrer ensemble code, règles Firestore/Storage, fonction HTTP et index, puis vérifier les versions réellement servies. Ne pas annoncer de suspension effective en production sur la seule base du code local.
