# ELSATIA-UI-V2-R2B — Direction hybride finale

Lot **UI-V2-R2B**. Décision produit de Julien : la direction retenue est **B — ELSATIA
Chantier**, sous forme **hybride premium**, avec emprunts obligatoires à **C** (board dirigeant,
hiérarchie typo, totaux, filet doré, sensation premium sur les écrans de direction) et à **A**
(fond plus doux, gris confortables, ombres légères, bordures fines desktop, densité confort).

**R2B reste une maquette.** Aucun fichier applicatif n'a été modifié. R3 n'est pas démarré.

Base : branche `feat/elsatia-canonical-final-r73-v1`, HEAD `e65fc05…`.
Références : `ELSATIA_UI_V2_R1_AUDIT.md`, `ELSATIA_UI_V2_REFONTE.md`, `ELSATIA_UI_V2_R2A_DIRECTIONS.md`.

---

## 1. Fichiers créés

| Fichier | Rôle |
|---|---|
| `docs/organisation/ELSATIA_UI_V2_R2B_HYBRIDE.md` | Le présent document |
| `docs/organisation/ui-v2/r2b/elsatia-hybride.html` | **Maquette de la direction hybride finale** — autonome (HTML/CSS, **aucun script**, aucune ressource distante, aucun lien Supabase, bandeau permanent « MAQUETTE — aucune donnée réelle »). Deux bascules par ancres CSS : **largeur** (Bureau 1440 / Tablette 1024 / Mobile 390) et **densité** (Confort / Terrain). |

**Préservés, non réécrits** : `docs/organisation/ui-v2/r2a/elsatia-sobre.html`,
`…/elsatia-chantier.html`, `…/elsatia-direction.html`.

Données fictives identiques à R2A (entreprise « BTP Rénov' Sud », alertes F-2026-041 /
AB-482-CD / Vis inox 5×60, tâches, chantiers école Jean-Moulin / pavillon Lefèvre / Les
Tilleuls, devis D-2026-115…118) + un KPI supplémentaire pour le board (`CA 142 800 €`,
`Marge chantiers 21,4 %`).

### Écrans / éléments représentés dans la maquette

1 tableau de bord · 2 bandeau **« Aujourd'hui »** (alertes + tâches) · 3 tâches du jour avec
actions · 4 **chantiers en cours** · 5 **tableau métier « Devis récents » + ligne de total** ·
6 **formulaire** (nom + type + e-mail en **erreur explicite** + téléphone) · 7 **navigation**
bleu nuit compacte (logo, entreprise active, sélecteur d'entreprise, modules groupés, compte
utilisateur) · 8 **switcher « Applications ELSATIA »** (Gestion Pro *actif* / Colors / Tools) ·
9 **board « Pilotage »** dirigeant (4 KPI + évolution + tendance 6 mois) marqué *visible si
permission `voir_indicateurs_financiers`* · + état vide · + action dangereuse · + démo de
**focus** sur 3 fonds · + **aperçu mobile 390** (bandeau Aujourd'hui, actions rapides,
cartes chantier, tiroir de navigation).

---

## 2. Direction finale — synthèse

> **ELSATIA = BTP professionnel + outil terrain efficace + SaaS premium + pilotage dirigeant
> sérieux.**

- **Structure forte de B** : le bandeau **« Aujourd'hui »** ouvre la zone de travail. En
  quelques secondes : *« qu'est-ce que je dois traiter aujourd'hui ? »* — alertes à gauche,
  tâches à droite, chacune avec une action directe (Relancer / Ouvrir / Valider).
- **Board « Pilotage » de C**, mais **non dominant** : bloc séparé, sous « Aujourd'hui »,
  explicitement conditionné à la permission `voir_indicateurs_financiers` ; l'utilisateur
  terrain ne le voit pas.
- **Peau premium de C+A** : hiérarchie typographique nette (eyebrow + `h1` 26 px + titres de
  section 15 px), **filet doré ELSATIA** sous le titre et sur l'état actif de la navigation,
  **totaux de tableau** ; surfaces douces, bordures 1 px sur desktop, ombres très légères,
  gris de texte tous ≥ 4,5:1 (les gris faibles de R2A sont corrigés).
