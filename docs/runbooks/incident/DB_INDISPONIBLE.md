# Runbook — Base de données indisponible (SEV1)

Preuve locale : drill S6 (arrêt de Postgres). Référence DR : `ELSATIA_DISASTER_RECOVERY_RUNBOOK_V2.md` §2.

## 1. Détection
- `GET /api/health` (GP) → **503 `OUTAGE`**, `controles.db = "ko"` (Réserves, Studio : idem sur leur projet).
- Erreurs 5xx généralisées ; webhooks Stripe en 5xx (visible dans le Dashboard Stripe → Webhooks).
- Page statut Supabase / e-mails Supabase.

## 2. Confinement
- **Aucun mode sûr à poser tant que la base ne répond pas** (il vit en base). Les proxys conservent
  le dernier état connu 5 min puis laissent passer : la base, absente, refuse d'elle-même.
- Si Supabase annonce une indisponibilité longue : `STUDIO_ENABLED=false` n'est utile que pour Studio
  (projet distinct). Ne pas redéployer GP pour « couper » : les pages de connexion restent servies.
- **Stripe** : ne rien faire. Les webhooks échoués (5xx) sont rejoués automatiquement par Stripe
  pendant 3 jours (mode live) ; aucun événement n'est accepté à moitié (réservation + reprise des
  orphelines, migration `20260928000702`).
- Statut public : impossible en base → communication manuelle (e-mail / réseaux) si > 15 min.

## 3. Diagnostic
- `SELECT 1` depuis l'éditeur SQL Supabase ; Dashboard → Database → Health (connexions, CPU, disque).
- Saturation de connexions : `select count(*), state from pg_stat_activity group by state;`
- Disque plein / projet en pause / maintenance Supabase ? → ticket support Supabase.
- **Ne pas restaurer** une base qui va revenir seule (arbre de décision DR V2 §2).

## 4. Restauration
- Panne plateforme : attendre Supabase. Saturation : arrêter la source (crons, attaque — voir
  `ATTAQUE_ABUSIVE.md`), puis `pg_terminate_backend` ciblé.
- Perte/corruption avérée → `CORRUPTION_DONNEES.md` puis `POST_RESTAURATION.md`.

## 5. Validation
- `GET /api/health` → 200 `OPERATIONAL` (drill : retour en ~2 s après redémarrage).
- `select * from public.incident_webhooks_stripe_orphelins();` → **0 ligne** (sinon : les
  prochaines livraisons Stripe les reprendront ; au-delà de 3 jours, les renvoyer depuis le Dashboard).
- Dashboard Stripe → Webhooks : les tentatives en échec repassent en succès.
- Studio : sonde profonde `/api/health` (worker) ; les rendus interrompus sont en `failed / WORKER_LOST`
  (visibles, relançables) — jamais silencieux.

## 6. Réouverture
- Automatique au retour de la base. Publier `OPERATIONAL` sur `db` et les applications
  (`plateforme_incident_statut_definir`). Postmortem (DR V2 §10) si > 15 min.
