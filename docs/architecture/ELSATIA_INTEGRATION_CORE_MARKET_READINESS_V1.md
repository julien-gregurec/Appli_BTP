# ELSATIA — Integration Core & Market readiness V1

Date : 2026-09-02. **Audit + architecture + contrats. Aucune implémentation.**
Aucune migration, aucun code métier, aucun ajout au catalogue réel, aucun rôle Market réel,
aucune table d'événements, aucune queue, aucune action Production / Supabase / Stripe / Vercel.
Colors métier, Tools métier, MFA, ACL, UI-V2 : non touchés.

Base auditée : `feat/preprod-e2e-runbook-integration-v1` @ `6df3ebd13abab6aa1391bdc4fe73da9b3bb31415`.

> **Verdict d'ensemble en une phrase** : le socle multi-app (catalogue d'applications, rôles
> par app, entitlements organisation, habilitations utilisateur, contexte d'identité, RLS,
> audit) est **déjà générique** — ajouter Market / Chantier / Plans ne demande **aucune refonte
> de Gestion Pro**. Ce qui **n'existe pas encore** et devra être conçu **avant Market / Chantier
> (pas avant Gestion Pro)** : l'**Integration Core** = la passerelle événementielle GP ↔ modules
> (transfert de plans, de stock, de pointages…) et le **contrat de liaison universel** « tout
> peut être lié à tout ».

---

## 1. État multi-app actuel

Socle posé par `20260826000234_elsatia_multi_app_convergence_v1.sql` (+ `contexte_application_courant`
consommé par Colors, + entitlements Tools R8/R10).

| Brique | Existe | Dynamique | Hardcodée | Réutilisable future app | Dette |
|---|:--:|:--:|:--:|---|---|
| `applications_elsatia` (catalogue) | ✅ | ✅ `code` regex `^[a-z][a-z0-9_]{1,49}$`, `actif`, `ordre`, `icone`, `url_locale/preview/production`, `statut_produit ∈ {disponible,bientot,interne}` | non | **directe** : ajouter `market` = 1 `INSERT` | manque `slug`, `category`, `capabilities`, `billing_model` (attributs de confort) |
| `roles_applications_elsatia` | ✅ | ✅ `(application_code, code)` PK, FK catalogue, `actif`, `ordre` | non | **directe** : rôles Market = `INSERT` | — |
| `acces_applications_entreprises` (entitlement org) | ✅ | ✅ `autorise`, `source` (texte libre : abonnement/essai/offre/manuel), `reference_externe`, `valide_du`/`valide_jusqu_au`, `metadata jsonb`, `unique(entreprise_id, application_code)` | non | **directe** ; source commerciale **découplée** de la décision d'autorisation | wiring billing → entitlement à faire par app (pas structurel) |
| `habilitations_applications_utilisateurs` | ✅ | ✅ `role_code`, fenêtre de validité, FK composite vers `utilisateurs_entreprises` **et** vers `roles_applications_elsatia` | non | **directe** ; une habilitation app **ne dérive ni d'un poste, ni d'une permission GP, ni d'un rôle d'une autre app** | — |
| `historique_acces_applications` (audit append-only) | ✅ | ✅ `cible_type ∈ {entreprise,utilisateur}`, `action`, `auteur_email` | non | **directe** | pas d'`acteur_uid` (seulement `auteur_email`) — mineur |
| RPC décision `a_acces_application(entreprise_id, app_code)` | ✅ SECURITY DEFINER STABLE | ✅ générique, tout code d'app | non | **directe** | — |
| RPC `applications_autorisees(entreprise_id)` (switcher) | ✅ | ✅ retourne apps + URLs + rôle | non | **directe** | — |
| RPC `contexte_application_courant()` | ✅ | ✅ résout `auth.uid()` → utilisateur + entreprise active (+ repli « Administration ELSATIA » pour admin plateforme sans appartenance) | non | **directe** : c'est le contrat d'identité inter-app | — |
| RLS 5 tables | ✅ toutes `enable row level security` | lecture bornée (`est_membre_actif` / ligne propre / `peut_gerer_acces` / `est_plateforme_admin`) ; **mutations uniquement via RPC `plateforme_*`** journalisées | — | **directe** : Market ne peut pas devenir un bypass RLS | — |
| Switcher UI (`ApplicationSwitcherGestionPro`, `packages/application-access`) | ✅ | ✅ consomme `applications_autorisees` | `CODES_APPLICATIONS_ELSATIA = [...]` (liste typée de confort) | à étendre d'1 ligne par app | cf. § 2 |
| Changement d'entreprise active | ✅ `utilisateurs.entreprise_active_id` + `tools_changer_entreprise_active` (déjà réutilisé cross-app) | ✅ | non | **directe** | fonction nommée `tools_*` → à renommer/génériser un jour (cosmétique) |
| **Integration Core (événements, passerelle GP ↔ modules)** | ❌ **inexistant** | — | — | **à concevoir** (§ 8-10, § 24) | **c'est le sujet du lot** |
| **Contrat de liaison universel (« tout peut être lié »)** | ❌ | — | — | **à concevoir** (§ 10, § 24) | idem |
| Stock commun / vocabulaire cross-app | ❌ (GP et Colors ont des modèles séparés) | — | — | mapping à définir (§ 18) | non structurel |

