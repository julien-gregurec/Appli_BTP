# ELSATIA — Préflight final de cutover Production V1

> **📘 Document de RÉFÉRENCE DÉTAILLÉE — non opératoire seul.**
> La conduite du jour J se fait avec la source unique :
> **`docs/runbooks/ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md`**, qui **prime en cas de divergence**.
> Ce document reste en vigueur pour le détail des étapes, la fiche variables et les preuves (§13).
> Index et statuts : `docs/runbooks/INDEX_CUTOVER_GP_V1.md`.
> Correction `ELSATIA-GP-CUTOVER-DOCUMENTATION-CLOSURE-V1` (2026-09-06) : le gate **T-45** de
> §14.2 affichait un gap périmé (« 50 ou 51 ») ; **la seule valeur canonique est 53**.

Version 1.5 — 2026-09-05 (**fiche variables réalignée sur le runtime réel**, lot
`ELSATIA-GP-CUTOVER-ENV-DOC-DELTA-CLOSURE-V1`, sur la base de l'audit
`ELSATIA-GP-CUTOVER-ENV-PREFLIGHT-AUDIT-V1` ; version 1.4 = `ELSATIA-GP-CUTOVER-RUNBOOK-AND-QA-REBASE-V1` ;
version 1.3 = `ELSATIA-CUTOVER-FINAL-TARGET-REBASE-V1`).
**Documentation opérateur — lecture / préparation, plus preuves d'exécution offline au §13 et
pack opérationnel de fenêtre aux §14–§27.** Aucune migration Production, aucun déploiement
Production, aucune mutation Stripe Live, aucun secret affiché, aucune migration modifiée.
Le lot 1.4 ajoutait **uniquement des fichiers de test** et de la documentation ; **le lot 1.5 ne
touche que de la documentation** (§5 réécrite, §8, §11, §17, §23) : aucun fichier de production
modifié, l'artefact déployable reste `996be15` inchangé.

> **Cible cutover figée sur `996be15` / ledger 263.** `996be15` est le HEAD de la branche
> canonique `feat/elsatia-commercial-canonical-r1-r2-r3-v1` et remplace, comme cible applicative,
> les SHA successivement annoncés `c1930ab` (v1.2), `a81f317`, `b371641` puis `1d15289` (v1.3).
> Baseline Production confirmée = **210 migrations** (dernière `…000231`) ; gap réel =
> **53 migrations** (`…000200` → `…000265`, canonicalisées lexicalement avant `…000216`).
> Toute mention résiduelle de `c1930ab` / ledger 261 / gap 51 ailleurs dans ce document doit être
> lue comme remplacée par cette cible.
>
> **Attribution des preuves — ne pas confondre les deux étages (lot
> `ELSATIA-GP-CUTOVER-RUNBOOK-AND-QA-REBASE-V1`, 2026-09-05).**
>
> | Étage | SHA d'exécution réel | Date | Où |
> |---|---|---|---|
> | **Drill DB** — Fresh 263, Restore 210→263, rollback 210→263→210, pgTAP 54/1154, drift ACL 0 | **`a81f317`** | 2026-09-05 | §13.1–§13.4 |
> | **QA applicative** — Vitest GP + Tools, typecheck, ESLint, build, `verify:migrations`, `verify:secrets`, `npm audit`, `git diff --check` | **`996be15`** | 2026-09-05 | §13.5 |
>
> Le drill DB **n'a pas été exécuté à `996be15`** et ce document ne l'affirme nulle part. Il reste
> valable pour `996be15` par **identité stricte de l'arbre `supabase/migrations/`** entre
> `a81f317`, `1d15289` et `996be15` (même objet git `3691fc7dd1ad6e3082349b1517861d27f8ac9546` ;
> `git diff --name-status a81f317..996be15 -- supabase/migrations/` = vide). Les trois commits
> applicatifs intercalés (`36642e3` légal, `b371641` OpenAI `store:false`, `1d15289` e-mail/avoir)
> ne touchent aucune migration ; ils sont couverts par la QA applicative §13.5 rejouée à `996be15`.

Il **met à jour** la cible du cutover avec le vrai HEAD commercial canonique et se superpose au
runbook de bascule/rollback existant :

- Mécanique de bascule et de rollback détaillée : `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md` (V1, 2026-09-02).
- Preuves BDD E2E + rollback local (cible 253) : `docs/audits/ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1.md`.
- Canonicalisation d'historique : `docs/audits/migration-canonicalization-v2.md`.
- Revue indépendante préprod : `docs/audits/ELSATIA_PREPROD_INDEPENDENT_REVIEW_V1_R2.md`.
- **Preuves d'exécution offline du drill DB — exécuté au SHA `a81f317`** (Fresh 263,
  Restore→263, rollback 210→263→210, drift ACL) : §13.1–§13.4 de ce document (lot
  `ELSATIA-CUTOVER-OFFLINE-P0-CLOSURE-V1` puis rejeu `ELSATIA-CUTOVER-FINAL-TARGET-REBASE-V1`).
- **QA applicative rejouée au SHA cible `996be15`** (Vitest, typecheck, lint, build, verify,
  audit) : §13.5 (lot `ELSATIA-GP-CUTOVER-RUNBOOK-AND-QA-REBASE-V1`, 2026-09-05).
- **Pack opérationnel de fenêtre réelle** (rôles, P0-1/P0-3/T0/MFA/multitenant/Colors-Tools/
  Stripe/GO/rollback) : §14–§27 de ce document (lot
  `ELSATIA-PRODUCTION-CUTOVER-WINDOW-PREPARATION-V1`, 2026-09-04).
- **Checklist opérateur imprimable** :
  `docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_OPERATOR_CHECKLIST_V1.md`.
- **Provisioning attestation Ed25519** (formats, migration créatrice, couple généré, commandes
  Vercel/SQL exactes) : `docs/runbooks/ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md` (lot
  `ELSATIA-ED25519-PRODUCTION-PREPARATION-V1`, 2026-09-04) — §18bis de ce document.

---

## 0. Ce qui change par rapport au runbook V1

| Élément | Runbook V1 (2026-09-02) | Préflight final (ce document) |
|---|---|---|
| Branche cible | `feat/tarification-on-canonical-preprod-v1` | `feat/elsatia-commercial-canonical-r1-r2-r3-v1` |
| SHA cible | `ac7bf050…` | **`996be15c136f09d9977375e700462b503a1720c3`** |
| Ledger cible | 253 (`…000255`) | **263 (`…000265`)** |
| Delta vs `ac7bf05` | — | **+10 migrations** : `…000256` → `…000265` (R1 capacité, R3 modules, R2 Stripe capacité, ACL webhook abonnement, clôture lifecycle, correctif ACL onboarding/`entreprise_besoins`, correctif `cout_horaire` employé, essai 30 jours borné aux modules catalogue) |
| Frontend Production actuel | `release/commercialisation-v1` @ `fcdd4e7c` (obsolète pré-canonique) | inchangé |

Le reste du runbook V1 (principe central, stratégies de rollback A/B/C, rollback ACL/Auth/MFA/
Storage/Stripe, matrice de décision, responsabilités) **reste applicable tel quel**.

---

## 1. Baseline Production — à relire en direct avant le cutover (P0)

**Cette session n'a pas d'accès à Supabase Production.** La CLI locale est liée au projet
**Preview** (`pgvvpqyjziyapbbkydmc`) ; Production = `exhvuzegsefmoguxoiak` (eu-west-3). Aucun
jeton d'accès Supabase ni identifiant DB Production n'est disponible ici, et la lecture directe
exigerait un secret que ce lot n'a pas le droit de manipuler.

La baseline ci-dessous provient donc du runbook V1 (P5/P10, 2026-09-02) et **doit être
reconfirmée par une lecture en lecture seule** par l'opérateur, à T-60 :

| Attendu (runbook V1) | À reconfirmer en direct |
|---|---|
| Branche/SHA app | `release/commercialisation-v1` @ `fcdd4e7c90f32abb15502e825335659f9d57c9a1` |
| Ledger migrations Production | **210** versions (baseline confirmée par lecture directe de l'historique git — dernière migration `…000231` — remplace l'ancienne hypothèse à 211 du runbook V1 ; à reconfirmer malgré tout en direct ci-dessous, jamais supposée) |
| Dernière version appliquée | à lire |
| `…000255_acl_reconciliation_v1` appliquée ? | **non** attendu (point de non-retour non encore franchi) |
| Sentinelles métier | 6 entreprises / 6 utilisateurs / 31 clients / 30 chantiers / 108 devis / 73 factures (snapshot DR 2026-09-02) |

### Commandes de relecture (lecture seule, opérateur)

```
# jeton d'accès personnel Supabase requis dans l'environnement de l'opérateur
supabase login                      # ou export SUPABASE_ACCESS_TOKEN=...
supabase migration list --linked --project-ref exhvuzegsefmoguxoiak
# → colonne "Remote" = ledger réel ; comparer au fichier supabase/migrations/ de 996be15

# ledger brut + sentinelles (psql lecture seule sur la chaîne Production)
psql "$PROD_READONLY_DSN" -c "select count(*), max(version) from supabase_migrations.schema_migrations;"
psql "$PROD_READONLY_DSN" -c "select version from supabase_migrations.schema_migrations order by version;"
psql "$PROD_READONLY_DSN" -c "select
  (select count(*) from public.entreprises)  as entreprises,
  (select count(*) from public.utilisateurs) as utilisateurs,
  (select count(*) from public.clients)      as clients,
  (select count(*) from public.chantiers)    as chantiers,
  (select count(*) from public.devis)        as devis,
  (select count(*) from public.factures)     as factures;"
```

**Sortie attendue à archiver** : liste ordonnée des versions Production + `count`/`max` +
sentinelles. Le diff `versions canoniques (996be15) − versions Production` **est** la liste
d'application du §2.

---

## 2. Migration gap — liste ordonnée à appliquer

Cible canonique : **263 migrations** (`supabase/migrations/*.sql` @ `996be15`,
`verify:migrations` = « 263 migrations valides, noms et horodatages uniques »).

Aucune migration historique déjà présente sur Production (≤ `fcdd4e7c`) n'est modifiée par la
lignée canonique — vérifié par la revue indépendante R2
(`git diff fcdd4e7c..996be15 -- supabase/migrations/` : aucune migration existante touchée).
**Le cutover est donc purement additif (append-only).**

### 2.1 Volume

| Départ Production (confirmé) | Cible | Migrations à appliquer |
|---|---|---|
| ledger **210** (dernière `…000231`) | ledger **263** (dernière `…000265`) | **53** |

La liste exacte = **toute version de `supabase/migrations/` @ `996be15` absente du ledger
Production**, appliquée **dans l'ordre lexical du nom de fichier** (= ordre d'application).
Y compris les versions à horodatage inférieur au `max(version)` Production (migrations Preview-only
et réconciliations réintégrées par la canonicalisation v2).

### 2.2 Bloc 210 → 253 (identique au runbook V1)

42 migrations, déjà validées Fresh + Restore + pgTAP 870/870 + rollback local 210→253→210
(`ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1`). Comprend notamment, dans l'ordre :

