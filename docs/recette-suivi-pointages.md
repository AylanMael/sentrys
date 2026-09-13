# Suivi des pointages — lot lecture seule

## Parcours

Compte responsable/manager/administrateur ou observateur autorisé : Quotidien → Pointages (/dashboard/pointages).

1. Sélectionner la date de début des missions, en heure de Paris. Une mission de nuit appartient à sa date de début.
2. Vérifier une ligne par agent actuellement affecté à une vacation : nom, site, horaires prévus, entrée et sortie réellement enregistrées.
3. Vérifier les statuts : À venir avant début ; Non pointé après début sans entrée ; En service après entrée sans sortie ; Sortie manquante à partir de la fin prévue ; Service terminé après entrée et sortie cohérentes ; À vérifier si données incohérentes.
4. Rechercher un agent/site dans les lignes chargées ; charger la suite si le curseur est présent. Compteurs limités aux lignes chargées, pas totaux d'agence.
5. Actualiser pour obtenir un nouvel état. Pas de polling ni de statut supposé à partir des seuls horaires.
6. Journal d'activité : pointages masqués par défaut dans cette page, option « Inclure les traces de pointage dans l'audit ». Les actions précises prise/fin de service permettent aussi leur consultation.

## Périmètre et sécurité

- Aucun pointage, rôle, règle Firestore ou donnée métier modifié par ce lot.
- Lecture transactionnelle : appartenance actuelle, rôle backoffice, agence non suspendue pour sécurité, toutes les jointures filtrées par tenant.
- Suspension commerciale : consultation autorisée selon les droits existants ; agent et client exclus de cette API.
- DTO minimal, sans coordonnées GPS ni dossiers personnels.
- Pagination 20 vacations + 1 témoin. Maximum 50 agents par vacation ; dépassement signalé comme anomalie/incomplétude, jamais silencieusement tronqué. Cache des jointures pour la page. Charge maximale non mesurée en cloud.
- Index existant vacations tenantId/startAt DESC réutilisé. Pas de déploiement.
- Vue des affectations actuelles et horaires actuels du planning, pas une reconstitution historique : agents retirés, vacations supprimées/annulées restent à rechercher dans les traces d'audit conservées.
- L'API activity reste compatible avec les anciens consommateurs : exclusion uniquement avec excludePointages=true. Le curseur avance même sur une page entièrement masquée.

## Vérifications

- Tests : statuts/bornes, absence d'horaires inventés, jointures étrangères, accès révoqué, suspension, cursor étranger/hors date, pagination, page filtrée, dépassement de cardinalité, journées Paris de 23/24/25 h, séparation audit.
- API locale du 09/09/2026 : Agent Recette / Tour Eiffel, une mission terminée avec entrée 16:27:39 et sortie 16:32:34, une autre non pointée.
- Rendu mobile réel et build de production à vérifier avant déploiement. Revue visuelle non effectuée avec le compte responsable : l'onglet disponible est en session agent.
