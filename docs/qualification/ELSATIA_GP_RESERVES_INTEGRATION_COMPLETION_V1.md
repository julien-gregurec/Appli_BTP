# ELSATIA — Intégration Gestion Pro ↔ Réserves : complétion V1

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `claude/modest-hopper-bygbnh` @ `bf22fe9e` = `integration/elsatia-canonical-train-v2` @ `819ebe56` + qualification Réserves (RESERVES LOCALLY QUALIFIED). `integration/elsatia-canonical-train-v3` **n'existe pas** sur le dépôt : le train V2 a été retenu, avec la qualification Réserves la plus récente. |
| Branche | `claude/inspiring-maxwell-rtr9zu` |
| Migration | `20260927000402_reserves_gp_integration_completion_v1.sql` (additive) — train à **337** migrations |
| Moteur | PostgreSQL 16.13 réel + pgTAP, train complet rejoué depuis zéro |
| Navigateur | Chromium 1194 (Playwright 1.62), **Gestion Pro et Réserves compilés** (`next build` + `next start`, ports 3100 / 3020) |
| Pile Supabase | Sans Docker : passerelle locale `tests/e2e/colors-pile-locale/passerelle.mjs` (Auth JWT HS256, REST/RPC sous `set local role`, Storage sous RLS) au-dessus du vrai PostgreSQL |

## Verdict

**GP RESERVES INTEGRATION LOCALLY QUALIFIED**

Le flux applicatif réel entre les deux applications existe désormais de bout en bout et il est
prouvé en local, sur base réelle et en navigateur réel, avec les deux applications compilées :
GP → fiche chantier → « Utiliser dans ELSATIA Réserves » → chantier, entreprises, contacts et
plans dans Réserves → création d'une réserve → assignation → acceptation et demande de levée par
l'entreprise invitée → levée validée → retour sur la fiche GP, résumé mis à jour à chaque étape.

**Pourquoi pas `BLOCKED`** : aucune exigence du cahier n'est non tenue ; aucun défaut de sécurité
ouvert ; aucune régression (pgTAP maximal identique au train V2, Réserves e2e 59/59, gates vertes).

**Réserves de périmètre (non bloquantes, §9)** : Gestion Pro ne porte **aucune structure
bâtiment / zone** — il n'y a donc rien à transmettre (le champ reste saisi dans Réserves) ; la
pile locale reste une passerelle (Storage S3 réel, GoTrue réel non couverts) ; la migration
`…000402` doit être appliquée puis vérifiée sur la Preview (`ELSATIA_PREVIEW_DB_VERIFY_V1.sql`
attend désormais 337 / `20260927000402`).

---

## 1. Contrat officiel tenu

Réserves reste **autonome** : aucune contrainte, policy ni fonction Réserves n'exige une donnée GP ;
les liens vers GP sont des identifiants simples (aucune nouvelle clé étrangère vers GP).

| GP transmet | Où dans Réserves | Condition (moindre privilège) |
|---|---|---|
| chantier : nom, référence, adresse, CP, ville, client, description, dates | `reserves_chantiers` | chantier consultable dans GP (`peut_consulter_chantier`) |
| entreprises participantes (sous-traitants affectés, non annulés) | `reserves_intervenants` (`invitee`, **sans** organisation rattachée) | `acces_sous_traitants` + Réserves `gerer_intervenants` |
| contacts (fiche client, contacts client, contact de chaque entreprise) | `reserves_contacts` (nouvelle table, **sans lien vers un compte**) | `acces_clients` pour le client ; Réserves `gerer_intervenants` |
| plans (documents GP « plan » PDF/JPEG/PNG/WebP) | `reserves_plans` + copie du fichier dans `reserves-plans` | document visible de l'appelant (`peut_voir_document_chantier`, audience) + Réserves `gerer_plans` |
| bâtiments / zones | — | **non disponibles dans GP** (aucune table) |
| liens | `chantier_gp_id`, `document_gp_id`, `fournisseur_gp_id`, `cle_gp` | posés par la base seulement |

| Réserves renvoie (`reserves_etat_chantier_gp`) | Définition |
|---|---|
| total | réserves non annulées |
| ouvertes | `emise` (constatées, à attribuer) |
| en cours (assignées) | `assignee`, `acceptee`, `refusee_responsabilite`, `levee_refusee` |
| attente levée | `levee_demandee` |
| levées | `levee` |
| + en retard, annulées, **statuts détaillés**, lien (`chantier_reserves_id`), date de mise à jour, plans ayant une version GP non appliquée, droit de synchroniser | — |

L'état ne renvoie jamais ni titres, ni entreprises, ni motifs (P 9.03, E étape 10). Il renvoie
`NULL` — pas de bloc — sans entitlement Réserves, sans rôle Réserves, ou si le chantier n'est pas
consultable dans GP.

