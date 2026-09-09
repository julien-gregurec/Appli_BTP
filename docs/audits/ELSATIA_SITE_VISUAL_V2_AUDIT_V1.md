# ELSATIA-SITE-VISUAL-V2 — AUDIT PHASE 1

Audit préalable à la refonte visuelle du site vitrine (`elsatia.fr`).
**Lecture seule** : aucune ligne de code modifiée, aucune branche créée, aucun commit,
aucun déploiement, aucune action Vercel/DNS. Aucun formulaire soumis.

Date : 2026-09-06.

---

## 0. Périmètre — le site n'est PAS dans ce dépôt

| Surface | Dépôt local | Branche | État |
|---|---|---|---|
| **`elsatia.fr`** (cible de la refonte) | `/Users/juliengregurec/Projects/elsatia-site` | `feat/site-tools-colors-ecosystem-update-v1` @ `81aae40` | = exactement la Production |
| `app.elsatia.fr` (Gestion Pro) | `elsatia-main` | `feat/elsatia-canonical-final-r73-v1` | en ligne (200) |
| `tools.elsatia.fr` | `elsatia-main/apps/tools` | — | en ligne (200), **public sans compte** |
| `colors.elsatia.fr` | `elsatia-main/apps/colors` | — | en ligne (200), **mur de connexion** |

**Point d'attention opératoire** : le projet Vercel `elsatia-site` n'a **aucune intégration
Git**. Tous les déploiements sont faits en CLI (`npx vercel --prod`) depuis le répertoire
local. Pousser une branche ne déploie donc rien — et il n'existe pas de « branche
Production ». Le travail de refonte devra en tenir compte au moment de la recette.

---

## 1. Stack réelle

| Élément | Valeur |
|---|---|
| Framework | **Next.js 16.3.0** (App Router), React 19.2.8 |
| Langage | TypeScript strict |
| Styles | **CSS Modules** (`*.module.css`) + variables CSS globales |
| Tailwind | v4 **installé et importé** (`@import "tailwindcss"` dans `globals.css`) mais **zéro classe utilitaire utilisée** dans tout `src/` → dépendance morte qui n'expédie qu'un preflight |
| Images | `next/image` (une seule occurrence) |
| Tests | `node --test` sur `contact.ts` et `tarifs.ts` uniquement |
| Scripts | `npm run verify` = test + typecheck + lint + build |
| Analytics | **aucun** (ni Vercel Analytics, ni GA, ni Plausible) |
| Animations | **aucune** (seul un garde `prefers-reduced-motion` existe) |

Poids total de `src/` : **~2 380 lignes**. Le site est petit, propre et rapide à faire
évoluer — c'est un atout pour la refonte.

---

## 2. Pages et routes

| Route | Fichier | Rôle |
|---|---|---|
| `/` | `src/app/page.tsx` (219 l.) | Hero + écosystème 3 apps + « Pourquoi » + aperçu Gestion Pro + vision |
| `/solutions/gestion-pro` | `.../gestion-pro/page.tsx` (128 l.) | Hero + `ProductPreview` + 8 modules + sécurité + **grille tarifaire** + CTA démo |
| `/solutions/tools` | `.../tools/page.tsx` (192 l.) | Hero + 8 usages + principes + 13 catégories + « Tools Pro — bientôt » + CTA |
| `/solutions/colors` | `.../colors/page.tsx` (140 l.) | Hero + accès + 6 sections « en cours de développement » + CTA |
| `/a-propos` | `.../a-propos/page.tsx` | Vision, 4 valeurs |
| `/contact` | `.../contact/page.tsx` | Formulaire → `/api/contact` (Brevo, rate-limité) |
| `/[slug]` | `.../[slug]/page.tsx` | 5 pages légales rendues depuis `src/content/legal.ts` |
| `/robots.txt`, `/sitemap.xml` | `robots.ts`, `sitemap.ts` | conditionnés par `VERCEL_ENV` + `NEXT_PUBLIC_SITE_INDEXABLE` |
| `/icon`, `/apple-icon` | générés | — |

**Aucune page tarifs dédiée** sur le vitrine : la grille est dans `/solutions/gestion-pro`
et duplique `app.elsatia.fr/tarifs`.

---

## 3. Composants