**Conclusion § 1 : le socle d'accès multi-app est prêt. La passerelle de synchronisation n'existe pas.**

---

## 2. Hardcodes d'application détectés

Recherche exhaustive `gestion_pro` / `colors` / `tools` + `if app === …` / `switch(app)` /
tableaux statiques dans le code actif.

| Emplacement | Nature | Classe | Action |
|---|---|:--:|---|
| `packages/application-access/src/index.ts:1` — `CODES_APPLICATIONS_ELSATIA = ["gestion_pro","colors","tools"] as const` | liste typée de confort ; `CodeApplicationElsatia = string` (ouverte), validation par **regex**, jamais utilisée comme garde | **A** | ajouter `market` etc. à la liste (1 ligne) au moment venu — non bloquant |
| `packages/application-access/src/index.ts` — `ROLES_COLORS = [...]` | constantes de rôles **propres à Colors**, pour le code Colors | **A** | chaque app aura ses propres constantes de rôles (source = `roles_applications_elsatia`) |
| `src/lib/multi-app-server.ts:85` — `construireSelecteurApplications(autorisees, "gestion_pro")` | chaque app passe **son propre code** au switcher (contexte « je suis GP ») | **A** | le repo Market passera `"market"` |
| `src/lib/tools-monetization.ts` — `metadata[application]: "tools"` (appels Stripe) | Tools **tague son propre** billing | **A** | chaque app tague le sien |
| `src/lib/feature-catalogue.ts` — `"tools"`, `"stock"`, `"warehouse"`… | **modules internes Gestion Pro** (CORE/BETA/DISABLED), sans rapport avec l'app ELSATIA Tools (collision de nom seulement) | **A** | aucune ; documenter la collision de vocabulaire |
| Branches `if (app === "gestion_pro")` / `switch(app)` cross-app | **aucune trouvée** | — | — |
| Routes / rôles / permissions statiques par app dans du code partagé | **aucun** — tout passe par `a_acces_application` (RPC générique) | — | — |

**Aucun hardcode de classe C ou D. Aucun blocage.** Les rares points de classe B (liste typée
`CODES_APPLICATIONS_ELSATIA`, nom `tools_changer_entreprise_active`) sont cosmétiques et
additifs.

---

## 3. Identity Core

Principe cible **déjà réalisé** : `1 identité ELSATIA (auth.uid) → N entreprises → N applications
→ droits spécifiques par app`.

- **Identité** : `auth.users` / `public.utilisateurs` (partagés). `auth.uid()` est la clé
  universelle.
- **Entreprises** : `utilisateurs_entreprises(utilisateur_id, entreprise_id, statut)` +
  `utilisateurs.entreprise_active_id` ; `est_membre_actif(entreprise_id)`.
- **Administrateurs** : `est_plateforme_admin()` (UID-based + AAL2), `plateforme_admins`.
- **Habilitations app** : `habilitations_applications_utilisateurs` (par `(entreprise, utilisateur,
  application)`, rôle + fenêtre de validité).
- **Contexte inter-app** : `contexte_application_courant()` renvoie `utilisateur_id, prenom,
  entreprise_id, entreprise_nom, est_admin_plateforme` — c'est **le contrat qu'une future app
  consomme** pour savoir « qui, dans quelle entreprise ».

**Obstacles identifiés : aucun.** Toute future app réutilise ces primitives sans modification.
Point d'attention (non bloquant) : `contexte_application_courant()` s'appuie sur une session
authentifiée valide sur le domaine appelant — voir § 7 (SSO).

---

## 4. Application Catalog — contrat cible

Le catalogue actuel suffit pour **fonctionner**. Attributs de confort à prévoir (migration
additive **plus tard**, non bloquante) :

