# Runbook — Redis indisponible (SEV3, Studio uniquement)

Redis ne sert qu'au transport BullMQ du worker vidéo Studio (`STUDIO_REDIS_URL`). La limitation
anti-abus des applications est en base (`rate_limits_applicatifs`), pas dans Redis.
Preuve locale : drill S12 (Redis arrêté, vrai `healthcheck.ts`, vrai BullMQ).

## 1. Détection
- Sonde du conteneur worker (`node src/healthcheck.ts`) → code 1, journal
  `{"event":"healthcheck_failed","reason":…}` sans URL ni mot de passe.
- Studio : rendus qui restent « en file » ; sonde profonde Studio `rendus_en_attente_anciens > 0`.

## 2. Confinement
- Aucun : les demandes de rendu restent **en base** (`studio_render_jobs` = `queued` +
  `studio_render_outbox`) ; rien n'est perdu pendant la panne. Optionnel : statut `redis` / `studio` → `DEGRADED`.

## 3. Diagnostic
- Fournisseur Redis (quota, mémoire, TLS, mot de passe tourné ?).

## 4. Restauration
- Rétablir Redis ou pointer `STUDIO_REDIS_URL` vers une nouvelle instance (worker redémarré).
  Une instance neuve et vide suffit : la file est reconstruite depuis la base par `studio_render_dispatch`.

## 5. Validation
- Sonde worker → 0 ; sonde profonde Studio : `rendus_en_attente_anciens = 0` après quelques minutes.
- **Pas de doublon** : le re-dispatch réutilise l'identifiant du job comme `jobId` BullMQ
  (un seul job par rendu, prouvé en S12) et `studio_claim_render` ne réclame qu'un job `queued`.

## 6. Réouverture
- Statut `redis` / `studio` → `OPERATIONAL`.
