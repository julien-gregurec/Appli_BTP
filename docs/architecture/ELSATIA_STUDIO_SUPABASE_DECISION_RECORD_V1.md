# Décision d'architecture — Studio : projet Supabase dédié + échange de jeton signé (B + I1)

| | |
|---|---|
| Statut | **DÉCIDÉE** (propriétaire, Julien) — **non implémentée** |
| Date d'enregistrement | 2026-09-26, train `integration/elsatia-canonical-train-v3` |
| Réponse | `B + I1` (page [`ELSATIA_STUDIO_SUPABASE_OWNER_DECISION_V1.md`](ELSATIA_STUDIO_SUPABASE_OWNER_DECISION_V1.md)) |
| Dossier et preuves | [`ELSATIA_STUDIO_SUPABASE_DECISION_DOSSIER_V1.md`](ELSATIA_STUDIO_SUPABASE_DECISION_DOSSIER_V1.md) |
| POC de référence | [`poc/studio-dedicated-identity-exchange/`](poc/studio-dedicated-identity-exchange/README.md) — jetable, hors build |
| Décision fermée | `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` (tranchée ; l'entrée du manifeste reste tant que l'implémentation n'est pas livrée) |
| Décisions **toujours ouvertes** | `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT`, `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` |

## Décision

1. **B — Dedicated.** Studio dispose d'un projet Supabase qui lui est propre (un pour la
   Preview, un pour la Production). Les données Studio (espaces, médias, rendus, jobs du
   worker) n'ont pas vocation à rester dans le projet partagé GP / Colors / Tools / Réserves.
   La clé `service_role` du web Studio et du worker vidéo ne donne donc plus accès aux données
   de Gestion Pro (dossier §4.1).
2. **I1 — échange de jeton signé.** Le compte ELSATIA reste unique : la plateforme (projet
   partagé) vérifie la session en ligne, relit l'état du compte et le droit Studio, puis émet
   un JWS ES256 de 60 s (`aud = studio`, nonce, `jti`) ; Studio le vérifie (alg épinglé, JWKS,
   nonce, `jti` consommé en base **avant** tout effet), relie le sujet à un utilisateur de son
   propre GoTrue et fait émettre la session **par GoTrue Studio** (aucun JWT forgé).
3. **Révocation obligatoire.** Webhook signé plateforme → Studio (`typ` distinct), bannissement
   + suppression des sessions côté Studio, réconciliation périodique. Sans ce webhook, un
   compte désactivé garde sa session Studio (dossier §5 R1) : le pont ne peut pas partir en
   Production sans lui.

## Ce que le train V3 intègre — et ce qu'il n'intègre pas

| Élément | Dans V3 | Raison |
|---|---|---|
| Dossier de décision, page propriétaire, cette fiche | ✅ | Décision officielle |
| POC `docs/architecture/poc/studio-dedicated-identity-exchange/` | ✅ **sous `docs/`**, non importé | Harnais réutilisable (node:test, sans dépendance) ; 14 tests en mémoire rejoués, 15 exigent deux GoTrue réels |
| Route handoff / JWKS côté plateforme, route d'échange côté Studio | ❌ | POC expérimental, pas prêt pour la Production (le README le dit « jetable ») |
| Tables `studio_identity_links`, `studio_handoff_jti`, `studio_account_entitlements`, RPC `studio_revoke_sessions` | ❌ | Appartiennent au futur projet Studio dédié (`apps/studio/supabase/`), pas au train racine |
| Retrait des migrations Studio de la racine | ❌ | Changement de schéma partagé : à faire dans le lot d'implémentation, avec son propre plan de migration |
| Projets Supabase Studio Preview / Production | ❌ | Action distante (aucune Preview, aucune Production dans cette mission) |

## Conséquences opérationnelles immédiates

- Tant que l'implémentation n'est pas livrée, **Studio reste exclu de la Preview** (décision D3
  du runbook d'exécution V3) : rien ne change dans le périmètre Preview.
- Les 7 suites pgTAP Studio rouges du tronc (« Inscription fermée ») restent une dette connue ;
  elles seront déplacées avec les migrations Studio vers le projet dédié.
- Plan de travail = dossier §8.3 « Si B » : (1) créer les 2 projets ; (2) geler / retirer les
  migrations Studio de la racine et scinder `studio_workspace_foundation.test.sql` ; (3) CI
  double `db reset` ; (4) pont I1 (handoff + JWKS côté plateforme ; échange + 3 tables + RPC
  sessions côté Studio ; webhook + file + réconciliation) ; (5) amender
  `ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` (exception Studio) ; (6) porter le lot post-H dans
  `apps/studio/supabase`. Estimation du dossier : 8,5 à 11,5 jours.
