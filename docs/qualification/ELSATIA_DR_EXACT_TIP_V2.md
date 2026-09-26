# ELSATIA — Disaster Recovery EXACT-TIP V2

**Verdict : DR EXACT-TIP LOCALLY PROVEN / HOSTED NOT PROVEN**

| | |
|---|---|
| SHA de référence | `842b4b4f20e43b8cd2d5ffa4f4df34e1223424a4` (`origin/claude/funny-bell-eqo1p5`, 2026-09-21) |
| Migrations à ce SHA | **313** (l'ancien audit DR portait sur une baseline à 178) |
| Base testée | PostgreSQL 16 **locale, jetable** (`elsatia_dr_drill`) — jamais Preview/Production |
| RPO_LOCAL | égal à l'âge du dernier `pg_dump` réussi (pas de continu local) |
| RTO_LOCAL | **~3 secondes** (restauration mesurée, 2 runs complets + 1 run de référence) |
| HOSTED_RPO | **NOT_PROVEN** |
| HOSTED_RTO | **NOT_PROVEN** |

Ce rapport documente une reprise complète de l'audit DR sur le train
ELSATIA **actuel** (313 migrations), avec un mécanisme reproductible
(`scripts/dr/`) plutôt qu'un simple constat ponctuel. Aucune action n'a été
exécutée sur Preview ou Production — toutes les preuves ci-dessous
proviennent d'une base PostgreSQL locale jetable, construite depuis les
migrations réelles du dépôt.

---

## 1. Inventaire

Inventaire complet du plan de données à ce SHA (méthode : recherche
exhaustive dans le dépôt, comptages vérifiés par requête directe).

### DB
- `supabase/migrations/` : **313 fichiers**, tous conformes au format
  `YYYYMMDDHHMMSS_description.sql`, horodatages uniques (vérifié par
  `scripts/verify-migrations.mjs`, préexistant).
- 16 migrations "diagnostic_temporaire" (8 paires création/suppression, le
  24/07) : scratch SQL auto-nettoyant poussé via le canal de migration pour
  vérifier une correction en isolation. Ne laisse aucun résidu de schéma,
  mais **signale un contrôle de changement à resserrer** : du SQL ad hoc est
  passé par le pipeline de migration Production à 8 reprises au moins.
- `supabase/production/` : scripts de recette manuels (seed/démo), **hors
  du ledger de migration**, réservés au projet Preview
  (`pgvvpqyjziyapbbkydmc`) par un garde-fou programmatique
  (`scripts/garde-scripts-production.mjs`). Surface opérationnelle notable :
  ces scripts touchent des données de démo hors du chemin migratoire audité.
- `supabase/tests/` : 94 fichiers `*.test.sql` (pgTAP), régression réelle
  sur RLS/isolation multi-tenant/idempotence Stripe.
- RLS : policies présentes dans 117+ fichiers de migration ; 550 policies
  actives au final, 234 tables avec RLS activée (mesuré directement, voir §6).
- Aucune Supabase Edge Function dans le dépôt (`supabase/functions/`
  n'existe pas) : la surface "workers" se limite à Vercel Cron + routes
  Next.js synchrones (voir plus bas).

### Auth
- Client Supabase : `src/lib/supabase/{client,server,admin,keys}.ts`
  (`@supabase/ssr`), clé "publishable" (pas l'ancien JWT anon), clé de
  service isolée dans `admin.ts` avec ACL applicative dédiée
  (`service-role-acl.test.ts`).
- Trigger `on_auth_user_created` (migration `20260710000002`) : provisionne
  `public.utilisateurs` à l'inscription (`security definer`, contourne la
  RLS car pas de session au moment du signup).
- AAL2 (step-up MFA) utilisé comme condition RLS/RPC pour l'escalade
  admin-plateforme (`platform_aal2_role_integrity_v1`,
  `platform_promotion_aal2_hardening_v1`).
- Bypass démo local (`DISABLE_EMAIL_LOGIN`, `ELSATIA_LOCAL_DEMO`) : documenté
  comme explicitement refusé en Production/Preview/Vercel.

### Storage
- 18 buckets distincts créés par migration, dont 12-13 pour Gestion Pro
  (`chantier-documents`, `documents-employes`, `documents-paie`,
  `bulletins-paie`, `factures-fournisseurs`, `fiches-techniques`,
  `notes-frais`, `notes-frais-exports`, `pointage-preuves`, `devis-medias`,
  `messagerie-medias`, `communications-elsatia`, `entreprise-assets`
  public) et les buckets propres aux autres apps du monorepo
  (`colors-seaux`, `studio-originals`/`studio-renders`,
  `reserves-photos`/`reserves-plans`).
- Motif systématique "préparer puis finaliser" pour l'upload (URL signée
  côté client, vérification/rattachement des métadonnées côté serveur).

### Secrets
- Trois fichiers `.env*.example` (canonique, local, preview), tous
  name-only, aucune valeur réelle (vérifié par `scripts/verify-secrets.mjs`).
- `config/env-manifest.json` : registre central de toutes les variables,
  avec un champ dédié `dr_critical`/`dr_note` — **mécanisme déjà existant**
  pour tracer les secrets dont la perte est irrécupérable (voir §10).
- `BANK_DATA_ENCRYPTION_KEY` : clé AES-256-GCM (`src/lib/banking.ts`),
  chiffre les IBAN salariés/fournisseurs. `.env.example` porte déjà
  l'avertissement "ne jamais la changer sans procédure de rotation/
  rechiffrement". Voir §10 pour le plan complet.

### Vercel
- `vercel.json` (racine, région `fra1`) : crons `/api/cron/abonnements`
  (03:15) et `/api/cron/notifications-push` (03:45).
- `apps/reserves/vercel.json` : cron `/api/cron/notifications` (04:30).
- Runbooks existants : `ELSATIA_ENV_MANIFEST_RUNBOOK_V1.md` (registre des
  variables, préflight en mode `report`-only, pas encore `enforce`),
  `ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md` (référence pour PITR/snapshot),
  `ELSATIA_PRODUCTION_ROLLBACK_V1.md`.

### Stripe
- 4 webhooks distincts (Connect, abonnements/SaaS, boutique, Tools —
  compte Stripe séparé). Dédup par `abonnement_evenements.stripe_event_id
  unique` + réservation atomique (`reserver_evenement_abonnement_service`).
  Voir §12 pour la revalidation sur le train actuel.
- `ELSATIA_STRIPE_WEBHOOK_ENDPOINTS_RATIONALISATION_V1.md` : remédiation
  **préparée mais non exécutée** pour un doublon d'endpoint Test.

### Workers / jobs
- Aucune Edge Function, aucune queue. Uniquement Vercel Cron (3 tâches,
  voir "Vercel" ci-dessus) + server actions synchrones.

### Documents / photos / signatures / exports
- Métadonnées en base (`documents_chantier`, `signatures_documents`,
  `reserves_photos`, tables notes de frais/paie), fichiers dans Storage.
  Génération PDF serveur (devis/factures), exports paie/notes de frais.

---

## 2. Fresh DB — reconstruction locale

Base PostgreSQL 16 construite de zéro (`scripts/dr/01_replay_migrations.sh
--fresh`) : les 313 migrations s'appliquent **intégralement** sur un
Postgres local nu, en ~20 secondes.

### Stubs Supabase nécessaires (documentés, cf. `scripts/dr/00_supabase_stubs.sql`)

| Manque | Stub apporté | Fidélité |
|--------|--------------|----------|
| Rôles `anon`/`authenticated`/`service_role`/`authenticator`/`supabase_admin`/`supabase_auth_admin`/`supabase_storage_admin` | Créés avec les mêmes attributs (`nologin`/`bypassrls` pour `service_role`) | Élevée |
| Schéma `auth` + table `auth.users` (id, email, `raw_user_meta_data`, `banned_until`, `deleted_at`, `email_confirmed_at`, ...) | Table minimale portant exactement les colonnes référencées par les 313 migrations | Fonctionnelle pour le DDL/trigger, **pas** pour l'authentification réelle |
| `auth.uid()`, `auth.role()`, `auth.email()`, `auth.jwt()` | Implémentées via `current_setting('request.jwt.claim.*', true)`, exactement le mécanisme que PostgREST positionne en production | Élevée — permet un test RLS **fonctionnel**, pas juste un déploiement de schéma (voir §6) |
| Schéma `storage` + `storage.buckets`/`storage.objects` + `storage.foldername()` | Tables et fonction reproduisant fidèlement le comportement Supabase Storage utilisé par les policies (`bucket_id`, `owner`, `name`, `metadata`, `file_size_limit`, `allowed_mime_types`) | Élevée pour les métadonnées ; **aucun contenu binaire réel** (voir §8) |
| Extension `pgsodium` (Supabase Vault) | Paquet d'extension Postgres factice installé via `00b_install_pgsodium_stub.sh` ; **seule** la primitive réellement utilisée (`pgsodium.crypto_sign_verify_detached`, vérification Ed25519) est réimplémentée, via PL/Python3 + PyNaCl (libsodium) — donc réellement fonctionnelle pour cette primitive, pas un mock muet | Élevée pour cette primitive précise ; le reste de la vraie extension (gestion de clés, Vault) n'est pas reproduit |
| Schéma `extensions` + `pgcrypto`/`pg_trgm` | Créés dans un schéma dédié avec `search_path` ajusté au niveau base, comme le fait la plateforme Supabase (`supabase/config.toml`) | Élevée |

Écart assumé et documenté : `supabase/config.toml` déclare
`major_version = 17` ; l'environnement de ce drill n'avait accès qu'à
PostgreSQL 16 (dépôt APT standard ; le dépôt PGDG et l'image Docker
officielle `supabase/postgres` étaient inaccessibles depuis ce bac à sable
réseau restreint — testé et confirmé, voir historique de session). Aucune
des 313 migrations rejouées ne s'est révélée dépendante d'une fonctionnalité
propre à PostgreSQL 17.

---

## 3. Dataset DR synthétique

`scripts/dr/03_seed_synthetic_dataset.sql` — **aucune donnée réelle**,
généré pour ce drill, couvrant tous les domaines demandés, sur **2 tenants**
(`DR-TENANT-A`, `DR-TENANT-B`) :

| Domaine | Résultat (les deux tenants) |
|---|---|
| Entreprises (tenants) | 2 |
| Utilisateurs (auth.users + profils) | 4 |
| Salariés (employés) | 6 |
| Clients | 6 |
| Chantiers | 6 |
| Devis (+ lignes) | 6 (12 lignes) |
| Factures (+ lignes + paiements) | 4 (4 lignes, 2 paiements) |
| Planning | 8 événements |
| Pointage | 10 pointages |
| Stock (articles/mouvements/fournisseurs/commandes) | 8 articles, 6 mouvements, 2 fournisseurs, 4 commandes |
| Réserves (module dédié, lié au chantier GP via `chantier_gp_id`) | 4 réserves |
| Métadonnées de fichiers | 4 `documents_chantier`, 2 `reserves_photos`, 2 `signatures_documents`, 8 `storage.objects` |

Points techniques rencontrés et documentés dans le script lui-même :
insertion via `auth.users` déclenche `on_auth_user_created` (donc
`public.utilisateurs` existe déjà, complété par `UPDATE` plutôt que par un
second `INSERT`) ; les triggers `verrouiller_devis_accepte` et
`trg_lignes_factures_brouillon_only` interdisent de modifier les lignes
d'un devis/facture déjà émis — le seed crée donc en `brouillon`, ajoute les
lignes, puis fait évoluer le statut ; le module Réserves a ses **propres**
tables `reserves_chantiers`/`reserves_intervenants` (pas une FK directe vers
`chantiers`/`employes`).

**Checksums avant sauvegarde** : voir §4/§6 — un manifeste JSON
(`scripts/dr/04_manifest.sh`) calcule un MD5 agrégé par table (237 tables
public+auth+storage), plus des checksums pour l'ensemble des fonctions (609),
triggers (152) et policies RLS (550) du schéma `public`.

---

## 4. Backup

Mécanisme reproductible : `scripts/dr/05_backup.sh`.

- `pg_dump --format=custom --compress=9`, **sans** `--no-owner`/
  `--no-privileges` (choix délibéré : ces flags effaceraient les `GRANT`
  vers `anon`/`authenticated`/`service_role` qui, combinés aux policies RLS,
  matérialisent l'isolation multi-tenant — la restauration doit être une
  preuve fidèle, pas des données réimportées dans un schéma dégradé).
- `pg_dumpall --roles-only --no-role-passwords` : les rôles cluster ne sont
  **pas** dans un `pg_dump` par base.
- Manifeste de vérification (§ci-dessus).
- Les trois fichiers sont liés par un `backup_id` (horodatage UTC) et un
  `backup_index.json` portant le sha256 de chaque fichier — même principe
  que `ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md` (backup_id reliant DB et
  Storage).
- Aucun secret en dur : le mot de passe vient de `DR_PGPASSWORD`
  (variable d'environnement).

**Mesures (3 runs complets, jeu de données DR)** :

| Run | Taille du dump | Durée `pg_dump` | Durée totale (dump+rôles+manifeste) |
|---|---|---|---|
| 1 | 2 763 653 o | ~1-2 s (estimé, dominé par le manifeste) | 35,52 s |
| 2 | 2 763 864 o | idem | 35,04 s |
| 3 | 2 765 756 o | idem | 34,99 s |

Le temps dominant est le calcul du manifeste de vérification (checksums sur
237 tables, une connexion par table) — le `pg_dump` lui-même est rapide.
**Ces temps ne sont pas représentatifs d'un volume de données de
production.**

---

## 5. Catastrophe (base jetable uniquement)

`scripts/dr/06_restore.sh` : vérifie le sha256 du dump, dépose la base cible
(`drop database`), la recrée vierge, recharge les rôles cluster, puis
`pg_restore`.

**Mesures (2 drills complets indépendants, backup→catastrophe→restore→validation)** :

| Run | Durée restauration (`pg_restore`, hors vérification post) |
|---|---|
| A | 2,69 s |
| B | 2,96 s |
| (run de référence initial) | 2,42 s / 2,72 s / 2,48 s (itérations de mise au point) |

Le drill complet a été exécuté **plus de deux fois** au total au cours de
cette mission (itérations de mise au point du dataset et de l'outillage,
puis deux runs "propres" A et B servant de preuve finale, plus un run final
incluant la vérification RLS fonctionnelle).

---

## 6. Validation (avant/après)

`scripts/dr/07_verify.sh` compare deux manifestes (`04_manifest.sh`) :
comptages de lignes et checksum MD5 **par table** (237 tables), plus
checksums agrégés des fonctions (609), triggers (152), policies RLS (550),
contraintes (1792 dans `public`), et nombre de tables avec RLS activée
(234).

**Résultat des 3 cycles complets exécutés avec l'outil final** :
`aucune divergence` sur les trois runs — zéro perte de données, zéro
altération de fonction/trigger/policy détectée.

### Incident de mise au point (transparence)

Lors du deuxième cycle de test, `07_verify.sh` a signalé une divergence sur
`checksum_triggers` alors qu'aucune table n'était en écart. Root cause :
le calcul du checksum triait les triggers par `(tgname, oid)`, or de
nombreux triggers partagent le même nom sur des tables différentes (ex.
motifs `updated_at`/`role_gestion_*` réutilisés) — l'`oid` change à chaque
restauration (attribué par Postgres), ce qui rendait l'ordre, donc le
checksum agrégé, non déterministe **dans l'outil de vérification lui-même**,
sans rapport avec une vraie perte de données. Corrigé en triant par
`(tgrelid::regclass::text, tgname)` (déterministe, basé sur le contenu réel).
Un correctif équivalent a été appliqué par précaution au checksum des
fonctions (tri par nom + signature d'arguments plutôt que par `oid`). Les
trois cycles de preuve finaux ont tous été exécutés avec l'outil corrigé.
Ceci illustre pourquoi le mécanisme de vérification doit lui-même être
mis à l'épreuve, pas seulement le couple backup/restore.

### Vérification fonctionnelle RLS (`scripts/dr/08_verify_rls_functional.sh`)

Au-delà de la comparaison textuelle des policies, ce script se connecte
**comme le ferait l'application réelle** (rôle `authenticator` → `SET ROLE
authenticated`, GUCs `request.jwt.claim.*` positionnés comme PostgREST le
fait) et vérifie l'**effet** des policies après restauration :

- Un utilisateur du tenant A ne voit que les clients du tenant A (3/3,
  aucune fuite vers le tenant B) — vérifié avant ET après restauration.
- Un utilisateur du tenant B ne voit que les clients du tenant B (3/3).
- Le rôle `anon` (non authentifié) ne voit aucun client.
- Nécessite d'avoir peuplé `permissions_poste` (les policies RESTRICTIVE
  `a_permission(...)` du modèle RBAC filtrent sinon tout accès) — ajouté au
  seed après avoir constaté ce point lors de la mise au point.

Résultat : **isolation multi-tenant fonctionnellement intacte après
restauration**, pas seulement au niveau du texte SQL des policies.

---

## 7. Modes de défaillance (`scripts/dr/09_failure_modes_test.sh`)

8 assertions, toutes conformes :

| Scénario | Résultat |
|---|---|
| Backup tronqué (dump coupé à 2000 octets, sha256 d'origine conservé dans l'index) | ✅ Rejeté avant toute action ("ECHEC INTEGRITE") |
| Mauvais fichier (texte arbitraire, sha256 recalculé pour passer le premier contrôle) | ✅ Rejeté par le contrôle `pg_restore --list` ("fichier invalide") |
| Mauvais mot de passe | ✅ Échec d'authentification PostgreSQL, aucune action destructive |
| Restore sur une base non vide, sans `--force` | ✅ Refusé, message pointant explicitement vers `--force` |
| Restore partiel (dump coupé à 50% du contenu, après un `pg_restore --list` qui réussit car la table des matières est intacte) | ✅ `pg_restore` échoue en cours d'exécution — pas de succès silencieux avec données manquantes |
| Double restauration consécutive avec `--force` | ✅ Idempotent, deuxième run identique au premier, pas de corruption cumulative |

Le script échoue **proprement** dans tous les cas : code de sortie non nul,
message explicite, aucune base laissée dans un état ambigu sans le signaler.

---

## 8. Storage — au-delà de la restauration DB

**Non testé au sens propre** (pas de contenu binaire réel dans ce drill —
uniquement des métadonnées `storage.objects` synthétiques). Procédure exacte
pour Production, à exécuter par un opérateur humain :

1. **Inventaire** : lister les 12-13 buckets Gestion Pro (voir §1) et leur
   politique (`public`/`private`, `file_size_limit`, `allowed_mime_types`).
   `ELSATIA_PRODUCTION_ROLLBACK_V1.md` confirme ce compte (13 buckets, 1
   public).
2. **Export** : pour chaque bucket, lister les objets via l'API Storage
   (`storage.objects` donne les métadonnées ; le contenu binaire doit être
   téléchargé objet par objet — Supabase ne fournit pas d'export en masse
   natif à ce jour côté plateforme, à reconfirmer au moment de l'exécution).
3. **Manifeste d'intégrité** : calculer un SHA-256 par objet téléchargé, le
   comparer au SHA-256 stocké en base quand il existe déjà (ex.
   `signatures_documents.document_sha256`/`signature_sha256`), consigner
   dans un manifeste séparé, lié au `backup_id` de la sauvegarde DB
   correspondante (même principe que §4).
4. **Restauration** : recréer les buckets manquants avec la **même**
   politique (`public`/`private`, limites de taille/MIME), ré-uploader les
   objets, puis recalculer les SHA-256 et comparer au manifeste.
5. **URLs signées** : les URLs signées existantes ne survivent PAS à une
   restauration (elles expirent et sont liées à l'état du projet Supabase
   au moment de leur émission) — l'application doit en régénérer à la
   demande ; ne jamais tenter de restaurer une URL signée elle-même.
6. **Ownership** : `storage.objects.owner` doit être remappé si les
   `auth.users.id` changent entre la source et la cible (ex. restauration
   croisée entre deux projets Supabase) — ce cas n'est pas couvert par ce
   drill (mêmes IDs des deux côtés en local).

**Aucune affirmation n'est faite ici sur une restauration Storage
réellement exécutée et vérifiée en conditions réelles.**

---

## 9. Auth — frontière DB vs Supabase Auth

Ce qui est **dans la base** (donc couvert par le backup/restore §4-§6) :
- `auth.users` (identités, `raw_user_meta_data`, `banned_until`,
  `deleted_at`, `email_confirmed_at`) — la TABLE elle-même est dans le même
  `pg_dump` que le reste, donc restaurée avec les mêmes garanties.
- `public.utilisateurs`/`utilisateurs_entreprises` (profils applicatifs,
  appartenances, statuts) — entièrement applicatif, restauré normalement.
- Les policies RLS et fonctions dépendant de `auth.uid()`/`auth.role()`.

Ce qui **dépend de la plateforme Supabase Auth**, non testé, non restauré
par ce mécanisme :
- Les **hachages de mot de passe réels** (Supabase Auth gère son propre
  hachage, non exposé ni dans `auth.users.encrypted_password` de façon
  portable, ni dans un `pg_dump` applicatif standard sans droits élevés sur
  le schéma `auth` du projet géré).
- Les **hooks d'authentification** (Auth Hooks Supabase, custom claims côté
  plateforme) et les **providers OAuth** configurés côté dashboard Supabase
  (pas en base, pas en migration).
- Les templates d'email (`supabase/templates/{confirm_signup,reset_password}.html`)
  sont dans le dépôt (donc reconstructibles), mais leur **provisionnement**
  dans le projet Supabase est une action dashboard/CLI séparée.
- Le niveau AAL2 (step-up MFA) : l'état d'enrôlement MFA d'un utilisateur
  est côté plateforme Auth, pas dans les tables applicatives.

**Aucune prétention n'est faite que l'authentification complète (identité +
mot de passe + MFA + providers) a été restaurée dans ce drill** — seule la
partie applicative (profils, appartenances, permissions) l'a été.

---

## 10. Secrets

### `BANK_DATA_ENCRYPTION_KEY` (le plus critique — chiffre les IBAN)

- **Sauvegarde hors dépôt** : ne doit jamais être committée (ce n'est déjà
  pas le cas — vérifié, `.env.example` ne porte que le nom de la variable).
  Doit être conservée dans un coffre secret séparé du code et de la base
  (ex. gestionnaire de secrets de l'hébergeur, jamais dans le même
  incident-scope qu'une fuite de base de données).
- **Custody** : accès restreint au(x) décideur(s)/opérateur(s) autorisés à
  déployer en Production ; toute lecture/rotation doit être tracée.
- **Rotation** : `.env.example` porte déjà l'avertissement "ne jamais la
  changer sans procédure de rotation/rechiffrement des IBAN existants" — une
  rotation naïve (changer la variable sans rechiffrer) rend **tous** les
  IBAN existants illisibles de façon permanente. Une procédure de rotation
  doit : (1) déchiffrer avec l'ancienne clé, (2) rechiffrer avec la
  nouvelle, dans une transaction, avant de couper l'accès à l'ancienne clé.
  Cette procédure n'existe pas encore dans le dépôt à ce SHA (à créer,
  hors du périmètre "preuve DB" de cette mission).
- **Recovery** : si la clé est perdue sans copie de secours, les IBAN
  chiffrés existants sont **définitivement irrécupérables** (propriété d'un
  chiffrement symétrique correctement implémenté) — ce n'est pas un scénario
  "restaurable", d'où l'importance de la sauvegarde hors dépôt ci-dessus.
- **Test de disponibilité sans révéler la clé** : un test de disponibilité
  doit vérifier que la clé configurée en Production permet de déchiffrer un
  IBAN de test connu (round-trip chiffrement/déchiffrement) **sans jamais
  logger ni afficher la valeur de la clé elle-même** — seul le résultat
  booléen (succès/échec du round-trip) doit être observable. Un tel test
  n'existe pas encore dans le dépôt à ce SHA (à créer).

### Autres secrets critiques (même principe : hors dépôt, custody restreinte, rotation documentée, test de disponibilité sans révélation)

- `SUPABASE_SERVICE_ROLE_KEY` : contourne toute RLS — sa fuite est
  équivalente à un accès superutilisateur applicatif.
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_*_SECRET` (4 comptes/contextes
  distincts) : leur perte empêche de vérifier l'authenticité des webhooks
  entrants — voir §12.
- `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` (Ed25519) : utilisée pour
  signer les attestations d'état Stripe (`stripe_attestation`, voir §2) —
  sa perte bloque l'émission de nouvelles attestations (le système est
  explicitement "fail-closed" par design, cf. commentaire de la migration
  `20260828000244`).
- `POWENS_CLIENT_SECRET` : utilisé aussi en repli HMAC par
  `secretEtatBancaire()` (`src/lib/banking.ts`) — donc partiellement couplé
  à `BANK_DATA_ENCRYPTION_KEY` dans le flux de paiement bancaire.

### Mécanisme déjà existant à exploiter

`config/env-manifest.json` porte un champ `dr_critical`/`dr_note` et des
codes de contrôle dédiés (`MAN-DR-MINIMUM`, `MAN-DR-*`,
`PF-DR-REGISTRY` — voir `ELSATIA_ENV_MANIFEST_RUNBOOK_V1.md` §2). **Ce
registre ne vérifie aujourd'hui que la présence d'une déclaration
"secret DR-critique", jamais l'existence réelle d'une copie hors site** —
texte exact de la documentation : "le contrôle ne vérifie jamais une copie
hors site". C'est un écart concret à combler (hors périmètre de cette
mission, signalé ici comme recommandation).

---

## 11. Vercel / Config — checklist export/reconstruction

- [ ] **Domains** : lister tous les domaines personnalisés attachés au(x)
      projet(s) Vercel (GP, Réserves, Colors, Studio, Tools) et leur
      configuration DNS/SSL — non versionné, à exporter manuellement depuis
      le dashboard Vercel en cas de reconstruction.
- [ ] **Env vars** : `config/env-manifest.json` est la source de vérité du
      **nom** et de la classification de chaque variable par environnement ;
      les **valeurs** elles-mêmes ne sont ni dans le dépôt ni exportables
      par ce mécanisme — à reconstituer depuis le coffre secret de
      l'organisation, variable par variable, en s'appuyant sur le manifeste
      comme check-list de complétude (`scripts/check-env-manifest.mjs`
      valide déjà la cohérence code↔manifeste↔`.env.example`).
- [ ] **Crons** : `vercel.json` (racine) et `apps/reserves/vercel.json` sont
      versionnés — reconstruction automatique au redéploiement, aucune
      action manuelle nécessaire pour les 3 tâches Cron elles-mêmes.
- [ ] **Deployment config / project settings** (région `fra1`, build
      command, monorepo routing) : `vercel.json` + `next.config.ts`
      versionnés pour l'essentiel ; les réglages purement dashboard
      (intégrations tierces, protections de déploiement, webhooks Vercel
      eux-mêmes) restent à documenter séparément — non couverts par ce
      dépôt.
- [ ] **Préflight** : `scripts/check-env-manifest.mjs` est câblé en mode
      `report`-only dans le hook `prebuild`, **pas** `enforce` — une
      reconstruction de projet Vercel ne serait donc pas bloquée
      automatiquement par une variable manquante/incohérente tant que ce
      mode n'est pas changé (décision explicitement en attente, voir
      `F-PREFLIGHT-ENFORCEMENT` dans `ELSATIA_ENV_MANIFEST_RUNBOOK_V1.md`).

