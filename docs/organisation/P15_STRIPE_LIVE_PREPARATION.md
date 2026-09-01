# P15 — Préparation Stripe Live / KYC (sans activation)

**Statut à la rédaction (22-08-2026) : Stripe reste en mode Test. Aucune clé `sk_live_`, aucun produit/price/webhook Live n'existe. Ce document audite et prépare — il n'active rien.**

Ce document complète (sans le remplacer) `STRIPE_LIVE_CHECKLIST.md` (P13), qui reste la référence pour l'ordre exact de bascule Test → Live. P15 apporte : l'audit à jour du compte Stripe réel, le mapping app↔Stripe complet, l'état exact des variables Vercel par environnement, et les checklists KYC/sécurité/dépendances administratives.

## 1. Compte Stripe existant — à conserver

- Compte : `acct_1TtrTU0bT5C0WG2a`, nom interne `environnement de test Liria Gestion Pro TEST`, pays FR, devise EUR, type `standard`.
- **Un seul compte, aucun doublon détecté.** Ce compte doit être conservé tel quel pour la bascule Live (pas de recréation de compte).
- `business_profile.url` pointe encore vers `https://liria-concept-gestion-btp.vercel.app/dashboard` — artefact de l'ancien nom de projet, à corriger avant Live (Dashboard → Paramètres → Profil public → `https://elsatia.fr`).
- `charges_enabled: false`, `payouts_enabled: false`, `details_submitted: false` — confirme qu'aucun KYC n'a été soumis, cohérent avec l'état attendu.

## 2. Email du compte

Le compte est actuellement configuré avec l'adresse email personnelle du dirigeant. Cible future documentée : `julien@elsatia.fr`, une fois la messagerie professionnelle disponible (dépend de la finalisation DNS/légal). **Non modifié pendant ce lot** — un changement d'email sur un compte Stripe peut déclencher une revérification de sécurité ; à faire volontairement, hors urgence, avec Stripe support si nécessaire.

## 3. Sécurité du compte — checklist avant Live

L'API Stripe ne permet pas d'auditer par programme le statut 2FA, les utilisateurs/équipe ou les sessions actives d'un compte — ce sont des réglages Dashboard uniquement, à vérifier manuellement :

- [ ] 2FA activée sur le compte (à vérifier manuellement — Dashboard → Paramètres → Sécurité)
- [ ] Email professionnel `julien@elsatia.fr` en place
- [ ] Aucun utilisateur/collaborateur Stripe non identifié
- [ ] Méthode de récupération de compte à jour
- [ ] Aucune clé API restreinte oubliée (`stripe keys list` types, sans afficher les valeurs)
- [ ] Secrets (clé secrète, webhook secrets) exclusivement dans Vercel, jamais committés ni affichés

## 4. Produits & Prices Test actuels (inventaire réel, 22-08-2026)

| Produit | Product ID Test | Metadata |
|---|---|---|
| ELSATIA — Mini | `prod_UzhUfX443vTnMP` | `elsatia_environment=PRODUCTION_APP_TEST_MODE`, `offer=mini` |
| ELSATIA — Pro | `prod_UzhU6YZNVoRzLy` | `offer=pro` |
| ELSATIA — Business | `prod_UzhUMvOzeBMjpa` | `offer=business` |
| ELSATIA — Entreprise | `prod_UzhUMHsFALjHj3` | `offer=entreprise` |