| Composant | Réutilisable ? | Remarque |
|---|---|---|
| `SiteHeader` | oui | client component, nav 6 entrées + burger mobile, skip-link OK |
| `SiteFooter` | oui | 4 groupes, liens externes annoncés (`↗` + `sr-only`) |
| `ContactForm` | oui | — |
| `PlaceholderPage` | oui | 17 lignes |
| **`ProductPreview`** | oui | **⚠ faux dashboard ELSATIA simulé en HTML/CSS** — voir § 6 |
| `product-page.module.css` | oui | feuille commune Tools + Colors (59 l.) — bonne base de design system produit |

Il n'existe **aucun composant de présentation de capture** (cadre navigateur/mobile,
carrousel, onglets, galerie). Tout est à créer.

---

## 4. Design system

Défini dans `src/app/globals.css`, 8 tokens seulement :

```
--ink #07101f   --ink-soft #17243a   --blue #2d73ff   --blue-light #e9f1ff
--paper #f4f7fb --white #ffffff      --muted #617087  --line #dce4ef
```

Police : **Inter** déclarée dans la pile système, **sans `next/font` ni webfont chargée** —
donc en pratique repli système chez la plupart des visiteurs. Pas d'échelle typographique,
pas d'échelle d'espacement, pas de tokens de rayon/ombre : chaque `*.module.css` refait ses
valeurs en dur (749 lignes rien que pour l'accueil).

### Incohérence d'identité entre les trois surfaces (constat visuel direct)

| Surface | Identité observée |
|---|---|
| `elsatia.fr` | bleu nuit `#07101f` + bleu vif `#2d73ff`, sans-serif, registre « SaaS corporate » |
| `tools.elsatia.fr` | **crème + ocre/or, titrage sérif** (« Que voulez-vous faire aujourd'hui ? »), registre artisan/atelier |
| `colors.elsatia.fr` | **prune/aubergine + corail, titrage sérif** |

Les trois applications sont belles **mais ne se ressemblent pas**, et le vitrine ne
ressemble à **aucune** d'elles. Montrer les vraies captures va donc rendre cette
divergence visible. C'est le principal arbitrage de design de la refonte (§ 10).

À noter : un lot **ELSATIA-UI-V2** existe déjà pour Gestion Pro, avec une direction visuelle
**gelée** (`docs/organisation/ELSATIA_UI_V2_R2C_GEL.md`, décision D1 « Hybride B+C+A »,
pile système, doré en accent seulement). La refonte du site doit s'aligner sur ce gel plutôt
que d'inventer une troisième direction.

---

## 5. Assets disponibles — **le point bloquant**

Inventaire exhaustif des images du dépôt site :

| Fichier | Poids | Nature |
|---|---|---|
| `public/hero-software-ai.png` | **1,48 Mo** (1672×941) | **image générée par IA** : un MacBook sur un bureau de nuit affichant un **dashboard fictif générique** (texte illisible, graphes de nœuds) — **rien à voir avec ELSATIA** |
| `public/og.png` | **1,51 Mo** (1536×1024) | image OG, servie **brute, non optimisée** |

Recherche étendue à `elsatia-main`, `btp-platform-colors` et `elsatia-site` :

> **Il n'existe aujourd'hui AUCUNE capture d'écran réelle des applications ELSATIA
> dans aucun dépôt.**

Les seuls PNG trouvés sont : icônes/splash Android-iOS de Tools, portraits de démo
`public/demo/employes/*`, la présentatrice vidéo « Liria », et 4 captures **du site
lui-même** (`elsatia-site/output/captures/`) qui sont de surcroît **périmées** (elles
montrent l'ancien texte « Notre première solution » / « Voir nos solutions », antérieur à
l'ajout de Tools et Colors).

### Ce qu'on peut capturer, et à quel coût

| Application | Accès | Capturable aujourd'hui ? |
|---|---|---|
| **Tools** | public, sans compte, `tools.elsatia.fr` | **OUI, immédiatement.** Accueil, catégories, calculateurs, tracés, Atelier. Zéro donnée sensible (tout est calculé localement à partir de cotes saisies). |
| **Gestion Pro** | connexion requise | **OUI mais avec préparation.** Un harnais existe déjà : `elsatia-main/scripts/capturer-guide.mjs` — Playwright, se connecte réellement et photographie **36 sections** en desktop **et** mobile. Il faut : un environnement de recette peuplé (`scripts/seed-elsatia-preview-year.mjs` crée une année de données fictives marquées `DOCUMENT FICTIF — RECETTE`) + les variables `ELSATIA_AUDIT_URL/EMAIL/PASSWORD`. |
| **Colors** | compte ELSATIA + droit Colors + habilitation | **NON sans décision.** Le visiteur ne voit qu'un écran de connexion. De plus les fonctions métier (inventaire, nuanciers, mouvements) sont annoncées comme « en cours de développement » : il n'y a **rien de substantiel à photographier** aujourd'hui. |
| **Réserves** | n'existe pas | **NON.** L'audit `ELSATIA_RESERVES_GP_INTEGRATION_READINESS_AUDIT_V1.md` ne conclut qu'à la capacité du socle à l'accueillir. Aucune ligne d'application. |

---

## 6. Défauts visuels et manquements — classés

### 🔴 Bloquants au regard du brief (règle « pas de fausses interfaces »)

1. **Le hero est une image d'IA montrant un faux logiciel.** `hero-software-ai.png` est
   littéralement nommé ainsi. Il occupe tout le premier écran en `priority`. Le brief
   l'interdit explicitement (§2, §10 : « pas de dashboard fictif généré par IA »).
2. **`ProductPreview` est un faux dashboard ELSATIA reconstruit en CSS**, affiché sur
   `/solutions/gestion-pro` : barre d'adresse « app.elsatia.fr », badge « Sécurisé »,
   « Bonjour Julien », **12 chantiers actifs, 8 devis en attente, 24 collaborateurs**, un
   histogramme d'activité inventé. Ces chiffres ne viennent d'aucune donnée réelle et
   la composition se présente comme une capture. À remplacer par une vraie capture (§11).
3. **Zéro capture réelle sur tout le site.** Le visiteur ne voit jamais une seule
   interface ELSATIA. C'est exactement le problème décrit dans le brief.

### 🟠 Défauts d'impact

4. **Accueil : Tools et Colors sont traités comme des cartes de second rang.** Trois
   `<article>` en grille, avec pour tout visuel un monogramme « G / PRO » pour Gestion Pro
   et **rien du tout** pour Tools et Colors.
5. **Aucune section « du bureau au chantier »** : la complémentarité de l'écosystème n'est
   affirmée qu'en prose.
6. **Le contenu est presque exclusivement des listes numérotées** (`01 02 03…`) : 4
   bénéfices, 6 fonctions, 8 modules, 8 usages, 5 principes, 13 catégories, 6 sections
   Colors, 4 valeurs. Le motif est répété **sept fois** sur le site — il devient du bruit,
   et il n'y a aucune respiration visuelle entre les blocs.
7. **Aucune mise en situation d'appareil** (ordinateur / smartphone / tablette).
8. **Aucune animation**, aucun changement d'état au scroll, aucun système d'onglets.
9. **Réserves n'est mentionnée nulle part** — ni sur l'accueil, ni en footer, ni en nav.

### 🟡 Technique / qualité

10. **`og.png` = 1,51 Mo servi brut.** Les crawlers sociaux plafonnent souvent bien en
    dessous ; l'aperçu risque de ne pas s'afficher. À réencoder (< 300 Ko).
11. **Aucune donnée structurée** (`schema.org` / JSON-LD) : ni `Organization`, ni
    `SoftwareApplication`, ni `BreadcrumbList`. Rien à préserver, donc **opportunité nette**.
12. **La même `og.png` générique est utilisée sur les 4 pages produit** — pas d'OG par
    application.
13. **Tailwind v4 chargé pour rien** (aucune classe utilisée).
14. **Inter déclarée mais jamais chargée** → rendu réel en police système. À trancher :
    soit charger via `next/font`, soit assumer la pile système (ce qui serait cohérent avec
    la décision **D4 du gel UI-V2** : « aucune webfont avant commercialisation »).
15. **Un seul `<h1>` par page — correct**, mais la hiérarchie `h2/h3` de l'accueil est
    portée par des `<p class=eyebrow>` non sémantiques.
16. **Affirmation à revérifier** : la page Tools annonce « **seize outils gratuits** » et
    « treize familles ». Le catalogue de la branche de travail
    (`apps/tools/src/lib/catalog.ts`) contient **26 outils dont 11 marqués `pro`**, soit
    **15 gratuits**. À recompter contre le catalogue **déployé** avant publication — le
    brief interdit toute affirmation non vérifiable (§18, §29).

---

## 7. Ce qui est déjà réussi — à préserver

- **La discipline « pas de fausses fonctions » est déjà en place dans le contenu.**
  `src/lib/ecosysteme.ts` porte un commentaire de règle explicite ; les pages Tools et
  Colors distinguent nettement disponible / « Bientôt » / « En cours de développement ».
  Cette rigueur est un actif, il ne faut pas la casser en ajoutant du visuel.
- **Accessibilité correcte** : skip-link, `aria-expanded`/`aria-controls` sur le burger,
  `aria-hidden` sur les décorations, liens externes annoncés en lecteur d'écran,
  `:focus-visible` à 3 px, garde `prefers-reduced-motion` déjà écrite.
- **SEO propre** : `metadataBase`, titres et descriptions par page, `canonical` partout,
  OG/Twitter, `robots.ts` et `sitemap.ts` cohérents entre eux (les pages légales restent
  indexables même hors ouverture commerciale). **En Production, `robots.txt` renvoie
  aujourd'hui `Allow: /`** — le site est bien indexable, il y a donc du SEO réel à ne pas
  dégrader.
- **Performance actuelle très bonne** : `/` répond en ~120 ms, HTML 36 Ko, et le hero de
  1,48 Mo est servi par `next/image` en **WebP 36,7 Ko**. Le budget est large pour
  accueillir de vraies captures.
- **Tarifs déjà canoniques et testés** : `tarifs.ts` (79/249/449/599, annuel = 10 ×
  mensuel) verrouillé par checksum contre `tarifs.canonical.json`. **Ne pas y toucher.**
- `product-page.module.css` partagé entre Tools et Colors : bonne amorce de système.

---

## 8. Quick wins (faisables sans nouvelle capture)

| # | Action | Effet |
|---|---|---|
| QW1 | Réencoder `og.png` en < 300 Ko | aperçus sociaux fiables |
| QW2 | Ajouter le JSON-LD `Organization` + `SoftwareApplication` ×3 | SEO net |
| QW3 | Retirer l'import Tailwind inutilisé | CSS plus léger, moins d'ambiguïté |
| QW4 | Donner une identité visuelle à chaque carte d'application sur l'accueil (couleur propre reprise de chaque app : bleu / ocre / prune) | l'écosystème devient lisible d'un coup d'œil |
| QW5 | Créer la section « Du bureau au chantier » (schéma, pas de paragraphe) | § 9 du brief, sans capture |
| QW6 | Animations d'apparition au scroll, respectant le garde `reduced-motion` déjà présent | § 13 du brief, sans capture |
| QW7 | OG dédiée par page produit | partage plus convaincant |
| QW8 | Recompter et corriger « 16 outils / 13 catégories » | conformité § 29 |

---

## 9. Risques

| # | Risque | Gravité | Mitigation |
|---|---|---|---|
| R1 | **Aucune capture réelle n'existe** → tout le cœur du brief (hero, sections produit, mises en situation) est bloqué | **Élevée** | Décision Julien requise — voir § 10 |
| R2 | Capturer Gestion Pro sur des **données réelles** exposerait clients, montants, salariés (brief § 12) | **Élevée** | Ne capturer **que** l'environnement de recette peuplé par `seed-elsatia-preview-year.mjs` (marqueur « DOCUMENT FICTIF »), jamais la Production |
| R3 | Montrer les 3 apps côte à côte rend visible la **divergence d'identité** (bleu / ocre / prune) | Moyenne | Assumer 3 couleurs d'application dans un cadre commun ELSATIA, plutôt que repeindre les apps |
| R4 | Régression SEO : le site est **indexé** aujourd'hui | Moyenne | Aucune suppression de route ni de texte indexable ; conserver H1/H2 et canonicals ; ne pas remplacer du texte par de l'image |
| R5 | Déploiement CLI sans intégration Git → un `vercel --prod` prématuré publie la refonte | Moyenne | Ne rien déployer ; recette en `vercel` preview uniquement |
| R6 | Les captures d'Atelier de traçage montrent une fonctionnalité **encore en cours** (branche `feat/tools-atelier-hittest-snap-foundation-v1`) | Moyenne | Ne publier une capture d'Atelier que si l'écran est stable **et** déployé |
| R7 | Toucher `tarifs.ts` casserait le checksum canonique | Faible mais net | Interdiction de modifier les prix (brief § 19) |

---

## 10. Décisions requises avant Phase 2

La refonte est **entièrement dépendante** de la production des captures. Trois options :

- **Option A — Captures réelles complètes (recommandée, conforme au brief).**
  1. Peupler l'environnement de recette (`seed-elsatia-preview-year.mjs`).
  2. Lancer `scripts/capturer-guide.mjs` → 36 écrans Gestion Pro, desktop + mobile.
  3. Capturer Tools directement sur `tools.elsatia.fr` (public, immédiat).
  4. Colors : capturer au minimum l'écran de connexion + ce qui est réellement ouvert.
  → Nécessite de Julien : accès à un compte de recette (`ELSATIA_AUDIT_EMAIL/PASSWORD`)
  et la confirmation que l'environnement visé n'est pas la Production.

- **Option B — Refonte en deux temps.** Livrer d'abord tout ce qui ne dépend pas des
  captures (structure, écosystème, « du bureau au chantier », animations, SEO, Réserves,
  quick wins), avec des emplacements de capture réservés aux bonnes dimensions ; brancher
  les images ensuite. Le site progresse tout de suite, sans jamais montrer de faux écran.

- **Option C — Statu quo visuel.** Rejetée : elle laisse en ligne l'image d'IA et le faux
  dashboard, tous deux contraires au brief.

Trois autres arbitrages à trancher :

- **Colors** : que montrer, alors que les fonctions métier ne sont pas ouvertes ? Écran de
  connexion + promesse assumée « déploiement en cours », ou pas de section visuelle du tout.
- **Réserves** : le brief demande un teaser. Il n'existe **aucun** écran. Teaser
  **100 % typographique** estampillé « Application en préparation » (recommandé), ou rien.
- **Identité** : aligner le vitrine sur le gel **UI-V2 (D1 Hybride)** de Gestion Pro,
  ou conserver le bleu actuel du site comme couleur « marque ombrelle » ?

---

## 11. Plan court des modifications (Phase 2, sous réserve des décisions § 10)

**Branche** : `feature/elsatia-website-visual-v2`, dans le dépôt **`elsatia-site`**
(pas `elsatia-main`). Aucun merge vers `main`, aucun déploiement.

### P0 — Hero + les 3 applications visibles
- Supprimer `hero-software-ai.png` et `ProductPreview` (les deux fausses interfaces).
- Nouveau hero : composition ordinateur (Gestion Pro) + smartphone (Tools) + smartphone
  ou tablette (Colors), cadres d'appareils neutres, écrans = **vraies captures**.
- Cartes d'écosystème sur l'accueil, à identité propre et à parité de traitement.

### P1 — Sections produit, écosystème, responsive, images
- `components/DeviceFrame`, `components/ScreenshotTabs` (onglets Dashboard/Chantiers/
  Devis/Planning), `components/AppCard` — nouveaux composants.
- Section « Du bureau au chantier » (schéma).
- Pipeline d'assets : `public/screenshots/<app>-<ecran>.<webp|avif>`, dimensions
  explicites, `sizes` corrects, `priority` réservé au seul visuel du hero.
- Recette 375 / 390 / 430 / 768 / desktop large.

### P2 — Animations, Réserves, préparation vidéo
- Apparitions au scroll (CSS/IntersectionObserver, sans dépendance), `reduced-motion`.
- Teaser Réserves « Bientôt disponible », sans capture.
- Emplacement vidéo réservé, sans infrastructure.

### Transverse
- Quick wins QW1→QW8.
- Contrôle anti-données-sensibles sur **chaque** capture avant commit (brief § 12).
- `npm run verify` (test + typecheck + lint + build) à chaque étape.

### Intouchable
`src/lib/tarifs.ts` et `tarifs.canonical.json` · `src/content/legal.ts` · les routes
existantes · `api/contact` · `robots.ts` / `sitemap.ts` · les textes indexables des pages
légales.

---

## 12. Conclusion

Le site est **techniquement sain** (Next 16 à jour, accessible, rapide, SEO propre,
tarifs verrouillés) et son **contenu est honnête**. Ce qui lui manque est exactement ce
que dit le brief : il ne montre jamais le produit.

Mais la correction ne peut pas être purement graphique : **les captures réelles
n'existent pas encore**, et deux des trois applications sont derrière une authentification.
Le seul chemin conforme au brief passe par la production de ces captures — l'outillage
nécessaire existe déjà dans `elsatia-main` et ne demande qu'un environnement de recette
et un accès.

Deux éléments actuellement en ligne violent par ailleurs les règles absolues du brief et
devraient être retirés quoi qu'il advienne : l'image de hero générée par IA, et le faux
dashboard `ProductPreview`.

**Phase 2 : en attente d'arbitrage sur le § 10.**
