# ELSATIA-UI-V2-R1 — Audit visuel et ergonomique de Gestion Pro

Lot **UI-V2-R1** (audit et cadrage uniquement) — cf. `ELSATIA_UI_V2_REFONTE.md`.
Aucune interface, aucun style, aucun code applicatif modifié. Seul ce document est créé.

Base de code auditée : branche `feat/elsatia-canonical-final-r73-v1`, commit `7772137b4ad3960012e98f00b7b4b6edf7907959`.

---

## 1. Synthèse exécutive

Gestion Pro est **fonctionnellement très riche** (≈ 130 routes, ~34 modules actifs) mais son
interface souffre de **quatre problèmes structurels** qui expliquent la perception de
« brouillon » :

1. **Aucun design system.** Le style est produit *par fichier* : `const input = "…"` redéfini
   dans chaque page, aucun composant `<Button>` / `<Input>` / `<Card>` / `<Alert>` / `<Table>`
   partagé, **185 occurrences de `#0d1b2a`** et **119 de `#c9a24a`** codées en dur dans les
   `.tsx` (plus une douzaine d'autres nuances de bleu/or improvisées) alors que des tokens CSS
   existent (`--elsatia-navy`, `--elsatia-gold`) et ne sont quasiment pas utilisés. Rayons
   (`rounded` / `-md` / `-lg` / `-xl` / `-full`), espacements et tailles de texte sont choisis
   au cas par cas.
2. **Densité et hiérarchie faibles.** Le tableau de bord empile **jusqu'à 9 blocs** ; l'info
   réellement prioritaire (alertes, tâches du jour, chantiers actifs) arrive **en 6ᵉ position**,
   après un rappel de graphiques et une grille de raccourcis qui **duplique le menu**. Les
   pages de liste et de détail alignent des sections `rounded-md border p-4` sans niveau de
   lecture marqué : `h1` = `text-xl`, `h2` = `text-sm` (souvent plus petit que le corps).
3. **Responsive rétro-ajouté.** Le comportement mobile/tablette repose sur **deux blocs
   `<style>` inline dans `(app)/layout.tsx`** truffés de `!important` qui neutralisent
   `[class*="grid-cols-"]`, `[class*="col-span-"]`, forcent `table{min-width:680px}` et
   `flex-wrap` sur tous les `.flex`. Les pages sont écrites *desktop-first* avec des grilles
   fixes ; le mobile est « réparé » globalement. Le mode lecture seule est lui aussi un hack
   CSS (`display:none!important` sur `button[type="button"]`).
4. **Navigation longue et surfaces mélangées.** Menu latéral = **39 entrées / 8 groupes
   accordéon**, sans icônes, sans recherche globale. L'entrée `★ Plateforme` (administration
   ELSATIA) cohabite dans le **même menu** que les modules d'une entreprise cliente. Le
   sélecteur d'applications ELSATIA est logé dans l'en-tête de ce même menu. L'aide a **≥ 3
   points d'entrée** concurrents (lien « Guide d'utilisation » PDF, bouton flottant `AideButton`,
   `AssistantIA`, route `/aide`).

Le socle est sain : rendu **majoritairement serveur** (3 seuls `"use client"` dans tout le
sous-arbre `(app)/`), permissions/features indépendantes et centralisées
(`feature-catalogue.ts`, `permissions.ts`), un moteur d'alertes déjà pertinent. La refonte est
**un travail de système et de hiérarchie**, pas une réécriture fonctionnelle.

---

## 2. Méthodologie et limites

**Méthode** : analyse **statique** du code (Next.js App Router, `src/app`, `src/components`,
`src/lib`), lecture d'un échantillon d'écrans représentatifs de chaque archétype
(tableau de bord, liste, détail, formulaire, paramètres, espace personnel, authentification,
plateforme), et comptages automatiques (occurrences de couleurs, `dark:`, `use client`,
routes).

**Limites — à lever par une vérification authentifiée de Julien (§ 14) :**

- **Aucune session navigateur authentifiée** n'a été exécutée. `/dashboard` et les pages
  métier exigent une entreprise et des permissions ; l'apparence *rendue* (densité réelle,
  contrastes, débordements) n'a pas été observée. Les constats visuels sont **déduits du
  balisage**, pas d'un rendu.
- **Échantillon** : ~15 écrans lus en détail sur ~130. Les archétypes sont couverts, mais des
  écrans individuels peuvent présenter des cas particuliers non vus.