- `20260815000200_reconciliation_pre_tarifs_v2` (préflight tarifs, no-op si déjà réconcilié)
- `20260816000201_tarifs_v2_catalogue` … `20260818000215_avenants_v1_integration_facturation`
- `20260825000232_platform_function_signature_preflight_v2` (préflight signature, no-op Fresh/Preview)
- restauration exacte de `20260826000237_platform_aal2_role_integrity_v1` (compat `42P13`)
- `20260828000246_colors_functional_core_v1` … `20260828000249_colors_security_cleanup_v13`
- `20260901000250_platform_promotion_aal2_hardening_v1` … `20260901000253_support_message_author_guard_r75`
- `20260901000254_migration_canonicalization_v2` (réconciliation tarifaire finale, append-only, 5 lignes d'audit sur Fresh/Production, 0 sur Preview)
- **`20260902000255_acl_reconciliation_v1`** — *point de non-retour* (cf. §3)

### 2.3 Bloc 253 → 263 — delta commercial R1/R2/R3 (nouveau)

| Ordre | Version | Objet | Nature ACL |
|---|---|---|---|
| 254 | `20260903000256_active_person_capacity_r1_v1` | R1 — capacité « personnes actives » (colonnes `entreprises`, RPC pures, backfill) | REVOKE/GRANT **locaux aux nouveaux objets** ; `grant execute … to authenticated` |
| 255 | `20260903000257_modules_a_la_carte_r3_v1` | R3 — modules à la carte (`modules_gestion_pro`, `modules_entreprises`, `historique_modules_entreprises`, RPC garde `acces_module_pour_permission`, `plateforme_definir_module_entreprise` = admin + AAL2) | `revoke all … from public, anon, service_role` sur les **nouveaux** objets ; `grant … to authenticated` ; **aucun** grant service_role |
| 256 | `20260903000258_capacity_stripe_r2_v1` | R2 — modèle de données + logique pure capacité Stripe | locaux aux nouveaux objets |
| 257 | `20260903000259_capacity_stripe_r2_b_v1` | R2-B — RPC `synchroniser_capacite_stripe_service` (SECURITY DEFINER, garde tenant) | RPC service dédiée, minimale |
| 258 | `20260903000260_capacity_stripe_r2_d_cancel_scheduled_v1` | R2-D — `annuler_baisse_capacite_planifiee` | RPC service dédiée |
| 259 | `20260903000261_capacity_stripe_r2_d_close_converged_op_v1` | R2-D — `capacite_stripe_finaliser_op_convergente`, marqueur d'événement | RPC service dédiée |
| 260 | `20260904000262_stripe_subscription_webhook_acl_v1` | Webhook abonnement compatible ACL canonique — 5 RPC SECURITY DEFINER (`synchroniser_abonnement_stripe_service`, journal `reserver/finaliser/annuler_evenement_abonnement_service`, `synchroniser_facture_abonnement_service`) | RPC service dédiées, **pas** de réattribution large de `UPDATE public.entreprises` |
| 263 | `20260904000263_stripe_subscription_lifecycle_closure_v1` | Clôture B1/B2/B3 — `lier_subscription_entreprise_service`, `calculer_depassement_appareils_service`, `enregistrer_/finaliser_releve_stockage_service` | RPC service dédiées |

Aucune migration 256–263 ne touche les schémas Colors ou Tools, ne modifie la migration 255, ni
ne réaccorde un grant large à `service_role`. Elles n'ajoutent **aucune** incompatibilité
supplémentaire pour l'ancien binaire au-delà de ce que 255 impose déjà (cf. §3).

### 2.4 Contrôles post-application (T0)

- ledger final = **263**, `…000263` présente, `…000255` présente, aucune collision de timestamp ;
- `verify:migrations` (dans un environnement portant le code `996be15`) = 263 uniques ;
- second passage `supabase migration up` : `applied: []` ;
- pgTAP Production ciblé (référence Fresh 263 **et** Restore→263, drill offline §13.1/§13.2
  exécuté au SHA `a81f317`, arbre de migrations identique à `996be15` :
  **54 fichiers / 1154 tests — PASS**, identique sur les deux) + smoke SQL sentinelles inchangées ;
- 5 lignes d'audit tarifaire (`…000254`) attendues sur Production (0 si l'état est déjà réconcilié).

---

## 3. Compatibilité frontend — cutover coordonné obligatoire

**Confirmé :**

1. **L'ancien frontend Production (`fcdd4e7c`) est incompatible avec la base migrée.**
   Dès `20260902000255_acl_reconciliation_v1` : ~1 220 `REVOKE` ciblés + 14
   `ALTER DEFAULT PRIVILEGES … REVOKE`, `est_plateforme_admin()` devient UID + AAL2, RPC de
   remise legacy révoquées (`…000242`), tables/fonctions absentes de `fcdd4e7c`. Le binaire
   `fcdd4e7c` échouera fermé sur des chemins plateforme/remise et ignore R1/R2/R3.

2. **Un cutover coordonné DB + app est nécessaire.** Ordre : migrations (T0) → déploiement de
   l'app sur **`996be15`** (T+15) → contrôles → ouverture (T+30). L'app `996be15` est la seule
   qui connaît le schéma cible complet (ACL 255, MFA/AAL2, Colors, Tools, R1/R2/R3). Le chemin de
   déploiement est : **promotion de `996be15` dans `release/commercialisation-v1`** (la Production
   Branch Vercel, inchangée) → déploiement de cette release. La Production Branch **ne devient pas**
   la branche `feat/…` ; sa configuration Vercel n'est pas modifiée par le cutover.

3. **Point de non-retour exact : application de `20260902000255_acl_reconciliation_v1`.**
   Avant : un rollback Vercel seul suffit. Après : le rollback code seul est insuffisant — les
   migrations 256–263 ne déplacent pas ce point (append-only, sans REVOKE large supplémentaire),
   mais elles élargissent le schéma que seul `996be15` sait exploiter.

4. **Rollback = restauration DB (PITR / snapshot pris à T-30) + redéploiement coordonné du
   frontend correspondant à l'état DB restauré.** Détail : runbook V1 §5 (stratégies A/B/C),
   §6 (ACL), §13 (scénarios T0–T4). Les « down migrations » improvisées sont interdites ;
   l'inversion fiable des REVOKE de `…000255` passe par le snapshot (B) ou un bundle de
   compatibilité préparé et testé à l'avance (C).

---

## 4. Sauvegardes avant cutover

Procédure inchangée — runbook V1 §2 (PITR), §3 (dump DB), §4 (Storage), et prérequis P1–P8.
Rappel synthétique :

| # | Sauvegarde | Vérification | Emplacement |
|---|---|---|---|
| T0-snap | **PITR / snapshot managé Production** | identifiable (id + horodatage UTC), restaurable (vérifié sur le plan du projet, pas supposé), rétention ≥ T0 + 24 h | Supabase (projet `exhvuzegsefmoguxoiak`) |
| dump | **`pg_dump` format custom `--compress=9`** | SHA-256 calculé puis relu ; manifeste (taille, SHA-256, TOC count, `backup_id`) | volume DR chiffré `/Volumes/ELSATIA-PRODUCTION-DR/…/database/` **uniquement** (jamais de fichier en clair hors volume) |
| storage | **Backup Storage chiffré (13 buckets)** | `verify-storage-backup` PASS ; SHA-256 par objet ; manifeste | volume DR chiffré `…/storage/` |
| lien | **Manifestes DB + Storage reliés au même `backup_id`** (horodatage UTC commun, ex. `20260904T…Z`) | cohérents | volume DR chiffré `…/manifest/` |
| état | ledger (attendu 210) + inventaire ACL (`aclexplode` + policies) + inventaire admins plateforme (email, `utilisateur_id`, rôle, `actif`, `statut_identite`) + état MFA (facteurs TOTP, moyens de récupération) | archivés | volume DR chiffré |
| preuve | **test de restauration** : dump → base isolée → sentinelles `…|210|…` exactes (cf. `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1` §10, rollback local 210→253→210 déjà prouvé) | sentinelles identiques avant/après | base probe jetable, jamais Preview/Production |

Aucun secret n'apparaît dans les manifestes, dumps, tickets ou logs. Le rôle de dump dédié
`elsatia_backup` (NOLOGIN hors fenêtre) est réactivé le temps du dump puis refermé.

---

## 5. Variables / secrets requis avant cutover — **noms uniquement**

Valeurs de secrets jamais affichées. Fiche **alignée sur le runtime réel** lu au SHA cible
`996be15` (lot `ELSATIA-GP-CUTOVER-ENV-PREFLIGHT-AUDIT-V1`, 2026-09-05) : plus aucune variante
« selon convention », et séparation explicite entre ce qui est **consommé par le code**, ce qui est
**réservé aux scripts d'ops**, et ce qui possède un **défaut dans le code**.

### 5.0 Type Vercel `sensitive` — ce qui ne peut PAS être relu pendant la fenêtre

Sur `elsatia-production`, **27 des 46 variables sont de type Vercel `sensitive`** : leur valeur est
**irrécupérable**, y compris par le propriétaire du projet et y compris via `vercel env pull`.
`vercel env ls` n'affiche que le **nom** et le type.

Sont concernées, au-delà des vrais secrets :

`FEATURE_AI_ENABLED`, `FEATURE_AI_DEVIS_ENABLED`, `FEATURE_RELANCES_AUTO_ENABLED`,
`STRIPE_SECRET_KEY`, **tous** les `STRIPE_PRICE_*`, `SUPPORT_EMAIL`, `EMAIL_FROM_ADDRESS`.

**Conséquence opératoire, à ne pas contourner** : pour ces variables, « vérifier la valeur » est
**impossible**. Aucune case de ce runbook ne doit être cochée sur la foi d'une lecture de valeur, et
aucun secret ne doit être affiché pour « contrôler ». Les deux seules actions légitimes sont :

1. la **réaffirmation explicite** — réécrire la variable avec la valeur voulue (§5.5) ;
2. un **smoke de comportement** — observer ce que fait l'application, sans lire la clé (§5.6).

### 5.1 Supabase (Production) — obligatoires

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — **seule** clé publique Supabase lue par l'application.
  `src/lib/supabase/keys.ts` **jette** (`Configuration Supabase incomplète :
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY absente`) si elle manque : sans elle, l'application ne
  fonctionne pas.
  **`NEXT_PUBLIC_SUPABASE_ANON_KEY` n'est lue nulle part au SHA `996be15`.** Ne pas la créer, ne pas
  la chercher, ne pas la considérer comme un équivalent acceptable. Les versions antérieures de
  cette fiche proposaient les deux « ou selon convention » : **ambiguïté supprimée**.
- `SUPABASE_SERVICE_ROLE_KEY`

### 5.2 Variables d'ops (scripts et gardes) — ne sont pas des clés applicatives

`SUPABASE_PROJECT_REF` et `ELSATIA_SUPABASE_PROJECT_NAME` ne sont **jamais lues par le runtime
applicatif** : aucune occurrence dans `src/` au SHA `996be15`. Elles sont consommées par les
**scripts et gardes d'ops** — `scripts/garde-scripts-production.mjs` (qui refuse d'agir si
`SUPABASE_PROJECT_REF` est absente ou incohérente avec l'hôte de `NEXT_PUBLIC_SUPABASE_URL`) et
`scripts/seed-elsatia-preview-year.mjs`.

Ce ne sont **pas** des clés client, elles ne transitent pas dans le bundle, et elles **doivent
correspondre au projet Production ciblé**. Valeurs Production, non secrètes, vérifiables :

```
SUPABASE_PROJECT_REF=exhvuzegsefmoguxoiak
ELSATIA_SUPABASE_PROJECT_NAME=elsatia-production
```

Contrôle à faire : l'hôte de `NEXT_PUBLIC_SUPABASE_URL` (`exhvuzegsefmoguxoiak.supabase.co`) et
`SUPABASE_PROJECT_REF` désignent bien le **même** projet. Une divergence fait échouer la garde d'ops
en refus explicite — c'est le comportement voulu, pas un incident.

### 5.3 Stripe — abonnements (TEST, recette Production fermée)

Requises par `variablesStripeBillingManquantes()` (`src/lib/stripe-abonnement.ts`) :
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_ABONNEMENT_SECRET`, `NEXT_PUBLIC_APP_URL`, et les **8**
`STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}`. S'y ajoutent les 8
`STRIPE_PRICE_COMPTE_SUP_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` pour les comptes
supplémentaires, et `STRIPE_WEBHOOK_EXPECTED_MODE` (= `test`).

Non provisionnées et **non requises** pour ce cutover, chacune gardée fail-closed dans le code :
`STRIPE_WEBHOOK_SECRET` (porte de `stripeEstConfigure()` — sans elle le paiement de facture par
Stripe Connect est simplement masqué), `STRIPE_WEBHOOK_BOUTIQUE_SECRET` (boutique désactivée),
`STRIPE_CONNECT_CLIENT_ID` (Connect non ouvert). **P1, hors fenêtre.**

### 5.4 Attestation Ed25519 (Stripe state proof)

`STRIPE_STATE_ATTESTATION_KEY_ID` (non secret, doit correspondre entre Vercel et la registry en
base) et `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` (**Vercel uniquement**, jamais dans doc/dump/log).

Les deux étaient absentes sur `elsatia-production` au 2026-09-04, **et le sont toujours au
2026-09-05** (revérifié en lecture seule) : c'est **attendu**. Couple Ed25519 (`test`) généré,
auto-vérifié et prêt à provisionner — procédure complète, formats exacts, migration créatrice
(`…244`/`…245`) et commandes Vercel/SQL : `ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md`. Le
registry DB (`stripe_attestation.public_keys`/`.configuration`) ne peut être rempli qu'**après** que
le ledger a atteint `…245` — jamais avant.

Surface d'impact réelle avant provisioning : un seul appelant,
`finaliser()` dans `src/lib/stripe-discount-server.ts`, atteint par les sagas de remise plateforme
et par le webhook abonnement. Abonnements gelés ⇒ chemin non exercé.

**→ P0 pendant fenêtre, item A (§11).**

### 5.5 Feature flags / gel commercial

| Variable | Comportement code | Valeur voulue | Relisible ? |
|---|---|---|---|
| `ABONNEMENTS_PUBLICS_OUVERTS` | `=== "true"` requis pour ouvrir | `false` | oui |
| `FEATURE_BOUTIQUE_ENABLED` | fail-**open** (absente ⇒ active) | `false` | oui |
| `FEATURE_CRONS_ENABLED` | fail-**open** (absente ⇒ actif) | `false` | oui |
| `DISABLE_EMAIL_LOGIN` | `=== "true"` requis pour couper | `false` | oui |
| `ELSATIA_APPLICATION_ENV` | `preview`/`production`, sinon `local` | `production` | oui |
| `FEATURE_AI_ENABLED` | fail-**closed** | `false` | **NON — `sensitive`** |
| `FEATURE_AI_DEVIS_ENABLED` | fail-**closed** | `false` | **NON — `sensitive`** |
| `FEATURE_RELANCES_AUTO_ENABLED` | fail-**closed** | `false` | **NON — `sensitive`** |

Le fail-closed protège contre l'**absence**, pas contre un `true` posé par erreur — et la valeur
réelle de ces trois flags n'est plus lisible. Ils doivent donc être **réaffirmés explicitement
pendant la fenêtre** (`FEATURE_AI_ENABLED=false`, `FEATURE_AI_DEVIS_ENABLED=false`,
`FEATURE_RELANCES_AUTO_ENABLED=false`), sans jamais tenter de les « vérifier » par lecture.

**→ P0 pendant fenêtre, item B (§11).**

### 5.6 Mode Stripe — documenté, mais partiellement non lisible

- `STRIPE_WEBHOOK_EXPECTED_MODE = test` — **lisible en clair**, non ambigu.
  `resoudreModeStripeWebhook()` rejette fermé tout événement `livemode=true`.
- **Le mode réel de `STRIPE_SECRET_KEY` reste NON LISIBLE** (type `sensitive`) : le préfixe
  `sk_test_` / `sk_live_` ne peut être ni lu ni déduit sans réécrire la variable. Les 16
  `STRIPE_PRICE_*` sont dans le même cas.
- **Ne jamais afficher la clé pour trancher.** Le mode se confirme par le **smoke contrôlé** de §23,
  qui observe le comportement de l'application sans révéler aucune valeur.
- **Aucune activation Live.** Passage Live = lot P15 distinct, hors de ce cutover.

**→ P0 pendant fenêtre, item C (§11).**

### 5.7 URLs app et e-mail

`NEXT_PUBLIC_APP_URL` (= `https://app.elsatia.fr`, vérifiée), `SUPPORT_EMAIL`, `EMAIL_FROM_ADDRESS`,
`BREVO_API_KEY`.