| Attribut | Présent | À ajouter | Rôle |
|---|:--:|:--:|---|
| `code` (PK, regex) | ✅ | | identité stable |
| `nom`, `description`, `icone`, `ordre`, `actif` | ✅ | | affichage switcher |
| `url_locale` / `url_preview` / `url_production` | ✅ | | routage par environnement |
| `statut_produit ∈ {disponible, bientot, interne}` | ✅ | | `bientot` = affichable « Bientôt » sans accès |
| `slug` | ❌ | ⏳ | URL lisible / sous-domaine |
| `category` (ex. `erp`, `stock`, `marketplace`, `terrain`, `bureau_etudes`) | ❌ | ⏳ | regroupement switcher |
| `capabilities` (jsonb : `["events.publish","events.consume","files.public_asset","stock.source"]`) | ❌ | ⏳ | déclare ce que l'app **peut** dans l'Integration Core |
| `billing_model` (`subscription`, `usage`, `commission`, `free`, `bundled`) | ❌ | ⏳ | branchement billing générique |
| `availability` (`ga`, `beta`, `internal`, `coming_soon`) | partiel via `statut_produit` | ⏳ affiner | |

Pour Market / Chantier / Plans : au moment de leur lancement, `INSERT` dans `applications_elsatia`
(statut `bientot` puis `disponible`) + `INSERT` des rôles dans `roles_applications_elsatia`.
**Rien à faire maintenant** (on peut même différer l'insertion `bientot`).

---

## 5. Event Core — contrat d'enveloppe (spécification, non implémentée)

Concept : `application source → événement métier → Integration Core → application(s) cible(s)`.

### 5.1 Enveloppe d'événement (`evenement_integration`)

| Champ | Type | Règle |
|---|---|---|
| `event_id` | uuid | unique, généré par la source |
| `event_type` | text | `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$` — ex. `stock.updated`, `market.listing.sold` |
| `event_version` | int | ≥ 1 (voir § 21) |
| `source_app` | text | FK logique `applications_elsatia.code` |
| `source_entity_type` | text | ex. `article_stock`, `seau_colors`, `takeoff_plans` |
| `source_entity_id` | text | id opaque dans l'app source |
| `entreprise_id` | uuid | **obligatoire**, FK `entreprises` — cloisonnement |
| `actor_user_id` | uuid | `auth.uid()` validé **serveur** (jamais le payload) ; nullable si événement système |
| `occurred_at` | timestamptz | horodatage métier |
| `recorded_at` | timestamptz | `default now()` |
| `payload` | jsonb | `jsonb_typeof = 'object'` ; **jamais** de secret, jamais de PII inutile |
| `correlation_id` | uuid | relie une chaîne d'événements (une vente Market → décrément stock GP → recette) |
| `idempotency_key` | text | déduplication côté producteur (souvent `source_app:source_entity_id:event_type:version:hash`) |

### 5.2 Modèle de distribution recommandé : **outbox + relais**

1. La transaction métier de l'app source écrit l'événement dans **sa propre** table outbox
   (même transaction que la mutation → atomicité).
2. Un relais (cron ou worker) publie vers l'Integration Core (table centrale + notification).
3. Chaque consommateur a une table `consommation_evenements(consumer_app, event_id, statut, …)`
   avec `unique(consumer_app, event_id)` (idempotence de consommation).

Pas de couplage synchrone app→app. Pas de dépendance à une file externe pour la V1 (Postgres +
`LISTEN/NOTIFY` ou polling suffit au volume attendu).

---

## 6. Idempotence — contrat

- **Producteur** : même `idempotency_key` → un seul `event_id` inséré (contrainte `unique`).
- **Consommateur** : même `event_id` → appliqué **une seule fois** (`unique(consumer_app,
  event_id)` + traitement dans une transaction).
- **États conceptuels** (par consommateur) : `pending → processing → completed | failed →
  dead_letter`.
- **Retry** : backoff exponentiel borné (ex. 5 tentatives), `retry_count` tracé.
- **Timeout** : un événement `processing` depuis > N minutes redevient `pending` (lease expiré).
- **Duplicate** : ignoré silencieusement (no-op idempotent, tracé en observabilité).
- **Partial failure** : si un consommateur applique 2 mutations sur 3, la transaction **rollback**
  → l'événement reste `pending`/`failed`, jamais « à moitié appliqué ».
- **Dead letter** : après épuisement des retries, `dead_letter` + alerte ; jamais de perte
  silencieuse.

Ne pas développer la queue. Ce contrat suffit à cadrer.

---

## 7. Session / SSO

| Aspect | État réel |
|---|---|
| Identité | **unique** (`auth.users` partagé, `auth.uid()`) |
| Sessions | **isolées par sous-domaine** : `app.elsatia.fr` (GP), `colors.elsatia.fr` (Colors), futur `market.elsatia.fr`… → cookies distincts par origine |
| Portail compte central | **inexistant** (pas de `compte.elsatia.fr`) |
| SSO | **partiel / implicite** : même Supabase Auth project, mais l'utilisateur re-saisit une session par sous-domaine (ou re-login) |

**V1 acceptable (à assumer publiquement tel quel)** : *une seule identité ELSATIA, sessions par
application*. Le site et les CGU **ne doivent pas** annoncer un « SSO complet » (cf.
`ELSATIA_SITE_COMMERCIAL_READINESS_V1`, § compte commun).

**Cible post-lancement** : soit un portail `compte.elsatia.fr` émettant des sessions, soit un
cookie de domaine parent `.elsatia.fr` + refresh partagé, soit un flux OIDC interne. **Aucune
décision requise maintenant** ; aucun obstacle structurel (l'identité est déjà unique).

---

## 8. Entity References — contrat de liaison universel (« tout peut être lié »)

Deux mécanismes complémentaires, tous deux **additifs et non bloquants** :

### 8.1 Provenance (sur l'entité importée)
Toute entité créée dans une app **à partir** d'une autre porte 4 colonnes nullables :
`source_application`, `source_entity_type`, `source_entity_id`, `source_updated_at`.
→ ex. une ligne de devis GP issue d'un métré Plans sait d'où elle vient ; un `article_stock`
GP publié sur Market sait qu'il alimente un listing.
**Aujourd'hui : ces colonnes n'existent nulle part** (la provenance n'existe que pour les
fichiers via `*_storage_path`). Les ajouter plus tard = migration additive sans risque.

### 8.2 Liens explicites (table générique `liens_inter_applications`)
Pour « tout peut être lié à tout » sans coupler les schémas :

| Champ | Rôle |
|---|---|
| `id` uuid | |
| `entreprise_id` uuid | cloisonnement obligatoire |
| `app_a`, `type_a`, `id_a` | extrémité A (ex. `plans`, `takeoff`, `<uuid>`) |
| `app_b`, `type_b`, `id_b` | extrémité B (ex. `gestion_pro`, `devis_ligne`, `<uuid>`) |
| `type_lien` | ex. `derive_de`, `alimente`, `reserve_pour`, `facture`, `documente` |
| `cree_par`, `created_at`, `metadata jsonb` | audit |
| `unique(entreprise_id, app_a, type_a, id_a, app_b, type_b, id_b, type_lien)` | pas de doublon |

→ un plan lié à un chantier **et** à un devis **et** à une commande stock ; une photo terrain
liée à une réserve **et** à un compte-rendu. Le graphe se construit sans jamais modifier les
tables métier.

**Éviter les copies sans provenance** : toute donnée synchronisée = provenance (§ 8.1) +, si
pertinent, lien (§ 8.2).

---

## 9. Market — contrat d'intégration (flux figés, non développés)

### 9.1 Publication `Colors → Market`
Données minimales exposées par un événement `colors.seau.published` :
`seau_id`, `entreprise_id`, `depot_id`, `teinte` (code + libellé), `quantite_disponible`,
`unite`, `prix_indicatif_ht` (optionnel), `photo_asset_url` (**asset public dérivé**, cf. § 15),
`etat` (`neuf`, `entame`), `source: {application:"colors", entity_type:"seau", entity_id}`.

### 9.2 Publication `Gestion Pro → Market`
Événement `gestion_pro.stock.published` : `article_id` **ou** `surplus_chantier_id` **ou**
`materiel_id`, `entreprise_id`, `zone/depot_id`, `quantite_disponible`, `unite`, `designation`,
`prix_indicatif_ht` (optionnel), `photo_asset_url` (dérivé public), provenance.

### 9.3 Market ne stocke que le **listing**
Le listing Market = projection : quantités, prix marketplace, visibilité, statut. La **quantité
physique reste dans l'app source**. Market ne devient jamais l'autorité du stock.

---

## 10. Market — stock / réservation

Vocabulaire d'invariants (à porter dans le contrat, pas dans le modèle GP/Colors existant) :

| Grandeur | Définition |
|---|---|
| `physique` | quantité réellement détenue (source) |
| `reservee` | engagée (commande interne, réservation Market en cours) |
| `disponible` | `physique − reservee` |
| `publiee` | quantité exposée sur Market |
| `vendue` | cumul cédé via Market |

Invariants : `disponible ≥ 0`, `reservee ≥ 0`, `publiee ≤ disponible + reservee` (selon
politique : on peut publier au-delà du disponible immédiat si réappro garanti — **décision
produit différée**).

**Champs compatibles aujourd'hui** :
- GP : `articles_stock` (quantité, unité, zone), `mouvements_stock` (entrées/sorties),
  `zones_depot`, `inventaires` — pas de notion `reservee`/`publiee` (à ajouter, additif).
- Colors : modèle seaux propre (`colors_functional_core_v1`) — quantité par seau, dépôt.
Ni l'un ni l'autre n'a de compteur « réservé Market ». **Ne pas modifier ces modèles
maintenant** ; le contrat le prévoit pour plus tard.

---

## 11. Market — vente (flux futur)

`market.listing.sold` → Integration Core → `correlation_id` →
1. app source : `stock.reserved` puis `stock.released`/`stock.decreased` (décrément **atomique**
   côté source) ;
2. Gestion Pro (si vendeur = entreprise GP) : écriture d'une **recette / cession** (compte de
   produit) — via un événement `market.sale.settled`.

Risques à traiter dans le contrat (documentés, non résolus) :
- **double vente / deux réservations simultanées** → verrou pessimiste sur la ligne stock
  source au moment de la réservation ; le listing passe `reserved` avant paiement.
- **source offline** (Chantier) → la réservation est *provisoire* tant que la source n'a pas
  confirmé (ack événement) ; timeout → libération.
- **annulation / remboursement** → événement compensatoire `market.sale.reverted` → `stock.released`.
- **quantité partielle** → le listing supporte des ventes fractionnées ; `vendue` cumulatif.

---

## 12. Chantier — contrat d'intégration

| Sens | Objets | Réutilisable dans GP aujourd'hui |
|---|---|---|
| **GP → Chantier** | chantiers, planning, documents, équipes (`employes`, `affectations`), tâches (`taches`) | ✅ tables existantes (`chantiers`, `planning`, `taches`, `affectations`, `documents_chantier`) |
| **Chantier → GP** | pointages, photos, comptes-rendus, réserves, incidents, bons de livraison, demandes de matériel, signatures | partiellement : `pointages`/`sessions_pointage`, `comptes-rendus`, `documents_chantier`, `signatures_documents_metier` existent ; **réserves / incidents / demandes matériel / BL** n'ont pas d'entité GP dédiée |

Contrat : chaque objet Chantier→GP arrive via un événement typé (`chantier.pointage.created`,
`chantier.report.created`, `chantier.reserve.raised`, `chantier.material_request.created`…) +
provenance + lien vers le chantier GP. GP décide s'il matérialise une entité ou juste un lien.

---

## 13. Chantier offline — modèle conceptuel (à concevoir, non développé)

| Brique | Contrat |
|---|---|
| File locale | mutations horodatées en attente d'envoi, avec `idempotency_key` |
| Curseur de sync | dernier `event_id` / `updated_at` reçu du serveur par entité |
| Autorité | **serveur fait foi** en cas de conflit non résoluble ; le terrain est prévenu |
| Horodatages | `occurred_at` (terrain) vs `recorded_at` (serveur) conservés tous les deux |
| Idempotence | rejouer la file = no-op si `event_id` déjà consommé |
| Retry | backoff borné ; les pièces jointes s'uploadent séparément (référence d'abord, binaire ensuite) |
| Upload pièces jointes | 2 temps : créer l'objet Storage (chemin déterministe `entreprise_id/…`) puis lier |

