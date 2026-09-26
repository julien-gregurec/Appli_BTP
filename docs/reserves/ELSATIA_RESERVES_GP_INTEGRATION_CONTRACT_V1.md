# ELSATIA Réserves ↔ Gestion Pro — contrat d'intégration V1

## 1. Règle cardinale

**Gestion Pro n'est pas requis.** Réserves possède ses propres chantiers, ses propres
entreprises intervenantes et ses propres plans. Une organisation qui n'a jamais ouvert
Gestion Pro utilise Réserves sans rien perdre.

L'intégration est donc **opt-in, colonne par colonne** : `reserves_chantiers.chantier_gp_id`
est nullable, et `source` vaut `'reserves'` par défaut. Aucune contrainte, aucune policy,
aucune fonction de Réserves n'exige la présence d'une donnée Gestion Pro.

La clé étrangère vers `public.chantiers` existe pour l'intégrité référentielle — les deux
applications partagent la même base — mais elle n'établit aucune dépendance produit.

## 2. Sens Gestion Pro → Réserves

### `reserves_importer_chantier_gp(p_chantier_gp_id uuid) → uuid`

Crée ou met à jour le chantier Réserves miroir d'un chantier Gestion Pro.

**Double habilitation exigée.** L'appelant doit être habilité **des deux côtés** :

- côté Réserves : `reserves_action_autorisee(entreprise, 'gerer_chantier')` ;
- côté Gestion Pro : `a_permission(entreprise, 'acces_chantiers')`.

Aucun droit n'est déduit d'une application vers l'autre. Quelqu'un qui gère les chantiers
dans Réserves mais n'a aucun accès chantiers dans Gestion Pro **ne peut pas** importer.

L'opération est idempotente : réimporter un chantier déjà lié met à jour son nom et
`synchronise_at` sans créer de doublon (index unique partiel sur
`(entreprise_id, chantier_gp_id)`).

### Données reprises en V1

| Champ Gestion Pro | Champ Réserves | Statut |
| --- | --- | --- |
| `chantiers.id` | `chantier_gp_id` | ✅ livré |
| `chantiers.nom` | `nom` | ✅ livré |
| adresse, code postal, ville | idem | ⛔ à faire |
| plans / `documents_chantier` | `reserves_plans` | ⛔ à faire |
| entreprises et contacts | `reserves_intervenants` | ⛔ à faire |

Les trois dernières lignes sont **le contrat, pas la livraison** : les colonnes existent
et sont prêtes à recevoir ces données, mais aucune reprise automatique n'est écrite dans
ce lot. La reprise des plans en particulier suppose une décision sur le stockage partagé
(bucket `chantier-documents` de Gestion Pro contre bucket propre à Réserves) qui n'a pas
été tranchée.

## 3. Sens Réserves → Gestion Pro

### `reserves_resume_chantier_gp(p_chantier_gp_id uuid)`

Renvoie, pour un chantier Gestion Pro, ce que sa fiche peut afficher :

| Champ | Sens |
| --- | --- |
| `chantier_reserves_id` | Cible du lien « ouvrir dans Réserves » |
| `total` | Nombre de réserves |
| `ouvertes` | Ni levées ni annulées |
| `demandes_levee` | En attente de décision de l'hôte |
| `levees` | Levées validées |
| `en_retard` | Échéance dépassée, réserve encore ouverte |

**Ce que cette fonction ne renvoie pas, volontairement** : le détail des réserves, les
noms des entreprises intervenantes, les motifs de refus. Une fiche chantier Gestion Pro
n'a pas à exposer les échanges contradictoires entre le maître d'ouvrage et un
sous-traitant.

La fonction est soumise à `reserves_action_autorisee(entreprise, 'voir')` : un
utilisateur Gestion Pro sans droit Réserves obtient une réponse vide, pas une erreur —
la fiche chantier reste utilisable, simplement sans le bloc réserves.

### Lien applicatif

L'URL de Réserves est portée par le catalogue (`applications_elsatia.url_locale` /
`url_preview` / `url_production`), comme pour Colors et Tools. Gestion Pro n'a aucune URL
Réserves en dur à maintenir.

`url_production` est **nulle** tant qu'aucun domaine n'est servi, et `statut_produit` vaut
`'interne'` : l'application est active au catalogue (condition de l'accès du propriétaire
global) sans être annoncée comme commercialisée.

## 4. Ce qui n'est pas branché dans ce lot

Aucun appel croisé n'est câblé dans les interfaces : Gestion Pro n'affiche pas encore le
bloc réserves sur sa fiche chantier, et Réserves n'a pas d'écran d'import. Les deux
fonctions ci-dessus existent, sont testées, et attendent leur lot d'intégration.

C'est un choix : coupler les deux interfaces maintenant reviendrait à faire dépendre la
mise en service de Réserves d'une modification de Gestion Pro, qui est en phase
pré-commerciale et dont le train de migrations est gelé au ledger 265.

## 5. Isolation

L'intégration ne crée **aucune** brèche multi-tenant :

- `reserves_importer_chantier_gp` lit le chantier Gestion Pro puis vérifie les deux
  habilitations **sur l'entreprise de ce chantier** — jamais sur celle de l'appelant ;
- `reserves_resume_chantier_gp` agrège sous le prédicat de lecture Réserves normal ;
- les RLS métier de Gestion Pro (clients, chantiers, devis, factures) sont **inchangées**
  par la migration `00268`.

Le test pgTAP vérifie qu'une entreprise invitée ne lit aucun chantier ni client Gestion
Pro de l'organisation hôte, alors même qu'elle travaille sur son chantier.