### 5.8 Mentions légales de l'éditeur

`NEXT_PUBLIC_LEGAL_SIRET`, `NEXT_PUBLIC_LEGAL_TVA`, lues par `src/components/DocumentLegal.tsx` pour
substituer les jetons `[EDITEUR_SIRET]` et `[EDITEUR_MENTION_TVA]` de
`docs/juridique/mentions-legales.md` et `cgv.md`.

- `NEXT_PUBLIC_LEGAL_SIRET` = `850 559 873 00011` — **provisionnée et vérifiée conforme** sur
  `elsatia-production` (valeur non secrète, relue en direct le 2026-09-05).
- `NEXT_PUBLIC_LEGAL_TVA` : **régime non confirmé à ce jour — laisser vide**. Absente sur
  Production, ce qui est le comportement voulu. Ne pas inventer de régime ni de numéro.
- **Comportement fail-open, non bloquant pour le cutover** : variable absente ou vide → repli neutre
  affiché (« en cours de finalisation » / « à confirmer »), jamais de jeton brut ni de valeur
  supposée (garde couverte par `src/components/DocumentLegal.test.ts`, §13.5bis). Les mentions
  légales publiques restent **incomplètes** tant que le régime de TVA n'est pas renseigné : à traiter
  avant ouverture commerciale (P1-6).

### 5.9 Billing Tools — hébergé par GP, non provisionné (P1 hors cutover)

`STRIPE_TOOLS_SECRET_KEY`, `STRIPE_TOOLS_WEBHOOK_SECRET`, `STRIPE_TOOLS_PRICE_MONTHLY`,
`STRIPE_TOOLS_PRICE_ANNUAL`, `TOOLS_APP_URL` sont consommées par **l'API billing Tools hébergée dans
GP** (`src/lib/tools-monetization.ts`, `toolsStripeConfiguration()`) — et non par le projet Vercel
`elsatia-tools`, contrairement à ce que suggérait le classement « Colors / Tools (multi-app) » des
versions antérieures de cette fiche.

**État constaté** : les 5 sont **non provisionnées** sur `elsatia-production` ⇒ `ready = false` ⇒ le
checkout Tools est indisponible en Production. **Classement : P1, hors cutover — ne pas les traiter
comme P0**, ne pas les provisionner pendant la fenêtre.

`NEXT_PUBLIC_TOOLS_BILLING_API_URL` : **n'est consommée nulle part dans GP au SHA `996be15`** (aucune
occurrence dans `src/`). Elle figurait dans les versions antérieures de cette fiche : **ne pas la
présenter comme requise**, ne pas la provisionner.

### 5.10 Variables à défaut code — explicitement NON bloquantes

Leur absence est sans effet : le code fournit un défaut. Ne pas les provisionner « par sécurité »,
ne pas les compter comme secret manquant.

| Variable | Défaut appliqué par le code |
|---|---|
| `EMAIL_FROM_NAME` | `"ELSATIA"` (`src/lib/brevo.ts`) |
| `OPENAI_MODEL` | modèle par défaut (`src/lib/ai/providers/openai.ts`, `src/lib/ai/journal.ts`) |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | absente ⇒ `false` (`src/lib/stripe-abonnement.ts`) |
| `TOOLS_ALLOWED_ORIGINS` | `https://tools.elsatia.fr` déjà en dur dans l'allowlist (`src/lib/tools-monetization.ts`) |

### 5.11 Prices legacy — non commercialisés, provisioning NON demandé

`STRIPE_PRICE_ESSENTIEL_{MENSUEL,ANNUEL}`, `STRIPE_PRICE_PREMIUM_{MENSUEL,ANNUEL}` et les comptes
supplémentaires associés (`STRIPE_PRICE_COMPTE_SUP_{ESSENTIEL,PREMIUM}_{MENSUEL,ANNUEL}`)
correspondent à des offres **absentes de `OFFRES_ABONNEMENT_COMMERCIALISEES`** : elles restent
déclarées dans les tables de correspondance du code (aucune modification de code dans ce lot) mais
**ne sont pas commercialisées**. Elles figurent encore dans `.env.example` — legacy.

Idem pour `STRIPE_PRICE_OPTION_IA_{100,300,ILLIMITE}_{MENSUEL,ANNUEL}` : l'option IA est fermée.

**Ne pas provisionner ces variables, ne pas les compter comme manquantes.**

### 5.12 Crons / webhooks / intégrations

`CRON_SECRET`, `RATE_LIMIT_HMAC_KEY` (son absence en Production fait échouer en `503` **toute**
requête de mutation, dont `POST /login` — obligatoire), `BANK_DATA_ENCRYPTION_KEY`.

Features désactivées, absences **normales et fail-closed** : `NOTIFICATIONS_WEBHOOK_SECRET`,
`PAYROLL_IMPORT_SECRET`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`,
`POWENS_CLIENT_ID`/`POWENS_CLIENT_SECRET`/`POWENS_API_BASE_URL`/`POWENS_WEBVIEW_BASE_URL`,
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PLAY_RTDN_AUDIENCE`, `APPLE_ROOT_CA_BASE64`. `OPENAI_API_KEY` est présente mais inerte tant
que `FEATURE_AI_ENABLED` n'est pas `true`.

Cohérence crons : `FEATURE_CRONS_ENABLED=false` **et** `CRON_SECRET` présent — plus sûr que le
minimum requis. Nuance : `/api/cron/abonnements` ne sort en 404 que si `FEATURE_CRONS_ENABLED` **et**
`FEATURE_RELANCES_AUTO_ENABLED` sont faux ; `CRON_SECRET` étant présent, aucune combinaison ne
produit de `503`.

### 5.13 Observabilité

`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` —
présentes.

### 5.14 Écart connu (P1)

Les 4 `STRIPE_PRICE_*_ANNUEL` peuvent encore pointer sur des Prices ×12 au lieu des Prices
« 10 × mensuel » de la grille canonique — lot `ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1`.
`verify:stripe-prices --strict` doit être **8/8** dans un environnement portant réellement les
variables. **Ces variables étant `sensitive`, cet écart n'est pas vérifiable par lecture** : il ne
peut être tranché que par l'exécution du script dans un environnement qui les porte.

---

## 6. MFA / AAL2 — séquence exacte

Aucun QR, seed TOTP ni code n'est demandé, transmis ou consigné (ici ou ailleurs).

1. **Déployer l'app canonique (`996be15`)** : promotion de `996be15` dans
   `release/commercialisation-v1` (Production Branch Vercel, **pas `main`**), puis déploiement.
2. **Login AAL1** de l'admin humain (`julien@elsatia.fr`) — les sessions AAL1 pré-cutover sont
   automatiquement re-challengées (comportement voulu).
3. **Enrollment TOTP** si le facteur n'existe pas / doit être renouvelé : l'admin scanne son
   propre QR dans son application d'authentification, hors de tout canal partagé.
4. **Challenge AAL2** : saisie du code TOTP → session élevée à AAL2.
5. **Validation admin `total`** : l'admin atteint `/plateforme` en AAL2 ; matrice de refus
   vérifiée (non-authentifié → refus ; AAL1 → challenge imposé ; AAL2 non-admin → refus ;
   AAL2 admin inactif → refus).
6. **Second admin `total`** : confirmer qu'un deuxième porteur `total` actif dispose d'un accès
   indépendant (facteur TOTP fonctionnel **ou** récupération e-mail Supabase Auth valide). Le
   compte technique `plateforme@invalid.local` n'est **pas** un chemin de récupération.

Récupération en cas de perte de facteur : flux Supabase Auth de récupération par e-mail puis
ré-enrôlement TOTP. **Jamais** de `DELETE FROM auth.mfa_factors` manuel comme procédure normale
(runbook V1 §7).

---

## 7. Colors / Tools — impact du cutover

- **`996be15` contient déjà** l'intégration Colors (`apps/colors/**`, migrations `…000246`–`…000249`)
  et Tools (`apps/tools/**`, migrations `…8`/`…9`/`…10`, R8/R9/R10), la convergence multi-app
  (`…000234`), le compte partagé plateforme et le catalogue d'accès. Ces éléments sont dans le
  **bloc 210→253 déjà validé** Fresh + Restore + pgTAP + E2E `Playwright 40/40`.
- **Les migrations 256–263 ne touchent ni Colors, ni Tools, ni `apps.*`, ni les redirect URLs
  multi-app** (vérifié : `grep -liE "colors_|elsatia_tools|apps\." supabase/migrations/2026090*_25[6-9]|26[0-3]` → aucun).
