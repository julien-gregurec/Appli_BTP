# ELSATIA-GP-EXPERT-COMPTABLE-NOTES-FRAIS-CLOSURE-V1 — Rapport

## 1. Identification

| | |
|---|---|
| Branche | `feat/gp-expert-comptable-notes-frais-closure-v1` |
| SHA de départ | `bb17c175de854f10aa225c85f393baafd2eb80a8` — vérifié identique en local et sur `origin` |
| SHA du code qualifié | `5685dd4799a0d37b3f179186a5074c4794bc5f4d` (phase G complète, arbre figé) |
| Commits suivants | `aab18ca` — correction d'une recette E2E (test seul) ; puis le commit de ce rapport |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-expert-comptable-notes-frais-v1`, créé pour ce lot, une seule session propriétaire |
| Ledger | 278 fichiers, dernier n° 280 — **inchangé** : aucune migration créée, modifiée ou numérotée ; `verify:migrations` 0 |

**Session concurrente vérifiée.** Au démarrage, une autre session (`elsatia-main-ed`) clonait
les dépendances du worktree pilote pour un AUTRE lot (`gp-devis-wysiwyg-catalogue-ouvrages-v1`).
Aucune ne touche ce worktree ; la pile Supabase de recette est partagée : ce lot a utilisé ses
propres ports (3210, 3211, 60431) et n'a écrit que ses propres lignes de décor.

## 2. Verdict

**PRÊT SOUS CONDITIONS.**

Le circuit comptable de l'expert-comptable est livré et prouvé là où il se décide :

