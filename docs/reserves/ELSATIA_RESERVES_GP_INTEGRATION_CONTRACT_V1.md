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
| adresse, code postal, ville | idem | ✅ livré (§6, `reserves_synchroniser_chantier_gp`) |
| référence, client, description, dates | `reference`, `client`, `description`, `date_debut`, `date_fin_prevue` | ✅ livré (§6) |
| plans / `documents_chantier` (catégorie « plan ») | `reserves_plans` (copie versionnée) | ✅ livré (§6) |
| sous-traitants du chantier | `reserves_intervenants` | ✅ livré (§6) |
| contacts (client, entreprises) | `reserves_contacts` | ✅ livré (§6) |
| bâtiments / zones | `reserves_plans.niveau` / `zone` | ⛔ Gestion Pro ne porte aucune structure bâtiment/zone : rien à transmettre |

`reserves_importer_chantier_gp` (nom seul) reste servie, inchangée, pour ses appelants.

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

## 4. Ce qui n'était pas branché dans le lot V1 (historique)

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

## 6. Complétion V1 — migration `20260927000402` (2026-09-27)

Rapport : `docs/qualification/ELSATIA_GP_RESERVES_INTEGRATION_COMPLETION_V1.md`.

| Fonction | Rôle |
| --- | --- |
| `reserves_synchroniser_chantier_gp(chantier_gp)` → rapport | crée **ou rattache** (homonyme Réserves libre) le chantier, transmet champs, entreprises, contacts, prépare les copies de plan. Idempotente. |
| `reserves_confirmer_plan_gp(plan, chemin)` | active une copie de plan déposée dans `reserves-plans` (seulement celle que la synchronisation a préparée). |
| `reserves_etat_chantier_gp(chantier_gp)` → état \| NULL | ce qu'affiche la fiche GP : total, ouvertes (émises), en cours, attente levée, levées, en retard, statuts, lien, droit de synchroniser. NULL = pas de bloc. |

Règles :

- **Habilitation** : Réserves `gerer_chantier` + chantier consultable dans GP
  (`peut_consulter_chantier`, qui couvre le chef de chantier affecté). Chaque donnée n'est
  transmise que si l'appelant la voit dans GP : sous-traitants (`acces_sous_traitants`),
  contacts client (`acces_clients`), plans (`peut_voir_document_chantier`, audience).
- **Propriété d'un champ** : GP l'emporte tant que Réserves ne l'a pas modifié depuis la
  dernière transmission (empreinte `gp_empreinte`) ; sinon la valeur Réserves est conservée
  et signalée (`champs_conserves`).
- **Plans** : copie possédée par Réserves, `gp_version` incrémentée à chaque version GP
  appliquée. Une version GP n'est appliquée que si le plan n'a été ni modifié dans Réserves
  (`modifie_localement_at`) ni utilisé pour localiser une réserve ; sinon
  `gp_maj_disponible` est posé. Le fichier actif n'est remplacé qu'après dépôt confirmé.
- **Contacts** : `reserves_contacts` n'a aucun lien vers un compte ; aucune habilitation
  ni aucun accès applicatif n'est écrit par la synchronisation. L'accès d'une entreprise
  reste né de l'invitation / désignation explicite.
- **Suppression GP** : aucune clé étrangère nouvelle vers GP ; R-04 (détachement) conservé.
- **Écriture directe** : les colonnes d'intégration (`source`, liens GP, empreintes,
  versions) sont refusées en PATCH sous `authenticated`/`anon`.

Côté Gestion Pro : bloc « ELSATIA Réserves » de la fiche chantier
(`src/components/BlocReservesChantier.tsx`), action POST `/chantiers/[id]/reserves`
(`src/app/(app)/chantiers/[id]/reserves/route.ts`), copie des plans sous la session de
l'utilisateur (`src/lib/reserves-gp.ts`), URL Réserves issue du catalogue.
