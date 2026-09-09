# ELSATIA — Roadmap post-cutover V1

> Registre des lots **développés, testés, mais volontairement tenus hors du
> cutover Production 263**. Aucun lot listé ici n'est intégré à la cible
> canonique tant que le cutover n'est pas exécuté et stabilisé.
>
> Règle unique : **le ledger de la cible cutover reste figé à 263 migrations.**
> Tout lot qui ajoute une migration attend, quelle que soit sa valeur produit.

Cible cutover figée : `996be15c136f09d9977375e700462b503a1720c3`
(docs sur le socle code `1d15289294434643b5085af3585440ac2d162ddc`), ledger **263**,
dernière migration `20260905000265_essai_30_jours_modules_catalogue_v1.sql`.

Drills DB, rollback et runbooks (`docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md`,
`ELSATIA_PRODUCTION_CUTOVER_OPERATOR_CHECKLIST_V1.md`, `ELSATIA_PRODUCTION_ROLLBACK_V1.md`)
sont établis sur 263 et **ne doivent pas être rejoués sur un autre ledger**
avant cutover.

---

## Lot 1 — ELSATIA-GP-SUPPORT-REPLY-EMAIL-P1-CLOSURE-V1 (migration 264)

**Statut : REPORTÉ POST-CUTOVER — conservé, non mergé.**

### Identification

| | |
|---|---|
| Branche | `feat/gp-support-reply-email-p1-closure-v1` (locale + `origin/`) |
| Commit de tête | `4010179fc221307a0130608ce1ea2c2e4d533d51` — *feat(gp): notify customers of support replies* |
| Commit parent sur la branche | `3285e23` — *feat(gp): close precommercial operations p1 gaps* (lot ELSATIA-GP-PRECOMMERCIAL-OPS-P1-CLOSURE-V1, **sans migration**, aussi porté par `feat/gp-precommercial-ops-p1-closure-v1`) |
| Base | `996be15` (merge-base exacte avec la cible cutover) |
| Ledger induit | 263 → **264** |
| Contenu dans une branche canonique / release | **Non** — voir §Vérifications |

### Contenu reporté

1. **Migration 264** — `supabase/migrations/20260905000266_support_reply_notification_recipient_v1.sql`
   (seul fichier de migration ajouté ; aucune migration existante modifiée ou supprimée).
2. **RPC destinataire support** — `public.plateforme_support_destinataire_reponse(uuid)`,
   `security definer`, `stable`. Gardes identiques à `plateforme_support_repondre` :
   `plateforme_exiger_role('total','support')`, `plateforme_exiger_session_aal2()`,
   `est_acces_support_actif(p_entreprise_id)`. `revoke all` sur `public`, `anon`,
   `service_role` ; `grant execute` à `authenticated` seul. Retour fail-closed :
   une ligne au plus (dernier demandeur côté entreprise, encore membre `actif`,
   adresse `email_confirmed_at` non nulle), sinon aucune ligne → aucun envoi.
3. **E-mail réponse support** — `src/lib/email-support.ts` (pur, échappement HTML
   du contenu opérateur), `src/lib/support-notifications.ts` (envoi Brevo
   best-effort, `replyTo` support, lien `origine officielle + /aide`),
   branchement sur `repondreSupportPlateformeAction`
   (`src/app/actions/support.ts`) après insertion réelle de la réponse.
   Échec Brevo / destinataire absent / session expirée → la réponse reste
   enregistrée ; journalisation par catégorie uniquement.
4. **pgTAP** — `supabase/tests/support_reply_notification_recipient_v1.test.sql`
   (146 lignes, `no_plan()`, fixture `fixtures/isolation_multitenant.inc`).
   **Écrit mais non exécuté contre la base cible** : à jouer avant intégration.

Documentation associée portée par la branche : `docs/operations/MATRICE_EMAILS_V1.md`
(gap n°1) et `docs/commercial/SUPPORT_PREMIERS_CLIENTS.md`.

### Motif du report

P1 utile, **non bloquant** pour la commercialisation : sans lui, le client
découvre la réponse support en se reconnectant à l'espace `/aide`. Le coût du
report est un délai de notification ; le coût de l'intégration serait de
refaire l'intégralité des drills DB, rollback et runbooks sur un ledger 264.

### Validations exigées APRÈS cutover, avant intégration

| # | Validation | Critère de succès |
|---|---|---|
| 1 | **Test DB / pgTAP** | `supabase/tests/support_reply_notification_recipient_v1.test.sql` exécuté sur Fresh 264 **et** sur Restore 263 → 264. Tous les asserts verts. |
| 2 | **Permission plateforme** | `anon` et `service_role` sans `execute` sur `plateforme_support_destinataire_reponse` ; appel sans rôle plateforme → exception ; appel sans AAL2 → exception. |
| 3 | **Cross-tenant** | Session support ouverte sur l'entreprise A → aucun accès au destinataire de l'entreprise B ; session support fermée/expirée → « Session support explicite requise ». Drift ACL global = 0. |
| 4 | **E-mail Brevo TEST** | Envoi réel en environnement TEST : sujet, extrait, référence `SUP-xxxxxxxx`, lien `/aide`, `replyTo` support. Brevo non configuré → aucun envoi, aucune erreur remontée à l'opérateur. |
| 5 | **QA GP** | Parcours opérateur complet : réponse support depuis l'espace plateforme → réponse persistée + e-mail unique. Aucun e-mail sur acquittement de lecture, changement de statut, ou message écrit par le client. |
| 6 | **Ledger** | `verify:migrations` = 264 uniques, `…000265` et `…000266` présentes, 2ᵉ `migration up` vide. Runbooks cutover mis à jour de 263 → 264 **après** intégration, jamais avant. |

### Contraintes de conservation

- Ne pas supprimer la branche `feat/gp-support-reply-email-p1-closure-v1`
  (locale ni distante).
- Ne pas rebaser le lot sur un socle post-cutover sans rejouer §Validations.
- Si `3285e23` (lot précommercial ops P1, sans migration) devait être intégré
  avant le cutover, l'intégrer **depuis `feat/gp-precommercial-ops-p1-closure-v1`**
  et non depuis cette branche, qui porte la migration 264.

---

## Vérifications d'intégrité — 2026-09-05

| Contrôle | Résultat |
|---|---|
| `4010179` contenu dans `main` / `origin/main` | **Non** |
| `4010179` contenu dans `996be15` (cible cutover) | **Non** |
| `4010179` contenu dans un tag / release | **Non** (aucun tag) |
| Branches contenant `4010179` (205 refs balayées) | `feat/gp-support-reply-email-p1-closure-v1` et `origin/feat/gp-support-reply-email-p1-closure-v1` uniquement |
| Migrations `.sql` @ `996be15` | **263** |
| Migrations `.sql` @ `4010179` | **264** |
| Delta migrations `996be15..4010179` | 1 ajout : `20260905000266_support_reply_notification_recipient_v1.sql` — 0 modification, 0 suppression |
| Migrations existantes altérées par le lot | **Aucune** |
| Runbook / checklist / rollback / preflight / drill / ledger modifié par le lot | **Aucun** (0 fichier correspondant dans le diff `996be15..4010179`) |
| Merge / commit / déploiement effectué | **Aucun** |

Non vérifié dans le cadre de ce report : la suite `856/856`, le typecheck, le
lint et le build ne sont pas rejoués ici (aucun checkout de la branche, aucune
exécution) — ces résultats restent ceux rapportés à la clôture du lot.
