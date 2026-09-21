# REMISES-CLIENTS-V1 — Remises commerciales depuis Compte plateforme

## 1. Contexte et périmètre

Un administrateur plateforme (compte ELSATIA, table `plateforme_admins`) peut accorder une
remise commerciale ponctuelle à une entreprise cliente précise, directement depuis
`/plateforme`. La remise s'applique sur l'abonnement Stripe Test de cette entreprise sans
jamais modifier les Prices officiels ni la grille tarifaire publique (`src/lib/tarification.ts`).

Le mécanisme existait déjà avant ce lot (migration `20260723000132_remises_plateforme.sql`,
fonctions `creerCouponRemise`/`appliquerCouponAbonnement`/`retirerCouponAbonnement` dans
`src/lib/stripe-abonnement.ts`). Ce lot a corrigé un bug bloquant qui empêchait la fonctionnalité
de marcher en pratique, ajouté la traçabilité manquante (motif interne, créé par, audit log),
le contrôle RLS manquant, l'affichage client, et une confirmation avant action.

## 2. Découverte critique : billing_mode "flexible"

Le compte Stripe de la plateforme fonctionne en `billing_mode: "flexible"` (mode par défaut des
nouveaux comptes Stripe). Sous ce mode, le paramètre classique `coupon=` sur
`POST /v1/subscriptions/{id}` est **rejeté** :

```
"With `billing_mode.type=flexible` set on a subscription, the following parameters are
not supported: coupon."
```

C'est exactement ce que faisait `appliquerCouponAbonnement` avant ce lot — la fonctionnalité
était donc **totalement non fonctionnelle** en Preview et en Production, malgré un code qui
semblait complet à la lecture. Corrigé en remplaçant le paramètre par la forme moderne
`discounts[0][coupon]=<id>`, qui :
- s'applique correctement sous `billing_mode: "flexible"` ;
- remplace automatiquement toute remise déjà posée sur l'abonnement (même sémantique
  « un seul geste commercial actif à la fois » que l'ancien paramètre `coupon=`, vérifié
  empiriquement en appliquant deux coupons successifs sur le même abonnement Test) ;
- se retire avec l'ancien endpoint `DELETE /v1/subscriptions/{id}/discount`, qui continue de
  fonctionner tel quel sous `billing_mode: "flexible"` (vérifié).

## 3. Portée réelle de la remise : base + comptes supplémentaires

Question posée explicitement par le donneur d'ordre : une remise s'applique-t-elle seulement au
prix catalogue de l'offre, ou aussi aux comptes supplémentaires facturés séparément
(COMPTES-SUPPLEMENTAIRES-V1C) ?

Testé empiriquement avec un abonnement Stripe Test réel portant deux lignes (Mini 79 €/mois +
compte supplémentaire Mini × 2 = 30 €/mois, sous-total 109 €), puis un coupon 10 % appliqué via
`discounts[0][coupon]` et inspecté via l'API Create Preview Invoice
(`POST /v1/invoices/create_preview`) :

| Ligne | Montant | Remise (10 %) |
|---|---|---|
| Abonnement de base (Mini) | 79,00 € | 7,90 € |
| Compte supplémentaire Mini | 30,00 € | 3,00 € |
| **Total** | **109,00 €** | **10,90 €** |

**Conclusion** : une remise sur l'abonnement (`discounts[0]`, niveau subscription) s'applique au
prorata sur **toutes** les lignes de la facture Stripe, y compris les comptes supplémentaires.
C'est le comportement natif de Stripe (aucun calcul applicatif à répliquer côté ELSATIA) et il
est cohérent avec la facturation des comptes supplémentaires : le client ne paie jamais plus que
prévu, et la remise réduit proportionnellement l'ensemble de son abonnement.

L'ancienne mention UI *« S'applique sur l'abonnement de base (Stripe Coupon) »* était donc
inexacte et a été corrigée en *« S'applique au prorata sur le total de la facture Stripe
(abonnement de base et comptes supplémentaires inclus) »*.

## 4. Bug RLS découvert en testant avec un compte admin distinct

`appliquerRemiseAction`/`retirerRemiseAction` lisaient `stripe_subscription_id` via le client
Supabase standard (`createClient()`, soumis à RLS). Or la seule policy SELECT sur `entreprises`
est `"membres voient leur entreprise" for select using (est_membre_actif(id))` : un administrateur
plateforme n'est, par définition, pas membre des entreprises clientes qu'il gère. Résultat : la
lecture renvoyait toujours `null`, et toute tentative d'appliquer une remise à une entreprise
cliente (autre que la sienne) échouait avec *« Cette entreprise n'a pas d'abonnement Stripe
actif »* — même quand l'abonnement existait bel et bien.

