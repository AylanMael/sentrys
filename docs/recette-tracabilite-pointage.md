# Traçabilité des pointages — recette locale

- Journal agence : nom agent, lien fiche lorsque disponible, site et date/heure exacte (Paris).
- Filtres prise/fin de service et affectations ; recherche du nom/site limitée aux événements chargés.
- Nouveaux événements : nom agent et site photographiés au moment du pointage, dans la même transaction. Identifiants et UID conservés. Aucun GPS ajouté aux réponses du journal.
- Anciens événements : résolution prudente par UID, affectation du même tenant et clé historique déterministe vacation_agent. Noms actuels, pas reconstitution de noms historiques. Liens divergents, clé non standard ou documents absents : agent non identifiable. Aucune migration des événements.
- API journal : accès backoffice uniquement, cache désactivé, contrôle tenant du curseur, enrichissement borné à la page avec déduplication des lectures.
- Les index activity ajoutés pour les filtres doivent être déployés avant utilisation cloud. Aucun déploiement effectué.

## Vérification manuelle

1. Compte responsable : ouvrir /dashboard/activity puis actualiser.
2. Vérifier nom, site et heure sur les pointages existants ; ouvrir la fiche agent.
3. Filtrer « Prise de service », puis « Fin de service », puis rechercher le nom dans la liste chargée.
4. Compte agent : prise et fin pendant une mission autorisée, avec géolocalisation réelle. Vérifier les nouvelles entrées côté responsable.

## Vérifications et limites

- API locale : les deux événements existants retournent Agent Recette / Tour Eiffel, entrée 16:27:39 et sortie 16:32:34 le 09/09/2026 (Paris).
- Tests de résolution legacy, documents étrangers, suppression, renommage, modification simultanée des liens, cache et snapshots transactionnels.
- Revue indépendante : risque initial de réattribution historique corrigé et revalidé.
- Ce lot ne crée pas un tableau de présence en temps réel. Les filtres severity/from/to de l'ancien activity-explorer restent hors scope (non traités par l'API).
- Rendu visuel navigateur et build de production non vérifiés pour ce lot.
