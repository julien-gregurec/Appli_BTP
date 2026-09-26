# ELSATIA Réserves — Full Local Qualification V1

| | |
|---|---|
| Date | 2026-09-26 |
| Base | `integration/elsatia-canonical-train-v2` @ `819ebe56` (train canonique V2, 335 migrations) |
| Branche | `claude/modest-hopper-bygbnh` |
| Application | `apps/reserves` (Next 16.3.5, port 3020) |
| Moteur | PostgreSQL 16.13 réel + pgTAP 1.3.2, train complet rejoué depuis zéro (**336** migrations avec le correctif) |
| Navigateur | Chromium 1194 (Playwright), Réserves compilé (`next build` + `next start`) |
| Pile Supabase | Sans Docker : passerelle locale `tests/e2e/colors-pile-locale/passerelle.mjs` (Auth JWT HS256, REST/RPC sous `set local role` + `request.jwt.claims`, Storage sous RLS) au-dessus du vrai PostgreSQL |

## Verdict

**RESERVES LOCALLY QUALIFIED**

Toutes les dimensions demandées sont prouvées en local, sur base réelle et en navigateur réel. La
qualification a trouvé **cinq défauts réels** (dont une escalade de privilège et un défaut connu
laissé ouvert depuis la V6) ; tous sont corrigés par une migration additive unique
(`20260926000401_reserves_qualification_correctifs_v1.sql`), chacun prouvé **rouge sans le
correctif, vert avec**.