Conflits métier à arbitrer (documentés) :
- **pointage modifié bureau + terrain** : dernière écriture *validée* gagne ; l'autre version est
  conservée en historique, pas écrasée en silence.
- **tâche clôturée des deux côtés** : idempotent (même état cible) → pas de conflit.
- **document supprimé côté bureau pendant édition terrain** : la suppression gagne ; l'édition
  terrain part en `dead_letter` avec notification.
- **photo prise offline puis chantier supprimé** : la photo est orpheline → rattachée à un
  « non classé » de l'entreprise, jamais perdue, jamais rendue publique.

---

## 14. Plans — contrat d'intégration

`Plans → GP` (via événements `plans.takeoff.completed`, `plans.item.exported`) :
métrés, quantitatifs, repères, portes, fenêtres, cloisons, surfaces, matériaux, liste de
commande, éléments de devis.

**Formats** : le contrat impose du **structuré** (`payload` JSON : `{items:[{repere, type,
quantite, unite, surface_m2, materiau, prix_unitaire?}], plan_ref, page, zone}`), **plus**
éventuellement un rendu (SVG vectoriel annoté, image, PDF) **en pièce jointe liée**, jamais à la
place du structuré.
→ **ne jamais synchroniser un PDF opaque seul** : GP doit pouvoir transformer un métré en lignes
de devis / commande sans OCR.