Prices actifs correspondants (utilisés réellement par l'app Production, confirmés par les variables Vercel §7) :

| Offre | Price mensuel Test | Price annuel Test | Mensuel | Annuel |
|---|---|---|---|---|
| Mini | `price_1Tzi6A0bT5C0WG2aAv1cX5d0` | `price_1Tzi6O0bT5C0WG2amx0tF8rw` | 79,00 € | 948,00 € |
| Pro | `price_1Tzi6j0bT5C0WG2aThjdFLlT` | `price_1Tzi6q0bT5C0WG2aN4CT3i0N` | 249,00 € | 2 988,00 € |
| Business | `price_1Tzi6u0bT5C0WG2aECItemQO` | `price_1Tzi6y0bT5C0WG2aVr2mQB3Q` | 449,00 € | 5 388,00 € |
| Entreprise | `price_1Tzi710bT5C0WG2avUpZ3q0o` | `price_1Tzi750bT5C0WG2a89nRQ4Mb` | 599,00 € | 6 468,00 € |

Cohérence confirmée avec `src/lib/tarification.ts` (source de vérité applicative) et avec le Checkout réel observé pendant le smoke test (Mini annuel affiché à 948,00 €).

Autres objets Test présents dans le compte, **hors périmètre app Production** :
- 3 produits `ELSATIA PREVIEW TEST — Compte supplémentaire {Administratif|Chef d'équipe|Terrain}` (utilisés par Preview uniquement, cf. §7).
- 1 produit `myproduct` et 1 price USD orphelins (créés par `stripe fixtures`/CLI lors d'essais antérieurs, sans lien avec l'app) — à nettoyer un jour pour la propreté du compte, sans urgence, hors périmètre P15 (préparation uniquement, aucune suppression exécutée).
- Grille `TARIFS-V2` (prefix `elsatia_tarifs_v2_*`, metadata `environnement=test-preview`) : 8 prices supplémentaires liés aux mêmes 4 produits, apparemment une itération tarifaire de test non branchée à l'app actuelle (aucune variable d'environnement ne les référence). À clarifier avec Julien avant Live : grille active ou expérimentation abandonnée.
- 5 coupons Test (`Recette Pro -50€/3mois`, `Recette Mini -10% permanent`, 3 coupons `TARIFS-V2`) — aucun n'est utilisé par du code (les coupons sont créés dynamiquement par `creerCouponRemise` pour des gestes commerciaux ponctuels ; ceux listés ici sont manuels/historiques).

## 5. Tarifs mensuels — confirmés

Mini 79 €, Pro 249 €, Business 449 €, Entreprise 599 € HT/mois — cohérents entre `tarification.ts`, Stripe Test, et la page `/tarifs`.

## 6. Tarifs annuels — confirmés