- Pas d'audit d'accessibilité outillé (axe, Lighthouse) ni de test lecteur d'écran.
- Le mode sombre est présent dans le code mais son rendu d'ensemble n'a pas été validé
  (incident de contraste `/login` `/signup` déjà corrigé en lot P10B — signe que le sujet
  n'est pas maîtrisé globalement).
- Les métriques de performance de navigation (chaque page = 2–4 s de rendu serveur, d'où le
  wrapper `Lien` sans préchargement) sont **documentées dans le code**, non mesurées ici.

---

## 3. Inventaire des routes

Légende **état** : `complète` / `partielle` / `provisoire` / `BETA` (dans le code, masquée du
produit) / `DISABLED` (hors périmètre commercial). Légende **priorité de refonte** :
`P0` (parcours quotidien, très visible), `P1` (fréquent), `P2` (occasionnel/admin),
`P3` (BETA/DISABLED — à ne pas maquetter en R3).

### 3.1 Coquille applicative et pages transverses

| Chemin | Rôle | Rôles autorisés | État | Composants | Problèmes constatés | Prio |
|---|---|---|---|---|---|---|
| `src/app/(app)/layout.tsx` | Shell : sidebar + bannières + boundary + IA/aide flottantes | tout utilisateur authentifié | complète | `Sidebar`, `ModuleAccessBoundary`, `AbonnementBanner`, `SupportAccessBanner`, `MobileBack`, `AideButton`, `AssistantIA` | 2 blocs `<style>` inline `!important` pour le responsive et le mode lecture seule ; 3+ surfaces d'aide ; bannières empilées en haut du contenu | **P0** |
| `/` | Redirection (`/plateforme` si admin plateforme, sinon `/dashboard`) | tous | complète | — | — | P2 |
| `/dashboard` | Tableau de bord entreprise | tout membre (contenu filtré par permission) | complète | `BriefingMatin`, `DashboardWidget(s)`, `DashboardAnalytics`, `MobileModuleGrid`, `CentreAlertesOperationnelles`, `PointageArriveeDepart` | densité (9 blocs), ordre de lecture, redondance grille/menu — voir § 6 | **P0** |
| `/mon-espace` | Fiche perso, carte BTP, prochaines affectations | tout membre | complète | formulaires inline, `Image` | encart « créer ma fiche » cadré `#c9a24a` en dur ; `max-w-4xl` (≠ autres pages) | **P0** |
| `/mon-espace/securite` | MFA / AAL2 (enrôlement, facteurs) | tout membre | complète | formulaires MFA | **sensible** (§ 6) — vérifier lisibilité des étapes | P1 |
| `/aide` | Guide d'utilisation (FAQ + PDF) | tous | complète | `FaqAide` | 3ᵉ point d'entrée d'aide | P2 |
| `/abonnement` | Offre, paliers, lien Stripe | `acces_parametres` | complète | `AbonnementCountdown` | — | P1 |
| `/abonnement/module-non-inclus` | Écran « votre offre n'inclut pas ce module » | tous | provisoire | — | état d'empêchement à unifier | P2 |
| `/parametres` | Identité entreprise, logo, identifiants salariés + hub de sous-pages | `acces_parametres` | complète | `DocumentTemplatePreview`, `DashboardWidgetPreferences` | 6 liens de sous-pages en `<Link>` bordés alignés à droite du titre ; `grid-cols-2` fixes ; `max-w-3xl` | **P1** |
| `/parametres/acces` · `/parametres/acces/apercu/[id]` | Rôles, postes, permissions, aperçu d'un poste | `gerer_utilisateurs` | complète | `ApercuPoste` | matrice de permissions dense (**sensible** § 6) | **P1** |
| `/parametres/import` | Assistant d'import CSV | `gerer_utilisateurs` | complète | `ImportWizard` | wizard multi-étapes à cadrer | P2 |
| `/parametres/donnees` | Export RGPD, suppression de compte | `acces_parametres` | complète | — | actions destructrices — confirmations à standardiser | P2 |
| `/parametres/notes-frais` · `/parametres/notifications` · `/parametres/relances` · `/parametres/version` | Réglages ciblés | `acces_parametres` (relances : `gerer_relances`) | complète | `ParametresRelances`, `PushNotificationsSettings` | pages de réglage hétérogènes | P2 |
| `/onboarding` · `/onboarding/besoins` · `/onboarding/demarrage` | Rejoindre / créer une entreprise, questionnaire de besoins | utilisateur sans entreprise | complète | formulaires | hors shell `(app)` — style propre `max-w-md` | P1 |
| `/acces-refuse` · `/en-attente` · `/abonnement-suspendu` · `/offline` | Écrans d'état (identité plateforme non active, attente, suspension, hors-ligne) | selon contexte | complète (7–43 lignes) | — | 4 écrans d'état au style divergent → à unifier en un composant | P2 |

### 3.2 Clients & ventes

| Chemin | Rôle | Autorisations | État | Problèmes | Prio |
|---|---|---|---|---|---|
| `/clients` `/clients/[id]` `/clients/[id]/modifier` `/clients/nouveau` | Fichier clients (liste paginée RPC, fiche, formulaire) | `acces_clients` | complète | `const input` local ; `max-w-5xl` ; filtres = form GET maison ; tableau non responsive natif | **P0** |
| `/devis` `/devis/[id]` `/devis/[id]/modifier` `/devis/[id]/creer-chantier` `/devis/nouveau` | Devis : liste, éditeur, conversion en chantier | `acces_devis` | complète | `DevisEditor` (lourd) ; `StatutDevisSelect` bespoke ; couleurs de statut en `style={{color:…}}` inline | **P0** |
| `/prestations` `/prestations/nouveau` `/prestations/[id]/modifier` | Catalogue de prestations | `acces_devis` | complète | `PrestationForm` | P1 |
| `/factures` `/factures/[id]` `/factures/[id]/modifier` | Facturation | `acces_factures` | complète | `FactureEditor` ; `StatutFactureSelect` ; KPI `font-mono` | **P0** |
| `/facturation-avancee` | Situations de travaux & DGD | `acces_facturation_avancee` | **BETA** (`advanced_invoicing`) | — | P3 |
| `/crm` | CRM & relances | `acces_crm` | **BETA** (`crm`) | — | P3 |
| `/appels-offres` | Appels d'offres | `acces_appels_offres` | **DISABLED** (`tenders`) | — | P3 |

### 3.3 Chantiers & interventions

| Chemin | Rôle | Autorisations | État | Problèmes | Prio |
|---|---|---|---|---|---|
| `/chantiers` `/chantiers/nouveau` `/chantiers/[id]` | Liste, création, **fiche chantier** (tâches, équipe, devis liés, dépenses, avancement) | `acces_chantiers` ou `voir_chantiers_assignes` | complète | fiche = ~240 lignes, **10+ sous-sections** empilées ; `StatutChantierSelect`, `TacheItem`, `ChantierProgressCharts`, `SearchableSelect`, `IdentificationCodeCard` | **P0** |
| `/chantiers/[id]/comptes-rendus` `/documents` `/doe` `/emails` `/localisation` | Sous-écrans de la fiche chantier | idem + droits ciblés | complète | `PhotosCompteRendu`, `DicteeCompteRendu`, `SuiviZoneChantier`, `LocaliserGPSButton` | navigation intra-chantier à clarifier (onglets ?) | **P1** |
| `/mes-travaux` | Vue chantier sans prix (ouvriers) | `voir_devis_chantier_sans_prix` | complète | — | parcours terrain — **P0** (mobile) |
| `/interventions` | Interventions/SAV | `acces_interventions` | **BETA** (`interventions`) | — | P3 |
| `/ouvrages` | Ouvrages & métrés | `acces_ouvrages` | **BETA** (`works`) | — | P3 |
| `/sous-traitants` `/sous-traitants/[id]` | Sous-traitance | `acces_sous_traitants` | **BETA** (`subcontractors`) | — | P3 |

### 3.4 Équipe & temps

| Chemin | Rôle | Autorisations | État | Problèmes | Prio |
|---|---|---|---|---|---|
| `/planning` | Planning des affectations | `acces_planning` | complète | `PlanningAffectationForm` ; vue calendaire dense sur mobile | **P0** |
| `/pointage` `/pointage/gestion` | Pointage heures (saisie + gestion) | `acces_pointage` | complète | `PointageChrono`, `PointageArriveeDepart`, `ForgottenPointageForm` | parcours terrain **P0** (mobile) |
| `/employes` `/employes/[id]` `/employes/[id]/carte` `/employes/[id]/modifier` `/employes/nouveau` | Fiches salariés, carte BTP | `acces_employes` | complète | `EmployeForm`, `SignatureEmploye` (`<img>` warning lint), `InvitationEmploye` | **P1** |
| `/conges` | Demandes et validation de congés | `demander_ses_conges` | complète | — | **P1** |
| `/notes-frais` `/notes-frais/[id]` `/notes-frais/exports` | Notes de frais + exports | `saisir_ses_notes_frais` | complète | `ExpenseAmountFields`, `ExpenseDocumentUploader` | **P1** (mobile — justificatifs photo) |
| `/grands-deplacements` | Grands déplacements | `saisir_ses_notes_frais` / `gerer_notes_frais` | **BETA** (`travel`) | — | P3 |
| `/paie` `/paie/[id]` `/paie/[id]/[dossierId]` `/paie/parametres` `/paie/profils/[employeId]` `/banque-paie` | Préparation de la paie | droits paie multiples | **BETA** (`payroll`) | — | P3 |

### 3.5 Achats & stock

| Chemin | Rôle | Autorisations | État | Problèmes | Prio |
|---|---|---|---|---|---|
| `/fournisseurs` `/fournisseurs/[id]` | Fournisseurs | `acces_achats` | complète | — | P1 |
| `/commandes` `/commandes/[id]` `/commandes/nouveau` | Commandes fournisseurs | `acces_achats` | complète | `CommandeEditor`, `StatutCommandeSelect`, `ReceptionCommandeForm`, `ReceptionScanner` | P1 |
| `/depenses` `/depenses/[id]` | Factures fournisseurs | `acces_achats` | complète | `DepenseFournisseurForm` | P1 |
| `/charges` | Charges récurrentes | `acces_achats` | complète | `ChargeRecurrenteForm` | P2 |
| `/stock` `/stock/[id]` `/stock/reception` | Articles & stock | `acces_stock` | complète | `StockMovementForm` **+ `StockMovementForm 2.tsx` (doublon de fichier)** | **P1** |
| `/stock/borne` | Borne stock (compte dépôt) | `utiliser_borne_stock` | complète | `StockKioskForm` | **P0** (mobile plein écran, compte dépôt = menu réduit à 3 entrées) |
| `/inventaires` `/inventaires/[id]` | Inventaires | `acces_stock` | complète | `InventaireCreationForm` | P2 |
| `/depot` | Dépôt | `acces_stock` | complète | — | P2 |
| `/boutique` `/boutique/[produitId]` `/boutique/panier` `/boutique/commande/[id]` | Boutique ELSATIA | `acces_boutique` | **DISABLED** (`store`) | `<img>` lint warnings | P3 |

### 3.6 Matériel

| Chemin | Rôle | Autorisations | État | Problèmes | Prio |
|---|---|---|---|---|---|
| `/flotte` `/flotte/[id]` `/flotte/nouveau` | Flotte automobile (échéances CT, assurance, entretien) | `acces_flotte` | complète | `VehicleSmartFields` | P1 |
| `/outillage` `/outillage/[id]` `/outillage/nouveau` | Outillage (vérifications périodiques) | `acces_outillage` | complète | `ToolSmartFields` | P1 |

### 3.7 Pilotage

| Chemin | Rôle | Autorisations | État | Problèmes | Prio |
|---|---|---|---|---|---|
| `/rentabilite` | Rentabilité par chantier | `acces_rentabilite` | complète | `AnalyseRentabiliteIA` (si IA active) | **P1** |
| `/tresorerie` | Trésorerie | `acces_rentabilite` | complète | graphiques | P1 |
| `/exports` | Exports comptables | `acces_exports` | complète | — | P2 |
| `/paiements-bancaires` | Banque & paie (Powens) | `acces_paiements_bancaires` | **DISABLED** (`banking`) | — | P3 |

### 3.8 Administration entreprise

| Chemin | Rôle | Autorisations | État | Problèmes | Prio |
|---|---|---|---|---|---|
| `/connecteurs` | Connecteurs externes | `acces_connecteurs` | **DISABLED** (`connectors`) | — | P3 |
| `/messagerie` | Messagerie interne | `acces_messagerie` | complète | `ZoneReponseMessagerie` ; pièces jointes | **P1** |

### 3.9 Plateforme ELSATIA (hors entreprise cliente)

| Chemin | Rôle | Autorisations | État | Problèmes | Prio |
|---|---|---|---|---|---|
| `/plateforme` | Console propriétaire : entreprises, abonnements, équipe plateforme, remises | admin plateforme actif (`est_plateforme_admin`) | complète | ~335 lignes, `const input` local, très dense (8 cartes stats + formulaires empilés) | **P1** |
| `/plateforme/applications` · `/entreprises/[entrepriseId]/applications` | Accès multi-applications par entreprise | admin plateforme | complète | — | P2 |
| `/plateforme/facturation` · `/tarification` · `/roles-demo` · `/support` · `/boutique` | Relevés, grilles tarifaires, rôles démo, support, boutique | admin plateforme (permissions ciblées) | complète | 5 pages hétérogènes | P2 |

### 3.10 Authentification, MFA, récupération (hors shell)

| Chemin | Rôle | État | Problèmes | Prio |
|---|---|---|---|---|
| `/login` | Connexion | complète | `max-w-sm`, `BrandWordmark` en `#0d1b2a` dur ; contraste sombre déjà corrigé une fois | **P1** |
| `/login/mfa` | Second facteur (AAL2) | complète | **sensible** § 6 | **P1** |
| `/signup` `/mot-de-passe-oublie` `/nouveau-mot-de-passe` | Inscription, récupération | complète | `ChampMotDePasse` ; styles propres divergents du shell | **P1** |
| `/auth/confirm` `/auth/callback` (route) | Confirmation / PKCE | complète | **route citée dans les e-mails — invariant § 6** | P2 |

### 3.11 Impression / partage externe (layout dédié `imprimer/`)

| Chemin | Rôle | État | Prio |
|---|---|---|---|
| `/imprimer/{devis,factures,commandes,doe,paie}/[id]` | Rendu PDF serveur (Chromium navigue la vraie page) | complète | P2 (ne pas casser le rendu PDF) |
| `/document/[token]` `/imprimer/partage/[token]` | Accès client externe sans compte (jeton) | complète | **routes citées dans les e-mails — invariant § 6** ; **P1** (image de marque côté client) |

### 3.12 Sélecteur d'applications ELSATIA

| Élément | Emplacement | État | Problèmes | Prio |
|---|---|---|---|---|
| `ApplicationSwitcherGestionPro` | En-tête du menu latéral (`Sidebar`) | complète | logé sous l'encart « Entreprise active », peu visible ; n'affiche que les apps autorisées (`listerApplicationsPourSwitcher`) ; clavier géré manuellement | **P0** (point explicite du cadrage) |

### 3.13 Assistant IA et aide

| Élément | État | Problèmes | Prio |
|---|---|---|---|
| `AssistantIA.tsx` (607 lignes, flottant) | active si `FEATURE_AI_ENABLED=true` et droit IA | énorme composant client ; bouton flottant | P1 |
| `AideButton.tsx` (flottant) + lien « Guide d'utilisation » (sidebar) + `/aide` | complète | **3 points d'entrée d'aide** non unifiés | **P1** |

---

## 4. Matrice des rôles et écrans sensibles

Les accès sont portés par **deux contrôles indépendants** — permissions (`src/lib/permissions.ts`,
clés `acces_*` / verbes métier) et *features* commerciales (`src/lib/feature-catalogue.ts`,
overrides `entreprise_feature_flags`). Le menu et le tableau de bord filtrent sur les **deux**.

| Profil type | Voit | Écrans clés | Ne doit jamais voir |
|---|---|---|---|
| **Ouvrier / terrain** | `/mon-espace`, `/mes-travaux`, `/pointage`, `/planning`, `/conges`, `/notes-frais`, `/messagerie`, `/stock/borne` | parcours mobile | montants (`voir_indicateurs_financiers`), administration, plateforme |
| **Chef de chantier / conducteur** | + `/chantiers` (globaux ou assignés), `/employes`, achats/stock selon droits | fiche chantier | paramètres entreprise, plateforme |
| **Administration / gérant entreprise** | tous les modules actifs de l'offre + `/parametres`, `/parametres/acces`, `/abonnement` | matrice de permissions, abonnement | **plateforme ELSATIA** |
| **Compte dépôt** | uniquement `/stock`, `/stock/borne`, `/depot` (menu réduit par `Sidebar`) | borne | tout le reste |
| **Admin plateforme ELSATIA** | `/plateforme/*` + (s'il a une entreprise) ses modules ; sinon **menu principal vide**, seul le bloc plateforme | console plateforme | — |
| **Support plateforme (session active)** | l'entreprise ciblée, bannière `SupportAccessBanner` | — | autres entreprises |
| **Client externe (jeton)** | `/document/[token]`, `/imprimer/partage/[token]` uniquement | document partagé | tout compte |

**Écrans à ne pas dégrader (interaction rôle × UI) :**

- `/parametres/acces` — matrice postes × permissions ; toute refonte de tableau/formulaire doit
  préserver l'exhaustivité et l'exactitude des cases.
- `Sidebar` — le filtrage `navigationAutorisee` + `featureForPath` + `compteDepot` +
  `navigationPourContexte` (admin plateforme sans entreprise → menu vide) ne doit pas régresser.
- `(app)/layout.tsx` — redirection admin-plateforme-sans-entreprise via en-tête `x-pathname`
  (`cheminAutoriseAdminPlateformeSansEntreprise`) ; **fail-open** volontaire.
- `/dashboard` — chaque bloc est gardé par une permission (`voir_indicateurs_financiers` pour
  tous les montants, `saisir_son_pointage`, etc.). Une maquette ne doit pas « aplatir » ces
  gardes.
- `/plateforme` — jamais visible pour une entreprise cliente ; le lien `★ Plateforme` du menu
  est conditionné à `plateformeAdmin && !compteDepot`.

---

## 5. Audit de navigation

**Constat mesuré** : `NAVIGATION_APPLICATION` = **39 entrées**, `NAVIGATION_GROUPES` = **8
groupes** (`Accueil`, `Clients & ventes`, `Chantiers & interventions`, `Équipe & temps`,
`Achats & stock`, `Matériel`, `Pilotage`, `Administration`). Rendu en `<details>/<summary>`
(accordéons), groupe `principal` + groupe actif ouverts par défaut.

| Critère | Constat | Sévérité |
|---|---|---|
| Longueur du menu | 39 entrées ; même après filtrage par droits, un gérant en voit 25–35 | **P0** |
| Regroupements | 8 groupes cohérents mais BETA/DISABLED (`crm`, `sous-traitants`, `interventions`, `ouvrages`, `appels-offres`, `paiements-bancaires`, `connecteurs`…) sont dans la liste et filtrés au runtime — bruit potentiel selon overrides | P1 |
| Niveaux imbriqués | 2 niveaux (groupe → item). La fiche chantier a des sous-écrans (`/chantiers/[id]/doe`…) **sans** représentation dans le menu → navigation intra-module implicite | **P1** |
| Repérage page active | `pathname === href || startsWith(href+"/")` ; item actif = fond or `#c9a24a` + texte navy. Fonctionne mais l'or est aussi la couleur « accent marque » ailleurs → collision sémantique avec la future règle « bleu = action » | **P1** |
| Cohérence des libellés | Mélange : `Devis`, `Factures` (objet) vs `Situations & DGD`, `CRM & relances`, `Banque & paie` (composés) ; `Pointage heures`, `Préparation de la paie` (verbeux) | P2 |
| Recherche | **Aucune recherche globale.** Chaque liste a son `?q=` (form GET maison). Pas de palette de commandes ni de champ de recherche dans l'en-tête | **P0** |
| Sélecteur d'entreprise | Encart « Entreprise active » **en lecture seule** dans l'en-tête du menu ; le changement d'entreprise réel n'existe que pour les admins plateforme (session support `plateforme_entrer_entreprise`). Pas de multi-entreprise self-service | P1 (à clarifier avec Julien : besoin réel ?) |
| Sélecteur d'applications | `ApplicationSwitcherGestionPro` sous l'encart entreprise, peu visible ; à remonter et rendre explicite (point du cadrage) | **P0** |
| Accès plateforme (admin ELSATIA) | Lien `★ Plateforme` **dans le même menu** que les modules d'entreprise, séparé par un simple filet. Risque de confusion « entreprise cliente ↔ plateforme ELSATIA » explicitement identifié dans le cadrage | **P0** |
| Bureau / tablette | Menu `md:w-60` fixe à gauche ; pas d'état replié/large ; tablette portrait = menu fixe qui mange la largeur | **P1** |
| Mobile | En-tête fixe `h-16` + drawer `w-[min(19rem,86vw)]` slide-in + overlay ; bouton `☰ Menu` ; `MobileBack` flottant en plus | P1 (fonctionne ; à intégrer proprement) |
| Éléments inutiles selon le rôle | Bien filtrés côté menu. Mais le tableau de bord ré-affiche une **grille de 26 raccourcis** = doublon du menu | **P1** |
| Retours arrière | `MobileBack` (mobile) + `Link` « ‹ Retour » ad hoc dans certaines pages ; pas de fil d'Ariane ; incohérent | **P1** |
| Confusion entreprise ↔ plateforme | Voir ci-dessus + bannière `SupportAccessBanner` quand un support ELSATIA est « entré » dans l'entreprise | **P0** |

**Aucune règle d'autorisation ne doit être modifiée** — la refonte de navigation réorganise
l'affichage, pas les fonctions `navigationAutorisee` / `featureForPath` / `permissionsUtilisateur`.

---

## 6. Audit du tableau de bord

`/dashboard` assemble, dans cet ordre vertical (`<main className="p-8"><div className="mx-auto max-w-6xl space-y-6">`) :

1. `BriefingMatin` (ou simple salutation) — synthèse texte « présents/absents, retards, à encaisser, impayés, stock, flotte »
2. `DashboardWidgetFirstConnection` — sélecteur des blocs à afficher (première connexion)
3. **Notifications** — `rounded-xl border-blue-200 bg-blue-50`, grille 2 colonnes
4. **Raccourcis modules** (`MobileModuleGrid`) — jusqu'à **26 liens** = doublon du menu
5. **Graphiques et analyses** (`DashboardAnalytics`) — répartition chantiers, 6 mois devis/factures, jauge encaissé
6. **Indicateurs financiers** — 4 cartes KPI (`font-mono text-xl`)
7. **Devis à suivre** + **Chantiers actifs** — 2 colonnes, 5–6 lignes chacune
8. **Alertes opérationnelles** (`CentreAlertesOperationnelles`) — moteur d'échéances (factures, devis, relances en échec, stock bas, CT/assurance/entretien véhicule, vérif outil, livraison commande) + masquage + délégation
9. **Pointage rapide** (si concerné) + **Prochaines affectations** (planning)

### Ce qui est réellement prioritaire (à remonter)

| Contenu | Où aujourd'hui | Où le mettre |
|---|---|---|
| **Alertes critiques** (impayés, CT dépassé, entretien km, échec de relance) | bloc 8/9 | **haut de page, immédiatement** |
| **Tâches / échéances du jour** (livraisons J+3, devis expirant J+7, factures J+7) | fondu dans le bloc 8 | **2ᵉ position**, séparé des alertes « surveillance » |
| **Chantiers actifs** | bloc 7 | zone principale, format compact |
| **Chiffres essentiels** (facturé / encaissé / reste à encaisser / devis acceptés) | bloc 6 | **bandeau de 3–4 chiffres** en tête, pas 4 cartes pleine largeur |
| **Actions fréquentes** (nouveau devis, pointer, saisir une note de frais) | dispersées | **2–3 boutons** contextualisés au rôle, pas une grille de 26 |
| Pointage rapide | bloc 9 | encart dédié en haut pour les profils terrain |

### À déplacer en vue secondaire

- **Graphiques** (`DashboardAnalytics`) → onglet/section « Analyses » ou page `/rentabilite` ;
  pas en 5ᵉ position avant les chantiers.
- **Grille de 26 raccourcis** → supprimée (doublon du menu) ou réduite à 3–4 raccourcis
  personnalisables.
- **Notifications** → cloche dans l'en-tête + centre dédié, pas un bloc pleine largeur.
- **Alertes « surveillance »** (assurance à J-30, vérif outil à J-30) → repliées sous les
  alertes critiques.

### Problèmes de densité et d'ordre de lecture

- 9 blocs `space-y-6` empilés, chacun avec son propre style de carte (`rounded-xl` bleu,
  `rounded-md` neutre, cartes KPI) → pas de rythme visuel.
- L'info « rassurante » (briefing, graphiques) précède l'info « actionnable » (alertes).
- `max-w-6xl` mais contenu mono-colonne → grandes zones vides sur écran large, tout empilé
  sur mobile via le hack `[class*="grid-cols-"]{grid-template-columns:1fr}`.

### Hiérarchie fonctionnelle proposée (sans maquette finale)

```
┌ En-tête : salutation courte + 3 chiffres clés (facturé / encaissé / reste)          [tous rôles avec finances]
├ Bandeau ALERTES CRITIQUES (0..n, rouge) — impayés, sécurité véhicule, échecs         [gardé par permission]
├ AUJOURD'HUI — échéances J0..J+7 + tâches + (profil terrain) pointage/affectations
├ EN COURS — chantiers actifs (compact) | devis à suivre
└ Accès rapides : 2–3 actions selon le rôle  ·  lien « Analyses » (graphiques déplacés)
```

---

## 7. Audit des composants et styles

### 7.1 Inventaire et état

| Famille | Réalité actuelle | Problème | À mutualiser |
|---|---|---|---|
| **Boutons** | ~10 patrons inline distincts : `rounded-md border px-3 py-2 text-sm font-medium hover:bg-neutral-50` (secondaire), `rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white` (primaire navy), `bg-blue-800` / `bg-blue-700` (primaire bleu — **incohérent**), `rounded border border-red-200 px-2 py-1 text-xs text-red-700` (danger léger), `ConfirmSubmitButton`, `RemiseConfirmButton`, `CreerChantierConfirmButton` (confirmations bespoke) | pas de `<Button variant>` ; couleur « primaire » ambiguë (navy vs blue-700/800) | **`<Button>`** : primary / secondary / danger / ghost + `pending` |
| **Champs** | `const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:…"` **redéfini dans ≥ 6 fichiers**, avec variantes (`px-2 py-1.5`) | pas de composant ; états focus/erreur/disabled non standardisés | **`<Input> <Select> <Textarea> <Field label error>`** |
| **Sélecteurs de statut** | `StatutChantierSelect`, `StatutCommandeSelect`, `StatutDevisSelect`, `StatutEmployeSelect`, `StatutFactureSelect` — **5 composants quasi identiques** | duplication | **1 `<StatutSelect domaine>`** + registre de statuts |
| **Couleurs de statut** | `statutDevis()/statutChantier()/statutFacture()/statutNoteFrais()/statutCommande()/roleChantier()` renvoient `{libelle, couleur:"#…"}` → `style={{color/background: st.couleur}}` | couleurs en dur, pas de classes, contraste non garanti, illisibles en sombre | **tokens de statut** (`--status-*`) + `<StatutBadge>` |
| **Cartes / panneaux** | Dominant : `rounded-md border border-neutral-200 p-4 dark:border-neutral-800`. Variantes dashboard : `rounded-xl border-blue-200 bg-blue-50` | rayons et fonds mélangés | **`<Card>`** (+ `tone` neutre/info/alerte) |
| **Badges** | inline `rounded-full px-2 py-0.5 text-xs` / `rounded bg-neutral-100 px-2 py-0.5` | non standard | **`<Badge>`** |
| **Alertes / bannières** | inline partout : `rounded-md bg-red-50 px-3 py-2 text-sm text-red-700` (erreur), `bg-green-50 text-green-700` (succès), `bg-amber-50 text-amber-900`, `bg-blue-50 border-blue-200` ; + `AbonnementBanner`, `SupportAccessBanner`, `AlerteDepassementAppareils`, `SupportAccessBanner` | ~4 patrons répétés à la main dans chaque page | **`<Alert variant>`** + zone de bannières unifiée dans le shell |
| **Modales** | via `.fixed[role="dialog"]` (ciblé par le CSS mobile du layout) ; pas de composant `<Dialog>` générique repéré | comportement scroll/max-height géré par le hack CSS du layout | **`<Dialog>`** (focus trap, `max-h`, esc) |
| **Menus / barre latérale / en-têtes** | `Sidebar` (1 fichier, hex en dur) ; en-tête mobile dans `Sidebar` ; pas d'en-tête de contenu standard (chaque page fait son `<div className="flex items-center justify-between"><h1>…`) | pas de `<PageHeader title actions>` | **`<AppShell> <PageHeader> <SideNav>`** |
| **Onglets** | pas de composant ; la fiche chantier et `/parametres` simulent des onglets avec des `<Link>` bordés | incohérent | **`<Tabs>`** |
| **Filtres / recherche** | form GET manuel par page (`parametresPage(p)` reconstruit l'URL à la main) ; `SearchableSelect` pour les combos | pas de barre de filtres réutilisable ; pagination réécrite par page | **`<FilterBar>` + `<Pagination>`** |
| **Tableaux** | `<table>` bruts ; responsive forcé par `main table{min-width:680px}` + wrapper `overflow-x` injecté par le layout | pas de `<Table>` ; illisibles sur petit écran (scroll horizontal) | **`<Table>` + carte-liste mobile** |
| **États vides** | `rounded-md border border-dashed p-6 text-center` répété ; textes hétérogènes | non standard | **`<EmptyState>`** |
| **Chargements** | pas de skeleton repéré ; rendu serveur bloquant (2–4 s/page) | perception de lenteur ; `Lien` désactive le prefetch | **`loading.tsx` / squelettes** par archétype |
| **Erreurs** | `error=` en query string → `<p className="bg-red-50…">` ; `traduireErreurAuth` pour l'auth | pattern répété | **`<Alert>` + `error.tsx`** |
| **Confirmations** | `ConfirmSubmitButton` (message + submit) ; ailleurs `confirm()` implicite ou rien | 3 composants « confirm » distincts | **1 `<ConfirmButton>`** paramétrable |
| **Graphiques** | `DashboardAnalytics`, `ChantierProgressCharts`, `AnalyseRentabiliteIA` ; couleurs de statut inline | pas de palette de dataviz cohérente ni de tokens | **palette dataviz** + wrappers |
| **Responsive** | 2 blocs `<style>` `!important` dans `(app)/layout.tsx` | anti-pattern : la responsivité vit hors des composants | **grilles responsives natives dans les composants**, retrait progressif du hack |
| **Icônes** | jeu SVG inline **uniquement dans `MobileModuleGrid`** (~26 icônes) ; sidebar et le reste = texte / `☰` / `×` / `‹` / `★` | pas de bibliothèque d'icônes, pas dans la nav | **set d'icônes unique** (nav + modules + actions) |

### 7.2 Incohérences transverses (mesurées)

- **185× `#0d1b2a`**, **119× `#c9a24a`** en dur dans les `.tsx`, + `#9a7625` (13), `#8a6a1f` (9),
  `#e5c978` (4), `#243447` (4), `#cfa846`, `#a78028`, `#8a681f`, `#2563eb`, `#3f7d58`, `#3d7a79`…
  → **aucune source de vérité** pour le bleu et l'or de marque ; les tokens
  `--elsatia-navy` / `--elsatia-gold` de `globals.css` sont quasi inutilisés.
- **Aucune couleur « bleu ELSATIA d'action »** n'existe : le navy `#0d1b2a` sert de fond de
  bouton primaire *et* de couleur de menu *et* de texte de titre ; l'or `#c9a24a` sert
  d'accent, de survol de menu actif *et* de bordure d'encart. La direction « bleu = action,
  vert/orange/rouge = statuts » impose un **nouveau token d'action distinct**.
- **Typographie** : `font-family: Arial, Helvetica, sans-serif` (pas de police système moderne
  ni de webfont) ; échelle réduite à `text-xl` (h1) et `text-sm font-semibold` (h2, souvent
  < corps). Pas de tokens de taille/poids/interlignage.
- **Rayons** : `rounded`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-full` employés
  sans règle.
- **Largeur de contenu** : `max-w-3xl` (parametres, onboarding), `max-w-4xl` (mon-espace),
  `max-w-5xl` (clients), `max-w-6xl` (dashboard, plateforme) → largeurs de lecture
  incohérentes d'un écran à l'autre.
- **Padding de page** : `p-8` fixe presque partout (parfois `p-4 sm:p-8`) → trop serré sur
  mobile sans le hack, trop d'un seul tenant sur grand écran.
- **Mode sombre** : `dark:` présent dans **58/82 composants** seulement ; la couche de tokens
  ne bascule que `--background`/`--foreground`. Rendu d'ensemble non fiable.
- **Doublon de fichier** : `src/components/StockMovementForm 2.tsx` (littéralement « 2 » dans
  le nom) coexiste avec `StockMovementForm.tsx` — **quick win** (§ 10).
- **Clés de stockage local héritées** : `liria-dashboard-masques`, `liria-*` — migrations de
  compatibilité, à documenter mais pas à casser.

### 7.3 Composants nécessitant une validation particulière avant mutualisation

- **`AssistantIA`** (607 lignes, client, flottant) — comportement, ancrage, coût de bundle.
- **`DevisEditor` / `FactureEditor` / `CommandeEditor`** — éditeurs métier lourds ; la refonte
  visuelle ne doit pas toucher la logique de calcul/lignes.
- **`CentreAlertesOperationnelles`** — masquage + délégation d'alertes (RPC de revalidation) ;
  UI seulement, jamais la garde serveur.
- **`Sidebar`** — filtrage multi-critères des entrées ; toute refonte doit rejouer
  `navigationAutorisee` + `featureForPath` + `compteDepot` + `navigationPourContexte`.
- **`ApplicationSwitcherGestionPro`** — gestion clavier manuelle ; remonter sans casser l'a11y.
- **`ModuleAccessBoundary`** — barrière d'accès module ; encadre `children` du shell.
- **`SignatureEmploye` / `SignatureDocumentMetier`** — canvas de signature ; `<img>` (lint).
- **`DocumentImprimable` / pages `/imprimer/*`** — servent au rendu PDF (Chromium) : le CSS
  d'impression ne doit pas être cassé.

---

## 8. Audit responsive / accessibilité (statique)

| Sujet | Constat (code) | Sévérité |
|---|---|---|
| **Bureau** | Grilles fixes `grid-cols-2/3/4`, `max-w-*` variable, `p-8` ; large écran = contenu mono-colonne centré, zones vides | P1 |
| **Tablette** | Pas de point de rupture dédié entre `md` (768) et mobile ; menu `md:w-60` fixe | P1 |
| **Mobile** | **Entièrement porté par le `<style>` `!important` du layout** : force 1 colonne, `flex-wrap`, `table{min-width:680px}` + `overflow-x`, `min-height:42px` sur boutons/liens, `h1` réduit. Fonctionne mais fragile : tout nouvel écran hérite du hack au lieu d'être responsive par conception | **P0** (dette) |
| **Navigation clavier** | Menu = `<details>/<summary>` (natif OK) ; `ApplicationSwitcherGestionPro` gère flèches/Escape à la main ; pas de `skip to content` repéré | P1 |
| **Focus visible** | Aucune règle `:focus-visible` globale dans `globals.css` ; dépend des styles par défaut du navigateur / de Tailwind | **P1** |
| **Contraste** | Textes secondaires `text-neutral-500` sur `bg-white` ≈ limite AA ; `text-white/40`, `text-white/45`, `text-[9px]` dans la sidebar sur fond navy = **sous le seuil** ; incident `/login`/`/signup` déjà corrigé une fois → sujet non maîtrisé | **P0** |
| **Zones tactiles** | `min-height:42px` forcé en mobile sur `button` et `a.rounded-md` — mais uniquement < 768 px et uniquement ces sélecteurs ; boutons `px-2 py-1 text-xs` (danger léger) restent petits | P1 |
| **Structure des titres** | `h1` (`text-xl`) puis `h2` (`text-sm`) — hiérarchie de tailles **inversée** par rapport au corps ; pas toujours de `h1` unique par page | **P1** |
| **Labels de formulaire** | Souvent `<label className="text-xs text-neutral-500">…</label><input>` **sans `htmlFor`/`id`** (association implicite par imbrication seulement dans certains cas) ; `/login` associe correctement (`htmlFor="email"`) | **P1** |
| **Messages d'erreur** | Rendus en `<p>` colorés, **non reliés** au champ (`aria-describedby` absent) ; passés par query string | P1 |
| **Tableaux sur petit écran** | `min-width:680px` + scroll horizontal → en-têtes perdus, lecture pénible | **P0** |
| **Modales** | `max-h` + `overflow-y` injectés par le layout ; focus trap non garanti (pas de `<Dialog>` générique) | P1 |
| **Menu latéral / mobile** | Drawer avec overlay `bg-black/50`, bouton fermer, `aria-expanded`/`aria-controls` présents (bon point) ; `role="dialog"` non posé sur le drawer | P2 |
| **Textes tronqués** | `truncate` sur nom d'entreprise, libellés ; risque de perte d'info sans `title` | P2 |
| **Débordements horizontaux** | Neutralisés par le hack mobile (`min-w-0`, `flex-wrap`, `overflow-x`) ; à re-tester une fois le hack retiré | P1 |

> Aucune de ces observations n'a été confirmée dans un navigateur — voir § 2 et § 14.

---

## 9. Problèmes classés

### P0 — parcours quotidien, très visibles, bloquants pour la perception « pro »

| # | Problème | Écran(s) |
|---|---|---|
| P0-1 | Pas de design system : boutons/champs/cartes/alertes/tables réinventés par page ; couleur d'action ambiguë | tout |
| P0-2 | 185× `#0d1b2a` / 119× `#c9a24a` en dur ; tokens de marque inutilisés ; aucun « bleu d'action » | tout |
| P0-3 | Tableau de bord : 9 blocs, priorité (alertes/tâches) en 6ᵉ position, grille de 26 raccourcis qui double le menu | `/dashboard` |
| P0-4 | Menu de 39 entrées, sans icônes, **sans recherche globale** | `Sidebar` |
| P0-5 | Surfaces « entreprise cliente » et « plateforme ELSATIA » mélangées dans un seul menu | `Sidebar`, `/plateforme` |
| P0-6 | Sélecteur d'applications ELSATIA peu visible (enfoui dans l'en-tête du menu) | `ApplicationSwitcherGestionPro` |
| P0-7 | Responsive entièrement porté par un `<style> !important` global ; pages écrites desktop-first | `(app)/layout.tsx` + toutes |
| P0-8 | Contraste : `text-white/40`, `text-[9px]`, `text-neutral-500` limites ; mode sombre à 58/82 composants ; historique d'incidents | sidebar, `/login`, global |
| P0-9 | Tableaux : `min-width:680px` + scroll horizontal, en-têtes perdus sur mobile | toutes les listes |
| P0-10 | Fiche chantier : 10+ sous-sections empilées, sous-écrans hors navigation | `/chantiers/[id]` |

### P1 — fréquents

| # | Problème | Écran(s) |
|---|---|---|
| P1-1 | Pas de `<PageHeader>` / fil d'Ariane ; retours arrière incohérents (`MobileBack` + liens ad hoc) | toutes |
| P1-2 | Hiérarchie typographique faible/inversée (`h1` `text-xl`, `h2` `text-sm`) ; police Arial | toutes |
| P1-3 | 5 composants `Statut*Select` quasi identiques ; couleurs de statut en `style={{}}` inline | devis, factures, chantiers, commandes, employés |
| P1-4 | Largeur de contenu incohérente (`max-w-3xl`→`6xl` selon la page) ; `p-8` fixe | toutes |
| P1-5 | Labels de formulaire sans `htmlFor`/`id` systématique ; erreurs non reliées aux champs | formulaires |
| P1-6 | Focus visible non garanti globalement | toutes |
| P1-7 | 3 points d'entrée d'aide non unifiés (Guide PDF, `AideButton`, `AssistantIA`, `/aide`) | shell |
| P1-8 | 4 écrans d'état (`acces-refuse`, `en-attente`, `abonnement-suspendu`, `offline`) au style divergent | — |
| P1-9 | Onglets simulés par des `<Link>` bordés (`/parametres`, fiche chantier) | — |
| P1-10 | `/plateforme` : 335 lignes, très dense, `const input` local, 8 cartes stats + formulaires empilés | `/plateforme` |
| P1-11 | Écrans d'auth (`/login`, `/signup`, `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`) hors shell, styles propres divergents | auth |
| P1-12 | Pas de squelettes / `loading.tsx` ; rendu serveur 2–4 s ⇒ perception de lenteur | toutes |

### P2 — occasionnels / admin

| # | Problème |
|---|---|
| P2-1 | Libellés de menu hétérogènes (objet vs composé vs verbeux) |
| P2-2 | Pagination réécrite à la main par page (`parametresPage`) |
| P2-3 | États vides `border-dashed` répétés, textes hétérogènes |
| P2-4 | Badges/pills inline non standardisés |
| P2-5 | Pages de réglages (`/parametres/*`) au style hétérogène |
| P2-6 | `truncate` sans `title` (perte d'info) |
| P2-7 | Wizard d'import (`ImportWizard`) multi-étapes non cadré visuellement |

### P3 — hors périmètre commercial (BETA/DISABLED) — **ne pas maquetter en R3**

`/facturation-avancee`, `/crm`, `/ouvrages`, `/interventions`, `/sous-traitants`,
`/grands-deplacements`, `/paie` (+ `/paie/*`, `/banque-paie`), `/appels-offres`, `/boutique`
(+ `/boutique/*`), `/paiements-bancaires`, `/connecteurs`. À traiter seulement si/quand le
module est réactivé.

---

## 10. Quick wins futurs (à ne PAS implémenter dans R1)

À planifier dans **UI-V2-R4/R5** (composants communs / migration), pas maintenant :

1. Supprimer `src/components/StockMovementForm 2.tsx` (doublon de fichier) après vérif qu'il
   n'est pas importé.
2. Remplacer les `#0d1b2a` / `#c9a24a` en dur par les classes `bg-elsatia-navy` /
   `text-elsatia-gold` (ou de nouveaux tokens) — mécanique, à fort effet visuel.
3. Ajouter une règle `:focus-visible` globale dans `globals.css`.
4. Extraire le `const input = "…"` répété en un composant `<Input>` unique.
5. Fusionner les 5 `Statut*Select` en un seul `<StatutSelect domaine>`.
6. Retirer la **grille de 26 raccourcis** du tableau de bord (doublon du menu) ou la réduire.
7. Unifier les 4 écrans d'état en un `<EcranEtat>` paramétrable.
8. Ajouter `htmlFor`/`id` sur les labels de formulaire (accessibilité, faible risque).
9. Ajouter `title` sur les éléments `truncate`.
10. Remplacer les bannières d'erreur/succès inline par `<Alert>` (une fois le composant créé).
11. Remonter `ApplicationSwitcherGestionPro` en tête de la zone de navigation, libellé explicite.
12. Introduire des `loading.tsx` (squelettes) sur `/dashboard`, `/chantiers`, `/devis`,
    `/factures`, `/clients`.

---

## 11. Invariants de non-régression

Toute maquette et toute migration devront **prouver** que ces zones ne régressent pas
(tests + revue Julien) :

| Domaine | Point de contrôle |
|---|---|
| **Rôles & permissions** | `permissionsUtilisateur`, clés `acces_*` / verbes ; chaque bloc du dashboard reste gardé (notamment `voir_indicateurs_financiers` pour tout montant) |
| **Features commerciales** | `feature-catalogue.ts` + overrides `entreprise_feature_flags` ; BETA/DISABLED restent masqués |
| **Accès administrateur plateforme** | `est_plateforme_admin` ; lien `★ Plateforme` conditionné ; `navigationPourContexte` (admin sans entreprise ⇒ menu vide) ; redirection `(app)/layout.tsx` via `x-pathname` |
| **Isolation multi-entreprise** | RLS + `getContexteEntreprise` ; aucun écran ne doit exposer de données hors `entreprise_id` du contexte |
| **MFA / AAL2** | `/login/mfa`, `/mon-espace/securite` ; parcours d'élévation (`getAuthenticatorAssuranceLevel`, challenge/verify) intact |
| **Récupération de compte** | `/mot-de-passe-oublie` → `/auth/callback?next=/nouveau-mot-de-passe` → `/nouveau-mot-de-passe` ; garde MFA avant `updateUser` |
| **Données métier** | éditeurs `DevisEditor`/`FactureEditor`/`CommandeEditor` : refonte **visuelle uniquement**, calculs et lignes inchangés |
| **Abonnements & Stripe** | `/abonnement`, `AbonnementBanner`, `AbonnementCountdown`, retours `/paiement/*` ; parcours Checkout/portail intacts |
| **Sélecteur d'entreprise** | encart « Entreprise active » + session support `plateforme_entrer_entreprise` ; `SupportAccessBanner` |
| **Accès multi-applications** | `ApplicationSwitcherGestionPro` + `listerApplicationsPourSwitcher` ; n'afficher que les apps autorisées ; droits revérifiés au changement d'app |
| **PWA** | `manifest.webmanifest`, `PwaInstallButton`, service worker, `/offline` ; installation et mode hors-ligne conservés |
| **Colors / Tools** | autonomie totale : leurs interfaces, navigations, données et PWA restent séparées ; la déclinaison (R7/R8) n'y touche qu'ensuite |
| **Responsive existant** | ne pas retirer le hack `<style>` du layout **avant** que les écrans migrés soient responsive par conception (retrait progressif, écran par écran) |
| **Routes citées dans les e-mails / liens externes** | `/auth/callback`, `/auth/confirm`, `/nouveau-mot-de-passe`, `/login/mfa`, `/onboarding`, `/document/[token]`, `/imprimer/partage/[token]` — chemins et paramètres inchangés ; restent dans la liste des chemins publics du proxy |
| **Rendu PDF** | pages `/imprimer/*` naviguées par Chromium : le CSS d'impression ne doit pas casser |
| **Perf de navigation** | `Lien` sans préchargement (pages serveur lourdes) : ne pas réintroduire un `prefetch` massif |

---

## 12. Recommandations pour UI-V2-R2 (mini-charte + design system)

1. **Tokens** (source unique, `globals.css` + `@theme`) :
   - Couleurs : `--elsatia-navy` (nav/structure), **`--elsatia-action`** (nouveau — bleu
     d'action, distinct du navy), `--elsatia-gold` (accent parcimonieux), surface `--bg`
     (clair) / `--surface` (blanc cartes) / `--border` (discret), texte `--text` /
     `--text-muted` ; statuts `--status-success` / `--status-warning` / `--status-danger` /
     `--status-info` (usage réservé aux statuts et alertes).
   - Typo : une police lisible (système ou webfont), échelle `display / h1 / h2 / h3 / body /
     small / caption` avec poids et interlignage définis ; `h1` > `h2` > corps (corriger
     l'inversion actuelle).
   - Espacement : échelle 4/8 px ; **paddings de page** responsifs (`px-4 md:px-6 lg:px-8`) ;
     une seule largeur de contenu par gabarit (ex. `--content-narrow` 640, `--content` 960,
     `--content-wide` 1200).
   - Rayons : 2–3 valeurs maximum ; ombres : 1–2 niveaux ; bordures : discrètes, moins
     nombreuses (le cadrage demande « moins de bordures »).
2. **Composants noyau** à spécifier et construire (R4) : `Button`, `Input`/`Select`/`Textarea`/
   `Field`, `Card`, `Badge`, `StatutBadge`, `Alert`, `Dialog`, `Tabs`, `Table` (+ variante
   carte-liste mobile), `Pagination`, `FilterBar`, `EmptyState`, `PageHeader`, `AppShell` /
   `SideNav`, `Icon` (set unique), `ConfirmButton`, squelettes.
3. **Mode sombre** : décider maintenant s'il est *supporté* (alors : tous les tokens doivent
   basculer, et chaque composant noyau doit être validé clair **et** sombre) ou *reporté*
   (alors : figer un thème clair unique et retirer les `dark:` épars). Ne pas laisser l'état
   « à moitié ».
4. **Accessibilité de base dans le design system** : `:focus-visible` global, cibles ≥ 44 px,
   contraste AA vérifié pour chaque token de texte sur chaque surface, labels reliés, erreurs
   `aria-describedby`.
5. **Grille responsive native** : les composants noyau intègrent leur comportement
   bureau/tablette/mobile ; objectif de sortie = pouvoir retirer le `<style> !important` du
   layout écran par écran.
6. **Séparer visuellement « entreprise » et « plateforme ELSATIA »** : deux contextes de
   navigation distincts (couleur d'accent, en-tête, libellé) plutôt qu'un filet dans le même
   menu.
7. **Navigation** : regrouper les 39 entrées en ~6 domaines, priorité aux 8–10 modules
   quotidiens ; recherche globale dans l'en-tête ; icônes cohérentes ; état actif = couleur
   d'action (pas l'or).

---

## 13. Écrans à maquetter dans UI-V2-R3 (2–3 propositions chacun)

**Priorité 1 — le socle (obligatoire pour valider la direction) :**

1. **Tableau de bord** — nouvelle hiérarchie (§ 6), 2–3 variantes de densité, 3 gabarits
   (bureau / tablette / mobile).
2. **Coquille + navigation** — `AppShell` : menu regroupé, en-tête avec recherche + sélecteur
   d'applications + sélecteur d'entreprise + notifications ; variantes menu large / replié /
   drawer mobile ; **contexte plateforme** distinct.
3. **Liste type** (sur `/chantiers` ou `/clients`) — `PageHeader` + `FilterBar` + `Table`
   desktop / carte-liste mobile + `Pagination` + `EmptyState`.
4. **Fiche / détail type** (sur `/chantiers/[id]`) — en-tête d'objet + statut + `Tabs` pour
   les sous-écrans + sections cadrées ; version mobile.
5. **Formulaire type** (sur `/devis/nouveau` ou `/clients/nouveau`) — `Field` standardisés,
   états focus/erreur, barre d'action collante, version mobile.

**Priorité 2 — à inclure si le temps le permet :**

6. **Authentification** (`/login` + `/login/mfa`) — alignés sur la charte, hors shell.
7. **Paramètres entreprise** (`/parametres`) — hub + sous-pages en `Tabs`.
8. **Parcours terrain mobile** — `/mon-espace`, `/pointage`, `/mes-travaux` (mobile-first).
9. **Écran d'état unifié** (`acces-refuse` / `en-attente` / `abonnement-suspendu` / `offline`).
10. **Console plateforme** (`/plateforme`) — dédensifiée, contexte visuel distinct.

**Ne pas maquetter** : tous les écrans P3 (BETA/DISABLED, § 9).

---

## 14. Zones nécessitant une vérification visuelle authentifiée par Julien

L'audit étant statique, Julien doit **observer dans le navigateur** (Preview, connecté) et
confirmer / infirmer :

1. `/dashboard` d'un **gérant** avec données réelles : densité perçue, ordre de lecture, temps
   d'affichage, pertinence des 9 blocs.
2. `/dashboard` d'un **profil terrain** (ouvrier) : ce qui apparaît vraiment, utilité de la
   grille de raccourcis.
3. **Menu latéral** rempli (gérant) : nombre réel d'entrées visibles, lisibilité des libellés
   `text-white/45` sur navy, repérage de la page active.
4. **Fiche chantier** `/chantiers/[id]` bien remplie : longueur de scroll, repérage des
   sous-sections, navigation vers `/doe`, `/documents`, `/emails`.
5. Une **liste longue** (`/clients`, `/chantiers`) sur **mobile réel** : scroll horizontal du
   tableau, utilisabilité des filtres, taille des cibles tactiles.
6. **`/login` et `/signup` en mode sombre** (le sujet a déjà régressé une fois).
7. **`/plateforme`** : densité, et confirmer que la frontière « je gère ELSATIA » vs « je suis
   dans une entreprise cliente » est claire ou non.
8. **Sélecteur d'applications ELSATIA** : est-il trouvable ? Le passage Gestion Pro ↔ Colors ↔
   Tools est-il fluide ?
9. **Contraste** de `text-neutral-500` (textes secondaires) sur fond blanc, sur écran de
   chantier en plein soleil (cas d'usage BTP).
10. **Impression PDF** d'un devis et d'une facture (`/imprimer/*`) : servent de référence à ne
    pas casser.
11. **Un document partagé client** (`/document/[token]`) : image de marque perçue par un
    destinataire externe.
12. Comportement **tablette** (iPad portrait / paysage) — angle mort de l'audit (pas de point
    de rupture dédié dans le code).

---

## Contrôles finaux du lot R1

- **Seul fichier créé** : `docs/organisation/ELSATIA_UI_V2_R1_AUDIT.md`.
- **Aucun fichier applicatif modifié** (`src/`, `apps/`, styles, config).
- **Aucune migration**, aucune écriture Supabase, aucune action Vercel / Stripe / Production.
- **Aucun `main` touché.**
- La suppression non stagée de `output/video/Liria_Gestion_Pro_Guide_Video_Complet.mp4` reste
  intacte et **hors de tout commit**.
- **Aucun commit effectué** par ce lot.