- **Deux densités** conceptuelles : **Confort** (administratif / desktop — bordures 1 px,
  lignes 44 px) et **Terrain** (touch / tablette — bordures 1,5 px, cibles 48 px, lignes
  52 px). Même identité, réglage d'échelle.

---

## 3. Ce qui vient de B (conservé)

- **Bandeau « Aujourd'hui »** en tête de zone de travail (alertes + tâches, très visible,
  fond bleu nuit `#0d2138`).
- **Statuts = couleur + forme + libellé** (jamais la couleur seule) : `Urgent` (rond rouge),
  `En attente` (losange orange), `Validé` (carré vert), `À relancer` (triangle bleu),
  `Brouillon` (carré neutre atténué). Libellés courts en capitales.
- **Cibles tactiles ≥ 44 px** (48 px en densité Terrain) : boutons, liens de navigation,
  champs, boutons d'icône, entrées du switcher, boutons d'action des tâches.
- **Actions à portée** : chaque ligne de tâche porte son bouton (Relancer / Ouvrir / Valider).
- **Navigation bleu nuit** ELSATIA ; item actif contrasté.
- **Anneau de focus jaune/doré** très visible (voir § 14).
- **Comportement mobile réellement pensé** : Aujourd'hui → actions rapides → tâches →
  chantiers → navigation ; tableau → cartes ; KPI direction repoussés et en carrousel.

## 4. Ce qui vient de C (repris)

- **Board « Pilotage »** : 4 KPI (CA, Facturé, Encaissé, Marge chantiers), chaque KPI avec
  **valeur + évolution en toutes lettres** (« ▲ 9,4 % · en hausse », « ▼ 1,3 pt · en
  baisse ») + une **micro-tendance** ; sous les KPI, une **tendance 6 mois** en barres CSS
  pur (Devis émis / Facturé), avec légende.
- **Hiérarchie typographique** : eyebrow discret (11 px, interlettré) → `h1` 26 px / 750 →
  titres de section 15 px / 750 → corps 13,5 px → mentions 11,5 px. Chiffres en fonte
  monospace tabulaire.
- **Lignes de total** dans les tableaux (`tfoot`, filet 2 px, « Total période 97 600 € »).
- **Filet doré ELSATIA** : 2 px sous le titre de page + `inset 3px 0 0` doré sur l'entrée de
  navigation active. **Jamais** en aplat, jamais en fond de bouton.
- **Sensation premium/institutionnelle** sur les écrans de direction (board + typo + filet).

## 5. Ce qui vient de A (repris)

- **Fond de travail plus doux** : `#f4f6f8` (au lieu du `#e9edf1` plus dur de B) ; zones de
  formulaire encore plus claires (`#f7f9fb`).
- **Gris de texte confortables** : `--text-muted #4c5560` (~7,4:1), `--text-soft #5f6875`
  (~5,9:1) — **aucun** token de texte sous 4,5:1 (contrairement à A et C de R2A).
- **Ombres très légères** (`0 1px 2px rgba(15,23,42,.05)`), **bordures 1 px** sur desktop
  (1,5 px seulement en densité Terrain) — l'ordre vient des filets et du fond, pas de cadres
  épais.
- **Rayons 6 / 9 / 13 px** (entre l'anguleux de C et l'arrondi de B) : registre logiciel
  pro, ni gadget ni austère.
- **Formulaires au confort A** : fond clair, séparation en **filet pointillé doux** entre les
  rangées, labels lisibles, hauteur de champ ≥ 44 px, **erreur explicite** avec pastille et
  message relié — pas d'encadrement massif.
- **Densité confort** par défaut sur desktop.

## 6. Ce qui a volontairement été rejeté