- **ouverture contrôlée** (proxy et écran d'accès) — 18 tests unitaires ;
- **tout ce qui doit être permis l'est, tout ce qui doit être refusé l'est**, éprouvé en base sous
  l'identité réelle de l'expert-comptable (section 8) : consulter, télécharger, contrôler,
  comptabiliser, exporter, lire les journaux ; jamais modifier la dépense, supprimer ou remplacer
  un justificatif, modifier une facture définitive, administrer, ni voir une autre entreprise ;
- **aucune escalade possible**, et gratuité déjà assurée ;
- qualification statique complète sur le SHA final (section 7).

**Conditions :**

1. **Autorisation de la migration proposée** (section 9) — indispensable pour qu'un poste
   d'expert-comptable composé depuis l'écran ne reçoive pas d'office planning et pointage.
2. **Recette authentifiée Android et iPhone à rejouer sur un poste libéré** : deux tentatives, et
   aucune mesure du nouveau parcours — GoTrue en 504 et 500 sous la saturation d'autres piles
   (section 8). La spec (19 tests) est prête et versionnée ; elle se rejoue en une commande.

La condition **C4** du rapport GP mobile n'est donc **pas levée** : les preuves Android et iPhone
ne sont pas complètes.

## 3. Décision appliquée (2026-09-11)

L'expert-comptable, pour l'entreprise qui l'a mandaté : consulte toutes les notes de frais et
leurs justificatifs, les télécharge, les contrôle (prise en charge, correction, validation,
refus motivé), les comptabilise, produit les exports, consulte les journaux. Il ne modifie
jamais la dépense du salarié, ne supprime ni ne remplace un justificatif, ne modifie pas une
facture définitive, n'administre ni utilisateurs, ni rôles, ni paramètres, et ne voit rien
d'une autre entreprise. Son accès est gratuit.

## 4. Audit

### 4.1 Ce que la base garantissait déjà

| Garantie | Mécanisme (vérifié en base) |
|---|---|
| Lecture des notes et justificatifs de l'entreprise | `peut_consulter_note_frais` admet `verifier_`, `gerer_`, `comptabiliser_`, `administrer_archivage_notes_frais` ; même fonction pour le Storage `notes-frais` |
| Contrôle sans toucher à la dépense | `transition_note_frais` (`SECURITY DEFINER`) : `verifier_notes_frais` pour prise en charge, correction, validation, refus ; motif obligatoire pour correction et refus ; ne met à jour que statut, motif, horodatages |
| Comptabilisation | `modifier_reference_comptable_note_frais` : exige `comptabiliser_notes_frais`, ne touche que `reference_comptable` ; export → `exporte_comptabilite` sous `comptabiliser` |
| Export | route `/api/notes-frais/exports` : `exporter_notes_frais` ; Storage `notes-frais-exports` sous la même permission |
| Journaux | RLS `journal_audit_notes_frais` : `consulter_audit_notes_frais` |
| Dépense intouchable | UPDATE et DELETE de `notes_frais` : `peut_modifier_note_frais_personnelle` ; `modifierNoteFraisAction` et `supprimerNoteFraisAction` exigent le salarié propriétaire |
| Justificatif intouchable | aucune règle DELETE sur `documents_notes_frais` ni sur le Storage `notes-frais` ; INSERT et UPDATE réservés au salarié ; la route d'upload écrit la base AVANT le stockage : un refus ne laisse aucun fichier orphelin |
| Gratuité | option `expert_comptable` à 0 € (migration 142, catalogue commercial) ; un poste est créé à `tarif_compte_mensuel = 0`, et ce tarif est le supplément facturé |

### 4.2 Ce qui bloquait

- Le proxy n'ouvrait `/notes-frais` et `/api/notes-frais` qu'à `saisir_ses_notes_frais`.
- Les actions de contrôle et de comptabilisation, postées depuis `/notes-frais/[id]`, étaient
  interceptées comme écritures (303 `?lecture=seule`).
- L'écran d'accès masquait les quatre droits comptables ; et comme l'enregistrement d'un poste
  réécrit TOUTES les clés du catalogue, enregistrer un poste d'expert-comptable depuis l'écran
  lui retirait silencieusement ses droits comptables.
- **Aucun modèle de rôle « expert-comptable »** : neuf modèles, dont un « comptable » INTERNE
  (`gerer_factures`, `gerer_notes_frais`, `gerer_paie`) bien au-delà du mandat.
- **`creer_poste_avec_permissions` et `enregistrer_permissions_poste` ajoutent d'office six
  droits personnels** (`acces_planning`, `acces_pointage`, `saisir_son_pointage`,
  `saisir_ses_notes_frais`, `demander_ses_conges`, `utiliser_borne_stock`) à tout poste qui
  n'est pas un compte dépôt. Un poste d'expert-comptable composé depuis l'écran reçoit donc
  PLANNING et POINTAGE : contraire au mandat, et impossible à empêcher sans migration.

### 4.3 Escalade de droits : absente, et démontrée

Sous l'identité réelle de l'expert-comptable, dans une transaction annulée : s'accorder
`gerer_utilisateurs` sur son propre poste → **refusé** par la RLS (`role_gestion_insert`) ;
modifier ou supprimer une permission de son poste → **0 ligne**. Les règles `role_gestion_*`
sont restrictives : elles s'ajoutent à la règle générale des membres. Rien n'a persisté.

## 5. Modifications

| Fichier | Nature | Commit |
|---|---|---|
| `src/lib/module-permissions.ts` | accès `/notes-frais` et `/api/notes-frais` au circuit comptable ; contrôle et comptabilisation laissés au proxy | `3bc1016` |
| `src/lib/roles-predefinis.ts` | quatre droits comptables configurables par clé exacte, libellés | `3bc1016` |
| `src/lib/module-permissions.test.ts` | nouveau — 12 tests | `3bc1016` |
| `src/lib/roles-predefinis.test.ts` | nouveau — 6 tests | `3bc1016` |
| `tests/e2e/pilote-mobile-expert-comptable.spec.ts` | circuit comptable complet et refus à la source (10 tests ajoutés, 19 au total) | `5685dd4` |
| `scripts/e2e/prepare-pilote-mobile.sql` | décor : `verifier_notes_frais` sur le poste expert | `cce990b` |
| `supabase/proposed/expert-comptable-poste-minimal.sql.proposed` | migration PROPOSÉE, non numérotée | `873dc32` |
| `supabase/proposed/tests/expert-comptable-poste-minimal.test.sql.proposed` | 9 tests pgTAP proposés | `873dc32` |

Aucune migration, aucune fonction ni règle RLS modifiée en base : la base de recette n'a reçu que la
ligne de décor `verifier_notes_frais` du poste expert.

## 6. Permissions finales du poste expert-comptable (décor de recette)

`acces_achats`, `acces_exports`, `acces_factures`, `acces_paiements_bancaires`,
`comptabiliser_notes_frais`, `consulter_audit_notes_frais`, `exporter_notes_frais`,
`verifier_notes_frais` — et aucun `gerer_*`, aucune saisie personnelle, ni planning, ni
pointage, ni messagerie, ni stock, ni paramètres.

## 7. Tests

**Unitaires** : `module-permissions.test.ts` (12) et `roles-predefinis.test.ts` (6) — **18/18**.
**Intégration en base** : section 8 — toutes les permissions et tous les refus mesurés sous
l'identité réelle de l'expert-comptable.

**E2E** : `pilote-mobile-expert-comptable.spec.ts`, 19 tests (dont 10 ajoutés) — prêts et
versionnés ; **non mesurés** sur ce poste (section 8). La correction `aab18ca` porte sur une
recette héritée qui passait pour une mauvaise raison.

**Qualification complète sur `5685dd4`** (arbre figé vérifié en fin de passe) :

| Étape | Résultat |
|---|---|
| `git diff --check` depuis `bb17c17` | 0 |
| `verify:migrations` / `verify:secrets` / ledger | 0 / 0 / 278 fichiers |
| vitest GP | 1 875 / 1 878 — les 3 échecs : `stripe/boutique/webhook/route.test.ts` (délai dépassé puis contagion au test suivant) et `xlsx.test.ts` (délai dépassé), sous charge 17 ; fichiers inchangés depuis la base Train V3, déjà relevés au lot précédent, verts seuls |
| tests tools / reserves / colors | 108/108 · 154/154 · 264/264 |
| typecheck GP / tools / reserves / colors | 0 / 0 / 0 / 0 |
| lint GP / tools / reserves / colors | 0 / 0 / 0 / 0 |
| build GP (`5685dd4`, environnement de recette) / build tools | vert / vert |

Aucun délai de test modifié, aucune relance « jusqu'au vert ».

## 8. Recette authentifiée Android et iPhone

**Tentative 1 (14:18 → 16:47) : aucune mesure — porte de pile refusée quatre fois.**
`recette.sh` n'a jamais lancé Playwright : la porte `attendre-pile.sh` (trois connexions GoTrue
consécutives sous 3 s et une requête PostgREST authentifiée sous 1,5 s) a échoué pour chaque
préparation et chaque suite — connexion GoTrue mesurée entre 18 et 31 s, et des 504. À 16:48 :
login 504 en 11,3 s puis 200 en 1,6 s. Conteneurs d'AUTRES travaux en tête de la consommation :
`supabase_analytics_elsatia-gp-contracts-snapshot-int-dbtest` 105 %, `supabase_realtime` de
`elsatia-capacity-r2-dbtest` 64 % et de `btp-platform` 62 %, `supabase_analytics` de
`elsatia-reserves-v4-dbtest` 59 % et `elsatia-capacity-r2-dbtest` 58 % ; charge 17 à 18,5. Ces
conteneurs ne sont pas arrêtés : ils appartiennent à d'autres sessions.