---

## 12. Stripe

### Ce qui doit être reconstruit vs ce qui reste chez Stripe

- **Reste chez Stripe** (aucune action DR nécessaire côté ELSATIA) :
  historique des paiements, clients Stripe, abonnements actifs, factures
  Stripe elles-mêmes — Stripe est la source de vérité pour son propre état.
- **À reconstruire côté ELSATIA** : la table de dédup
  `abonnement_evenements` (dans le `pg_dump`, donc restaurée normalement),
  la configuration des endpoints webhook (4 endpoints, secrets de signature
  distincts — à re-déclarer manuellement dans le dashboard Stripe si le
  projet est recréé, ces secrets ne sont pas dans le dépôt), et
  `stripe_attestation.public_keys` (clés publiques Ed25519, dans le
  `pg_dump`).

### Revalidation de l'idempotence webhook sur le train actuel

Vérifié à ce SHA (313 migrations) :
- `src/app/api/stripe/abonnement/webhook/route.ts` existe toujours.
- La table `abonnement_evenements` (contrainte `stripe_event_id unique`) et
  la fonction `reserver_evenement_abonnement_service` sont toujours
  présentes dans le schéma restauré localement (confirmé par le manifeste
  §6 : 609 fonctions publiques après restauration, identique avant/après).
- `src/app/api/stripe/abonnement/webhook/double-livraison.test.ts` (tests de
  livraison concurrente/dupliquée) est toujours présent dans le dépôt à ce
  SHA.