Lien : chaque item importé → `liens_inter_applications` (`plans/takeoff_item` ↔
`gestion_pro/ligne_devis` ou `ligne_commande`, `type_lien = derive_de`).

---

## 15. Scan — service transversal

**Recommandation : B — service partagé** (pas une application autonome). Scan est une
capacité (`capabilities: ["scan"]`) consommée par GP (factures fournisseurs, tickets, BL,
codes-barres), Colors (étiquettes peinture, inventaire), Chantier (BL terrain).

Contrat : `document → extraction → {fields, confidence[0..1]} → validation humaine →
événement métier` (`scan.document.extracted` avec `target_hint: "facture_fournisseur"`). La
mutation métier finale est **toujours** faite par l'app cible après validation humaine — Scan
ne mute jamais directement une entité métier.

---

## 16. Stock Core

GP (`articles_stock`, `mouvements_stock`, `zones_depot`, `inventaires`, `stock`, `borne`) et
Colors (seaux/teintes/dépôts) ont des modèles **distincts et matures**. **Ne pas fusionner.**

À définir (documentaire, non bloquant) :
- **vocabulaire commun** : `produit`, `quantite`, `unite`, `emplacement` (dépôt/véhicule/zone),
  `reservation`, `mouvement`, `lot`, `photo`.
