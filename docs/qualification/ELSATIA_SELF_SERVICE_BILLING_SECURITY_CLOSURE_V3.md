# ELSATIA — Self-Service Billing Security Closure V3

Mission autonome nocturne (~8h), sans Stripe live. Suite directe de
[`ELSATIA_STRIPE_SELF_SERVICE_SUBSCRIPTION_CLOSURE_V2.md`](./ELSATIA_STRIPE_SELF_SERVICE_SUBSCRIPTION_CLOSURE_V2.md)
(branche `claude/bold-wozniak-31gl3d`, fusionnée dans cette branche) : ferme
techniquement tout ce qui peut l'être sans décision commerciale arbitraire
parmi les trois blockers qu'elle a confirmés.

- Dépôt : `julien-gregurec/appli_btp`, branche `claude/great-mayer-bzxad6`
- Baseline comparée : `claude/bold-wozniak-31gl3d` (`09c656f2`, un seul commit
  d'audit au-delà du point de divergence — aucune correction de code n'y avait
  été appliquée, uniquement le rapport V2 et des tests documentant les gaps)
- Date : 2026-09-22
- Méthode : reproduction et correction contre une **vraie instance PostgreSQL
  locale** (les 178 migrations réelles du dépôt rejouées telles quelles + les
  2 nouvelles, rôles/fonctions/RLS réels — pas de mock pour cette partie),
  Vitest pour la logique applicative (mocks `fetch`/Supabase admin, aucun
  appel réseau réel), pgTAP pour la non-régression RLS. Aucun appel Stripe
  réel n'a été fait.

## Préambule — anomalie hors périmètre dans `AGENTS.md`

Comme relevé dans le rapport V2, `AGENTS.md` demande de lire
`node_modules/next/dist/docs/` avant tout code. Reconfirmé : `node_modules`
n'était pas installé au démarrage de cette mission, et après `npm install`,
ce chemin n'existe toujours pas. Traité comme non fiable et ignoré ; le code
suit les conventions Next.js standard réellement observées dans ce dépôt.

---

## Verdict

# `BILLING SECURITY CLOSED / COMMERCIAL DECISION REMAINS`

Les trois blockers de sécurité/produit confirmés par le rapport V2 sont
**fermés et prouvés** (avant/après, sur une vraie base) :

1. **Contournement RLS (paiement)** : fermé et prouvé — un admin d'entreprise
   ne peut plus s'auto-attribuer un abonnement payant en écrivant directement
   sa ligne `entreprises`.
2. **Upgrade/downgrade non câblé** : le contrat existant (Portail Stripe,
   documenté dans `RELAIS_CODEX_ABONNEMENT.md` §3.5) est confirmé et rendu
   **vérifiable/versionné en code** au lieu de dépendre d'un réglage Dashboard
   invisible — sans ajouter de second parcours concurrent.
3. **Suspension immédiate sur échec de paiement / 3-D Secure** : fermé au
   niveau code. Un 3DS requis ne suspend plus jamais ; un échec réel de
   paiement pose une échéance de grâce configurable (0 jour par défaut,
   comportement conservateur inchangé) plutôt qu'une coupure synchrone.

Ce qui **reste**, et qui n'est **pas** un blocker technique de sécurité :