Ce bug n'était détectable qu'en testant avec un compte admin **réellement distinct** du
propriétaire de l'entreprise cliente (jamais fait auparavant dans ce lot, conformément à la règle
« ne jamais réutiliser une identité réelle comme fixture »). Corrigé en lisant
`stripe_subscription_id`/`nom` via `createAdminClient()` (contournement RLS légitime : le
contrôle d'autorisation `estPlateformeAdmin()` a déjà eu lieu juste avant, dans la même fonction).

## 5. RLS : un client ne peut pas s'auto-attribuer une remise

Audit complémentaire (§25 du prompt) : la policy `"membres modifient leur entreprise" for update
using (est_membre_actif(id))` autorise un membre actif à modifier **n'importe quelle colonne**
de sa propre ligne `entreprises`, RLS ne filtrant que les lignes, pas les colonnes. Un client
aurait donc pu écrire directement `remise_description`/`remise_valeur` via un appel REST
Supabase direct, sans jamais passer par `plateforme_appliquer_remise` ni par un administrateur
plateforme — un affichage trompeur, sans risque financier direct (Stripe reste la source de
vérité pour la facturation réelle) mais une violation du principe « seul un admin plateforme
accorde une remise ».

Depuis R7.1 (`00243`), la protection est structurelle : les rôles API ne possèdent plus
`INSERT`/`UPDATE` sur les huit colonnes `remise_*`, et un trigger explicite refuse aussi les
contournements par wrapper, `SECURITY DEFINER` générique ou `service_role` direct. Aucun rôle
plateforme, même `total` avec AAL2, n'est exempté. Le seul écrivain est le finaliseur F4, détenu
par le rôle interne `elsatia_discount_f4_writer` (`NOLOGIN`, `NOBYPASSRLS`, sans membre API), après
validation d'une preuve Stripe persistée et liée à l'intention, l'abonnement et la tentative.

**Hors périmètre** : la même policy expose de la même façon toutes les autres colonnes
« admin uniquement » de `entreprises` (`abonnement_statut`, `impaye_signale_at`,
`stripe_customer_id`, etc.). Non corrigé ici — seules les colonnes `remise_*` le sont, car elles
sont l'objet de ce lot. Un audit RLS dédié à la table `entreprises` est recommandé.

## 6. Modèle de données

Migration `20260823000223_remises_clients_v1.sql`, qui étend `20260723000132_remises_plateforme.sql`
sans le remplacer :

- `entreprises.remise_stripe_coupon_id`, `remise_description`, `remise_appliquee_at` : déjà
  existants (source d'affichage rapide sans rappeler Stripe).
- `entreprises.remise_motif_interne` (text) : motif commercial interne, **jamais** sélectionné
  par la page `/abonnement` (client). Uniquement lu par `plateforme_entreprises()`, réservé aux
  administrateurs plateforme.
- `entreprises.remise_cree_par` (uuid → auth.users) : traçabilité de qui a accordé la remise.
- `entreprises.remise_duree_mois` (integer) : mémorisé pour affichage seulement (durée réelle
  gérée par Stripe côté coupon).
- `entreprises.remise_type` / `remise_valeur` : type et valeur bruts, pour calculer un estimé
  « prix remisé » côté client et admin avec la même formule que Stripe (percent_off/amount_off
  sur le sous-total), sans reparser `remise_description`.
- `historique_tarification` : nouvelles entrées `action = 'remise_appliquee' | 'remise_retiree' |
  'remise_expiree'`, `motif` toujours `null` (le motif interne n'est **jamais** écrit dans cette
  table, car elle est déjà lue par `/abonnement` pour la section « changements de tarif » — y
  écrire le motif interne l'aurait exposé au client).
- Trigger `proteger_colonnes_remise` et privilèges de colonnes R7.1 (§5).

Aucune table dédiée `remises_abonnement` n'a été créée : les colonnes ajoutées sur `entreprises`
suffisaient à représenter l'état courant (une seule remise active à la fois, cohérent avec la
limite native de Stripe), et `historique_tarification` sert déjà d'audit log générique.

## 7. Durée : pas de moteur maison

Conformément au principe « ne pas construire un moteur de remise maison si Stripe gère déjà la
durée » : les trois durées (`once`, `repeating` + nombre de mois, `forever`) restent entièrement
gérées par le coupon Stripe. `remise_duree_mois` n'est qu'une mémorisation à but d'affichage
(admin), pas une source de vérité de planification. Aucune colonne `date_fin` n'a été ajoutée.

## 8. Fin de remise (expiration naturelle)

Une remise `once` (consommée après la première facture) ou `repeating` (arrivée à échéance)
disparaît côté Stripe sans qu'aucune action ELSATIA n'ait eu lieu. Le webhook
`customer.subscription.*` (`src/app/api/stripe/abonnement/webhook/route.ts`) appelle désormais
`synchroniserExpirationRemise()` (`src/lib/stripe-abonnement.ts`) à chaque synchronisation : si
l'abonnement Stripe reçu n'a plus de `discounts` actif mais que la fiche entreprise en montre
encore un, la fiche est alignée (colonnes `remise_*` réinitialisées, entrée
`historique_tarification` avec `action = 'remise_expiree'`). Le client repasse automatiquement au
tarif catalogue, sans suppression d'aucune autre donnée.

## 9. Permissions et confirmation

- `appliquerRemiseAction`/`retirerRemiseAction` : gate `estPlateformeAdmin()` en entrée (redirige
  `/dashboard` sinon), motif interne obligatoire (non vide) pour l'application.
- Confirmation avant application : `RemiseConfirmButton` (`src/components/RemiseConfirmButton.tsx`)
  construit un récapitulatif dynamique (entreprise, prix catalogue, remise, prix estimé, durée,
  motif) et le soumet à `window.confirm()` avant de laisser le formulaire se soumettre — même
  pattern que `ConfirmSubmitButton`, déjà utilisé ailleurs dans `/plateforme`.
- Confirmation avant retrait : `ConfirmSubmitButton` existant, message reprenant l'ancien prix,
  le nouveau prix catalogue et l'entreprise concernée.

## 10. Affichage

- **Admin** (`/plateforme`) : bloc « Remise active » avec description, date, durée (si
  `repeating`), indicateur « motif interne enregistré » (survol = motif), bouton retrait avec
  confirmation ; sinon formulaire repliable avec type/valeur/durée/motif interne obligatoire.
- **Client** (`/abonnement`) : si une remise est active, bloc « Remise commerciale active »
  affichant prix catalogue / remise / prix remisé (estimation sur l'abonnement de base et les
  comptes supplémentaires ; précise que les dépassements d'appareils et de stockage, facturés
  séparément, n'y sont pas inclus). Le motif interne n'est **jamais** sélectionné par cette page.

## 11. Tests

- `src/lib/stripe-abonnement.test.ts` : forme exacte des requêtes Stripe (`discounts[0][coupon]`
  et non `coupon=`, endpoint DELETE du retrait, création de coupon pourcentage/montant/durée),
  et `synchroniserExpirationRemise` (rien à faire si discount actif ou absent de remise, efface
  et journalise sinon).
- `src/app/actions/plateforme-remises.test.ts` : permissions (non-admin refusé sans appel
  Stripe), validations (pourcentage > 100, motif interne obligatoire, entreprise sans abonnement
  Stripe), et le happy path (coupon créé, appliqué, RPC appelé avec les bons paramètres).

## 12. Vérification live (Stripe Test + Preview réels)

Fixture jetable `RECETTE-REMISES-V1` (entreprise avec un vrai abonnement Stripe Test Mini via
Checkout, carte `4242 4242 4242 4242`) et un compte administrateur plateforme jetable et
**distinct** du propriétaire de l'entreprise (`recette-remises-v1-admin@example.invalid`, avec sa
propre entreprise-coquille pour satisfaire la garde d'accès `/onboarding`), conformément à la
règle « ne jamais réutiliser une identité réelle comme fixture ».

Cycle complet vérifié :
1. Admin applique 10 % une fois → coupon Stripe créé, `discounts[0]` posé sur l'abonnement,
   colonnes `entreprises.remise_*` renseignées, entrée `historique_tarification` (`motif = null`).
2. `/abonnement` (propriétaire de l'entreprise) affiche correctement 79,00 € catalogue /
   − 7,90 € remise / 71,10 € remisé, sans jamais montrer le motif interne.
3. Tentative directe (JWT du propriétaire, hors admin) d'écrire une fausse remise sur sa propre
   ligne `entreprises` → bloquée par le trigger, valeurs réelles inchangées.
4. Admin retire la remise → coupon Stripe retiré (`discounts: []`), colonnes réinitialisées,
   entrée `historique_tarification` (`remise_retiree`).
5. Nettoyage complet : abonnement annulé, client et coupon Stripe supprimés, entreprises et
   comptes jetables supprimés en base — zéro résidu vérifié.

## 13. Hors périmètre / connu et différé

- Audit RLS complet de la table `entreprises` (au-delà des colonnes `remise_*`) — voir §5.
- Interaction remise / changement d'offre, remise / trial, remise / Customer Portal : non testées
  en direct dans ce lot (le mécanisme Stripe natif — `discounts[0]` sur la subscription —
  survit nativement à un changement de Price sur la même subscription et à un essai en cours,
  mais cela n'a pas été vérifié empiriquement ici, faute de temps ; à confirmer avant un usage
  commercial intensif du changement d'offre combiné à une remise active).
- Comptes supplémentaires facturés en `invoiceitems` séparés (dépassement appareils, stockage) :
  l'estimation client `/abonnement` les exclut explicitement, leur inclusion réelle dans le
  prorata de la remise Stripe n'a pas été testée (ils ne font pas partie de la subscription elle
  -même, contrairement aux comptes supplémentaires réconciliés par
  COMPTES-SUPPLEMENTAIRES-V1C).