| Écarté | De | Raison |
|---|---|---|
| Contraste maximal + **bordures 2 px partout** | B | « Interface blindée » fatigante en usage bureau prolongé (administratif). Ramené à 1 px desktop / 1,5 px terrain. |
| Board de pilotage **en tête pour tous** | C | Surcharge l'utilisateur terrain ; le board est un bloc secondaire conditionné à une permission. |
| **Petites capitales espacées partout** (titres de listes) | C | Nuit à la lecture rapide sur le terrain. Conservées uniquement pour l'eyebrow. |
| **Or en accent visible** (pastille de nav, dot du switcher en aplat) | A / B | Décision produit : l'or est **uniquement** un filet / une bordure d'état, jamais une surface. |
| **Or quasi-invisible** (A/B) | A / B | À l'inverse : le filet doré sous le titre lui redonne un rôle identitaire lisible. |
| Fond de travail dur `#e9edf1` | B | Remplacé par `#f4f6f8` (repose l'œil). |
| Rayons très anguleux 5 px | C | Trop « document officiel » ; porté à 6/9/13. |
| KPI **30 px** partout | C | Réservés au board ; 26 px ailleurs pour ne pas écraser le reste. |
| Zébrage de tableau | — | Filets fins seulement (plus premium, moins « tableur »). |

---

## 7. Palette (tokens sémantiques)

Tous les tokens sont des variables CSS sur `:root` — **prérequis pour un mode sombre futur**
(§ 22) : les composants ne référencent aucune couleur en dur.

### Surfaces & navigation

| Rôle | Token | Valeur |
|---|---|---|
| Fond de travail | `--bg` | `#f4f6f8` |
| Fond de formulaire / repos | `--bg-soft` | `#f7f9fb` |
| Surface (panneaux, cartes) | `--surface` | `#ffffff` |
| Surface interne (en-têtes de tableau) | `--surface-2` | `#f2f4f7` |
| Navigation bleu nuit | `--nav-bg` / `--nav-bg-2` | `#0c1a2b` / `#12283f` |
| Bandeau « Aujourd'hui » | `--today-bg` | `#0d2138` |
| Texte sur navy | `--on-nav` / `--on-nav-2` | `#eef3f8` / `#b7c4d3` |
| Texte secondaire sur bandeau | `--on-today-2` | `#c9d8e6` |

### Texte (tous ≥ 4,5:1 sur blanc)

| Rôle | Token | Valeur | Ratio /blanc |
|---|---|---|---|
| Texte principal | `--text` | `#161b21` | **≈ 17,3:1** |
| Texte secondaire | `--text-muted` | `#4c5560` | **≈ 7,4:1** |
| Texte adouci (remplace `--text-faint`) | `--text-soft` | `#5f6875` | **≈ 5,9:1** |

### Marque & action

| Rôle | Token | Valeur | Contrôle |
|---|---|---|---|
| **Action principale** (bouton, lien) | `--action` / `--action-strong` | `#1550d6` / `#0f3ea8` | blanc dessus **≈ 6,7:1** ✅ ; lien sur blanc **≈ 6,7:1** ✅ |
| Action — fond léger | `--action-weak` | `#e6edfc` | — |
| **Doré ELSATIA — ACCENT UNIQUEMENT** (filet, état actif, anneau focus) | `--gold` | `#a97b23` | filet sur blanc **≈ 3,8:1** (≥ 3:1 pour un élément graphique ✅) ; sur navy **≈ 4,6:1** ✅. **Jamais** en fond de bouton ni en aplat large. |
| Doré très clair (fond d'accent rare) | `--gold-soft` | `#f0e6d1` | — |

### Statuts (couleur + forme + libellé)

| Statut | Texte / Fond | Ratio texte/fond | Forme de la pastille |
|---|---|---|---|
| Succès (`Validé`) | `--ok #146b3c` / `--ok-bg #e4f2ea` | **≈ 6,3:1** ✅ | carré |
| Information (`À relancer`) | `--info #0f4bab` / `--info-bg #e5eefb` | **≈ 7,3:1** ✅ | triangle |
| Attention (`En attente`) | `--warn #7a4f0c` / `--warn-bg #f8ecd6` | **≈ 6,0:1** ✅ | losange |
| Erreur (`Urgent` / `Refusé`) | `--err #a11d16` / `--err-bg #fae4e2` | **≈ 6,5:1** ✅ | rond |
| Neutre (`Brouillon`) | `--neutral #45505d` / `--neutral-bg #e9ecef` | **≈ 6,6:1** ✅ | carré atténué |

### Bordures & rayons

`--border #e2e6eb` · `--border-strong #cdd3db` · `--hair #eef0f3` · `--border-w` = **1 px**
(Confort) → **1,5 px** (Terrain). Rayons `--r-sm 6` / `--r-md 9` / `--r-lg 13`.
Ombres `--sh-1` (cartes) et `--sh-2` (bandeau « Aujourd'hui »), toutes très légères.

---

## 8. Typographie

| Niveau | Réglage | Usage |
|---|---|---|
| **Eyebrow** | 11 px / 700 / interlettrage 0.16em / capitales / `--text-soft` | contexte au-dessus du titre (« Tableau de bord », « Pilotage ») |
| **H1** | 26 px / 750 / interlignage 1.12 / `-0.015em` | titre de page ; filet doré 2 px dessous |
| **Titre de section** | 15 px / 750 | en-têtes de carte (`.sectitle`) |
| **Corps** | 13,5–14,5 px / 400–600 | contenu, lignes, labels |
| **Mentions** | 11,5–12 px / `--text-soft` (≥ 4,5:1) | aides, sous-titres |
| **Chiffres** | fonte monospace tabulaire, KPI board 26 px / 750, montants de tableau alignés à droite | KPI, tableaux, totaux |

Pile de polices : **système** (`-apple-system, "Segoe UI", Roboto, Helvetica, Arial`). Pas de
petites capitales en dehors de l'eyebrow (lecture terrain prioritaire). *Décision à prendre
par Julien : conserver la pile système ou embarquer une webfont (locale, jamais distante).*

---

## 9. Navigation

- **Largeur 236 px** — compacte (l'audit R1 reprochait 39 entrées ; ici regroupées en
  **6 domaines** + bloc plateforme séparé).
- Contenu, de haut en bas : **logo ELSATIA** + « Gestion Pro » · **entreprise active** +
  **sélecteur d'entreprise** · **switcher Applications ELSATIA** · **modules groupés**
  (Accueil / Clients & ventes / Chantiers / Équipe / Achats & stock / Pilotage) · **bloc
  « Administration plateforme »** nettement séparé (filet + libellé doré + `★ Console
  ELSATIA`) · **compte utilisateur** (avatar, nom, rôle, « Quitter »).
- **État actif** = fond `#ffffff12` + **filet doré `inset 3px`** + texte blanc gras (l'or ne
  sert qu'à ça dans la nav).
- Liens à **hauteur ≥ 44 px** (48 en Terrain). Contraste texte `--on-nav` ≈ 13:1,
  libellés de groupe `--on-nav-2` ≈ 5,6:1.
- Séparation **entreprise cliente ↔ plateforme ELSATIA** portée par un bloc distinct
  (libellé + accent doré), pas par un simple filet.

---

## 10. « Aujourd'hui »

- **Bloc bleu nuit** (`--today-bg`) en tête de la zone de travail, ombre `--sh-2`.
- Titre « Aujourd'hui » + résumé (« Ce que vous devez traiter — 3 alertes, 3 tâches »).
- Deux panneaux blancs : **Alertes prioritaires** (glyphe coloré `!`/`▲` + titre + détail +
  badge de statut *forme+libellé*) et **Tâches du jour** (glyphe `→`/`▲` + **bouton d'action
  direct** Relancer / Ouvrir / Valider).
- **Mobile** : devient une bande compacte sous l'en-tête (2–3 lignes les plus critiques),
  suivie d'une rangée d'**actions rapides** (`+ Devis` / `Pointer` / `Note frais`).
- Objectif atteint : la question *« qu'est-ce que je traite aujourd'hui ? »* trouve sa
  réponse **au-dessus de la ligne de flottaison**, avant tout KPI.

---

## 11. Board « Pilotage » (direction)

- **Bloc séparé**, placé **après** « Aujourd'hui », **avant** le détail opérationnel.
- En-tête : eyebrow « Pilotage » + **pastille explicite** « *visible si permission
  `voir_indicateurs_financiers`* » (rappel que le board est masqué pour le terrain).
- **4 KPI** : CA (30 j), Facturé, Encaissé, **Marge chantiers** — chacun avec **valeur**
  (26 px monospace) + **évolution en toutes lettres** (« ▲ 8,1 % · en hausse » /
  « ▼ 1,3 pt · en baisse » — jamais la flèche seule) + micro-spark.
- **Tendance 6 mois** : barres CSS pur (Devis émis en bleu d'action, Facturé en doré),
  légende. Aucune bibliothèque, aucune image.
- **Mobile** : le board passe en `order:5` (sous les chantiers), KPI en **carrousel
  horizontal** à `scroll-snap`, tendance condensée.

---

## 12. Tableaux

- **Lignes fines** (filet `--hair` 1 px), **hover léger** (`--surface-2`), en-tête `--surface-2`
  + filet bas 2 px, libellés 11,5 px / 700.
- **Montants** alignés à droite en **chiffres tabulaires**.
- **Ligne de total** (`tfoot`) : filet 2 px, « Total période » à gauche, montant à droite en
  gras.
- **Statuts** rendus par le composant `.st` (couleur + forme + libellé) — identifiables sans
  la couleur.
- **Mobile** : le `<table>` est **remplacé par une liste de cartes** (`.mrow` : référence +
  montant en tête, client, badge de statut) — pas de défilement horizontal illisible.

## 13. Formulaires

- Conteneur `--bg-soft` (clair), **pas d'encadrement massif** ; rangées séparées par un
  **filet pointillé doux**.
- Labels 12 px `--text-muted` / 600, astérisque requis en `--err`.
- Champs : fond blanc, bordure 1 px `--border-strong`, **hauteur ≥ 44 px** (48 en Terrain),
  focus = bordure `--action` + anneau doré.
- **Erreur explicite** : bordure `--err`, message relié avec pastille « ! » (`role`
  d'illustration ; en production, `aria-describedby`).
- Aide facultative en `--text-soft` (≥ 4,5:1).

## 14. Focus

- **Anneau doré `--gold` 3 px, décalage 2 px**, appliqué via `:focus-visible` à tous les
  éléments interactifs (boutons, liens, champs, `select`).
- Choix : plutôt que le jaune `#ffd23f` de B (efficace mais étranger à la marque), l'or
  ELSATIA sert d'anneau de focus — **cohérent avec l'identité** et suffisamment contrasté :
  - sur **blanc** : ratio ≈ **3,8:1** (≥ 3:1 pour un indicateur non-textuel ✅) ;
  - sur **bleu nuit** : ratio ≈ **4,6:1** ✅ ;
  - sur **bouton bleu `--action`** : l'anneau est *à l'extérieur* (offset 2 px) sur le fond
    de page — il ne dépend donc pas du contraste or/bleu.
- Démonstration des trois cas dans la maquette (carte « Focus clavier »).
- *À valider outillé en R4 : si 3,8:1 sur blanc est jugé trop juste, doubler l'anneau
  (or + trait sombre 1 px) ou passer à un bleu foncé `#0f3ea8` (≈ 6,7:1).*

## 15. Densité **Confort** (administratif / desktop)

Valeurs par défaut : `--tap 44px` · `--border-w 1px` · lignes 44 px · champ 44 px · padding
de carte 16 px. Objectif : **plus d'air**, filets fins, tableaux légers, aucune impression
d'« interface blindée » sur les longs écrans (paramètres, matrices de permissions,
consultation).

## 16. Densité **Terrain** (touch / tablette)

Bascule par l'ancre `#terrain` (aucun script) : `--tap 48px` · `--border-w 1,5px` · lignes
52 px · champ 48 px · padding de carte 20 px. **Même identité visuelle**, échelle agrandie :
cibles confortables avec des gants, séparations plus marquées, lisibilité de loin. C'est un
**réglage de tokens**, pas un second design system.

## 17. Mobile 390 px

Ordre de lecture imposé (container query `≤ 640px`) :
**1. Aujourd'hui → 2. actions rapides → 3. tâches → 4. chantiers → 5. navigation.**

- Sidebar masquée ; en-tête mobile + **tiroir** (le tiroir montre en tête « Applications »
  puis les groupes de modules puis « ★ Console ELSATIA »).
- « Aujourd'hui » → bande compacte (alertes les plus critiques) + rangée d'actions rapides.
- KPI direction : `order:5`, **carrousel horizontal** `scroll-snap` (chaque KPI ≈ 62 % de
  large), sous le contenu opérationnel.
- Tableau « Devis récents » → **liste de cartes** (`.mrow`).
- Boutons `flex:1` (pleine largeur), champs pleine largeur.

## 18. Tablette (768–1024)

Container query `≤ 1080px` : sidebar masquée (accès par le menu), **contenu pleine largeur**,
KPI en 2×2, « Aujourd'hui » en 1 colonne (Alertes puis Tâches), grilles 2→1 colonne. Combinée
à la densité **Terrain**, on obtient : grandes cibles, informations essentielles visibles,
peu de petites interactions — exploitable sur chantier.

## 19. Desktop (≥ 1080)

Sidebar 236 px, contenu `max-width 1220px` centré, grille 1,3 fr / 1 fr. Densité **Confort** :
bordures 1 px, ombres légères, tableaux fins, respiration entre sections (32 px). Le board
« Pilotage » occupe la pleine largeur sous « Aujourd'hui ».

## 20. Contrastes (calculés — formule WCAG 2.x, sRGB ; non mesurés sur rendu)

| Combinaison | Ratio | Seuil | Verdict |
|---|---|---|---|
| `--text` `#161b21` sur `--surface` | **17,3:1** | 4,5 (texte) | ✅ |
| `--text-muted` `#4c5560` sur blanc | **7,4:1** | 4,5 | ✅ |
| `--text-soft` `#5f6875` sur blanc | **5,9:1** | 4,5 | ✅ (aucun token texte sous le seuil) |
| Texte blanc sur bouton `--action` `#1550d6` | **6,7:1** | 4,5 | ✅ |
| Lien `--action` sur blanc | **6,7:1** | 4,5 | ✅ |
| `--on-nav` sur `--nav-bg` | **≈ 13:1** | 4,5 | ✅ |
| `--on-nav-2` sur `--nav-bg` (libellés de groupe) | **≈ 5,6:1** | 4,5 | ✅ |
| `--on-today-2` sur `--today-bg` | **≈ 7:1** | 4,5 | ✅ |
| Statut succès texte/fond | **≈ 6,3:1** | 4,5 | ✅ |
| Statut information texte/fond | **≈ 7,3:1** | 4,5 | ✅ |
| Statut attention texte/fond | **≈ 6,0:1** | 4,5 | ✅ |
| Statut erreur texte/fond | **≈ 6,5:1** | 4,5 | ✅ |
| Statut neutre texte/fond | **≈ 6,6:1** | 4,5 | ✅ |
| Anneau de focus `--gold` sur blanc | **≈ 3,8:1** | 3,0 (non-texte) | ✅ (limite — cf. § 14) |
| Anneau de focus `--gold` sur navy | **≈ 4,6:1** | 3,0 | ✅ |
| Filet doré titre `--gold` sur blanc | **≈ 3,8:1** | 3,0 (graphique) | ✅ |

**Aucun token de texte n'est conservé sous 4,5:1.** Les seuls ratios entre 3 et 4,5 concernent
des **éléments graphiques non textuels** (filet, anneau de focus) où le seuil applicable est
3:1.

## 21. Accessibilité — récapitulatif

| Point | État dans la maquette |
|---|---|
| **Contraste texte** | tous ≥ 4,5:1 (§ 20) ; gris faibles de R2A corrigés |
| **Focus visible** | anneau doré 3 px `:focus-visible` sur tous les interactifs ; testé blanc / navy / bouton bleu |
| **Taille tactile** | ≥ 44 px (Confort) / 48 px (Terrain) sur boutons, nav, champs, switcher, boutons d'action, onglets |
| **État ≠ couleur seule** | statuts = **couleur + forme** (rond/losange/carré/triangle) **+ libellé** ; évolutions KPI = flèche **+ mot** (« en hausse » / « en baisse ») ; alertes = glyphe **+** badge **+** texte |
| **Lisibilité texte** | corps ≥ 13,5 px, mentions ≥ 11,5 px, jamais < 11 px ; eyebrow 11 px |
| **Responsive** | container queries 1080 / 640 ; tablette et mobile testés (redimensionnement fenêtre) ; tableau → cartes en mobile |
| **Lumière forte** | contraste renforcé hérité de B, chiffres KPI très contrastés ; filets fins à surveiller en plein soleil (densité Terrain les épaissit) |
| **À valider outillé en R4** | axe / contrast-checker sur composants réels, clair **et** sombre ; `aria-describedby` sur les erreurs ; `role="dialog"` + focus-trap sur le tiroir mobile ; ordre de tabulation |

## 22. Mode sombre — note (non développé)

Le mode sombre **n'est pas** construit dans cette maquette. Vérifications faites pour ne pas
le rendre impossible :

- **Tous les tokens sont des variables CSS sémantiques sur `:root`** ; aucun composant n'a de
  couleur en dur → un thème sombre = un bloc `@media (prefers-color-scheme: dark)` /
  `:root[data-theme="dark"]` qui **redéfinit ces mêmes variables**.
- Les paires `--x` / `--x-bg` (statuts) et `--today-bg` / `--action-weak` devront recevoir
  des équivalents sombres (texte de statut plus clair, fond de statut plus profond).
- Le **doré** `--gold` reste utilisable en sombre (il se pose alors sur fond foncé → contraste
  supérieur au cas clair).
- Le **bleu nuit de navigation** est déjà « sombre » : en thème sombre, il faudra le
  différencier de la zone de travail (ex. nav légèrement plus claire que le fond).
- Aucun choix de R2B ne bloque le mode sombre ; c'est un sujet **R2C/R4**.

## 23. Adaptation à ELSATIA Colors

- **Socle commun** : même coquille (nav bleu nuit compacte, zone claire, en-tête avec
  recherche + notifications + switcher), mêmes **tokens de statut**, mêmes composants
  (`Button`, `Card`, `Table`, `Field`, `.st`), même densité Confort/Terrain.
- **Accent propre à l'app** : là où Gestion Pro n'a **pas** d'accent de couleur fort (bleu =
  action, or = filet), Colors peut introduire un **rappel de teinte** contextuel (couleur du
  seau / du nuancier affiché) — dans les cartes et les puces, **jamais** en remplacement du
  bleu d'action ni du bleu nuit de navigation.
- **Navigation cohérente** : mêmes groupes de comportement (tableau de bord, inventaire, ajout
  par photo, dépôts, mouvements, nuanciers…), même filet doré d'état actif, même bloc
  « Applications ELSATIA » avec Colors marqué *actif*.
- **Un seul design system**, pas trois : Colors = tokens + composants de Gestion Pro + une
  variable d'accent d'app.

## 24. Adaptation à ELSATIA Tools

- **Socle commun réduit** : Tools reprend les **tokens** (couleurs, typo, rayons, focus) et
  les **composants de base** (`Button`, `Field`, `.st`, en-tête), **pas** la mise en page
  dashboard (pas de board « Pilotage », pas de bandeau « Aujourd'hui »).
- **Mobile-first natif** : Tools est déjà un parcours *Saisie → Calcul → Résultat → Schéma →
  Instructions* ; il applique surtout la **densité Terrain** (cibles 48 px, gros chiffres de
  résultat, contraste fort), le focus doré, et le même bleu d'action.
- **Navigation** : le bloc « Applications ELSATIA » identique (Tools *actif*), pour une
  cohérence de passage entre les trois apps. Le reste de la navigation Tools lui est propre
  (recherche d'outils, favoris, récents).
- **Promotions** vers Colors / Gestion Pro : discrètes et contextuelles (après résultat),
  dans le style `.mini` / lien secondaire — jamais d'interstitiel.

## 25. Captures

**Aucune capture PNG n'a été enregistrée comme fichier du dépôt.** L'outil de capture
disponible renvoie des images **incrustées dans la réponse** (mises à l'échelle du volet de
prévisualisation), pas des fichiers `.png` autonomes ; le volet rend les fichiers locaux comme
des instantanés. Je **ne fabrique pas** de PNG de qualité incertaine.

**Vérification réellement effectuée** (rendu dans le navigateur intégré) :

- **Bureau ~1440** : coquille complète — navigation navy compacte (switcher « Applications
  ELSATIA » : Gestion Pro *actif* / Colors / Tools ; compte utilisateur en bas), eyebrow +
  `h1` + **filet doré**, **bandeau « Aujourd'hui »** (alertes `Urgent`/`En attente` avec
  formes + tâches avec boutons Relancer/Ouvrir/Valider), **board « Pilotage »** (4 KPI + CA
  142 800 € + Marge 21,4 % en baisse rouge + tendance 6 mois barres bleu/or + pastille
  « visible si permission »), Chantiers en cours, formulaire (champ e-mail en erreur
  explicite), tableau avec total, zone dangereuse, démo de focus.
- **Mobile ~390** : sidebar masquée ; ordre **Aujourd'hui → actions rapides → tâches →
  chantiers → navigation** ; badges de statut avec formes conservées ; aperçu du tiroir de
  navigation avec « Applications » en tête. (Le champ de recherche mobile reste à peaufiner
  visuellement — détail de maquette.)
- Bascules **Confort / Terrain** et **Bureau / Tablette / Mobile** fonctionnelles (ancres CSS,
  aucun script).

**Pour des captures de référence fiables** : ouvrir `elsatia-hybride.html` dans un navigateur,
utiliser les liens de la barre + les DevTools responsive (1440 / 1024 / 390), capturer
manuellement — c'est l'une des vérifications confiées à Julien (§ 30).

## 26. Limites

- **Maquette statique** : démonstration de direction, **pas** le design system ni des
  composants réels. Icônes de navigation = blocs neutres (placeholders) ; le set d'icônes est
  un sujet R2C/R4.
- **Contrastes calculés** à partir des valeurs de tokens, pas relevés sur capture rendue ; à
  revalider outillé (axe) en R4, **clair et sombre**.
- **Aucune capture PNG committée** (§ 25).
- **Mode sombre non construit** (§ 22) — seulement documenté comme non bloqué.
- **Colors / Tools non déclinés** (§ 23–24) : principes seulement, à traiter en R7/R8.
- Le comportement `:target` (largeur / densité) est une commodité de maquette ; l'app réelle
  utilisera de vraies media/container queries et un vrai réglage de densité.
- Détail cosmétique connu : rendu du champ de recherche en mobile 390 à affiner.

## 27. `git status --short`

```
 D output/video/Liria_Gestion_Pro_Guide_Video_Complet.mp4      (préexistant, non stagé)
?? docs/organisation/ELSATIA_UI_V2_R2B_HYBRIDE.md
?? docs/organisation/ui-v2/r2b/
```

## 28. Confirmation — aucun fichier applicatif modifié

`git diff` sur fichiers suivis ne liste **que** `output/video/…mp4` (suppression
**préexistante**, antérieure à ce lot). **Aucun** fichier de `src/`, `apps/`, aucun style,
aucun composant, aucune configuration applicative n'a été touché. **Aucune** action Supabase,
migration, Vercel, Stripe, Production. **Aucune** modification de Colors ou Tools. **Aucune**
fusion dans `main`. **Aucun commit, aucun push.** HEAD inchangé (`e65fc05…`).

## 29. Vidéo préexistante

`output/video/Liria_Gestion_Pro_Guide_Video_Complet.mp4` : sa suppression **non stagée**
préexiste à ce lot, n'a **pas** été touchée, reste **hors de tout commit** et **non stagée**.

## 30. Décision attendue de Julien

1. **Valider (ou non) la direction hybride** telle que rendue par `elsatia-hybride.html` comme
   identité d'ELSATIA UI-V2 pour Gestion Pro.
2. Vérifier dans un navigateur : bascules **largeur** (1440 / 1024 / 390) et **densité**
   (Confort / Terrain) ; jugement d'usage terrain (« en 3 secondes, que dois-je traiter ? »).
3. Trancher les questions ouvertes :
   - **police** : pile système conservée, ou webfont embarquée (locale) ?
   - **anneau de focus** : or à ~3,8:1 sur blanc accepté, ou anneau doublé / bleu foncé ?
   - **mode sombre** : intégré dès le design system (R2C), ou reporté ?
   - **densité par défaut** desktop : Confort confirmée ?
   - **filet doré** : dosage jugé bon (sous titre + état actif), ou à réduire / étendre ?
4. Confirmer les **emprunts** (§ 3–5) et les **rejets** (§ 6).
5. Autoriser (ou non) le passage à **R3** (design system + composants) — non démarré.

---

## Contrôles finaux du lot R2B

- **Fichiers créés** : `docs/organisation/ELSATIA_UI_V2_R2B_HYBRIDE.md` +
  `docs/organisation/ui-v2/r2b/elsatia-hybride.html`. **Rien d'autre.**
- Maquettes R2A **préservées**, non réécrites.
- **Aucun** fichier applicatif modifié ; **aucune** action Supabase / migration / Vercel /
  Stripe / Production / Colors / Tools ; **aucune** fusion `main` ; **aucun commit** ; **aucun
  push**.
- `output/video/Liria_Gestion_Pro_Guide_Video_Complet.mp4` : non stagée, non touchée, hors
  commit.
- **R3 non démarré.**

UI-V2-R2B TERMINÉ — MAQUETTE HYBRIDE PRÊTE POUR VALIDATION VISUELLE