**Pourquoi pas `READY FOR PREVIEW`** : (1) l'intégration Gestion Pro n'existe qu'au niveau base —
aucun écran GP ni Réserves ne l'expose, et seul le nom du chantier est repris (§6) ; (2) une
décision propriétaire est ouverte sur le comportement quand l'organisation hôte est suspendue
(D-01) ; (3) la nouvelle migration doit être appliquée et vérifiée sur la Preview
(`ELSATIA_PREVIEW_DB_VERIFY_V1.sql` attend désormais 336 / `20260926000401`) ; (4) la pile locale
reste une passerelle : Storage réel (S3, transformations d'image), e-mail et GoTrue réel ne sont
pas couverts. Aucun de ces points n'est un défaut de sécurité ouvert.

**Pourquoi pas `BLOCKED`** : aucun défaut bloquant ne subsiste ; les écarts restants sont des
fonctionnalités d'intégration non livrées et une décision produit, tous en échec sûr.

---

## 1. Base et périmètre

- `git fetch --all --prune` ; train canonique V2 identifié : `integration/elsatia-canonical-train-v2`
  (dernier commit : rapport de convergence finale V2), qui contient `apps/reserves`.
- Branches Réserves antérieures comparées au train : `claude/reserves-turbopack-sentry-isolation-v1`
  et `claude/tools-reserves-postcss-isolation-v1` y sont intégrées (0 commit d'avance).
  `feat/reserves-v6-security-offline-pilot-gate-v1` et `fix/reserves-offline-resilience-train-v2`
  ont des commits d'avance par SHA, mais leur contenu est présent sous forme renumérotée/portée
  (constat déjà établi par `ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md` §#10 ; la migration V5
  vit sous `20260908000273`). Une seule chose de la V6 n'avait jamais été intégrée : le SQL
  « proposé, non intégré, bloqué par le train global » — traité ici (R-05).

## 2. Défauts trouvés et corrigés

| ID | Gravité | Constat (prouvé sur PostgreSQL réel) | Correctif (`…000401`) |
|---|---|---|---|
| **R-03** | **P1 sécurité** | Escalade de privilège : un simple **émetteur** (qui ne peut pas statuer) valide ou refuse une levée, et rouvre une réserve levée, en appelant `reserves_transition_differee` (file hors-ligne, exposée à `authenticated`) — `issue = appliquee`, statut `levee`. `reserves_statuer_levee`/`reserves_rouvrir` vérifient `valider_levee`, pas ce chemin. | Trigger central `reserves_garde_decision_levee` : toute décision de levée ou réouverture exige `valider_levee`, **quel que soit le chemin RPC**. |
| **R-01** | P1 intégrité | Un émetteur désactive `photo_obligatoire_levee` par `PATCH` direct, **sans trace** ; une réserve **levée** voit titre, description, échéance, priorité réécrits après validation, **sans trace**. Le dossier de réception était altérable a posteriori. | Toute modification de titre/description/priorité/échéance/exigence photo est historisée (champ, avant, après, auteur) ; contenu **figé** sur réserve levée/annulée ; exigence photo **figée** pendant une demande de levée. |
| **R-02** | P1 intégrité | L'historique n'était « immuable » que par absence de GRANT à `authenticated` : `service_role` (tous droits sur `public` en hébergé) et le propriétaire pouvaient `UPDATE`/`DELETE`/`TRUNCATE`. | Triggers append-only pour **tous** les rôles ; `DELETE` admis seulement en cascade du dossier parent ou pour la purge RGPD d'une organisation à suppression échue (même condition que `purger_table_entreprise`). |
| **R-05** | P1 intégrité (défaut connu V6) | L'hôte change par `PATCH` direct l'organisation rattachée à un intervenant : rattachement d'un tiers sans consentement, dessaisissement de l'entreprise précédente sans révocation tracée. Documenté en `test.fixme` + `docs/reserves/ELSATIA_RESERVES_V6_SQL_PROPOSE_NON_INTEGRE.sql` §1, jamais intégré. | Trigger `reserves_garde_rattachement` : colonnes de rattachement modifiables uniquement par les fonctions du domaine (`security definer`, qui tracent) ; refus sous `authenticated`/`anon`. Aucune des 5 fonctions n'est réécrite. Le `fixme` devient un test actif. |
| **R-04** | P2 inter-apps | **Supprimer un chantier Gestion Pro importé dans Réserves échouait** (y compris en propriétaire) : `on delete set null` viole la contrainte `source ↔ chantier_gp_id`. Réserves bloquait GP. | Trigger `reserves_detacher_chantier_gp` : le chantier Réserves est détaché (`source = 'reserves'`), ses réserves, plans et historique intacts. |

Preuve avant/après (suite `reserves_full_local_qualification_v1.test.sql`) : sur une base au train
V2 **sans** le correctif → **15 échecs, tous sur les assertions R-01 à R-04** ; avec → **181/181**
(R-05 ajouté ensuite, 4 assertions supplémentaires).

Effets de bord traités : `supabase/tests/reserves_v1_foundation_workflow.test.sql` (test 72 figeait
la modification silencieuse de description — attente alignée, commentée) ;
`scripts/e2e/reset-reserves-recipe.sql` (vidait l'historique en direct : il disparaît désormais en
cascade avec les réserves) ; `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` (336 /
`20260926000401`).

## 3. Résultats par dimension

Légende : **P** = pgTAP (`reserves_full_local_qualification_v1.test.sql`, numéros d'assertion) ;
**E** = e2e navigateur/API réel ; **PDF** = document généré et relu.

### 3.1 Fonctionnel — PROVEN

| Exigence | Preuve |
|---|---|
| Création réserve (numérotation par chantier, statut `emise`/`assignee`) | P 1.01–1.03 ; E V3, V4 |
| Photo (dépôt réel dans le bucket, confirmation, galerie) | P 1.07, 2.08 ; E V5 (photo hors-ligne déposée sans doublon), V6 (objet déjà déposé acquitté) |
| Commentaire (hôte ↔ intervenant, vide refusé) | P 1.08–1.11 ; PDF (commentaire imprimé avec date, auteur, organisation) |
| Localisation plan (plan, page, x/y normalisés, bornes) | P 1.04–1.06 ; E V3 (repère **page 2** d'un PDF multipage, visible dans le document) |
| Assignation entreprise | P 1.22 ; E V3 |
| Acceptation | P 1.12–1.13 ; E V3 (bouton « J'accepte ») |
| Refus + motif / preuve | P 1.14–1.18 (motif obligatoire, photo `preuve_refus`, motif à l'historique) |
| Réassignation | P 1.19–1.24 (avant/après tracé, C perd, D gagne la réserve) |
| Demande de levée | P 1.26–1.27 ; E V3 |
| Validation | P 1.32–1.33 ; E V3 (« Valider la levée ») |
| Refus de levée (motif obligatoire) puis nouvelle demande | P 1.28–1.31 |
| Avant / après | P 1.34 (`constat` hôte / `travaux` intervenant distingués) ; PDF (photos de constat et de levée) |
| Historique | P 1.35–1.36 (séquence exacte, auteur sur chaque ligne) ; E V3 (`reserves_export_historique`) |

### 3.2 Photo obligatoire PAR réserve — PROVEN (et durcie, R-01)

- Aucune colonne d'exigence photo au niveau chantier, organisation ou préférences (P 2.01).
- Deux réserves du même chantier : R2 sans exigence → levée sans photo acceptée (P 2.02) ; R6 avec
  exigence → refusée sans photo (2.04), refusée avec photo de **constat** (2.05), d'**échange**
  (2.06), avec un emplacement **réservé sans fichier** (2.07), avec une photo **retirée** (2.10) ;
  acceptée avec une vraie photo de levée (2.11).
- Non contournable par la file hors-ligne (E V6 « la photo obligatoire ne se contourne pas »).
- R-01 : exigence figée pendant une demande de levée (2.12), changement historisé (2.14),
  intervenant sans droit de la modifier (2.15).

### 3.3 Intervenant gratuit — PROVEN

- Accès né de l'invitation (`source = reserves_invitation_gratuite`), rôle `reserves_intervenant`
  (P 3.01–3.02).
- Voit **uniquement ses réserves** : pas celles de D, ni celles transférées, ni la ligne
  d'intervenant de D, ni ses échanges ; tableau de bord, export et plans limités (P 3.03–3.07,
  3.22, 1.23) ; E V3/V4 (document restreint sans aucune réserve d'un autre corps d'état).
- Commente, accepte/refuse, demande la levée (P 1.10–1.15, 1.25–1.31).
- **Aucune fonction payante**, même pour un gérant détenant toutes les permissions GP de son tenant
  (pire cas) : 0 action Réserves sur son propre tenant, pas de chantier, pas de plan, pas
  d'administration des membres, pas d'invitation, pas d'auto-promotion (RPC ni écriture
  d'habilitation), accès gratuit non convertible, aucune autre application ouverte (P 3.08–3.21).
- Ne valide jamais sa propre levée, ni par `statuer_levee` ni par la file hors-ligne (P 3.10, 3.12 ;
  E V6).

### 3.4 Cross-tenant A / B — PROVEN

- B (sans lien) : 0 ligne de A sur les 9 tables Réserves et Storage ; `PATCH` sans effet ; 10 RPC
  d'écriture refusées ; 6 exports vides ; tableau de bord vide ; création chez A refusée ; B ne peut
  ni attribuer sa réserve à l'intervenant de A ni la pointer sur un plan de A (P 4.01–4.25).
- A ne voit rien de B ; l'intervenant de A ne voit rien de B ; C ne peut ni commenter, ni demander
  la levée, ni accepter à la place de D (P 4.26–4.30).
- R-05 : pas de rattachement de tiers ni de révocation hors geste métier (P 4.31–4.34 ; E V6).
- Navigateur : E V6 sécurité — « A ne voit rien de B, quel qu'en soit le chemin d'accès »
  (identifiants de B connus de l'attaquant, marqueur unique), PDF de A demandé par B → **404**.

### 3.5 Intégration Gestion Pro — PARTIELLE (base prouvée, UI absente)

| Point | Résultat |
|---|---|
| Chantier (lien, nom, horodatage) | ✅ import GP → Réserves, idempotent (P 5.01–5.02) |
| Métadonnées chantier | ⚠️ **seul le nom** est repris ; adresse, ville, dates, client ne le sont pas (P 5.03) — conforme au contrat `docs/reserves/ELSATIA_RESERVES_GP_INTEGRATION_CONTRACT_V1.md` (« ⛔ à faire ») |
| Plans | ⛔ non livrés (contrat : décision de stockage partagé non tranchée) |
| Entreprises / contacts | ⛔ non livrés (contrat) |
| Double habilitation | ✅ émetteur, consultation, B, utilisateur GP sans rôle Réserves : refusés (P 5.04–5.06, 5.11) |
| Résumé Réserves → GP | ✅ compteurs exacts (total, ouvertes, demandes, levées, en retard) ; vide pour B et pour un utilisateur GP sans rôle Réserves (P 5.07–5.10) |
| Lien de statut | ✅ au niveau données (`chantier_reserves_id`) ; ⛔ **aucun écran GP n'appelle `reserves_resume_chantier_gp`**, et Réserves n'expose pas l'import (aucun appel applicatif, vérifié par recherche dans `src/` et `apps/reserves/src/`) |
| Sens de synchronisation | ✅ GP → Réserves : **à la demande, sens unique** (un renommage GP n'est pas propagé sans réimport, P 5.12–5.13) ; Réserves → GP : lecture seule agrégée |
| Suppression d'un chantier GP lié | ✅ après R-04 (P 5.14–5.16) ; ❌ avant |

### 3.6 Storage — PROVEN

- Buckets privés, aucune URL publique (P 6.01) ; chemin composé par la base
  `organisation/chantier/réserve/uuid.ext`, jamais par le client (P 6.02).
- Propriété : la photo de l'intervenant lui est attribuée (P 6.03) ; seule l'organisation qui a
  déposé peut retirer, et seulement avant décision (P 2.09, 6.11).
- Chemin sous la réserve d'un autre, chemin forgé, chemin arbitraire : refusés (P 6.04–6.06).
- Photos immuables pour tous, admin hôte compris (policies restrictives 00279) : 0 suppression,
  0 réécriture (P 6.08–6.10).
- URL signées : émises seulement si l'objet est visible sous RLS par l'appelant — C ne signe pas
  un plan qui ne porte aucune de ses réserves, B ne signe aucun objet de A (P 6.12–6.13) ;
  passerelle : `/object/sign` et `createSignedUrls` n'émettent un jeton qu'après `select` sous le
  rôle de l'appelant.
- Avant / après : P 1.34, 6.07 ; PDF (images de constat et de levée).
- Cross-tenant, révocation, suspension : 0 photo (P 4.09, 8.05, 8.13, 8.22).

### 3.7 Historique non falsifiable — PROVEN (après R-01, R-02)

- `authenticated` : insertion, réécriture, effacement refusés ; statut non réécrivable hors action
  métier (P 7.01–7.04).
- Contenu d'une réserve levée non réécrivable ; toute modification de contenu tracée avec
  avant/après/auteur (P 7.05–7.08).
- Propriétaire / clé serveur : `UPDATE`, `DELETE` ligne à ligne, `TRUNCATE` refusés (P 7.09–7.11) ;
  la suppression d'un dossier entier (cascade) et la purge RGPD échue restent possibles
  (P 7.12–7.13) ; historique intact (P 7.14).
- Suite pgTAP maximale : les suites purge RGPD ont **exactement** le même résultat avant/après le
  correctif (§4.2).

### 3.8 Auth / suspension — PROVEN

Tous les cas utilisent un **jeton déjà émis** (session ouverte) : la décision est reprise à chaque
requête par les prédicats de la base.

| Cas | Résultat |
|---|---|
| Rôle rétrogradé (responsable → consultation) | validation refusée aussitôt, lecture conservée (P 8.02–8.03) |
| Habilitation révoquée / échue | 0 réserve, 0 photo (P 8.04–8.06) |
| Membre désactivé puis réactivé | 0 puis accès rétabli sans reconnexion (P 8.07–8.08) |
| Entitlement applicatif retiré / échu | 0 lecture, écriture refusée (P 8.09–8.11) |
| Tenant suspendu (`abonnement_statut`) / suspension programmée échue | 0 réserve, 0 photo, écriture refusée ; auto-levée de suspension refusée (P 8.12–8.16) |
| Session révoquée (`sessions_revoquees`) | jeton encore valide mais 0 réserve ; autre session intacte (P 8.17–8.18) |
| Tenant intervenant suspendu | 0 réserve (P 8.19) |
| Intervention révoquée | 0 réserve, 0 photo, écriture refusée, accès gratuit retiré (P 8.20–8.24 ; E V3) |
| Changement d'identité sur le même appareil | la file de A ne part jamais sous B ; aucune donnée de l'organisation précédente après déconnexion (E V5, V6) |

**D-01 (décision propriétaire, non bloquante).** Quand l'organisation **hôte** est suspendue, ses
propres utilisateurs perdent tout accès, mais une entreprise intervenante **active** continue de
voir les réserves qui lui sont attribuées et peut y agir (commenter, demander une levée) — constaté
par sonde. `reserves_intervenant_courant` ne regarde pas l'état du tenant hôte. C'est défendable
(le sous-traitant n'est pas responsable de l'impayé de son donneur d'ordre) mais doit être tranché :
gel en lecture seule, ou maintien. Aucun correctif appliqué.

### 3.9 PDF — PROVEN

Génération **réelle** par la route `/api/documents/chantier/[id]/pdf` (puppeteer + Chromium local
via `PDF_CHROMIUM_EXECUTABLE_PATH`), relue avec `pdfjs-dist` :

| Document | Résultat |
|---|---|
| Détaillé, entreprise « Étanchéité B » | 200, 2 pages, 4 images (repérage plan + photos), 0 mention de l'autre corps d'état ; statuts (Assignée, Levée, Levée refusée, Responsabilité refusée), priorités, échéances, dates de constat/attribution/acceptation/demande/levée, repère « page 1 (0.613 ; 0.320) », motifs de décision et **commentaires** (date, auteur, organisation) |
| Synthèse chantier | 200, tableau par entreprise (réserves, ouvertes, levées) + une ligne par réserve (n°, zone, entreprise, statut, priorité, constat, échéance) |
| PDF d'un chantier de A demandé par B | **404** |
| Document imprimable de 2 000 réserves | 6,8 s (E V6 performance) |

Témoins : `docs/qualification/witnesses/reserves-full-local-v1/pdf-detaille-entreprise-B.pdf`,
`pdf-synthese-chantier.pdf` (données de recette fictives).

## 4. Gates

### 4.1 Application Réserves

| Gate | Résultat |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ 0 erreur |
| `npm test` (vitest) | ✅ **178/178** (13 fichiers) |
| `npm run build` (prebuild : garde des variables publiques + manifeste d'environnement) | ✅ |
| `verify:migrations` | ✅ 336 |
| `verify:secrets` / `verify:env-manifest` | ✅ / ✅ (14 DECISION_REQUIRED préexistantes, non bloquantes) |

### 4.2 pgTAP (PostgreSQL 16.13 réel)

| Passe | Résultat |
|---|---|
| Suites Réserves (7 fichiers) | ✅ **594/594** (413 existantes + 181 nouvelles) |
| Nouvelle suite sur base **sans** correctif | 15 échecs, exclusivement R-01 à R-04 |
| Suite maximale, base fresh 336 migrations | 127 fichiers, 3 009 assertions ; les **11 fichiers non verts sont exactement les 11 hérités du train V2** (`platform_stripe_state_attestation_r72` 14 — stub pgsodium ; `purge_entreprise_architecture_v2` 8 et `purge_entreprise_supprimee` 1 — conflit purge ↔ facture émise ; 7 suites `studio_*` historiques — fixtures ; `elsatia_tools_cloud_sync_entitlement_closure_v1` — privilèges par défaut), mêmes nombres d'échecs avant et après le correctif |

### 4.3 Playwright (Réserves compilé + passerelle + Chromium)

__E2E_TABLE__

**Cas non exécutable dans ce harnais (pas un défaut produit)** : V5 « un rechargement hors ligne
ne perd ni le cache ni la file ». La coquille est servie en *network-first* par le service worker ;
dans Chromium 1194, l'émulation `context.setOffline()` de Playwright ne s'applique pas aux `fetch`
émis par le service worker lors d'un `reload`, qui obtient donc la vraie page du serveur (capture :
bandeau « Hors ligne — 1 action non transmise » affiché sur la page en ligne). Les 13 autres tests
V5 — dont la coquille ouverte **sans réseau**, la file persistante, le rejeu sans doublon, la
reprise après interruption et la non-écrasement d'une levée validée ailleurs — passent. À rejouer
sur la pile Docker / un appareil réel.

**Corrections de recette (tests, pas produit)** : V3 cliquait le **premier** bouton « Révoquer
l'accès » ; l'ordre de la liste suit la collation de la base (C.UTF-8 ici, en_US sous Docker) et
révoquait « Menuiserie C » au lieu de B — le test cible désormais la fiche de B. Les specs se
jouent dans l'ordre V3 → V4 → V4 mobile → V5 → V6 (V3 révoque B, V4 mobile le réactive).

## 5. Harnais ajouté / étendu

- `tests/e2e/reserves-pile-locale/preparer-base.sh` : miroir sans Docker de
  `scripts/e2e/recette-reserves-v4.sh` (mêmes fichiers SQL, même ordre, `psql` local).
- `tests/e2e/colors-pile-locale/passerelle.mjs`, extensions **additives** (rien de ce que Colors
  utilise n'est modifié) : `PATCH` REST filtré sous RLS ; indice de clé étrangère dans les
  ressources embarquées (`entreprises!fk(...)`) ; signature groupée `createSignedUrls` (contrôle
  objet par objet sous RLS) ; décodage multipart des téléversements `File` ; pagination
  `.range()` des RPC ensemblistes ; scalaire texte/uuid encodé en JSON ; clé de projet acceptée
  en `Bearer` sans en-tête `apikey`.

## 6. Écarts ouverts (non bloquants)

| ID | Nature | Détail |
|---|---|---|
| G-01 | Produit (intégration GP) | Aucun écran n'expose l'import GP ni le résumé Réserves sur la fiche chantier GP ; seul le nom est repris ; plans, entreprises, contacts non livrés (contrat V1) |
| D-01 | Décision propriétaire | Intervenant actif d'un hôte suspendu : maintien ou gel (§3.8) |
| R-06 | P3 | `auteur_entreprise_id` est nul sur les transitions faites par l'intervenant (acceptation, refus, demande de levée) : l'auteur (`auteur_id`) est tracé, l'organisation se déduit de son appartenance ; le PDF l'affiche correctement pour les messages |
| R-07 | P3 | `reserves_enregistrer_pagination` : tout lecteur d'un plan (intervenant compris) peut réécrire `nb_pages` (1..500), ce qui peut faire refuser la création d'un repère sur une page réelle |
| R-08 | P3 (V6 §3, non intégré) | `reserves_annuaire_rechercher` n'échappe pas `%`/`_` : « %%% » contourne la borne de 3 caractères (limité aux organisations publiées, 20 résultats) |
| R-09 | Exploitation (V6 §4) | `reserves_mutations_appliquees` sans purge |
| P-01 | Performance | Lecture d'une réserve ≈ 1 ms/ligne de prédicats RLS (2 000 réserves : ~2 s par export) ; acceptable, à surveiller au-delà |
| H-01 | Harnais | Storage réel (S3, transformations), e-mail, GoTrue réel non couverts localement |

## 7. Reproduire

```bash
git checkout claude/modest-hopper-bygbnh && npm ci && npm --prefix apps/reserves ci
npm --prefix tests/e2e/colors-pile-locale ci
pg_ctlcluster 16 main start
apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl

# pgTAP
scripts/local-postgres-bootstrap/rebuild_db.sh qualif
su postgres -c "psql -d qualif -c 'create extension pgtap' -c 'alter database qualif set search_path = public, extensions'"
cd supabase/tests && su postgres -c "pg_prove -d qualif reserves_*.test.sql"   # 594/594

# Gates app
cd apps/reserves && npm run typecheck && npm run lint && npm test
ELSATIA_APPLICATION_ENV=local NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<jwt anon signé> NEXT_PUBLIC_RESERVES_URL=http://localhost:3020 npm run build

# E2E (variables : PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY — JWT HS256 signés par le secret —,
#  PASSERELLE_DATABASE_URL / PASSERELLE_ADMIN_DATABASE_URL (authenticator / supabase_admin sur reserves_e2e),
#  E2E_SUPABASE_URL=http://127.0.0.1:54321, E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY,
#  E2E_RESERVES_URL=http://localhost:3020, PDF_CHROMIUM_EXECUTABLE_PATH, PW_CHROME_PATH)
tests/e2e/reserves-pile-locale/preparer-base.sh reserves_e2e
su postgres -c "psql -d reserves_e2e" < scripts/e2e/prepare-reserves-v6-charge.sql
node tests/e2e/colors-pile-locale/passerelle.mjs &
node scripts/e2e/amorcer-recette-v4.mjs
npm --prefix apps/reserves run start &
for s in v3-collaboration v4-listes-pdf v4-offline-mobile v5-offline v6-securite v6-performance; do
  npx playwright test tests/e2e/reserves-$s.spec.ts --project=desktop-chromium --workers=1
done
```