**Tentative 2** : porte dégradée mais réelle — UNE connexion sous 6 s et une requête
authentifiée sous 3 s —, sans toucher ni aux délais des tests, ni aux permissions.
Résultat (16:49 → 17:03) : **aucune mesure du nouveau circuit, pour des raisons d'infrastructure.**
Connexions de préparation perdues à ~27 s chacune (Android 4/8, iPhone 6/8) ; GoTrue `/token` sur
la période : 8 réponses 504 et 4 réponses 500 « Database error querying schema ». Android :
3 tests verts (aucune donnée d'une autre entreprise, aucune donnée opérationnelle par l'API, aucune
donnée métier en cache), 5 `page.goto` au-delà de 30 s, 1 réponse HTML au lieu de JSON (redirection
du proxy sous délai base), et le bloc « circuit comptable » non démarré faute de la session de
l'ouvrier A (`ENOENT`). iPhone : session de l'expert-comptable absente, aucun test mesuré.

**Preuves d'intégration en base — identité RÉELLE de l'expert-comptable, transactions ANNULÉES.**
La couche qui décide (RLS, fonctions `SECURITY DEFINER`, privilèges de table) ne dépend ni de
GoTrue ni du serveur : elle a été éprouvée directement, sous `role authenticated` avec le jeton de
l'expert-comptable, sur les données réelles du décor. Rien n'a persisté (vérifié après chaque
annulation).