- La remédiation du doublon d'endpoint Test documentée dans
  `ELSATIA_STRIPE_WEBHOOK_ENDPOINTS_RATIONALISATION_V1.md` reste, à ce SHA,
  **préparée mais non exécutée** (statut inchangé depuis le rapport
  d'origine) — signalé ici pour rappel, hors périmètre de correction de
  cette mission DR.

**Conclusion Stripe** : le mécanisme d'idempotence webhook est structurellement
inchangé et toujours en place sur le train actuel ; aucune régression
détectée. La remédiation de l'endpoint dupliqué reste une action en attente,
indépendante de ce drill DR.

---

## 13. Automation (`scripts/dr/`)

Scripts réutilisables créés, tous avec `--help`, fail-fast (`set -euo
pipefail`), protections de confirmation, et **jamais de cible Production/
Preview par défaut** (`dr_require_local_target` refuse par construction tout
hôte non local et tout nom de base ne commençant pas par
`elsatia_dr_drill`, ou contenant `prod`/`preview`) :

- `00_supabase_stubs.sql`, `00b_install_pgsodium_stub.sh` — stubs plateforme.
- `01_replay_migrations.sh [--fresh]` — reconstruction de schéma.
- `03_seed_synthetic_dataset.sql` — jeu de données DR.
- `04_manifest.sh <fichier>` — comptages + checksums.
- `05_backup.sh [--out-dir DIR]` — sauvegarde reproductible.
- `06_restore.sh <backup-dir> [--force] [--target-db NOM]` — restauration
  avec vérification d'intégrité préalable.
- `07_verify.sh <avant.json> <apres.json>` — diff strict, code de sortie
  non nul sur divergence.
- `08_verify_rls_functional.sh` — preuve fonctionnelle de l'isolation RLS.
- `09_failure_modes_test.sh [backup-dir]` — harnais des 6 scénarios de
  défaillance du §7.

Détails d'usage : `scripts/dr/README.md`.

---

## 14. Runbook incident

Voir `docs/runbooks/ELSATIA_DISASTER_RECOVERY_RUNBOOK_V2.md` : SEV, arbre de
décision, procédures backup/restore/validation/rollback, communications,
RPO/RTO, gabarit de postmortem.

---

## 15. Legal claims — divergence signalée

Recherche de la formulation "sauvegardes automatiques régulières" et
équivalents dans le dépôt :

| Document | Formulation exacte |
|---|---|
| `docs/juridique/cgv.md:59` (Art. 7.3) | "L'Éditeur réalise des sauvegardes régulières des données conformément à sa politique de sécurité." |
| `docs/juridique/rgpd-registre-des-traitements.md:71` | "Sauvegardes automatiques régulières." |
| `docs/juridique/politique-confidentialite.md:76` | "...sauvegardes régulières, journalisation." |
| `docs/juridique/dpa-entreprises-clientes.md:31` | "...sauvegardes..." (parmi les mesures art. 32 RGPD) |

**Divergence constatée** : ces quatre documents affirment sans condition
l'existence de sauvegardes **automatiques et régulières**. Or :

1. Aucun mécanisme de sauvegarde récurrent et automatique n'existe dans ce
   dépôt (pas de cron, pas d'Edge Function, pas de tâche planifiée qui
   déclenche un `pg_dump` ou équivalent) — toutes les procédures de
   sauvegarde documentées (`ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md`,
   `ELSATIA_PRODUCTION_ROLLBACK_V1.md`) sont des **procédures manuelles,
   déclenchées par un opérateur**, à des moments précis (cutover).
2. Le dépôt ne contient **aucune preuve** que le plan Supabase Production
   dispose lui-même d'un mécanisme de sauvegarde automatique confirmé
   (PITR ou snapshot managé) — `ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md`
   traite ce point comme une vérification **non soldée**, à trancher
   explicitement par le décideur avant chaque cutover (ligne ~330 : "PITR
   actif... ou sauvegarde quotidienne seule explicitement acceptée par le
   décideur").
3. Le seul mécanisme systématique constaté est **la sauvegarde managée par
   défaut du plan Supabase lui-même** (si le plan Pro est actif : 1 point de
   restauration/jour, rétention 7 jours) — ce qui, si confirmé actif,
   justifierait partiellement "régulières" mais reste **non vérifié** dans
   ce dépôt, et le mot "automatiques" resterait exact seulement pour CETTE
   couche (la plateforme), jamais pour l'application elle-même qui n'ajoute
   aucune sauvegarde applicative récurrente.

**Recommandation** : soit (a) mettre en place une sauvegarde automatique
récurrente réelle et vérifiable (ex. confirmer/activer PITR Supabase, ou une
tâche planifiée exécutant l'équivalent de `scripts/dr/05_backup.sh` vers un
stockage hors site), soit (b) reformuler les quatre documents juridiques
pour refléter la réalité opérationnelle actuelle (sauvegardes **manuelles**
lors des opérations de maintenance, adossées à la garantie de la plateforme
d'hébergement — à faire confirmer par le fournisseur). Cette mission ne
tranche pas ce choix : elle le signale comme un écart concret entre
l'engagement écrit et le mécanisme observé.

---

## 16. Verdict

### DR EXACT-TIP LOCALLY PROVEN / HOSTED NOT PROVEN

**Ce qui est prouvé** (sur le SHA exact `842b4b4f`, 313 migrations, base
locale jetable, drill exécuté plus de deux fois de bout en bout) :

- Les 313 migrations se rejouent intégralement sur un Postgres nu, avec des
  stubs documentés pour les dépendances plateforme Supabase.
- Un mécanisme de sauvegarde/restauration reproductible (`scripts/dr/`)
  produit un backup vérifiable (sha256, manifeste lié) et restaure sans
  perte : **zéro divergence** sur 237 tables, 609 fonctions, 152 triggers,
  550 policies RLS, 1792 contraintes, sur 3 cycles complets.
- L'isolation RLS multi-tenant survit à la restauration **fonctionnellement**
  (pas seulement textuellement), vérifié par des requêtes exécutées avec le
  rôle et les GUCs que l'application utilise réellement.
- 6 modes de défaillance (dump tronqué, mauvais fichier, mauvais mot de
  passe, restore sur base non vide, restore partiel, double restore)
  échouent tous **proprement**, sans succès silencieux ni corruption
  cumulative.
- Le mécanisme d'idempotence des webhooks Stripe est vérifié structurellement
  intact sur le train actuel.

**Ce qui n'est PAS prouvé** (`HOSTED_RPO = NOT_PROVEN`,
`HOSTED_RTO = NOT_PROVEN`) :

- Qu'un mécanisme de sauvegarde automatique et récurrent existe et
  fonctionne réellement sur le projet Supabase Production (PITR/snapshot
  managé confirmé restaurable) — non vérifiable depuis ce bac à sable, et
  non confirmé dans la documentation existante du dépôt.
- Que la restauration Storage (fichiers binaires réels, 12-13 buckets)
  fonctionne en pratique — seule une procédure exacte est documentée (§8),
  aucune exécution réelle.
- Que l'authentification complète (mots de passe, MFA, providers OAuth) est
  restaurable — seule la partie applicative (profils, permissions) l'est.
- Les temps mesurés (RTO_LOCAL ~3s, backup ~35s) reposent sur un jeu de
  données synthétique minuscule (~100 lignes) et **ne sont pas
  extrapolables** à un volume de données de Production.

**Divergence signalée, non corrigée dans cette mission** : les documents
juridiques (CGV, politique de confidentialité, registre RGPD, DPA)
affirment sans condition des "sauvegardes automatiques régulières" que le
mécanisme technique observé ne garantit pas de façon prouvée (§15).

---

## Annexe — artefacts de preuve

Les manifestes JSON, index de sauvegarde et logs des drills (backup A/B,
restauration A/B, harnais de modes de défaillance) ont été produits dans le
répertoire de travail de cette session et ne sont pas committés (ce sont des
sorties d'exécution, régénérables à volonté via `scripts/dr/`, pas du code).
Toute personne souhaitant re-vérifier ce rapport peut rejouer intégralement
la séquence documentée dans `scripts/dr/README.md` — c'est précisément
l'objet de "mécanisme reproductible" demandé par cette mission.
