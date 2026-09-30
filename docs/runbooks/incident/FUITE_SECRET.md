# Runbook — Fuite de secret (SEV1)

## 1. Détection
- Alerte GitHub secret scanning, `npm run verify:secrets` en échec, secret vu dans un journal, un
  ticket, une capture ; usage anormal côté fournisseur (Stripe, Supabase, Brevo).

## 2. Confinement
- Identifier le secret et son pouvoir (tableau `SECURITE_INCIDENT.md` §2).
- Clé **service_role / secrète Supabase** : `lecture_seule` global **immédiatement** (bloque les
  écritures, y compris par cette clé), puis rotation. C'est le cas le plus grave : la clé contourne la RLS.
- Clé Stripe : `paiements` global le temps du roll ; webhooks continuent.
- Secret de webhook : aucun confinement applicatif requis (signature seulement) — régénérer.

## 3. Diagnostic
- Depuis quand ? (historique git, date du journal). Utilisation effective ? (journaux fournisseur,
  `pg_stat_statements`, journaux d'API Supabase par IP).
- Données exposées → `CROSS_TENANT.md` §3 pour le périmètre.

## 4. Restauration
- Rotation selon `SECURITE_INCIDENT.md` §2 (nouveau → déployé → vérifié → ancien révoqué).
- Retirer le secret du dépôt/historique si présent (réécriture d'historique = décision propriétaire ;
  le secret est de toute façon considéré compromis).

## 5. Validation
- Ancien secret refusé par le fournisseur (appel test). Sonde profonde `/api/health` ok.
  `npm run verify:secrets` propre.

## 6. Réouverture
- Lever `lecture_seule` / `paiements`. Postmortem ; si données personnelles exposées : décision
  de notification CNIL (72 h).