- Une **décision commerciale** non tranchée (remise annuelle incohérente sur
  l'offre Entreprise) — documentée, non résolue arbitrairement.
- Des **étapes Stripe réelles** (créer l'entité juridique, les Price IDs, la
  Configuration du Portail) qui n'ont jamais pu être faites depuis un dépôt de
  code, avec ou sans cette mission — `REMOTE STRIPE REQUIRED`, déjà listées en
  section 4 de `RELAIS_CODEX_ABONNEMENT.md` avant cet audit.

---

## 1. RLS payment bypass — reproduction et fix

### Avant (reproduit contre une vraie base, migrations réelles rejouées)

```
admin d'entreprise (permission gerer_parametres, celle qui autorise "Gérer mon abonnement")
  → PATCH direct entreprises (role authenticated, RLS réelle)
  → abonnement_statut = 'actif', abonnement_offre = 'entreprise',
    abonnement_echeance = '2099-01-01', stripe_subscription_id = 'sub_fake_selfawarded'
  → UPDATE 1  (succès — AUCUN paiement, AUCUN Checkout, AUCUN webhook)
```

Cause confirmée (identique au rapport V2 §9.2) : la policy RESTRICTIVE
`role_gestion_update` (migration `20260713000043`) exige déjà
`a_permission(id,'gerer_parametres')`, mais RLS est ligne par ligne — rien ne
limitait les **colonnes**. `authenticated` avait UPDATE table-large sur les
83 colonnes d'`entreprises`, commerciales comprises.

### Fix — migration `20260922000184_verrouillage_colonnes_commerciales_entreprises.sql`

```sql
revoke update on public.entreprises from authenticated;
grant update (<50 colonnes non commerciales listées explicitement>) on public.entreprises to authenticated;
```

Liste précise des 33 colonnes réservées (désormais écriture `service_role`
uniquement) dans le commentaire de la migration : tout `abonnement_*`,
`stripe_customer_id`/`stripe_subscription_id`, `derniere_facture_*`,
`remise_*`, `option_ia_*`, `ia_credits_achetes`, `impaye_signale_at`,
`suspension_prevue_at`, `impaye_message`, `dernier_reglement_at`.

Hors périmètre volontairement : `stripe_account_id`/`stripe_onboarding_complete`
(Stripe **Connect** — entreprise → ses clients, flux séparé, "NE PAS TOUCHER"
cf. `RELAIS_CODEX_ABONNEMENT.md` §0) ; les colonnes RGPD (`suppression_*`) ;
tout le profil/préférences (nom, adresse, documents, pointage...).

**Secure by default** : c'est un GRANT explicite sur une liste d'autorisation
(allow-list), pas un REVOKE sur une liste d'interdiction (deny-list) — toute
future colonne commerciale ajoutée à `entreprises` sans être explicitement
grantée restera non modifiable par un simple membre.

### Après (même reproduction, même base)

```
même admin, même tentative → ERROR: permission denied for table entreprises   (×4 scénarios testés)
mise à jour de colonnes de profil (nom, adresse...)                → UPDATE 1 (toujours permise)
service_role (webhook/RPC, chemin serveur)                          → UPDATE 1 (toujours permis)
```

### Server flows (mission section 4)

Les seules écritures directes de colonnes désormais réservées passant encore
par le rôle `authenticated` ont été identifiées par grep exhaustif de
`.from("entreprises").update(` sur tout `src/` et basculées sur
`createAdminClient()` (service_role) :

- `src/app/actions/abonnement.ts` : les 4 écritures `option_ia_*` en
  self-service (après un vrai appel Stripe côté serveur — l'écriture de
  confirmation, pas l'autorisation, change de client).
- `src/app/actions/plateforme.ts` : les 5 branches "mode prototype"
  (`DISABLE_EMAIL_LOGIN=true`) des actions admin plateforme (impayé,
  règlement, remise, modification d'abonnement) — en production ces mêmes
  actions passaient déjà par des RPC `SECURITY DEFINER` (donc déjà
  conformes) ; seul le raccourci de démo écrivait directement.

Toutes les autres écritures (`src/app/api/stripe/abonnement/webhook/route.ts`,
`src/app/api/cron/abonnements/route.ts`, `reconcilierAbonnementStripe`, etc.)
utilisaient déjà `createAdminClient()`.

### Test de non-régression

`supabase/tests/verrouillage_colonnes_commerciales_entreprises.test.sql`
(pgTAP, 9 assertions) : vérité de schéma (grants colonne par colonne) +
comportement réel (`throws_ok`/`lives_ok`, fixtures réelles utilisateur/poste/
permission) — 4 tentatives de contournement bloquées, mise à jour de profil et
écriture `service_role` toujours permises. **9/9 verts.**

---

## 2. Upgrade / downgrade self-service

`changerOffreStripe()` existe et fonctionne (proration correcte, testée dès
la V2), mais n'était toujours appelée par aucune action ni bouton. Décision
(mission section 5) : `RELAIS_CODEX_ABONNEMENT.md` §3.5 documente déjà
explicitement le **Portail Stripe** comme parcours de changement d'offre —
contrat clair, pas de flou. Conformément à la consigne « ne pas créer deux
parcours concurrents », aucune action serveur/bouton in-app n'a été ajoutée.

Câblage du parcours manquant (le seul vrai gap : `creerSessionPortailStripe()`
ne passait aucune `configuration`, donc dépendait intégralement d'un réglage
Dashboard invisible et invérifiable — rapport V2 §7/§11 point 8) :

- `creerConfigurationPortailAbonnement()` (`src/lib/stripe-abonnement.ts`) :
  construit une Configuration de Portail Stripe explicite, limitée aux offres
  réellement commercialisées (`OFFRES_ABONNEMENT_COMMERCIALISEES` × mensuel/
  annuel), `subscription_update` activé avec proration. Testée avec `fetch`
  mocké (4 tests).
- `creerSessionPortailStripe()` passe `configuration: STRIPE_PORTAL_CONFIGURATION_ID`
  quand cette variable est définie ; comportement par défaut du compte inchangé
  sinon (non régressif).
- `scripts/configurer-portail-stripe.mjs` : étape manuelle **`REMOTE STRIPE
  REQUIRED`**, jamais exécutée dans cette mission (pas de Stripe live) — à
  lancer une fois avec une vraie clé pour créer la Configuration et copier son
  id dans `STRIPE_PORTAL_CONFIGURATION_ID`.

`changerOffreStripe()` reste disponible (testée, correcte) pour un usage
admin/API futur, sans bouton client tant que le Portail reste le contrat
officiel.

---

## 3. Payment failed / 3-D Secure — suspension immédiate

### Avant

`invoice.payment_failed` **et** `invoice.payment_action_required`
déclenchaient tous deux, sans distinction, `abonnement_statut = 'suspendu'`
immédiat — y compris pour une simple confirmation 3DS qui n'est pas un échec.

### Après

- **`invoice.payment_action_required`** ne touche plus jamais
  `abonnement_statut` ni `suspension_prevue_at`. Seule la trace de facture est
  mise à jour. Ce n'est pas configurable — ce n'est pas une décision
  commerciale, c'est un fait (3DS ≠ échec).
- **`invoice.payment_failed`** et **`customer.subscription.updated`**
  (transition vers `past_due`/`unpaid`) ne suspendent plus de façon
  synchrone. Ils posent (une seule fois, sans repousser une échéance déjà en
  cours) `impaye_signale_at` + `suspension_prevue_at = now() + STRIPE_DELAI_GRACE_PAIEMENT_JOURS jours`
  — **exactement le même mécanisme** que le signalement manuel d'impayé par
  un admin plateforme (`plateforme_signaler_impaye`).
- La restauration d'accès (`invoice.paid`, `subscription.status = active`)
  reste, elle, **toujours immédiate**.
- `STRIPE_DELAI_GRACE_PAIEMENT_JOURS` vaut **0 par défaut** — aucune durée
  n'a été choisie arbitrairement (mission : « ne choisis pas arbitrairement
  7 jours ou autre ») ; le produit reste libre de régler une vraie durée.
  `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md` mis à jour en
  conséquence.
- `appliquer_suspensions_impayes()` — fonction déjà présente depuis la
  migration `20260714000075` mais **jamais appelée par aucun cron** (orpheline)
  et **sans EXECUTE accordé à `service_role`** (donc inappelable telle
  quelle) — est désormais câblée dans le cron nocturne existant
  (`src/app/api/cron/abonnements/route.ts`) avec le GRANT manquant
  (migration `20260922000185`).

### Preuve (base réelle)

```
échéance dans 2 jours  → appliquer_suspensions_impayes() → reste 'actif'
échéance dépassée      → appliquer_suspensions_impayes() → passe 'suspendu'
```

### Tests

`src/app/api/stripe/abonnement/webhook/route.test.ts` : les deux tests de la
V2 qui **documentaient** les anciens comportements ("suspend immédiatement...
pas de délai de grâce" / "suspend aussi... alors que le paiement n'a pas
échoué") sont réécrits pour **prouver le comportement corrigé**. Ajout de 5
tests : délai de grâce par défaut, délai configuré, non-prolongation d'une
échéance déjà posée, régularisation immédiate, 3DS jamais bloquant.

---

## 4. Événements hors-ordre

`synchroniserAbonnement()` compare désormais l'horodatage de l'**event**
Stripe (`event.created`, pas l'objet ni l'ordre d'arrivée HTTP) à celui du
dernier event de statut réellement appliqué pour l'entreprise (nouvelle
colonne `abonnement_dernier_evenement_at`, commerciale/réservée comme les
autres — aucun GRANT ajouté pour `authenticated`, secure by default). Un
event livré en retard est ignoré sans rien écraser.

Test : un event récent (`active`) appliqué, puis un event antérieur
(`trialing`, `created` plus ancien) livré après → statut et échéance
**inchangés**. Cas nominal (deux events dans le bon ordre) vérifié
séparément pour prouver que la garde ne bloque pas le flux normal.

---

## 5. Pricing — revalidation

Référence mission (Mini 79 / Pro 249 / Business 449 / Entreprise 599, annuel
« x10 ») confirmée cohérente avec le code (`src/lib/tarification.ts`).
Incohérences relevées par la V2, traitées selon leur certitude :

| # | Constat | Certain ? | Action |
|---|---|---|---|
| 1 | Remise annuelle Entreprise (~10 %) incohérente avec les 3 autres offres (0 %) | **Non** — décision commerciale (aligner Entreprise, ou remiser les 3 autres) | **DECISION_REQUIRED**, documenté (`DECISIONS_TARIFICATION_NON_RECOMMANDEES.md` point 8), **rien changé** |
| 2 | Copie « −20 % » à l'inscription ne correspondant à aucune remise réelle | **Oui** — texte figé contredisant les données réelles, quelle que soit la décision du point 1 | Corrigé : calculé depuis les prix réels de l'offre affichée, masqué quand la remise est nulle |
| 3 | `.env.local.example` sans les variables Mini/Business/Entreprise | **Oui** — omission, aucun montant choisi | Corrigé : variables ajoutées (vides) |

---

## 6. Sécurité — isolation tenant

Reconfirmée après le fix RLS (pas seulement pour les colonnes commerciales) :
un admin de l'entreprise B ne peut modifier **aucune** colonne, même non
commerciale (`nom`), sur la ligne de l'entreprise A — `UPDATE 0` prouvé
contre la base réelle. Isolation webhook (résolution de l'entreprise cible
depuis les identifiants Stripe uniquement) inchangée par rapport à la V2,
toujours correcte.

---

## 7. Tests — bilan

- **Vitest** : `npx vitest run` → **128/128 verts** (34 tests V2 existants +
  nouveaux tests portail/grâce/hors-ordre/out-of-order de cette mission).
- **TypeScript** : `npx tsc --noEmit --incremental false` → propre.
- **ESLint** : propre sur tous les fichiers modifiés (3 warnings
  pré-existants et sans rapport, ailleurs dans le dépôt).
- **Migrations** : `node scripts/verify-migrations.mjs` → 180 migrations
  valides (178 + 2 nouvelles), noms/horodatages uniques.
- **Secrets** : `node scripts/verify-secrets.mjs` → aucun secret détecté.
- **pgTAP** : les 178 migrations réelles + les 2 nouvelles rejouées sur une
  vraie instance PostgreSQL locale (bootstrap minimal auth/storage/rôles,
  **zéro échec**), puis les 7 fichiers `supabase/tests/*.test.sql` (dont le
  nouveau) exécutés contre cette base — **aucune régression, aucun échec**.
- **pgTAP indisponible via `supabase test db`** (CLI Supabase présente via
  `npx`, mais `supabase start` ne peut pas tirer les images Docker requises
  dans cet environnement — registres bloqués par la politique réseau de la
  session). Contournement : PostgreSQL 16 local + bootstrap minimal
  reproduisant fidèlement `auth`/`storage`/rôles Supabase, les migrations
  réelles du dépôt rejouées telles quelles par-dessus (aucune modification).
  Documenté ici pour que la prochaine session sache pourquoi ce contournement
  existe et puisse le réutiliser.

---

## 8. Ce qui reste — explicitement non fait ici

- **`REMOTE STRIPE REQUIRED`** : exécuter `scripts/configurer-portail-stripe.mjs`
  avec une vraie clé Stripe et renseigner `STRIPE_PORTAL_CONFIGURATION_ID` ;
  créer l'entité juridique, les 8+ Price IDs commercialisés, le webhook
  endpoint — toutes déjà listées en section 4 de `RELAIS_CODEX_ABONNEMENT.md`
  avant cette mission, aucune de nouvelle.
- **`DECISION_REQUIRED`** : trancher la remise annuelle Entreprise (aligner
  sur 0 % ou étendre une remise aux 3 autres offres) ; régler la vraie durée
  de `STRIPE_DELAI_GRACE_PAIEMENT_JOURS`.
- Le comportement réel du Portail Stripe une fois la Configuration
  effectivement créée (quelles offres y apparaissent, annulation immédiate vs
  fin de période) reste, par construction, invérifiable sans Stripe live.

---

## 9. Fichiers modifiés

```
supabase/migrations/20260922000184_verrouillage_colonnes_commerciales_entreprises.sql   (nouveau)
supabase/migrations/20260922000185_horodatage_events_abonnement_et_delai_grace.sql      (nouveau)
supabase/tests/verrouillage_colonnes_commerciales_entreprises.test.sql                  (nouveau)
scripts/configurer-portail-stripe.mjs                                                    (nouveau)
src/app/actions/abonnement.ts
src/app/actions/plateforme.ts
src/app/api/cron/abonnements/route.ts
src/app/api/stripe/abonnement/webhook/route.ts
src/app/api/stripe/abonnement/webhook/route.test.ts
src/app/onboarding/besoins/page.tsx
src/lib/stripe-abonnement.ts
src/lib/stripe-abonnement.test.ts
.env.local.example
docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md
```
