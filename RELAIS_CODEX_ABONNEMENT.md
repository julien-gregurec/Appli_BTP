# Relais Codex — Automatiser la facturation de l'abonnement (Stripe Billing)

## État d’exécution — 18 juillet 2026

Le lot logiciel est **terminé, contrôlé et la migration 100 est appliquée dans Supabase**.

- Flux abonnement SaaS séparé de Stripe Connect : client, Checkout, portail et webhook dédiés.
- Carte obligatoire, essai de 30 jours, mensuel/annuel, statuts automatiques et suspension d’accès.
- Portail autonome pour carte, factures et résiliation ; reprise possible depuis l’écran suspendu.
- Part variable intégrée : comptes supplémentaires synchronisés et dépassements d’appareils ajoutés à la facture.
- Page entreprise `/abonnement`, suivi plateforme MRR/ARR, cron nocturne et journal d’événements.
- Migration `20260718000100_abonnement_stripe_billing.sql` appliquée et vérifiée : les trois contrôles renvoient `true`.
- Contrôles : TypeScript, ESLint, **63 tests** et build Next webpack complet de **88 pages** verts.

Les seules étapes restantes sont les réglages externes du compte Stripe/Vercel listés en section 4. L’application laisse la souscription désactivée sans ces secrets et tarifs, sans bloquer les entreprises existantes.

> **But** : rendre 100 % automatique la facturation de l'abonnement que **Liria facture aux entreprises clientes** : souscription à l'inscription, essai 30 jours, prélèvement récurrent, **facture générée et envoyée automatiquement par Stripe**, relances (dunning) automatiques, résiliation/changement de carte en self-service, et statut d'abonnement mis à jour tout seul dans l'app.
>
> Rédigé par l'IA « média/perf/display » pour l'IA « facturation/métier » (Codex). Domaine facturation = Codex. Tout ce qui suit est à réaliser par Codex.

---

## 0. À NE PAS CONFONDRE — les deux facturations de l'app

1. **Entreprise → ses clients** : devis→facture d'un chantier, paiement en ligne via **Stripe Connect** (en-tête `Stripe-Account`). **Déjà fait, NE PAS TOUCHER.** Fichiers : `src/lib/stripe.ts` (Connect), `src/app/api/stripe/webhook/route.ts` (events Connect avec `evenement.account`), `factures/[id]`.
2. **Liria → entreprises clientes** (abonnement SaaS) : **c'est l'objet de ce relais.** Facturation au niveau **plateforme** (compte Stripe de Liria, **SANS** en-tête `Stripe-Account`).

⚠️ Ces deux flux passent par le même compte Stripe mais des logiques différentes. Les events plateforme n'ont **pas** de champ `account`. Garder les deux strictement séparés.

---

## 1. Ce qui existe déjà (à réutiliser, ne pas dupliquer)

### Données
- `entreprises.abonnement_statut` (check : `essai` | `actif` | `suspendu` | `annule`), `abonnement_echeance date`, `abonnement_note text` — migration `20260710000036_plateforme_abonnements.sql`.
- `entreprises.stripe_account_id`, `stripe_onboarding_complete` — **Connect uniquement**, ne pas réutiliser pour l'abonnement.
- `facturation_comptes_mensuelle` (+ `plateforme_snapshot_facturation`, `plateforme_usage_entreprises`) : **calcule déjà** le montant dû/mois par entreprise (base + comptes facturables). Migration `20260713000063`. → sert d'assiette pour la part variable (Phase 2).
- `plateforme_admins`, `est_plateforme_admin()`, `plateforme_entreprises()`, `plateforme_modifier_abonnement(...)`.

### Tarifs (source de vérité applicative)
`src/lib/plateforme.ts` :
- `OFFRES` : `essentiel` (base 59, 2 comptes inclus, +15/compte), `pro` (129, 5, +15), `premium` (249, 10, +12).
- `DUREE_ESSAI_JOURS = 30`, `REDUCTION_ANNUELLE = 0.2` (−20 % en annuel).
- `prixAbonnementMensuel(nbComptes, offre, supplementAppareils)`.
Les IDs de prix Stripe devront **correspondre** à cette grille.

