# Sentrys — Pilotage technique et exigences de livraison

## Mandat

Développer un SaaS fiable pour l'exploitation d'une agence de sécurité privée. La réussite se mesure à la sécurité des données, à la justesse des opérations, à la facilité d'utilisation et à la capacité de maintenir le service. Une démonstration visuelle ou un test vert isolé ne suffit pas.

Ce document établit les critères techniques proposés pour les prochains lots. Les engagements contractuels, délais, coûts, règles métier réglementaires et niveaux de service nécessitent une validation du propriétaire du produit et des responsables métier concernés.

## État de référence — 8 septembre 2026

- `origin/main` vérifié par fetch : `b0af7ac`, intégrant le lot de stabilisation L1 `2d0e932`.
- Le checkout local historique `main` est resté à `ac9ff1a` avec 34 modifications suivies non commitées. Ne pas le réinitialiser et ne pas en déduire l'état de production.
- Un worktree L2 sécurité comporte déjà des changements utilisateur dans les règles Firebase, les dépendances et des tests d'émulateur. Revue indépendante avant toute intégration ; aucune reprise destructive.
- Le nouveau lot `agent/platform-access` part de `origin/main` dans un worktree séparé. Aucun changement dans le checkout historique ni dans L2.
- L'audit du 8 septembre porte sur le checkout historique ; ses résultats CI doivent être rapprochés des corrections L1. Les défauts ne sont pas réputés encore ouverts sur une branche plus récente sans vérification.
- Commit, push, fusion et déploiement sont des étapes distinctes. Aucun succès de l'une ne constitue une preuve de réussite des autres.

## Responsabilités

| Fonction | Responsabilité | Ne peut pas remplacer |
| --- | --- | --- |
| Direction technique | Priorités, architecture, limites de lot, intégration, décision technique | Validation métier du propriétaire |
| Développement | Correctif minimal, tests, description de l'impact | Revue indépendante de son propre patch |
| Revue sécurité | Scénarios adverses, frontières d'accès, analyse du diff | Test des règles réellement déployées |
| QA | Reproduction, non-régression, environnement et résultats exacts | Recette terrain avec utilisateurs |
| Produit / UX | Parcours, accessibilité, langage, tests de prise en main | Justesse du moteur métier |
| Propriétaire du produit | Arbitrages métier, budget, réception, autorisation production | Contrôles techniques avant livraison |

Les agents travaillent sur des ensembles de fichiers séparés. Ils ne fusionnent pas leurs changements et ne déploient pas de leur propre initiative.

## Ordre des lots

1. Réconcilier référence Git, travaux déjà présents et preuves de validation.
2. Sécuriser droits utilisateur, autorité plateforme, séparation des agences et règles Firebase.
3. Fiabiliser temps/absences/pré-paie, affectations simultanées, échecs partiels et reprises.
4. Fiabiliser diffusion, confirmations, pointage et continuité réseau.
5. Simplifier les parcours planning et agent, puis l'onboarding et les imports.
6. Harmoniser design, accessibilité, performance, vitrine et promesses commerciales.

Les lots restent petits et testables. Pas de migration de framework, de nouvelle architecture distribuée ou de changement massif de dépendances sans problème mesuré et décision documentée.

## Fiche obligatoire pour chaque lot

- Problème utilisateur et/ou scénario de risque.
- Source de preuve : fichier, reproduction ou mesure, avec version inspectée.
- Critère attendu, exprimé comme comportement observable.
- Périmètre de fichiers et contrats modifiés ; exclusions explicites.
- Tests négatifs, positifs, de panne et de concurrence selon risque.
- Impact sur anciennes données, anciens clients et permissions existantes.
- Plan de retour arrière ; traitement des migrations et écritures irréversibles.
- Commandes exactes et résultats, avec version Node et environnement.
- Diff relu ; objections du relecteur traitées ou explicitement bloquantes.
- Statut précis : en cours, implémenté, testé localement, relu, prêt à intégrer, intégré, déployé, vérifié en recette.

## Portes de validation

### Avant développement

Le défaut est identifié et la référence est connue. Aucun conflit de propriété de fichiers. Les effets attendus et le critère de sortie sont écrits. Si une règle métier manque, demander l'arbitrage ; ne pas l'inventer.

### Avant intégration

- Diff limité au mandat, sans secret ni donnée réelle ajoutés.
- Tests échouant sur l'ancien comportement puis passant sur le correctif, lorsque reproductible.
- TypeScript, lint, tests métier et contrôles de sécurité exécutés sur la branche candidate.
- Pour une modification d'accès : tests d'autorisation par rôle, tenant, statut et propriété ; règles Firebase vérifiées dans un émulateur isolé lorsque concernées.
- Pour les écritures : tests de retries, doublons, concurrence et échecs partiels selon le périmètre.
- Pour l'interface : parcours nominal et erreurs, clavier, tactile, thèmes et tailles convenues.
- Revue indépendante ; aucune objection critique ou élevée laissée sans traitement explicite.

Un test statique de présence d'une fonction ne prouve pas l'application de la politique à l'exécution. Un test ignoré, bloqué par l'environnement ou non exécuté ne doit jamais être compté comme réussi.

### Avant production

Build et CI de la révision candidate réussis ; test en environnement de recette ; règles/index/config compatibles ; procédure de retour arrière ; absence de migration destructive implicite ; accord du propriétaire. Vérifier après livraison la révision servie et les parcours critiques sans créer de données fictives dans les agences réelles.

## Premier lot activé : autorité plateforme

Objectif : les routes `/api/platform/**` exigent une identité authentifiée autorisée, le rôle `super_admin` et l'appartenance au tenant plateforme, selon une politique commune.

Critères :

- Les rôles agence sont refusés, y compris `owner` et `admin`.
- Un `super_admin` associé à une agence autre que la plateforme est refusé.
- Un compte plateforme sans le rôle requis est refusé.
- Les erreurs d'authentification restent des refus ; aucune opération métier avant autorisation.
- L'administrateur plateforme légitime conserve ses parcours existants.
- Les contrats de réponses et la logique métier non liée à l'accès restent inchangés.

Limite : ce lot ne résout pas l'édition des champs d'autorisation dans Firestore. Il doit être complété par le lot règles/comptes avant de déclarer la frontière de confiance sécurisée. Ajouter une condition `tenantId === platform` n'est pas une garantie suffisante si l'utilisateur peut modifier son tenant ou son rôle.

## Mesures à suivre

- Qualité : défauts de production, régressions échappées à la CI, temps de diagnostic et restauration.
- Métier : vacations non couvertes, temps de remplacement, corrections manuelles de pré-paie.
- Adoption : temps jusqu'à première diffusion confirmée et besoin d'assistance par parcours.
- Expérience : réussite des tâches, erreurs compréhensibles, accessibilité et performance sur mobile représentatif.
- Exploitation : taux d'erreur, latence, coût par agence, reprise des notifications et restauration de sauvegarde.

Mesurer une situation initiale avant de fixer des objectifs chiffrés. Aucun pourcentage de gain ni promesse de disponibilité sans preuve correspondante.

## Règles de communication

Rapporter ce qui a changé, la preuve, ce qui reste ouvert et la prochaine décision. Signaler immédiatement un risque critique. Ne jamais promettre zéro défaut : prévenir, détecter, limiter l'impact et corriger avec traçabilité.

Pas de « terminé » pour un lot seulement développé. Pas de « sécurisé » sans couverture des chemins d'accès concernés. Pas de « poussé » sans résultat Git vérifié. Pas de « en production » sans vérification du déploiement.
