# ELSATIA-MARKET-ARCHITECTURE-AUDIT-REPORT

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1`
Nature : audit d'architecture, lecture seule. Aucun code métier, aucune migration, aucune opération Stripe.
Branche : `feat/market-architecture-legal-business-v1`
SHA de base : `1fc1331` (`integration/elsatia-ecosystem-train-v2-reserves-gp-v1`)
Date : 2026-09-08

---

## 0. Méthode et périmètre de l'audit

### 0.1 Choix du SHA de base

Le dépôt est éclaté en une soixantaine de worktrees et de branches non fusionnées. Trois refs
étaient candidates :

| Ref | Migrations | Contenu applicatif | Retenu |
|---|---:|---|---|
| `main` | — | obsolète de 329 commits | non |
| `ab6f9bd` (HEAD courant) | 263 | Gestion Pro + Colors + Tools + contrat tarifaire canonique V4 | non (base) |
| `1fc1331` (train canonique) | 272 | + Réserves, `packages/client-contracts`, `packages/email`, Global Owner | **oui** |

`1fc1331` est un **surensemble strict** de `ab6f9bd` pour les migrations (263 ⊂ 272 : les 9
migrations supplémentaires sont 266→274). Il est en revanche en retard de 40 commits applicatifs,
dont le contrat tarifaire canonique V4. L'audit lit donc :

- le **modèle de données** sur `1fc1331` ;
- le **contrat tarifaire** sur `ab6f9bd` (`src/lib/tarification.canonical.json`, version `CANONICAL-V4-2026-09`).

Cette double lecture est signalée partout où elle change une conclusion.

### 0.2 Ce qui a été vérifié, et comment

- 272 fichiers de migration lus par extraction de DDL (`create table`, `create function`, policies).
- Inventaire exhaustif des tables : **≈ 200 tables** applicatives.
- Inventaire des fonctions `public.*` : **≈ 470 fonctions** déclarées.
- 168 déclarations `enable row level security`.
- Buckets de stockage : lus par les policies `storage.objects` (les buckets eux-mêmes ne sont pas
  créés par migration).
- Code applicatif : `src/`, `apps/colors`, `apps/tools`, `apps/reserves`, `packages/*`.

### 0.3 Distinction méthodologique appliquée

Un fichier `.sql.proposed` n'est **pas** une fonction développée. Un rapport d'audit décrivant une
architecture n'est **pas** du code. Cet audit distingue systématiquement trois états :

- **LIVRÉ** — la table, la fonction ou l'écran existe dans `1fc1331` ou `ab6f9bd` ;
- **PROPOSÉ** — le SQL existe en `.proposed`, non numéroté, non appliqué ;
- **PAPIER** — le besoin n'existe que dans un rapport ou une décision.

---

## 1. Constat central : Market n'existe pas

Recherche insensible à la casse de `market` :

- dans les 272 migrations : **0 occurrence** ;
- dans `src/`, `apps/`, `docs/` sur `1fc1331` : **0 occurrence**.

Il n'y a ni table, ni fonction, ni écran, ni route, ni entrée de catalogue applicatif, ni contrat
TypeScript, ni maquette. Le catalogue `applications_elsatia` contient exactement trois codes seedés :
`gestion_pro`, `colors`, `reserves`. `tools` fonctionne sur un mécanisme d'entitlements distinct
(`entitlements_utilisateurs_elsatia`, `tools_monetization_*`), non inscrit au catalogue multi-app.

**Conséquence directe** : Market est une construction intégralement neuve. L'audit ne cherche donc
pas « qu'est-ce qui est déjà fait », mais « qu'est-ce qui est réutilisable sans être déformé ».

---

## 2. Le socle réellement réutilisable

### 2.1 Le socle multi-application (LIVRÉ, migration 234)

`20260826000234_elsatia_multi_app_convergence_v1.sql` installe un modèle d'autorisation
applicative à trois étages, entièrement générique :

```
applications_elsatia(code, nom, statut_produit ∈ {disponible, bientot, interne}, url_*, ordre)
   ↓
roles_applications_elsatia(application_code, code, nom)          -- rôles PROPRES à l'application
   ↓
acces_applications_entreprises(entreprise_id, application_code,  -- droit d'usage de l'ORGANISATION
   autorise, source, valide_du, valide_jusqu_au)
   ↓
habilitations_applications_utilisateurs(entreprise_id,           -- habilitation de la PERSONNE
   utilisateur_id, application_code, role_code, autorise, fenêtre)
   ↓
historique_acces_applications(...)                               -- audit append-only
```

La fonction de décision `a_acces_application(entreprise_id, application_code)` exige
**cumulativement** : appartenance active (`est_membre_actif`), organisation autorisée dans sa
fenêtre de validité, utilisateur habilité dans sa fenêtre, rôle actif propre à l'application.
L'admin plateforme dispose d'un bypass, mais **uniquement sur la notion « application autorisée »**,
jamais sur les RLS métier.

Le commentaire de la migration est explicite et engageant : *une habilitation est propre à une
application ; elle ne dérive ni d'un poste, ni d'une permission métier Gestion Pro, ni d'un rôle
détenu dans une autre application.*

**Verdict** : réutilisable **tel quel**, sans adaptation. Market s'inscrit comme
`applications_elsatia('market', …, statut_produit='bientot')` avec ses propres rôles. C'est
l'élément le plus solide de l'écosystème pour ce projet.

**Limite structurante à retenir dès maintenant** : ce socle gouverne l'accès d'une **organisation
et de ses membres** à une application. Il ne sait rien décrire d'un **particulier acheteur sans
entreprise** — cas central de Market. Voir §4.1.

### 2.2 Le précédent de publication cross-tenant : l'annuaire Réserves (LIVRÉ, migration 268)

C'est le seul endroit de tout l'écosystème où une donnée d'une organisation devient visible par une
autre organisation. Il mérite d'être lu de près parce qu'il fixe la doctrine maison.

`reserves_annuaire_publication` est une table **opt-in explicite** :

- clé primaire = `entreprise_id` (une organisation, une décision) ;
- `publiee boolean not null default false` — rien n'est publié par défaut ;
- champs publiés **choisis et limités** : `corps_etat`, `zone_intervention`, `email_contact`,
  `telephone_contact` — et rien d'autre ;
- `check (not publiee or publiee_at is not null)` — une publication est datée ;
- `maj_par` — on sait qui a publié.

La fonction de recherche `reserves_annuaire_rechercher(p_entreprise_id, p_terme)` est
`security definer stable` et porte trois gardes anti-abus remarquables :

1. **contrôle de droit en entrée** : `reserves_action_autorisee(…, 'inviter_entreprise')` — on ne
   cherche pas dans l'annuaire sans en avoir le droit ;
2. **SIRET exact obligatoire** — 14 chiffres, un préfixe ne suffit pas. Le commentaire du code le
   justifie : *« ce serait une énumération déguisée du registre des organisations ELSATIA »* ;
3. **recherche par nom réservée aux publiées**, minimum 3 caractères, `limit 20`.

**Verdict** : c'est le **patron directeur** de Market. Une annonce Market est exactement le même
objet conceptuel — une donnée d'un tenant volontairement exposée hors de son tenant — mais avec un
public infiniment plus large (visiteur anonyme, particulier). Les trois gardes doivent être
reprises et **durcies**, pas assouplies.

**Écart majeur à traiter** : l'annuaire Réserves n'est **jamais lisible par un anonyme**. Market
l'est par construction. Toute la surface d'exposition est donc à reconcevoir, pas à recopier.

### 2.3 Identité, organisation, appartenance (LIVRÉ, migration 001)

```
entreprises(id, reference_interne, nom, raison_sociale, siret, adresse, code_postal, ville,
            logo_url, assurance_decennale_*, assurance_rc_pro_numero, …)
utilisateurs(id → auth.users, nom, prenom, entreprise_active_id, deux_facteurs_actif)
utilisateurs_entreprises(utilisateur_id, entreprise_id, poste_id,
            statut ∈ {actif, invite, en_attente_validation, desactive}, client_id)
```

**Trois constats qui pèsent lourd sur Market :**

1. **`siret` est `text` nullable, sans contrainte de format, sans unicité, sans vérification.**
   Aucune colonne ne dit si le SIRET a été contrôlé, quand, par qui, contre quelle source. Réserves
   a dû se doter d'une fonction `reserves_siret_normalise()` pour s'en sortir. Or la Phase 2 du lot
   exige qu'*« un particulier ne puisse pas se déclarer professionnel simplement pour publier une
   annonce sans vérification appropriée »*. **Le socle actuel ne permet pas de tenir cette exigence.**
   C'est le premier manque bloquant.

2. **Aucune notion d'utilisateur sans organisation.** `utilisateurs.entreprise_active_id` et toute
   la chaîne RLS supposent une appartenance. Un particulier acheteur n'a pas d'entreprise. Deux
   voies existent (§4.1), aucune n'est neutre.

3. **`assurance_decennale_*` et `assurance_rc_pro_numero` existent déjà** sur `entreprises`. Ce sont
   des éléments de confiance déjà collectés, mobilisables pour un score vendeur — mais eux non plus
   ne sont vérifiés.

### 2.4 Isolation multi-tenant et RLS (LIVRÉ, mature)

168 activations RLS, un vocabulaire de garde stabilisé : `est_membre_actif`, `a_permission`,
`role_courant_entreprise`, `est_plateforme_admin`, `est_plateforme_proprietaire`,
`plateforme_exiger_permission`, `plateforme_exiger_session_aal2`.

L'écosystème sait faire du cloisonnement par `entreprise_id`. Il **ne sait pas** faire de la lecture
publique anonyme gouvernée : aucune policy existante n'accorde de `select` au rôle `anon` sur une
donnée métier. Market introduit ce mode d'accès pour la première fois.

### 2.5 Assistance plateforme (LIVRÉ + lot non fusionné)

| Élément | État | Contenu |
|---|---|---|
| `acces_support_log` | LIVRÉ (mig. 001) | trace minimale : utilisateur, entreprise, date, motif |
| `plateforme_acces_entreprises` | LIVRÉ (mig. 075) | entrée/sortie horodatée, `motif` d'au moins 5 caractères, `termine_at`, `termine_motif` |
| `est_acces_support_actif()` | LIVRÉ | garde de lecture |
| `plateforme_entrer_entreprise` / `plateforme_quitter_entreprise` | LIVRÉ | ouverture/fermeture explicite |
| `plateforme_journal_actions` + `plateforme_journaliser()` | LIVRÉ | journal des actions plateforme |
| Assistance stricte par défaut, verrouillée en Production | **NON FUSIONNÉ** (`9fcf128`) | lot `feat/platform-cross-app-support-access-communications-v1` |

**Verdict** : le mécanisme exigé par la Phase 10 (*« accès justifié, limité et notifié »*) est
**conçu et partiellement livré**, mais son durcissement vit sur une branche non fusionnée. Market ne
doit pas réinventer ce mécanisme : il doit s'y brancher, et **dépend donc de la fusion de `9fcf128`**.

### 2.6 Journalisation et audit (LIVRÉ, dispersé)

Il n'existe **pas** de journal d'audit unique. On compte au moins sept journaux spécialisés :
`historique_acces_applications`, `plateforme_journal_actions`, `journal_audit_notes_frais`,
`journal_audit_paie`, `journal_abus_securite`, `journal_ia`, `reserves_historique`,
`colors_*_historique`. Le motif append-only est employé de façon récurrente (18 migrations le
mentionnent explicitement) et Colors comme Réserves l'appliquent sérieusement.

**Verdict** : le **motif** est réutilisable et éprouvé ; la **table** ne l'est pas. Market aura son
propre journal append-only, cohérent avec le motif maison.

### 2.7 Sécurité applicative (LIVRÉ, directement réutilisable)

```
rate_limits_applicatifs(cle, identifiant_hash sha256, fenetre_debut, expire_at, compteur)
journal_abus_securite(cle, identifiant_hash, compteur, maximum, detecte_at)
consommer_rate_limit(...)
```

Les identifiants sont **hachés en SHA-256** (contrainte `~ '^[0-9a-f]{64}$'`), ce qui est le bon
réflexe pour du rate-limiting sur adresse IP ou e-mail. Directement mobilisable pour Market
(anti-spam de messagerie, anti-scraping d'annonces, anti-énumération de vendeurs).

### 2.8 Stockage (LIVRÉ, mais inadapté en l'état)

13 buckets référencés par les policies : `chantier-documents`, `colors-seaux`, `devis-medias`,
`documents-paie`, `bulletins-paie`, `documents-employes`, `entreprise-assets`,
`factures-fournisseurs`, `fiches-techniques`, `messagerie-medias`, `notes-frais`,
`notes-frais-exports`, `pointage-preuves`, `reserves-photos`, `reserves-plans`.

**Tous sont privés et cloisonnés par `entreprise_id`, à l'exception de `entreprise-assets`.** Les
policies suivent un motif propre : le chemin encode le tenant, une fonction
(`entreprise_id_depuis_storage_depense`, `colors_photo_stockage_valide`,
`reserves_storage_photo_autorisee`) valide l'appartenance.

**Écart Market** : une photo d'annonce doit être lisible par un **visiteur anonyme**, tout en
restant supprimable, modérable et attribuable. Aucun bucket existant ne remplit ce contrat. Il en
faudra un nouveau, avec une règle de nommage qui ne divulgue **ni** `entreprise_id` **ni**
identifiant interne dans l'URL publique.

Rappel de l'état réel de la Production (audit DR antérieur) : 13 buckets, **0 objet réel**, seul
`entreprise-assets` public. Le stockage est donc, en pratique, vierge.

### 2.9 Notifications (LIVRÉ, deux implémentations concurrentes)

| Implémentation | Portée | Maturité |
|---|---|---|
| `notifications_utilisateurs` + `notifier_utilisateur()` + `preferences_notifications_push` + `push_abonnements` | Gestion Pro | générique, simple |
| `reserves_notifications_types` / `_envois` / `_lectures` / `reserves_preferences_notifications` / `reserves_evenements_notifications` | Réserves | **beaucoup plus riche** : typologie, préférences par type, file d'envoi, accusés de lecture, échéances |

**Verdict** : le modèle Réserves est le bon patron pour Market (une place de marché a besoin de
typologie, de préférences fines et d'une file d'envoi fiable), mais il est **spécifique à Réserves**,
pas factorisé. Market devra soit le dupliquer (dette assumée), soit le généraliser (coût, et
modification de Réserves — **interdite par ce lot**). Décision à porter à Julien.

### 2.10 Paiement : Stripe (LIVRÉ, et bien plus avancé que prévu)

Deux usages **distincts** de Stripe coexistent déjà :

**(a) ELSATIA encaisse ses propres clients** — abonnements et Boutique.

```
plans_abonnement(code, version, prix_mensuel_ht, prix_annuel_ht, utilisateurs_inclus, …)
abonnements_entreprises(entreprise_id, code_offre, version_tarif, periodicite,
                        prix_contractuel_ht, statut, stripe_subscription_id, stripe_customer_id)
factures_abonnement, stripe_webhook_events, stripe_attestation,
operations_capacite_stripe, plateforme_verrous_remise_stripe
```
Webhooks cloisonnés : `/api/stripe/abonnement/webhook`, `/api/stripe/boutique/webhook`,
`/api/tools/monetization/stripe/webhook`. Idempotence traitée (`stripe_webhook_events`).

**(b) Une entreprise cliente encaisse SES propres clients — Stripe Connect Standard, déjà câblé.**

```
entreprises.stripe_account_id            text, index unique partiel
entreprises.stripe_onboarding_complete   boolean not null default false
/api/stripe/oauth/callback               échange du code OAuth, garde d'état anti-CSRF,
                                         contrôle de permission `gerer_parametres`
```

**C'est le constat le plus important de l'audit pour la Phase 8.** ELSATIA sait déjà rattacher un
compte Stripe appartenant à une entreprise tierce, avec un parcours OAuth propre.

**Mais** : recherche de `application_fee`, `application_fee_amount`, `transfer_data`,
`on_behalf_of` dans `src/lib/stripe.ts` → **aucune occurrence**. Seul `stripeAccount` (appel *au nom
de* l'entreprise connectée) est utilisé.

**Traduction opérationnelle** : le montage actuel est un Connect **Standard sans commission**.
ELSATIA n'intercepte aucun flux et ne prélève rien. Passer à un modèle où ELSATIA prélève une
commission sur une vente entre deux tiers change **la nature juridique et fiscale** de la
plateforme (§ rapport juridique) et impose des développements Connect substantiels (KYC, comptes
Express ou Custom, `application_fee_amount`, reversements, litiges, chargebacks). **Rien de tout
cela n'existe.**

### 2.11 Le contrat commercial canonique (LIVRÉ sur `ab6f9bd`)

`src/lib/tarification.canonical.json`, version `CANONICAL-V4-2026-09` : source de vérité unique,
consommée par l'application **et**, via un artefact généré, par le site vitrine.

- 4 offres Gestion Pro : Mini 79 € / Pro 249 € / Business 449 € / Entreprise 599 € HT mensuels
- règle annuelle : `annuel = 10 × mensuel` (2 mois offerts)
- comptes supplémentaires **par rôle** (terrain 5 €, chef d'équipe 9 €, administratif 15 €,
  expert-comptable 0 €) — génération courante ; la grille par forfait est conservée non
  sélectionnable pour ne pas repricer les contrats signés
- pack de crédits IA : achat **ponctuel** 29 € / 500 opérations ; option IA intensive récurrente 79 €
- 5 modules à la carte : Pointage 25 €, Stock 29 €, Matériel et véhicules 19 €, Notes de frais 12 €,
  Rentabilité avancée 29 €

**Verdict pour Market** : la **structure** du contrat (offres, options récurrentes, achats ponctuels,
modules, générations tarifaires versionnées avec conservation des anciennes) est excellente et
directement réutilisable pour modéliser une offre Market. Les **montants** ne le sont pas : ils
décrivent Gestion Pro. Aucun tarif Market n'est inventé dans ce lot.

**Dette connue et non résolue, qui concerne Market** : le prix souscrit n'est pas figé au niveau du
contrat (le prix unitaire est relu dans le code à chaque affichage) ; `options_abonnement_entreprises`
porte un `prix_unitaire_contractuel_ht` qu'**aucun code applicatif n'écrit**. Si Market ajoute une
ligne d'abonnement, il héritera de ce défaut. Voir décision D-7.

### 2.12 Le catalogue produit, le stock et Colors (LIVRÉ)

```
articles_stock(entreprise_id, reference, designation, unite, quantite_stock, seuil_alerte,
               prix_achat_ht, emplacement, actif)   -- unique(entreprise_id, reference)
mouvements_stock, inventaires, lignes_inventaire, fiches_techniques_articles
colors_seaux(entreprise_id, emplacement_id, marque, produit, reference_produit,
             teinte_nom, teinte_reference, couleur_hex, ral_approxime, ral_confirme,
             mode_quantite ∈ {pourcentage, volume, poids}, quantite_nominale, quantite_restante,
             pourcentage_restant (généré), etat ∈ {ferme, ouvert, vide, archive},
             photo_principale_path, created_by, archived_at)
```

`colors_seaux` est remarquablement bien contraint : cohérence mode/unité/quantité imposée par
`check`, état `vide` impossible sans quantité nulle, `archive` impossible sans `archived_at`,
RAL confirmé impossible sans RAL approximé.

**Point de vigilance produit** (rappel d'une décision antérieure) : Colors n'a **pas de suppression
physique** — la corbeille est l'état `archive`, et le journal est append-only. Toute publication
Market issue de Colors doit respecter cette traçabilité.

**Écart Market** : `articles_stock` et `colors_seaux` décrivent un **stock interne**, pas une
**offre commerciale**. Il manque partout : prix de vente, état d'usure, photos multiples, description
commerciale, localisation de retrait, conditions. Un article de stock **n'est pas** une annonce. Voir
le document Bridge.

### 2.13 Ce qui n'existe PAS et qui est structurant

| Besoin Market | État réel |
|---|---|
| Recherche plein texte transverse | **absente**. `tsvector` n'apparaît que dans 2 migrations Colors. Aucune extension `pg_trgm` ni `unaccent` installée. |
| Géolocalisation / distance | `latitude`/`longitude` existent (pointage, chantiers, interventions, bons de livraison) en `numeric` nu. **Pas de PostGIS, pas de `earthdistance`, pas d'index géospatial.** Une seule fonction de distance métier (`zone_petit_deplacement_pour_distance`). |
| Lecture publique anonyme | **aucune policy `anon`** sur donnée métier dans tout le schéma. |
| Vérification d'entreprise | **inexistante**. |
| Compte particulier sans entreprise | **inexistant**. |
| Messagerie inter-tenants | `messages_internes` / `conversations_internes` sont **intra-entreprise** ; `reserves_conversations` est inter-entreprises mais liée à un chantier partagé. Aucune messagerie acheteur↔vendeur anonyme. |
| Modération de contenu | **inexistante** (aucun signalement, aucune file de modération, aucun contrôle d'image). |
| Avis / réputation | **inexistants**. |
| Commission plateforme | **inexistante** (Connect sans `application_fee`). |
| Export RGPD | `exporter_donnees_entreprise()` existe, **périmètre entreprise uniquement**. Rien pour un particulier. |

---

## 3. Matrice de réutilisation

Légende « Réutilisable » : **3** = tel quel · **2** = avec adaptation · **1** = patron seulement · **0** = inutilisable.

| Besoin Market | Élément existant | Réut. | Adaptation | Nouveau modèle requis |
|---|---|:---:|---|---|
| Compte ELSATIA commun | `auth.users` + `utilisateurs` | 3 | aucune | non |
| Enregistrement de l'application | `applications_elsatia` | 3 | ajouter `('market', …, 'bientot')` | non |
| Rôles applicatifs Market | `roles_applications_elsatia` | 3 | seed de rôles Market | non |
| Droit d'usage de l'organisation | `acces_applications_entreprises` | 3 | aucune | non |
| Habilitation des personnes | `habilitations_applications_utilisateurs` | 3 | aucune | non |
| Audit des droits | `historique_acces_applications` | 3 | aucune | non |
| Décision d'accès | `a_acces_application()` | 3 | aucune | non |
| Organisation vendeuse | `entreprises` | 2 | `siret` non vérifié, non unique, non formaté | **oui — vérification pro** |
| Appartenance / statut membre | `utilisateurs_entreprises` | 3 | aucune | non |
| **Particulier acheteur** | — | **0** | — | **oui — identité sans tenant** |
| **Vérification du professionnel** | `entreprises.siret` (nu) | **1** | — | **oui — dossier de vérification** |
| Isolation multi-tenant | RLS + `est_membre_actif`, `a_permission` | 3 | aucune pour l'espace privé vendeur | **oui — policies `anon`** |
| **Publication cross-tenant** | `reserves_annuaire_publication` + `reserves_annuaire_rechercher` | **1** | patron d'opt-in + gardes anti-énumération | **oui — annonces publiques** |
| Catalogue produit | `articles_stock`, `fiches_techniques_articles` | 1 | stock interne ≠ offre commerciale | **oui — annonce** |
| Stock / quantités | `mouvements_stock`, `appliquer_mouvement_stock()` | 2 | réservation sans fausser le stock réel | **oui — réservation** |
| Colors | `colors_seaux`, `colors_mouvements` | 2 | source d'attributs (marque/réf/teinte/RAL/photo) | non (pont) |
| Photos | policies `storage.objects` (13 buckets privés) | 1 | motif de validation par fonction | **oui — bucket public modéré** |
| Documents | `documents_chantier`, `versions_documents_*` | 1 | patron de versionnement | non (V1) |
| Paiements | Stripe abonnement + Boutique | 2 | pour l'**abonnement vendeur** uniquement | non |
| **Paiement entre tiers** | Connect Standard (OAuth, `stripe_account_id`) | **1** | aucun `application_fee` / `transfer_data` | **oui — si commission** |
| Factures | `factures`, `factures_abonnement`, `lignes_factures` | 2 | facture d'abonnement Market : oui ; facture de vente entre tiers : non | **oui — si facturation tiers** |
| Remises | `plateforme_operations_remise`, `promotions_commerciales` | 2 | applicable à l'abonnement Market | non |
| Notifications | modèle Réserves (typologie, envois, lectures, préférences) | 1 | non factorisé, spécifique Réserves | **oui — ou généralisation** |
| Accès externes | `acces_externes_documents`, `codes_acces`, `document_commercial_par_token` | 2 | patron de token à portée limitée | non |
| Journal d'audit | motif append-only (18 migrations) | 1 | aucun journal générique | **oui — journal Market** |
| Stockage | 13 buckets privés, 1 public | 1 | — | **oui — bucket annonces** |
| **Recherche** | `tsvector` (Colors uniquement) | **1** | pas d'index transverse, pas de `pg_trgm`/`unaccent` | **oui — index de recherche** |
| **Géolocalisation** | `latitude`/`longitude` `numeric` nus | **1** | pas de PostGIS ni d'index géo | **oui — recherche par distance** |
| Adresses | champs texte plats (`adresse`, `code_postal`, `ville`) | 2 | pas de normalisation, pas de géocodage | **oui — géocodage** |
| Contacts canoniques | `contacts_clients` (ACL 255), `clients` | 1 | modèle client canonique livré (`e7f837b`) non fusionné | non (V1) |
| Modération plateforme | `plateforme_admins`, `plateforme_journal_actions`, `plateforme_a_permission()` | 2 | rôles plateforme réutilisables | **oui — file de modération** |
| Assistance justifiée | `plateforme_acces_entreprises`, `acces_support_log`, `est_acces_support_actif()` | 3 | **dépend de la fusion de `9fcf128`** | non |
| Anti-abus | `rate_limits_applicatifs`, `journal_abus_securite`, `consommer_rate_limit()` | 3 | nouvelles clés de limitation | non |
| Contrat commercial | `tarification.canonical.json` (structure) | 2 | structure oui, montants non | **oui — offre Market** |
| Export RGPD | `exporter_donnees_entreprise()` | 2 | périmètre entreprise seulement | **oui — export particulier** |
| Suppression de compte | `tools_demandes_suppression_compte`, `demander_suppression_entreprise()` | 2 | patron de demande différée | non |

**Synthèse quantitative** : sur 36 besoins recensés, **11 sont couverts tels quels** (socle multi-app,
identité, RLS privée, assistance, anti-abus), **12 demandent une adaptation**, et **13 exigent un
modèle neuf** — dont 5 sont structurants et sans précédent dans l'écosystème : identité du
particulier, vérification du professionnel, exposition publique anonyme, recherche géographique,
modération.

---

## 4. Les cinq questions d'architecture que l'audit ne peut pas trancher seul

### 4.1 Comment existe un particulier acheteur ?

Trois voies, toutes coûteuses :

| Voie | Description | Avantage | Coût / risque |
|---|---|---|---|
| **A. Entreprise fantôme** | chaque particulier reçoit une `entreprises` technique | zéro changement de RLS | pollue le registre des organisations, casse les compteurs de facturation et l'annuaire, ment sur la nature de l'acteur. **Déconseillé.** |
| **B. Identité Market autonome** | table `market_comptes_acheteurs` liée à `auth.users`, sans `entreprise_id` | modèle honnête, RGPD net, n'affecte aucune application existante | toutes les policies Market doivent gérer deux formes de sujet (membre d'organisation / personne seule) |
| **C. Achat sans compte** | consultation et mise en relation anonymes, compte requis seulement pour messagerie/réservation | V1 minimale, très faible surface RGPD | ferme la porte aux favoris, alertes, historique, avis |

**Recommandation d'audit : C pour la V1 publique, B introduite dès que la messagerie ou la
réservation est ouverte.** Décision D-1.

### 4.2 Market est-il une application du catalogue, ou un site public ?

Techniquement il est les deux : un **espace vendeur** (authentifié, tenant, exactement le socle
multi-app) **et** une **vitrine publique** (anonyme, cross-tenant, indexable). L'écosystème sait
faire le premier et n'a jamais fait le second.

Conséquence d'architecture : les deux surfaces doivent être **physiquement séparées** — chemins
distincts, policies distinctes, et idéalement une lecture publique servie par des fonctions
`security definer` à projection explicite plutôt que par des policies `anon` sur les tables
(le patron `reserves_annuaire_rechercher` généralisé). Décision D-2.

### 4.3 ELSATIA touche-t-elle l'argent de la vente ?

C'est **la** question dont dépendent le modèle économique, le cadre juridique, le KYC, la TVA, les
litiges et l'essentiel de la charge de développement. L'audit constate seulement que :

- l'infrastructure de commission **n'existe pas** ;
- le Connect existant est **Standard sans `application_fee`** ;
- la décision de Julien déjà énoncée (*« seuls les professionnels qui publient paient un abonnement
  de base »*) est **compatible avec un modèle sans encaissement de la vente**.

Traité au titre des Phases 7, 8 et 9. Décision D-3.

### 4.4 Peut-on tenir une vérification professionnelle sans source externe ?

Non. Un SIRET saisi à la main n'est pas une vérification. Une vérification sérieuse suppose une
consultation d'un registre officiel (INSEE/Sirene, base entreprise) — donc une dépendance externe,
un contrat, une conservation de preuve et une politique de rétention. Aucune de ces briques
n'existe. Décision D-4.

### 4.5 Duplique-t-on ou généralise-t-on les notifications ?

Le bon modèle est celui de Réserves, mais il est spécifique à Réserves et ce lot **interdit** de
modifier Réserves. Dupliquer crée une troisième implémentation ; généraliser touche une application
gelée. Décision D-5.

---

## 5. Dépendances externes du projet Market

| Dépendance | Nature | Impact si absente |
|---|---|---|
| Fusion de `9fcf128` (assistance + communications) | interne, branche non fusionnée | Market devrait réinventer l'accès d'assistance — inacceptable |
| Fusion du train canonique dans la ligne de production | interne | Market se construirait sur une base divergente |
| Réconciliation du ledger de migrations (n° ≠ rang, delta cutover 62) | interne | toute migration Market héritera du désordre |
| Prix figé au contrat (dette §2.11) | interne | une offre Market naîtrait avec le même défaut |
| Source de vérification d'entreprise (Sirene ou équivalent) | **externe, contractuelle** | pas de vérification pro possible |
| Géocodage d'adresses | **externe** | pas de recherche par distance |
| Modération d'images | **externe ou humaine** | risque de contenu illicite non filtré |
| Décision Stripe Connect avec commission | **externe (Stripe) + juridique** | modèle économique indéterminé |
| Marque ELSATIA — jalon de commercialisation 21/10/2026 | juridique | Market ne peut être présenté comme commercialisable avant |
| Lot ELSATIA-UI-V2 (refonte visuelle avant commercialisation) | interne, non démarré | toute UI Market produite avant serait à refaire |

---

## 6. Verdict de l'audit

**Market est un produit neuf posé sur un socle sain mais partiel.**

Ce qui est acquis est solide et de bonne facture : le socle multi-application est générique et
correctement pensé, l'isolation multi-tenant est mature, l'anti-abus est réutilisable tel quel, le
mécanisme d'assistance justifiée est conçu, la structure du contrat commercial est un bon modèle, et
l'annuaire Réserves fournit un précédent de publication cross-tenant dont la prudence (SIRET exact
obligatoire, opt-in daté, contrôle de droit en entrée) doit être reprise sans être diluée.

Ce qui manque n'est pas accessoire. Cinq briques structurantes sont absentes de tout l'écosystème :
l'**identité d'un particulier sans organisation**, la **vérification qu'un vendeur est réellement un
professionnel**, la **lecture publique anonyme gouvernée**, la **recherche textuelle et géographique**,
et la **modération**. Aucune ne se dérive d'un existant ; chacune est un lot en soi.

L'audit ne relève **aucun obstacle technique rédhibitoire**. Il relève en revanche que la charge
réelle est dominée non par la technique mais par trois décisions non techniques — le statut
juridique de la plateforme, l'encaissement ou non de la vente, et la source de vérification
professionnelle — dont l'issue détermine entre un projet modeste et un projet lourd.

**Recommandation d'audit** : ne rien construire avant que les décisions D-1 à D-8 (rapport final)
soient rendues, et privilégier une V1 délibérément étroite — mise en relation sans encaissement —
qui rend le produit exploitable tout en laissant chaque option ouverte.

---

## 7. Confirmation de non-modification

Cet audit est en lecture seule. Aucun fichier de `supabase/migrations/`, `src/`, `apps/` ou
`packages/` n'a été modifié. Aucun numéro de ledger n'a été réservé. Aucun objet Stripe, Test ou
Live, n'a été lu par API ni modifié. Aucun déploiement, aucune fusion.
