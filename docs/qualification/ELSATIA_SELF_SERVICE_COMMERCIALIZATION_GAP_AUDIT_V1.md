# Audit des écarts de commercialisation self-service — V1

Date : 21 septembre 2026. Lecture seule, autonome, sans validation intermédiaire (conforme à la mission).
Méthode : lecture directe du code, des migrations SQL et des documents internes, complétée par trois audits ciblés (Stripe/abonnement, accès/RGPD, parcours/onboarding), chacun vérifié indépendamment sur ses affirmations les plus fortes avant d'être repris ici.

## 0. Préalable — écart de nom qui change le périmètre de l'audit

La mission demande d'auditer un compte **« ELSATIA »** avec plusieurs applications (**Gestion Pro, Colors, Tools, Studio, Reserves**) et des entitlements par application.

**Cette architecture n'existe pas dans ce dépôt.** Recherche exhaustive (`ELSATIA`, `Colors`, `Studio`, `Reserves`, `application_id`, `app_id`, `entitlement`, `produit_id`) : aucune occurrence pertinente. Le produit réel est **« Liria Gestion Pro »** (`package.json:2` → `liria-gestion-pro`, branding confirmé dans `src/app/layout.tsx`, `src/components/PiedLegal.tsx`, tous les documents juridiques), une **application unique** vendue à des entreprises du BTP, avec **un abonnement par entreprise** — pas de compte multi-applications, pas de compte plateforme nommé ELSATIA.

