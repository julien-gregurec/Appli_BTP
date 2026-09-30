# Runbook — Stripe indisponible (SEV2)

Preuve locale : drill S11 (API Stripe simulée en panne), S2/S6/S7 (rejeu, doublons, orphelines).

## 1. Détection
- Sonde profonde `GET /api/health` avec `Authorization: Bearer <CRON_SECRET>` →
  `stripe_configuration = "ko"`, statut `DEGRADED` (la sonde publique n'appelle jamais Stripe).
- status.stripe.com ; échecs de checkout / portail ; erreurs de `synchroniserAbonnementCoordonne`.

## 2. Confinement
- **`paiements`** (portée `global` ou application) : checkout, liens de paiement, portail et
  checkout Tools renvoient 503 ; **les webhooks restent reçus** (aucun événement perdu).
- Ne **jamais** modifier à la main un statut d'abonnement pour « compenser » : l'état Stripe fait foi,
  l'ordre des événements est arbitré en base (`stripe_event_ordering_v1`).
- Statut public `stripe` → `DEGRADED` (« paiements momentanément suspendus, aucun montant prélevé »).

## 3. Diagnostic
- Clés : la sonde refuse une clé `live` hors Production et une clé `test` en Production.
- Webhooks : Dashboard Stripe → Webhooks → tentatives en échec (4 endpoints : Connect, SaaS,
  boutique, Tools — compte séparé). Doublon d'endpoint Test : `ELSATIA_STRIPE_WEBHOOK_ENDPOINTS_RATIONALISATION_V1.md`.

## 4. Restauration
- Attendre Stripe. Les webhooks échoués sont rejoués automatiquement (3 jours en live).

## 5. Validation
- Sonde profonde `stripe_configuration = "ok"`.
- `select * from public.incident_webhooks_stripe_orphelins();` → 0 ligne.
- Un checkout test (Preview) aboutit ; droits cohérents : aucun `entreprises.abonnement_statut`
  modifié hors webhook pendant l'incident (`abonnement_evenements` / `stripe_evenements_ordre`).

## 6. Réouverture
- Lever `paiements`. Statut `stripe` → `OPERATIONAL`.