Mini 948 €, Pro 2 988 €, Business 5 388 €, Entreprise 6 468 € HT/an. Logique observée : annuel ≈ 12× mensuel, sans remise supplémentaire (pas de `duration`/coupon appliqué par défaut sur ces 8 prices — remise annuelle nulle, cohérent avec l'absence de logique de remise dans `calculerTarifAbonnement`).

## 7. Mapping application ↔ Stripe

### Mapping Test actuel (Production app, mode Test)

| Offre App | Product Test | Price mensuel Test | Price annuel Test | Variable env | État |
|---|---|---|---|---|---|
| Mini | `prod_UzhUfX443vTnMP` | `price_1Tzi6A0...` | `price_1Tzi6O0...` | `STRIPE_PRICE_MINI_MENSUEL` / `_ANNUEL` | Actif, testé (smoke test 22-08-2026) |
| Pro | `prod_UzhU6YZNVoRzLy` | `price_1Tzi6j0...` | `price_1Tzi6q0...` | `STRIPE_PRICE_PRO_MENSUEL` / `_ANNUEL` | Actif |
| Business | `prod_UzhUMvOzeBMjpa` | `price_1Tzi6u0...` | `price_1Tzi6y0...` | `STRIPE_PRICE_BUSINESS_MENSUEL` / `_ANNUEL` | Actif |
| Entreprise | `prod_UzhUMHsFALjHj3` | `price_1Tzi710...` | `price_1Tzi750...` | `STRIPE_PRICE_ENTREPRISE_MENSUEL` / `_ANNUEL` | Actif |
| Compte sup. Mini/Pro/Business/Entreprise (lu par `reconcilierAbonnementStripe`) | — | — | — | `STRIPE_PRICE_COMPTE_SUP_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` | **Absent partout, Preview ET Production** — corrigé le 23-08-2026, voir §10bis ci-dessous |

### Mapping Live futur (à créer, aucun ID existant)

| Offre App | Product Live prévu | Price mensuel Live | Price annuel Live | Variable env future | État |
|---|---|---|---|---|---|
| Mini | À CRÉER EN LIVE | À CRÉER EN LIVE | À CRÉER EN LIVE | `STRIPE_PRICE_MINI_MENSUEL` / `_ANNUEL` (Production, valeur Live) | À CRÉER EN LIVE |
| Pro | À CRÉER EN LIVE | À CRÉER EN LIVE | À CRÉER EN LIVE | idem | À CRÉER EN LIVE |
| Business | À CRÉER EN LIVE | À CRÉER EN LIVE | À CRÉER EN LIVE | idem | À CRÉER EN LIVE |
| Entreprise | À CRÉER EN LIVE | À CRÉER EN LIVE | À CRÉER EN LIVE | idem | À CRÉER EN LIVE |
| Comptes supplémentaires par offre (Mini/Pro/Business/Entreprise) | À CRÉER EN LIVE | À CRÉER EN LIVE | À CRÉER EN LIVE | `STRIPE_PRICE_COMPTE_SUP_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` | À CRÉER, y compris côté Stripe Test (aucun objet Stripe ni variable n'existe nulle part pour ce mécanisme précis) |

> **Constat hors périmètre Live, mais actif dès aujourd'hui — CORRIGÉ le 23-08-2026** : `reconcilierAbonnementStripe` (`src/lib/stripe-abonnement.ts:297-320`) tourne quotidiennement en Production (cron `15 3 * * *`, `src/app/api/cron/abonnements/route.ts`) et à chaque activation de compte employé. La cause exacte, initialement mal identifiée dans ce document (une confusion avec les 6 variables `STRIPE_PRICE_COMPTE_SUP_{ADMINISTRATIF,CHEF_EQUIPE,TERRAIN}_{ANNUEL,MENSUEL}` présentes en Preview, qui correspondent en réalité à un tout autre mécanisme — `OPTIONS_TARIFAIRES` dans `tarification.ts` — jamais câblé à aucun appel Stripe dans le code actuel), a été corrigée après vérification croisée avec une autre session de travail : le code lit en réalité `VARIABLES_PRIX_COMPTE_SUP` (`stripe-abonnement.ts:62-69`), soit les variables `STRIPE_PRICE_COMPTE_SUP_{ESSENTIEL,PRO,PREMIUM,MINI,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` — **aucune de ces variables n'existe, ni en Preview ni en Production**, et aucun objet Price Stripe correspondant n'a été identifié dans le compte Test non plus. Faute de ces variables, la fonction échoue silencieusement (`prix_supplement_absent`) sans jamais facturer les comptes ajoutés au-delà du quota inclus (`comptesInclus`), lequel n'est lui-même vérifié nulle part en amont. **Aucune limite n'est donc appliquée à la création de comptes, et aucun dépassement n'est facturé, dans aucun environnement.** Traité dans le lot dédié `COMPTES-SUPPLEMENTAIRES-V1` (hors périmètre P15, qui reste audit/préparation uniquement).

## 8. Séparation Preview / Production, Test / Live

- **Preview** (`elsatia-preview`, Vercel) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_ABONNEMENT_SECRET` et les 10 `STRIPE_PRICE_*` (offres) + 6 `STRIPE_PRICE_COMPTE_SUP_{ADMINISTRATIF,CHEF_EQUIPE,TERRAIN}_*` — ces 6 dernières ne sont lues par aucun code actuel (cf. §7bis), probablement un résidu d'une itération antérieure du mécanisme de compte supplémentaire. Toutes en environnement Vercel "Preview" uniquement, toutes Test. Webhook dédié `we_1Tziay0...` pointant vers l'URL de déploiement Preview.
- **Production** (`elsatia-production`, Vercel) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_ABONNEMENT_SECRET`, 10 `STRIPE_PRICE_*` — en environnement "Production" uniquement, actuellement Test (confirmé par le smoke test 22-08-2026 : Checkout affichant "Environnement de test"). **Ni Preview ni Production n'ont les variables `STRIPE_PRICE_COMPTE_SUP_{MINI,PRO,BUSINESS,ENTREPRISE}_*` réellement lues par `reconcilierAbonnementStripe`** (cf. §7).
- Aucune variable Production ne contient de valeur Live (`sk_live_`, `price_live_...` n'existent pas dans le compte). Aucun mélange Test/Live possible tant que ces valeurs n'existent pas.
- Le code ne fait aucune validation runtime du mode (Test vs Live) des clés/Prices utilisés — l'isolation repose entièrement sur la séparation des variables d'environnement par déploiement Vercel, pas sur une vérification applicative. C'est suffisant tant que la discipline de configuration Vercel est respectée, mais aucun garde-fou automatique n'empêcherait de coller par erreur un Price Live dans Preview ou l'inverse.

## 9. Webhooks Test — audit

| Endpoint | URL | Événements | Statut |
|---|---|---|---|
| `we_1U3GlV0bT5C0WG2aLLQVbGY6` | `https://app.elsatia.fr/api/stripe/abonnement/webhook` | `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`, `invoice.created`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required` | `enabled` |
| `we_1Tziay0bT5C0WG2a4Ib2ncwB` | `https://elsatia-preview-julien-gregurec-julien-gregurec1.vercel.app/api/stripe/abonnement/webhook?x-vercel-protection-bypass=...` | mêmes 8 événements | `enabled` |

Les 8 événements souscrits correspondent exactement à ceux traités par `src/app/api/stripe/abonnement/webhook/route.ts` (vérifié dans le code) — aucun événement inutile, aucun événement utilisé manquant.

**Point de sécurité identifié pendant cet audit** : l'URL du webhook Preview contient en clair le secret Vercel *Protection Bypass for Automation* (`x-vercel-protection-bypass=...`) — nécessaire pour que Stripe atteigne un déploiement protégé par SSO Vercel, mais ce type de secret ne devrait pas transiter dans une query string stockée côté tiers (visible dans le Dashboard Stripe, potentiellement dans des logs/referrers). Recommandation : régénérer ce secret Vercel et reconfigurer le webhook Preview pour le transmettre autrement (Vercel supporte une exclusion de route pour les webhooks, ou un header dédié plutôt qu'un paramètre d'URL). Aucune action corrective effectuée dans ce lot (hors périmètre, pas un blocage Live).

Signature (`verifierSignatureStripe`, `src/lib/stripe.ts:55-68`) : HMAC-SHA256 conforme à l'algorithme Stripe, comparaison `timingSafeEqual`, tolérance de rejeu de 300s sur l'horodatage. Idempotence applicative : `abonnement_evenements.stripe_event_id` en contrainte unique, code Postgres `23505` intercepté pour renvoyer `{received:true, duplicate:true}` sans retraitement (`route.ts:171`).

## 10. Webhook Live futur — procédure (à exécuter uniquement lors de l'activation)

1. Dashboard Stripe (mode Live) → Développeurs → Webhooks → Ajouter un endpoint.
2. URL : `https://app.elsatia.fr/api/stripe/abonnement/webhook`.
3. Sélectionner exactement les 8 événements listés en §9 (aucun de plus).
4. Récupérer le signing secret généré (`whsec_...`, affiché une seule fois par Stripe).
5. Saisir ce secret dans Vercel Production → `STRIPE_WEBHOOK_ABONNEMENT_SECRET` (remplace la valeur Test, jamais le même secret).
6. Redéployer Production.
7. Envoyer un événement de test depuis le Dashboard Stripe Live (`Envoyer un événement de test`).
8. Vérifier en base que `abonnement_evenements` reçoit bien l'événement et que la signature est acceptée (pas de 400).
9. Vérifier l'absence de doublon en renvoyant deux fois le même événement de test (idempotence).

## 11. Checkout — audit du code réel

`creerSessionAbonnementStripe` (`src/lib/stripe-abonnement.ts:187-221`) :
- `mode: subscription`, `payment_method_collection: always` (carte obligatoire dès l'essai, cohérent avec le message UI "Carte enregistrée... sans débit pendant l'essai").
- `client_reference_id` + `metadata[entreprise_id]` + `subscription_data[metadata][entreprise_id/offre/periodicite]` — présents systématiquement, permettent la résolution `entreprisePour()` côté webhook même sans passer par `client_reference_id`.
- `success_url`/`cancel_url` construits depuis `NEXT_PUBLIC_APP_URL` — pas d'URL en dur.
- `subscription_data[trial_period_days]` = `DUREE_ESSAI_JOURS` (30, `src/lib/plateforme.ts`).
- `allow_promotion_codes: true` — un client peut saisir un code promo Stripe au Checkout.
- `automatic_tax[enabled]` conditionné à `STRIPE_AUTOMATIC_TAX_ENABLED === "true"` (actuellement `false` partout, cf. §14).
- Idempotency-Key systématique sur chaque appel Stripe (`abonnement-checkout-{entrepriseId}-{offre}-{periodicite}`, etc.) — protège contre les doubles clics/doubles soumissions réseau.

Aucune hypothèse Test-only identifiée dans ce code — la logique est directement portable en Live via un simple changement de clé/Prices.

## 12. Customer Portal — audit

Configuration Stripe actuelle (`bpc_1U2wN40...`, "Default", active) :
- `customer_update` : nom/email/adresse/téléphone modifiables — activé.
- `invoice_history` : activé.
- `payment_method_update` : activé.
- `subscription_cancel` : activé, `mode: at_period_end` (résiliation en fin de période, pas immédiate), motifs de résiliation collectés.
- `subscription_pause` : **désactivé**.
- `subscription_update` (changement de plan directement depuis le portail) : **désactivé** — le changement d'offre passe uniquement par le flux applicatif (`changerOffreStripe`), pas par le portail Stripe lui-même. Comportement voulu ou lacune ? à confirmer avec Julien avant Live (actuellement neutre : ne bloque rien, juste moins d'autonomie client).
- `login_page` : désactivé (le portail n'est accessible que via lien généré par l'app, pas de page de login Stripe publique) — cohérent avec l'architecture (`creerSessionPortailStripe`, appelée depuis `ouvrirPortailAbonnementAction`).

Config Live cible : identique, à recréer manuellement en mode Live (les configurations de portail ne sont pas partagées entre Test et Live).

## 13. Trial 30 jours — confirmé

- Durée : `DUREE_ESSAI_JOURS = 30` (`src/lib/plateforme.ts`), transmise à Stripe via `subscription_data[trial_period_days]`.
- Carte enregistrée dès le Checkout (`payment_method_collection: always`), aucun débit avant fin d'essai (comportement Stripe natif pour `trialing`).
- Fin d'essai : Stripe déclenche `customer.subscription.updated` (passage `trialing` → `active`/`past_due`) et `invoice.paid`/`invoice.payment_failed` selon le succès du prélèvement — tous deux traités par le webhook (`synchroniserAbonnement`, `statutAbonnementDepuisStripe`).
- `abonnement_essai_fin` synchronisé en base depuis `trial_end` à chaque webhook d'abonnement.
- Aucune contradiction identifiée entre code, Stripe et le message commercial "30 jours gratuits" affiché au Checkout.

## 14. TVA — dépendances Stripe uniquement (aucune décision fiscale prise ici)

- `STRIPE_AUTOMATIC_TAX_ENABLED` reste `false` partout (Preview et Production) — confirmé.
- Stripe Tax settings actuels : `defaults.tax_behavior = exclusive`, `head_office.address.country = FR` (adresse incomplète — ville/code postal/ligne 1 non renseignés).
- **BLOQUÉ — régime fiscal et TVA officiels à confirmer** avant toute activation de `automatic_tax` : dépend de l'arbitrage du régime fiscal/social de l'EI (micro *ou* réel) puis de la situation réelle une fois immatriculée (franchise en base ou assujettissement), cf. `STRIPE_LIVE_CHECKLIST.md §Taxes` et `CHECKLIST_LANCEMENT.md` § 3. Aucune configuration fiscale Stripe modifiée dans ce lot.

## 15. Facturation Stripe — distinction confirmée

Deux notions distinctes dans le code, à ne pas confondre :
- **Factures d'abonnement SaaS** (Stripe → ELSATIA) : générées par Stripe pour l'abonnement de la plateforme, synchronisées dans `factures_abonnement` (table dédiée, `synchroniserFactureAbonnement`). C'est ce que couvre P15.
- **Factures métier** (une entreprise cliente → ses propres clients, via le module Facturation d'ELSATIA Gestion Pro) : table `factures`, verrouillage d'immutabilité une fois émises (`verrouiller_facture_emise`, versionné P1-4), totalement indépendantes de Stripe sauf lorsqu'un paiement en ligne est proposé via Stripe Connect (`src/lib/stripe.ts:creerSessionStripe`, `Stripe-Account` header — fonctionnalité Connect, non configurée en Production actuellement, `STRIPE_CONNECT_CLIENT_ID` absent des variables Production).

Aucune confusion identifiée dans le code entre ces deux flux.

## 16. KYC — checklist documents (aucune valeur saisie, aucune soumission)

| Élément | Statut |
|---|---|
| Identité de l'exploitant | EN ATTENTE INPI-INSEE |
| Adresse professionnelle | EN ATTENTE INPI-INSEE |
| SIREN | EN ATTENTE INPI-INSEE |
| SIRET | EN ATTENTE INPI-INSEE |
| Activité déclarée | À CONFIRMER (formulation cible §17, dépend du retour officiel INPI) |
| Site web | DÉJÀ DISPONIBLE (`https://elsatia.fr`) |
| Téléphone professionnel | À CONFIRMER |
| Email professionnel | EN ATTENTE (cible `julien@elsatia.fr`, dépend DNS/légal) |
| Compte bancaire dédié | EN ATTENTE BANQUE |
| IBAN | EN ATTENTE BANQUE |
| Justificatif d'identité | À CONFIRMER (pièce d'identité valide à préparer) |
| Justificatif de domicile | À CONFIRMER |
| Informations fiscales (régime) | EN ATTENTE INPI-INSEE + décision régime |

## 17. Activité déclarée — formulation Stripe cible

Base actuelle (cohérente avec les documents juridiques préparés) : *« Édition, exploitation et commercialisation d'un logiciel en ligne (SaaS) de gestion d'entreprise, et prestations de services numériques associées. »* — à utiliser telle quelle pour le KYC Stripe, sauf si l'INPI retourne une formulation d'activité officielle différente, auquel cas **la formulation officielle INPI prévaut** et remplace celle-ci partout (Stripe, CGV, mentions légales).

## 18. IBAN — préparation (aucun IBAN réel saisi)

- Emplacement futur : Dashboard Stripe → Paramètres → Comptes bancaires et planification, une fois le KYC validé.
- Stripe vérifie le compte par un dépôt de vérification (micro-dépôts) ou une vérification instantanée selon la banque.
- Titulaire attendu : le nom de l'exploitant individuel (entreprise individuelle — EI), cohérent avec le nom déclaré au KYC — pas un nom commercial seul si celui-ci diffère de la raison sociale légale.
- Délai de vérification : variable (instantané à quelques jours ouvrés selon la banque).
- Les virements Stripe (payouts) sont actuellement à `debit_negative_balances: true`, planification quotidienne (`schedule.interval: daily`, `delay_days: 7`) — paramètres par défaut, à revalider une fois le compte bancaire réel en place.

## 19. Scénario de paiement réel — recette Live future (à documenter, pas à exécuter)

1. Créer une entreprise de recette dédiée et clairement identifiée (ex. `RECETTE-LIVE-<date>`), jamais une entreprise cliente réelle.
2. Choisir l'offre la moins chère (Mini) pour limiter le montant engagé.
3. Payer avec une carte réelle appartenant à Julien personnellement.
4. Vérifier le chargement correct du Checkout Live (mention "Live" visible, pas "Environnement de test").
5. Vérifier la réception du webhook `checkout.session.completed` en Production.
6. Vérifier la création réelle de l'abonnement côté Stripe Live.
7. Vérifier la mise à jour des droits applicatifs (`abonnement_statut=actif`) dans les secondes suivant le paiement.
8. Vérifier l'émission d'une facture/reçu Stripe (`invoice.paid`) et son URL/PDF.
9. Vérifier l'accès au portail client Live (changement de moyen de paiement, historique).
10. Annuler l'abonnement de recette (immédiat ou fin de période, au choix).
11. Rembourser le paiement de recette (cf. §20) si le geste commercial est jugé nécessaire.
12. Supprimer la fixture applicative (entreprise de recette) selon la procédure de suppression validée en P15 (cf. le nettoyage effectué pendant le smoke test de rotation de clé, §annexe) — sans jamais tenter de forcer la suppression si une table d'audit immuable bloque une cascade.
13. Conserver la trace comptable Stripe obligatoire (facture/reçu) — ne jamais supprimer côté Stripe, seulement côté application.

## 20. Remboursement — procédure (non exécutée)

Rembourser depuis le Dashboard Stripe (Paiements → sélectionner la charge → Rembourser) ou via l'API `refunds`. Conséquences : l'abonnement associé n'est pas automatiquement annulé par un remboursement (à faire séparément, cf. §21) ; Stripe peut retenir les frais de transaction initiaux selon le motif ; un webhook `charge.refunded` n'est actuellement pas souscrit (absent de la liste §9) — si un remboursement réel doit être tracé applicativement, ce serait à ajouter à l'endpoint webhook avant la première recette réelle.

## 21. Annulation — scénarios (audit du code)

- **Immédiate** : possible via l'API (`subscriptions.cancel` direct), mais **non exposée** dans le code actuel (`creerSessionPortailStripe` et le portail configurent uniquement `at_period_end`). Pas de bouton "annuler immédiatement" côté app ni côté portail.
- **Fin de période** : chemin principal, via le Customer Portal (`subscription_cancel.mode = at_period_end`).
- **Pendant l'essai** : une annulation pendant `trialing` suit la même logique `at_period_end` — se termine à la date de fin d'essai déjà programmée, pas de facturation déclenchée.
- **Paiement échoué** : ne déclenche pas une annulation automatique, mais un passage en `suspendu` (cf. §22) — Stripe retente selon son propre calendrier de relance (Smart Retries), pas de logique custom dans le code.
- **Client via portail** : chemin testé et actif (`ouvrirPortailAbonnementAction`).
- **Admin annule pour un client** : `ouvrirPortailAbonnementSuspenduAction` existe pour un abonnement déjà suspendu, mais pas d'action admin dédiée à l'annulation forcée d'un abonnement actif observée dans `src/app/actions/abonnement.ts` — à confirmer si un tel besoin opérationnel existe (support client) avant Live.

## 22. Échec de paiement — audit

`invoice.payment_failed` → `abonnement_statut = "suspendu"` immédiatement (`route.ts:193-206`), pas de délai de grâce applicatif. La reprise d'accès dépend de la prochaine facture payée avec succès (webhook `invoice.paid` repasse le statut à `"actif"`). Aucune notification email/in-app spécifique à l'échec de paiement identifiée dans ce code (hors ce que Stripe envoie nativement par email au client, configuré côté Dashboard Stripe, hors du périmètre applicatif). Pas de politique commerciale inventée ici — comportement actuel documenté tel quel.

## 23. Idempotence — audit

- **Webhooks** : `abonnement_evenements.stripe_event_id` UNIQUE, conflit Postgres `23505` → réponse `{received:true, duplicate:true}` sans retraiter (§9). Testé implicitement par cette contrainte, pas de test pgTAP dédié identifié — à considérer pour un futur lot si jugé nécessaire, pas un P1 (le mécanisme fonctionne, juste non couvert par un test automatisé explicite).
- **Appels sortants vers Stripe** : `Idempotency-Key` systématique sur toutes les opérations d'écriture (`requeteStripe`), dérivée de l'ID entreprise/offre/action — protège contre les doubles requêtes réseau (retry client, double clic).
- **Événements concurrents** : la table `abonnement_evenements` sert aussi de verrou applicatif (l'insert échoue si l'event_id existe déjà, avant même tout traitement métier) — pas de fenêtre de double-traitement identifiée.

## 24. Sécurité Stripe — audit du code

- `npm run verify:secrets` : **847 fichiers suivis contrôlés, aucun secret reconnu** (exécuté le 22-08-2026, cf. §QA du rapport final).
- Aucune clé Stripe (`sk_`, `pk_`, `whsec_`) trouvée en dur dans le code source, uniquement lue depuis `process.env`.
- Aucune clé secrète exposée côté client : `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` n'existe même pas dans les variables Vercel (Preview ni Production) — cohérent avec l'architecture Checkout 100% côté serveur (redirection vers une URL Stripe hébergée, pas de Stripe.js embarqué).
- Signature webhook vérifiée systématiquement avant tout traitement (`verifierSignatureStripe`, §9).
- Metadata Stripe (`entreprise_id`, `offre`, `periodicite`) utilisée uniquement en lecture pour résoudre l'entreprise concernée côté webhook — jamais utilisée pour accorder des droits sans re-vérification via la base (`entreprisePour()` interroge `entreprises` par `stripe_subscription_id`/`stripe_customer_id`, pas de confiance aveugle dans le contenu du webhook).
- Aucun contournement d'abonnement identifié (pas de chemin applicatif qui active un abonnement sans passer par un webhook Stripe signé).
- **Point de sécurité identifié** : secret Vercel Protection Bypass exposé dans l'URL du webhook Preview (cf. §9) — à corriger, non bloquant pour Live (concerne uniquement Preview).

## 25. Preview — confirmation

Preview utilise exclusivement Stripe Test (`STRIPE_SECRET_KEY` Preview = clé Test, tous les `STRIPE_PRICE_*` Preview = Prices Test, webhook Preview dédié `we_1Tziay0...`). Aucun secret/Price/webhook Live présent côté Preview (aucune valeur Live n'existe nulle part dans le compte).

## 26. Production actuelle — confirmation

Production reste en mode Test/pré-Live, confirmé de deux façons indépendantes : (1) inventaire Stripe — aucune clé/Price/webhook Live n'existe dans le compte ; (2) preuve fonctionnelle directe — le smoke test de rotation de clé (22-08-2026) a chargé un Checkout réel affichant explicitement "Environnement de test — Liria Gestion Pro TEST". Aucune activation Live n'a eu lieu pendant ce lot.

## 27. Dépendances administratives — état

| Catégorie | État |
|---|---|
| INPI/INSEE (activité validée, SIREN/SIRET) | EN ATTENTE |
| Régime (micro confirmé) | EN ATTENTE (dépend du retour INPI) |
| TVA confirmée | BLOQUÉ — dépend du régime |
| Banque (compte dédié) | EN ATTENTE |
| IBAN disponible | EN ATTENTE (dépend banque) |
| Juridique (mentions légales, CGV/CGU, confidentialité finales) | EN COURS — documents préparés (`docs/juridique/*.md`), finalisation dépend des infos officielles INPI |
| Stripe — compte technique | PRÊT (Test validé, structure connue) |
| Stripe — KYC | NON LANCÉ (dépend des prérequis ci-dessus) |
| Stripe — sécurité compte (2FA, email pro) | À VÉRIFIER MANUELLEMENT (§3) |

## 28. Conditions de GO P15 Live

P15 Live ne peut démarrer que si **tous** les points suivants sont vrais : INPI/INSEE finalisé, régime confirmé, TVA confirmée, banque ouverte, IBAN disponible, juridique finalisé, aucune anomalie P0/P1 applicative ouverte, Stripe Test toujours vert, compte Stripe sécurisé (2FA + email pro). **À la date de ce rapport, ces conditions ne sont pas réunies (blocages externes uniquement, cf. §27) → `NO-GO P15 LIVE` pour l'instant.**

## 29. Plan d'activation futur (ordre exact, à exécuter seulement une fois le GO obtenu)

1. Sécuriser le compte Stripe (2FA, vérification accès).
2. Remplacer l'email du compte par `julien@elsatia.fr` si disponible à ce moment.
3. Lancer le KYC Stripe (informations entreprise + pièces justificatives).
4. Saisir les informations légales définitives (raison sociale, SIRET, adresse).
5. Saisir les coordonnées bancaires (IBAN).
6. Attendre la validation Stripe du KYC (délai variable, plusieurs jours possibles).
7. Créer les 4 Produits Live (Mini/Pro/Business/Entreprise).
8. Créer les Prices Live (mensuel + annuel × 4, + comptes supplémentaires si le correctif §7 est fait entretemps).
9. Créer le webhook Live (§10).
10. Saisir les nouvelles variables dans Vercel Production (`STRIPE_SECRET_KEY`, tous les `STRIPE_PRICE_*`, `STRIPE_WEBHOOK_ABONNEMENT_SECRET`).
11. Redéployer Production.
12. Smoke test applicatif complet (comme celui réalisé en Test le 22-08-2026, reproduit à l'identique en Live).
13. Paiement réel unique, contrôlé (§19).
14. Vérifier la création de l'abonnement Live.
15. Vérifier l'émission de la facture/reçu Live.
16. Vérifier le portail client Live.
17. Annulation/remboursement de la recette Live (§20-§21).
18. Vérifier les logs applicatifs (aucune erreur).
19. Vérifier Sentry (aucune exception liée à Stripe).
20. GO commercial payant.

## 30. Rollback (plan logique, non exécuté)

- Ne jamais supprimer le compte Stripe (données comptables/légales à conserver).
- Désactiver le Checkout Live : retirer/invalider les `STRIPE_PRICE_*` Live des variables Production (l'app échoue proprement — `stripeBillingEstConfigure()` retourne `false`, cf. `variablesStripeBillingManquantes`), sans casser le reste de l'application.
- Remettre temporairement les variables Production sur les valeurs Test le temps de résoudre un incident, si nécessaire (repasse en mode pré-Live).
- Conserver toutes les données Stripe (factures, remboursements) — obligation comptable/légale, ne jamais purger côté Stripe.
- Ne jamais casser l'accès des clients déjà existants pendant un rollback — un rollback de configuration ne doit affecter que les nouvelles souscriptions, pas les abonnements actifs en cours (le webhook continue de fonctionner indépendamment des Prices affichés au Checkout).

## Annexe — preuve de fonctionnement Test (rotation de clé, 22-08-2026)

Voir le résumé fourni dans la conversation : inscription jetable réelle → Customer Stripe Test créé (`cus_V7WEiaeyiMvfk3`, supprimé après coup) → Checkout Session Test créée (`cs_test_...`) → chargement `checkout.stripe.com` HTTP 200, badge "Environnement de test" → abandon avant carte → nettoyage complet (entreprise de test supprimée de Production, vérifié stable sur relectures multiples, retour exact à l'état antérieur).