## 2. Livraison

### Base (`20260927000402`, additive)

- `reserves_synchroniser_chantier_gp(chantier_gp)` → rapport : crée **ou rattache** (homonyme
  Réserves libre, insensible à la casse) le chantier ; homonyme déjà lié à un autre chantier GP →
  création distincte suffixée de la référence ; transmet champs, entreprises, contacts ; prépare
  les copies de plan (chemin composé par la base). Double habilitation sur l'entreprise **du
  chantier**, jamais celle de l'appelant. Verrou transactionnel par chantier GP.
- `reserves_confirmer_plan_gp(plan, chemin)` : active une copie **déposée** et **préparée par la
  synchronisation** ; idempotente.
- `reserves_etat_chantier_gp(chantier_gp)` : état affichable (ci-dessus).
- `reserves_contacts` (RLS : lecture par l'organisation hôte seule, écriture `gerer_intervenants` ;
  cohérence de tenant par trigger).
- Gardes d'écriture directe : `source`, liens GP, empreintes, versions et signalements ne sont
  **jamais** modifiables par PATCH sous `authenticated`/`anon` (même principe que R-05).
- `reserves_importer_chantier_gp` et `reserves_resume_chantier_gp` (00268) **inchangées**.

### Gestion Pro

- Bloc **« ELSATIA Réserves »** sur la fiche chantier (`src/components/BlocReservesChantier.tsx`) :
  non suivi → « Utiliser dans ELSATIA Réserves » ; suivi → Total / Ouvertes / En cours / Attente
  levée / Levées, retard, « Ouvrir dans Réserves », « Mettre à jour depuis Gestion Pro ».
- Action POST `/chantiers/[id]/reserves` (`src/app/(app)/chantiers/[id]/reserves/route.ts`) :
  même origine exigée, redirection relative, message sans jargon.
- `src/lib/reserves-gp.ts` : copie des plans **sous la session de l'utilisateur** (lecture
  `chantier-documents`, dépôt `reserves-plans` sans écrasement, confirmation) — aucune clé serveur.
- URL de Réserves issue du **catalogue** (`applications_elsatia`), jamais en dur.

### Réserves

- Fiche chantier : mention « Repris de Gestion Pro », **annuaire des contacts** (vide pour une
  entreprise invitée, par RLS).
- Plans : « Gestion Pro · version N », « Transmission depuis Gestion Pro en attente », et
  « Version plus récente dans Gestion Pro — non appliquée : ce plan est déjà utilisé ici ».

## 3. Idempotence (§4 du cahier)

| Preuve | Résultat |
|---|---|
| pgTAP 2.01–2.12 : **10 synchronisations** consécutives | 1 chantier, 2 entreprises, 5 contacts, 2 plans, 2 fichiers ; rapport « inchangés » ; aucune habilitation écrite ; l'import historique retombe sur le même chantier |
| E2E étape 2 : **10 clics** « Mettre à jour depuis Gestion Pro » | 1 chantier, 2 entreprises, 4 contacts, 2 plans (version 1) lus par l'API sous l'utilisateur |
| Copie interrompue (P 1.12–1.17, Vitest `copierPlans`) | même cible redemandée ; objet déjà déposé → confirmé, pas redéposé ; confirmation rejouée sans nouvelle version |

## 4. Plans : ownership et version (§5 du cahier)

- **Ownership** : GP possède le document source ; Réserves possède sa **copie** (fichier, nom,
  repères). Supprimer ou modifier le document dans GP ne touche jamais la copie (P 7.03–7.04).
- **Version** : `gp_version` (1, 2, …) + empreinte de la version GP copiée.
- Nouvelle version GP d'un plan **intact et sans réserve** → copiée, puis activée seulement après
  dépôt confirmé ; l'ancien fichier reste actif jusque-là (P 3.08–3.11).
- Nouvelle version GP d'un plan **portant une réserve** ou **modifié dans Réserves** → **jamais
  remplacé**, signalé (`gp_maj_disponible`) dans GP et dans Réserves (P 3.07, 3.13–3.15 ; E étape 11 :
  version 1 et fichier inchangés, message « 1 plan a une nouvelle version dans Gestion Pro… »).
- La confirmation re-vérifie ces conditions au moment du dépôt (un repère posé entre-temps
  annule le remplacement).

## 5. Champs : propriété

GP gagne un champ tant que Réserves ne l'a pas modifié depuis la dernière transmission ; sinon la
valeur Réserves est **conservée et signalée** (« Modifié dans Réserves, conservé : adresse »).
Prouvé pour chantier (P 3.01–3.02), entreprise (3.03), contact (3.04), et renommage GP en collision
(3.23). Au rattachement d'un chantier existant, les valeurs Réserves sont conservées et seuls les
champs vides sont complétés (4.02).

