# ELSATIA-UI-V2-R2C — Gel de la direction visuelle avant R3

Lot **UI-V2-R2C**. UI-V2-R2B a été **validé par Julien**. Ce lot **fige les décisions UI** et
**prépare le contrat de migration R3**, **sans modifier l'application**.

> **R3 applicatif n'est PAS autorisé.** Le chemin critique Gestion Pro
> (sécurité / MFA / Production) doit être consolidé avant toute modification transversale de
> `src/`. Ce document est une **référence**, pas un déclencheur.

Base : branche `feat/elsatia-canonical-final-r73-v1`, HEAD `e65fc05…`.
Références : `ELSATIA_UI_V2_R1_AUDIT.md`, `ELSATIA_UI_V2_R2A_DIRECTIONS.md`,
`ELSATIA_UI_V2_R2B_HYBRIDE.md`, maquette `docs/organisation/ui-v2/r2b/elsatia-hybride.html`.

---

## 1. Décisions produit — DÉFINITIVES (gelées)

| # | Sujet | Décision figée |
|---|---|---|
| D1 | **Direction visuelle** | **Hybride B + C + A — VALIDÉE.** Base **B « Chantier »** (bandeau « Aujourd'hui », statuts couleur+forme+libellé, cibles ≥ 44 px) ; emprunts **C** (board Pilotage, hiérarchie typo, lignes de total, filet doré discret, registre premium direction) ; emprunts **A** (surfaces douces, gris confortables, bordures fines, ombres légères, formulaires administratifs reposants). C'est **la référence visuelle UI-V2** de Gestion Pro. |
| D2 | **Densité desktop** | **`Confort` par défaut** (cibles 44 px, bordures 1 px, lignes 44 px, padding de carte 16). |
| D3 | **Densité tablette / terrain** | **`Terrain`** : cibles **48 px**, bordures 1,5 px, lignes 52 px, padding de carte 20. Même identité, réglage de tokens — **pas** un second design system. |
| D4 | **Police V1** | **Pile système** (`-apple-system, "Segoe UI", Roboto, Helvetica, Arial`). **Aucune webfont** (externe **ou** locale) **avant commercialisation**. |
| D5 | **Doré ELSATIA** | **Accent de marque uniquement** : filet (sous le titre), état actif (inset de navigation), détails premium, anneau de focus. **Jamais** : gros fond, CTA principal, grandes surfaces. |
| D6 | **Mode sombre** | **REPORTÉ post-commercialisation.** Le thème clair doit **conserver des tokens compatibles** avec une future déclinaison sombre (tous les tokens sont des variables sémantiques, aucune couleur en dur — § 6). |
| D7 | **« Aujourd'hui »** | Pilier officiel de Gestion Pro (§ 3). |
| D8 | **Board « Pilotage »** | Validé, **conditionné aux permissions financières** dans l'application réelle (§ 4). |
| D9 | **Design system commun** | **UN** design system pour Gestion Pro / Colors / Tools / futures apps, avec un accent contextuel limité par app (§ 5). |

### Détail des décisions

**2. Focus** — on conserve le **doré ELSATIA**, mais on **renforce le contrat** : partout où
l'anneau doré seul approche la limite de visibilité, l'indicateur est **superposé** :

> **anneau doré principal (3 px)** + **liseré blanc interne (1 px)** + **halo sombre externe**
> (`rgba(12,26,43,.32)`, ~6 px).

Ce triptyque donne une séparation nette sur **blanc** (le halo sombre détache), sur **bleu
d'action** (le liseré blanc détache) et sur **bleu nuit** (le doré contraste déjà,
liseré blanc en renfort). **Non implémenté dans l'app.** La maquette
`elsatia-hybride.html` a été mise à jour (`:focus-visible` et la carte de démonstration) car
cela améliore réellement la démonstration.

**3. « Aujourd'hui »** — composant conceptuel officiel. Objectif : répondre immédiatement à
*« Qu'est-ce qui nécessite mon attention maintenant ? »*. Contenu futur possible : alertes,
tâches, relances, validations, anomalies, échéances. **Les moteurs métier ne sont pas
développés dans R2C** ; « Aujourd'hui » est un emplacement d'agrégation, pas une nouvelle
logique.

**4. « Pilotage »** — board validé. Dans l'app réelle il devra être **conditionné par les
permissions financières appropriées** (au minimum `voir_indicateurs_financiers`). **Les KPI
financiers ne doivent jamais être universellement visibles** (un ouvrier ne voit ni CA, ni
marge, ni encaissé).