| Opération | Attendu | Mesuré |
|---|---|---|
| Lire les notes de A / justificatifs de A / journal d'audit | permis | 25 / 18 / 36 lignes |
| Lire notes, justificatifs, factures de B | refusé | 0 / 0 / 0 (une note B existe) |
| Refuser SANS motif | rejeté | « Le motif du refus est obligatoire » |
| Demander une correction motivée | permis | `correction_demandee` |
| Refuser avec motif | permis | `refuse`, motif enregistré |
| Prendre en charge | permis | `en_verification` |
| Valider | permis | `valide`, `valide_par` = l'expert-comptable |
| Référence comptable | permis | `CPT-PREUVE-001` |
| Marquer exportée en comptabilité | permis | `exporte_comptabilite`, export `exporte` |
| Modifier la dépense (cette note / toutes celles de A) | refusé | 0 / 0 ligne |
| Supprimer une dépense | refusé | 0 ligne |
| Supprimer un justificatif / une version | refusé | `permission denied` (privilège de table) |
| Modifier un justificatif / une version | refusé | 0 / 0 ligne (RLS) |
| Supprimer un fichier du stockage | refusé | « Direct deletion from storage tables is not allowed » |
| Renommer (remplacer) un fichier du stockage | refusé | 0 ligne (RLS) |
| Lire la facture définitive de A | permis | 1 ligne, `envoyee` |
| Modifier la facture définitive (`notes_internes`, `notes_client`, `statut`) | refusé | 0 / 0 / 0 ligne |
| Supprimer la facture définitive | refusé | 0 ligne |
| Modifier les postes / les membres / les paramètres de l'entreprise | refusé | 0 / 0 / 0 ligne |
| S'accorder `gerer_utilisateurs` (table / fonction) | refusé | RLS `role_gestion_insert` / « Accès refusé » |

Note de méthode : deux décisions successives sur une même note, DANS une seule transaction,
heurtent `notifications_evenement_unique` (`now()` est figé par transaction) — artefact de la
preuve, sans effet en usage réel où chaque décision est sa propre transaction ; la preuve a été
découpée en conséquence.

**Défaut de test corrigé** : la recette E2E héritée « facture définitive » envoyait une colonne
inexistante (`notes`) ; PostgREST répondait 400, compté comme « 0 ligne » — le test passait pour
une mauvaise raison. Il vise désormais `notes_internes` et exige une réponse 200 vide.

## 9. Migration nécessaire — AUTORISATION DEMANDÉE

**Pourquoi elle est indispensable.** Le mandat exige un poste d'expert-comptable aux SEULS droits
listés. Or `creer_poste_avec_permissions` (migration `20260713000069`) et
`enregistrer_permissions_poste` (dernière définition `20260714000076`) ajoutent d'office six droits
personnels — dont `acces_planning` et `acces_pointage` — à tout poste qui n'est pas un compte
dépôt. Tout poste d'expert-comptable créé ou enregistré par un administrateur depuis l'écran
d'accès reçoit donc le planning et le pointage de l'entreprise. L'ajout se fait DANS la base :
aucun code applicatif ne peut l'empêcher. Et aucun modèle de rôle « expert-comptable » n'existe.

**Ce qu'elle fait** (`supabase/proposed/expert-comptable-poste-minimal.sql.proposed`) :

1. un marqueur `mode_expert_comptable` au catalogue, sur le modèle exact de `mode_compte_depot` ;
2. `droits_mandat_expert_comptable()` : liste blanche du mandat — `verifier_`, `comptabiliser_`,
   `exporter_`, `consulter_audit_notes_frais`, `acces_factures`, `acces_achats`,
   `acces_paiements_bancaires`, `acces_exports` ;
3. dans les DEUX fonctions, un poste marqué reçoit l'intersection du demandé et du mandat : aucun
   droit ajouté d'office, aucun `gerer_*` ; un poste déjà marqué le reste même si le formulaire
   omet le marqueur ;
4. un modèle `expert_comptable`, installable en un geste.

**Ce qu'elle ne change pas** : la RLS, les fonctions de contrôle et de comptabilisation, le
comportement de tout autre poste (le chemin non marqué est recopié à l'identique de la
migration 076), la tarification (poste à 0 € par défaut).

**Tests proposés** (`supabase/proposed/tests/expert-comptable-poste-minimal.test.sql.proposed`,
9 tests pgTAP) : liste blanche sans gestion ni saisie, ni planning, ni pointage ; modèle au mandat
exact ; création bornée (les droits hors mandat demandés sont refusés) ; enregistrement sans
marqueur conservant le marquage ; aucun des six droits personnels ajouté ; aucun autre poste
touché. À jouer dans une base clonée jetable.

**Aucun numéro réservé.** Le ledger compte 278 fichiers (dernier n° 280) ; le numéro sera attribué
à l'intégration, après audit du ledger.

**Décision demandée** : autoriser l'intégration de cette migration au ledger (numérotation,
recette pgTAP en base clonée, puis application selon la procédure du train). Sans elle, le
circuit comptable fonctionne — prouvé ci-dessus sur le poste de recette — mais un poste
d'expert-comptable composé depuis l'écran portera le planning et le pointage.

## 10. Confirmations

Aucune Production, aucun déploiement, aucun Stripe, aucune migration appliquée ni numérotée,
aucun numéro réservé, aucune fusion, aucun force-push, aucune permission assouplie pour faire
passer un test.
