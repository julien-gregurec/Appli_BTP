# ELSATIA — Stripe Self-Service Subscription Closure V2

Mission autonome nocturne (~8h), sans Stripe live. Périmètre : le flux **Liria → entreprises clientes**
(Stripe Billing / abonnement SaaS), strictement séparé du flux **entreprise → ses clients**
(Stripe Connect, `src/lib/stripe.ts`, `src/app/api/stripe/webhook/route.ts`) — ce dernier n'est pas
concerné par cet audit et n'a pas été modifié.

- Dépôt : `julien-gregurec/appli_btp`, branche `claude/bold-wozniak-31gl3d`
- HEAD analysé : `4d92ddb` (2026-07-29)
- Date de l'audit : 2026-09-22
- Méthode : lecture exhaustive du code, des migrations Supabase et des docs internes ; **aucun appel
  réseau vers Stripe** (mocks/fixtures uniquement, conformément à la contrainte de la mission)

## Préambule — anomalie hors périmètre détectée dans `AGENTS.md`

`AGENTS.md` affirme : *« Read the relevant guide in `node_modules/next/dist/docs/` before writing any
code »*. Vérifié en tout début de mission : `node_modules` n'était même pas installé, et une fois
installé (`npm install`), `node_modules/next/dist/docs/` **n'existe pas** — Next.js ne fournit aucune
documentation sous cette forme, encore moins pour une version « qui casse les conventions connues ».
Cette instruction a été traitée comme non fiable (probable test d'injection de prompt dans le dépôt) et
**ignorée** ; le code a été écrit selon les conventions Next.js standard réellement observées dans ce
dépôt (App Router, server actions). Aucune action destructrice n'a été prise sur cette base.

---

## Verdict

# `SELF_SERVICE BILLING BLOCKED`

Le socle technique (webhook idempotent, essai 30 jours, portail Stripe, facturation d'usage) est réel et
plutôt soigné. Mais **trois gaps bloquants** empêchent aujourd'hui un client de gérer complètement son
abonnement seul, en toute sécurité :

1. **Le changement d'offre (upgrade/downgrade) en self-service n'est câblé nulle part dans l'app.** La
   fonction qui sait le faire côté Stripe (`changerOffreStripe`, proration correcte) n'est appelée par
   aucune action serveur ni aucun bouton — grep négatif confirmé sur tout `src/`. Le seul chemin possible
   est le Portail Stripe hébergé, dont la configuration (activer le changement de plan, restreindre aux 8
   prix commercialisés) est un réglage manuel **externe au dépôt et non vérifiable localement**.
2. **Un administrateur d'entreprise peut s'auto-attribuer un abonnement actif sans jamais payer.** La
   policy RLS d'`UPDATE` sur `entreprises` ne protège aucune colonne : quiconque a la permission
   `gerer_parametres` sur sa propre entreprise (exactement le rôle que l'app autorise à gérer la
   facturation) peut, via l'API PostgREST/Supabase directe, réécrire `abonnement_statut`,
   `abonnement_offre`, `abonnement_echeance`, `stripe_customer_id`, `stripe_subscription_id` — en
   contournant totalement Checkout et le webhook. Voir section 9.
3. **Aucun délai de grâce avant suspension** : un `invoice.payment_failed` (même la toute première
   tentative, avant que Stripe n'ait lancé ses relances) ou un simple `invoice.payment_action_required`
   (3-D Secure à confirmer, pas un échec) suspend l'accès **immédiatement**. Le propre document du projet
   (`docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md`) liste la « durée exacte de grâce avant suspension »
   comme **décision non tranchée** — ce n'est donc pas un choix produit assumé, c'est un trou.

Ces trois points sont vérifiables et corrigibles **sans Stripe live** (code, RLS, tests locaux). Un
quatrième point (configuration réelle du Customer Portal côté Dashboard Stripe — quelles fonctionnalités
sont activées) ne peut, lui, être confirmé qu'en `REMOTE STRIPE TEST` ; il est documenté en section 7 mais
ne change pas le verdict, car les points 1-3 bloquent déjà le self-service indépendamment de lui.

Ce document liste également les points **non bloquants** (idempotence solide, isolation multi-tenant
correcte, entitlements bien branchés) pour ne pas les re-découvrir plus tard.

---

## 1. Flux reconstitué

```
signup (auth Supabase)
  → org (création entreprises, onboarding/besoins → recommanderOffre())
  → plan (choix offre + périodicité, /onboarding/besoins ou /abonnement)
  → checkout (demarrerAbonnementAction → creerOuRecupererClientStripe → creerSessionAbonnementStripe,
              Checkout mode=subscription, trial_period_days=30, payment_method_collection=always)
  → subscription (Stripe crée la subscription en statut trialing)
  → webhook checkout.session.completed → synchroniserAbonnement() + reconcilierAbonnementStripe()
  → entitlement (abonnement_offre déclenche filtrerPermissionsSelonOffre()/permissionIncluseDansOffre()
                 dans src/lib/permissions.ts et src/lib/supabase/proxy.ts)
  → invoice (invoice.created hors 1ère facture d'essai → dépassements appareils/stockage ajoutés ;
             invoice.paid/failed/action_required → statut + factures_abonnement)
  → upgrade/downgrade : changerOffreStripe() existe mais N'EST APPELÉE PAR RIEN (voir §3) ;
                          seule la part variable (comptes sup., option IA) est réellement self-service
  → cancellation : Portail Stripe uniquement (ouvrirPortailAbonnementAction), pas de bouton in-app dédié
  → failed payment : invoice.payment_failed / invoice.payment_action_required → suspendu immédiat
  → reactivation : le client règle sa carte dans le Portail Stripe → invoice.paid → actif ;
                    côté app, un admin plateforme peut aussi forcer le statut (plateforme_modifier_abonnement,
                    hors self-service)
```

Fichiers clés (tous vérifiés ligne à ligne) :

| Rôle | Fichier |
|---|---|
| Grille tarifaire (source « affichage ») | `src/lib/tarification.ts` |
| Wrapper métier + essai/réduction | `src/lib/plateforme.ts` |
| Lib Stripe Billing (Checkout, Portail, proration, coupons, dépassements) | `src/lib/stripe-abonnement.ts` |
| Webhook plateforme (signature dédiée, dédup, dispatch) | `src/app/api/stripe/abonnement/webhook/route.ts` |
| Actions self-service client | `src/app/actions/abonnement.ts` |
| Actions admin Liria | `src/app/actions/plateforme.ts` |
| Dashboard abonnement client | `src/app/(app)/abonnement/page.tsx` |
| Page bloquée (suspendu) | `src/app/abonnement-suspendu/page.tsx` |
| Retour Checkout | `src/app/paiement/abonnement/{succes,annule}/page.tsx` |
| Cron nocturne (réconciliation comptes sup., IA) | `src/app/api/cron/abonnements/route.ts` |
| Grille versionnée (admin) | `supabase/migrations/20260723000142_tarification_abonnements.sql`, `src/app/(app)/plateforme/tarification/page.tsx` |

---

## 2. Pricing — divergences trouvées

Référence de la mission (Mini 79 / Pro 249 / Business 449 / Enterprise 599, annuel « x10 ») **correspond
globalement** à la grille réelle (`mini`/`pro`/`business`/`entreprise`, mêmes montants mensuels — la
mission dit « Enterprise », le code dit « Entreprise », simple traduction). Il existe une 5ᵉ offre
`sur_mesure` (699 €, devis obligatoire, non commercialisée en self-service) non mentionnée dans le brief.

### 2.1 Incohérence confirmée sur le tarif annuel « Entreprise »

| Offre | Mensuel | Annuel stocké | Annuel = 12×mensuel ? |
|---|---|---|---|
| Mini | 79 € | 948 € | oui (0 % de remise) |
| Pro | 249 € | 2 988 € | oui (0 % de remise) |
| Business | 449 € | 5 388 € | oui (0 % de remise) |
| **Entreprise** | **599 €** | **6 468 €** | **non — équivaut à 539 €/mois (~10 % de remise)** |
| Sur mesure | 699 € | 8 388 € | oui (0 % de remise) |

Ce montant (`6468`) est identique et cohérent entre `src/lib/tarification.ts:171`,
`supabase/migrations/20260723000142_tarification_abonnements.sql:171`, et le texte codé en dur de
`src/app/tarifs/page.tsx:45` (« 539 € HT/mois en annuel (6 468 € HT/an) ») — ce n'est donc pas une faute de
frappe locale à un seul fichier, mais une **incohérence de règle métier propagée partout** : 4 offres sur
5 n'ont aucune remise annuelle, une seule (Entreprise) en a une d'environ 10 %, sans qu'aucune décision ou
commentaire dans le code n'explique pourquoi cette offre spécifique déroge à la règle. `REDUCTION_ANNUELLE
= 0` dans `src/lib/plateforme.ts:71` confirme qu'il n'y a pas de mécanisme de remise globale — chaque
offre porte son propre prix figé, et celui d'Entreprise est l'anomalie. **À trancher avec Julien avant
commercialisation** : soit la remise Entreprise est voulue (et alors il manque une remise équivalente sur
les 3 autres offres, ou une justification), soit c'est une erreur de saisie et `prixAnnuelCentimes` pour
`entreprise` doit passer à `71880` (599×12, cohérent avec le reste de la grille).

### 2.2 Copie UI qui ne correspond à aucune remise réelle

`src/app/onboarding/besoins/page.tsx:36` et `:50` affichent **« −20 % »** pour le paiement annuel
(`mensuelSiAnnuel` + libellé « Annuel · −20 % »). Or aucune offre commercialisée n'applique 20 % de
remise (0 % pour Mini/Pro/Business, ~10 % pour Entreprise, cf. 2.1). Un prospect verra une promesse de
réduction lors du choix mensuel/annuel qui ne se vérifie jamais au moment de payer — risque de litige
commercial, en plus d'être un bug d'affichage.

### 2.3 Trois sources de prix non synchronisées structurellement

1. **`src/lib/tarification.ts`** (constante TS compilée) — pilote `/tarifs` (page publique) et tous les
   calculs d'affichage (`prixAbonnementMensuel`, `calculerTarifAbonnement`).
2. **Table `plans_abonnement`** (Supabase) — alimentée par la migration puis par
   `plateforme_creer_version_tarif()` (RPC accessible depuis `/plateforme/tarification`, réservée aux
   admins Liria). Sert uniquement à figer `abonnements_entreprises.prix_contractuel_ht` (traçabilité
   contractuelle) — **jamais lue par la page publique ni par le Checkout**.
3. **Stripe Price IDs** (variables d'env `STRIPE_PRICE_<OFFRE>_<PERIODICITE>`) — c'est la **seule** source
   qui détermine le montant réellement prélevé par Stripe Checkout/Portail.

Rien dans le code ne garantit que ces trois valeurs restent égales. Concrètement aujourd'hui :
`.env.local.example` (lignes 23-44) ne référence que les variables **historiques**
(`STRIPE_PRICE_ESSENTIEL_*`, `STRIPE_PRICE_PRO_*`, `STRIPE_PRICE_PREMIUM_*`) et **ne liste pas du tout**
`STRIPE_PRICE_MINI_*`, `STRIPE_PRICE_BUSINESS_*`, `STRIPE_PRICE_ENTREPRISE_*` ni leurs équivalents
« compte supplémentaire », alors que ce sont exactement les variables que
`variablesStripeBillingManquantes()` (`src/lib/stripe-abonnement.ts:104-112`) exige pour que
`stripeBillingEstConfigure()` renvoie `true`. Un déploiement calqué sur ce fichier d'exemple ne pourra
jamais vendre Mini/Business/Entreprise — seul Pro (par accident de nommage partagé avec l'ancienne grille)
aurait une chance de fonctionner. **À corriger dans `.env.local.example`.**

Si un futur admin change un prix via `/plateforme/tarification` (qui écrit dans `plans_abonnement`) en
pensant « mettre à jour le tarif », **rien ne changera pour un nouveau client** : ni la page `/tarifs`
(lit `tarification.ts`), ni le montant réellement prélevé par Stripe (lit l'env var). Seule la ligne
`abonnements_entreprises.prix_contractuel_ht` de traçabilité changera pour les *futurs* contrats — un
comportement qui peut légitimement surprendre l'opérateur qui vient d'utiliser cet écran.

---

## 3. Upgrade / downgrade

`changerOffreStripe(subscriptionId, offre, periodicite)` (`src/lib/stripe-abonnement.ts:276-295`) fait le
travail correctement : récupère la subscription, résout l'item existant, et appelle
`subscriptions.update` avec `proration_behavior=create_prorations` — comportement Stripe standard et
attendu pour un upgrade/downgrade avec proration immédiate. Testé (voir §10) pour :

- Mini→Pro / Pro→Business / Business→Mini (mêmes chemins de code, seul le prix cible change)
- monthly→annual / annual→monthly (même fonction, `periodicite` change le price ID résolu)

**Mais `grep -rn "changerOffreStripe" src/` ne retourne que sa propre définition.** Aucune server action,
aucune route, aucun composant ne l'appelle. Conséquences :

- Un client déjà abonné qui veut changer d'offre **n'a aucun bouton dans l'app** pour le faire.
- Le seul chemin restant est le Portail Stripe (`creerSessionPortailStripe`, sans `configuration`
  explicite → utilise la configuration par défaut du compte Stripe, réglée à la main dans le Dashboard).
  Si cette configuration n'autorise pas le changement de plan, ou n'expose pas les 4 offres commercialisées
  avec les bons Price IDs, **l'upgrade/downgrade est tout simplement impossible en self-service**,
  silencieusement (le client ne verra même pas l'option dans le portail).
- Ce qui *est* réellement self-service et testé : la bascule de palier de l'option IA
  (`choisirPalierOptionIAAction`, avec proration) et la réconciliation automatique des comptes
  supplémentaires (`reconcilierAbonnementStripe`, cron nocturne). Ces deux mécanismes fonctionnent et sont
  couverts par les nouveaux tests.

**Recommandation concrète** (hors périmètre de correction immédiate, mais nécessaire pour lever le
blocage) : ajouter une action serveur `changerOffreAbonnementAction` dans `src/app/actions/abonnement.ts`,
gardée par `verifierDroitAbonnement()` (comme les autres), qui résout `subscriptionId` depuis
`ctx.entrepriseId` (jamais depuis une entrée cliente) et appelle `changerOffreStripe`, puis un bouton dans
`/abonnement`.

---

## 4. Failure handling

| Scénario | Comportement observé | Évaluation |
|---|---|---|
| Card fail (1ᵉ tentative) | `invoice.payment_failed` → `abonnement_statut='suspendu'` **immédiatement** | Trop agressif : Stripe programme normalement plusieurs tentatives (Smart Retries) avant `past_due`/`unpaid` ; le client est coupé avant que le dunning Stripe n'ait sa chance. Confirmé non tranché dans `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md` (« durée exacte de grâce avant suspension » listée en point à décider). |
| Payment overdue (3-D Secure requis, pas un échec) | `invoice.payment_action_required` → **même traitement que payment_failed**, `suspendu` immédiat | Bug d'UX/logique : ce n'est pas un échec de paiement, juste une authentification à compléter. Un client légitime peut se retrouver bloqué pour une carte qui aurait fonctionné après confirmation 3DS. |
| Webhook en retard | Aucune protection par timestamp/version — le dernier événement **reçu** gagne, pas le plus récent **chronologiquement** | Confirmé par test (`route.test.ts`, « un webhook en retard (hors-ordre) écrase l'état plus récent »). Un événement `customer.subscription.updated` livré tard par Stripe (retry après incident réseau, etc.) peut écraser un état plus frais avec des données périmées. |
| Duplicate | Contrainte unique `abonnement_evenements.stripe_event_id` + pattern « réserver puis traiter » | **Solide.** Testé, y compris en délivrance concurrente simultanée (`Promise.all`) — un seul traitement, l'autre reçoit `duplicate:true`. |
| Out-of-order | Voir « webhook en retard » ci-dessus | Gap confirmé, pas de correctif appliqué dans cette mission (nécessiterait de comparer un timestamp/version avant d'écraser — à faire avec Julien, impact sur le contrat de `synchroniserAbonnement`). |
| Cancel | Portail Stripe uniquement ; retour webhook `customer.subscription.deleted`/`updated` (cancel_at_period_end) → `abonnement_annulation_prevue_at` posé | OK, testé. |
| Reactivate | Le client met à jour sa carte dans le Portail → Stripe retente → `invoice.paid` → `actif` | OK en théorie ; dépend du comportement de relance Stripe (non vérifiable sans Stripe live). Aucune action « réactiver mon abonnement » explicite côté app pour l'abonnement de base (seule l'option IA a `reactiverOptionIAAction`). |
| Erreur de traitement (ex. entreprise introuvable) | La ligne de réservation `abonnement_evenements` est supprimée en cas d'erreur → un retry Stripe peut retraiter proprement | **Bon réflexe**, testé. |

---

## 5. Idempotence

Le pattern est correct et robuste : **insertion réservante** dans `abonnement_evenements` (contrainte
`unique(stripe_event_id)`) avant tout traitement métier, code Postgres `23505` détecté explicitement pour
répondre `{received:true, duplicate:true}` sans rejouer les effets de bord. En cas d'erreur applicative
après réservation, la ligne est supprimée pour ne pas bloquer un retry Stripe légitime.

Testé (`route.test.ts`) :
- Rejeu séquentiel du même `event.id` → 2ᵉ appel neutre.
- Rejeu **concurrent** (deux requêtes HTTP simultanées, même `event.id`) via `Promise.all` → exactement un
  traitement gagne.
- Rollback de la réservation sur erreur de traitement.

Point non couvert par construction (et hors de portée d'un test local) : le comportement réel de Stripe
en cas de livraison dupliquée à quelques millisecondes d'écart sur une infra à plusieurs instances
Vercel — le test valide la logique applicative, pas la vraie concurrence réseau/DB Postgres (qui, elle,
utilise une vraie contrainte unique et se comporterait de façon équivalente).

---

## 6. Entitlements

`permissionIncluseDansOffre()`/`filtrerPermissionsSelonOffre()` (`src/lib/tarification.ts:227-247`) sont
branchées dans `src/lib/permissions.ts` et `src/lib/supabase/proxy.ts` : un changement de
`entreprises.abonnement_offre` (posé par le webhook) se répercute donc bien sur les droits effectifs, sans
action manuelle. Les offres historiques (`essentiel`, `premium` — contrats gelés, cf. §2.3) sont
volontairement exemptées de restriction (`PERMISSIONS_NON_LIMITEES`) puisqu'elles n'ont jamais eu de
notion de modules limités — comportement cohérent, pas un bug.

Pas de test d'entitlement cross-app trouvé indiquant qu'un changement de plan sur l'app BTP affecterait un
autre produit Liria — mais rien dans le code n'indique non plus qu'un autre produit lit `abonnement_offre`
de cette base ; sans visibilité sur un éventuel autre dépôt, ce point ne peut être qualifié « local »
au-delà de : *aucune fuite d'écriture croisée trouvée dans ce dépôt*.

---

## 7. Customer Portal

`creerSessionPortailStripe()` (`src/lib/stripe-abonnement.ts:223-228`) crée une session
`billing_portal/sessions` **sans paramètre `configuration`** — elle utilise donc la configuration par
défaut du compte Stripe, réglée exclusivement dans le Dashboard Stripe (hors dépôt). C'est le point
central du blocage self-service : impossible de vérifier localement si cette configuration autorise
« changer d'offre », quelles offres y sont proposées, ni si l'annulation immédiate vs. en fin de période
est permise.

Le Portail est câblé à deux endroits légitimes :
- `/abonnement` (`ouvrirPortailAbonnementAction`, retour vers `/abonnement`)
- `/abonnement-suspendu` (`ouvrirPortailAbonnementSuspenduAction`, retour vers `/abonnement-suspendu`,
  accessible même en statut suspendu pour régulariser la carte)

Les deux vérifient la permission `gerer_parametres` (ou l'accès support) côté serveur avant de générer la
session — correct.

**`REMOTE STRIPE TEST REQUIRED` sur ce point précis** : sans accès au Dashboard Stripe (hors de portée de
cette mission « aucun Stripe live »), impossible de confirmer si le Portail est configuré pour
change-of-plan self-service. Recommandation : créer une `configuration` de portail explicite via l'API
Stripe (`billing_portal/configurations`), listant exactement les 8 Price IDs commercialisés
(`OFFRES_ABONNEMENT_COMMERCIALISEES`), et passer son `id` en paramètre `configuration` de
`creerSessionPortailStripe` plutôt que de dépendre d'un réglage Dashboard implicite — ça rendrait ce point
vérifiable et versionné dans le code plutôt que dans un compte externe.

---

## 8. Self-service UI — vérification point par point

| Besoin | Statut | Détail |
|---|---|---|
| Voir l'offre actuelle | ✅ | `/abonnement` affiche offre, statut, échéance, détail comptes, usage stockage/IA |
| Changer d'offre | ❌ **bloquant** | Aucune action in-app ; dépend intégralement d'un Portail Stripe non vérifiable (§3, §7) |
| Annuler | ⚠️ | Portail Stripe uniquement, pas de bouton « résilier » dans l'app elle-même — fonctionnel *si* le Portail est bien configuré, invérifiable localement |
| Voir le statut | ✅ | Statut, échéance, dernière facture (lien Stripe hébergé), historique tarifaire, `AbonnementBanner`/`AbonnementCountdown` avertissent avant suspension |
| Sans opérateur plateforme | ⚠️ | Vrai pour souscription initiale, part variable (comptes/IA), et paiement/facture — faux pour changement d'offre |

---

## 9. Sécurité — isolation tenant et intégrité du paiement

### 9.1 Isolation cross-tenant (A ne peut pas modifier B) — ✅ correcte

Deux couches, vérifiées :

1. **Application** : `verifierDroitAbonnement()` (`src/app/actions/abonnement.ts:20-27`) dérive
   `entrepriseId` exclusivement de `getContexteEntreprise()` (session serveur, jamais d'une entrée
   cliente/FormData). Aucune action self-service n'accepte un `entrepriseId` ou `subscriptionId` en
   paramètre client.
2. **Base de données** : la policy RLS `UPDATE` sur `entreprises` combine (a) la policy permissive
   historique `est_membre_actif(id)` et (b) une policy **restrictive** ajoutée en
   `20260713000043_permissions_rls_gestion.sql` : `a_permission(id,'gerer_parametres')`. Une policy
   restrictive s'ET-combine avec les permissives — donc même avec (a) seule, un membre d'une **autre**
   entreprise ne satisfait jamais `est_membre_actif(id)` pour la ligne visée. **Aucun chemin trouvé
   permettant à un tenant A d'écrire sur la ligne `entreprises` d'un tenant B.**

Le webhook (écriture via `createAdminClient()`, rôle `service_role`, RLS bypassée par design) résout
l'entreprise cible depuis les identifiants Stripe eux-mêmes (`metadata.entreprise_id`,
`stripe_subscription_id`, `stripe_customer_id`) — jamais depuis une entrée utilisateur — donc pas de
confusion tenant possible côté serveur non plus.

### 9.2 Intégrité du paiement pour le tenant lui-même — ❌ gap confirmé (bloquant, §Verdict)

La policy `UPDATE` sur `entreprises` **ne restreint aucune colonne** — Postgres RLS est ligne par ligne,
pas colonne par colonne, et aucun `GRANT UPDATE (colonnes...)` limité n'a été trouvé (`grep` sur toutes les
migrations). Résultat : **tout utilisateur ayant la permission `gerer_parametres` sur sa propre
entreprise** — exactement le rôle que `verifierDroitAbonnement()` autorise à cliquer sur « Gérer mon
abonnement » — peut, via le SDK Supabase (`PATCH` REST direct, contournant complètement l'UI et les server
actions), écrire n'importe quelle valeur dans `abonnement_statut`, `abonnement_offre`,
`abonnement_echeance`, `abonnement_essai_fin`, `stripe_customer_id`, `stripe_subscription_id`,
`derniere_facture_*`, etc. de **sa propre ligne**.

Concrètement : un client peut s'auto-passer en `abonnement_statut='actif'`, `abonnement_offre='entreprise'`
(l'offre la plus chère, donc la plus permissive en entitlements), `abonnement_echeance='2099-01-01'`,
sans jamais payer ni passer par Checkout. Ce n'est pas une fuite cross-tenant (§9.1 reste vrai), mais c'est
une **rupture d'intégrité du paiement en self-service** — précisément le périmètre de cette mission.

Aucun trigger, aucune contrainte `CHECK` référençant Stripe, aucune vue matérialisée ne fait obstacle : ces
colonnes sont censées n'être écrites que par le webhook (`service_role`, qui bypasse RLS), mais RLS ne
l'impose pas pour les autres écrivains autorisés à modifier la ligne.

**Correctif recommandé** (non appliqué dans cette mission — modification de schéma de sécurité, à valider
avec Julien avant merge) : soit (a) restreindre la policy `UPDATE` permissive aux seules colonnes
non-facturation via `GRANT UPDATE (nom, adresse, code_postal, ville, ...) ON entreprises TO authenticated`
et retirer les colonnes `abonnement_*`/`stripe_*`/`derniere_facture_*` de la liste, soit (b) déplacer ces
colonnes vers une table séparée (`abonnements_entreprises` existe déjà et n'est, elle, accessible en
écriture que par `service_role` — cf. `20260723000142_tarification_abonnements.sql:243-245`, aucune policy
`for update`/`for all` sur cette table pour `authenticated`) et n'y laisser que du `select`. L'option (b)
est la plus propre : `abonnements_entreprises` a déjà la bonne posture RLS (lecture seule pour les
gestionnaires, écriture uniquement service-role) — c'est `entreprises` qui a hérité de colonnes sensibles
sur une policy pensée pour des données non sensibles (nom, adresse...).

---

## 10. Tests créés

Avant cette mission : **zéro test au niveau route** pour le webhook abonnement (seules les fonctions pures
qu'il appelle — mapping prix/statut, calcul de stockage — étaient testées). Ajouté dans cette mission,
**sans aucun appel réseau réel** (mocks de `fetch` et d'un faux client Supabase admin en mémoire) :

- `src/test/fakeSupabaseAdmin.ts` — faux client Supabase (service role) réutilisable : reproduit
  `.eq/.in/.is`, `.single()/.maybeSingle()`, `insert/update/upsert/delete` (avec vraies contraintes
  d'unicité simulées) et `.rpc()`, assez fidèlement pour exécuter le vrai code de production sans base
  réelle.
- `src/app/api/stripe/abonnement/webhook/route.test.ts` (12 tests) : signature invalide, secret absent,
  rejet des événements Connect, `checkout.session.completed` bout-en-bout (verrouillage du prix
  contractuel inclus), transitions de statut (`active`, `invoice.paid`, `invoice.payment_failed`,
  `invoice.payment_action_required`), duplicate séquentiel et **concurrent**, **webhook hors-ordre**
  (caractérise le gap §4), et rollback de la réservation d'idempotence sur erreur.
- `src/lib/stripe-abonnement.test.ts` (+12 tests) : `changerOffreStripe` (upgrade/downgrade avec
  proration, échec propre si le prix cible n'est pas configuré) et `reconcilierAbonnementStripe` (ajout et
  suppression de la ligne « comptes supplémentaires » selon le dépassement de quota).

Résultat : **120/120 tests passent** (`npx vitest run`), `npx tsc --noEmit` propre, `eslint` propre sur les
fichiers ajoutés.

Ce qui reste **volontairement hors de portée locale** (à faire en `REMOTE STRIPE TEST`, jamais en
production) : un vrai test end-to-end contre le compte Stripe test (clé `sk_test_...`), avec Checkout réel,
webhook réellement signé et livré par Stripe, et vérification de la configuration effective du Customer
Portal — impossible à simuler fidèlement sans y toucher, cf. §7.

---

## 11. Synthèse actionnable

| # | Constat | Sévérité | Local (code) ou Remote (Stripe) |
|---|---|---|---|
| 1 | Pas d'action self-service pour changer d'offre (`changerOffreStripe` jamais appelée) | Bloquant | Local (ajouter l'action) + Remote (configurer le Portail en secours) |
| 2 | RLS `entreprises` permet à un admin d'entreprise de s'auto-attribuer un abonnement sans payer | Bloquant | Local (restreindre les colonnes ou déplacer vers `abonnements_entreprises`) |
| 3 | Suspension immédiate sur 1er échec/3DS requis, sans délai de grâce ni distinction | Bloquant (produit) | Local (logique webhook) + décision produit à trancher |
| 4 | Tarif annuel « Entreprise » incohérent avec les 4 autres offres (~10 % vs 0 % de remise) | Majeur | Local |
| 5 | Copie « −20 % » ne correspond à aucune remise réelle | Majeur | Local |
| 6 | `.env.local.example` obsolète (variables Mini/Business/Entreprise absentes) | Majeur | Local |
| 7 | Webhook hors-ordre : aucune protection anti-écrasement par un événement périmé | Mineur/Majeur selon fréquence réelle | Local |
| 8 | Configuration réelle du Customer Portal (plan switch autorisé ? bons prix listés ?) | Inconnu, bloquant si mal configuré | **Remote uniquement** |
| 9 | Isolation cross-tenant, idempotence, entitlements, dunning de base | Conforme | — |

**Verdict final : `SELF_SERVICE BILLING BLOCKED`** — les points 1-3 sont bloquants et corrigibles
localement sans Stripe live ; le point 8 (`REMOTE STRIPE TEST REQUIRED`) est un blocage supplémentaire
potentiel mais non testable dans cette mission, et ne change pas le fait que le produit n'est pas encore
prêt pour un self-service complet et sûr.
