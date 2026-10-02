# Procédure — Incident de sécurité (sessions, secrets, jetons, liens, service_role)

Utilisée par `FUITE_SECRET.md`, `CROSS_TENANT.md`, `ATTAQUE_ABUSIVE.md`. **Confiner d'abord** (mode
sûr, sans rien supprimer), **préserver les preuves** (journaux Vercel/Supabase exportés avant
toute rotation qui les ferait tourner), notifier le décideur. Toute fuite de données personnelles
avérée : notification CNIL sous 72 h (DPA, registre RGPD) — décision propriétaire.

## 0. Confinement immédiat (≤ 5 min)
| Besoin | Action | Effet |
|---|---|---|
| Stopper toute écriture | `lecture_seule` **global** | base : toute écriture refusée, **service_role compris** (= chemins service_role suspendus en écriture, sans rotation) |
| Stopper une application | `app_coupee` sur l'application | 503 ; sessions refusées en écriture même en direct |
| Bloquer les liens publics | `liens_publics` **global** | fonctions de jeton refusées en base + pages 503 |
| Bloquer invitations / uploads / exports | contrôles homonymes | voir README |

## 1. Révoquer des sessions
- **Un utilisateur** (compte compromis) — éditeur SQL :
  `delete from auth.sessions where user_id = '<uuid>';` (invalide ses jetons de rafraîchissement ;
  le jeton d'accès en cours expire en ≤ 1 h) puis, si besoin, bannir : Dashboard → Auth → Users → Ban.
  Appareil d'un compte d'entreprise : révocation d'appareil existante (PE-07, `sessions_revoquees`),
  appliquée par la RLS et le proxy à la requête suivante.
- **Tous les utilisateurs** : `delete from auth.sessions;` (tout le monde se reconnecte à l'expiration
  du jeton d'accès). Pour invalider **immédiatement** les jetons d'accès : rotation de la clé de
  signature JWT (§2) — coupe aussi toutes les applications jusqu'à reconnexion.
- **Studio (projet dédié)** : révocation par le pont d'identité (`studio_identity.sessions`,
  cycle de vie) ; en urgence `select studio_guard.set_mode('off', …)`.

## 2. Rotation des secrets
Principe : **créer le nouveau → déployer → vérifier → révoquer l'ancien**. Inventaire et criticité :
`config/env-manifest.json` (`dr_critical`), DR V2 §10.

| Secret | Où tourner | Particularité |
|---|---|---|
| Clé secrète Supabase (`sb_secret_…`, `SUPABASE_SERVICE_ROLE_KEY`) | Dashboard → API keys : nouvelle clé, Vercel (GP, Réserves, Colors), redéploiement, **puis** suppression de l'ancienne | suspend TOUS les chemins service_role (webhooks, crons, RGPD) jusqu'au redéploiement |
| Clé de signature JWT Supabase | Dashboard → JWT signing keys : nouvelle clé en attente → rotation → révocation | invalide toutes les sessions |
| `STRIPE_SECRET_KEY` | Dashboard Stripe → Developers → API keys (roll) | 4 endpoints webhook : `STRIPE_WEBHOOK_*_SECRET` à régénérer endpoint par endpoint |
| `BREVO_API_KEY`, `OPENAI_API_KEY`, `POWENS_CLIENT_SECRET`, Apple/Google | console du fournisseur | `POWENS_CLIENT_SECRET` sert encore de repli HMAC si `BANK_OAUTH_STATE_HMAC_KEY` est absente |
| `CRON_SECRET`, `STUDIO_CRON_SECRET` | Vercel | les crons suivants échouent en 401 jusqu'au redéploiement |
| Clés Studio (`STUDIO_AUTH_SERVICE_KEY`, `STUDIO_STORAGE_SERVICE_KEY`, `STUDIO_REDIS_URL`) | projet Supabase Studio / fournisseur Redis | redémarrer le worker |
| Clés d'identité ELSATIA (JWKS, `ELSATIA_IDENTITY_*`) | procédure de publication JWKS (nouvelle clé publiée avant retrait) | sinon le passage vers Studio échoue |
| `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64` | `ELSATIA_ED25519_ATTESTATION_PROVISIONING_V1.md` | fail-closed par conception |
| `BANK_DATA_ENCRYPTION_KEY` / `BANK_DATA_ENCRYPTION_KEYS` (clés IBAN/BIC) | **jamais par remplacement** : ajout d'une nouvelle clé kN au trousseau, activation, rechiffrement (`npm run bank-keys`) | procédure « compromission de clé » : `docs/qualification/ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1.md` §10 (nouvelle clé, désactivation de l'ancienne, rechiffrement, audit). Remplacer la valeur rend les IBAN illisibles |
| `BANK_OAUTH_STATE_HMAC_KEY` | Vercel | états Powens en cours (7 jours) : garder l'ancienne valeur dans un repli le temps de leur expiration |

Après rotation : `npm run verify:secrets` (dépôt), sonde profonde `/api/health`.

## 3. Désactiver des jetons applicatifs
```sql
-- clés API d'entreprise
update public.cles_api set statut = 'revoque' where entreprise_id = '<uuid>';         -- ou toutes (valeurs : actif | revoque)
-- liens de partage de documents
update public.acces_externes_documents set revoque_le = now() where revoque_le is null; -- (filtrer si ciblé)
-- invitations Réserves en attente
update public.reserves_invitations set revoque_at = now() where consomme_at is null and revoque_at is null;
```
(Ces mises à jour sont
possibles pendant un gel avec `set elsatia.incident_contournement = 'on';`.)

## 4. Bloquer les liens publics
`liens_publics` global (immédiat, réversible) ; puis §3 pour révoquer définitivement les jetons exposés.

## 5. Suspendre les chemins service_role
1. Écritures : `lecture_seule` global (la garde en base refuse aussi service_role).
2. Lectures/écritures : rotation de la clé secrète Supabase (§2) — seul moyen de couper un
   détenteur externe de la clé.
3. Studio : `studio_guard.set_mode('read_only'|'off', …)` ; les chemins système déclarés
   (`studio_guard.system_paths`) restent bornés à leurs tables.

## 6. Validation et réouverture
- Journaux : plus aucune utilisation de l'ancien secret (Supabase logs, Stripe logs).
- `08_verify_rls_functional.sh` (DR) et suites pgTAP d'isolation sur une copie si la RLS est en cause.
- Lever les contrôles un par un (journal d'incident), statut public, postmortem.
