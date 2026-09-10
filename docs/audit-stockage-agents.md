# Audit direct Storage agents — 10 septembre 2026

## Périmètre et méthode

Commande `node scripts/check-agent-storage-local.mjs`. Auth simulée par rules-unit-testing ; règles Storage réelles chargées sur l’émulateur 9199 et profils fictifs sur Firestore 8091. Projet **demo-sentrys-accounts**, aucun accès à la production.

Fixture valide : `qa-storage-20ab793c-fcb6-4453-9bd0-8851aab7e9bc`. Objets fictifs à contenu minimal, sans document personnel. Les remplacements et suppressions portent uniquement sur ces objets de recette. Le reste des fixtures est conservé pour inspection.

Premier essai avec un projet démo distinct : tous les accès, même légitimes, étaient refusés en raison de la résolution inter-services de l’émulateur. Essai non retenu comme preuve de sécurité. La revalidation utilise le projet commun aux deux émulateurs et confirme les témoins positifs.

## Résultat : 8 conformités sur 16 attentes alignées sur l’API

Même résultat pour photo et documents :

| Cas | Résultat réel | Attente |
| --- | --- | --- |
| Lecture des métadonnées du dossier agent lié | Autorisée | Autorisée |
| Lecture du dossier d’un collègue ordinaire | Refusée | Refusée |
| Lecture d’un second dossier portant l’UID malgré un agentId distinct | Autorisée | Refusée |
| Création directe par l’agent | Autorisée | Refusée comme l’API de dépôt |
| Remplacement direct par l’agent | Autorisé | Refusé comme l’API de dépôt |
| Suppression directe par l’agent | Autorisée | Refusée comme l’API de suppression |
| Lecture par un responsable d’une autre agence | Refusée | Refusée |
| Lecture par un responsable de la même agence | Autorisée | Autorisée |

## Causes et décisions nécessaires

1. `storage.rules:isOwnAgentRecord` accepte `uid == agentId` **ou** le lien `tenantUsers.agentId`, même quand le lien explicite existe. L’API de téléchargement choisit un seul identifiant. Le test crée deux dossiers distincts valides pour démontrer cette divergence ; il ne démontre pas l’accès à un dossier arbitraire.
2. `canAccessAgentFiles` autorise les écritures Storage des agents. Les routes de dépôt de photos/documents, elles, exigent un rôle responsable. Le chemin direct contourne donc les contrôles du fichier exécutés uniquement dans l’API. Le remplacement/suppression ont effectivement réussi sur les objets fictifs.

Proposition à valider : agent en lecture de son seul dossier lié ; gestion des fichiers via les routes serveur autorisées. Décider explicitement si l’on souhaite un dépôt agent ultérieur avec validation, plutôt que maintenir deux politiques contradictoires. Aucun correctif de règles ni déploiement dans ce lot.

## Correctif local après validation utilisateur

Politique appliquée : un lien agentId non vide exclut le fallback UID ; absence/null/chaîne vide conservent le fallback legacy ; valeur de type invalide refusée. Les créations, remplacements et suppressions Storage directes sont refusés pour tous les clients, y compris responsables. Les routes serveur autorisées restent le seul chemin de modification et utilisent Admin SDK. Aucun appel d’écriture Storage client trouvé dans src.

Validation finale :

- **25 contrôles Storage réussis**, fixture `qa-storage-f0081e69-e22e-4a44-846c-cb4caf77fa08`, incluant responsables et fallback legacy.
- **568 tests applicatifs réussis**, dont 5 nouveaux tests du handler de dépôt photo avec les validations réelles et le stockage simulé. Le responsable atteint le dépôt serveur ; agent/viewer, autre tenant et signature invalide sont refusés.
- **142 tests de suspension Firestore/Storage réussis**, exécutés dans des émulateurs séparés sur 8191/9299, arrêtés automatiquement en fin de recette. Une exécution initiale dans l’émulateur de travail avait 5 collisions liées au tenant platform préexistant : aucune suppression de ce tenant ; le résultat isolé est celui retenu.
- Contrôles de sécurité et lint ciblé réussis ; revue indépendante favorable.

Le test de dépôt serveur ne remplace pas une recette navigateur de gestion documentaire. Les liens publics historiques restent hors périmètre. Pas de commit, push ou déploiement dans ce correctif local ; sa livraison nécessitera de déployer storage.rules (un push applicatif seul ne suffit pas).

## Politique documentaire révisée à la demande de l’utilisateur

Les documents administratifs sont désormais réservés aux responsables (super_admin, owner, admin, manager du tenant). L’agent ne peut plus télécharger ses documents, même avec leur URL API ou le chemin Storage. La photo de profil demeure distincte et conserve son accès personnel existant. Un chemin documentaire placé à tort dans photoPath est refusé côté agent.

Correction locale : refus API avant lecture de la fiche pour un fileId documentaire ; lecture Storage du dossier documents réservée à isTenantDocumentManager. Les écritures directes restent interdites pour tous les clients.

Validation : **570 tests applicatifs**, **142 tests de suspension en émulateurs isolés**, **28 contrôles Storage réels** (fixture `qa-storage-533dfcb7-5681-454c-b8b2-f781e253125c`) réussis ; TypeScript et contrôles de sécurité passent. Revue indépendante favorable. Une recette ciblée sans résultat exploitable sur les émulateurs de travail a été interrompue puis rejouée sur 8191/9299 ; aucun serveur utilisateur arrêté.

Limites : pas de révocation des anciens liens publics à jeton, pas d’audit exhaustif des métadonnées de fiches. Ce nouveau changement n’est pas encore committé ni déployé ; nécessite code applicatif et règles Storage.

Le lint ciblé est resté sans résultat après relance et a été interrompu ; il n’est pas revendiqué comme validé pour ce sous-lot et reste à rejouer avant livraison.

Limites : lecture testée par `getMetadata` (règle read), pas téléchargement octet par octet ; les jetons publics historiques, fichiers existants de production, antivirus et signatures ne sont pas audités ici. Les signatures des fixtures sont minimales et ne constituent pas un document exploitable.
