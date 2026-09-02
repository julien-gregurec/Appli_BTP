# ELSATIA — Modular billing & active-person capacity readiness V1

Date : 2026-09-02. **Audit + architecture + plan. Aucune implémentation.**
Aucune migration, aucun code, aucun objet Stripe, aucun Stripe Live, aucune modification de
tarif forfait, aucun prix module inventé, aucune action Production / Supabase / Vercel.

Base auditée : `docs/elsatia-modular-billing-capacity-readiness-v1` créée depuis
`feat/preprod-e2e-runbook-integration-v1` @ `6df3ebd13abab6aa1391bdc4fe73da9b3bb31415`.

> **Verdict en une phrase** : l'architecture actuelle **supporte** un modèle « forfait de base +
> capacité + modules + consommation », **sans refonte**. Tous les briques nécessaires existent
> déjà à l'état partiel (catalogue de plans versionné, `entreprise_feature_flags` par
> organisation, options tarifaires, abonnement Stripe multi-lignes, politique de quota IA). Le
> travail avant commercialisation est **additif** et se limite à quelques décisions produit + un
> garde-fou base de données pour la limite de personnes actives.

---

## 1. État actuel du billing

| Élément | Existe | Hardcodé au plan | Achetable séparément | Dette |
|---|:--:|:--:|:--:|---|
| Catalogue de plans (DB `plans_abonnement`, versionné, `valide_du/valide_au`, `devis_obligatoire`, check de cohérence tarif) | ✅ | — | — | **doublon** avec `OFFRES_TARIFAIRES` (code) : deux sources de vérité, atténué par `historique_tarification` |
| Grille tarifaire (code `OFFRES_TARIFAIRES` : `base`, `prixMensuel/AnnuelCentimes`, `comptesInclus`, `parCompteSup`, `operationsIAIncluses`, `stockageGoInclus`, `fonctionnalites[]`) | ✅ | oui | — | `fonctionnalites[]` = permissions incluses **par plan** (couplage plan↔modules) |
| Options (`OPTIONS_TARIFAIRES` : compte_terrain 500, chef_equipe 900, administratif 1500, stockage 1900, sync bancaire 2900, credits_ia 2900, ia_intensive 7900) | ✅ | — | partiel | prix **re-codés en dur** dans `calculerTarifAbonnement` (logique tarifaire dupliquée) |
| Abonnement Stripe multi-lignes (`creerSessionAbonnementStripe` + `reconcilierAbonnementStripe` ajoute une ligne « comptes sup. » ; `ajouterOptionIAAbonnement` ajoute une ligne IA) | ✅ | — | oui (compte sup., option IA) | env `STRIPE_PRICE_COMPTE_SUP_{MINI..ENTREPRISE}_*` **absentes en Vercel** → mécanisme inerte aujourd'hui (cf. P15) |
| `entreprise_feature_flags` (DB, `(entreprise_id, feature_key)`, `statut ∈ {active,beta,experimental,disabled}`, `active`) | ✅ | — | — | pas de `source`, `valide_du/jusqu`, `reference_externe` (Stripe), `motif`, `attribue_par` |
| `FEATURE_CATALOGUE` (code, CORE/BETA/DISABLED, `plans?: string[]`, `adminOnly`, `visibleByDefault`) + `activeFeaturesForCompany` (plan + override) | ✅ | `plans?` | override org | statuts ≠ ceux de la table (`disabled` vs `active/beta/experimental/disabled`) |
| Comptes supplémentaires (`VARIABLES_PRIX_COMPTE_SUP` par plan : Mini 15 / Pro 12 / Business 9 / Entreprise 9 €) | ✅ | par plan | oui (quantité de ligne Stripe) | représente « personne active avec compte applicatif » — voir § 4/§ 12 |
| Limite « comptes inclus » | ✅ (constante de plan) | oui | — | **aucun garde-fou** : dépassement facturé, jamais bloqué (voir § 7) |
| Quota IA (`ia_politique_quota ∈ {blocage, depassement_facture, achat_pack}`, `operationsIAIncluses`, `journal_ia`, `ia_credits_achetes`, `abonnement_alerte_quota_ia`, `ia_plafond_cout_mensuel_ht`) | ✅ | allocation par plan | pack IA | **le modèle de consommation le plus mature** — à généraliser |
| Dépassement stockage (`calculerFacturationStockage` : Go au-delà du quota × 0,5 €) | ✅ | quota par plan | overage mensuel | ad hoc |
| Dépassement appareils (`calculerDepassementsAppareilsFacturables` : 2 appareils/compte offerts, surplus facturé) | ✅ | 2/compte | overage | ad hoc |
| Essai (30 j, `subscription_data[trial_period_days]`, `payment_method_collection: "always"`) | ✅ | 30 j | — | `ABONNEMENTS_PUBLICS_OUVERTS=false` → parcours self-service fermé |
| Upgrade / downgrade (`changerOffreStripe` change le Price de base) | ✅ | — | — | pas d'état `over_capacity`, pas de blocage post-downgrade |
| Recommandation d'offre (`recommanderOffre(besoins, nbEmployes)`, `entreprise_besoins.offre_recommandee`) | ✅ | — | — | recommandation **au signup** (besoins), pas d'optimiseur live « votre config coûterait X € de moins sur Pro » |
| Remise / geste commercial (`entreprises.remise_*`, RPC plateforme, `historique_tarification`, coupon Stripe) | ✅ | — | — | ciblé « remise sur l'abonnement », pas « module offert » |
| Boutique (`boutique_produits`, `boutique_commandes`, `boutique_lignes_commande`) | ✅ | — | — | séparée du billing SaaS — **bien** (§ 29) |
| Services ponctuels (`SERVICES_MISE_EN_SERVICE` : mise en service 1990 €, install 490 €, import 690 €, config 1500-2500 €, formations) | ✅ (code) | — | ponctuel | pas de suivi de commande de service dédié |