## 6. Entreprises / contacts : tenant et accès (§6, §10)

- **Un contact n'est jamais un accès** : l'e-mail d'un contact GP est celui d'un compte ELSATIA
  existant (gérant de C) → aucune habilitation, aucun accès applicatif, aucune donnée visible
  (P 5.01–5.05 ; E étape 7). L'accès de C naît seulement de l'invitation explicite, puis de son
  rattachement volontaire (E étapes 7–8).
- Les entreprises reprises restent `invitee`, sans organisation rattachée.
- Cross-tenant A / B : B ne synchronise ni ne lit l'état d'un chantier de A ; tout ce que B
  synchronise porte B ; B ne voit aucune entreprise, contact, plan ni fichier de A ; B ne confirme
  pas un plan de A, ne modifie aucun contact de A, ne rattache pas un contact à un chantier de A ;
  A ne voit rien de B ; aucune origine GP de B chez A (P 8.01–8.12 ; E test « autre tenant » : fiche
  de A en **404** pour B, synchronisation refusée, contacts/entreprises de B seulement).

## 7. Permissions (§8)

| Profil | Bloc GP | Synchroniser | Preuves |
|---|---|---|---|
| Sans entitlement Réserves (organisation) | absent | refusé | P 6.01–6.02 |
| Manager (gérant, admin Réserves) | oui | oui | P 6.03 ; E parcours |
| Dirigeant GP **sans rôle Réserves** (toutes permissions GP) | absent | refusé | P 6.04–6.05 ; E test 1 |
| Conducteur (responsable Réserves, sans `acces_sous_traitants`) | oui | oui, **sans** les entreprises | P 6.06–6.07 |
| Chef de chantier affecté (responsable Réserves, sans `gerer_chantiers`) | oui sur son chantier, absent ailleurs | oui sur son chantier ; plan « direction » non transmis | P 6.08–6.12 ; E test 4 |
| Simple salarié affecté (émetteur Réserves) | compteurs, sans bouton | refusé ; lit l'annuaire, ne le modifie pas | P 6.13–6.17 ; E test 2 |
| Invité externe (entreprise C rattachée) | absent | refusé ; n'accède pas à l'annuaire ; ne voit que sa fiche | P 6.19–6.22 |

**Défaut trouvé et corrigé en recette** : la garde du proxy GP exige `gerer_chantiers` pour toute
mutation sous `/chantiers/*`, et le « mode consultation » masque par CSS les formulaires : un chef
de chantier **responsable des réserves** ne pouvait donc pas utiliser l'action (bouton masqué,
puis requête refusée). L'action n'écrivant rien dans GP, elle a été sortie vers la sous-ressource
`/chantiers/[id]/reserves` (garde proxy = accès au chantier ; décision réelle en base) et son
formulaire est exempté du masquage (`data-application-tierce`). Prouvé rouge puis vert (E test 4).

## 8. Suppression / archivage GP (§9, contrat R-04)

Chantier GP archivé : bloc lisible, synchronisation possible (P 7.01–7.02). Document et affectation
supprimés dans GP : rien n'est retiré de Réserves (7.03–7.04). **Chantier GP entièrement
synchronisé (plan copié, entreprise, contacts, réserve) supprimé par un gestionnaire GP sous sa
session** : suppression acceptée, chantier Réserves **détaché** (R-04), réserves, plan, entreprise
et 4 contacts intacts, plus aucun état GP (7.05–7.07).

## 9. Tests et gates

| Gate | Résultat |
|---|---|
| pgTAP `reserves_gp_integration_completion_v1.test.sql` | ✅ **106/106** |
| pgTAP suites Réserves (8 fichiers) | ✅ **700/700** (594 existantes inchangées + 106) |
| pgTAP maximal, base fraîche 337 migrations | 128 fichiers, 3 119 assertions ; les **11 fichiers non verts sont exactement les 11 hérités du train V2** (`platform_stripe_state_attestation_r72` 14, `purge_entreprise_architecture_v2` 8, `purge_entreprise_supprimee` 1, 7 × `studio_*`, `elsatia_tools_cloud_sync_entitlement_closure_v1`), mêmes nombres d'échecs |
| Vitest GP | ✅ 1 872 (dont `src/lib/reserves-gp.test.ts` 18) ; Tools 1 992 ; Réserves 178 ; Colors 431 |
| `npm run typecheck` (GP, Tools, Réserves, Colors) | ✅ |
| `npm run lint` | ✅ |
| `next build` Gestion Pro / Réserves | ✅ / ✅ |
| `verify:migrations` / `verify:secrets` / `verify:env-manifest` | ✅ 337 / ✅ / ✅ (14 DECISION_REQUIRED préexistantes) |
| **Playwright cross-app** `gp-reserves-integration.spec.ts` | ✅ **5/5**, deux passes propres consécutives |
| Non-régression Réserves e2e (V3, V4, V4 mobile, V5, V6 sécurité, V6 perf.) | ✅ **59/59** (+1 cas V5 non exécutable dans ce harnais, déjà documenté par `ELSATIA_RESERVES_FULL_LOCAL_QUALIFICATION_V1.md` §4.3) |
| `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` sur la base de recette | aucun contrôle bloquant en échec |