- **mapping** : `colors.seau` ↔ concept `stock.item` ; `gestion_pro.article_stock` ↔
  `stock.item` ; `gestion_pro.mouvement_stock` ↔ `stock.movement`.
- **IDs stables** : chaque item exposé garde son id natif + `source_application` ; l'Integration
  Core ne réattribue jamais d'id.

---

## 17. Safety — module potentiel

Domaine : EPI, habilitations réglementaires, formations, incidents, accueils sécurité, plans de
prévention, signatures, expirations/alertes.

Liens avec l'existant : `employes` (porteur d'EPI / d'habilitations), `chantiers` (plan de
prévention, accueil sécurité), `signatures_documents_metier`, `alertes_operationnelles`
(expirations). Safety peut être un **module GP** (dans `feature-catalogue`) ou une **app**
(`applications_elsatia`) — **décision différée** ; les deux chemins sont ouverts sans refonte.

---

## 18. Connect — parties externes

**Principe : ne pas réutiliser un rôle interne Gestion Pro.** Prévoir un **domaine de
permissions externe dédié** : `roles_applications_elsatia('connect', …)` avec des rôles
`connect_client`, `connect_architecte`, `connect_fournisseur`, `connect_sous_traitant`, et une
table de portée (`portee_connect`) reliant un `auth.uid()` externe à un périmètre précis
(1 chantier, 1 devis, 1 lot de documents) plutôt qu'à une entreprise entière.

Flux : devis, facture, documents, réserves, validation, photos, situations de travaux.

**Brique partielle réutilisable** : `/document/[token]` + `resoudreTokenPartage()` — accès
anonyme, borné à **un** document (devis/facture), `noindex`, aucune navigation ELSATIA. C'est le
**germe** de Connect (partage granulaire par jeton), mais limité en lecture à devis/facture.
Connect complet = étendre à un compte externe authentifié + portée + écriture bornée (valider
une réserve, déposer une photo).

---

## 19. Files Core

État : 13 buckets, `entreprise-assets` **public**, 12 privés, préfixe `entreprise_id` en 1er
segment (`storage.foldername(name)[1]`), 33 policies RLS, partage par jeton (`/document/[token]`,
`/imprimer/partage/[token]`).

Règles futures à graver dans le contrat :

> **Une application privée (Colors, Chantier…) ne doit JAMAIS rendre un fichier public
> automatiquement lors d'une publication Market.**

