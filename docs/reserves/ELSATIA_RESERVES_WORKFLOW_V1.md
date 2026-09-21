# ELSATIA Réserves — workflow V1

Source de vérité : la table `public.reserves_transitions`, seedée par la migration
`20260906000268`. Ce document la décrit ; il ne la remplace pas.

## 1. Principe

Aucune transition n'est décidée par le frontend. Toute mutation d'état passe par
`reserves_appliquer_transition()`, qui :

1. verrouille la réserve ;
2. résout la qualité de l'acteur courant (`hote` ou `intervenant`) ;
3. cherche l'arête `(statut_avant, statut_apres, acteur)` dans `reserves_transitions` —
   absente, l'action échoue ;
4. exige le commentaire quand la matrice le marque obligatoire ;
5. contrôle l'exigence de photo propre à la réserve ;
6. mute, historise et écrit l'événement de notification **dans la même transaction**.

Un `update` direct de `statut`, `intervenant_id`, ou de l'un des horodatages de cycle de
vie est refusé par le trigger `reserves_garde_workflow`, même pour un administrateur de
l'organisation, même via PostgREST.

## 2. États

| Code | Signification |
| --- | --- |
| `emise` | Constatée, pas encore attribuée |
| `assignee` | Attribuée à une entreprise, en attente de sa réponse |
| `refusee_responsabilite` | L'entreprise décline, motif à l'appui — retour à l'hôte |
| `acceptee` | L'entreprise prend la reprise à sa charge |
| `levee_demandee` | Travaux déclarés faits, en attente de la décision de l'hôte |
| `levee_refusee` | Reprise jugée insuffisante — retour à l'entreprise |
| `levee` | Levée validée |
| `annulee` | Réserve abandonnée (état terminal) |

## 3. Matrice des transitions

| Avant | Après | Acteur | Action | Motif obligatoire |
| --- | --- | --- | --- | --- |
| `emise` | `assignee` | hôte | assignation | non |
| `emise` | `annulee` | hôte | annulation | **oui** |
| `assignee` | `acceptee` | intervenant | acceptation | non |
| `assignee` | `refusee_responsabilite` | intervenant | refus_responsabilite | **oui** |
| `assignee` | `assignee` | hôte | reassignation | non |
| `assignee` | `annulee` | hôte | annulation | **oui** |
| `refusee_responsabilite` | `assignee` | hôte | reassignation | non |
| `refusee_responsabilite` | `annulee` | hôte | annulation | **oui** |
| `acceptee` | `levee_demandee` | intervenant | demande_levee | non |
| `acceptee` | `annulee` | hôte | annulation | **oui** |
| `levee_demandee` | `levee` | hôte | levee_validee | non |
| `levee_demandee` | `levee_refusee` | hôte | levee_refusee | **oui** |
| `levee_refusee` | `levee_demandee` | intervenant | demande_levee | non |
| `levee` | `assignee` | hôte | reouverture | **oui** |

La colonne `acteur` porte une garantie forte : l'organisation hôte **ne peut pas**
accepter une responsabilité à la place de son sous-traitant, et une entreprise
intervenante **ne peut pas** valider sa propre levée. Ce n'est pas une règle d'interface,
c'est une clé primaire.

## 4. Photo obligatoire pour la levée

`reserves.photo_obligatoire_levee` est un booléen **par réserve**, choisi par l'émetteur
à la création. Quand il vaut `true`, `reserves_appliquer_transition()` refuse l'action
`demande_levee` tant qu'aucune photo d'usage `travaux` ou `levee` n'est rattachée.

Le contrôle est **en base**. Appeler la RPC directement, sans passer par l'interface, ne
le contourne pas.

Par défaut, la photo est **facultative** à la création d'une réserve : c'est une exigence
que l'on ajoute, pas une contrainte que l'on subit.

## 5. Points d'entrée applicatifs

| RPC | Acteur attendu | Garde spécifique |
| --- | --- | --- |
| `reserves_creer` | hôte, rôle émetteur et au-dessus | `creer_reserve` |
| `reserves_assigner` | hôte | matrice |
| `reserves_repondre_responsabilite` | intervenant | motif obligatoire au refus |
| `reserves_demander_levee` | intervenant | exigence de photo |
| `reserves_statuer_levee` | hôte | `valider_levee` (responsable / admin uniquement) |
| `reserves_rouvrir` | hôte | `valider_levee` + motif |
| `reserves_annuler` | hôte | motif |
| `reserves_ajouter_photo` | les deux | acteur reconnu sur la réserve |
| `reserves_commenter` | les deux | acteur reconnu sur la réserve |

`reserves_appliquer_transition()` est **révoquée** pour `authenticated` : elle n'est
atteignable que par les actions ci-dessus, qui portent chacune leur garde métier.

## 6. Historique

Chaque geste écrit une ligne dans `reserves_historique` : qui, quoi, quand, statut avant
et après, champ modifié et valeur avant/après quand cela a un sens, commentaire.

La table est **append-only** : aucune policy `update`/`delete` n'existe pour
`authenticated`, et le droit est explicitement révoqué. Le test pgTAP le prouve.

Actions tracées : `creation`, `assignation`, `reassignation`, `acceptation`,
`refus_responsabilite`, `commentaire`, `photo_ajoutee`, `demande_levee`,
`levee_validee`, `levee_refusee`, `reouverture`, `annulation`, `modification`.

## 7. Notifications

Les actions métier écrivent dans `reserves_evenements_notifications` avec le destinataire
attendu : ce que l'hôte décide part vers l'entreprise intervenante, ce que l'intervenant
déclare remonte à l'organisation hôte.

Types : `reserve_creee`, `reserve_assignee`, `reserve_annulee`, `reserve_reouverte`,
`responsabilite_refusee`, `message_recu`, `echeance_proche`, `levee_demandee`,
`levee_validee`, `levee_refusee`.

**Aucun canal externe n'est branché en V1.** La file est écrite, jamais consommée ;
`distribue_at` reste nul. `echeance_proche` est déclaré au contrat mais n'a pas encore de
producteur : il faudra un lot avec un déclencheur périodique.
