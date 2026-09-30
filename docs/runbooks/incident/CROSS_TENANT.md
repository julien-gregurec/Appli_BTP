# Runbook — Accès cross-tenant suspecté (toujours SEV1)

## 1. Détection
- Signalement client (« je vois les données d'une autre entreprise »), alerte support, suite pgTAP
  d'isolation en échec après une migration, anomalie de `journal_activite`.

## 2. Confinement
- Application concernée : **`app_coupee`** (une fuite en LECTURE ne se bloque pas par la lecture
  seule). Doute sur le périmètre : `app_coupee` global.
- `liens_publics` global si des documents partagés peuvent être en cause.
- Révoquer les sessions des comptes impliqués (`SECURITE_INCIDENT.md` §1).
- Préserver les preuves : exporter les journaux API/DB de la fenêtre AVANT toute correction.

## 3. Diagnostic
- Reproduire sur une **copie** (jamais en Production) : `scripts/dr/08_verify_rls_functional.sh`,
  suites `isolation_multitenant_*`, `correctif_isolation_*`, `redteam_v3_*`.
- Dernière migration touchant RLS / fonctions `SECURITY DEFINER` / grants ? (`git log supabase/migrations`).
- Périmètre : quelles entreprises, quelles tables, quelle fenêtre (journaux PostgREST par JWT `sub`).

## 4. Restauration
- Correctif de politique/fonction par migration **additive** (jamais d'édition d'une migration appliquée),
  validée sur copie + pgTAP complet, puis appliquée.

## 5. Validation
- Suites d'isolation vertes ; test manuel à deux comptes de deux entreprises.

## 6. Réouverture
- Lever `app_coupee` / `liens_publics`. Notification des clients concernés et décision CNIL (72 h)
  par le propriétaire ; postmortem obligatoire.
