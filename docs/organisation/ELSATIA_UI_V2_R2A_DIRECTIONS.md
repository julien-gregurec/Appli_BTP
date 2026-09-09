# ELSATIA-UI-V2-R2A — Trois directions visuelles pour Gestion Pro

Lot **UI-V2-R2A** : préparer trois directions visuelles distinctes pour permettre à Julien de
choisir la base d'ELSATIA UI-V2. **Ce lot ne modifie pas l'application.** Il produit des
maquettes HTML/CSS isolées et leur documentation. Le design system n'est **pas** figé.

Base : branche `feat/elsatia-canonical-final-r73-v1`, HEAD `e65fc05…`. Audit de référence :
`docs/organisation/ELSATIA_UI_V2_R1_AUDIT.md`. Cadrage : `docs/organisation/ELSATIA_UI_V2_REFONTE.md`.

---

## 1. Fichiers créés par ce lot

| Fichier | Rôle |
|---|---|
| `docs/organisation/ELSATIA_UI_V2_R2A_DIRECTIONS.md` | Le présent document |
| `docs/organisation/ui-v2/r2a/elsatia-sobre.html` | Maquette **Direction A — ELSATIA Sobre** (autonome, HTML/CSS, sans JS, sans ressource distante) |
| `docs/organisation/ui-v2/r2a/elsatia-chantier.html` | Maquette **Direction B — ELSATIA Chantier** |
| `docs/organisation/ui-v2/r2a/elsatia-direction.html` | Maquette **Direction C — ELSATIA Direction** |

Chaque `.html` :
- est **autonome** : s'ouvre par double-clic, **sans serveur** ni dépendance ;
- **ne charge aucune ressource distante** (polices système uniquement, aucune image, aucun `<script>`, aucun `<link>` externe) ;
- **n'importe aucun code de l'application** et **n'est connecté à aucun Supabase** ;
- porte un bandeau permanent **« MAQUETTE — aucune donnée réelle »** ;
- montre **exactement les mêmes 20 éléments** avec **les mêmes données fictives** (entreprise
  « BTP Rénov' Sud », KPI 128 400 € / 96 200 € / 32 200 € / 54 900 €, alertes, tâches,
  chantiers, devis D-2026-115…118) pour permettre une comparaison honnête ;
