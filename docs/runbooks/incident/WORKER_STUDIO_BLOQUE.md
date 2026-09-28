# Runbook — Worker Studio bloqué (SEV3)

Preuve locale : drill S12 (Redis) et S13 (worker bloqué / arrêté, base Studio dédiée).

## 1. Détection
- Sonde profonde Studio `GET /api/health` (Bearer `STUDIO_CRON_SECRET`) → `worker_studio = "ko"` :
  `rendus_sans_battement > 0` (rendu en cours sans battement depuis > 60 s : worker bloqué) ou
  `rendus_en_attente_anciens > 0` (file qui ne se vide plus depuis > 10 min : worker arrêté ou Redis KO).
- Sonde du conteneur (`healthcheck.ts`, Redis). Utilisateurs : rendu figé sur un pourcentage.

## 2. Confinement
- Aucun effet sur les autres applications. Worker compromis ou produisant des sorties invalides :
  `studio_guard.set_mode('read_only', …)` (plus de nouvelles demandes ; les chemins système du
  worker restent bornés à leurs tables) ou `'off'` (Studio coupé, 503).
- Arrêter le conteneur worker si nécessaire (les jobs restent en base).

## 3. Diagnostic
- Journaux du worker (événements JSON `render_*`, `dispatch_unavailable`) ; ffmpeg bloqué,
  disque de travail plein (`STUDIO_RENDER_TMP`), Supabase injoignable, Redis KO (`REDIS_INDISPONIBLE.md`).

## 4. Restauration
- Redémarrer le worker. Au prochain dispatch, `studio_render_dispatch` marque chaque rendu sans
  battement **`failed / WORKER_LOST`** avec le message « Le worker a été interrompu. Relancez le
  rendu. » — **jamais de perte silencieuse** — et renvoie les jobs `queued` (re-dispatch sans doublon,
  `jobId` = identifiant du rendu). Le bail (`lease_token`) empêche un worker fantôme de publier.
- Nettoyage : `apps/studio/scripts/storage-reconcile.mjs` et `workers/studio-video/src/reconcile.ts`
  (dry-run d'abord).

## 5. Validation
- Sonde profonde : `worker_studio = "ok"` ; un rendu test aboutit.

## 6. Réouverture
- `studio_guard.set_mode('read_write', …)` si changé. Informer les utilisateurs dont un rendu est
  en `WORKER_LOST` (ils le relancent).