**Scénario complet** (E `parcours complet`) : GP (manager) → fiche chantier → « Utiliser dans
ELSATIA Réserves » (2 entreprises, 4 contacts, 2 plans transmis) → 10 mises à jour sans doublon →
« Ouvrir dans Réserves » (URL du catalogue) → Réserves : « Repris de Gestion Pro », contacts, plans
version 1 servis par le bucket Réserves → **création** d'une réserve à l'écran, **attribuée** à une
entreprise reprise → GP : `2 / 1 / 1 / 0 / 0` → invitation explicite de C, rattachement,
**acceptation** et **demande de levée** à l'écran de C → GP : `2 / 1 / 0 / 1 / 0` → **levée
validée** par l'hôte → GP : `2 / 1 / 0 / 0 / 1` → nouvelle version GP d'un plan utilisé : non
appliquée, signalée des deux côtés.

Harnais ajouté : `tests/e2e/gp-reserves-pile-locale/preparer-base.sh`,
`scripts/e2e/prepare-gp-reserves-integration.sql` ; passerelle étendue (additif) :
téléchargement authentifié d'un objet **sous RLS** (`GET /storage/v1/object/[authenticated/]…`).

## 10. Écarts ouverts (non bloquants)

| ID | Nature | Détail |
|---|---|---|
| G-02 | Périmètre GP | Aucune structure bâtiment / zone dans GP : `niveau` / `zone` des plans repris restent à saisir dans Réserves |
| G-03 | Produit | Sens GP → Réserves **à la demande** (bouton), pas en temps réel ; un sous-traitant ou un document retiré de GP n'est pas retiré de Réserves (choix : Réserves possède ses copies) |
| G-04 | Produit | Le nom d'un plan appartient à Réserves après la première copie (un renommage du document GP n'est pas propagé) |
| G-05 | Exploitation | Les fichiers des versions de plan remplacées restent dans `reserves-plans` (aucune purge) |
| G-06 | Produit | Les contacts sont lisibles par tout rôle Réserves « voir » de l'hôte (émetteur, consultation compris) ; jamais par une entreprise invitée |
| D-01 | Décision propriétaire (héritée) | Intervenant actif d'un hôte suspendu : maintien ou gel |
| H-01 | Harnais | Storage réel (S3), GoTrue réel non couverts localement ; la Preview doit rejouer le parcours |

## 11. Reproduire

```bash
git checkout claude/inspiring-maxwell-rtr9zu && npm ci
npm --prefix apps/reserves ci && npm --prefix tests/e2e/colors-pile-locale ci
pg_ctlcluster 16 main start && apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl

# pgTAP
scripts/local-postgres-bootstrap/rebuild_db.sh qualif
su postgres -c "psql -d qualif -c 'alter database qualif set search_path = public, extensions'"
cd supabase/tests && su postgres -c "pg_prove -d qualif reserves_*.test.sql"      # 700/700

# Recette cross-app (variables : PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, clés anon/service
# signées HS256, PASSERELLE_DATABASE_URL / PASSERELLE_ADMIN_DATABASE_URL sur gpres_e2e,
# NEXT_PUBLIC_SUPABASE_URL=E2E_SUPABASE_URL=http://127.0.0.1:54321, E2E_SUPABASE_ANON_KEY,
# E2E_SUPABASE_SERVICE_ROLE_KEY, RATE_LIMIT_HMAC_KEY, ELSATIA_APPLICATION_ENV=local, PW_CHROME_PATH)
tests/e2e/gp-reserves-pile-locale/preparer-base.sh gpres_e2e
node tests/e2e/colors-pile-locale/passerelle.mjs &
npx next build && npx next start -p 3100 &
npm --prefix apps/reserves run build && npm --prefix apps/reserves run start &
E2E_BASE_URL=http://127.0.0.1:3100 E2E_RESERVES_URL=http://localhost:3020 \
  npx playwright test tests/e2e/gp-reserves-integration.spec.ts --project=desktop-chromium --workers=1
```
