# ELSATIA — Runbooks d'incident Production (V1)

Rapport de qualification : `docs/qualification/ELSATIA_PRODUCTION_INCIDENT_RESPONSE_SAFE_MODE_V1.md`.
Complète — sans les remplacer — `ELSATIA_DISASTER_RECOVERY_RUNBOOK_V2.md` (perte de données DB)
et `ELSATIA_PRODUCTION_ROLLBACK_V1.md` (rollback d'un déploiement).

Chaque runbook suit le même plan court : **Détection → Confinement → Diagnostic → Restauration →
Validation → Réouverture**. Règle d'or : **confiner d'abord (mode sûr, sans rien supprimer), comprendre
ensuite, ne jamais restaurer à l'aveugle.**

## Index

| Incident | Runbook | SEV par défaut |
|---|---|---|
| Base de données indisponible | [`DB_INDISPONIBLE.md`](DB_INDISPONIBLE.md) | SEV1 |
| Storage indisponible | [`STORAGE_INDISPONIBLE.md`](STORAGE_INDISPONIBLE.md) | SEV2 |
| Stripe indisponible | [`STRIPE_INDISPONIBLE.md`](STRIPE_INDISPONIBLE.md) | SEV2 |
| E-mail indisponible | [`EMAIL_INDISPONIBLE.md`](EMAIL_INDISPONIBLE.md) | SEV3 |
| Redis indisponible | [`REDIS_INDISPONIBLE.md`](REDIS_INDISPONIBLE.md) | SEV3 (Studio seul) |
| Auth indisponible | [`AUTH_INDISPONIBLE.md`](AUTH_INDISPONIBLE.md) | SEV1 |
| Fuite de secret | [`FUITE_SECRET.md`](FUITE_SECRET.md) | SEV1 |
| Cross-tenant suspecté | [`CROSS_TENANT.md`](CROSS_TENANT.md) | SEV1 (toujours) |
| Migration cassée | [`MIGRATION_CASSEE.md`](MIGRATION_CASSEE.md) | SEV1/2 |
| Corruption de données | [`CORRUPTION_DONNEES.md`](CORRUPTION_DONNEES.md) | SEV1 |
| Worker Studio bloqué | [`WORKER_STUDIO_BLOQUE.md`](WORKER_STUDIO_BLOQUE.md) | SEV3 |
| Attaque abusive | [`ATTAQUE_ABUSIVE.md`](ATTAQUE_ABUSIVE.md) | SEV2 |
| Procédure sécurité (sessions, secrets, jetons, liens, service_role) | [`SECURITE_INCIDENT.md`](SECURITE_INCIDENT.md) | — |
| Ordre post-restauration (DB → réouverture) | [`POST_RESTAURATION.md`](POST_RESTAURATION.md) | — |

Classification SEV : identique à `ELSATIA_DISASTER_RECOVERY_RUNBOOK_V2.md` §1. Décideur : Julien
(propriétaire). Toute restauration, rotation de secret ou coupure globale de plus de 15 min est
notifiée au décideur **avant** exécution, sauf urgence sécurité (confiner d'abord, notifier aussitôt).

## Le mode sûr en une page

Les contrôles vivent **en base** (`public.incident_controles`, migration `20260928000701`) : aucune
variable d'environnement, aucun redéploiement. Propagation ≤ 10 s (cache des proxys) ; la base
applique ses gardes **immédiatement**, quel que soit le chemin (proxy, PostgREST direct, Tools natif,
worker). Rien n'est jamais supprimé.

| Contrôle | Effet | Autorité |
|---|---|---|
| `lecture_seule` | toute écriture refusée (503 `SAFE_MODE_READ_ONLY`), service_role et crons compris ; lecture conservée ; webhooks Stripe renvoyés en 503 → Stripe rejoue | base (toutes les tables) + proxy |
| `app_coupee` | application en 503 (maintenance) ; sessions utilisateur refusées en écriture même en direct ; chemins serveur (webhooks, réconciliation) autorisés | proxy + base |
| `uploads` | dépôts refusés | base (politique RESTRICTIVE `storage.objects`) + routes de dépôt |
| `exports` | exports, PDF, impressions refusés | proxy |
| `paiements` | checkout / liens de paiement / portail refusés ; webhooks toujours reçus | proxy |
| `invitations` | création et acceptation refusées | base (Réserves) + proxy |
| `liens_publics` | résolution des liens de partage refusée | base (fonctions de jeton) + proxy |
| `reconciliation_stripe_requise` (global) | verrou : interdit de lever `lecture_seule`/`app_coupee` globaux tant que Stripe n'est pas réconcilié | base |

Portées : `global`, `gestion_pro`, `reserves`, `tools`, `colors`, `studio`. Les tables partagées
(entreprises, entitlements, abonnements, plateforme…) ne sont gelées que par la portée `global`.

### Basculer

1. **Console** : `/plateforme/incident` (Gestion Pro). Réservé au rôle plateforme **`total`** en
   session **AAL2** ; motif obligatoire (≥ 10 caractères) ; expiration automatique possible.
   Un administrateur client ne peut jamais basculer (refus en base, testé).
2. **Secours sans Auth** (GoTrue en panne, MFA impossible) — éditeur SQL Supabase (rôle `postgres`) :

   ```sql
   select public.incident_basculer_operateur('<prénom.nom>', '<portée>', '<contrôle>', true, '<motif>', '<INC-AAAA-NN>');
   -- lever : même appel avec false
   select * from public.plateforme_incident_controles_lister();   -- (console) état complet
   select * from public.incident_journal order by id desc limit 20; -- audit
   ```

3. **Studio (projet Supabase DÉDIÉ)** — éditeur SQL du projet Studio :

   ```sql
   select studio_guard.set_mode('off' | 'read_only' | 'read_write', '<motif>', '<prénom.nom>');
   select * from studio_guard.control_journal order by id desc limit 20;
   ```

   `STUDIO_ENABLED=false` (Vercel) reste la coupure de dernier recours si la base Studio est
   elle-même injoignable (redéploiement requis).

4. **Réparation manuelle pendant un gel** (opérateur uniquement, éditeur SQL) :
   `set elsatia.incident_contournement = 'on';` puis la correction, puis `reset elsatia.incident_contournement;`.
   Jamais atteignable par l'API (refusé sous le rôle `authenticator`).

### Statut public

`plateforme_incident_statut_definir(service, statut, message, motif)` (console ; rôles `total` ou
`support`, AAL2) — ou en SQL `select public.incident_statut_operateur('<nom>', '<service>', '<statut>', '<message public>', '<motif>');`.
Statuts : `OPERATIONAL`, `DEGRADED`, `READ_ONLY`, `OUTAGE` ; services : `gestion_pro`, `reserves`,
`tools`, `colors`, `studio`, `db`, `auth`, `storage`, `email`, `stripe`, `redis`, `worker_studio`.
Lecture publique : `POST /rest/v1/rpc/incident_etat_public` (drapeaux + messages publics, jamais de motif).

### Santé

| Sonde | Sans authentification | Profonde |
|---|---|---|
| Gestion Pro `GET /api/health` | db, auth, storage (sondes), cohérence e-mail et Stripe (config) | `Authorization: Bearer <CRON_SECRET>` : + appel Brevo et Stripe en lecture |
| Réserves `GET /api/health` | db, auth, storage | — |
| Studio `GET /api/health` | db, auth, storage (projet dédié) | `Bearer <STUDIO_CRON_SECRET>` : + worker (rendus sans battement, file qui vieillit) |
| Worker Studio | `node src/healthcheck.ts` (PING Redis, conteneur) | — |

Réponse : `OPERATIONAL` (200), `DEGRADED` (200, dépendance non critique KO), `READ_ONLY` (200),
`OUTAGE` (503 : base ou Auth KO, ou application coupée). Jamais de message d'erreur, d'URL ni de
secret dans la réponse. Colors partage le projet Supabase de Gestion Pro : sa sonde est celle de GP.

### Drill local

`npm run incident:drill` (root, local uniquement) — rejoue les pannes de ces runbooks sur une pile
jetable et vérifie comportement utilisateur et reprise. Voir le rapport §12.