Modèle recommandé : **original privé** (bucket privé de l'app source) **+ asset public dérivé**
généré explicitement (redimensionné, EXIF nettoyé, filigrané si besoin) dans `entreprise-assets`
ou un bucket `market-assets` public dédié. Le listing Market ne référence **que** l'asset
dérivé. Alternative : *signed/public delivery* contrôlée (URL signée à durée courte) si on
refuse tout asset public permanent.

---

## 20. Billing / Entitlements Core

Modèle cible (déjà à moitié en place) :

| Niveau | Table | Champs |
|---|---|---|
| Organisation | `acces_applications_entreprises` | `application_code`, `autorise`, `source` (`abonnement`/`essai`/`offre`/`manuel`), `reference_externe` (id abonnement Stripe / bon), `valide_du`/`valide_jusqu_au`, `metadata` |
| Utilisateur | `habilitations_applications_utilisateurs` | `application_code`, `role_code`, fenêtre de validité |
| Catalogue | `applications_elsatia` (+ futur `billing_model`) | `subscription` / `usage` / `commission` / `free` / `bundled` |

Wiring : un webhook d'abonnement (par app) écrit dans `acces_applications_entreprises` via une
RPC `plateforme_activer_application_entreprise(...)` **déjà existante**. **Ne câbler aucun prix
Market/Chantier/Plans maintenant** — le contrat suffit. Market en `billing_model = commission`
n'affecte pas ce socle (la commission est un flux Market interne + événement `market.sale.settled`).

---

## 21. Sécurité — invariants (transversaux, non négociables)

1. `entreprise_id` **obligatoire** sur tout événement, tout lien, toute entité synchronisée.
2. **Aucune confiance dans le payload client** : `actor_user_id`, `entreprise_id`, droits =
   résolus/validés **serveur** (`auth.uid()`, `est_membre_actif`, `a_acces_application`).
3. Droits contrôlés **à la consommation** : un consommateur applique un événement seulement si
   l'acteur (ou le système) avait le droit de le produire ET l'entreprise cible a l'entitlement.
4. **Aucune cross-tenant** : un événement d'`entreprise A` ne peut jamais muter une donnée
   d'`entreprise B` ; les RLS existantes restent la dernière ligne de défense.
5. **Idempotence** obligatoire producteur + consommateur (§ 6).
6. **Audit** : tout événement, tout lien, toute décision d'accès → trace (`historique_*`,
   `evenement_integration`, observabilité).
7. **Market n'est jamais un contournement du RLS** : Market lit/écrit le stock **via événements**
   traités par l'app source sous ses propres RLS, jamais par accès SQL direct aux tables métier.

---

## 22. Versioning des événements

- `event_type` **+** `event_version` séparés (recommandé) — ex. `stock.updated` v`1`. On peut
  aussi écrire `stock.updated.v1` en `event_type`, mais garder le numéro exploitable.
- **Producteur plus récent que consommateur** : le consommateur ignore les champs inconnus
  (tolérance) et traite les champs qu'il connaît.
- **Champs ajoutés = optionnels** (jamais de champ requis ajouté dans une même version majeure).
- **Dépréciation** : un `event_type`/version déprécié est publié **et** son successeur pendant
  une fenêtre de transition, puis retiré ; jamais de rupture silencieuse.
- Un registre `types_evenements(event_type, version, schema_json, statut ∈ {actif, deprecie,
  retire})` cadre le tout (documentaire).

---

## 23. Observabilité

Par événement : `event_id`, `correlation_id`, `source_app`, `consumer_app`, `event_type` +
version, `duree_ms`, `retry_count`, `statut`, `erreur` (message court, pas de payload complet),
`entreprise_id`. Trace d'audit dédiée + métriques agrégées (débit, taux d'échec par type, taille
de dead-letter). **Aucun payload sensible complet dans les logs** (masquage / champs allowlistés).

---

## 24. Contrat V1 Integration Core — spécification minimale

| Domaine | Responsable | Données | Invariants | Sécurité |
|---|---|---|---|---|
| **Identity** | plateforme | `auth.uid`, `utilisateurs`, `utilisateurs_entreprises`, `entreprise_active_id` | 1 identité → N entreprises | `auth.uid()` serveur, `est_membre_actif` |
| **Application Catalog** | plateforme | `applications_elsatia` (+ `slug`, `category`, `capabilities`, `billing_model` à venir) | `code` stable, immuable | lecture `authenticated`, mutation RPC `plateforme_*` |
| **Entitlements** | plateforme + webhooks par app | `acces_applications_entreprises`, `habilitations_applications_utilisateurs` | fenêtres de validité respectées | RPC `plateforme_activer_application_entreprise` |
| **Events** | app source (outbox) + relais central | enveloppe § 5.1 | `entreprise_id` requis, immuable après écriture | `actor_user_id` validé serveur |
| **Idempotency** | producteur + consommateur | `idempotency_key` unique, `unique(consumer_app,event_id)` | 1 seule application | — |
| **Entity References** | app cible | `source_application/type/id/updated_at` + `liens_inter_applications` | provenance sur toute donnée importée | `entreprise_id` requis |
| **Files** | app source | bucket privé + asset public dérivé explicite | privé ≠ public sans acte délibéré | RLS Storage existantes + préfixe `entreprise_id` |
| **Stock / Reservations** | app source (autorité) | `physique/reservee/disponible/publiee/vendue` | `disponible ≥ 0`, décrément atomique | via événements, jamais SQL direct |
| **Audit Logs** | Integration Core | `historique_*`, `evenement_integration`, observabilité | append-only | lecture bornée |

