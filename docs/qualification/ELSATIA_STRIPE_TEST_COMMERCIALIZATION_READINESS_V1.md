# ELSATIA — Stripe Test Commercialization Readiness V1

- Date : 2 octobre 2026
- Base : `4d92ddb` (dernier train canonique local, identique à `main`)
- Branche de travail : `claude/elegant-turing-b4ewbp`
- Périmètre : Stripe Billing des abonnements Gestion Pro (Liria → entreprises clientes). Stripe Connect (factures des entreprises à leurs clients) et la boutique ne sont pas concernés.
- Travail exclusivement local. **Aucune clé Stripe Live utilisée, aucun appel Stripe réel, aucune action sur la production** (ni base, ni Vercel, ni Stripe).

## Verdict

**BLOCKED_EXTERNAL**

Le code est prêt pour une qualification Stripe Test réelle. Les 15 blocages locaux trouvés pendant l'audit sont corrigés et couverts par des tests (voir § 10). Ce qui reste bloquant est entièrement externe :

1. identifiants Stripe **Test** absents (`STRIPE_SECRET_KEY` en `sk_test_`, secret de webhook) ;
2. environnement de qualification à fournir (URL d'application, base Supabase de qualification, entreprise de test).

Dès que ces variables sont fournies, `npm run stripe:test:preflight` doit renvoyer `READY_FOR_REAL_STRIPE_TEST`, puis `npm run stripe:test:catalogue` et `npm run stripe:test:qualification` exécutent la qualification complète (§ 5).

Indépendamment de Stripe Test, la **facturation réelle (Live) reste verrouillée** par le code tant que l'identité vendeur, le régime de TVA et la décision d'ouverture commerciale ne sont pas fournis (§ 3, 4, 7).

## 1. Catalogue

### Grille canonique appliquée

| Offre | Mensuel HT | Annuel HT (10 mois) | Ancien annuel (12 mois) |
|---|---:|---:|---:|
| Mini | 79 € | 790 € | 948 € |
| Pro | 249 € | 2 490 € | 2 988 € |
| Business | 449 € | 4 490 € | 5 388 € |
| Entreprise | 599 € | 5 990 € | 6 468 € |

**Écart trouvé** : le code (`src/lib/tarification.ts`) et la base (`plans_abonnement`, migration 142) facturaient l'annuel sur 12 mois (et 10,8 mois pour Entreprise). L'onboarding affichait « −20 % ».

**Corrections** :

- `src/lib/tarification.ts` : `MOIS_FACTURES_PAR_AN = 10`, prix annuels 79 000 / 249 000 / 449 000 / 599 000 centimes.
- `/tarifs` : prix annuel calculé depuis le catalogue (suppression du texte figé « 539 €/mois, 6 468 €/an ») ; page régénérée toutes les 10 min (`revalidate = 600`) pour que la règle d'ouverture datée ne soit pas figée au build.
- Onboarding : « 2 mois offerts » au lieu de « −20 % ».
- Migration `supabase/migrations/20261002000184_tarifs_annuels_dix_mois.sql` : publie une **nouvelle version** de plan par offre non conforme et retire l'ancienne du catalogue futur, avec trace dans `historique_tarification`. **Non appliquée** (aucune action sur la production).

### Anciens contrats jamais modifiés automatiquement

- La migration ne touche **ni** `abonnements_entreprises` **ni** `entreprises.abonnement_prix_contractuel_ht`. Vérifié sur un PostgreSQL 16 jetable : deux contrats existants (Pro annuel 2 988 €, Entreprise annuel 6 468 €) restent inchangés ; la migration rejouée une seconde fois ne fait rien.
- Le prix contractuel synchronisé depuis Stripe est désormais celui du **Price réellement facturé** (`unit_amount`). Un abonné sur un ancien Price garde donc son prix historique ; seuls les nouveaux Checkout utilisent les nouveaux Prices (test « ancien contrat sur l'ancien Price annuel garde son prix historique »).
- Les anciens Prices restent reconnus grâce à leurs métadonnées `liria_offre` / `liria_periodicite` / `liria_version_tarif`.

### Hors grille canonique (non modifié)

- « Sur mesure » (699 €/mois, sur devis, annuel 8 388 €) : hors des quatre offres canoniques, laissé tel quel. La page publique affiche désormais « Annuel sur devis ».
- Offres historiques `essentiel` / `premium` : conservées pour les contrats existants.

## 2. Parcours Stripe Test

Le droit Gestion Pro correspond à `entreprises.abonnement_statut` (accès : `essai` / `actif` ; blocage : `suspendu` / `annule`, contrôlé dans `src/lib/entreprise.ts`) et à `entreprises.abonnement_offre` (modules inclus, contrôlés par le proxy).

| Parcours | Couverture locale (tests automatisés) | Harness Stripe Test réel (`qualification.mjs`) |
|---|---|---|
| Création checkout | ✓ paramètres, essai, idempotence | Checkout UI : manuel (§ 5.4) ; étape 1 crée l'abonnement par API avec les mêmes métadonnées |
| Paiement réussi | ✓ | ✓ étape 2 (Test Clock +31 j) |
| Webhook | ✓ route réelle, signature, journal | ✓ toutes étapes |
| Activation du droit | ✓ essai → actif | ✓ étapes 1-2 |
| Portail client | ✓ droits suivent le Price | ✓ étape 3 (session) + validation manuelle de l'interface |
| Upgrade | ✓ Pro → Business | ✓ étape 4 |
| Downgrade | ✓ Business → Mini | ✓ étape 5 |
| Résiliation | ✓ programmée puis terminale | ✓ étapes 6 et 8 |
| Resubscribe | ✓ nouvel abonnement adopté, sans nouvel essai | ✓ étape 11 |
| Paiement refusé | ✓ past_due → suspendu | ✓ étape 12 (`pm_card_chargeCustomerFail`) |
| invoice.paid tardif | ✓ ne réactive pas | ✓ étape 10 (événement réel rejoué) |
| Ordre inversé | ✓ ancien `updated` actif après `deleted` | ✓ étape 9 (événement réel rejoué) |
| Webhook dupliqué | ✓ aucun double effet | ✓ étape 7 |
| Webhook manquant / replay | ✓ cron de réconciliation, rejeu après échec | ✓ étape 14 (cron) |
| Suspension | ✓ | ✓ étape 12 |
| Restauration | ✓ suspendu → actif | ✓ étape 13 |

## 3. TVA

**Constat** : `docs/juridique/cgv.md` et `docs/juridique/mentions-legales.md` évoquent la franchise en base (art. 293 B du CGI), mais en **gabarit non validé** (champs `[À COMPLÉTER]`, nom entre crochets). Le régime n'est donc **pas confirmé** et n'a pas été déduit.

**Points de configuration préparés** (`src/lib/stripe-billing-config.ts`) :

- `LIRIA_TVA_REGIME` = `franchise_en_base` | `assujetti` (toute autre valeur = non déclaré) ;
- `LIRIA_TVA_REGIME_CONFIRME=true` : confirmation explicite (validation expert-comptable) ;
- `franchise_en_base` : aucun calcul de taxe, mention « TVA non applicable, art. 293 B du CGI » dans le pied de facture Stripe ;
- `assujetti` : `automatic_tax[enabled]`, collecte du numéro de TVA client (`tax_id_collection`) au Checkout, numéro de TVA intracommunautaire vendeur exigé. Stripe Tax doit aussi être activé et l'enregistrement fiscal FR déclaré dans le Dashboard (action externe).
- Checkout : adresse de facturation obligatoire et enregistrée sur le client (`billing_address_collection=required`, `customer_update[address|name]=auto`).
- L'ancienne variable `STRIPE_AUTOMATIC_TAX_ENABLED` est remplacée par `LIRIA_TVA_REGIME`.

**Blocage de la facturation réelle** : en mode Live, la souscription est refusée tant que le régime n'est pas confirmé ; en Stripe Test, la qualification reste possible (factures sans valeur, marquées comme telles).

## 4. Identité vendeur

**Constat** : aucune identité légale complète n'est disponible (SIRET, adresse, e-mail `[À COMPLÉTER]` dans les mentions légales). Rien n'a été inventé.

**Garde-fous** :

1. **Verrou de souscription** : en Live, Checkout refusé si l'identité est incomplète.
2. **Filet sur les factures** : en Live, tout `invoice.created` reçu alors que l'identité ou la TVA ne sont pas confirmées déclenche `auto_advance=false`. La facture reste brouillon : Stripe ne la finalise pas et ne l'envoie pas (test « en Live sans identité vendeur ni TVA confirmées, une facture brouillon n'est jamais finalisée »).
3. **Pied de facture** posé sur chaque client Stripe : identité vendeur, mention TVA, conditions de paiement. En mode Test, on ajoute « Stripe Test : document sans valeur comptable ni fiscale ».

Champs exigés (`champsIdentiteVendeurManquants`) : dénomination, forme juridique, adresse, e-mail, SIREN/SIRET (clé de Luhn vérifiée), mentions de paiement (pénalités de retard, indemnité forfaitaire de 40 €). S'y ajoutent RCS et capital pour une société, et le numéro de TVA intracommunautaire si le vendeur est assujetti. Enfin, `LIRIA_VENDEUR_IDENTITE_STRIPE_VERIFIEE=true` atteste que les informations publiques du compte Stripe (qui produisent le PDF de facture) ont été vérifiées par une personne.

**Limite** : la première facture d'un abonnement sans essai est finalisée par Stripe dès le Checkout. Elle n'est protégée que par le verrou de souscription (1), pas par le filet (2).

## 5. Harness Stripe Test (Test Clock)

Scripts dans `scripts/stripe-test/`. Ils refusent toute clé autre que `sk_test_` / `rk_test_` et s'arrêtent si un objet `livemode=true` est reçu. Ils n'affichent jamais la valeur d'un secret.

### 5.1 `npm run stripe:test:preflight`
Liste chaque variable requise avec seulement « présente / absente ». Sortie : `0` READY, `2` BLOCKED_EXTERNAL, `1` clé Live refusée.
Résultat au 2 octobre 2026 : **BLOCKED_EXTERNAL, 17 variables absentes** (aucune variable Stripe dans l'environnement local).

### 5.2 `npm run stripe:test:catalogue`
Crée ou retrouve, de façon idempotente (`lookup_key` versionnée `gestion_pro_<offre>_<periodicite>_2026-10`) :
- les Products et les Prices mensuels et annuels (annuel = 10 × mensuel), avec les métadonnées `liria_*` ;
- une configuration de portail client : changement de Price avec proratisation, résiliation en fin de période, moyen de paiement, historique.

Le script affiche ensuite les lignes `STRIPE_PRICE_*` et `STRIPE_BILLING_PORTAL_CONFIGURATION` à reporter dans l'environnement (ce sont des identifiants publics). Si un Price existant ne correspond pas à la grille, le script s'arrête au lieu de le modifier.

### 5.3 `npm run stripe:test:qualification`
Scénario de 14 étapes (`--plan` pour l'afficher sans réseau) sur une Test Clock. Chaque étape agit sur Stripe Test, puis interroge la base de qualification jusqu'à observer l'état produit par le webhook. Les rejeux (doublon, ordre inversé, `invoice.paid` tardif) utilisent de **vrais événements Stripe**, re-signés et renvoyés au webhook. La Test Clock est supprimée à la fin, ce qui supprime aussi le client et les abonnements Test. Le script refuse de s'exécuter sans `STRIPE_QUALIF_BASE_NON_PRODUCTION=true`.

### 5.4 Étapes manuelles restantes (avec identifiants Test)
1. Lancer l'application en local sur une base de qualification, avec `STRIPE_BILLING_QUALIFICATION_TEST=true`.
2. `stripe listen --forward-to localhost:3000/api/stripe/abonnement/webhook` et reporter le `whsec_` affiché dans `STRIPE_WEBHOOK_ABONNEMENT_SECRET`.
3. `npm run stripe:test:catalogue`, puis reporter les identifiants.
4. Checkout UI : depuis `/abonnement`, souscrire avec la carte `4242 4242 4242 4242`. Vérifier essai / offre, puis une seconde souscription refusée (« abonnement déjà actif »).
5. Portail UI : upgrade, downgrade et résiliation à la main. Vérifier que `/abonnement` et les modules accessibles suivent le changement.
6. `npm run stripe:test:qualification` (verdict `QUALIFIE` attendu).

## 6. Idempotence — preuves

Preuves exécutées localement par la vraie route webhook (`src/app/api/stripe/abonnement/webhook/route.test.ts`), avec Supabase en mémoire et Stripe simulé (`src/test/`), signatures HMAC identiques à Stripe.

| Exigence | Mécanisme | Test |
|---|---|---|
| Événement dupliqué sans double effet | réservation unique `abonnement_evenements.stripe_event_id` (doublon → 200 `duplicate`) ; lignes de facture créées avec une clé d'idempotence Stripe et le relevé `stripe_invoice_id` | « un webhook dupliqué n'a aucun double effet » : historique non dupliqué, un seul relevé par facture |
| Événement ancien ne réactive pas une résiliation terminale | l'état appliqué est **l'abonnement relu chez Stripe**, pas le contenu de l'événement ; un abonnement terminal remplacé est ignoré | « résiliation programmée puis terminale ; un ancien événement ne réactive rien », « réabonnement… événements de l'ancien ignorés » |
| Portail : droits selon le Price facturé | offre déduite du Price de la ligne de base (identifiant configuré ou métadonnées du Price), jamais des métadonnées de l'abonnement que le portail ne modifie pas | « upgrade puis downgrade modifient l'offre même si les métadonnées restent "pro" » |
| Rejeu après échec | en cas d'erreur, la réservation est libérée (500) et la nouvelle tentative de Stripe retraite l'événement | « un traitement en échec est rejouable » |
| Facture dans le désordre | statut de facture relu chez Stripe | « la même facture reçue paid puis payment_failed (désordre) reste payée » |

**Robustesse des tests vérifiée par mutation** : cinq retours volontaires à l'ancien comportement font chacun échouer au moins un test. Les cinq mutations : état lu dans l'événement, garde « ancien abonnement » supprimée, droits lus dans les métadonnées, `invoice.paid` qui force « actif », déduplication supprimée.

## 7. Prévente / ouverture commerciale

**Constat** : aucune règle d'ouverture n'existait. Dès que les variables Stripe étaient présentes, n'importe quelle entreprise pouvait souscrire. Aucune date d'ouverture ni décision n'est documentée dans le dépôt.

**Règle implémentée** (`etatOuvertureCommerciale`, fermée par défaut) :

- **Stripe Test** : ouverte seulement si `STRIPE_BILLING_QUALIFICATION_TEST=true` ;
- **Stripe Live** : ouverte seulement si **toutes** ces conditions sont réunies :
  - `STRIPE_BILLING_LIVE_AUTORISE=true` (décision explicite) ;
  - `ABONNEMENTS_OUVERTURE_COMMERCIALE_AT` renseignée (ISO 8601) et atteinte ;
  - identité vendeur complète ;
  - régime de TVA confirmé ;
- sinon : fermée (clé absente ou inconnue, Price manquant).

La règle est appliquée côté serveur dans `demarrerAbonnementAction` et pilote l'affichage de `/tarifs`, `/abonnement` et de l'onboarding. **Aucune date d'ouverture n'a été fixée : les abonnements restent fermés.**

## 8. Secrets et variables

Seuls les noms sont listés ici, jamais les valeurs. Toutes les valeurs restent hors du dépôt (`.env*` est ignoré par git). `npm run verify:secrets` passe : 691 fichiers suivis, aucun secret reconnu. Les clés utilisées dans les tests sont fictives et ne correspondent pas au format d'un vrai secret (`sk_test_fictif`, `whsec_fictif`).

### Secrets Stripe Test à fournir
- `STRIPE_SECRET_KEY` : clé `sk_test_…` ou restreinte `rk_test_…` (Products, Prices, Customers, Subscriptions, Invoices, Checkout, Billing Portal, Test Clocks, Events en lecture) ;
- `STRIPE_WEBHOOK_ABONNEMENT_SECRET` : `whsec_…` de l'endpoint Test `/api/stripe/abonnement/webhook` (ou de `stripe listen`).

### Identifiants publics produits par `catalogue.mjs`
- `STRIPE_PRICE_MINI_MENSUEL`, `STRIPE_PRICE_MINI_ANNUEL`
- `STRIPE_PRICE_PRO_MENSUEL`, `STRIPE_PRICE_PRO_ANNUEL`
- `STRIPE_PRICE_BUSINESS_MENSUEL`, `STRIPE_PRICE_BUSINESS_ANNUEL`
- `STRIPE_PRICE_ENTREPRISE_MENSUEL`, `STRIPE_PRICE_ENTREPRISE_ANNUEL`
- `STRIPE_BILLING_PORTAL_CONFIGURATION` (optionnelle, recommandée)

### Environnement de qualification
- `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` (secret), `STRIPE_BILLING_QUALIFICATION_TEST=true`
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret) : **base de qualification uniquement**
- `STRIPE_QUALIF_ENTREPRISE_ID`, `STRIPE_QUALIF_BASE_NON_PRODUCTION=true`, `STRIPE_QUALIF_WEBHOOK_URL` (optionnelle)

### Non requis pour Stripe Test (requis pour Live)
`STRIPE_BILLING_LIVE_AUTORISE`, `ABONNEMENTS_OUVERTURE_COMMERCIALE_AT`, `LIRIA_TVA_REGIME`, `LIRIA_TVA_REGIME_CONFIRME`, `LIRIA_VENDEUR_DENOMINATION`, `LIRIA_VENDEUR_FORME_JURIDIQUE`, `LIRIA_VENDEUR_ADRESSE`, `LIRIA_VENDEUR_SIREN`, `LIRIA_VENDEUR_EMAIL`, `LIRIA_VENDEUR_RCS`, `LIRIA_VENDEUR_CAPITAL`, `LIRIA_VENDEUR_TVA_INTRA`, `LIRIA_FACTURE_MENTIONS_PAIEMENT`, `LIRIA_VENDEUR_IDENTITE_STRIPE_VERIFIEE`.

Optionnelles déjà prévues par le code (options payantes) : `STRIPE_PRICE_COMPTE_SUP_*`, `STRIPE_PRICE_OPTION_IA_*`.

**Règle d'isolement** : les identifiants `cus_` / `sub_` créés en Test ne doivent jamais arriver dans la base de production. La qualification se fait sur une base distincte, et le webhook refuse (400) tout événement dont le mode (`livemode`) ne correspond pas à la clé configurée.

## 9. Validation locale exécutée

| Contrôle | Résultat |
|---|---|
| `npx vitest run` | 30 fichiers, 136 tests, tous verts (dont 18 scénarios webhook, 9 tests de configuration, 4 tests Checkout/Price) |
| `npm run typecheck` | OK |
| `npm run lint` | 0 erreur (3 avertissements `<img>` préexistants, hors périmètre) |
| `npm run verify:migrations` | 179 migrations valides |
| `npm run verify:secrets` | aucun secret |
| `npm run build` | OK (`/tarifs` en ISR 10 min) |
| Migration 184 sur PostgreSQL 16 jetable | nouvelles versions 10 mois actives, contrats existants inchangés, rejouable sans effet |
| `stripe:test:preflight` / `catalogue` / `qualification` sans clé | BLOCKED_EXTERNAL (sortie 2) ; avec une clé `sk_live_` fictive : refus (sortie 1) |

## 10. Blocages locaux trouvés et corrigés

1. Prix annuels à 12 mois (10,8 mois pour Entreprise) au lieu de 10 : code, base et textes.
2. Droits lus dans `subscription.metadata.offre` : un upgrade ou downgrade via le portail ne changeait pas les droits. Ils dépendent maintenant du Price facturé.
3. `invoice.paid` forçait `actif` : un paiement tardif réactivait un abonnement résilié, et une facture d'essai à 0 € passait l'essai en « actif ».
4. Événements appliqués dans leur ordre d'arrivée : un ancien `customer.subscription.updated` pouvait écraser une résiliation. L'état est maintenant relu chez Stripe.
5. Résiliation tardive d'un **ancien** abonnement après réabonnement : elle coupait le nouvel abonnement. Elle est désormais ignorée.
6. Second abonnement vivant (double Checkout) : il écrasait le premier. Il est maintenant ignoré, avec anomalie tracée, et l'action refuse un nouveau Checkout tant qu'un abonnement non résilié existe.
7. Nouvel essai gratuit de 30 jours à chaque réabonnement : l'essai est réservé à la première souscription.
8. Clé d'idempotence du Checkout fixe pendant 24 h : un réabonnement le même jour renvoyait l'ancienne session. Fenêtre ramenée à 10 minutes, ce qui évite aussi le double clic.
9. Mensuel → annuel sur la même offre : l'ancien prix mensuel était conservé comme prix contractuel. Le prix contractuel suit maintenant le Price facturé.
10. Incompatibilité avec l'API Stripe 2025-03-31 « basil » : `invoice.subscription` et `subscription.current_period_*` déplacés, `total_tax_amounts` remplacé par `total_taxes`. Les deux formes sont gérées.
11. Aucun garde-fou Test/Live sur le webhook : contrôle du mode ajouté.
12. Aucune règle d'ouverture commerciale : verrou fermé par défaut.
13. Aucun blocage de facture finale sans identité légale ni TVA confirmée : verrou au Checkout et `auto_advance=false`.
14. Aucune réconciliation en cas de webhook perdu : le cron quotidien relit chaque abonnement non résilié.
15. Statut d'une facture rétrogradé par un événement en retard (paid → open) : le statut est relu chez Stripe.

Autres ajustements : `payee_at` repris de `status_transitions.paid_at` ; la dernière facture affichée n'est plus remplacée par une plus ancienne ; message de la page de succès corrigé (une réactivation n'a pas d'essai) ; historique d'audit à chaque changement d'offre, de périodicité ou de prix constaté chez Stripe.

## 11. Points ouverts (décisions humaines, non bloquants pour Stripe Test)

- **Double essai** : l'inscription ouvre déjà un essai local de 30 jours (`abonnement_statut='essai'`), et le premier Checkout ajoute 30 jours d'essai Stripe. Durée totale à décider.
- **Délai de grâce** après un échec de paiement : aujourd'hui, `past_due` entraîne une suspension immédiate (point 2 de `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md`). Pour un délai, ajuster les relances Stripe (Smart Retries) et/ou `statutAbonnementDepuisStripe`.
- **Suspension manuelle plateforme vs Stripe** : le cron resynchronise le statut depuis Stripe. Une suspension manuelle d'un abonné Stripe reste effective via `suspension_prevue_at` (contrôlée dans `entreprise.ts`), mais le statut affiché peut repasser à « actif ».
- **Idempotence secondaire hors parcours** : la clé `abonnement-comptes-<entreprise>-<quantité>` de `reconcilierAbonnementStripe` peut rejouer une ancienne quantité dans les 24 h. Le cron de l'option IA ajoute une ligne sans vérifier que l'abonnement est encore vivant. À traiter dans un lot dédié aux options.
- **Paramètre `coupon`** de `subscriptions.update` (remises plateforme) : déprécié dans les versions récentes de l'API au profit de `discounts`. À vérifier pendant la qualification Test.
- **Migration 184** : à appliquer sur la base de qualification avant le harness ; sur la production, uniquement lors d'un déploiement décidé.
- **Identité vendeur et régime TVA** : à fournir et valider (expert-comptable) avant toute ouverture Live.