---

## 2. Personnes actives — état actuel

**Définition effective aujourd'hui** : `count(employes)` avec `compte_application_statut ∈
{'actif', 'pause'}` pour l'entreprise. Utilisée par `reconcilierAbonnementStripe`
(`quantite = max(0, count − comptesInclus)`) et `calculerDepassementsAppareilsFacturables`.

Écarts vs la décision produit (§ 5) :

| Doit compter (cible) | Compté aujourd'hui ? |
|---|---|
| dirigeant, employé bureau, ouvrier, chef d'équipe, conducteur de travaux, apprenti, intérimaire actif — **avec** compte applicatif actif/pause | ✅ |
| **personne sans login mais présente au planning / pointage** (`employes` sans `utilisateur_id`, ou avec `compte_application_statut` autre que actif/pause mais réellement affectée) | ❌ **non compté** — c'est l'écart principal |
| salarié archivé (`compte_application_statut='ferme'`), ancien salarié, client, fournisseur, candidat, sous-traitant externe, contact | ✅ correctement **exclus** (ne sont pas des `employes` actif/pause) |

→ La limite porte aujourd'hui sur « **personne active avec compte applicatif** », pas sur
« **personne active enregistrée** ». Décision produit à trancher (§ 36 C) : soit la cible reste
« compte applicatif » (statu quo, peu de travail), soit « toute personne affectée » (nécessite
d'inclure les `employes` sans login présents au planning/pointage dans le décompte).

---

## 3. Comptes Auth

- `employes.utilisateur_id` → `auth.users` (nullable). Activation via `activer_compte_employe`
  (numéro d'inscription) puis `changer_statut_compte_application(entreprise, employe, 'actif')`.
- Un `employe` peut exister **sans** `utilisateur_id` (fiche RH, planning, pointage borne) — il
  n'a alors pas de compte de connexion.
- Le compte Auth ≠ personne active : plusieurs `employes` peuvent partager la borne stock ;
  l'admin plateforme a un compte Auth sans être un `employe`.

**Le code distingue bien A (personne) et B (compte Auth)** via `employes` vs `employes.utilisateur_id`.

---

## 4. Les 4 concepts — état

| Concept | Représentation actuelle | Distinct ? |
|---|---|---|
| **A. Personne active** | `employes` `compte_application_statut ∈ {actif,pause}` | ✅ (mais restreint aux comptes applicatifs) |
| **B. Compte de connexion** | `employes.utilisateur_id` → `auth.users` | ✅ |
| **C. Siège / capacité** | **implicite** : `comptesInclus` (plan) + `parCompteSup` (overage auto-facturé) — **pas de compteur `capacite_achetee`, pas de plafond** | ❌ **concept absent en tant que valeur explicite** |
| **D. Habilitation** | 3 couches : `habilitations_applications_utilisateurs` (app), `entreprise_feature_flags` (module org), permissions de rôle (`postes` / `permissions`) | ✅ (mais dispersé) |

→ A / B / D sont distingués ; **C manque** et doit être introduit comme valeur explicite
(`capacite_totale = comptesInclus + capacite_achetee`).

---

## 5. Définition « personne active » — contrat cible proposé

> **Personne active** = ligne `public.employes` de l'entreprise dont l'état la rend
> opérationnelle dans Gestion Pro à l'instant T, qu'elle ait ou non un compte de connexion.

**Compte** (proposé) : `employes` avec `statut_personne ∈ {actif}` — nouvel état RH distinct de
`compte_application_statut` (qui reste le sous-état « a-t-il un accès applicatif »). Une personne
sans login mais affectée à un chantier / présente au planning ou au pointage sur les N derniers
jours **compte**.

**Ne compte pas** : `statut_personne ∈ {archive}` (ex-salarié), personne anonymisée (RGPD),
et toutes les entités non-personnelles (`clients`, `fournisseurs`, `sous_traitants`,
`contacts_clients`, candidats).

Tables concernées : `employes` (source), `affectations` / `sessions_pointage` / `pointages` /
planning (signal « présente sans login »).

**Décision produit requise** : retenir ce contrat élargi, ou conserver la définition actuelle
« personne avec compte applicatif ». Impact chiffré différent selon les clients BTP (beaucoup
d'ouvriers pointent sans se connecter).

---

## 6. Source de vérité du décompte — contrat serveur

Le compteur **ne doit pas** être : calculé uniquement au frontend, basé uniquement sur
`auth.users`, ni sur le nombre d'invitations.

**Contrat proposé** : une fonction SQL canonique
`public.personnes_actives_entreprise(p_entreprise_id uuid) returns integer`
(`SECURITY DEFINER`, `STABLE`, `search_path=public`) qui applique exactement le contrat § 5,
et une vue matérialisée / colonne dénormalisée `entreprises.personnes_actives_cache` rafraîchie
par trigger sur `employes` (et sur les affectations si la définition élargie est retenue).

Toute décision d'autorisation (activation, réactivation, import, checkout) lit **cette fonction**,
jamais un comptage local.

---

## 7. Garde-fou base de données

**État actuel : aucun.** `changer_statut_compte_application` valide seulement
`p_statut in ('actif','pause','ferme')` — pas de vérification de capacité. Le dépassement est
**facturé** (ligne Stripe) au prochain passage du cron de réconciliation, jamais **refusé**.

**Contrat cible** (si la décision « plafond dur » est retenue, § 36 C) : la capacité est
contrôlée dans **toutes** les RPC `SECURITY DEFINER` qui rendent une personne active :

- `changer_statut_compte_application` (→ `actif`)
- `activer_compte_employe`
- l'import de personnes (§ 10)
- toute future RPC de réactivation / duplication

via un appel commun `public.verifier_capacite_personnes(p_entreprise_id, p_delta int)` qui lève
`raise exception 'CAPACITE_PERSONNES_ATTEINTE'` si
`personnes_actives + p_delta > comptesInclus + capacite_achetee` (sauf état `over_capacity`
issu d'un downgrade, qui autorise le maintien mais pas la création — § 8).

Couche : **RPC canonique + fonction de validation partagée**. Un trigger `BEFORE INSERT/UPDATE`
sur `employes` en filet de sécurité (défense en profondeur), mais la RPC reste le point
d'entrée. `service_role` : les mutations passent par les mêmes RPC ; aucun `GRANT` direct
d'`UPDATE employes.compte_application_statut` à `authenticated` (déjà le cas — cf. lot ACL 255).

Aucune vérification UI seule ne suffit.

---

## 8. Downgrade — règle officielle

**Un downgrade ne supprime jamais une personne.** État à matérialiser :
`entreprises.etat_capacite ∈ {ok, over_capacity}`.

- `capacite_totale = comptesInclus(nouveau plan) + capacite_achetee`.
- Si `personnes_actives > capacite_totale` après downgrade → `etat_capacite = over_capacity`.
- Conséquences de `over_capacity` :
  - les personnes actuelles restent **toutes** accessibles ;
  - **aucune** suppression / anonymisation automatique ;
  - **aucune** nouvelle activation / création / réactivation (`verifier_capacite_personnes`
    refuse tant que `over_capacity`) ;
  - l'entreprise doit **archiver** des personnes ou **acheter de la capacité** pour repasser
    `ok`.
- Facturation : soit la ligne « comptes sup. » Stripe reflète le surplus réel (modèle
  pay-as-you-grow, statu quo), soit `over_capacity` bloque et n'ajoute rien (modèle plafond
  dur). **Décision produit** (§ 36).

---

## 9. Réactivation

`employe` archivé → `changer_statut_compte_application(..., 'actif')` (ou une future
`reactiver_personne`). Doit **recompter** comme personne active et **passer par
`verifier_capacite_personnes(p_entreprise_id, +1)`**. Si capacité pleine ou `over_capacity` :
refus propre (`CAPACITE_PERSONNES_ATTEINTE`), message UX § 25, aucune donnée touchée.

---

## 10. Import

Auditer `src/app/(app)/parametres/import` + actions d'import RH. Contrat cible :

- **Validation avant écriture** : compter les lignes valides, appeler
  `verifier_capacite_personnes(p_entreprise_id, +N)`.
- **Transaction fail-closed** : si `N` dépasse la capacité restante → **rien** n'est importé
  (ou seul le sous-ensemble explicitement confirmé), jamais d'import partiel silencieux.
- **Rapport** : lignes importées / lignes refusées (avec motif : capacité, doublon, données
  invalides). L'utilisateur choisit : réduire la sélection, acheter de la capacité, ou annuler.

---

## 11. Places supplémentaires

Décision produit : **tous les forfaits** peuvent acheter de la capacité. Modèles à prévoir
(prix **non validés**, ne pas coder 4,90 / 19,90 / 34,90) :

- `+1 personne` (unitaire, quantité de ligne Stripe)
- `pack +5`, `pack +10` (Price dédiés ou quantité)

Architecture : `capacite_totale = comptesInclus + capacite_achetee`. `capacite_achetee` =
somme des lignes Stripe « capacité » actives de l'abonnement, réconciliée par le webhook (§ 19).
L'architecture actuelle (`reconcilierAbonnementStripe` gère déjà une ligne de quantité)
**supporte** ce modèle — il faut le rendre explicite (colonne `capacite_achetee` + mapping
Price + réconciliation) au lieu de recalculer une quantité d'overage à la volée.

---

## 12. Comptes supplémentaires existants — clarification critique

`VARIABLES_PRIX_COMPTE_SUP_{MINI:15, PRO:12, BUSINESS:9, ENTREPRISE:9}` représente, dans le code
actuel : **une personne active supplémentaire disposant d'un compte applicatif**
(`employes` `compte_application_statut ∈ {actif,pause}` au-delà de `comptesInclus`), facturée à
l'unité via la quantité d'une ligne d'abonnement Stripe, recalculée quotidiennement par le cron.

Ce n'est **pas** : un compte Auth brut, ni un siège acheté explicitement, ni une personne sans
login. C'est le **germe** de la « capacité achetée » mais en mode *overage automatique* (pas de
plafond, pas d'étape de consentement).

**Ne pas réutiliser ce mécanisme tel quel** pour la capacité cible avant d'avoir tranché :
plafond dur + achat explicite (nouveau) **vs** overage auto (statu quo). Les env vars
`STRIPE_PRICE_COMPTE_SUP_*` sont par ailleurs absentes de Vercel → le mécanisme est **inerte**
aujourd'hui (lot CODEX `ELSATIA-STRIPE-TEST-ANNUAL-ENV-ALIGNMENT-V1` et P15 § 7).

---

## 13. Modules à la carte — catalogue cible (prix non fixés)

Stock · Planning avancé · Pointage · Gestion chantier · Scan/OCR · Notes de frais · Véhicules ·
Matériel/outillage · Maintenance · Safety · Forms · Signature · Connect · Sauvegarde renforcée ·
Stockage supplémentaire · IA · Automations · Facturation électronique · Analyse avancée de
rentabilité.

Substrat existant : `FEATURE_CATALOGUE` (clés produit) + `entreprise_feature_flags` (activation
par organisation). Il faut : (a) une entrée catalogue par module vendable (`modules_elsatia`
ou extension de `plans_abonnement`/`FEATURE_CATALOGUE` avec `vendable`, `billing_model`,
`stripe_price_key`), (b) le lien Stripe (§ 17), (c) la fenêtre de validité et la source (§ 15-16).

---

## 14. Module ≠ permission — contrat

Trois niveaux, tous déjà représentés séparément :

1. **Entitlement organisation** : `entreprise_feature_flags(entreprise_id, feature_key).active`
   (« l'entreprise a le module »).
2. **Habilitation utilisateur** : `habilitations_applications_utilisateurs` (app) et/ou une
   future `habilitations_modules_utilisateurs(entreprise_id, utilisateur_id, feature_key)`
   (« cet utilisateur peut voir le module »).
3. **Permission métier** : `permissions` / rôle de poste (`acces_stock`, `gerer_stock`, …)
   (« cet utilisateur peut faire telle action dans le module »).

Invariant : `Entreprise possède Stock` ⇏ tous les salariés voient Stock. La consommation
d'un module se lit **serveur** = (1) ∧ (2) ∧ (3).

---

## 15. Modules inclus dans un forfait — modèle cible

Un module porte un **état par entreprise** (extension de `entreprise_feature_flags`) :

| Champ | Rôle |
|---|---|
| `feature_key` | identité du module |
| `origine ∈ {inclus_plan, achete, essai, offert, migration, desactive}` | d'où vient le droit |
| `valide_du` / `valide_jusqu_au` | fenêtre (essai temporaire, promo, migration) |
| `reference_externe` | id de la ligne d'abonnement Stripe (si `achete`) |
| `motif` / `attribue_par` | audit (geste commercial) |

`inclus_plan` est dérivé de `FEATURE_CATALOGUE[key].plans` (ou d'une table
`plan_modules_inclus`). **Ne pas lier un module à un seul plan en dur** : `plans` reste une
liste, et un override `achete`/`offert` prime toujours.

---

## 16. Override commercial

Étendre le pattern déjà utilisé pour les remises (`entreprises.remise_*` +
`historique_tarification` + RPC plateforme + coupon Stripe) aux modules et à la capacité :
`origine ∈ {offert, migration, essai}` + `motif` + `valide_du/jusqu` + `attribue_par` +
journalisation. **Aucun hardcode par email / entreprise** (déjà la règle, cf. lots ACL/MFA).

---

## 17. Billing composable — cible

`subscription` de base **+** `subscription_items` :

```
Base Pro                (STRIPE_PRICE_PRO_MENSUEL, qty 1)
+ Personnes sup.        (STRIPE_PRICE_CAPACITE_{plan}_MENSUEL, qty N)
+ Module Stock          (STRIPE_PRICE_MODULE_STOCK_MENSUEL, qty 1)
+ Module Scan           (STRIPE_PRICE_MODULE_SCAN_MENSUEL, qty 1)
+ Stockage 50 Go        (STRIPE_PRICE_STOCKAGE_MENSUEL, qty 1)
```

L'architecture actuelle **le permet déjà partiellement** : `reconcilierAbonnementStripe` sait
créer / mettre à jour / supprimer une ligne d'abonnement selon un état applicatif, et
`ajouterOptionIAAbonnement` ajoute une ligne au même intervalle de facturation. Il faut
généraliser : une table de mapping `catalogue → STRIPE_PRICE_*` + une réconciliation qui
synchronise **toutes** les lignes (capacité, modules, stockage) et pas seulement les comptes sup.

Contrainte connue : `changerOffreStripe` change la ligne de base ; les autres lignes suivent
l'intervalle (mensuel/annuel) de la base — cohérent.

---

## 18. Stripe — mapping cible (AUCUN objet créé dans ce lot)

| Catégorie | Price Stripe | Variable d'env | Quantité |
|---|---|---|---|
| Forfait de base | `STRIPE_PRICE_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` | existant | 1 |
| Capacité (personnes) | `STRIPE_PRICE_CAPACITE_{plan}_{periodicite}` (ou pack) | **à créer** | N |
| Module | `STRIPE_PRICE_MODULE_{clé}_{periodicite}` | **à créer** | 1 |
| Consommation (IA, stockage, OCR, SMS, signature) | `STRIPE_PRICE_USAGE_{type}_{periodicite}` ou `invoiceitems` mensuels | partiel (IA, stockage, appareils via `invoiceitems`) | mesurée |

Webhook actuel : `stripe-webhook-environment.ts` (`STRIPE_WEBHOOK_EXPECTED_MODE`), idempotence
sur chaque appel, attestation Ed25519 (`stripe_state_attestation`), `observerRemiseDepuisAbonnement`
fail-closed. Contrainte : le webhook `abonnement` traite les changements de subscription ; il
faut qu'il projette **chaque ligne** vers l'état applicatif (§ 19), pas seulement l'offre.

---

## 19. Webhook / entitlements — contrat

Sur `customer.subscription.updated` / `invoice.paid` :

1. lire les `items` de la subscription (base + capacité + modules + usage) ;
2. pour **chaque ligne**, résoudre via le mapping § 18 → `(type, clé, quantité, période, statut)` ;
3. projeter serveur :
   - base → `entreprises.abonnement_offre` + `abonnement_statut` + période ;
   - capacité → `entreprises.capacite_achetee` ;
   - module → upsert `entreprise_feature_flags(feature_key, origine='achete', reference_externe=item.id, valide_du/jusqu)` ;
   - usage → `included_allowance` du module/plan ;
4. recalculer `etat_capacite` (§ 8) ;
5. journaliser (§ 27).

Les droits applicatifs restent **déterminés côté serveur** à la lecture (`a_permission`,
`activeFeaturesForCompany`, futures `verifier_capacite_personnes`) — le webhook ne fait que
mettre à jour l'état, jamais autoriser directement.

---

## 20. Consommation — modèle (non développé)

Généraliser le modèle IA existant. Table cible `consommations_entreprises` :

| Champ | Rôle |
|---|---|
| `entreprise_id`, `usage_type` (`ia`, `ocr`, `sms`, `signature`, `stockage`, `efacture`) | clé |
| `periode` (mois) | fenêtre |
| `included_allowance` | inclus (dérivé plan/module) |
| `consumed` | mesuré serveur (append-only source, ex. `journal_ia`) |
| `overage = max(0, consumed − included_allowance)` | dépassement |
| `politique ∈ {blocage, depassement_facture, achat_pack}` | comportement (déjà pour l'IA) |
| `billing_source` | `invoiceitems` Stripe / pack / inclus |

L'IA a déjà : `operationsIAIncluses`, `journal_ia`, `ia_politique_quota`, `ia_credits_achetes`,
alertes 70/90, `ia_plafond_cout_mensuel_ht`. Le stockage a `calculerFacturationStockage`. Les
appareils ont `calculerDepassementsAppareilsFacturables`. → 3 mécanismes ad hoc à **unifier**
sous ce contrat.

---

## 21. Crédits / wallet

- **A. Crédits prépayés** : existe pour l'IA (`ia_credits_achetes`).
- **B. Consommation mesurée + overage en fin de mois** : dominant (stockage, appareils).

**Recommandation V1** : **modèle B** partout (mesuré + `invoiceitems` mensuels), avec le
wallet prépayé conservé **uniquement** pour l'IA (déjà en place). Un wallet générique multi-usage
est une complexité inutile pour la V1.

---

## 22. Recommandation de changement de forfait

Aujourd'hui : `recommanderOffre(besoins, nbEmployes)` au signup (questionnaire). **Manque** :
un optimiseur **live** qui, à partir de la config réelle (`base + modules + capacité +
consommation moyenne`), calcule le coût sur Mini/Pro/Business/Entreprise et affiche
« Avec votre configuration actuelle, Pro serait 12 € moins cher ».

Contrat : fonction pure `simulerCoutParPlan(config)` réutilisant **le catalogue canonique**
(§ 23), affichée sur la page abonnement. **Recommandation seulement** — aucun upgrade forcé
sauf limite technique réellement justifiée (ex. un module n'existe que sur un plan — à éviter
justement, § 15).

---

## 23. Simulateur de prix

Un seul calculateur `calculerTarifAbonnement(plan, personnes, modules[], consommationEstimee)`
consommant le **catalogue canonique unique** (idéalement `tarification.canonical.json` étendu
aux modules/capacité/usage, cf. lot `ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1`), utilisé
**à la fois** par le simulateur public, la page abonnement et le mapping checkout.

Dette actuelle : `calculerTarifAbonnement` re-hardcode les prix d'options (500/900/1500/…)
au lieu de lire `OPTIONS_TARIFAIRES` → **logique tarifaire dupliquée** à résorber avant d'ajouter
les modules.

---

## 24. UI abonnement — sections cibles (ne pas refaire l'UI maintenant)

Page actuelle : `src/app/(app)/abonnement/page.tsx` (offre, statut, comptes inclus/facturables,
remise, comparatif, FAQ, portail Stripe). Sections à prévoir :

- **Votre forfait** (offre, période, prochaine échéance)
- **Personnes** — `8 / 10 utilisées` (+ `over_capacity` si applicable)
- **Capacité supplémentaire** (achetée, bouton acheter/réduire)
- **Modules inclus** (dérivés du plan)
- **Modules ajoutés** (origine, dates, coût)
- **Consommations** (IA, stockage, … : inclus / consommé / dépassement)
- **Optimiser mon abonnement** (§ 22)

---

## 25. Message capacité — contrat UX

> « Votre abonnement autorise X personnes actives. Vous avez atteint cette limite. »

Actions proposées, **jamais** de suppression automatique :
- Ajouter une capacité (unitaire)
- Acheter un pack (+5 / +10)
- Voir les forfaits (comparatif)
- Archiver une personne (libère une place)

---

## 26. Archivage

`changer_statut_compte_application(..., 'ferme')` → `compte_application_statut='ferme'` : la
personne sort du décompte `{actif,pause}` → **libère une place**. `anonymiser_employe` (RGPD)
conserve la ligne (FK `pointages.employe_id ON DELETE RESTRICT`, idem `sessions_pointage`,
documents, factures) → **historique préservé**.

Vérifié : pointages, sessions de pointage, documents de chantier, liaisons factures/paie
référencent `employe_id` en `ON DELETE RESTRICT` → un `employe` archivé garde tout son historique.

Dette : (a) `ferme` est un statut, pas un `archive_at` daté ni un motif → traçabilité faible ;
(b) la réactivation ne passe par aucun garde-fou de capacité (§ 9) ; (c) si la définition
« personne active » est élargie aux non-connectés (§ 5), il faut aussi un `statut_personne`
distinct de `compte_application_statut`.

---

## 27. Historique billing

Table cible `historique_billing_entreprise` (append-only) :
`entreprise_id`, `type ∈ {module_active, module_desactive, capacite_achetee, capacite_reduite,
plan_change, usage_pack_achete}`, `avant`, `apres`, `origine ∈ {stripe, admin_plateforme,
client}`, `reference_stripe`, `acteur_id`, `motif`, `created_at`. Réutiliser `historique_tarification`
(déjà append-only) comme base, ou une table sœur dédiée.

---

## 28. Services ELSATIA (ponctuels)

`SERVICES_MISE_EN_SERVICE` (mise en service, migration, formation, installation) = **ponctuels**,
à ne **pas** confondre avec les entitlements récurrents. Modèle : commande de service dédiée
(devis → paiement Stripe one-shot `mode=payment` ou `invoiceitems`), sans impact sur
`entreprise_feature_flags` ni `capacite_achetee`. La boutique (§ 29) peut porter ces lignes.

---

## 29. Boutique

`boutique_produits` / `boutique_commandes` / `boutique_lignes_commande` existent, **séparés** du
SaaS. Prévoir qu'une ligne de commande boutique puisse **optionnellement** référencer un module
ou un pack de capacité (`type_ligne ∈ {physique, consommable, service, module, capacite}`) et
déclencher, à la validation, la même RPC d'entitlement que le webhook Stripe (§ 19). Ne pas
fusionner boutique et abonnement Stripe de façon rigide.

---

## 30. Integration Core

Le futur système module/capacité s'appuie sur le socle du lot
`ELSATIA-INTEGRATION-CORE-MARKET-READINESS-V1` : `applications_elsatia`,
`acces_applications_entreprises`, `habilitations_applications_utilisateurs`, +
`entreprise_feature_flags`. Événements futurs (Event Core, documentaire) :
`billing.entitlement.changed`, `billing.capacity.changed`, `billing.module.activated`,
`billing.usage.recorded` — enveloppe standard (`entreprise_id` requis, `actor_user_id` serveur,
`correlation_id`, `idempotency_key`).

---

## 31. Sécurité — invariants

1. `capacite_achetee ≥ 0`, `capacite_totale ≥ comptesInclus`, quantités de ligne jamais négatives.
2. Module non acheté / hors fenêtre de validité → **inaccessible** (contrôle serveur à la lecture).
3. Frontend jamais autorité (ni pour la capacité, ni pour les modules, ni pour l'usage).
4. Webhooks Stripe vérifiés (signature + `STRIPE_WEBHOOK_EXPECTED_MODE` + attestation Ed25519).
5. Entitlement résolu serveur : `(entitlement org) ∧ (habilitation user) ∧ (permission métier)`.
6. Isolation tenant : `entreprise_id` obligatoire sur toute table de billing/entitlement + RLS.
7. `service_role` : mutations via RPC `SECURITY DEFINER` uniquement ; pas de `GRANT` direct
   d'`UPDATE` sur `compte_application_statut` / `entreprise_feature_flags` / `capacite_achetee`
   à `authenticated` (cohérent avec le lot ACL 255).
8. Toute mutation sensible (capacité, module, plan, override) → `historique_billing_entreprise`.

---

## 32. Downgrade Stripe — règle recommandée

- **Plan / capacité réduits** → `etat_capacite` recalculé ; `over_capacity` possible ; **aucune
  suppression** ; nouvelles activations/réactivations refusées tant que `over_capacity` (§ 7-9).
- **Module supprimé** (fin d'abonnement de la ligne, ou downgrade) → `entreprise_feature_flags`
  passe `origine='desactive'`, `valide_jusqu_au = fin de période payée` ; **les données du
  module sont conservées** (§ 33) ; l'accès devient **lecture seule** pour les modules à données
  structurantes (Stock, Maintenance, Safety, Forms) et **inaccessible** pour les modules purement
  fonctionnels (Automations, Analyse avancée), selon un attribut `mode_apres_desactivation ∈
  {lecture_seule, inaccessible}` du catalogue module.

---

## 33. Portabilité des données module

Désactiver un module ne supprime **jamais** ses données (stock, maintenance, Safety, formulaires).
Contrat par module :
- **Conservation** : les tables du module restent, RLS inchangée, `entreprise_id` conservé.
- **Export** : intégré à l'export RGPD existant (`/api/rgpd/export`) — le périmètre doit couvrir
  les tables de chaque module.
- **Réactivation** : le rachat du module repasse `origine='achete'` et rétablit l'accès sans
  migration de données.

---

## 34. Modules multi-plateformes

Règle ELSATIA : tout module conçu pour web desktop / tablette / téléphone, PWA installable
quand pertinent, Android (Play) et iOS/iPadOS (App Store) quand pertinent. Modules terrain
(Pointage, Gestion chantier, Scan, Forms, Safety) : **offline + sync** obligatoires — cadrés par
le contrat offline-first du lot `ELSATIA-INTEGRATION-CORE-MARKET-READINESS-V1` § 13 (file locale,
curseur de sync, autorité serveur, idempotence, upload de pièces jointes en 2 temps). Audit
architecture uniquement ; aucune app store touchée.

---

## 35. MUST / SHOULD / POST avant commercialisation

### MUST (indispensable avant de vendre)
- **M1 — Décision produit « personne active »** : retenir le contrat § 5 (élargi ou statu quo)
  et le **modèle de limite** (plafond dur + achat explicite **vs** overage automatique).
- **M2 — Disclosure tarifaire** : la page `/tarifs` et les CGV indiquent explicitement le prix
  par personne active au-delà de l'inclus (Mini +15 € / Pro +12 € / Business +9 € / Entreprise
  +9 €), **quel que soit** le modèle retenu.
- **M3 — Câbler les Prices Stripe « comptes sup. »** (`STRIPE_PRICE_COMPTE_SUP_{MINI..ENTREPRISE}_*`,
  Test) sinon aucun dépassement n'est facturé (P15 § 7 ; lot CODEX).
- **M4 (si M1 = plafond dur)** — `verifier_capacite_personnes` dans les RPC d'activation /
  réactivation / import (§ 7, § 9, § 10) + état `over_capacity` (§ 8). Sans plafond dur, ce
  point devient SHOULD.

### SHOULD (rapidement après le lancement)
- Compteur `capacite_achetee` explicite + réconciliation dédiée (§ 11).
- Extension `entreprise_feature_flags` (`origine`, `valide_du/jusqu`, `reference_externe`,
  `motif`) pour modules achetés / offerts / essai (§ 15-16).
- Catalogue module vendable + mapping `STRIPE_PRICE_MODULE_*` + réconciliation multi-lignes (§ 17-19).
- Unification des 3 mécanismes de consommation sous `consommations_entreprises` (§ 20).
- `historique_billing_entreprise` (§ 27).
- Résorber la duplication tarifaire (`calculerTarifAbonnement` lit `OPTIONS_TARIFAIRES` /
  catalogue canonique, § 23).
- Sections UI abonnement (§ 24) + message capacité (§ 25).

### POST (peut attendre Market / Chantier / Plans)
- Optimiseur live de forfait (§ 22).
- Wallet générique multi-usage (non recommandé — § 21).
- `mode_apres_desactivation` par module + lecture seule (§ 32).
- Événements `billing.*` de l'Integration Core (§ 30).
- Ligne boutique ↔ entitlement (§ 29).
- `statut_personne` distinct + signal planning/pointage pour le décompte élargi (si M1 élargi).

---

## 36. GO / NO-GO

| Capacité cible | Verdict | Justification |
|---|---|---|
| **A. Modules à la carte** | **PARTIEL** | `FEATURE_CATALOGUE.plans` + `entreprise_feature_flags` (override org) existent ; manque `origine/dates/Stripe-link` + mapping Price + réconciliation. **Additif.** |
| **B. Capacités supplémentaires** | **PARTIEL** | `parCompteSup` + `VARIABLES_PRIX_COMPTE_SUP` + quantité de ligne Stripe existent ; manque compteur `capacite_achetee` explicite + (selon décision) plafond. **Additif.** |
| **C. Limite personnes actives** | **PARTIEL** | Décompte = `employes` `{actif,pause}` (proche de la cible) ; manque : garde-fou DB (§ 7) et, si décision élargie, compter les personnes sans login présentes au planning/pointage. **Additif + 1 décision produit.** |
| **D. Billing composable** | **PARTIEL → OUI** | Abonnement Stripe multi-lignes déjà utilisé (base + comptes sup. + option IA) ; extension aux modules/stockage = même pattern. |
| **E. Downgrade sans perte** | **OUI (déjà)** | Aucune suppression automatique aujourd'hui (`changerOffreStripe` ne touche pas `employes`) ; manque seulement l'état explicite `over_capacity` + le blocage des nouvelles activations (dépend de C). |

**Aucune capacité n'est NON.** Aucun refactor structurel requis.

---

## 37. Plan d'implémentation (aucune ligne écrite)

| Lot | Périmètre | Tables | Code | Stripe | Tests | Risque | Estimation |
|---|---|---|---|---|---|---|---|
| **R1 — Personne active & garde-fou** | contrat § 5-9 : `personnes_actives_entreprise()`, `verifier_capacite_personnes()`, `etat_capacite`, garde dans `changer_statut_compte_application` / `activer_compte_employe` / import | +1 fonction, +1 fonction, +2 colonnes `entreprises`, +1 trigger filet | RPC + import + UI message capacité | — (facturation inchangée si overage auto) | pgTAP capacité (activation, réactivation, import, over_capacity), e2e | **moyen** (touche des RPC critiques) | ~2–3 j |
| **R2 — Capacité achetée explicite** | `capacite_achetee`, mapping `STRIPE_PRICE_CAPACITE_*` (Test), réconciliation dédiée, section UI | +1 colonne + mapping | `reconcilierAbonnementStripe` généralisé | 1 Price/plan (Test) | réconciliation, idempotence | moyen | ~2 j |
| **R3 — Catalogue modules & entitlement** | `modules_elsatia` (ou extension), extension `entreprise_feature_flags` (`origine/dates/ref/motif`), RPC plateforme d'attribution, override commercial | +1 table + ~4 colonnes | `activeFeaturesForCompany` étendu, RPC | Prices modules (Test) | entitlement (org∧user∧perm), fenêtres de validité | moyen | ~3–4 j |
| **R4 — Webhook composable & historique** | projection par ligne (§ 19), `historique_billing_entreprise`, journalisation | +1 table | webhook abonnement étendu | — | webhook multi-lignes, rejeu, dead-letter | **élevé** (chemin billing critique) | ~2–3 j |
| **R5 — Consommation unifiée** | `consommations_entreprises`, unifier IA/stockage/appareils | +1 table | 3 mécanismes → 1 | `invoiceitems` mensuels | overage, politiques blocage/facture/pack | moyen | ~3 j |
| **R6 — Simulateur & optimiseur** | catalogue canonique étendu, `simulerCoutParPlan`, section « Optimiser », résorber la duplication tarifaire | — | pur calcul + UI | — | parité simulateur ↔ checkout | faible | ~2 j |

Ordre : **R1 (si plafond dur) avant commercialisation** ; R2→R6 après, selon priorité
commerciale. R6 peut précéder si un simulateur public est voulu au lancement.

Prérequis transverses (hors ces lots) : réconcilier les 2 catalogues (`plans_abonnement` DB ↔
`OFFRES_TARIFAIRES` code) ; câbler les env `STRIPE_PRICE_*` manquantes (lot CODEX).

---

## 38. Estimation globale

- **Avant commercialisation** : M1 (décision) + M2 (disclosure `/tarifs` + CGV, ~0,5 j) + M3
  (câblage Prices comptes sup., lot CODEX) + **M4 = R1 si plafond dur retenu (~2–3 j)**.
  → **≈ 0,5 à 3 j de code** selon la décision M1, plus des décisions produit.
- **SHOULD (post-lancement rapide)** : R2 + R3 + R4 + R6 ≈ **9–12 j**.
- **POST** : R5 + optimiseur + événements ≈ **6–8 j**, selon priorité Market/Chantier.

Ce lot **ne bloque pas** la commercialisation de Gestion Pro : si le modèle « overage
automatique » (statu quo) est retenu pour la V1, seuls M2 + M3 sont requis.

---

## Rapport

1. Branche : `docs/elsatia-modular-billing-capacity-readiness-v1`
2. HEAD source : `feat/preprod-e2e-runbook-integration-v1` @ `6df3ebd13abab6aa1391bdc4fe73da9b3bb31415`
3. Modèle actuel : forfait de base + overage **automatique** (comptes sup., IA, stockage,
   appareils) via lignes d'abonnement Stripe / `invoiceitems` ; catalogue de plans versionné en
   DB (`plans_abonnement`) et en code (`OFFRES_TARIFAIRES`).
4. Limite actuelle : `comptesInclus` par plan (3/15/30/50), **non plafonnée**, dépassement
   facturé au prochain cron de réconciliation.
5. Définition compte/personne : personne = `employes` `compte_application_statut ∈ {actif,pause}` ;
   compte Auth = `employes.utilisateur_id` (peut être null). A/B/D distingués, **C (siège)
   absent**.
6. Modules actuels : `FEATURE_CATALOGUE` (CORE/BETA/DISABLED, `plans?`) + `entreprise_feature_flags`
   (override org) ; options `OPTIONS_TARIFAIRES` (IA, stockage, sync bancaire, comptes typés) ;
   IA = modèle de consommation le plus abouti.
7. Entitlements actuels : `acces_applications_entreprises` (app), `habilitations_applications_utilisateurs`
   (app/user), `entreprise_feature_flags` (module/org), permissions de rôle (métier).
8. Capacité additionnelle possible : **PARTIEL** (mécanisme d'overage existe, compteur explicite
   à créer).
9. Modules à la carte possible : **PARTIEL** (substrat org existe, catalogue vendable + Stripe +
   fenêtres à ajouter).
10. Stripe composable possible : **PARTIEL → OUI** (subscription multi-lignes déjà en usage).
11. Contrôle DB actuel : **aucun garde-fou de capacité** ; RPC `SECURITY DEFINER` + RLS + ACL 255
    en place pour le reste.
12. Downgrade : **aucune perte aujourd'hui** ; état `over_capacity` et blocage des activations à
    ajouter.
13. Archivage : `ferme` libère une place ; historique préservé (`ON DELETE RESTRICT`) ;
    `anonymiser_employe` garde la ligne. Dette : pas d'`archive_at`/motif, réactivation sans
    garde-fou.
14. Consommations : 3 mécanismes ad hoc (IA / stockage / appareils) à unifier.
15. Services : `SERVICES_MISE_EN_SERVICE` (ponctuels) — à garder distincts des entitlements.
16. Boutique : `boutique_*` séparée du SaaS — compatible, à relier optionnellement.
17. Integration Core : substrat compatible ; événements `billing.*` documentés (non implémentés).
18. Multi-plateforme : règle rappelée ; offline+sync pour les modules terrain (cadré ailleurs).
19. MUST : M1 décision « personne active » + modèle de limite ; M2 disclosure tarifaire ;
    M3 câblage Prices comptes sup. ; M4 garde-fou DB **si plafond dur**.
20. SHOULD : capacité explicite, extension `entreprise_feature_flags`, catalogue modules +
    Stripe + réconciliation multi-lignes, `historique_billing`, dé-duplication tarifaire, UI.
21. POST : consommation unifiée, optimiseur live, wallet générique (non recommandé),
    `mode_apres_desactivation`, événements `billing.*`, lien boutique↔entitlement.
22. Blockers : **aucun blocker structurel**. Le seul point potentiellement bloquant avant
    commercialisation (R1) ne l'est que **si** la décision M1 retient un plafond dur ; sinon
    M2 + M3 suffisent.
23. Lots d'implémentation : R1–R6 (§ 37).
24. Durée estimée : avant commercialisation ≈ 0,5–3 j de code (selon M1) + décisions produit ;
    SHOULD ≈ 9–12 j ; POST ≈ 6–8 j.
25. Doc créée : `docs/architecture/ELSATIA_MODULAR_BILLING_CAPACITY_READINESS_V1.md`
26. Commit : `docs(architecture): audit modular billing and active-person capacity`
27. Push : branche `docs/elsatia-modular-billing-capacity-readiness-v1` (docs-only, sans force,
    pas de merge)
28. Production modifiée : **NON**
29. Verdict : ci-dessous

---

`ELSATIA-MODULAR-BILLING-CAPACITY-READINESS-V1 VALIDÉ — MODÈLE À LA CARTE CADRÉ — PLAN AVANT COMMERCIALISATION ÉTABLI`