---

## 25. Limites actuelles, dette, risques, recommandations, roadmap

### 25.1 MUST BEFORE Gestion Pro commercialization

**Rien de structurel.** Le socle d'accès multi-app est générique et déjà en Production-ready.
Options **facultatives** (quelques minutes chacune, non bloquantes) :
- (facultatif) documenter publiquement « une identité ELSATIA, une session par application »
  (déjà couvert par `ELSATIA_SITE_COMMERCIAL_READINESS_V1`) ;
- (facultatif) réserver dans `applications_elsatia` des lignes `market`/`chantier`/`plans` en
  `statut_produit = 'bientot'` — **ou pas** (ajout additif à tout moment).

→ **Ce lot ne crée aucune tâche bloquant la commercialisation de Gestion Pro.**

### 25.2 SAFE POST-LAUNCH (dans l'ordre)
1. Stabilisation Gestion Pro (commercialisation, premiers clients).
2. **Integration Core V1** (§ 5-6, § 8, § 24) : enveloppe d'événements + outbox + idempotence +
   `liens_inter_applications` + colonnes de provenance. Migration **additive**.
3. **Chantier** (offline-first, § 12-13) — le plus gros besoin terrain.
4. **Market** / **Plans** selon priorité commerciale (§ 9-11, § 14).
5. **Scan** (service transversal, § 15).
6. **Safety** / **Connect** / **Stock Core** selon besoins (§ 16-18).

### 25.3 Dette identifiée (toute non structurelle)
- `CODES_APPLICATIONS_ELSATIA` liste typée (classe A) ; `tools_changer_entreprise_active`
  nom app-spécifique (cosmétique) ; `historique_acces_applications.auteur_email` sans
  `acteur_uid` ; attributs de confort absents du catalogue (`slug`, `category`, `capabilities`,
  `billing_model`).
- Aucune provenance cross-app sur les entités métier (à ajouter avec l'Integration Core).
- Deux modèles de stock (GP / Colors) sans vocabulaire commun (mapping à définir, pas à fusionner).

### 25.4 Risques (si l'Integration Core est mal cadré plus tard)
- Market comme bypass RLS → **mitigé par principe** (§ 21.7 : Market via événements uniquement).
- Copies de données sans provenance → **mitigé** par § 8 (provenance obligatoire).
- Fichiers privés exposés par Market → **mitigé** par § 19 (asset dérivé).
- Double vente / réservations concurrentes → **traité** dans le contrat (§ 11, verrou source).
- Divergence de version d'événements → **traité** (§ 22).

### 25.5 Recommandations
1. **Commercialiser Gestion Pro sans attendre** — le socle multi-app ne bloque rien.
2. Adopter ce document comme **contrat de référence** de l'Integration Core ; toute future app
   s'y conforme (identité via `contexte_application_courant`, accès via `a_acces_application`,
   sync via l'enveloppe § 5.1, liaison via § 8).
3. Quand l'Integration Core V1 démarrera : **une seule migration additive** (tables
   `evenement_integration`, `consommation_evenements`, `liens_inter_applications`, `types_evenements`
   + colonnes `source_*` là où utile), zéro modification des modèles métier existants.
4. Ne pas trancher maintenant : pricing/commission/paiement Market, livraison, app stores,
   notation, enchères, B2B/B2C, modèle Chantier, pricing Plans, Connect inclus/vendu (§ 29 du
   cadrage) — aucune de ces décisions n'est requise et aucune n'est bloquée.

---

`ELSATIA-INTEGRATION-CORE-MARKET-READINESS-V1 VALIDÉ — SOCLE MULTI-APP PRÊT POUR LES FUTURES APPLICATIONS — AUCUN DÉVELOPPEMENT MARKET LANCÉ`