Deux lectures possibles, à trancher par vous :
- Si « ELSATIA » désigne simplement l'éditeur/la marque commerciale de Liria Gestion Pro (renommage prévu non encore reflété dans le code) → le reste de l'audit s'applique tel quel, produit unique.
- Si « Colors/Tools/Studio/Reserves » sont de vraies applications déjà vendues ailleurs et censées partager ce compte → **elles n'ont aucune trace dans ce dépôt** ; le point 5 de la mission (« suspension GP ne doit pas couper Colors/Reserves/Tools ») est donc **sans objet aujourd'hui**, pas un bug à corriger. Le construire demanderait une architecture neuve (table d'entitlement par application), pas un correctif.

La suite de l'audit traite du produit réel : **Liria Gestion Pro**, application unique, un abonnement par entreprise.

---

## 1. Parcours réel reconstitué

| Étape | Classification | Preuve (fichier:ligne) |
|---|---|---|
| Visiteur → inscription | **WORKING** | `src/app/signup/page.tsx` (formulaire libre, sans invite obligatoire) ; `src/app/actions/auth.ts:30-50` (`signupAction` → `supabase.auth.signUp` réel) |
| Création entreprise | **WORKING** | `src/app/actions/entreprise.ts:40-61` → RPC atomique `creer_entreprise_bootstrap` (entreprise + poste Admin + membre en une transaction) |
| Rejoindre une entreprise existante (code) | **WORKING** (contrôle normal, pas une dépendance fondateur) | `src/app/actions/entreprise.ts:64-86` ; l'admin **de l'entreprise cliente** (pas Julien) valide le nouveau membre |
| Choix d'offre | **WORKING** | `src/app/onboarding/besoins/page.tsx` (questionnaire → `recommanderOffre`) |
| Paiement Stripe Checkout | **MANUAL (setup unique)** tant que Stripe n'est pas configuré en production | `stripeBillingEstConfigure()` — `src/lib/stripe-abonnement.ts:104-116` ; CTA désactivé sinon |
| Entitlement (statut d'abonnement) | **WORKING** via webhook Stripe ; **MANUAL** en secours | `src/app/api/stripe/abonnement/webhook/route.ts:64-117` vs écran admin `src/app/(app)/plateforme/page.tsx:245-266` (`modifierAbonnementAction`) |
| Première connexion / onboarding | **WORKING** (vrai assistant en 6 étapes, pas un écran vide) | `src/app/onboarding/demarrage/page.tsx` |
| Utilisation quotidienne | **WORKING** | Hors périmètre commercial de cet audit |
| Upgrade / downgrade | **WORKING côté self-service, PARTIAL côté synchro** | `src/app/(app)/abonnement/page.tsx:146` → portail Stripe self-service ; **mais** voir P1-2 : la synchro base de données après un changement fait *dans le portail* est cassée |
| Impayé | **WORKING (clients Stripe)** / **MANUAL (comptes gérés à la main)** | `src/app/api/stripe/abonnement/webhook/route.ts:193-206` vs `src/app/actions/plateforme.ts:168` |
| Suspension | **WORKING**, mais globale (voir §4) | `src/lib/entreprise.ts:110-115` |
| Résiliation | **WORKING** (portail Stripe self-service) | `src/app/actions/abonnement.ts:71-93` |
| Export des données | **WORKING** | `src/app/api/rgpd/export/route.ts` ; RPC `exporter_donnees_entreprise` — `supabase/migrations/20260719000114_rgpd_export_suppression.sql:22-79` |
| Suppression — demande | **WORKING (self-service)** | `src/app/actions/rgpd.ts:11-27` ; délai de 30 jours, annulable |
| Suppression — purge effective | **MANUAL, récurrent par client** | Commentaire explicite dans `20260719000114_rgpd_export_suppression.sql:120-122` : « la purge effective reste une opération supervisée par la plateforme » — **aucun cron de purge trouvé** |
| Sortie du mode prototype / durcissement RLS | **MANUAL, à faire une fois** | `PRODUCTION_CHECKLIST.md:29` ; script `supabase/production/sortie_mode_prototype.sql` générique (aucun ID d'entreprise en dur, vérifié) |

Aucune référence en dur à une entreprise unique (`ENT-001`/« LIRIA CONCEPT ») dans le code applicatif — uniquement dans la checklist comme donnée de vérification pré-bascule. L'architecture est multi-tenant par `entreprise_id` partout (RLS), sans blocage structurel pour monter à plusieurs entreprises.

---

## 2. Stripe — vérification détaillée (mission §3)

### Ce qui fonctionne réellement
- **Checkout, Customer, Portail** : `src/lib/stripe-abonnement.ts:151-228`, clés d'idempotence sur chaque appel mutateur (ex. L176, L219, L226).
- **Webhook — idempotence et sécurité du retry** : réservation *avant* traitement dans `abonnement_evenements` avec `unique(stripe_event_id)` (`src/app/api/stripe/abonnement/webhook/route.ts:160-171`) ; conflit `23505` → réponse `duplicate:true` sans retraiter ; en cas d'erreur, la ligne est supprimée (L211) pour permettre à Stripe de rejouer proprement. Bien conçu.
- **Séparation Connect / Billing** : événements porteurs d'un champ `account` explicitement rejetés (L155) — les deux flux (facturation client des entreprises vs abonnement Liria) ne se mélangent pas.
- **Synchronisation des comptes supplémentaires** : `reconcilierAbonnementStripe` (`stripe-abonnement.ts:297-320`), appelée au checkout et par le cron nocturne `src/app/api/cron/abonnements/route.ts`.
- **Protection du plan « Sur mesure »** : bloqué explicitement du self-service (`src/app/actions/abonnement.ts:42-44`), conforme à la décision produit de ne pas l'automatiser.

### Bugs et écarts confirmés (vérifiés indépendamment, pas seulement rapportés)

**P0 — Contrainte de base de données non mise à jour pour la nouvelle grille tarifaire.**
`supabase/migrations/20260718000101_facturation_stockage.sql:9` :
```sql
offre text not null check (offre in ('essentiel','pro','premium')),
```
Cette contrainte n'a **jamais été modifiée** par une migration ultérieure (vérifié : aucune autre migration ne touche `abonnement_stockage_releves`). Or la grille commercialisée depuis `20260723000142_tarification_abonnements.sql` est `mini/pro/business/entreprise/sur_mesure`. Conséquence : pour toute entreprise sur une offre **autre que essentiel/pro/premium** ayant un dépassement de stockage, `ajouterDepassementStockageFacture` (`src/lib/stripe-abonnement.ts:428-465`) provoque une violation de contrainte SQL au moment de l'événement Stripe `invoice.created`. L'erreur remonte, le webhook (`route.ts:210-213`) supprime la ligne de `abonnement_evenements` et renvoie une 500 → **Stripe rejoue indéfiniment cet événement, sans jamais réussir**. C'est un blocage réel de facturation automatique dès le premier client sur la grille actuelle avec du stockage en dépassement.

**P1 — `changerOffreStripe` n'est appelé nulle part.**
Défini `src/lib/stripe-abonnement.ts:276`, zéro appelant dans `src/app` (vérifié par recherche exhaustive). Le webhook ne resynchronise `abonnement_offre`/`abonnement_periodicite` qu'à partir de `subscription.metadata` (`route.ts:64-79`), écrit une seule fois au Checkout. Le **portail Stripe self-service** (que la doc de mise en service demande explicitement d'activer) ne réécrit pas ces métadonnées. Résultat : un client qui change d'offre **depuis le portail self-service** garde l'ancienne offre en base indéfiniment → mauvais badge d'offre, mauvais filtrage de fonctionnalités (`permissionIncluseDansOffre`, `src/lib/tarification.ts:232-243`), mauvais tarif de compte supplémentaire appliqué par le cron.

**P1 — `.env.local.example` est obsolète.**
Lignes 23-35 : liste `STRIPE_PRICE_ESSENTIEL_*`, `STRIPE_PRICE_PRO_*`, `STRIPE_PRICE_PREMIUM_*` — jamais `STRIPE_PRICE_MINI_*`, `STRIPE_PRICE_BUSINESS_*`, `STRIPE_PRICE_ENTREPRISE_*`, alors que `stripeBillingEstConfigure()` (`stripe-abonnement.ts:104-116`) exige précisément ces dernières pour `mini/pro/business/entreprise`. Quiconque configure Vercel à partir de ce fichier passera à côté des variables réellement nécessaires.

**NOT_PROVEN_REMOTE — rien n'a jamais tourné en réel.**
Aucune société n'est créée à ce jour (`RELAIS_CODEX_ABONNEMENT.md:168`, verbatim « aucune société n'existe encore »). Sans entité juridique, pas de compte Stripe de production actif, pas de webhook enregistré, pas de facture réelle émise. Le « 63 tests verts » du relevé du 18 juillet n'a pas pu être reproduit dans cet environnement (`node_modules` absent). Le code est prêt ; son exécution réelle contre Stripe n'est démontrée nulle part.

---

## 3. Tarifs canoniques — vérification et divergences (mission §4)

**Bonne nouvelle : les montants mensuels canoniques attendus sont exactement ceux implémentés aujourd'hui.**

Source de vérité actuelle : `src/lib/tarification.ts:78-156`, reflétée à l'identique dans la migration `supabase/migrations/20260723000142_tarification_abonnements.sql:165-174` et verrouillée par `src/lib/tarification.test.ts:11-20` :

| Offre | Mensuel attendu | Mensuel implémenté | Annuel attendu (×10) | Annuel implémenté | Écart |
|---|---|---|---|---|---|
| Mini | 79 € | **79 €** ✅ | 790 € | **948 €** (×12, 0 % de remise) | +158 €/an |
| Pro | 249 € | **249 €** ✅ | 2 490 € | **2 988 €** (×12, 0 % de remise) | +498 €/an |
| Business | 449 € | **449 €** ✅ | 4 490 € | **5 388 €** (×12, 0 % de remise) | +898 €/an |
| Enterprise | 599 € | **599 €** ✅ | 5 990 € | **6 468 €** (×10,8, ~10 % de remise) | +478 €/an |

**Aucune des quatre offres n'applique la règle « annuel = ×10 ».** Trois formules différentes coexistent dans le code :
- `REDUCTION_ANNUELLE = 0` (`src/lib/plateforme.ts:71`) → cohérent avec Mini/Pro/Business (×12 exact, 0 % de remise annuelle).
- Enterprise a un prix annuel câblé en dur (`tarification.ts:129-130`) qui applique ~10 % de remise, sans lien avec la constante `REDUCTION_ANNUELLE`.
- La grille historique gelée (`essentiel`/`pro` v1/`premium`, mêmes migration lignes ~175-177) utilise elle ×12×0,8 = 20 % de remise — l'ancienne règle décrite (à tort, pour la grille actuelle) dans `RELAIS_CODEX_ABONNEMENT.md`.

Ceci n'est pas un bug technique caché : c'est une **décision de tarification jamais prise explicitement** et jamais harmonisée. Aucun test ne vérifie de règle de remise annuelle uniforme (`tarification.test.ts` fige les montants actuels, remise Enterprise comprise, sans jamais affirmer une formule).

### Divergences de seed/history (demandées explicitement au point 4)

- La migration `20260723000142` **gèle intentionnellement** l'ancienne grille (`essentiel` 59€, `pro` v1 129€ « historique », `premium` 249€, toutes `actif=false`) pour les contrats déjà signés, et active la nouvelle grille commerciale (`mini/pro/business/entreprise/sur_mesure`, `actif=true`). C'est une application correcte et documentée de la règle « ne pas modifier silencieusement les contrats existants » (`docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md`).
- Le code de `stripe-abonnement.ts` (`VARIABLES_PRIX` L44-60) garde le mapping Stripe pour **les deux** grilles, mais `OFFRES_ABONNEMENT_COMMERCIALISEES` (L6) ne retient que `mini/pro/business/entreprise` — cohérent avec le fait que essentiel/premium ne sont plus vendus, mais crée une ambiguïté de lecture : le code « pro » sert à la fois à l'ancien contrat 129 €/mois (version gelée) et à l'offre actuelle 249 €/mois (version active), différenciées uniquement par un champ `version` dans `plans_abonnement`/`abonnements_entreprises`. C'est correctement cloisonné en base, mais fragile si un futur développeur relit `VARIABLES_PRIX` sans lire la table de versions.
- `RELAIS_CODEX_ABONNEMENT.md` (18 juillet) décrit la grille **désormais obsolète** (essentiel/pro 129/premium, remise annuelle 20 %) et n'a jamais été mis à jour après le remplacement du 23 juillet documenté dans `docs/RELAIS_TARIFICATION_2026-07-22.md`. Risque de confusion pour quiconque s'y réfère aujourd'hui — à marquer explicitement comme historique/obsolète.

---

## 4. Accès et suspension — par application (mission §5)

**Conclusion nette : cette exigence est sans objet aujourd'hui**, faute d'architecture multi-application (voir §0). Ce qui existe :

- Un seul champ `entreprises.abonnement_statut` (`essai|actif|suspendu|annule`), une ligne par entreprise — pas par application.
- Porte d'entrée unique et globale : `src/lib/entreprise.ts:110-115`, appelée à chaque page authentifiée. Toute entreprise `suspendu`/`annule` (ou essai expiré) est redirigée vers `/abonnement-suspendu`, **sans aucune exception par module ou fonctionnalité**.
- Le système de feature flags (`supabase/migrations/20260728000180_feature_flags_v3.sql`, `src/lib/feature-catalogue.ts:26-29`) est **explicitement indépendant** de la facturation : c'est un contrôle d'exposition produit (actif/bêta/expérimental/désactivé), pas un entitlement commercial. Bien conçu et correctement séparé, mais ne répond pas à la question posée.
- Pas de distinction entre suspension commerciale automatique (impayé) et suspension plateforme manuelle (fraude/abus) : les deux écrivent le **même** champ `abonnement_statut` via la **même** fonction `plateforme_modifier_abonnement` (`supabase/migrations/20260710000036_plateforme_abonnements.sql:47-58`) ou le webhook Stripe. **Aucune séparation** entre les deux notions demandées par la mission.

**Si un vrai modèle multi-application (Colors/Tools/Studio/Reserves) est prévu**, il faudra une table d'entitlement neuve (`entreprise_applications(entreprise_id, application_id, statut)`) et un ré-alignement de `src/lib/entreprise.ts:110-115` sur cette table plutôt que sur `entreprises.abonnement_statut`. Ce n'est pas un correctif, c'est un chantier d'architecture non commencé.

---

## 5. RGPD (mission §6)

| Élément | Classification | Preuve |
|---|---|---|
| Export utilisateur/entreprise (auto-service) | **WORKING** | `src/app/(app)/parametres/donnees/page.tsx:48-64`, route `src/app/api/rgpd/export/route.ts:9-33`, RPC `exporter_donnees_entreprise` — parcourt dynamiquement toutes les tables `entreprise_id` via `information_schema`, filtre les colonnes sensibles (mot de passe/token/hash), journalise dans `journal_activite` (`20260719000114_rgpd_export_suppression.sql:22-79`) |
| Export des **fichiers** (pas seulement les lignes de base) | **MISSING** | L'export ne contient que les chemins de stockage (`storage_path`), pas les octets des fichiers eux-mêmes ; aucun outil trouvé pour empaqueter les fichiers réels d'une entreprise |
| Suppression — demande | **WORKING (self-service)** | `src/app/actions/rgpd.ts:11-27` ; `demander_suppression_entreprise()` pose un délai de 30 jours annulable (`20260719000114...sql:124-160`), confirmation par ressaisie du nom de l'entreprise (`parametres/donnees/page.tsx:107-116`) |
| Suppression — purge effective après 30 jours | **MANUAL, récurrent** | Commentaire explicite en base : « la purge effective reste une opération supervisée par la plateforme » (`20260719000114...sql:120-122`) — **aucun cron/job de purge trouvé** dans `src/app/api/cron/` (seuls `abonnements` et `notifications-push` existent) |
| Anonymisation salarié | **WORKING** | `anonymiser_employe()` (`20260719000114...sql:87-116`) — vide nom/coordonnées, conserve les données légalement obligatoires (paie/pointage), journalisé |
| Stockage / cloisonnement par entreprise | **WORKING** (avec réserve) | RLS sur `storage.objects` par premier segment de chemin = `entreprise_id` (ex. `20260713000061_archivage_notes_frais_exports_securises.sql`) ; des policies « prototype » `for all to anon using(true)` coexistaient sur plusieurs buckets et n'ont été fermées que partiellement par des migrations ultérieures (`20260724000161`, `20260714000078`) — l'état final par bucket n'a pas été revérifié un par un dans cet audit |
| Piste d'audit | **WORKING** pour les actions RGPD, **MISSING** un tableau de bord opérationnel | Écritures dans `journal_activite` à chaque export/anonymisation/demande de suppression ; mais rien ne liste aujourd'hui « les suppressions dont le délai de 30 jours est dépassé et qui attendent une purge » |
| Archivage renforcé (justificatifs) | **PARTIAL, périmètre étroit** | `docs/ARCHIVAGE_JUSTIFICATIFS.md` — SHA-256, `legal_hold`, audit append-only, export ZIP : solide mais **limité au module notes de frais**, explicitement non qualifié comme valeur probante |
| Localisation des données (UE) | **NOT_PROVEN_REMOTE** | `docs/juridique/rgpd-sous-traitants.md:9` — région Supabase « à confirmer » |

**Conclusion RGPD** : l'auto-service (export + demande de suppression) fonctionne réellement et dépasse ce que documentait le README du 18 juillet (qui listait encore ces fonctions comme un TODO). Le vrai trou est la **purge effective**, entièrement manuelle et sans tableau de bord — tenable pour un pilote unique, **non tenable** à plusieurs clients self-service sans automatisation ou au moins une alerte.

---

## 6. Juridique (mission §7)

| Document / mécanisme | État |
|---|---|
| Mentions légales, CGU, CGV, politique de confidentialité, cookies | **Publiés en pages réelles** (`src/app/{mentions-legales,cgu,cgv,confidentialite,cookies}/page.tsx`), liées en pied de page (`src/components/PiedLegal.tsx`), whitelistées côté proxy (`src/lib/supabase/proxy.ts:7`) |
| Contenu juridique | **Brouillons non validés par un avocat** — `docs/juridique/README.md:5` : « brouillons solides, à faire relire par un avocat (~300–500 €) avant mise en ligne » |
| Identité de l'éditeur | **Incomplète** — champs `[Julien GREGUREC]`, `[JJ/MM/AAAA]` encore en placeholder dans `cgv.md`, `dpa-entreprises-clientes.md` ; SIRET/adresse non renseignés (`docs/juridique/README.md:23-28`) |
| Entité juridique qui facture | **N'existe pas** — `RELAIS_CODEX_ABONNEMENT.md:168` : « aucune société n'existe encore » |
| DPA (sous-traitance RGPD) | **MISSING dans le produit** — le fichier `docs/juridique/dpa-entreprises-clientes.md` existe mais n'est référencé **nulle part** dans `src/` : jamais présenté, jamais accepté au moment de l'inscription, alors que la CGV art. 9 le déclare « partie intégrante » du contrat |
| Preuve d'acceptation CGU/CGV, avec version | **MISSING** — aucune case à cocher dans `src/app/signup/page.tsx`, aucune colonne `accepte_cgu`/`cgu_version`/`date_acceptation` trouvée dans tout le schéma ; un client self-service peut payer sans qu'aucune trace d'acceptation contractuelle ne soit enregistrée |
| Bandeau cookies | **MISSING**, mais risque faible aujourd'hui (aucun traceur non essentiel détecté — Sentry uniquement) |

**Conclusion juridique** : les pages existent et sont accessibles, mais rien n'est finalisé ni signé, et surtout **rien ne prouve qu'un client ait accepté quoi que ce soit**. C'est un vrai blocage self-service (pas pour un pilote géré à la main, où un accord par email/signature classique peut se substituer).

---

## 7. Onboarding — interventions manuelles identifiées (mission §8)

| Intervention manuelle | Fichier:ligne | Nature |
|---|---|---|
| Répondre aux messages support | `src/app/(app)/plateforme/support/page.tsx:77-81` | **Récurrente, par client** |
| Créer une entreprise à la main (comptes hors Stripe) | `src/app/(app)/plateforme/page.tsx:117` (`creerEntreprisePlateformeAction`) | Par client, mais seulement pour les comptes gérés manuellement |
| Modifier statut/offre d'abonnement à la main | `src/app/(app)/plateforme/page.tsx:245-266` | Chemin de secours hors Stripe |
| Signaler un impayé / enregistrer un règlement (comptes non-Stripe) | `src/app/actions/plateforme.ts:168,188` | Par client, hors Stripe uniquement |
| Figer les comptes facturables du mois (dépassements d'appareils) | `src/app/(app)/plateforme/facturation/page.tsx:29` | **Récurrente mensuelle, par client** |
| Purge RGPD après le délai de 30 jours | `20260719000114_rgpd_export_suppression.sql:120-122` | **Récurrente, par client** — aucune automatisation |
| Configuration Stripe (produits/prix/webhook/portail), Site URL Supabase, templates email SSR | `PRODUCTION_CHECKLIST.md:15-27`, `RELAIS_CODEX_ABONNEMENT.md:175-180` | **Une seule fois**, ne bloque pas le passage à l'échelle une fois fait |
| Sortie du mode prototype | `PRODUCTION_CHECKLIST.md:29`, `supabase/production/sortie_mode_prototype.sql` | **Une seule fois**, script générique vérifié sans ID en dur |

Aucune intervention manuelle **par client** n'est nécessaire pour le parcours technique inscription→entreprise→paiement→premher login une fois Stripe configuré : le code des étapes 1 à 4 du parcours (§1) est réellement self-service. Les interventions manuelles récurrentes qui subsistent (support, facturation mensuelle des dépassements, purge RGPD) sont des **charges opérationnelles**, pas des blocages techniques — mais elles ne passeront pas à l'échelle sans outillage (alerte, cron, bot FAQ).

---

## 8. Séparation PILOTE ACCOMPAGNÉ vs SELF-SERVICE (mission §9)

| Sujet | Bloque un pilote accompagné ? | Bloque le self-service ? |
|---|---|---|
| Pas d'entité juridique / SIRET | Oui pour facturer *légalement*, mais contournable en accord amiable/gratuit pour un vrai pilote | **Oui, absolu** |
| CGU/CGV non relues par un avocat, placeholders non remplis | Non (accord informel possible) | **Oui** |
| Pas de preuve d'acceptation CGU/CGV versionnée | Non (accord informel possible) | **Oui** |
| Stripe non configuré en production | Non (chemin `/plateforme` manuel disponible) | **Oui, jusqu'au setup — une fois fait, non bloquant** |
| Mode prototype non désactivé | À faire avant tout client réel (pilote inclus) | **Oui, jusqu'au run — une fois fait, non bloquant** |
| Bug contrainte stockage (P0 Stripe) | Non si le pilote est géré hors Stripe | **Oui**, dès qu'un client réel sur la grille actuelle a un dépassement de stockage |
| `changerOffreStripe` non câblé | Non (le fondateur peut corriger à la main en cas d'écart) | Oui, à l'échelle (désynchronisation silencieuse) |
| Purge RGPD manuelle | Non (un seul client à purger, rare) | Oui, à volume |
| Support/facturation mensuelle manuels | Non (attendu pour un pilote) | Oui, au-delà de quelques clients |
| Formule annuelle ≠ ×10 | Non | Décision commerciale à trancher avant d'afficher un prix annuel public |

---

## 9. Blockers réels retenus (mission §10)

### Bloquent le premier client payant **accompagné**
- Aucun (le chemin `/plateforme` permet de créer et gérer une entreprise entièrement à la main, sans Stripe). Le seul prérequis non technique : un moyen légal d'encaisser (auto-entreprise ou société), même a minima.

### Bloquent le premier client **self-service**
1. **Aucune entité juridique enregistrée** pour facturer légalement (`RELAIS_CODEX_ABONNEMENT.md:168`).
2. **Stripe Billing non configuré en production** (`src/lib/stripe-abonnement.ts:104-116`).
3. **Mode prototype non désactivé** (`supabase/production/sortie_mode_prototype.sql` non appliqué).
4. **Contrainte SQL obsolète sur `abonnement_stockage_releves.offre`** (`supabase/migrations/20260718000101_facturation_stockage.sql:9`) — bloquerait la facturation automatique dès le premier client réel sur la grille actuelle en cas de dépassement de stockage.
5. **Aucune capture d'acceptation CGU/CGV versionnée** à l'inscription (`src/app/signup/page.tsx`).

### Bloquent la montée à plusieurs entreprises
- Aucun blocage **structurel** (multi-tenant RLS déjà en place, script de sortie de prototype générique, pas d'ID en dur).
- Blocages **opérationnels** si rien n'est automatisé : purge RGPD (§5), facturation mensuelle des dépassements (§7), support niveau 1 (§7), et la désynchronisation d'offre après changement dans le portail Stripe (P1 Stripe) qui s'aggrave avec le nombre de clients.

---

## 10. Verdicts

```
PILOT_COMMERCIAL = PARTIAL
SELF_SERVICE     = BLOCKED
```

**PILOT_COMMERCIAL = PARTIAL** — le logiciel et le parcours manuel (`/plateforme`) permettent dès aujourd'hui d'accueillir un premier client accompagné par le fondateur (création d'entreprise, suivi d'abonnement, support, RGPD, tout gérable à la main). Le seul frein est administratif et rapide à lever : un statut légal pour facturer, et des CGU/CGV finalisées (même sans passer par Stripe). Rien de technique ne bloque un pilote.

**SELF_SERVICE = BLOCKED** — au moins cinq éléments concrets et vérifiés empêchent aujourd'hui un inconnu de s'inscrire, payer et utiliser le produit sans aucune intervention humaine : absence d'entité juridique, configuration Stripe de production non faite, mode prototype non désactivé, un bug de contrainte SQL qui casserait la facturation automatique dès le premier dépassement de stockage sur la grille actuelle, et l'absence de toute preuve d'acceptation contractuelle à l'inscription. Trois de ces cinq points sont des tâches de configuration ponctuelles (rapides une fois décidées) ; deux nécessitent un vrai correctif de code ou de schéma (le P0 stockage, la capture de consentement CGU/CGV).

---

## 11. P0 / P1 restants — preuve exacte

### P0 — bloquent la facturation automatique ou la légalité de l'encaissement

| # | Constat | Preuve exacte |
|---|---|---|
| P0-1 | Aucune entité juridique enregistrée pour facturer | `RELAIS_CODEX_ABONNEMENT.md:168` ; `docs/juridique/README.md:23-28` (SIRET/adresse en placeholder) |
| P0-2 | Contrainte SQL `abonnement_stockage_releves.offre` limitée à `essentiel/pro/premium`, jamais mise à jour pour `mini/business/entreprise/sur_mesure` → boucle d'échec infinie du webhook `invoice.created` en cas de dépassement de stockage | `supabase/migrations/20260718000101_facturation_stockage.sql:9` (aucune migration ultérieure ne la modifie, vérifié) ; déclenchée par `src/lib/stripe-abonnement.ts:428-465` et `src/app/api/stripe/abonnement/webhook/route.ts:185-192,210-213` |
| P0-3 | Stripe Billing non configuré en production (pas de clé secrète, pas de webhook, pas de price IDs) | `src/lib/stripe-abonnement.ts:104-116` (`stripeBillingEstConfigure`) ; `.env.local.example` sans valeurs |
| P0-4 | Mode prototype non désactivé (accès anonyme structurellement encore possible) | `PRODUCTION_CHECKLIST.md:3,29` ; `supabase/production/sortie_mode_prototype.sql` non appliqué à ce jour |
| P0-5 | Aucune capture d'acceptation CGU/CGV (case à cocher, version, date) à l'inscription | `src/app/signup/page.tsx` (aucune case) ; absence totale de colonnes `accepte_cgu`/`cgu_version` dans le schéma (recherche exhaustive) |

### P1 — réels mais à blast radius plus étroit ou différables

| # | Constat | Preuve exacte |
|---|---|---|
| P1-1 | `changerOffreStripe` codé mais jamais appelé → un changement d'offre fait dans le portail Stripe self-service ne se répercute jamais dans `entreprises.abonnement_offre` | Définition : `src/lib/stripe-abonnement.ts:276`. Zéro appelant dans `src/app` (recherche exhaustive). Le webhook ne relit que `subscription.metadata`, écrit une seule fois au Checkout : `src/app/api/stripe/abonnement/webhook/route.ts:64-79` |
| P1-2 | Formule de remise annuelle incohérente et ≠ ×10 attendu : 0 % (Mini/Pro/Business), ~10 % (Enterprise, câblé en dur), 20 % (grille historique gelée) | `src/lib/plateforme.ts:71` (`REDUCTION_ANNUELLE = 0`) ; `src/lib/tarification.ts:84-149` (montants annuels en dur) ; seed historique dans `supabase/migrations/20260723000142_tarification_abonnements.sql` (lignes ~165-177) |
| P1-3 | `.env.local.example` toujours calé sur l'ancienne grille (`ESSENTIEL/PRO/PREMIUM`), omet les variables réellement requises (`MINI/BUSINESS/ENTREPRISE`) | `.env.local.example:23-35` vs `src/lib/stripe-abonnement.ts:57-59,104-116` |
| P1-4 | Purge RGPD après 30 jours entièrement manuelle, sans cron ni tableau de bord des demandes en attente | `supabase/migrations/20260719000114_rgpd_export_suppression.sql:120-122` ; absence de job dans `src/app/api/cron/` |
| P1-5 | DPA jamais présenté ni accepté dans le produit, alors que la CGV le déclare contractuel | `docs/juridique/dpa-entreprises-clientes.md` (aucune référence dans `src/`, recherche exhaustive) ; `docs/juridique/cgv.md` art. 9 |
| P1-6 | Export RGPD limité aux lignes de base (JSON), sans les fichiers/pièces jointes réels | `supabase/migrations/20260719000114_rgpd_export_suppression.sql:22-79` (n'exporte que les `storage_path`, pas les octets) |
| P1-7 | Pas de séparation entre suspension commerciale automatique et suspension plateforme manuelle (fraude) — même champ, même fonction | `supabase/migrations/20260710000036_plateforme_abonnements.sql:47-58` vs écriture webhook `src/app/api/stripe/abonnement/webhook/route.ts:72,197` |
| P1-8 | Charge opérationnelle manuelle récurrente non automatisée : support, facturation mensuelle des dépassements | `src/app/(app)/plateforme/support/page.tsx:77-81` ; `src/app/(app)/plateforme/facturation/page.tsx:29` |
| P1-9 | `RELAIS_CODEX_ABONNEMENT.md` décrit une grille tarifaire obsolète depuis le 23 juillet sans avoir été mis à jour ni marqué comme historique | `RELAIS_CODEX_ABONNEMENT.md` (dernière mise à jour 18 juillet) vs `docs/RELAIS_TARIFICATION_2026-07-22.md` et `supabase/migrations/20260723000142_tarification_abonnements.sql` |

### Non applicable (mission §5, pour mémoire)

| # | Constat | Preuve exacte |
|---|---|---|
| N/A-1 | Pas d'architecture multi-application ; suspension globale par entreprise, pas par application | `src/lib/entreprise.ts:110-115` ; recherche exhaustive sans résultat pour un modèle d'entitlement par application |

---

*Aucun contrat existant n'a été modifié, aucune migration n'a été appliquée, aucune donnée n'a été altérée pour produire cet audit — travail strictement en lecture.*