### Stripe & webhook (patterns à réutiliser)
- `verifierSignatureStripe(payload, signature)` dans `src/lib/stripe.ts` — réutilisable (prend le secret en param d'env).
- `createAdminClient()` (`src/lib/supabase/admin.ts`) = service role, **bypass RLS** → le webhook peut écrire directement dans `entreprises`, pas besoin de RPC SECURITY DEFINER pour les writes.
- Table de dédup `stripe_webhook_events` (colonnes `id, event_type, livemode, facture_id` — `facture_id` nullable).
- `src/lib/supabase/proxy.ts` : `PUBLIC_PATHS` et `CHEMINS_SANS_SESSION` (y ajouter le nouvel endpoint webhook).
- Routes retour paiement déjà présentes : `/paiement/succes`, `/paiement/annule` (Connect). Créer les équivalents abonnement.
- Composants déjà là : `AbonnementBanner`, `AbonnementCountdown`, route `/abonnement-suspendu`.

---

## 2. Architecture cible

**Stripe Billing (subscriptions) sur le compte plateforme.** Carte collectée dès l'inscription avec **essai 30 j** (`trial_period_days=30`) → accès immédiat en statut `essai`, prélèvement automatique au jour 30, facture émise + envoyée par Stripe.

### Mapping tarifs → Stripe
- 1 **Product** Stripe par offre (Essentiel / Pro / Premium).
- 2 **Prix** par offre : mensuel + annuel (annuel = mensuel × 12 × 0,8). → **6 prix**, IDs mis en variables d'env.
- **Part variable (Phase 2)** : comptes supplémentaires + dépassement d'appareils. Deux options — recommandé : comptes sup = **quantité** d'un price « compte supplémentaire » par offre (sync depuis l'app à chaque changement de statut de compte) ; dépassement appareils = **invoice item** ajouté sur `invoice.created`. (Postgres ne peut pas appeler l'API Stripe → la synchro se fait **côté app**, jamais depuis un trigger SQL.)

### Statuts : mapping Stripe → `abonnement_statut`
| Stripe subscription.status | `abonnement_statut` |
|---|---|
| `trialing` | `essai` |
| `active` | `actif` |
| `past_due`, `unpaid`, `incomplete` | `suspendu` |
| `canceled`, `incomplete_expired` | `annule` |

`abonnement_echeance = current_period_end`. Essai : `abonnement_essai_fin = trial_end`. Résiliation programmée : `abonnement_annulation_prevue_at = cancel_at`.

---

## 3. Livrables (à coder)

### 3.1 Migration `supabase/migrations/20260718000100_abonnement_stripe_billing.sql`
> ⚠️ Numéro : le dernier appliqué est `...099`. Vérifier qu'aucune migration `...100` n'a été prise entre-temps (`git fetch gh` + `ls supabase/migrations`). L'utilisateur applique **à la main** via le SQL Editor Supabase.

```sql
alter table public.entreprises
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists abonnement_offre text,               -- 'essentiel' | 'pro' | 'premium'
  add column if not exists abonnement_periodicite text check (abonnement_periodicite in ('mensuel','annuel')),
  add column if not exists abonnement_essai_fin date,
  add column if not exists abonnement_annulation_prevue_at timestamptz,
  add column if not exists derniere_facture_stripe_id text,
  add column if not exists derniere_facture_url text,           -- hosted_invoice_url
  add column if not exists derniere_facture_pdf text,           -- invoice_pdf
  add column if not exists derniere_facture_statut text,
  add column if not exists derniere_facture_at timestamptz;

-- Journal des events d'abonnement plateforme (audit)
create table if not exists public.abonnement_evenements(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid references public.entreprises(id) on delete set null,
  stripe_event_id text unique,
  type text not null,
  statut_resultant text,
  payload jsonb,
  created_at timestamptz not null default now()
);
alter table public.abonnement_evenements enable row level security;
-- lecture réservée admin plateforme
create policy abonnement_evenements_admin_select on public.abonnement_evenements
  for select to authenticated using (public.est_plateforme_admin());

-- Étendre plateforme_entreprises() pour renvoyer les nouvelles colonnes (statut Stripe + dernière facture)
-- → recréer la fonction en ajoutant : abonnement_offre, abonnement_periodicite, abonnement_essai_fin,
--   stripe_customer_id, stripe_subscription_id, derniere_facture_url, derniere_facture_statut.

notify pgrst, 'reload schema';
```

### 3.2 `src/lib/stripe-abonnement.ts` (nouveau — séparé du lib Connect)
- `stripeBillingEstConfigure()` : `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_ABONNEMENT_SECRET` + `NEXT_PUBLIC_APP_URL` + au moins les 6 price IDs.
- `PRIX_STRIPE : Record<offre, {mensuel:string; annuel:string}>` lus depuis `process.env.STRIPE_PRICE_*`.
- `creerOuRecupererClientStripe(entreprise)` : crée un **Customer** Stripe (`name`, `email`, `address`, `metadata[entreprise_id]`), persiste `stripe_customer_id`. Idempotent.
- `creerSessionAbonnementStripe({entrepriseId, offre, periodicite, email})` : Checkout `mode=subscription`, `line_items[0][price]=<priceId>`, `subscription_data[trial_period_days]=30`, `subscription_data[metadata][entreprise_id]`, `client_reference_id=entrepriseId`, `customer` (ou `customer_email`), `success_url=${APP}/paiement/abonnement/succes?session_id={CHECKOUT_SESSION_ID}`, `cancel_url=${APP}/paiement/abonnement/annule`, `allow_promotion_codes=true`, `automatic_tax[enabled]=true` (si Stripe Tax activé). `Idempotency-Key` par entreprise+offre+periodicite.
- `creerSessionPortailStripe(customerId, returnUrl)` : `POST /v1/billing_portal/sessions` → self-service (résilier, changer carte/offre, télécharger factures).
- `changerOffreStripe(subscriptionId, nouveauPriceId)` : met à jour l'item avec `proration_behavior=create_prorations` (upgrade/downgrade).
- `reconcilierAbonnementStripe(entrepriseId)` (Phase 2) : recalcule la quantité « comptes supplémentaires » (depuis `plateforme_usage_entreprises`/`facturation_comptes_mensuelle`) et met à jour la quantité de l'item Stripe.
- **Tests** `stripe-abonnement.test.ts` : mapping prix (offre×periodicité→priceId) + mapping statut Stripe→abonnement_statut.

### 3.3 Webhook plateforme `src/app/api/stripe/abonnement/webhook/route.ts` (nouveau, endpoint distinct)
- Secret **séparé** : `STRIPE_WEBHOOK_ABONNEMENT_SECRET` (via `verifierSignatureStripe(brut, sig)` en passant le bon secret — factoriser une variante qui prend le secret en argument, ou dupliquer proprement).
- Dédup via `stripe_webhook_events` (facture_id null) **et/ou** `abonnement_evenements.stripe_event_id`.
- Rejeter les events qui portent un `account` (ceux-là sont Connect → autre endpoint).
- Events à gérer :
  - `checkout.session.completed` (mode subscription) → set `stripe_customer_id`, `stripe_subscription_id`, `abonnement_offre`, `abonnement_periodicite`, statut selon subscription.
  - `customer.subscription.created` / `updated` → statut mappé, `abonnement_echeance=current_period_end`, `abonnement_essai_fin=trial_end`, `abonnement_annulation_prevue_at=cancel_at`.
  - `customer.subscription.deleted` → `abonnement_statut='annule'`.
  - `invoice.paid` → `derniere_facture_*` (id, `hosted_invoice_url`, `invoice_pdf`, statut, at), statut `actif`.
  - `invoice.payment_failed` → statut `suspendu` (laisser le dunning Stripe retenter ; la bascule définitive vient de `subscription.updated`→`past_due/unpaid`).
- Écrire une ligne dans `abonnement_evenements` à chaque event traité.
- Ajouter `/api/stripe/abonnement/webhook` à `PUBLIC_PATHS` **et** `CHEMINS_SANS_SESSION` dans `src/lib/supabase/proxy.ts`.

### 3.4 Souscription à l'inscription (déclencheur)
- Après création de l'entreprise (onboarding), étape « Choix de l'offre » : préremplie depuis la reco du questionnaire (`recommanderOffre`), toggle mensuel/annuel (afficher −20 %).
- Server action → `creerOuRecupererClientStripe` + `creerSessionAbonnementStripe` → `redirect(session.url)`.
- Retour : `src/app/paiement/abonnement/succes/page.tsx` (message + accès) et `.../annule/page.tsx`.
- Câbler un CTA depuis `src/app/onboarding/besoins/page.tsx` (écran de reco déjà présent) vers cette action.
- **Décision produit** : carte obligatoire à l'inscription (essai 30 j puis prélèvement auto) — c'est ce qui rend la conversion automatique. Le confirmer avec Julien avant de figer (alternative : essai sans carte = pas de conversion auto).

### 3.5 Self-service (portail Stripe)
- Page espace entreprise « Mon abonnement » : statut, offre, prochaine échéance, dernière facture (lien `derniere_facture_url`), bouton **« Gérer mon abonnement »** → `creerSessionPortailStripe` → redirect. Le portail Stripe gère résiliation, changement de carte, changement d'offre, historique de factures téléchargeables.

### 3.6 Application de la suspension
- Dans `proxy.ts` : si `abonnement_statut='suspendu'` (ou essai expiré), rediriger vers `/abonnement-suspendu` (sauf routes de paiement/portail/webhook et pages publiques). Vérifier si une règle équivalente existe déjà ; sinon l'ajouter. Réutiliser `AbonnementBanner`/`AbonnementCountdown` pour l'avertissement avant échéance.

### 3.7 Vue admin plateforme
- Étendre `plateforme_entreprises()` + la page plateforme : afficher statut d'abonnement Stripe, offre, périodicité, prochaine échéance, dernière facture (lien), lien vers le Customer Stripe. Indicateur MRR/ARR agrégé (somme des abonnements actifs).

### 3.8 Part variable — Phase 2 (après que le socle tourne)
- `reconcilierAbonnementStripe(entrepriseId)` appelé **côté app** : (a) après chaque `changer_statut_compte_application` (ouverture/fermeture de compte), et (b) en **cron Vercel** nocturne pour rattraper les écarts.
- Comptes supplémentaires = quantité d'un price « compte sup » par offre. Dépassement appareils = `invoice item` ajouté sur `invoice.created` (à partir de la logique de `facturation_depassement_appareils` migration `...090`).

---

## 4. Étapes MANUELLES pour Julien (compte Stripe — nous ne pouvons pas les faire)

À faire dans le dashboard Stripe + Vercel. **Sans ça, rien ne s'encaisse.**

1. **Entité légale qui facture** : ⚠️ **aucune société n'existe encore** — Julien doit en **créer une** (SASU/EURL ou équivalent) avant de pouvoir activer Stripe et émettre des factures. Trancher et créer l'entité d'abord.
2. Renseigner infos société + logo (Stripe → Settings → Business) → apparaissent sur les factures.
3. Activer **l'envoi automatique des factures/reçus par email** (Billing → Invoices/Subscriptions settings).
4. Activer et configurer le **Customer Portal** (autoriser : annuler, changer de carte, changer d'offre, télécharger factures).
5. Créer **3 Products** + **6 Prices** (Essentiel/Pro/Premium × mensuel/annuel ; annuel = −20 %). Copier les 6 price IDs. (+ prices « compte supplémentaire » par offre pour la Phase 2.)
6. Configurer **Stripe Tax / TVA** (ou taux de TVA manuels) selon le régime.
7. **Variables d'env (Vercel)** :
   - `STRIPE_SECRET_KEY` (déjà présent probablement), `NEXT_PUBLIC_APP_URL`
   - `STRIPE_WEBHOOK_ABONNEMENT_SECRET` (signing secret du nouvel endpoint)
   - `STRIPE_PRICE_ESSENTIEL_MENSUEL`, `STRIPE_PRICE_ESSENTIEL_ANNUEL`
   - `STRIPE_PRICE_PRO_MENSUEL`, `STRIPE_PRICE_PRO_ANNUEL`
   - `STRIPE_PRICE_PREMIUM_MENSUEL`, `STRIPE_PRICE_PREMIUM_ANNUEL`
8. Créer le **webhook endpoint** `${NEXT_PUBLIC_APP_URL}/api/stripe/abonnement/webhook`, abonner les events : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.created`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`. Copier le signing secret → `STRIPE_WEBHOOK_ABONNEMENT_SECRET`.
9. Ajouter `CRON_SECRET` dans Vercel. Créer aussi les six prix optionnels `STRIPE_PRICE_COMPTE_SUP_*` pour automatiser la facturation des comptes au-delà de ceux inclus dans chaque offre.
10. **Conformité facture électronique B2B (France)** : les factures d'abonnement à des entreprises FR devront être conformes (Factur-X / plateforme agréée) à l'échéance réglementaire. À traiter en suivi (Stripe + couche Factur-X, ou prestataire type Pennylane/Qonto).

---

## 5. Garde-fous / coordination (IMPORTANT)

- **Avant tout push** : `git fetch gh` puis vérifier `HEAD == gh/main`. L'autre IA pousse du média/perf en parallèle — ne pas écraser.
- **Numéro de migration** : prochain libre `20260718000100_...`. Vérifier qu'il n'est pas déjà pris. Migrations appliquées **manuellement** par Julien (SQL Editor). Fournir le SQL prêt à coller.
- **Accents / SQL** : toujours `LC_ALL=en_US.UTF-8 pbcopy` quand tu donnes du SQL à coller (sinon mojibake `√©`). Vérifier avec `LC_ALL=en_US.UTF-8 pbpaste`.
- **Ne pas toucher** au flux Connect (facturation client) ni à son webhook.
- **Ne pas commit** `.env.audit` (gitignored) ; ne pas y lire les identifiants.
- **Aucune société existante** : l'entité qui facture reste à créer (prérequis de Julien, pas un blocage code).
- Fichiers dupliqués à ignorer (`page 2.tsx`, `factures/page 2.tsx`, `StockMovementForm 2.tsx`).
- **Sécurité webhook** : vérifier la signature avant tout traitement ; dédup obligatoire ; jamais faire confiance au corps sans signature valide.

---

## 6. Ordre de réalisation conseillé

1. Migration 3.1 (donner le SQL à Julien) → appliquée.
2. `stripe-abonnement.ts` + tests (3.2).
3. Webhook plateforme (3.3) + proxy PUBLIC_PATHS.
4. Souscription à l'inscription (3.4) + pages retour.
5. Portail self-service (3.5) + page « Mon abonnement ».
6. Suspension (3.6) + vue admin (3.7).
7. **Puis** part variable Phase 2 (3.8).

Socle = étapes 1→6 : dès qu'elles tournent et que Julien a fait la section 4, **tout l'abonnement de base est automatique** (souscription, essai, prélèvement, facture envoyée, relances, résiliation self-service, statut synchronisé).

---

## 7. État réalisé au 18 juillet 2026

- Socle Stripe Billing livré par la migration 100 et le lot applicatif associé.
- Part variable comptes/appareils livrée.
- Part variable stockage livrée par `20260718000101_facturation_stockage.sql`, appliquée et vérifiée dans Supabase.
- Quotas provisoires : 5 / 25 / 100 Go ; dépassement provisoire : 0,50 € HT / Go / mois.
- Jauge entreprise, alertes à 80 % et dépassement, grille tarifaire et journal des relevés intégrés.
- La facture initiale d’essai est exclue des dépassements ; les lignes Stripe sont idempotentes et séparées du flux Connect.
- Restent externes : validation commerciale des quotas/tarifs et réglages manuels Stripe/Vercel listés en section 4.