**5. Design system commun** — ELSATIA tend vers **un** design system. **Commun** : typographie,
navigation générale, focus, boutons, formulaires, cartes, statuts, espacements, accessibilité,
switcher ELSATIA. Chaque application (Colors, Tools) peut employer **un accent contextuel
limité**. **Ne pas créer trois design systems différents.**

---

## 2. Direction (rappel figé)

`ELSATIA = BTP professionnel + outil terrain efficace + SaaS premium + pilotage dirigeant
sérieux.` La maquette de référence est `docs/organisation/ui-v2/r2b/elsatia-hybride.html`.

---

## 3. Police

**Pile système, V1.** Rationnel : zéro dépendance, zéro chargement, rendu natif cohérent
Windows / macOS / iOS / Android, aucun risque de FOUT/FOIT, aucun coût de licence, aucune
question RGPD (pas d'appel à un CDN de polices). Une webfont **embarquée** (jamais distante)
pourra être étudiée **après** commercialisation si l'identité l'exige — hors périmètre.

---

## 4. Densité

| Mode | Contexte | `--tap` | `--border-w` | ligne | champ | padding carte |
|---|---|---|---|---|---|---|
| **Confort** *(défaut desktop)* | administratif, consultation, longues pages | 44 px | 1 px | 44 px | 44 px | 16 px |
| **Terrain** | tablette, mobile, usage chantier | **48 px** | 1,5 px | 52 px | 48 px | 20 px |

Bascule = **réglage de tokens** (variables CSS), pas de duplication de composants. Le choix par
défaut réel (persistance par utilisateur / par appareil / automatique selon la largeur) est un
sujet R3 (probablement : Terrain forcé sous 1024 px, Confort au-dessus, préférence
utilisateur possible ensuite).

---

## 5. Focus

- **Indicateur** : anneau doré 3 px, `outline-offset` 2 px, **+** liseré blanc interne 1 px
  **+** halo sombre externe `rgba(12,26,43,.32)` ~6 px.
- **Appliqué via `:focus-visible`** à tous les éléments interactifs (boutons, liens, `select`,
  `input`, boutons d'icône, entrées du switcher, onglets).
- **Contraste** : l'indicateur composite atteint ≥ 3:1 (seuil éléments non textuels) sur les
  trois fonds de référence (blanc, `--action`, `--nav-bg`) grâce à la superposition — la seule
  couleur or (~3,8:1 sur blanc) n'est plus le seul séparateur.
- **Forced-colors / high-contrast Windows** : prévoir en R3 un `@media (forced-colors: active)`
  qui repasse sur `outline: 3px solid CanvasText`.
- **Non implémenté dans l'app.** Maquette mise à jour.

---

## 6. Doré

**Emplacements autorisés** : filet 2 px sous le titre de page · `inset 3px 0 0` sur l'entrée de
navigation active · anneau de focus · micro-détails premium (séparateur du board, puce du
switcher — **traits, pas aplats**).
**Emplacements interdits** : fond de bouton, CTA, fond de carte, bandeau, grande surface,
texte courant.
**Contrôle** : l'or `#a97b23` est un **élément graphique** (filet / anneau), soumis au seuil
**3:1**, pas 4,5:1 : ≈ 3,8:1 sur blanc, ≈ 4,6:1 sur navy — conforme. Il ne portera **jamais**
de texte.

---

## 7. Mode sombre

**Reporté post-commercialisation.** Conditions à respecter dès maintenant pour ne pas le
bloquer :

- **100 % des couleurs sont des tokens sémantiques** sur `:root` ; aucun composant ne
  référence une valeur hexadécimale en dur.
- Les **paires** `--x` / `--x-bg` (statuts), `--today-bg`, `--action-weak`, `--surface` /
  `--surface-2`, `--border` / `--hair` doivent avoir un **équivalent sombre défini au même
  endroit** (bloc `@media (prefers-color-scheme: dark)` **et** `:root[data-theme="dark"]`).
- La **navigation bleu nuit** devra être **différenciée** de la zone de travail en thème
  sombre (nav légèrement plus claire que le fond, ou filet).
- Le **doré** fonctionne mieux en sombre (posé sur fond foncé → contraste supérieur).
- **Aucune décision de R2C ne bloque le mode sombre.** Sujet **R2D / R4** au plus tôt, plus
  probablement post-commercialisation.

---

## 8. « Aujourd'hui » (pilier officiel)

- **Emplacement** : en tête de la zone de travail de `/dashboard`, au-dessus du board
  « Pilotage » et du détail opérationnel.
- **Rôle** : agrégateur d'items **actionnables aujourd'hui** — pas un flux, pas un journal.
- **Sources futures possibles** (moteurs **non** développés ici) : alertes opérationnelles
  (déjà calculées par `CentreAlertesOperationnelles` / `dashboard/page.tsx`), tâches, relances
  (`relances_documents`), validations en attente (notes de frais, congés, avenants),
  anomalies, échéances (factures, devis, CT véhicule, vérif outil).
- **Gardes** : chaque item reste soumis à la permission qui le concerne (ex. montants →
  `voir_indicateurs_financiers`). « Aujourd'hui » **filtre**, il n'ouvre aucun accès.
- **Mobile** : première section, condensée ; suivie d'actions rapides contextualisées au rôle.

---

## 9. « Pilotage » (board dirigeant)

- **Bloc séparé**, après « Aujourd'hui ».
- **Condition d'affichage réelle** : permission financière (`voir_indicateurs_financiers` a
  minima ; à préciser en R3 selon le besoin — CA/marge peuvent exiger un droit plus élevé).
- **Contenu** : 4 KPI (CA, Facturé, Encaissé, Marge chantiers) — valeur + **évolution en
  toutes lettres** (« ▲ … en hausse » / « ▼ … en baisse », jamais la flèche seule) + micro-
  tendance ; tendance 6 mois en barres (CSS pur, pas de bibliothèque).
- **Interdit** : rendre ces KPI visibles par défaut à tous ; les afficher dans « Aujourd'hui »
  pour un profil terrain.
- **Mobile** : repoussé sous le contenu opérationnel, KPI en carrousel horizontal.

---

## 10. Design system commun ELSATIA

**Un** design system, **trois** applications, **un** accent par app.

| Élément | Commun (identique partout) | Spécifique à l'app |
|---|---|---|
| Typographie (échelle, pile système) | ✅ | — |
| Navigation générale (coquille, en-tête, comportement) | ✅ | libellés & regroupements métier propres |
| **Switcher « Applications ELSATIA »** | ✅ (même composant, même place) | app marquée *actif* |
| Focus (anneau doré composite) | ✅ | — |
| Boutons (primary / secondary / danger / ghost) | ✅ | — |
| Formulaires (`Field`, états, erreurs) | ✅ | — |
| Cartes (`Card`, tones) | ✅ | — |
| Statuts (couleur + forme + libellé) | ✅ | libellés métier propres |
| Espacements, rayons, ombres, densités | ✅ | — |
| Accessibilité (contrastes, cibles, clavier) | ✅ | — |
| **Couleur d'action** `--action` (bleu) | ✅ | — |
| **Bleu nuit** de navigation | ✅ | — |
| **Doré** (filet / état actif / focus) | ✅ | — |
| **Accent contextuel** | — | Colors : rappel de la teinte affichée (puces, cartes) ; Tools : néant (garde le bleu d'action) |
| Mise en page « dashboard » (board Pilotage, bandeau Aujourd'hui) | Gestion Pro (+ Colors partiel) | **pas** Tools (parcours Saisie→Résultat) |

**Règle** : l'accent d'app ne remplace **jamais** `--action`, `--nav-bg` ni `--gold` ; il
s'ajoute, en zones limitées.

---

## 11. Contrat de tokens V1 (proposition documentaire — AUCUN fichier CSS/TS créé)

Valeurs issues de la maquette validée `elsatia-hybride.html`. Nommage **agnostique** (utilisable
en variables CSS `--elsatia-*` **ou** en objet de thème TS). **Ne pas implémenter ici.**

### 11.1 Couleurs

| Token | Valeur (clair) | Usage | Équivalent sombre (à définir R2D/R4) |
|---|---|---|---|
| `color.background` | `#f4f6f8` | fond de zone de travail | *foncé profond* |
| `color.background.soft` | `#f7f9fb` | fond de formulaire / repos | — |
| `color.surface` | `#ffffff` | panneaux, cartes | *surface sombre* |
| `color.surface.alt` | `#f2f4f7` | en-têtes de tableau, zones internes | — |
| `color.navy` | `#0c1a2b` | navigation bleu nuit | *nav sombre différenciée du fond* |
| `color.navy.alt` | `#12283f` | survol / strates de nav | — |
| `color.today` | `#0d2138` | bandeau « Aujourd'hui » | — |
| `color.on-navy` | `#eef3f8` | texte sur navy (~13:1) | — |
| `color.on-navy.muted` | `#b7c4d3` | libellés de groupe sur navy (~5,6:1) | — |
| **`color.action`** | `#1550d6` | bouton primaire, lien | *bleu clair lisible sur sombre* |
| `color.action.strong` | `#0f3ea8` | survol primaire | — |
| `color.action.weak` | `#e6edfc` | fond léger d'action | — |
| **`color.gold`** | `#a97b23` | **filet / état actif / focus uniquement** | *reste utilisable* |
| `color.gold.soft` | `#f0e6d1` | fond d'accent rare | — |
| `color.text` | `#161b21` | texte principal (**17,3:1**) | *texte clair sur sombre* |
| `color.text.muted` | `#4c5560` | texte secondaire (**7,4:1**) | — |
| `color.text.soft` | `#5f6875` | mentions / aides (**5,9:1**) | — |
| `color.border` | `#e2e6eb` | bordure standard | — |
| `color.border.strong` | `#cdd3db` | champs, en-têtes de tableau | — |
| `color.hair` | `#eef0f3` | filets de ligne | — |
| `color.success` / `.bg` | `#146b3c` / `#e4f2ea` | statut « Validé » (**6,3:1**) | — |
| `color.info` / `.bg` | `#0f4bab` / `#e5eefb` | statut « À relancer » (**7,3:1**) | — |
| `color.warning` / `.bg` | `#7a4f0c` / `#f8ecd6` | statut « En attente » (**6,0:1**) | — |
| `color.error` / `.bg` | `#a11d16` / `#fae4e2` | statut « Urgent » / « Refusé » (**6,5:1**) | — |
| `color.neutral` / `.bg` | `#45505d` / `#e9ecef` | statut « Brouillon » (**6,6:1**) | — |

### 11.2 Spacing (base 4)

| Token | Valeur |
|---|---|
| `space.xs` | 4 px |
| `space.sm` | 8 px |
| `space.md` | 16 px |
| `space.lg` | 24 px |
| `space.xl` | 32 px |

*(interne : `space.2xs = 2`, `space.xl+ = 48` pour la respiration entre grandes sections)*

### 11.3 Radius

| Token | Valeur | Usage |
|---|---|---|
| `radius.small` | 6 px | badges, champs, boutons |
| `radius.medium` | 9 px | cartes, panneaux |
| `radius.large` | 13 px | bandeau « Aujourd'hui », board |

### 11.4 Touch

| Token | Valeur |
|---|---|
| `touch.comfort` | **44 px** |
| `touch.terrain` | **48 px** |

### 11.5 Elevation

| Token | Valeur |
|---|---|
| `shadow.1` | `0 1px 2px rgba(15,23,42,.05), 0 1px 1px rgba(15,23,42,.03)` (cartes) |
| `shadow.2` | `0 6px 20px rgba(15,23,42,.08)` (bandeau « Aujourd'hui ») |
| `border.width.comfort` | 1 px |
| `border.width.terrain` | 1,5 px |

### 11.6 Typography

| Token | Réglage | Usage |
|---|---|---|
| `type.eyebrow` | 11 px / 700 / `letter-spacing .16em` / capitales / `color.text.soft` | contexte au-dessus du titre |
| `type.h1` | 26 px / 750 / `line-height 1.12` / `-0.015em` | titre de page (+ filet doré dessous) |
| `type.section` | 15 px / 750 | en-têtes de carte |
| `type.body` | 14 px / 400–600 | contenu |
| `type.secondary` | 12,5 px / `color.text.muted` | sous-titres, détails |
| `type.micro` | 11,5 px / `color.text.soft` (≥ 4,5:1) | aides, mentions |
| `type.number` | fonte monospace tabulaire ; board KPI 26 px / 750 ; montants alignés à droite | KPI, tableaux, totaux |

Pile : `font.family.base = -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
`font.family.number = ui-monospace, "SF Mono", "Segoe UI Mono", Menlo, Consolas, monospace`.

---

## 12. Inventaire des composants pour R3 (audit lecture seule)

Base réelle : **104 pages** sous `src/app/(app)`, **82 composants** sous `src/components`.
Constats transverses : `const input = "…"` **redéfini dans 27 fichiers** ; **5** composants
`Statut*Select` quasi identiques ; **≈ 298** bannières/alertes inline (`bg-{red,green,amber,blue}-50`) ;
**≈ 304** occurrences `#0d1b2a` / `#c9a24a` en dur ; **aucun** `<Dialog>` générique (5 fichiers
posent `role="dialog"` à la main) ; responsive porté par **2 blocs `<style>` `!important`**
dans `(app)/layout.tsx`.

| Composant / zone | Fichier(s) | État actuel | Impact UI-V2 | Difficulté | Risque | Ordre R3 |
|---|---|---|---|---|---|---|
| **Tokens / thème** | *(inexistant)* — hex en dur, `globals.css` minimal | À créer | **Fondation** — tout en dépend | Moyenne | Faible (additif) | **R3-A** |
| **Primitives** `Button` / `Field` (`Input`,`Select`,`Textarea`) / `Card` / `Badge` / `StatutBadge` / `Alert` / `EmptyState` / `Icon` | *(inexistants)* — inline dans 27+ fichiers | À créer | **Fondation** | Moyenne | Faible (nouveaux) | **R3-A** |
| **`AppShell` / coquille** | `src/app/(app)/layout.tsx` (87 l., 2× `<style>!important`) | À refondre | Fort — cadre de tout | Élevée | **Élevé** (redirection admin-plateforme via `x-pathname`, `ModuleAccessBoundary`, bannières) | **R3-B** |
| **Sidebar / navigation** | `src/components/Sidebar.tsx` (153 l.), `src/lib/navigation.ts` (90 l.) | À refondre (regrouper 39→~6, icônes, largeur, filet doré actif) | Fort | Élevée | **Élevé** (`navigationAutorisee` + `featureForPath` + `compteDepot` + `navigationPourContexte`) | **R3-B** |
| **En-tête (topbar)** | dans `layout.tsx` / `Sidebar.tsx` | À extraire + recherche globale + notifications + switcher | Fort | Moyenne | Moyen | **R3-B** |
| **Switcher applications** | `src/components/ApplicationSwitcherGestionPro.tsx` (116 l., clavier manuel) | À reprendre (place, a11y) | Moyen | Moyenne | Moyen (clavier, focus) | **R3-B** |
| **Dashboard** | `src/app/(app)/dashboard/page.tsx` (352 l.) + `DashboardWidgets` (97) + `DashboardAnalytics` (53) + `BriefingMatin` (35) + `MobileModuleGrid` (129) | À restructurer (Aujourd'hui + board Pilotage + retrait grille 26 raccourcis) | **Fort** | Élevée | Moyen (gardes de permission par bloc à préserver) | **R3-C** |
| **« Aujourd'hui »** | *(à composer)* depuis `CentreAlertesOperationnelles.tsx` (380 l.) + logique d'alertes de `dashboard/page.tsx` | À créer (agrégateur, pas de moteur nouveau) | **Fort** | Moyenne | Moyen (masquage/délégation d'alertes, RPC) | **R3-C** |
| **Board « Pilotage »** | *(à composer)* KPI + tendance CSS | À créer, **conditionné permission** | Moyen | Faible | Moyen (visibilité financière) | **R3-C** |
| **Tables** | `<table>` bruts partout ; responsive forcé par le `<style>` du layout | À créer `Table` + variante carte-liste mobile | **Fort** (42 listes) | Moyenne | Faible | **R3-D** |
| **`Pagination` / `FilterBar`** | réécrits à la main par page (`parametresPage`) | À créer | Moyen | Faible | Faible | **R3-D** |
| **Formulaires** | `const input` ×27, éditeurs métier | À aligner sur `Field` (visuel seulement pour les éditeurs) | **Fort** | Moyenne | **Élevé** sur `DevisEditor.tsx` (688 l.), `CommandeEditor.tsx` (201), `FactureEditor.tsx` (74) — logique de calcul intacte | **R3-D** |
| **Sélecteurs de statut** | `Statut{Chantier,Commande,Devis,Employe,Facture}Select.tsx` (×5) | Fusionner en 1 `StatutSelect domaine` | Moyen | Faible | Faible | **R3-D** |
| **Modales** | 5 fichiers `role="dialog"` ad hoc ; comportement scroll dans le `<style>` layout | À créer `Dialog` (focus-trap, esc, `max-h`) | Moyen | Moyenne | Moyen (focus, `aria`) | **R3-D** |
| **Badges / pills** | inline non standard | → `Badge` / `StatutBadge` | Faible | Faible | Faible | **R3-A/D** |
| **Alertes / bannières** | ≈ 298 inline + `AbonnementBanner`, `SupportAccessBanner`, `AlerteDepassementAppareils` | → `Alert` + zone de bannières unifiée dans le shell | **Fort** (volume) | Faible | Faible | **R3-B/D** |
| **Pages plateforme** | `src/app/(app)/plateforme/page.tsx` (350 l.) + 7 sous-pages | À dédensifier + **contexte visuel distinct** | Moyen | Moyenne | **Élevé** (jamais visible entreprise cliente ; `est_plateforme_admin`) | **R3-E** |
| **Pages chantier** | `src/app/(app)/chantiers/[id]/page.tsx` (238 l.) + 5 sous-écrans | À restructurer (en-tête d'objet + `Tabs`) | **Fort** | Élevée | Moyen | **R3-E** |
| **Devis / Facture (liste + éditeur)** | `devis/`, `factures/` + `DevisEditor` (688), `FactureEditor` (74) | Liste → `Table` ; éditeur → habillage visuel **sans toucher les calculs** | **Fort** | **Élevée** | **Élevé** (cœur métier + PDF) | **R3-E** |
| **Auth (`/login`, `/login/mfa`, `/signup`, mots de passe)** | hors shell `(app)`, styles propres | À aligner sur la charte | Moyen | Faible | **Élevé** (parcours MFA/récupération — chemin critique) | **R3-E** (après feu vert sécurité) |
| **Impression / partage client** (`/imprimer/*`, `/document/[token]`) | layout `imprimer/` dédié | Habillage marque **sans casser le rendu PDF Chromium** | Moyen | Moyenne | **Élevé** (PDF + destinataire externe) | **R3-E** |
| **Responsive / mobile** | `<style>!important` dans `layout.tsx` ; `MobileModuleGrid`, `MobileBack` | Retrait **progressif** du hack, écran par écran, une fois chaque écran responsive nativement | **Fort** | Élevée | **Élevé** (régressions mobiles) | **R3-F** |
| **Aide** | `AideButton` (17) + lien « Guide » (Sidebar) + `AssistantIA` (607) + `/aide` | Unifier les points d'entrée (visuel) | Faible | Faible | Faible | **R3-F** |

---

## 13. Stratégie R3 — migration progressive (PAS de « big bang »)

| Sous-lot | Périmètre | Invariants imposés |
|---|---|---|
| **R3-A** | **Tokens + primitives** : `globals.css`/thème (variables sémantiques du § 11), `Button`, `Field`, `Card`, `Badge`, `StatutBadge`, `Alert`, `EmptyState`, `Icon`, `:focus-visible` global + `@media (forced-colors)`. **Additif**, aucun écran modifié. | Métier intact · tests verts · rollback = suppression des nouveaux fichiers · **aucun changement DB** |
| **R3-B** | **Shell + navigation** : `AppShell`, `SideNav` (regroupement ~6 domaines, icônes, filet doré actif, largeur), `PageHeader`, en-tête (recherche globale, notifications, switcher), zone de bannières unifiée, séparation visuelle contexte plateforme. | `navigationAutorisee`/`featureForPath`/`compteDepot`/`navigationPourContexte` **rejoués et testés** · redirection admin-plateforme (`x-pathname`) préservée · `ModuleAccessBoundary` inchangé · rollback par revert du lot · **aucun changement DB** |
| **R3-C** | **Dashboard + « Aujourd'hui » + board « Pilotage »** : nouvelle hiérarchie, retrait de la grille de 26 raccourcis, « Aujourd'hui » en tête, board conditionné permission. | Chaque bloc garde sa garde de permission (montants → `voir_indicateurs_financiers`) · moteur d'alertes/masquage/délégation inchangé · rollback par revert · **aucun changement DB** |
| **R3-D** | **Tables + formulaires + modales** : `Table` (+ carte-liste mobile), `Pagination`, `FilterBar`, `Dialog`, fusion des 5 `Statut*Select`, alignement des `const input` sur `Field`, `Alert` en remplacement des bannières inline. | Éditeurs métier (`DevisEditor`, `CommandeEditor`, `FactureEditor`) : **habillage visuel uniquement**, calculs/lignes intacts · tests de calcul verts · rollback par revert · **aucun changement DB** |
| **R3-E** | **Pages métier prioritaires** : chantier (`[id]` + sous-écrans en `Tabs`), devis/facture (listes + habillage éditeur), plateforme (dédensification + contexte distinct), auth (`/login`, `/login/mfa`, `/signup`) **après feu vert sécurité**, impression/partage client. | Isolation multi-entreprise · MFA/AAL2/récupération · rendu PDF Chromium · plateforme jamais visible entreprise cliente · rollback par écran · **aucun changement DB** |
| **R3-F** | **Polish mobile** : retrait **progressif, écran par écran**, du `<style>!important` du layout à mesure que chaque écran devient responsive nativement ; `MobileModuleGrid`/`MobileBack` intégrés ; points d'entrée d'aide unifiés. | Aucune régression mobile (tests responsive) · le hack n'est retiré d'un écran **qu'une fois** cet écran migré · rollback = réintroduction du bloc `<style>` · **aucun changement DB** |

Contraintes communes à **tous** les sous-lots : préserver le métier · conserver les tests
(ajout de tests de non-régression) · être **rollbackable** (revert propre) · **éviter tout
changement de base de données**.

---

## 14. Priorité avant commercialisation (classement A / B / C)

**Ne pas classer tout l'ERP en A.** A = écrans où l'UI actuelle serait **réellement bloquante
commercialement** (première impression, démo prospect, écran vu par le client final).

### A — nécessaire avant commercialisation

| Écran / chantier | Pourquoi bloquant |
|---|---|
| **Tokens + focus + retrait des ~304 hex en dur** (R3-A) | Cohérence visuelle minimale ; sans cela toute autre retouche est incohérente |
| **Coquille + navigation + en-tête** (R3-B) | Vu sur **chaque** écran ; le menu de 39 entrées sans recherche et la confusion entreprise/plateforme sont les reproches n° 1 de l'audit |
| **Dashboard + « Aujourd'hui »** (R3-C) | **Pièce maîtresse de la démo commerciale** ; la densité actuelle dessert la vente |
| **`/login` + `/signup`** | **Premier contact** d'un prospect ; doivent être à la charte (et cohérents avec le site vitrine) — *sous réserve du feu vert sécurité pour toute modification du parcours auth* |
| **`/devis` (liste) + `/devis/nouveau` + `/factures` (liste)** | Cœur de la démo ; listes en scroll horizontal mobile = mauvaise impression |
| **`/document/[token]` + `/imprimer/partage/*`** | Vus par **les clients du prospect** — image de marque externe |
| **Board « Pilotage »** (conditionné) | Argument de vente « pilotage dirigeant » ; doit exister et être propre pour les démos gérant |

### B — amélioration utile, non bloquante

Fiches et sous-écrans chantier · éditeurs devis/facture (habillage) · pages achats/stock ·
matériel/flotte · équipe (employés, congés, pointage, notes de frais) · messagerie ·
paramètres entreprise (hors `/parametres/acces`) · unification des alertes inline · `Dialog`
générique · fusion des `Statut*Select` · polish tablette.

### C — post-commercialisation

Pages plateforme (dédensification complète) · `/parametres/acces` (matrice) ·
rentabilité/trésorerie/exports · wizard d'import · assistant IA · retrait **total** du hack
responsive · **mode sombre** · tous les écrans P3 de l'audit (BETA/DISABLED) · webfont éventuelle.

---

## 15. Risques

| Risque | Portée | Mitigation |
|---|---|---|
| **Régression de navigation / permissions** (R3-B) | critique | Tests de `navigationAutorisee`/`featureForPath`/`compteDepot`/`navigationPourContexte` avant/après ; revue Julien ; pas de modif des fonctions de garde |
| **Régression MFA / récupération / isolation** | critique | R3-E auth **seulement après consolidation sécurité** ; ne pas toucher aux gardes serveur ni au chemin `/auth/callback` `/login/mfa` `/nouveau-mot-de-passe` |
| **Casse du rendu PDF** (`/imprimer/*`) | élevé | CSS d'impression isolé ; capture PDF avant/après devis + facture |
| **Régression de calcul** dans `DevisEditor` (688 l.) | élevé | Habillage visuel strict ; tests de calcul ; aucune modif de la logique de lignes/TVA |
| **Régressions mobiles** au retrait du hack `<style>` | élevé | Retrait **écran par écran**, jamais global ; le bloc n'est retiré qu'après migration responsive native de l'écran |
| **Volume** (104 pages, 82 composants, 298 alertes inline, 304 hex) | moyen | Migration par vagues (R3-A→F) ; codemods pour les remplacements mécaniques (hex → token, `const input` → `Field`) |
| **Confusion densité** (Confort/Terrain) | faible | Réglage de tokens documenté ; défaut Confort desktop / Terrain < 1024 |
| **Focus doré jugé trop juste** | faible | Contrat composite (or + liseré blanc + halo sombre) déjà figé (§ 5) ; `forced-colors` prévu |
| **Dérive vers 3 design systems** | moyen | R3-A produit **un** socle commun ; Colors/Tools = accent contextuel seulement (§ 10) |
| **Fenêtre commerciale** | planning | R3 est **découplé** du GO-Live juridique/Stripe ; seuls les écrans « A » sont sur le chemin de l'ouverture publique |

---

## 16. Accessibilité — checklist R4 (à exécuter, pas maintenant)

- [ ] **axe** (ou équivalent) sur chaque écran migré, **avant** de considérer le sous-lot fini
- [ ] **Contraste clair** : re-vérification outillée de **tous** les tokens de texte sur toutes
      les surfaces (les ratios du § 11 sont **calculés**, pas mesurés sur rendu)
- [ ] **Contraste des éléments non textuels** (bordures d'état, filet doré, anneau de focus) ≥ 3:1
- [ ] **Focus** : anneau composite visible sur blanc / bleu / navy ; `@media (forced-colors: active)`
- [ ] **Clavier** : ordre de tabulation logique ; menu, switcher, onglets, modales entièrement
      utilisables au clavier ; `skip to content`
- [ ] **Dialogs** : `role="dialog"` + `aria-modal` + **focus-trap** + fermeture Échap + retour
      du focus (5 modales ad hoc à unifier)
- [ ] **`aria-describedby`** reliant chaque message d'erreur à son champ ; `aria-invalid`
- [ ] **Erreurs** : jamais uniquement en couleur (icône + texte) ; annoncées (`aria-live`)
- [ ] **Mobile** : pas de débordement horizontal ; tableaux en cartes ; cibles ≥ 44 px
- [ ] **Target sizes** : 44 px (Confort) / 48 px (Terrain) vérifiés sur les interactifs réels
- [ ] **Réduction de mouvement** : `@media (prefers-reduced-motion)` sur les transitions
- **Mode sombre : EXCLU de R4 pré-commercialisation**, sauf nécessité découverte en cours de route.

---

## 17. Fichiers créés / modifiés par R2C

| Fichier | Action |
|---|---|
| `docs/organisation/ELSATIA_UI_V2_R2C_GEL.md` | **créé** (ce document) |
| `docs/organisation/ui-v2/r2b/elsatia-hybride.html` | **modifié** — uniquement la règle `:focus-visible` et la carte de démonstration de focus (contrat composite du § 5). Aucune autre partie touchée. |

**Aucun autre fichier.** Maquettes R2A (`ui-v2/r2a/*.html`) et rapport R2B inchangés.

---

## 18. `git status --short`

```
 D output/video/Liria_Gestion_Pro_Guide_Video_Complet.mp4      (préexistant, non stagé — hors lot)
?? docs/organisation/ELSATIA_UI_V2_R2A_DIRECTIONS.md            (lot R2A, non commité)
?? docs/organisation/ELSATIA_UI_V2_R2B_HYBRIDE.md               (lot R2B, non commité)
?? docs/organisation/ELSATIA_UI_V2_R2C_GEL.md                   (ce lot)
?? docs/organisation/ui-v2/                                     (maquettes R2A + R2B + màj focus R2C)
```

> Les fichiers R2A / R2B non commités préexistent à ce lot (ils attendent une validation de
> commit distincte). Aucun commit n'est effectué ici.

## 19. Vidéo préexistante

`output/video/Liria_Gestion_Pro_Guide_Video_Complet.mp4` — sa suppression **non stagée**
préexiste à ce lot, n'a **pas** été touchée, reste **non stagée** et **hors de tout commit**.

## 20. Confirmation — aucun fichier applicatif modifié

`git diff` sur fichiers **suivis** ne liste **que** `output/video/…mp4` (suppression
préexistante). **Aucun** fichier de `src/`, `apps/`, aucun style applicatif, aucun
`next.config`, aucun composant. **Aucune** action Supabase / migration / Vercel / Stripe /
Production / Colors / Tools. **Aucune** fusion `main`. **Aucun commit, aucun push.**
HEAD inchangé (`e65fc05…`).

## 21. Décision attendue

- **Enregistrer** ce gel comme référence UI-V2 (D1–D9, tokens V1, contrat de migration).
- **Ne pas autoriser R3** tant que le chemin critique **sécurité / MFA / Production** n'est
  pas consolidé (feu vert technique explicite requis).
- Quand le feu vert technique est donné : **R3-A** (tokens + primitives, additif, sans risque
  métier) est le point d'entrée ; il ne démarre **que** sur autorisation.
- Trancher au lancement de R3 : défaut de densité (Confort desktop / Terrain < 1024 confirmé ?),
  persistance de la préférence de densité, périmètre exact de la permission du board
  « Pilotage » (CA/marge : `voir_indicateurs_financiers` seul ou droit supérieur ?).

---

UI-V2-R2C VALIDÉ — DIRECTION VISUELLE FIGÉE — R3 EN ATTENTE DU FEU VERT TECHNIQUE