- **Contrat multi-app** (compte partagé, catalogue d'accès, redirect URLs Colors/Tools) : porté
  par `…000234`–`…000240`/`…000248`/`…000250`, inclus dans le bloc déjà validé ; le cutover ne
  le modifie pas.
- **Devient immédiatement fonctionnel après migrations + déploiement `996be15`** :
  - R1 — compteur « personnes actives » X/Y sur `/abonnement`, garde de capacité serveur ;
  - R3 — section **Modules** de `/abonnement` (inclus plan / ajoutés / disponibles), garde
    module `acces_module_pour_permission` dans le proxy, page terminale
    `/abonnement/module-non-inclus` (correctif boucle post-login `c1930ab`, inclus dans
    `996be15`) ;
  - R2 — gestion de capacité supplémentaire (+1/+5/+10, prévisualisation, baisse planifiée,
    annulation) câblée sur Stripe **TEST** ;
  - webhook abonnement Stripe conforme à l'ACL canonique (RPC SECURITY DEFINER dédiées).
- Colors Production et Tools Production restent fonctionnellement **inchangés** par le delta
  256–263 ; seul le socle commun (déjà présent dans le bloc validé) est requis.

---

## 8. Stripe — posture pendant le cutover technique

- Production **reste branchée sur Stripe TEST** pendant tout le cutover. Aucune clé `sk_live_`,
  aucun Price Live, aucun webhook Live créé, lu ou modifié.
- `ABONNEMENTS_PUBLICS_OUVERTS = false` : la souscription publique en ligne reste **fermée**
  (changement d'offre et ajout de capacité = opérations internes / contactez-nous).
- `STRIPE_WEBHOOK_EXPECTED_MODE = test` — **valeur lisible et vérifiée** ;
  `resoudreModeStripeWebhook` rejette fermé tout événement `livemode=true`.
- **Limite à assumer** : `STRIPE_SECRET_KEY` est de type Vercel `sensitive` (§5.0), donc son mode
  réel (`sk_test_` / `sk_live_`) **n'est pas lisible**. Il est confirmé par le **smoke contrôlé de
  §23**, jamais par affichage de la clé. Idem pour les 16 `STRIPE_PRICE_*`.
- **Recette minimale post-cutover — Stripe TEST uniquement** :
  - `verify:stripe-prices --strict` = 8/8 (après alignement des 4 `_ANNUEL`) ;
  - 8 parcours Checkout Test aux bons montants (79/790, 249/2 490, 449/4 490, 599/5 990),
    sans paiement réel, sessions expirées ;
  - 1 aller-retour webhook abonnement Test signé → RPC `synchroniser_abonnement_stripe_service` ;
  - 1 prévisualisation de capacité `+1` sur une entreprise de recette (pas de « Confirmer »
    hors scénario dédié) ;
  - `expected_mode` = `test` vérifié ; entreprise inconnue → erreur contrôlée ; aucun log
    sensible.
- Passage Live = **lot P15 distinct** (`P15_STRIPE_LIVE_PREPARATION.md` / `STRIPE_LIVE_CHECKLIST.md`),
  hors de ce cutover.

---

## 9. Runbook minuté

Durées **indicatives** (repères d'ordre, pas d'engagement). Détail des contrôles : runbook V1 §12.

### T-60 — Préparation & gel
- [ ] Gel : aucun merge, aucun déploiement concurrent sur la branche canonique.
- [ ] **Relecture baseline Production en direct** (§1) : ledger réel, `max(version)`, sentinelles,
      confirmation que `…000255` n'est pas appliquée. Archiver la sortie.
- [ ] Calculer le diff `versions(996be15) − versions(Production)` → **liste d'application ordonnée** (§2).
- [ ] Vérifier SHA cible `996be15` et SHA Production actuel (`fcdd4e7c` attendu).
- [ ] Accès rollback vérifiés : Vercel, PITR/snapshot activé sur le projet, volume DR chiffré monté.
- [x] Preuves vertes (offline, §13) — **drill DB exécuté à `a81f317`**, **QA applicative à
      `996be15`** : Fresh 263 + pgTAP 54/1154, Restore→263 + pgTAP 54/1154,
      drift ACL applicatif = 0, rollback 210 → 263 → 210 sur snapshot ; GP `vitest` **815/815**
      (93 fichiers) + Tools **107/107** (20 fichiers) + typecheck + lint + build + `verify:secrets`
      1 304 + `npm audit` 0/0, mesurés à `996be15` (§13.5). **Reste à faire à T-60 réel** : le même contrôle
      sur le **dump Production chiffré** (pas le drill de reconstruction) une fois le PITR/dump
      T-30 disponible.
- [ ] Responsable de rollback (P13) confirmé et joignable ; fenêtre de maintenance (P12) communiquée.

### T-30 — Sauvegardes (§4)
- [ ] PITR/snapshot Production — id + horodatage UTC notés, restaurabilité **vérifiée**.
- [ ] Dump DB chiffré + SHA-256 relu + manifeste (`backup_id`).
- [ ] Backup Storage chiffré + `verify-storage-backup` PASS + manifeste au même `backup_id`.
- [ ] Capture ledger (210), inventaire ACL, inventaire admins plateforme + état MFA.
- [ ] Test de restauration sur base probe jetable → sentinelles `…|210|…` exactes.

### T0 — Migrations
- [ ] Fenêtre de maintenance activée si retenue.
- [ ] Appliquer les **53** migrations absentes, dans l'ordre lexical, via la CLI Supabase officielle.
- [ ] Ledger final = **263**, `…000263` + `…000255` présentes, aucune collision.
- [ ] `verify:migrations` = 263 ; second `migration up` → `applied: []`.
- [ ] pgTAP Production ciblé + smoke SQL sentinelles inchangées + 5 lignes d'audit `…000254` attendues.
- [ ] **Point de décision migration** : ledger + pgTAP OK → continuer ; sinon → §10 scénario T0.

### T+15 — Déploiement app + vérifications
- [ ] Promouvoir `996be15` dans `release/commercialisation-v1`, puis déployer cette release
      (Production Branch Vercel inchangée, **pas `main`**).
- [ ] **Auth / MFA** (§6) : login AAL1 → challenge TOTP → AAL2 → `/plateforme` → logout/relogin.
- [ ] **Admin / rôle** : matrice non-auth / AAL1 / AAL2 non-admin / AAL2 admin inactif / AAL2 admin `total` actif.
- [ ] **Multitenant** : entreprise A ne voit rien de B (tables, RPC, documents, Storage, habilitations apps, changement d'entreprise).
- [ ] **R1/R3** : `/abonnement` affiche X/Y personnes actives + section Modules ; route non incluse → `/abonnement/module-non-inclus` **terminale** (pas de boucle) ; login entreprise onboardée → dashboard sans boucle.
- [ ] **Colors / Tools** : login croisé selon habilitations ; redirect URLs OK ; aucun accès non habilité.
- [ ] **Stripe TEST** (§8) : `verify:stripe-prices --strict` 8/8 ; 8 checkouts Test ; webhook abonnement Test ; `expected_mode` = `test`.
- [ ] **Storage** : upload/download privé, URL signée, aucun bucket privé devenu public, isolation A↔B.
- [ ] **Monitoring** : Sentry Production + logs Vercel accessibles.

### T+30 — Décision
- [ ] Tous les critères GO (§11 / runbook V1 §15) verts → **ouvrir le service** (retirer la maintenance).
- [ ] Un seul critère NO-GO (§11 / runbook V1 §16) → **rollback** selon §10.

### T+60 → T+90 — Surveillance rapprochée
- [ ] Taux d'erreur Sentry, 5xx Vercel, login/MFA réels, webhooks Stripe Test reçus, upload/download document, aucune erreur RLS anormale.
- [ ] Cohérence `/tarifs` (montants), aucune alerte de sécurité, quotas Auth e-mail non saturés.
- [ ] Puis surveillance T+24 h / T+7 j (runbook V1 §18).

---

## 10. Rollback — critères et procédure

Critères de déclenchement (un seul suffit) :

| Déclencheur | Seuil | Action |
|---|---|---|
| **Migration échoue** | toute migration non appliquée proprement, ledger partiel | **STOP**, ne pas déployer l'app. État incohérent → restaurer PITR/snapshot (stratégie B). Sinon corriger hors Production et recommencer. |
| **Ledger incohérent** | ledger ≠ 263 propre après T0, ou collision de timestamp | STOP, restaurer snapshot. |
| **MFA admin impossible** | aucun admin `total` n'atteint `/plateforme` en AAL2 après login + challenge réels | ne pas ouvrir. Tester 2e admin `total` / récupération e-mail (§6). Irréparable vite → rollback coordonné app+DB (B). |
| **Login cassé** | 5xx généralisés, page blanche, app indisponible > ~10 min sans correctif | forward-fix (A) si bug mineur identifié ; sinon **rollback coordonné** : redéployer `fcdd4e7c` **+** restaurer le snapshot (car `fcdd4e7c` incompatible avec la DB migrée — §3). |
| **Multi-tenant cassé** | toute fuite A↔B (tables, RPC, documents, Storage) | rollback app immédiat + restauration DB selon cause + STOP commercial. |
| **Webhook critique cassé** | webhook abonnement Test rejeté à tort, mauvais mode, ou double-facturation | maintenir `ABONNEMENTS_PUBLICS_OUVERTS=false` ; revenir à la config webhook TEST connue (variables Vercel) ; le code n'est pas rollbacké pour un problème de variable. |
| **App 5xx critique** | erreurs serveur massives sur chemins clés, non corrigeables en forward-fix | rollback coordonné app+DB (B). |
| **Absence de backup vérifié / rollback techniquement impossible** | constaté à T-30 ou T0 | **ne pas migrer**. |

Procédure de rollback coordonné (runbook V1 §11 / §13) :

1. Fermer les écritures ; capturer état, ledger, variables, version applicative.
2. Conserver PITR/snapshot, dump chiffré, backup Storage, hashes, inventaire ACL/admins/MFA, état Stripe.
3. Restaurer DB **et** Storage dans une cible isolée, puis basculer.
4. Vérifier checksums, sentinelles, Auth, ACL/RLS, liens DB ↔ Storage.
5. Déployer le binaire correspondant à l'état DB restauré (`fcdd4e7c` si retour pré-cutover complet).
6. Smoke : HTTP `/`, `/login`, `/dashboard` ; DB non mutatif ; Auth login/session/logout ; isolation tenant.
7. Rouvrir les écritures **seulement** après GO explicite.

Interdits : down migrations improvisées, `GRANT`/`REVOKE` permissif improvisé en Production,
extraction de la clé privée Ed25519 hors Vercel, `DELETE FROM auth.mfa_factors` manuel.

---

## 11. GO / NO-GO

### Blockers P0 (bloquants — à lever avant toute fenêtre de cutover)

| # | Blocker | État | Levée |
|---|---|---|---|
| P0-1 | **Baseline Production non relue en direct** dans un contexte autorisé (ledger réel, sentinelles, absence de `…000255`) | ouvert (pas d'accès Production dans le lot de préparation) | opérateur exécute §1 à T-60, archive la sortie |
| P0-2 | ~~Répétition Fresh 263 + Restore 263 + pgTAP + rollback `210 → 263 → 210`~~ | **FERMÉ** — drill offline complet **exécuté au SHA `a81f317`** (2026-09-05), preuves §13.1–§13.3 ; valable pour `996be15` (arbre `supabase/migrations/` identique) | — |
| P0-3 | **PITR/snapshot + dump chiffré + backup Storage + test de restauration** au `backup_id` du **cutover réel** | non créés (interdits hors fenêtre Production) — le T0-snapshot §13.2 est un drill offline, pas la sauvegarde Production | T-30, opérateur + CODEX |
| P0-4 | ~~Diff ACL applicatif Fresh↔Restore~~ | **FERMÉ** — rejoué **au SHA `a81f317`**, `application_acl_drift = 0` (6 294 lignes normalisées, 0 diff), preuve §13.4 | — |
| P0-6 | ~~QA applicative jamais re-mesurée depuis `c1930ab` (3 commits runtime non couverts : `36642e3`, `b371641`, `1d15289`)~~ | **FERMÉ 2026-09-05** — suite complète rejouée au SHA cible `996be15` : Vitest GP 93/815, Tools 20/107, typecheck, ESLint (0 erreur), build GP+Tools, `verify:migrations` 263, `verify:secrets` 1 304, `npm audit` 0/0, `git diff --check` — preuves §13.5 ; les 3 correctifs runtime sont couverts par des tests dédiés (§13.5bis) | — |
| P0-5 | ~~Préparation opérationnelle de la fenêtre (rôles, planning, checklists P0-1/P0-3/T0, GO/rollback)~~ | **PRÉPARATION FERMÉE 2026-09-04** — pack complet §14–§27 + checklist imprimable ; **reste à faire par Julien** : fixer la date/heure réelle et les noms (§14.3, §27) | Julien renseigne date + noms sur la checklist |

### P0 pendant fenêtre — environnement (lot `ELSATIA-GP-CUTOVER-ENV-DOC-DELTA-CLOSURE-V1`)

Distincts des blockers P0 ci-dessus : ceux-ci **ne bloquent pas l'ouverture de la fenêtre**, ils
doivent être exécutés **dans** la fenêtre, au moment indiqué. **Il y en a exactement trois.**

**A. Provisionner les variables Ed25519**

`STRIPE_STATE_ATTESTATION_KEY_ID` et `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` sur Vercel
Production, **au bon moment du runbook** : variables Vercel au plus tard à la checklist GO-T0
(§17) ; **registry DB seulement après** que le ledger a confirmé `…244`/`…245` (§18bis). Jamais
l'inverse. Procédure : `ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md`. Détail : §5.4.

**B. Réaffirmer explicitement les trois flags non relisibles**

```
FEATURE_AI_ENABLED=false
FEATURE_AI_DEVIS_ENABLED=false
FEATURE_RELANCES_AUTO_ENABLED=false
```

Type Vercel `sensitive` ⇒ valeur **non lisible** (§5.0). Le fail-closed du code protège contre
l'absence, pas contre un `true` posé par erreur. **Réécrire, ne pas « vérifier ».** Détail : §5.5.

**C. Confirmer le mode Stripe par smoke contrôlé**

`STRIPE_SECRET_KEY` est `sensitive` : son mode réel n'est pas lisible. Le confirmer par le smoke
de **§23**, qui observe le comportement de l'application sans révéler aucune valeur. **Aucune
activation Live.** Détail : §5.6.

### Blockers P1 (à traiter, non bloquants pour figer la date)

> **P1-7 (nouveau, 2026-09-05)** — Billing Tools non provisionné sur `elsatia-production`
> (`STRIPE_TOOLS_SECRET_KEY`, `STRIPE_TOOLS_WEBHOOK_SECRET`, `STRIPE_TOOLS_PRICE_{MONTHLY,ANNUAL}`,
> `TOOLS_APP_URL`) ⇒ `toolsStripeConfiguration().ready = false`, checkout Tools indisponible en
> Production. L'API billing Tools est hébergée **dans GP** (§5.9). **P1, hors cutover — ne pas
> provisionner pendant la fenêtre.**

> **P1-8 (nouveau, 2026-09-05)** — `STRIPE_WEBHOOK_SECRET` absente ⇒ `stripeEstConfigure()` faux ⇒
> le paiement de facture par Stripe Connect est masqué en Production. Fail-closed, non bloquant
> sous gel commercial ; à traiter avant ouverture commerciale (§5.3).

> **P1-6 (2026-09-05, mis à jour)** — `NEXT_PUBLIC_LEGAL_SIRET` est désormais **provisionnée et
> vérifiée conforme** sur `elsatia-production` (`850 559 873 00011`, valeur non secrète relue en
> direct). **Reste ouvert : `NEXT_PUBLIC_LEGAL_TVA`**, absente — régime non confirmé, à laisser vide
> jusqu'à confirmation par Julien. Tant qu'elle l'est, les mentions légales et les CGV publient un
> repli neutre au lieu du régime de TVA : fail-open, non bloquant pour le cutover technique,
> **bloquant pour l'ouverture commerciale**. Ne pas inventer de régime ni de numéro.

| # | Blocker | État |
|---|---|---|
| P1-1 | 4 `STRIPE_PRICE_*_ANNUEL` encore ×12 en environnement → `verify:stripe-prices --strict` non 8/8 (lot `ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1`) | ouvert |
| P1-2 | Ancienne Price Enterprise mensuelle dupliquée sans lookup key côté Stripe TEST (laissée intacte, sélection fail-closed) | observé |
| P1-3 | ~~Protection de branche GitHub `main` + épinglage Vercel « Production Branch ≠ main »~~ | **FERMÉ 2026-09-05** — rulesets GitHub actifs sur `main`/`release/commercialisation-v1`/branche canonique, Production Branch confirmée `release/commercialisation-v1` ≠ `main` (`ELSATIA-GITHUB-VERCEL-RELEASE-GUARD-CLOSURE-V2`, `docs/runbooks/ELSATIA_RELEASE_GOVERNANCE_V1.md`) |
| P1-4 | HTTP 500 Preview (P0 historique **du projet Preview**, sans causalité migration prouvée) — n'affecte pas Production mais doit être tranché avant d'utiliser Preview comme miroir de validation | ouvert |

### Éléments externes non techniques

- Régime fiscal / TVA validé par l'expert-comptable (prérequis commercial).
- Immatriculation micro-entreprise / mentions légales à jour (`P14_*`, `PREPARATION_JURIDIQUE.md`).
- Décision INPI « marque déposée » et calendrier de commercialisation phasée.
- Refonte visuelle ELSATIA-UI-V2 (lot obligatoire avant commercialisation, non démarré) —
  n'empêche pas le **cutover technique** mais conditionne l'**ouverture commerciale**.
- Communication aux admins plateforme du challenge MFA au premier accès post-cutover.

### Fenêtre de maintenance estimée

- Sauvegardes (T-30) : ~30–45 min.
- Migrations (T0) : 53 migrations append-only, essentiellement DDL + RPC + backfill R1 borné →
  ~10–25 min selon volume `entreprises`.
- Déploiement + contrôles (T+15 → T+30) : ~30–45 min.
- **Fenêtre totale conseillée : 2 h**, dont ~45 min de service potentiellement dégradé/fermé,
  marge de rollback incluse.

### Verdict

**NOT READY** au sens « exécutable maintenant » : **P0-1 et P0-3 restent ouverts** (relecture
Production live, sauvegardes datées du cutover réel — les deux nécessitent un accès Production
que ce lot n'a pas). **P0-2, P0-4, P0-6 et la préparation opérationnelle de P0-5 sont fermés** :
- P0-2/P0-4 (preuves §13) : drill Fresh 263 / Restore→263 / rollback / drift ACL **exécuté au SHA
  `a81f317`** (et non à `996be15`) fait et vert, rejoué sur le schéma historique exact de `5777abb` (210 migrations,
  baseline Production confirmée — remplace l'ancienne référence `fcdd4e7c`/211 du runbook V1) —
  sans lire la Production réelle : le ledger live reste à confirmer au P0-1.
- P0-5 (pack §14–§27 + checklist imprimable) : rôles définis, planning horaire relatif figé,
  checklists P0-1/P0-3/GO-T0/MFA/multitenant/Colors-Tools/Stripe/GO/rollback complètes et
  exécutables. **Il manque uniquement une date/heure réelle et des noms**, volontairement non
  inventés (décision de Julien).
- P0-6 (preuves §13.5, 2026-09-05) : QA applicative **rejouée au SHA cible `996be15`** — Vitest
  GP 93 fichiers / 815 tests, Tools 20 / 107, typecheck, ESLint 0 erreur, build GP + Tools,
  `verify:migrations` 263, `verify:secrets` 1 304 fichiers, `npm audit` 0 vulnérabilité
  (racine + Tools), `git diff --check`. Les trois correctifs runtime postérieurs au drill DB
  (`36642e3`, `b371641`, `1d15289`) sont couverts par des tests dédiés (§13.5bis).

La **cible technique est prête et figée** : SHA `996be15`
(`996be15c136f09d9977375e700462b503a1720c3`, HEAD de `feat/elsatia-commercial-canonical-r1-r2-r3-v1`),
ledger 263, 53 migrations additives ordonnées depuis la baseline Production confirmée (210,
dernière `…000231`), aucune migration historique modifiée, runbook et rollback définis, socle
commercial + correctif boucle post-login (`c1930ab`) validés en local **et** via un upgrade réel
210→263 rejoué sur ce schéma historique (drill DB au SHA `a81f317`), QA applicative complète
rejouée au SHA cible `996be15`. Chemin de déploiement : **promotion de `996be15` dans
`release/commercialisation-v1`**, la Production Branch Vercel restant inchangée. **Le
prochain geste technique attendu est l'exécution réelle** (P0-1 → P0-3 → migrations →
déploiement), pas un nouveau lot de préparation.

---

## 12. Rappels d'interdiction (ce lot)

- Aucun déploiement Production. Aucune migration Production. Aucune mutation Stripe Live.
- Aucun secret affiché (noms de variables uniquement).
- Aucune modification des migrations 256–265 ni de la migration 255.
- Aucun réélargissement d'ACL `service_role`.
- Aucune modification de code de production : le lot 1.4 n'ajoute que des fichiers de test
  (`src/components/DocumentLegal.test.ts`, cas ajoutés à `src/lib/ai/providers/openai.test.ts`),
  la documentation des runbooks et les deux variables légales de `.env.example`. `git diff
  996be15..HEAD` ne touche aucun fichier exécuté en Production.

---

## 13. Preuves d'exécution — drill offline P0-2 / P0-4 / P0-6

> **Deux étages, deux SHA — à ne jamais fusionner.**
> §13.1 à §13.4 (**drill DB**) ont été exécutés au SHA **`a81f317`**.
> §13.5 (**QA applicative**) a été rejouée au SHA cible **`996be15`** le 2026-09-05
> (lot `ELSATIA-GP-CUTOVER-RUNBOOK-AND-QA-REBASE-V1`).
> Le drill DB reste opposable pour `996be15` parce que l'arbre `supabase/migrations/` y est
> identique au bit près (`3691fc7dd1ad6e3082349b1517861d27f8ac9546`).

Lot `ELSATIA-CUTOVER-OFFLINE-P0-CLOSURE-V1`. **Aucune Supabase/Vercel Production, aucun Stripe
Live, aucune migration 255–263 modifiée.** Toutes les preuves ci-dessous sont locales, sur des
projets Supabase dédiés au drill (containers Docker isolés), jetables, nettoyés en fin de lot.

### 13.0 Méthode et limite assumée

Aucun accès Production dans ce lot (cf. §1). Le drill ne rejoue donc pas le **dump chiffré réel**
de Production (volume DR non déverrouillé ici), mais reconstruit un état « ancien Production »
**représentatif et vérifiable** : les **210 fichiers de migration exacts** présents au commit
`5777abb` (baseline Production confirmée — dernière migration `…000231` ; remplace l'ancienne
référence `fcdd4e7c`/211 du runbook V1, qui incluait une migration, `…000233`, jamais réellement
appliquée en Production) sont rejoués tels quels sur une pile Supabase locale dédiée neuve
(images/managed schemas authentiques, pas de bricolage de schéma). Cette approche est cohérente
avec la méthode déjà documentée par `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1.md` (« reconstruits
depuis les ledgers et objets observés, pas depuis une restauration physique distante ») — avec un
jeu de migrations **exact** ici (fichiers git réels), pas une reconstruction approximative.

Confirmé au préalable (`git diff --name-status 5777abb a81f317 -- supabase/migrations/`, résultat
identique avec `996be15`) :
**53 fichiers ajoutés, 0 modifié** → le gap est purement additif, et est la même liste que le §2.

### 13.1 A. Fresh 263

- Pile : projet Supabase local `btp-platform` (existant), `supabase db reset --local` au SHA
  `a81f317` (SHA d'exécution du drill).
- Résultat : 263 migrations appliquées dans l'ordre, 0 erreur, ~38 s.
- Ledger : `count=263`, `max=20260904000263`.
- Sondes objets : colonne capacité R1 présente ; `modules_gestion_pro`/`modules_entreprises`
  présentes, **19** modules seedés ; RPC R2 (`synchroniser_capacite_stripe_service`,
  `annuler_baisse_capacite_planifiee`, `capacite_stripe_finaliser_op_convergente`) présentes ;
  RPC webhook (`synchroniser_abonnement_stripe_service`, `reserver_evenement_abonnement_service`)
  présentes ; RPC lifecycle (`lier_subscription_entreprise_service`,
  `calculer_depassement_appareils_service`) présentes ; `plateforme_admins` et
  `est_plateforme_admin()` présents ; `service_role` **sans** INSERT/UPDATE/DELETE sur
  `abonnement_evenements` (effet ACL 255 vérifié) ; plans tarifaires : 5 actifs, 0 incohérent.
- pgTAP (`supabase test db --local`) : **Files=54, Tests=1154 — PASS** (couvre R1/R2/R3,
  webhook ACL, lifecycle closure, MFA/AAL2, isolation multitenant, tarification).

### 13.2 B. Restore → 263

- Pile dédiée neuve : projet `elsatia-drill-v1`, ports 573xx, images Supabase locales identiques
  (même `config.toml` que `btp-platform`, project_id et ports seuls changés) — managed schemas
  (`auth`, `storage`, `extensions`, `graphql`, `realtime`, `vault`, `supabase_functions`)
  authentiques, pas reconstruits à la main.
- **Ancien état** : les 210 fichiers de migration exacts de `5777abb` appliqués via
  `supabase start` → ledger `count=210`, `max=20260824000231` (baseline Production confirmée).
- **Sentinelles synthétiques représentatives** insérées (1 utilisateur Auth, 1 entreprise
  offre `business` statut `actif`, 1 poste + permissions + rattachement, 1 client, 1 chantier
  budget `12345.67`, 1 devis TTC `1200.00`, 1 facture TTC `1200.00`) — même structure de preuve
  que les 7 sentinelles de `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1`.
- **T0-snapshot** : `pg_dump -Fc --compress=9` → `drill_210_snapshot.dump`, **2 025 167 octets**,
  SHA-256 `5e6df7532eb07620b16f662f7f479e5f2ab13e468a99d866a1112f11ea5f7adb` (conservé localement
  pour la durée du lot, supprimé avec le reste du drill).
- **Migrations manquantes → 263** : les 53 fichiers du §2 copiés dans le répertoire de
  migrations, puis `supabase migration up --local --include-all` (le flag `--include-all` est
  requis, exactement comme documenté par `migration-canonicalization-v2.md`, car plusieurs
  fichiers portent un horodatage antérieur au max déjà appliqué). **53/53 appliquées, 0 erreur,
  ~2,2 s**, dans l'ordre lexical exact du §2.
- **Vérifications post-upgrade** :
  - ledger `count=263`, `max=20260904000263` ;
  - **sentinelles identiques** avant/après (diff nul sur entreprise/offre/statut/client/budget
    chantier/montants devis-facture/rattachement utilisateur) ;
  - mêmes sondes objets qu'en 13.1, **toutes identiques** (R1/R2/R3, webhook, lifecycle, MFA,
    ACL 255, 5 plans actifs / 0 incohérent) ;
  - pgTAP (`supabase test db --db-url … 57322 …`) : **Files=54, Tests=1154 — PASS**, résultat
    strictement identique au Fresh.

### 13.3 C. Rollback drill — 210 → 263 → 210

- Restauration du **même** dump T0 (`drill_210_snapshot.dump`) dans une base probe jetable
  (`rollback_probe`, `template0`) du même cluster de drill — jamais Preview/Production, jamais
  la base de travail elle-même (méthodologie identique à `elsatia_preprod_rollback_probe` de
  `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1`).
- **Aucune down migration** : restauration pure via `pg_restore`, conformément à la stratégie B
  du runbook (jamais d'inversion SQL improvisée des `REVOKE` de `…000255`).
- Résultat : `pg_restore` termine avec **148 erreurs ignorées**, **toutes** confinées à la
  plomberie de rôles/propriétaires **gérée par Supabase** propre à une base secondaire créée
  dans un cluster déjà démarré (`SET ROLE supabase_auth_admin/storage_admin/realtime_admin/
  admin/pgbouncer`, default privileges sur le schéma `supabase_functions`,
  `realtime.list_changes`, `vault.secrets`, `pg_stat_statements_reset`, `pg_reload_conf`) —
  **zéro erreur sur un objet applicatif** (`public`/`storage`/`colors`/`tools`). Cette limitation
  est déjà documentée comme anomalie de harness connue par
  `ELSATIA_PREPROD_DB_E2E_ROLLBACK_V1.md` §10 (« la suite pgTAP complète ne doit pas être
  relancée dans une base secondaire ») — constat identique, pas une régression nouvelle.
- **Preuve retenue** (niveau structurel/donnée, la cible de ce drill) :
  - ledger revenu à `count=210`, `max=20260824000231` — **identique à l'état pré-upgrade** ;
  - sentinelles **byte-identiques** à la capture pré-upgrade (diff nul, ledger exclu) ;
  - **149 tables `public`**, toutes RLS **activées**, **443 policies** restaurées — cohérent
    avec l'état pré-`…255` (ACL/RLS antérieures, pas les 1 220 REVOKE de la migration 255) ;
  - conséquence : le frontend ancien (`fcdd4e7c`) est **théoriquement compatible** avec cet état
    DB restauré, par construction (ACL et schéma strictement antérieurs à `…000255`).

### 13.4 P0-4 — Drift ACL applicatif Fresh 263 ↔ Restore → 263

Inventaire normalisé produit sur les **deux** bases (13.1 et 13.2 post-upgrade), pour les rôles
`anon`, `authenticated`, `service_role`, `authenticator` (+ motif `elsatia_*`), sur les schémas
`public`, `storage`, `colors`, `tools` (+ `auth`, `stripe_attestation` pour les privilèges de
table) :

| Catégorie | Lignes (Fresh = Restore) |
|---|---:|
| Privilèges de table (`role_table_grants`) | 355 |
| Privilèges de colonne (`role_column_grants`) | 4 754 |
| Privilèges de séquence | 10 |
| `EXECUTE` sur fonctions/RPC | 272 |
| `ALTER DEFAULT PRIVILEGES` | 187 |
| État RLS (`relrowsecurity`/`relforcerowsecurity`) | 191 |
| Policies (`pg_policies`) | 522 |
| Appartenance de rôle | 3 |
| **Total normalisé** | **6 294** |

`diff <(sort fresh_acl.txt) <(sort restore_acl.txt)` → **0 ligne de différence**.

**`application_acl_drift = 0`.** Aucune distinction système/applicatif/exploitable n'a été
nécessaire ici : l'inventaire est **scopé aux schémas et rôles applicatifs** dès le départ (les
schémas gérés par Supabase — `auth` en interne, `_realtime`, `graphql`, `vault`,
`supabase_functions`, `pgsodium`, `pg_catalog` — sont hors périmètre par construction, car
identiques par construction entre les deux piles : mêmes images Supabase locales pinnées par
`config.toml`, aucune migration canonique ne les modifiant). Toute différence système déjà
observée par ailleurs reste couverte par l'allowlist figée de
`elsatia-supabase-system-drift-audit-v1.md` (532 écarts système managés, classés, sans droit
`anon`/`authenticated`/`service_role`/`authenticator` en trop) — non remise en cause ici.

### 13.5 QA applicative — **rejouée au SHA cible `996be15`** (2026-09-05)

Lot `ELSATIA-GP-CUTOVER-RUNBOOK-AND-QA-REBASE-V1`. Exécution réelle dans un worktree git isolé
créé exactement sur `996be15c136f09d9977375e700462b503a1720c3` (`git worktree add`, HEAD vérifié,
`git status` vide avant exécution), dépendances installées par `npm ci` sur les `package-lock.json`
de ce SHA (racine + `apps/tools`). **Aucune valeur n'est reprise d'une mesure antérieure.**

> Les chiffres de la version 1.3 de ce document (« 92 fichiers / 791 tests », « 1 297 fichiers
> suivis ») dataient en réalité du SHA `c1930ab` (2026-09-04) et avaient été reportés sans être
> re-mesurés lors des rebasages successifs. Ils sont **remplacés** par les mesures ci-dessous.

| Contrôle | Commande | Résultat mesuré à `996be15` |
|---|---|---:|
| GP Vitest | `npx vitest run` | **93 fichiers / 815 tests — PASS** |
| Tools Vitest | `npm --prefix apps/tools run test` | **20 fichiers / 107 tests — PASS** |
| Typecheck (GP + Tools) | `npm run typecheck` | **PASS** — 0 erreur |
| ESLint (GP + Tools) | `npm run lint` | **PASS** — 0 erreur, 3 avertissements `<img>` préexistants (`boutique/[produitId]`, `boutique`, `SignatureEmploye`) |
| Build (GP + Tools) | `npm run build` | **PASS** — GP Next.js 16.2.12 (Turbopack), 186 routes ; Tools Next.js 16.2.12 (webpack), 10 routes |
| `verify:migrations` | `npm run verify:migrations` | **PASS** — « 263 migrations valides, noms et horodatages uniques » |
| `verify:secrets` | `npm run verify:secrets` | **PASS** — 1 304 fichiers suivis contrôlés, aucun secret reconnu |

> `verify:secrets` compte les fichiers **suivis par git**. 1 304 est la valeur de l'arbre
> `996be15` **pristine** — c'est-à-dire de l'artefact déployé. Rejouée sur la branche de ce lot
> (`docs/gp-cutover-runbook-qa-rebase-v1`), la commande renvoie 1 305 : le fichier de test
> `src/components/DocumentLegal.test.ts` ajouté ici, jamais exécuté en Production.

| `npm audit` racine | `npm run audit:security` (`--audit-level=high`) puis `npm audit` | **0 vulnérabilité** (toutes sévérités) |
| `npm audit` Tools | `npm audit` dans `apps/tools` | **0 vulnérabilité** |
| `git diff --check` | `git diff --check` | **PASS** |

**Rappel d'attribution** : les lignes pgTAP (`54 fichiers / 1154 tests`, Fresh 263 et
Restore→263) appartiennent au drill DB §13.1–§13.4 et ont été **exécutées au SHA `a81f317`**.
Elles ne sont pas reproduites ici pour ne pas les attribuer implicitement à `996be15`.

#### 13.5bis Couverture des trois correctifs runtime postérieurs à `a81f317`

Ces trois commits sont les seuls écarts applicatifs entre le SHA du drill DB et la cible. Ils
sont désormais couverts par des tests exécutés à `996be15` (les tests ajoutés par ce lot sont
**exclusivement des fichiers de test** — aucun fichier de production n'est modifié, la cible
`996be15` reste donc l'artefact déployé) :

| Correctif | Commit d'origine | Couverture à `996be15` |
|---|---|---|
| **Légal** — jetons `[EDITEUR_SIRET]` / `[EDITEUR_MENTION_TVA]`, repli neutre | `36642e3` | `src/components/DocumentLegal.test.ts` — **5 cas** : repli neutre sans variable (« en cours de finalisation » / « à confirmer », aucun numéro ni régime inventé), substitution du SIRET réel, substitution de la mention de TVA dans `mentions-legales.md` **et** `cgv.md`, valeur blanche → repli, et garde-fou « aucun jeton `[…]` brut ne fuit » sur les 5 pages juridiques publiques |
| **OpenAI / RGPD** — `store: false` | `b371641` | `src/lib/ai/providers/openai.test.ts` — **4 cas ajoutés** : `store: false` transmis par `completer`, `completerAvecFichier` et `streamer` (avec `stream: true`), et absence de dépendance à `previous_response_id` / `response_id` (historique intégralement reconstruit à chaque appel) |
| **E-mail / avoir + URL app** | `1d15289` | `src/lib/email.test.ts` (devis → « Devis / le devis » ; facture → « Facture / la facture » ; avoir → « Avoir / l'avoir », jamais « Facture ») et `src/lib/documents-envoi.test.ts` (`facture.type = "avoir"` → wording « Avoir » de bout en bout, devis inchangé). `NEXT_PUBLIC_APP_URL` reste couverte par `src/lib/brand.test.ts` et `src/lib/auth-redirects.test.ts` (normalisation, rejet des schémas non http/https) |

Les deux gardes ajoutés ont été **vérifiés non vacants** par mutation : neutraliser la
substitution `[EDITEUR_SIRET]` fait échouer 4 des 5 cas légaux, et retirer les trois `store: false`
fait échouer 3 des 8 cas OpenAI. Les fichiers de production ont été restaurés à l'identique après
ces vérifications (`git diff` vide sur `DocumentLegal.tsx` et `openai.ts`).

R1/R2/R3, ACL webhook abonnement, clôture lifecycle et MFA/AAL2 sont couverts par la suite
pgTAP du drill DB (fichiers `active_person_capacity_*`, `capacity_stripe_r2_*`,
`modules_a_la_carte_r3_*`, `stripe_subscription_webhook_acl_v1`,
`stripe_subscription_lifecycle_closure_v1`, `platform_aal2_role_integrity_v1` et suites MFA
associées) — tous verts sur les deux bases (13.1 et 13.2), **au SHA `a81f317`**.

### 13.6 Nettoyage

Pile de drill `elsatia-drill-v1` arrêtée (`supabase stop`) puis ses volumes Docker supprimés ;
base probe `rollback_probe` conservée le temps de la vérification puis supprimée avec la pile ;
dump et fichiers d'inventaire ACL restés strictement locaux (répertoire de travail temporaire de
la session), non committés. Pile `btp-platform` (Fresh 263) et les autres piles préexistantes non
concernées par ce lot n'ont pas été touchées.

### 13.7 Verdict du drill

```text
P0-2 (Fresh/Restore/rollback, exécuté au SHA a81f317) : FERMÉ
P0-4 (drift ACL applicatif Fresh↔Restore)     : FERMÉ — application_acl_drift = 0
```

---

## 14. Fenêtre de maintenance réelle — modèle et rôles

Lot `ELSATIA-PRODUCTION-CUTOVER-WINDOW-PREPARATION-V1` (2026-09-04). Objectif : fermer la
**préparation opérationnelle** de P0-5. **Aucune date n'est fixée ici** — le modèle ci-dessous est
horodaté en relatif (T-x/T+x) et doit être recopié avec une date/heure réelle par Julien avant
exécution (fichier imprimable : `ELSATIA_PRODUCTION_CUTOVER_OPERATOR_CHECKLIST_V1.md`).

### 14.1 Durée cible (2 h)

| Phase | Durée cible | Bloc horaire relatif |
|---|---|---|
| Préparation + P0-1 | ~30 min | T-60 → T-30 |
| Sauvegardes (P0-3) | 30–45 min | T-30 → T0 (déborde sur T+10/T+15 si nécessaire — **ne jamais compresser la vérification pour tenir l'horaire**) |
| Migrations | 10–25 min | T0 → T+20 |
| Déploiement + contrôles | 30–45 min | T+20 → T+60 |
| Marge de décision/rollback | incluse | T+60 → T+90 |
| Surveillance / clôture | — | T+90 → T+120 |

### 14.2 Repères horaires détaillés

| Repère | Contenu | Gate |
|---|---|---|
| **T-60** | Gel des changements, rôles présents, accès rollback vérifiés (Vercel, PITR, volume DR chiffré monté). **Lancement immédiat de P0-1** (§15). | — |
| **T-45** | **Gate P0-1** : baseline Production conforme, gap réel figé = **53** (valeur canonique : ledger 210 → cible 263 ; noter la valeur observée, ne jamais la supposer). Un seul item KO → **STOP**, fenêtre annulée, rien touché. | GO/STOP |
| **T-30** | Démarrage **P0-3** (§16) : PITR/snapshot, dump chiffré, backup Storage, manifestes. | — |
| **T-15** | Test de restauration exécuté sur base probe jetable ; sentinelles + ACL/RLS de contrôle vérifiés. | — |
| **T0** | **Gate P0-3** + **checklist GO-T0** complète (§17). Un seul item KO → **NO-GO**, aucune migration. Si PASS intégral : démarrage immédiat des migrations (§18). | GO/NO-GO |
| **T+10** | Ledger vérifié = 263, `…000255` et `…000263` présentes, second `migration up` = rien à appliquer. | — |
| **T+20** | pgTAP critique + smoke SQL sentinelles inchangées. **Point de décision migration** : continuer vers déploiement, ou STOP + rollback DB (§13 runbook V1, scénario T0) si ledger incohérent. | GO/ROLLBACK |
| **T+30** | Déploiement app `996be15` via `release/commercialisation-v1` (§19) démarré + premiers contrôles (login, absence 5xx critique, absence boucle de redirection, `/abonnement`, dashboard, chantier, stock, module inclus/non inclus). | — |
| **T+45** | MFA admin 1 + admin 2 (§20), multitenant A/B (§21), Colors/Tools (§22), Stripe TEST (§23). | — |
| **T+60** | **Décision GO/NO-GO globale** (§24/§25). GO → ouverture du service (fin de maintenance active). Un seul critère rollback → §26 engagé immédiatement. | GO/ROLLBACK |
| **T+90** | Si GO : surveillance rapprochée (Sentry, 5xx, login/MFA réels, webhooks Stripe Test, upload/download, RLS). Si rollback engagé : suivi de la procédure §26 en cours. | — |
| **T+120** | Fin de fenêtre officielle : bilan écrit, décision de lever le gel de développement (si GO) ou plan de reprise (si rollback), compte-rendu aux parties prenantes. | — |

Ces repères sont des **cibles d'ordre**, pas des engagements de durée (même principe que le
runbook V1 §12) : si un palier déborde, les paliers suivants glissent d'autant plutôt que de
sauter une vérification.

### 14.3 Rôles et responsabilités

| Rôle | Responsabilité exacte | Autorité de décision |
|---|---|---|
| **A — Opérateur technique principal** | Exécute les commandes techniques : lecture ledger (§15), backups (§16), CLI de migration (§18), déploiement Vercel (§19). Rapporte PASS/FAIL à chaque étape. | Aucune — exécute, ne tranche pas GO/NO-GO seul. |
| **B — Responsable GO/NO-GO** | Tranche à chaque gate (T-45, T0, T+20, T+60) : continuer, STOP, ou déclencher le rollback. Autorité finale pendant toute la fenêtre. | Décisionnelle, seule habilitée à dire GO. |
| **C — Responsable rollback** | Pilote la procédure de rollback (§26) si elle est déclenchée : restauration, redéploiement coordonné, vérifications post-restauration. **Doit être identifié nommément et joignable avant T0**, même s'il s'agit de la même personne que B. | Exécute le rollback une fois déclenché par B. |
| **D — Observateur / vérification métier** | Exécute les smokes fonctionnels (multitenant §21, `/abonnement` R1/R3, Colors/Tools §22, Stripe TEST §23) et rapporte objectivement PASS/FAIL, sans corriger ni décider. | Aucune. |
| **E — Second admin `total` (MFA)** | Porteur d'un accès admin `total` **indépendant** de l'admin principal, disponible/joignable pendant la fenêtre pour prouver l'accès de secours (§20, point 6). N'est pas nécessairement présent en continu. | Aucune. |

**Cumul de rôles** : une seule personne peut porter plusieurs rôles (typiquement A+D, ou B+C sur
une petite équipe) — le document l'autorise explicitement. La seule contrainte non négociable :
**le rôle C (rollback) doit être identifié nommément avant T0**, même cumulé avec B, afin qu'il
n'y ait aucune ambiguïté sur « qui restaure » si l'incident survient pendant que B est occupé à
autre chose.

**Point ouvert à trancher par Julien avant la fenêtre réelle** : le rôle **E** exige un second
porteur humain d'un accès admin `total` indépendant de `julien@elsatia.fr` — le compte technique
`plateforme@invalid.local` n'est **pas** un chemin valable (non connectable, aucune identité
Auth). Si aucun second admin `total` humain n'existe à ce jour, c'est un **prérequis à combler**
avant de fixer la fenêtre, distinct des P0 techniques.

---

## 15. P0-1 — Procédure baseline Production live (à T-60)

Exécutée par **A**, lecture seule, **aucune commande ne doit imprimer de secret** (jeton d'accès,
mot de passe DB, clé API). Commandes de référence : §1 de ce document.

### 15.1 Checklist binaire

- [ ] Ref Supabase Production confirmée = `exhvuzegsefmoguxoiak`
- [ ] Ledger réel lu : `count(*)` et `max(version)` sur `supabase_migrations.schema_migrations`
- [ ] Nombre de migrations compté (attendu **210**, baseline confirmée par lecture directe de
      l'historique git — la lecture Production tranche définitivement)
- [ ] Dernière migration appliquée identifiée (version exacte)
- [ ] Présence/absence de `20260902000255_acl_reconciliation_v1` confirmée (**absente** attendue —
      si présente, le point de non-retour est déjà franchi : STOP, traiter comme un cas hors
      procédure standard, ne pas réappliquer 255)
- [ ] Gap réel vers 263 calculé (`263 − ledger observé`, attendu **53** si le ledger observé
      confirme bien la baseline à 210) et **liste exacte des versions absentes** matérialisée
      (diff avec `supabase/migrations/` @ `996be15`)
- [ ] Confirmer que le ledger réel correspond bien à la baseline attendue de **210** (et non
      l'ancienne hypothèse de 211) — noter la valeur observée, ne pas supposer
- [ ] Sentinelles métier lues (`count` sur entreprises/utilisateurs/clients/chantiers/devis/
      factures) et rapprochées du dernier snapshot DR connu (6/6/31/30/108/73 au 2026-09-02) —
      un écart n'est pas nécessairement un défaut (activité réelle depuis), mais doit être noté
- [ ] Admins plateforme listés (email, rôle, `actif`, `statut_identite`) — au moins un `total`
      actif attendu
- [ ] État MFA des admins vérifié (facteurs TOTP enrôlés/vérifiés) — **sans lire seed/QR/code**
- [ ] Aucune anomalie inattendue détectée (schéma, rôle, extension, table absente du jeu attendu)

### 15.2 Résultat

**Résultat = PASS** uniquement si les 10 cases sont cochées ET le gap est cohérent avec les
migrations `supabase/migrations/*.sql` @ `996be15` (aucune version canonique manquante de la
liste calculée, aucune version inattendue côté Production qui ne serait pas dans l'historique
canonique). Sinon **FAIL**.

**Si FAIL : STOP avant toute migration.** Ne pas passer à T-30. Documenter l'écart et le
soumettre à B avant toute nouvelle tentative de fenêtre.

---

## 16. P0-3 — Procédure de sauvegardes (à T-30)

Exécutée par **A**, supervisée par **B**. Référence détaillée : §4 de ce document, runbook V1
§2–§4.

### 16.1 Checklist binaire

- [ ] PITR/snapshot managé Production déclenché
- [ ] Identifiant du snapshot noté
- [ ] Horodatage UTC noté
- [ ] `pg_dump` chiffré réalisé (format custom, `--compress=9`)
- [ ] SHA-256 du dump calculé
- [ ] SHA-256 **relu** (vérification, pas seulement calculé une fois)
- [ ] Backup Storage réalisé (13 buckets, `verify-storage-backup` PASS)
- [ ] Manifestes DB **et** Storage produits (taille, SHA-256, TOC count)
- [ ] `backup_id` commun (horodatage UTC) attribué aux deux manifestes
- [ ] Test de restauration exécuté sur une **base probe jetable** (jamais Preview/Production)
- [ ] Sentinelles restaurées vérifiées **identiques** à l'état pré-sauvegarde
- [ ] ACL/RLS de contrôle vérifiés cohérents sur la restauration (échantillon minimal : quelques
      tables sensibles + `pg_policies` + RLS activée) — l'inventaire complet §13.4 sert de
      référence de méthode si le temps le permet

### 16.2 Résultat

**Résultat = PASS** uniquement si les 12 cases sont cochées, **y compris la preuve de
restauration**. Sinon **FAIL**.

**Critère non négociable : aucune migration tant que la restauration n'a pas été prouvée.** Un
backup non testé n'est pas un backup valide au sens de ce runbook.

---

## 17. Checklist GO-T0 (avant toute migration)

Évaluée par **B**, avec **A** comme exécutant des vérifications techniques.

- [ ] Baseline Production confirmée (§15, PASS)
- [ ] Gap exact confirmé (liste figée, §15)
- [ ] Backup vérifié (§16, PASS, restauration prouvée)
- [ ] Responsable rollback (**C**) présent et joignable
- [ ] SHA app `996be15c136f09d9977375e700462b503a1720c3` disponible et **promu dans
      `release/commercialisation-v1`**, build Vercel préparé
- [ ] Branche Vercel « Production Branch » correcte (branche canonique de release)
- [ ] Production Branch **≠ `main`** (cf. `NE_PAS_DEPLOYER_MAIN.md`)
- [ ] Variables d'environnement Production validées **par présence de nom uniquement** (cf. §5 —
      jamais les valeurs). Rappel §5.0 : 27 variables sont de type `sensitive` et **ne peuvent pas
      être relues** — ne cocher aucun item sur la foi d'une lecture de valeur
- [ ] `ABONNEMENTS_PUBLICS_OUVERTS = false` (valeur lisible, vérifiée)
- [ ] `ELSATIA_APPLICATION_ENV = production` · `NEXT_PUBLIC_APP_URL = https://app.elsatia.fr`
      (valeurs lisibles)
- [ ] `SUPABASE_PROJECT_REF = exhvuzegsefmoguxoiak` cohérent avec l'hôte de
      `NEXT_PUBLIC_SUPABASE_URL` ; `ELSATIA_SUPABASE_PROJECT_NAME = elsatia-production` (§5.2 —
      variables d'ops, pas des clés applicatives)
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` présente (**seule** clé publique lue ; l'app jette sans
      elle). **Ne pas chercher `NEXT_PUBLIC_SUPABASE_ANON_KEY`** : non consommée au SHA `996be15`
- [ ] Mode webhook = **TEST** (`STRIPE_WEBHOOK_EXPECTED_MODE=test`, valeur lisible)
- [ ] Mode Stripe : **non vérifiable ici** — `STRIPE_SECRET_KEY` est `sensitive`. Confirmation
      reportée au smoke contrôlé de §23 (**P0 pendant fenêtre, item C**). Ne pas afficher la clé
- [ ] Trois flags `sensitive` **réaffirmés explicitement** (pas « vérifiés ») :
      `FEATURE_AI_ENABLED=false`, `FEATURE_AI_DEVIS_ENABLED=false`,
      `FEATURE_RELANCES_AUTO_ENABLED=false` (**P0 pendant fenêtre, item B** — §5.5)
- [ ] Aucun secret manquant parmi les **obligatoires** de la fiche §5 — les absences listées §5.3,
      §5.9, §5.10, §5.11 et §5.12 sont **normales et attendues**, ne pas les traiter comme manquantes
- [ ] Variables Vercel `STRIPE_STATE_ATTESTATION_KEY_ID`/`_PRIVATE_KEY_B64` provisionnées (§3.1
      de `ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md`) — **le registry DB, lui, se remplit
      après T0** (§18bis), pas ici (**P0 pendant fenêtre, item A**)
- [ ] Second admin `total` (**E**) disponible et confirmé joignable
- [ ] Aucun incident Production en cours (monitoring vérifié avant de lancer)

**Un seul item non coché → NO-GO.** Ne pas migrer. Revenir à B pour statuer (reporter la
fenêtre, ou lever le blocage puis réévaluer intégralement la checklist — pas seulement l'item
corrigé).

---

## 18. Application des migrations (T0 → T+20)

Exécutée par **A**, sous supervision de **B**.

1. Appliquer **uniquement** la liste calculée à l'étape 15 (diff canonique − Production réel),
   jamais un jeu de migrations deviné ou approximatif.
2. **Ordre lexical strict** du nom de fichier (= ordre d'application canonique, §2).
3. Utiliser la CLI Supabase officielle (`supabase migration up --linked --include-all`) — le
   flag `--include-all` est **requis** : plusieurs migrations du gap portent un horodatage
   antérieur au `max(version)` déjà présent sur Production (migrations historiques réintégrées
   par la canonicalisation), la CLI les rejette sinon avec une erreur explicite plutôt que d'agir
   silencieusement — comportement confirmé pendant le drill offline (§13.2, `--include-all`
   nécessaire dans l'exact même scénario).
4. Ne **jamais** appliquer une migration hors de cette liste, dans le désordre, ou par édition
   manuelle du ledger.
5. Après chaque lot (ou en une passe si le runbook d'exécution CODEX le prévoit en transaction
   unique), **vérifier que chaque version est bien enregistrée** dans
   `supabase_migrations.schema_migrations`.
6. Vérifier le **ledger final = 263**.
7. Vérifier que `20260902000255_acl_reconciliation_v1` est présente.
8. Vérifier que `20260904000263_stripe_subscription_lifecycle_closure_v1` est présente.
9. Rejouer `supabase migration up` une seconde fois : **doit répondre qu'il n'y a rien à
   appliquer** (`applied: []`). Un résultat non vide = incident (§25).

### Point de non-retour

**`20260902000255_acl_reconciliation_v1`** reste le point de non-retour exact (§3).

- **Avant** cette migration : un rollback applicatif (redéploiement de l'ancien binaire seul)
  suffit.
- **Après** cette migration : le rollback **coordonné DB + app** est **obligatoire** (§26) — un
  rollback app seul ne suffit plus, quelle que soit la migration atteinte au-delà (256–263
  inclus, qui n'ajoutent aucune régression ACL supplémentaire mais ne changent pas ce constat).

### 18bis. Registry Ed25519 (dès `…244`/`…245` confirmées présentes, avant T+45 Stripe TEST)

Provisioning détaillé, formats et commandes exactes : `ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md`.

- [ ] Ledger confirme `20260828000244_stripe_state_attestation_r72` et
      `20260828000245_stripe_discount_observation_r73` présentes.
- [ ] `insert into stripe_attestation.configuration(singleton,environment) values(true,'test')`
      exécuté (connexion privilégiée directe, hors surface PostgREST).
- [ ] `insert into stripe_attestation.public_keys(key_id,environment,public_key,active_from)`
      exécuté avec le couple préparé (§2 du document Ed25519).
- [ ] Correspondance `key_id` ↔ clé publique relue et confirmée identique à celle provisionnée
      dans Vercel (§3.3 du document Ed25519).
- [ ] Fichier local contenant la clé privée supprimé (§3.4 du document Ed25519).

---

## 19. Déploiement application (après DB verte, T+20 → T+30)

Déployer **uniquement** `996be15c136f09d9977375e700462b503a1720c3`, par **promotion de ce commit
dans `release/commercialisation-v1`** (la Production Branch Vercel, inchangée), puis déploiement de
cette release. **Ne pas** reconfigurer la Production Branch sur la branche `feat/…`, **ni** sur
`main`.

**Faisabilité de la promotion — vérifiée le 2026-09-05 :**

```bash
git merge-base --is-ancestor origin/release/commercialisation-v1 996be15   # → vrai
git merge-base origin/release/commercialisation-v1 996be15                 # → fcdd4e7c…
```

`origin/release/commercialisation-v1` (`fcdd4e7c`) est un **ancêtre** de `996be15` : la promotion
est un **fast-forward strict**, sans merge ni réécriture d'historique.

> **Piège vérifié — la branche locale `release/commercialisation-v1` a divergé.** Dans le dépôt de
> travail au 2026-09-05, `release/commercialisation-v1` **local** pointe sur `8fe737e`, qui n'est
> **pas** un descendant de `origin/release/commercialisation-v1` (`fcdd4e7c`) : 3 commits présents
> côté `origin` sont absents en local. Promouvoir depuis cette branche locale sans la
> resynchroniser écraserait l'historique réellement déployé. **À T-60, avant toute promotion :**
>
> ```bash
> git fetch origin
> git rev-parse origin/release/commercialisation-v1   # doit valoir fcdd4e7c… (SHA Production)
> git log --oneline -1 996be15                        # cible
> git merge-base --is-ancestor origin/release/commercialisation-v1 996be15   # doit être vrai
> ```
>
> Puis promouvoir **en fast-forward uniquement** (jamais `--force`).

Vérifications (exécutant **A**, contrôle **D**) :

- [ ] `app.elsatia.fr` répond (pas de 5xx à l'accueil)
- [ ] Login fonctionnel (formulaire + redirection post-login)
- [ ] Aucun 5xx critique sur les routes clés
- [ ] Aucune boucle de redirection (le correctif `c1930ab`, inclus dans `996be15`, couvre le cas compte dépôt sans
      module borne → `/abonnement/module-non-inclus` terminal, cf. mission
      `ELSATIA-POSTLOGIN-MODULE-ROUTING-CLOSURE-V1`)
- [ ] `/abonnement` : statut, offre, capacité X/Y, section Modules rendue
- [ ] `/dashboard` accessible
- [ ] `/chantiers` (ou route chantier équivalente) accessible
- [ ] `/stock` accessible selon habilitation
- [ ] Une route « module inclus » et une route « module non inclus » testées (terminal, pas de
      rebond)

---

## 20. MFA — checklist d'exécution fenêtre (T+45)

> **À EXÉCUTER PENDANT LE CUTOVER (T+45).** Aucun de ces contrôles n'a été exécuté à `996be15` :
> ils exigent la Production réelle (auth, second admin, facteurs TOTP).

Aucun QR, seed ou code n'est **jamais** affiché, transmis, demandé par un outil, ou consigné
dans ce document ou ailleurs. Aucune manipulation manuelle de `auth.mfa_factors`.

**Admin 1 (principal, ex. `julien@elsatia.fr`)**
1. [ ] Login → session **AAL1**
2. [ ] Enrollment TOTP si nécessaire (l'admin scanne son propre QR, hors canal partagé)
3. [ ] Challenge **AAL2** réussi
4. [ ] `/plateforme` accessible en AAL2

**Admin 2 (second admin `total`, rôle E)**
5. [ ] Login **indépendant** (session distincte, pas un partage de session admin 1)
6. [ ] MFA réussi **ou** flux de récupération e-mail Supabase validé
7. [ ] Accès `total` confirmé (mêmes contrôles que l'admin 1)

Un échec sur **l'un ou l'autre** admin déclenche l'examen du critère rollback « MFA total
impossible » (§25) — pas seulement si les deux échouent : le but est de prouver qu'**au moins
un** admin `total` est opérationnel en continu, donc chaque échec doit être compris avant de
poursuivre.

---

## 21. Multitenant — smoke obligatoire (T+45)

> **À EXÉCUTER PENDANT LE CUTOVER (T+45).** Non exécuté à `996be15` : exige deux entreprises
> réelles sur la base Production migrée.

Exécuté par **D**, sur deux entreprises de recette distinctes (A et B) :

- [ ] Entreprise A voit uniquement ses propres clients ; B ne voit rien de A sur les clients
- [ ] Idem chantiers
- [ ] Idem devis/factures
- [ ] Idem documents (Storage)
- [ ] Idem modules (R3 : `modules_entreprises` propre à chaque entreprise)
- [ ] Idem abonnement (R1/R2 : capacité, offre, factures d'abonnement)

**Aucune fuite inter-tenant n'est acceptable, sur aucun des six points.** Un seul point en échec
= critère rollback (§25, « fuite multitenant »).

---

## 22. Colors / Tools — vérifications post-migration (T+45)

> **À EXÉCUTER PENDANT LE CUTOVER (T+45).** Non exécuté à `996be15` : le build Tools est vert
> (§13.5) mais les smokes Colors/Tools exigent la Production migrée et les habilitations réelles.

**Colors**
- [ ] Login avec le compte partagé
- [ ] Contrat multi-app respecté (redirection cohérente)
- [ ] Accès entreprise correct (catalogue d'accès)
- [ ] Callback fonctionnel
- [ ] Seules les données autorisées sont visibles

**Tools**
- [ ] Login
- [ ] Compte partagé fonctionnel
- [ ] Contrat multi-app respecté
- [ ] Callback fonctionnel
- [ ] Accès autorisé conforme au catalogue

**Ne pas ouvrir la facturation Tools** si elle est encore désactivée par décision commerciale —
ce cutover ne change aucune décision commerciale (cf. INTERDIT, §7 de la mission).

---

## 23. Stripe TEST — vérifications post-migration (T+45)

> **À EXÉCUTER PENDANT LE CUTOVER (T+45).** Non exécuté à `996be15` : exige les clés Stripe
> Production (mode TEST) et le webhook réel. **Stripe Live reste hors périmètre.**

Production technique **reste en TEST** pendant tout le cutover (§8).

- [ ] `ABONNEMENTS_PUBLICS_OUVERTS = false`
- [ ] `STRIPE_WEBHOOK_EXPECTED_MODE = test` (valeur lisible, vérifiée par lecture)

**Smoke contrôlé de confirmation du mode `STRIPE_SECRET_KEY` — P0 pendant fenêtre, item C**

`STRIPE_SECRET_KEY` est de type Vercel `sensitive` : son préfixe (`sk_test_` / `sk_live_`) **n'est
pas lisible** (§5.0, §5.6). Le mode se confirme donc **par comportement**, sans jamais afficher ni
journaliser la clé. Deux observations concordantes suffisent :

- [ ] **Observation 1 — objets Stripe renvoyés.** Sur un parcours Checkout de recette (§8), la
      session créée revient avec `livemode = false`. Un `livemode = true` = **STOP immédiat**,
      rollback de la posture Stripe, escalade à **B**.
- [ ] **Observation 2 — attestation.** `environnementAttestationStripe()`
      (`src/lib/stripe-state-attestation.ts`) dérive `test`/`live` du seul préfixe de la clé et
      **jette** sur tout autre format. Une fois le registry Ed25519 rempli (§18bis, configuré en
      `environment = 'test'`), une saga de remise attestée qui aboutit prouve la cohérence
      `clé ↔ registry` : une clé `sk_live_` produirait un `environment = live` et un rejet.
- [ ] Mode conclu = **`test`** sur les deux observations, **concordantes**. Discordance ou doute →
      **NO-GO Stripe**, ne pas poursuivre le §23.
- [ ] **Aucune valeur de clé affichée, copiée, journalisée ou écrite dans ce runbook.**

- [ ] Aucun objet Live détecté (aucune clé `sk_live_`, aucun Price Live câblé)
- [ ] Prices conformes à la grille canonique (`verify:stripe-prices --strict`, 8/8 une fois les
      4 `_ANNUEL` alignés — P1-1)
- [ ] 1 webhook abonnement **TEST** signé traité correctement
- [ ] 1 prévisualisation de capacité (`+1`) fonctionnelle (pas de « Confirmer » hors recette
      dédiée)
- [ ] Aucun secret loggé (clé, secret webhook, JWT)

**Ne pas activer Stripe Live** — hors périmètre de ce cutover (lot P15 distinct).

---

## 24. Critères GO (fenêtre réelle)

GO uniquement si **tous** les points suivants sont vrais à T+60 :

- [ ] Ledger = 263
- [ ] Migrations = PASS (§18)
- [ ] pgTAP critique Production = PASS
- [ ] Login = PASS
- [ ] MFA admin 1 = PASS
- [ ] MFA admin 2 = PASS
- [ ] Multitenant = PASS (§21, les 6 points)
- [ ] `/abonnement` = PASS
- [ ] R1 (capacité personnes actives) = PASS
- [ ] R3 (modules à la carte) = PASS
- [ ] Colors = PASS
- [ ] Tools = PASS
- [ ] Stripe TEST = PASS (§23)
- [ ] Storage = PASS (upload/download privé, isolation A/B, aucun bucket privé public)
- [ ] Aucun 5xx critique
- [ ] Monitoring stable (Sentry, logs Vercel sans alerte)

---

## 25. Critères Rollback (fenêtre réelle)

Rollback immédiat si **un seul** des points suivants survient :

- Migration en échec
- Ledger incohérent (≠ 263 propre, ou collision)
- MFA `total` impossible (aucun admin n'atteint `/plateforme` en AAL2 après login + challenge
  réels)
- Login cassé (5xx généralisés, page blanche persistante)
- Fuite multitenant (un seul des 6 points de §21)
- 5xx critique persistant (non résolu par forward-fix rapide)
- Webhook abonnement critique cassé (mauvais mode, rejet à tort, risque de double-facturation)
- App incompatible avec la DB (erreurs `42501`/fonctions absentes révélant un décalage
  schéma/binaire)
- Corruption de données détectée
- Storage incohérent (référence orpheline, bucket privé exposé)
- Chemin de rollback lui-même indisponible (PITR/snapshot inaccessible, volume DR non monté)

---

## 26. Procédure Rollback (fenêtre réelle)

Pilotée par **C**, déclenchée par **B**.

1. Maintenir la fenêtre de maintenance active (ne pas rouvrir prématurément).
2. Stopper les écritures.
3. Figer l'état de l'incident (captures d'écran, logs, ledger au moment de l'incident).
4. Conserver logs et ledger de l'incident (horodatage, contenu).
5. Restaurer le snapshot/PITR pris à T-30 (stratégie B, runbook V1 §5).
6. Restaurer le Storage si nécessaire (backup validé §16, restauration après la DB).
7. Vérifier les sentinelles (identiques à l'état pré-cutover).
8. Redéployer le frontend correspondant à l'état DB restauré (`fcdd4e7c` pour un retour complet
   pré-cutover).
9. Vérifier Auth (login/session/logout).
10. Vérifier ACL/RLS (cohérentes avec l'état restauré, pas un mélange ancien/nouveau).
11. Vérifier l'isolation multitenant sur l'état restauré.
12. Rouvrir le service **uniquement** sur GO explicite de **B**.

**Interdit, sans exception :**
- Down migrations improvisées.
- `GRANT`/`REVOKE` permissif improvisé en Production sous pression.
- Suppression manuelle de facteurs MFA (`DELETE FROM auth.mfa_factors`).
- Rollback frontend **seul** une fois `…000255` appliquée (cf. §3, §6) — toujours coordonné
  DB + app au-delà de ce point.

---

## 27. Checklist opérateur imprimable

Document séparé, court, format case à cocher / heure / opérateur / résultat / GO-STOP :
`docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_OPERATOR_CHECKLIST_V1.md`. À imprimer ou dupliquer par
fenêtre réelle (une copie par exécution, jamais réutilisée telle quelle d'une fenêtre à l'autre).

---

*Fin — `ELSATIA-PRODUCTION-CUTOVER-PREFLIGHT-FINAL-V1`. Ce document ne vaut pas autorisation de
cutover ; il fige la cible et la checklist. L'exécution reste humaine et explicitement autorisée.*