- se visualise à **trois largeurs** via les liens « Bureau 1440 / Tablette 1024 / Mobile 390 »
  en haut de page (ancres CSS `:target`, **aucun script**), et via le redimensionnement réel
  de la fenêtre (les maquettes utilisent des *container queries* : la mise en page suit la
  largeur du cadre, pas seulement celle de l'écran).

**Aucun fichier applicatif (`src/`, `apps/`, styles) n'a été modifié.**

### Les 20 éléments présents dans les trois maquettes

1 barre latérale · 2 en-tête principal · 3 nom de l'entreprise active · 4 sélecteur
d'entreprise · 5 sélecteur d'applications ELSATIA · 6 champ de recherche · 7 notifications ·
8 titre de page · 9 bouton principal · 10 quatre indicateurs clés · 11 bloc « Alertes
prioritaires » · 12 bloc « Tâches du jour » · 13 bloc « Chantiers en cours » · 14 tableau
métier (« Devis récents ») · 15 badges de statut (Accepté / Envoyé / Brouillon / Refusé /
En cours / En pause / À préparer) · 16 état vide · 17 champ de formulaire (nom + type de
client) · 18 bouton secondaire (« Exporter ») · 19 action dangereuse (« Supprimer le devis ») ·
20 aperçu du menu mobile.

---

## 2. Résumé des trois directions

| | **A — ELSATIA Sobre** | **B — ELSATIA Chantier** | **C — ELSATIA Direction** |
|---|---|---|---|
| **Intention** | Logiciel pro premium, discret, reposant | Poste de travail opérationnel, « aujourd'hui » d'abord | Outil de pilotage institutionnel, chiffres et hiérarchie |
| **Fond de travail** | Gris très léger `#f6f7f9` | Gris moyen `#e9edf1`, contraste renforcé | Gris neutre `#f4f5f7` |
| **Navigation** | Bleu nuit `#0d1b2a`, item actif = pastille blanche | Bleu nuit `#0b1a2b`, item actif blanc, cibles 44 px | Bleu nuit `#0c1a2b` compacte, item actif = filet doré |
| **Bleu d'action** | `#2b62f0` (moderne, vif mais maîtrisé) | `#1552d6` (fort, très lisible) | `#22417a` (profond, restreint) |
| **Doré ELSATIA** | Accent rare (pastille nav, dot du sélecteur d'apps) | Accent rare | **Filet** sous le titre + bord d'onglet actif ; jamais en aplat |
| **Densité** | Confortable | Info-first : bandeau « Aujourd'hui » en tête | Dense mais hiérarchisée : board de pilotage en tête |
| **Bordures / ombres** | Peu de bordures 1 px, ombres très légères | Bordures 2 px, contraste marqué, peu d'ombres | Filets fins `#edeff2`, ombre nette discrète |
| **Rayons** | 6 / 10 / 14 px | 8 / 10 / 14 px | 5 / 6 / 8 px (anguleux) |
| **Typo** | Sans-serif système, `h1` 22/650 | Sans-serif système, plus grasse, `h1` 24/750 | Forte hiérarchie : eyebrow + `h1` 28/750 + KPI 30/750 ; titres de listes en petites capitales espacées |
| **Statuts** | Couleur + pastille + libellé | Couleur + **forme** (rond/losange/carré) + libellé, majuscules | Couleur + pastille + libellé, filet latéral coloré sur les lignes |
| **Cible d'usage** | Tous profils, image de marque | Conducteurs, chefs de chantier, terrain, tablette | Gérants, direction, services administratifs |
| **Risque principal** | Peut paraître « trop calme » pour un usage très opérationnel | Contraste fort à doser pour ne pas fatiguer en usage bureau prolongé | Densité et typo à contenir pour rester rapide sur le terrain |

---

## 3. Mini-chartes exploratoires

> Ratios de contraste **calculés** (formule WCAG 2.x, sRGB) — non mesurés sur capture rendue.
> Méthode : `L = 0.2126·R + 0.7152·G + 0.0722·B` (canaux linéarisés) ; `CR = (L₁+0.05)/(L₂+0.05)`.
> Seuils : **AA texte normal ≥ 4.5:1**, **AA grand texte / éléments graphiques ≥ 3:1**.

### 3.A — ELSATIA Sobre

**Palette**

| Rôle | Token | Valeur |
|---|---|---|
| Fond de travail | `--bg` | `#f6f7f9` |
| Surface (panneaux) | `--surface` | `#ffffff` |
| Surface interne (en-têtes de tableau) | `--surface-2` | `#f2f4f7` |
| Navigation | `--nav-bg` / `--nav-bg-2` | `#0d1b2a` / `#132539` |
| **Action principale** | `--action` / `--action-strong` | **`#2b62f0`** / `#1f49c0` |
| Action — fond léger | `--action-weak` | `#eaf0fe` |
| Doré ELSATIA (accent rare) | `--gold` | `#b8862b` |
| Texte principal | `--text` | `#1f2328` |
| Texte secondaire | `--text-muted` | `#5b6470` |
| Texte léger (captions) | `--text-faint` | `#79808c` → **à durcir en `#6b7280`** (cf. accessibilité) |
| Texte sur navy | `--on-nav` / `--on-nav-muted` | `#eef2f7` / `#a9b6c6` |
| Bordure | `--border` / `--border-strong` | `#e4e7ec` / `#d0d5dd` |
| **Statut succès** | `--ok` / `--ok-bg` | `#1f7a45` / `#e7f4ec` |
| **Statut information** | `--info` / `--info-bg` | `#1554b8` / `#e8f0fb` |
| **Statut attention** | `--warn` / `--warn-bg` | `#8a5a12` / `#fbf0dd` |
| **Statut erreur** | `--err` / `--err-bg` | `#b3261e` / `#fbe9e7` |
| **Statut neutre** | `--neutral` / `--neutral-bg` | `#51606f` / `#eceef1` |

**Typographie** : pile système (`-apple-system, "Segoe UI", Roboto, Helvetica, Arial`).
**Échelle titres** : `h1` 22 px / 650 · titres de carte 14 px / 650 · corps 13,5–14 px ·
caption 11,5–12 px. Chiffres KPI en fonte monospace tabulaire, 24 px / 700.
**Espacement** : base 4 px (4/8/12/16/24/32/48). Padding de page 22 px, responsif.
**Rayons** : `sm 6` · `md 10` · `lg 14`. **Ombres** : `0 1px 2px rgba(16,24,40,.06)` (niveau 1),
`0 4px 12px rgba(16,24,40,.08)` (niveau 2).

**Boutons** — primaire : fond `--action`, texte blanc, rayon 6, padding 9×16, `focus-visible`
anneau `#9db8fb` 3 px ; secondaire : fond blanc + bordure `--border-strong` ; danger : texte
`--err`, bordure `#e6b4b0`, fond transparent (hover `--err-bg`).
**Champs** : fond blanc, bordure `--border-strong` 1 px, rayon 6, padding 9×11 ; focus =
bordure `--action` + anneau ; libellé 12 px `--text-muted`, requis `*` en `--err`, aide 11,5 px.
**Tableaux** : en-tête `--surface-2`, filets `--border` 1 px, lignes 12 px de hauteur interne,
survol `--surface-2`, colonnes numériques alignées à droite en chiffres tabulaires.
**Cartes** : blanc, bordure `--border` 1 px, rayon 10, ombre niveau 1, en-tête avec compteur.
**Badges** : pilule, pastille de couleur + libellé ; `erreur` = pastille ronde (forme
distincte) ; fond teinté clair + texte de la même famille.
**Comportement mobile** : sidebar masquée < 1080 (container query), en-tête mobile + tiroir ;
KPI 2×2 ; formulaire 1 colonne ; boutons pleine largeur ; recherche repoussée en pleine
largeur sous l'en-tête.

**Avantages** : lecture reposante, image « SaaS pro » crédible ; peu de bruit visuel ;
migration la plus simple depuis l'existant (structure proche, moins de nouveaux patrons).
**Inconvénients** : le tableau de bord reste assez calme — l'urgence (impayé, CT dépassé)
peut manquer d'un premier niveau d'accroche visuelle ; l'or discret est presque invisible.
**Risques de lisibilité** : `--text-faint #79808c` à ~3,9:1 sur blanc — sous le seuil AA
texte normal ; à réserver aux mentions ≤ 12 px ou à durcir (`#6b7280` ≈ 4,8:1). Le bleu
d'action `#2b62f0` en texte de lien sur blanc est à ~5,1:1 (OK).
**Déclinaison Colors / Tools** : **très facile**. Fond clair + surface blanche + nav navy est
un socle neutre ; Colors remplace l'accent par ses teintes de peinture sans toucher la
structure ; Tools garde le même socle en version mobile-first (mêmes tokens, densité réduite).

### 3.B — ELSATIA Chantier

**Palette**

| Rôle | Token | Valeur |
|---|---|---|
| Fond de travail | `--bg` | `#e9edf1` |
| Surface | `--surface` | `#ffffff` |
| Surface interne | `--surface-2` | `#eef2f6` |
| Navigation | `--nav-bg` | `#0b1a2b` |
| **Bandeau « Aujourd'hui »** | `--today-bg` | `#0e2137` |
| **Action principale** | `--action` / `--action-strong` | **`#1552d6`** / `#0f3fac` |
| Action — fond léger | `--action-weak` | `#e3ecfd` |
| Doré (accent rare) | `--gold` | `#a9761f` |
| Texte principal | `--text` | `#151a1f` |
| Texte secondaire | `--text-muted` | `#4a5560` |
| Texte léger | `--text-faint` | `#5f6b78` |
| Texte sur navy | `--on-nav` / `--on-nav-muted` | `#f2f6fb` / `#b6c3d2` |
| Bordure | `--border` / `--border-strong` | `#d3d9e0` / `#b9c2cc` |
| **Statut succès** | `--ok` / `--ok-bg` | `#136b3a` / `#dcf0e3` |
| **Statut information** | `--info` / `--info-bg` | `#0f4bab` / `#dfeafb` |
| **Statut attention** | `--warn` / `--warn-bg` | `#7c4a06` / `#fbe9cf` |
| **Statut erreur** | `--err` / `--err-bg` | `#a41c15` / `#fbe2df` |
| **Statut neutre** | `--neutral` / `--neutral-bg` | `#43505d` / `#e3e7ec` |

**Typographie** : pile système, plus grasse. `h1` 24 px / 750 · titres de carte 14,5 px / 750 ·
corps 14–14,5 px (plus grand qu'en A) · KPI 26 px / 800.
**Espacement** : base 4 px. **Cible tactile `--tap` = 48 px** appliquée aux boutons, champs,
liens de nav, boutons d'icône.
**Rayons** : `sm 8` · `md 10` · `lg 14`. **Ombres** : discrètes ; le contraste vient des
bordures 2 px et des aplats, pas des ombres.
**Boutons** : primaire fond `--action`, **min-height 48**, padding 13×20, bordure 2 px
transparente, `focus-visible` anneau **jaune `#ffd23f`** 3 px (visible sur fond sombre et
clair) ; secondaire blanc + bordure 2 px ; danger fond blanc + bordure `#d98a83`.
**Champs** : bordure 2 px `--border-strong`, min-height 48, fonte 15 px, focus bordure
`--action` + anneau jaune.
**Tableaux** : en-têtes **en petites capitales**, filets 2 px, cellules 14 px de padding,
lignes hautes (≥ 48 px), montants en gras tabulaire.
**Cartes** : bordure 2 px, en-tête avec filet 2 px.
**Badges** : **rectangulaires** (rayon 6), texte en majuscules ; forme de la pastille
**différenciée par statut** : succès/info = carré, attention = **losange** (rotation 45°),
erreur = **rond**. Objectif : reconnaissable sans la couleur.
**Bandeau « Aujourd'hui »** : bloc bleu nuit pleine largeur en tête, deux colonnes blanches
« Alertes prioritaires » / « Tâches du jour », glyphes colorés `!` `▲` `→`, étiquettes
majuscules. C'est la signature de la direction.
**Comportement mobile** : sidebar masquée < 1080 ; le bandeau « Aujourd'hui » devient une
bande compacte sous l'en-tête mobile (résumé des 2 alertes les plus critiques) ; KPI 2×2 ;
tout en 1 colonne ; boutons `flex:1`.

**Avantages** : l'information du jour est **impossible à manquer** ; excellente lisibilité de
loin et en extérieur (contraste, tailles) ; ergonomie tactile réelle (48 px partout) ; les
statuts restent lisibles pour un daltonien (forme + libellé).
**Inconvénients** : le contraste fort et les bordures 2 px peuvent sembler « lourds » en usage
bureau prolongé (services administratifs) ; le bandeau sombre en tête réduit un peu la place
pour le reste au-dessus de la ligne de flottaison sur petit écran.
**Risques de lisibilité** : sur le bandeau `--today-bg`, le texte secondaire doit rester à
`#c9d8e6` ou plus clair (le gris `--on-nav-muted #b6c3d2` sur `#0e2137` ≈ 5,6:1, OK ; ne pas
descendre en dessous). Le jaune de focus `#ffd23f` sur fond blanc n'a qu'un rôle d'anneau
(non porteur de texte) — acceptable.
**Déclinaison Colors / Tools** : **bonne**. Tools **est déjà** mobile-first et opérationnel :
cette direction lui va naturellement (grandes cibles, statuts clairs, contraste). Colors peut
garder le socle et remplacer les statuts métier par des puces de teinte — mais devra veiller
à ne pas cumuler contraste fort + nombreuses couleurs de peinture (risque de surcharge).

### 3.C — ELSATIA Direction

**Palette**

| Rôle | Token | Valeur |
|---|---|---|
| Fond de travail | `--bg` | `#f4f5f7` |
| Surface | `--surface` | `#ffffff` |
| Surface interne | `--surface-2` | `#f7f8fa` |
| Navigation | `--nav-bg` / `--nav-bg-2` | `#0c1a2b` / `#12283f` |
| **Action principale** | `--action` / `--action-strong` | **`#22417a`** / `#182f5c` |
| Action — fond léger | `--action-weak` | `#e9eef6` |
| **Doré ELSATIA (filet)** | `--gold` | `#9c7422` |
| Texte principal | `--text` | `#1a1f27` |
| Texte secondaire | `--text-muted` | `#565f6b` |
| Texte léger | `--text-faint` | `#727b87` → **à durcir en `#6b7580`** (cf. accessibilité) |
| Filet interne | `--hair` | `#edeff2` |
| Texte sur navy | `--on-nav` / `--on-nav-muted` | `#eef2f7` / `#9fb0c2` |
| Bordure | `--border` / `--border-strong` | `#e3e6eb` / `#cfd4dc` |
| **Statut succès** | `--ok` / `--ok-bg` | `#1c6b3f` / `#e6f2ea` |
| **Statut information** | `--info` / `--info-bg` | `#1a4f9c` / `#e7eefa` |
| **Statut attention** | `--warn` / `--warn-bg` | `#7a5312` / `#f7ecd7` |
| **Statut erreur** | `--err` / `--err-bg` | `#9f231c` / `#f8e5e3` |
| **Statut neutre** | `--neutral` / `--neutral-bg` | `#4c5663` / `#eceef1` |

**Typographie** : pile système pour l'UI ; **forte hiérarchie** : *eyebrow* (« PILOTAGE »)
11 px / 700 / interlettrage 0.18em → `h1` **28 px / 750** → titres de listes 13 px / 700 en
**petites capitales espacées** → corps 13,5–14 px → caption 11,5 px. **KPI 30 px / 750**,
monospace tabulaire, deltas `▲ 9,4 %` colorés.
**Espacement** : base 4 px, sections espacées de 36 px (respiration).
**Rayons** : `sm 5` · `md 6` · `lg 8` — plus anguleux, registre « document officiel ».
**Ombres** : `0 1px 2px rgba(20,28,44,.05)` ; l'ordre vient des filets, pas des ombres.
**Filet doré** : 2 px sous le titre de page + `inset 3px 0 0 --gold` sur l'onglet/menu actif.
**Boutons** : primaire fond `--action` (profond), padding 9×18 ; secondaire blanc + bordure ;
danger texte `--err` + bordure `#d3a4a0` ; `focus-visible` anneau `#8fa9d6` 3 px.
**Champs** : bordure 1 px `--border-strong`, rayon 5, focus bordure `--action` + anneau.
**Tableaux** : **sans zébrage**, filets fins `--hair`, en-têtes en petites capitales espacées,
**ligne de total** (`tfoot`) avec filet 2 px, montants en chiffres tabulaires alignés à droite.
**Cartes** : blanc, rayon 8, filet 1 px, ombre niveau 1 ; en-têtes en petites capitales.
**Board de pilotage** : bloc en tête regroupant les 4 KPI (séparés par des filets verticaux,
grands chiffres + delta) **et** une mini-tendance 6 mois **dessinée en CSS pur** (barres navy
+ or, légende). C'est la signature de la direction.
**Badges** : pilule anguleuse (rayon 3), pastille + libellé ; ligne de liste avec **filet
latéral coloré** (succès/info/attention/erreur) en plus du badge.
**Comportement mobile** : sidebar masquée < 1080 ; le board devient 2×2 KPI + tendance
condensée ; en-tête mobile affiche **2 chiffres clés** (Facturé / Reste à encaisser) dans la
barre sombre ; listes en 1 colonne, filets conservés.

**Avantages** : **le tableau de bord de pilotage est le plus abouti** des trois — chiffres
immédiatement lisibles, tendance visible sans page dédiée ; registre haut de gamme cohérent
avec une cible dirigeants / administratif ; excellente hiérarchie de lecture.
**Inconvénients** : la richesse typographique et la densité demandent de la rigueur à la
déclinaison (chaque écran doit respecter l'échelle) ; risque de paraître « corporate » et
moins direct pour un chef de chantier pressé ; c'est la migration la plus exigeante (nombreux
nouveaux patrons : eyebrow, petites capitales, tfoot, board).
**Risques de lisibilité** : `--text-faint #727b87` ≈ 4,3:1 sur blanc — sous AA texte normal ;
à durcir (`#6b7580` ≈ 4,7:1) ou réserver au ≤ 12 px. Les petites capitales espacées ne
doivent pas descendre sous 11 px. Le delta `▲` doit être doublé d'un mot (« en hausse » /
« en retard ») pour ne pas dépendre de la flèche + couleur seules.
**Déclinaison Colors / Tools** : **moyenne**. Le socle (navy + clair) se décline, mais
l'identité « board de pilotage + forte typo » a peu de sens pour Tools (calculette mobile,
parcours Saisie→Résultat) : Tools reprendrait surtout les tokens et les composants de base,
pas la mise en page dashboard. Colors profiterait bien du board (inventaire, valeurs de stock)
mais devra assouplir la densité.

---

## 4. Contrôles de contraste (calculés)

### Combinaisons de texte principales

| Paire | A — Sobre | B — Chantier | C — Direction | Seuil |
|---|---|---|---|---|
| Texte principal sur surface blanche | `#1f2328` → **15,8:1** | `#151a1f` → **17,5:1** | `#1a1f27` → **16,5:1** | ≥ 4,5 ✅ |
| Texte secondaire sur blanc | `#5b6470` → **6,0:1** | `#4a5560` → **7,6:1** | `#565f6b` → **6,5:1** | ≥ 4,5 ✅ |
| Texte léger / caption sur blanc | `#79808c` → **3,9:1 ⚠️** (durcir `#6b7280` → 4,8:1) | `#5f6b78` → **5,4:1** ✅ | `#727b87` → **4,3:1 ⚠️** (durcir `#6b7580` → 4,7:1) | ≥ 4,5 (normal) |
| Texte de nav sur bleu nuit | `#eef2f7` → **≈13:1** ✅ | `#f2f6fb` → **≈14:1** ✅ | `#eef2f7` → **≈13:1** ✅ | ≥ 4,5 ✅ |
| Texte de nav secondaire sur bleu nuit | `#a9b6c6` → **≈4,9:1** ✅ | `#b6c3d2` → **≈5,6:1** ✅ | `#9fb0c2` → **≈4,3:1 ⚠️** (à surveiller — réserver aux libellés de groupe) | ≥ 4,5 |

### Contraste des actions

| Élément | A | B | C | Seuil |
|---|---|---|---|---|
| Texte blanc sur bouton primaire | `#2b62f0` → **5,1:1** ✅ | `#1552d6` → **6,6:1** ✅ | `#22417a` → **10,0:1** ✅ | ≥ 4,5 ✅ |
| Lien / texte d'action sur blanc | `#2b62f0` → **5,1:1** ✅ | `#1552d6` → **6,6:1** ✅ | `#22417a` → **10,0:1** ✅ | ≥ 4,5 ✅ |
| Anneau de focus visible | `#9db8fb` 3 px | `#ffd23f` 3 px (jaune, très visible) | `#8fa9d6` 3 px | ≥ 3:1 vs adjacent ✅ |

### Statuts — texte de statut sur son fond teinté (Direction A, représentatif ; B et C sont ≥ ces valeurs car couleurs plus sombres/saturées)

| Statut | Texte / fond | Ratio | Seuil |
|---|---|---|---|
| Succès | `#1f7a45` / `#e7f4ec` | **5,4:1** ✅ | ≥ 4,5 |
| Information | `#1554b8` / `#e8f0fb` | **7,1:1** ✅ | ≥ 4,5 |
| Attention | `#8a5a12` / `#fbf0dd` | **5,9:1** ✅ | ≥ 4,5 |
| Erreur | `#b3261e` / `#fbe9e7` | **6,8:1** ✅ | ≥ 4,5 |
| Neutre | `#51606f` / `#eceef1` | **6,5:1** ✅ | ≥ 4,5 |

### Autres contrôles WCAG AA visés

| Point | A | B | C |
|---|---|---|---|
| **Focus clavier visible** | anneau 3 px sur boutons, liens, champs (`:focus-visible`) | idem, anneau jaune sur fond sombre et clair | idem |
| **État non porté par la couleur seule** | badge = pastille **+ libellé** ; erreur = pastille **ronde** | badge = **forme** (carré/losange/rond) **+ libellé majuscule** ; alertes = glyphe `!`/`▲`/`→` | badge + **filet latéral** + libellé ; delta = flèche **+** (recommandation : + mot) |
| **Taille minimale de texte** | corps 13,5 px ; jamais < 11 px | corps 14 px ; jamais < 11 px | corps 13,5 px ; petites capitales ≥ 11 px |
| **Zones tactiles** | ≥ 42 px en mobile (recommandé : passer à 44) | **48 px systématiques** | ≥ 40 px (recommandé : 44 en mobile) |
| **Lisibilité en lumière forte** | correcte (contraste texte ~15:1) ; l'or discret peut disparaître | **la meilleure** (contraste renforcé, grandes tailles) | bonne (chiffres très contrastés) ; les filets fins peuvent s'effacer |
| **Absence de gris trop clair** | ⚠️ `--text-faint` à durcir | conforme | ⚠️ `--text-faint` à durcir |

> **Rappel de limite** : ces ratios sont **calculés à partir des valeurs de tokens**, pas
> relevés sur une capture rendue. Ils devront être revérifiés avec un outil (axe / contrast
> checker) sur les composants réels en R4, clair **et** sombre.

---

## 5. Captures produites

**Aucune capture PNG n'a été enregistrée comme fichier du dépôt.** L'outil de capture
disponible renvoie des images **incrustées dans la réponse** (mises à l'échelle du volet), pas
des fichiers `.png` autonomes, et le volet rend les fichiers locaux comme des instantanés
statiques (parfois dupliqués). Créer un dossier `captures/` avec des PNG dans ces conditions
donnerait des images de qualité incertaine ; je préfère **ne pas fabriquer de validation
visuelle**.

**Ce qui a réellement été vérifié** (rendu dans le navigateur intégré, aux largeurs 1440 et
390) :

- **Direction A** — bureau 1440 : coquille complète (nav navy, en-tête + recherche +
  notifications, titre + boutons, 4 KPI, Alertes + Tâches en 2 colonnes, tableau Devis récents
  avec badges, Chantiers en cours, formulaire, état vide) rendue correctement ; item de nav
  actif blanc, bouton primaire bleu, statuts colorés lisibles. Mobile 390 : sidebar masquée,
  colonne unique, KPI 2×2, boutons pleine largeur, aperçu du menu mobile en pied.
- **Direction B** — bureau 1440 : bandeau « Aujourd'hui » bleu nuit en tête (Alertes + Tâches),
  KPI à bordures marquées, blocs Chantiers/Formulaire, tableau ; l'accroche « du jour » est
  nettement plus forte qu'en A.
- **Direction C** — rendu vérifié : eyebrow « PILOTAGE », `h1` 28 px, KPI 30 px avec deltas
  verts / rouge, filet doré sous le titre, mini-tendance 6 mois en barres CSS (navy + or),
  tableau à filets fins avec ligne de total.

**Pour obtenir des captures fiables** : ouvrir chaque `.html` dans un navigateur, utiliser les
liens « Bureau / Tablette / Mobile » (ou les DevTools responsive), et capturer manuellement —
c'est l'une des vérifications confiées à Julien (§ 8).

---

## 6. Comparaison synthétique

| Critère (pondération usage BTP) | A — Sobre | B — Chantier | C — Direction |
|---|:--:|:--:|:--:|
| Lisibilité générale | ●●●○ | ●●●● | ●●●● |
| Urgence / info du jour visible immédiatement | ●●○○ | ●●●● | ●●●○ |
| Efficacité terrain (chef de chantier, ouvrier) | ●●●○ | ●●●● | ●●○○ |
| Qualité du tableau de bord de pilotage (gérant) | ●●○○ | ●●○○ | ●●●● |
| Ergonomie tactile / tablette | ●●○○ | ●●●● | ●●○○ |
| Sobriété / image de marque premium | ●●●● | ●●●○ | ●●●● |
| Accessibilité AA (après durcissement des gris) | ●●●○ | ●●●● | ●●●○ |
| Facilité de migration depuis l'existant | ●●●● | ●●●○ | ●●○○ |
| Déclinaison sur Colors | ●●●● | ●●●○ | ●●●○ |
| Déclinaison sur Tools | ●●●● | ●●●● | ●●○○ |
| Risque de fatigue en usage bureau prolongé | faible | moyen | faible |
| Risque de paraître « pas assez pro pour le BTP » | moyen | faible | faible |

---

## 7. Recommandation

### Proposition principale recommandée : **B — ELSATIA Chantier**, avec des emprunts à C et A.

**Pourquoi B, en fonction des usages BTP** (et non d'une préférence esthétique) :

1. **Le public dominant au quotidien est opérationnel** — conducteurs de travaux, chefs de
   chantier, équipes administratives, ouvriers (cf. matrice des rôles, R1 § 4). Pour eux,
   « qu'est-ce qui brûle aujourd'hui ? » prime sur « quelle est ma tendance sur 6 mois ? ».
   Le **bandeau « Aujourd'hui »** répond exactement au problème P0-3 de l'audit (priorité
   enterrée en 6ᵉ position).
2. **Conditions d'usage réelles** : lumière forte, écran de chantier, tablette, gants,
   consultation rapide. Le contraste renforcé, les tailles de texte plus grandes et les
   **cibles tactiles de 48 px** sont des réponses concrètes, pas cosmétiques.
3. **Accessibilité** : c'est la direction qui coche le plus de cases AA sans retouche
   (contrastes ≥ 5,4:1 partout, statuts différenciés par **forme + libellé**, focus jaune
   très visible). Les daltoniens et la lecture en plein soleil sont couverts.
4. **Déclinaison** : elle sert **Tools** (déjà mobile-first) sans effort, et reste compatible
   Colors.
5. **Risque maîtrisable** : le seul vrai reproche possible — « lourd en usage bureau
   prolongé » — se corrige en réglages (épaisseur de bordure 1,5 px au lieu de 2, densité un
   cran plus serrée pour les profils administratifs), pas en changement de direction.

### Éléments à reprendre des deux autres

**De C — Direction (à intégrer dans B) :**
- le **board de pilotage** (4 KPI + mini-tendance 6 mois en CSS) comme **vue secondaire** ou
  section repliable du tableau de bord, réservée aux profils avec `voir_indicateurs_financiers`
  et surtout aux gérants ; il ne doit pas passer devant le bandeau « Aujourd'hui » mais il est
  clairement le meilleur des trois pour les dirigeants ;
- la **hiérarchie typographique forte** (eyebrow + `h1` marqué + titres de section en petites
  capitales) — B gagnerait en clarté de structure en l'adoptant, en version un peu moins
  contrastée ;
- la **ligne de total** (`tfoot`) sur les tableaux financiers ;
- le **filet doré** discret sous le titre de page comme signal de marque (mieux que l'or
  quasi-invisible de A et B).

**De A — Sobre (à intégrer dans B) :**
- l'**épaisseur de bordure réduite** et les **ombres légères** en option « densité confort »
  pour les écrans très longs (paramètres, matrices de permissions) — éviter l'effet « tout en
  2 px » sur les pages d'administration ;
- le **rayon 10 px** des cartes (B à 10 aussi — OK) et la palette de gris plus douce pour les
  zones internes non critiques ;
- le **fond de travail plus clair** (`#f2f4f7` plutôt que `#e9edf1`) sur les pages de
  formulaire, pour reposer l'œil hors du tableau de bord.

### Synthèse pour R2B

Si B est retenue : R2B produit **un** design system « ELSATIA Chantier » qui intègre le board
de pilotage et la hiérarchie typo de C, avec un mode « densité confort » inspiré de A pour les
écrans d'administration. Les tokens de statut (succès/info/attention/erreur/neutre) et la
règle « bleu = action, forme + libellé pour les statuts » sont communs aux trois et peuvent
être figés dès R2B.

**La décision finale revient à Julien.** Cette recommandation n'engage pas R2B/R3 : aucun
lot suivant ne démarre sans sa validation.

---

## 8. Vérifications à réaliser par Julien (navigateur)

1. Ouvrir les **trois** `.html` et comparer, aux **trois largeurs** (liens en haut de page +
   test de la fenêtre réelle) : bureau, tablette 1024, mobile 390.
2. Jugement d'usage : sur **chaque** direction, « en 3 secondes, qu'est-ce que je dois faire
   aujourd'hui ? » — B doit gagner ; confirmer.
3. Tester la **lisibilité en conditions BTP** : écran incliné, lumière forte, à 60–80 cm.
4. Vérifier que la **frontière « entreprise cliente » ↔ « Console ELSATIA »** est claire dans
   les trois (bloc séparé « Administration plateforme » dans la nav).
5. Vérifier que le **sélecteur d'applications** est visible **sans dominer** (il est sous
   l'encart entreprise dans les trois).
6. Donner un avis sur le **doré** : trop discret (A/B) ? Le filet de C est-il le bon dosage ?
7. Confirmer le choix de **fonte** : les maquettes utilisent la pile système ; décider si une
   webfont (embarquée, pas distante) est souhaitée pour l'identité.
8. Trancher la question du **mode sombre** (supporté dès le design system, ou reporté).
9. Indiquer les **emprunts** validés / refusés (§ 7).
10. Produire, si besoin, les **captures PNG** de référence pour le dossier UI-V2.

---

## 9. Limites

- **Analyse et maquettes statiques.** Les `.html` sont des démonstrations de direction, pas
  des composants finaux ni le design system. Les icônes de navigation sont des blocs neutres
  (placeholders) : le set d'icônes réel est un sujet de R2B/R4.
- **Contrastes calculés**, pas mesurés sur rendu (§ 4). À revalider outillé en R4, clair et
  sombre.
- **Aucune capture PNG committée** (§ 5) — vérification confiée à Julien.
- Le rendu exact des **container queries** aux trois largeurs a été vérifié par
  redimensionnement de fenêtre ; le volet de prévisualisation local rend parfois des
  instantanés dupliqués (artefact du volet, pas des fichiers).
- La déclinaison **Colors / Tools** est estimée par principe (leurs interfaces réelles n'ont
  pas été auditées dans ce lot) ; elle reste soumise à R7/R8.
- Le mode sombre n'est **pas** couvert par ces maquettes.

---

## Contrôles finaux du lot R2A

- **Fichiers créés** : `docs/organisation/ELSATIA_UI_V2_R2A_DIRECTIONS.md` + les trois `.html`
  de `docs/organisation/ui-v2/r2a/`. **Rien d'autre.**
- **Aucun fichier applicatif modifié** (`src/`, `apps/`, styles, config) — vérifié `git status`.
- **Aucune** action Supabase / migration / Vercel / Stripe / Production. **Aucune** fusion
  dans `main`. **Aucun** commit. **Aucun** push.
- `output/video/Liria_Gestion_Pro_Guide_Video_Complet.mp4` : suppression préexistante **non
  stagée**, non touchée, **hors de tout commit**.
- **R2B et R3 ne sont pas commencés** ; ils attendent la validation de Julien.
