# Runbook — Auth indisponible (SEV1)

Preuve locale : drill S8 (GoTrue gelé).

## 1. Détection
- `GET /api/health` → **503 `OUTAGE`**, `controles.auth = "ko"` (base ok).
- Connexions, MFA, rafraîchissements de session et « mot de passe oublié » en échec.

## 2. Confinement
- **Les sessions déjà ouvertes continuent** tant que leur jeton d'accès est valide (≤ 1 h) : le JWT
  est vérifié par PostgREST sans appeler Auth (prouvé en S8). Ne pas couper l'application pour ça.
- Le rôle plateforme ne peut plus obtenir l'AAL2 : piloter le mode sûr et le statut **en SQL** :
  `select public.incident_basculer_operateur(…)` / `select public.incident_statut_operateur('<nom>','auth','OUTAGE','Connexion momentanément indisponible.','<motif>');`
- Studio (identité par pont ELSATIA) : même symptôme si Auth du projet GP ou Studio est touché.

## 3. Diagnostic
- Page statut Supabase ; `GET <projet>/auth/v1/health`.
- Configuration récente : Site URL / Redirect URLs (`ELSATIA_SUPABASE_AUTH_PREVIEW_URLS_V1.md`),
  hook Auth, fournisseur SMTP d'Auth, rotation de la clé de signature JWT en cours ?

## 4. Restauration
- Panne plateforme : attendre Supabase. Erreur de configuration : revenir à la valeur précédente.
- Clé de signature compromise → `SECURITE_INCIDENT.md` §1–2.

## 5. Validation
- Santé 200 ; connexion + MFA d'un compte interne ; Studio : passage d'identité (`/identity/studio/handoff`).

## 6. Réouverture
- Statut `auth` → `OPERATIONAL`. Si des sessions ont expiré pendant la panne, aucune action : les
  utilisateurs se reconnectent.
