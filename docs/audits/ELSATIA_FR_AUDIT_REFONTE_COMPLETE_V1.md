# ELSATIA.FR — Audit complet de refonte V1

> **Phase 1 : audit et propositions uniquement.** Aucun fichier du site, aucun logo, aucune configuration Vercel et aucune production n'ont été modifiés. Ce rapport est le seul fichier créé, et il **n'est pas commité**.
>
> Date : 3 octobre 2026. Auditeur : Claude Code. Statut : **en attente de validation propriétaire**.

---

## 0. Périmètre, source de vérité et méthode

### 0.1 Ce qui sert réellement www.elsatia.fr

| Élément | Constat (lecture seule, API Vercel) |
|---|---|
| Projet Vercel | `elsatia-site` (`prj_XTsg…`) |
| Dépôt Git | **`julien-gregurec/elsatia-site`**. Ce n'est **pas** `Appli_BTP`. |
| Domaines | `elsatia.fr` (principal). `www.elsatia.fr` **redirige vers** `elsatia.fr`. |
| Déploiement de production | `dpl_HnGd5x…` du 9 sept. 2026, commit **`89d9add`** (= HEAD de `main`) |
| Région | `cdg1` (Paris) |
| Variables de prod | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_INDEXABLE`, `NEXT_PUBLIC_LEGAL_SIRET`, `BREVO_API_KEY`, `CONTACT_*`. **`NEXT_PUBLIC_LEGAL_TVA` est absente.** |
| Application Gestion Pro | Projet `elsatia-production`, domaine `app.elsatia.fr`, branche `release/commercialisation-v1` du dépôt `Appli_BTP` |

**Conséquence.** Le code audité correspond **exactement** au commit en production. Le dépôt `Appli_BTP` sert à l'audit des identités applicatives (logos, favicons, manifests) et de la page de connexion.

### 0.2 Limite importante

La politique réseau de l'environnement **bloque `elsatia.fr` et `www.elsatia.fr`** (proxy, 403). Je n'ai donc pas pu charger le site hébergé lui-même. Je l'ai remplacé par ceci :

1. le **build de production du commit déployé** (`89d9add`), servi en local avec `next start`, `VERCEL_ENV=production` et les variables publiques connues ;
2. des tests **Playwright / Chromium** réels sur 21 URL et 8 tailles d'écran ;
3. **axe-core** (WCAG 2.2 AA) ;
4. des mesures de performance sous throttling CPU ×4.

Les écarts possibles avec la production portent uniquement sur trois points :
- les en-têtes ajoutés par le CDN Vercel ;
- la valeur réelle de `NEXT_PUBLIC_SITE_INDEXABLE` (chiffrée, non lue) ;
- la compression Brotli.

Pour lever cette limite : ajouter `elsatia.fr` aux domaines autorisés de l'environnement (Paramètres de l'environnement → Network access).

### 0.3 Les deux nouveaux visuels fournis

Ils ont été fournis **dans la conversation uniquement**. **Aucun fichier** du logo ou de la bannière n'existe dans les dépôts : j'ai vérifié les 402 branches d'`Appli_BTP` et les 19 branches d'`elsatia-site`.

| Asset | Format observé | Dimensions | Fond |
|---|---|---|---|
| Nouveau logo ELSATIA | Raster (PNG/JPEG) | ≈ 1254 × 1254 | Navy dégradé **opaque**, non transparent |
| Nouvelle bannière | Raster | ≈ 2000 × 761 (ratio 2,63:1) | Photo-illustration (Terre de nuit, réseau lumineux), **texte incrusté** |

---

## 1. Scores

```
SCORE_GLOBAL=64/100   (moyenne pondérée : Design, UX, Contenu, Conversion ×1,5)

DESIGN=62/100
UX=58/100
MOBILE=70/100
ACCESSIBILITE=74/100
PERFORMANCE=88/100
SEO=40/100          (≈ 70 si l'indexation est réellement ouverte en production — à confirmer)
CONTENU=50/100
CONVERSION=38/100
LEGAL=66/100
COOKIES=95/100
SECURITE=84/100
```

---

## 2. Synthèse

### POINTS_FORTS=

- **Base technique saine.**
  - Next.js 16 avec App Router, 100 % des pages prérendues (statiques).
  - Aucune dépendance front superflue : seulement `next`, `react` et `react-dom`.
  - Tests unitaires du contenu : 18 suites, toutes vertes.
- **Performance déjà très bonne** :
  - LCP mesuré entre 0,65 et 1,0 s en local sous CPU ×4 ;
  - **CLS = 0** sur toutes les pages ;
  - environ 160 Ko de JS gzip par page (environ 300 Ko sur `/tarifs`) ;
  - images en WebP via `next/image`.
- **Sécurité HTTP exemplaire pour une vitrine** :
  - CSP stricte, tout sur `'self'` ;
  - HSTS sur 2 ans ;
  - `X-Frame-Options: DENY`, COOP et CORP ;
  - Permissions-Policy fermée ;
  - envoi du formulaire côté serveur, avec échappement HTML, honeypot et délai minimal.
- **Cookies : aucun.**
  - Zéro cookie, zéro `localStorage` ou `sessionStorage`, **zéro requête tierce** sur les 21 URL testées.
  - L'absence de bandeau est donc **juridiquement cohérente**.
- **Honnêteté produit** : statuts réels affichés, captures réelles, aucun faux témoignage ni faux chiffre.
- **Accessibilité de base solide** :
  - lien d'évitement, focus visible (contour 3 px) ;
  - Échap ferme le menu ;
  - labels de formulaire présents, un seul H1 par page ;
  - `prefers-reduced-motion` respecté ;
  - mode sans JavaScript prévu.
- **Données structurées** présentes : Organization, WebSite, SoftwareApplication et BreadcrumbList.

### POINTS_FAIBLES=

1. **Le site parle comme un rapport interne, pas comme une marque.**
   - Environ 48 formulations négatives ou restrictives sur l'accueil, environ 98 sur `/ecosysteme`. Exemples : « aucun », « pas encore », « rien n'en est développé », « son domaine répond, mais il ne sert aujourd'hui qu'un écran de connexion ».
   - L'honnêteté est une qualité, mais elle est ici **auto-sabotante**.
2. **Placeholders visibles en production** : des cadres « EMPLACEMENT CAPTURE · Téléphone · 780×1688 » apparaissent dans la section Réserves de l'accueil et sur `/solutions/reserves`. C'est un signal **amateur** immédiat.
3. **Identité visuelle obsolète par rapport au nouveau logo.**
   - Le logo actuel est un carré bleu `#2d73ff` avec un « E » en police système.
   - Les accents or `#c9a24a` sont absents de la nouvelle identité.
   - Les fonds varient d'une application à l'autre : aubergine, beige, ardoise.
   - On a **six univers graphiques différents** sur une seule page.
4. **Typographie système** :
   - Arial/Helvetica sous Linux, Segoe sous Windows, SF sur Mac ;
   - **titres serif de secours** (Georgia/Times) dans les tarifs et les cartes ;
   - le rendu change selon la machine et ne fait pas premium.
5. **Aucun parcours d'achat** :
   - Gestion Pro est « commercialisation en préparation » ;
   - « aucun paiement ne peut être déclenché » ;
   - pas d'essai gratuit, alors que **les CGV en décrivent un de 30 jours** : incohérence.
6. **Indexation probablement fermée.**
   - Le rapport du 9 septembre liste « Bascule `NEXT_PUBLIC_SITE_INDEXABLE` » comme restant à faire.
   - Si c'est toujours le cas, **toutes les pages commerciales sont en `noindex, nofollow`**, et `robots.txt` fait `Disallow: /`.
7. **Page d'accueil trop longue** : 16 000 px sur ordinateur (environ 18 écrans) et **23 400 px sur mobile** (environ 28 écrans). Beaucoup de redites entre l'accueil, `/ecosysteme`, `/a-venir` et le footer.
8. **Contraste insuffisant de la couleur de marque.**
   - Blanc sur `#2d73ff` donne 4,19:1, en dessous de 4,5. Cela touche **tous les boutons primaires**, dont « Envoyer ma demande ».
   - Les textes gris du footer donnent 4,18:1.
9. **Faible crédibilité commerciale** :
   - pas de visage ni de fondateur, pas de téléphone ;
   - pas de FAQ, pas de démonstration vidéo ;
   - pas de rubrique sécurité/RGPD dédiée ;
   - `/a-propos` fait 257 mots, `/contact` 102 mots.
10. **Mentions légales incomplètes** :
    - pas de téléphone de l'éditeur ;
    - mention TVA absente (variable non renseignée, d'où le repli « indiquée sur les devis et les factures ») ;
    - registre (RNE/RCS) non nommé ;
    - pas de téléphone de l'hébergeur.

---

## 3. Audit visuel complet

### 3.1 Vue générale

| Critère | Note | Constat |
|---|---|---|
| Première impression | 6/10 | Hero sombre propre, captures réelles bien mises en scène (ordinateur + mobile). En dessous, la page devient un **catalogue de statuts**. |
| Qualité perçue / premium | 5/10 | Bonne exécution CSS, mais le logo « lettre dans un carré » et la police système tirent vers le gabarit générique. |
| Modernité | 6/10 | Grille fine en fond et halos discrets, actuels. Le reste est très « 2021 » : cartes à puces, badges partout. |
| Identité visuelle | 4/10 | Aucune signature graphique propre. Le nouveau logo (ruban, orbite, glow cyan) n'a **aucun écho** dans le site actuel. |
| Cohérence graphique | 4/10 | Chaque section produit change d'univers : bleu (GP), beige et serif (Tools), aubergine (Colors), crème et ambre (Réserves), ardoise (Drone). |
| Hiérarchie | 6/10 | Titres massifs et lisibles, mais trop de niveaux d'information par carte : rôle, badge, accroche, texte, « disponible », « à l'étude », plateformes, lien. |
| Couleurs / contrastes | 5/10 | Bleu de marque à 4,19:1 sur blanc. Or et bleu sans logique. |
| Typographie | 4/10 | Police système et serif de secours ; voir 3.2. |
| Espacements / rythme | 6/10 | Généreux, mais le rythme est monotone : toutes les sections sont construites pareil. |
| Alignements | 6/10 | **Bug visible** dans « Quatre valeurs » (`/a-propos`) : les titres des cartes 3 et 4 sont plus hauts que ceux des cartes 1 et 2. |
| Iconographie | 4/10 | Pas de système d'icônes. Pastilles CSS et lettres seulement. |
| Images | 7/10 | Captures réelles nettes en WebP. **Mais** des placeholders sont visibles pour Réserves. |
| Cartes | 5/10 | Très chargées : 15 à 20 puces par carte d'application sur l'accueil. |
| Boutons / CTA | 6/10 | Formes cohérentes (pilule), mais contraste en dessous de l'AA et libellés multiples pour la même action. |
| Header | 6/10 | 8 liens, plus « Se connecter », plus un CTA : **10 cibles**. Trop dense entre 1024 et 1366 px. |
| Footer | 6/10 | Complet, mais il répète le bloc « Statut des applications » déjà vu trois fois sur la page. |
| Formulaire | 7/10 | Propre, labels clairs, champs optionnels signalés. Aucune réassurance : délai de réponse, interlocuteur. |

### 3.2 Excellent / moyen / amateur / daté / manquant / inutile / à repenser

- **Excellent** :
  - captures réelles dans des cadres d'appareil (hero et onglets Gestion Pro) ;
  - frise « Une chaîne continue » (Bureau → Chantier → Finitions → Réception → Relevé), qui est la **meilleure idée narrative** du site ;
  - configurateur tarifaire (fonctionnel, total en direct).
- **Moyen** :
  - section « Pourquoi ELSATIA » (4 cartes génériques) ;
  - section plateformes (3 cartes « Bientôt ») ;
  - page `/a-propos`.
- **Amateur** :
  - placeholders « EMPLACEMENT CAPTURE » ;
  - titres serif de secours (`ui-serif`, Georgia) dans `/tarifs`, par exemple « Artisan », « Votre estimation », « Périodicité » ;
  - « Grille de référence CANONICAL-V4-2026-09 » affiché au visiteur ;
  - « Ces offres ne sont pas une seconde grille » (jargon interne) ;
  - désalignement des cartes de `/a-propos` ;
  - logo en lettre « E » dans un carré.
- **Daté** :
  - badges de statut à chaque bloc ;
  - listes de puces en « pilules » ;
  - numérotation « 01 / 02 / 03 » des cartes.
- **Manquant** :
  - vrai logo vectoriel et typographie de marque ;
  - preuve visuelle de l'écosystème (schéma interactif) ;
  - vidéo ou démo ;
  - FAQ ;
  - rubrique sécurité/RGPD ;
  - visage de l'équipe ;
  - téléphone et délai de réponse ;
  - essai gratuit ou prise de rendez-vous.
- **Inutile** :
  - `PREUVES` du hero (« 2 applications en ligne », « 5 dans l'écosystème », « 0 € pour Tools ») : ce sont des non-preuves ;
  - triple répétition des statuts (ruban, cartes, footer) ;
  - section « Au-delà des applications » sur l'accueil.
- **À repenser complètement** :
  - architecture de l'accueil ;
  - présentation des produits non disponibles ;
  - identité visuelle (logo, palette, typo) ;
  - pages Drone, Market et Boutique.

---

## 4. Hero / page d'accueil

### 4.1 Test des 5 secondes

| Question | Réponse actuelle | Verdict |
|---|---|---|
| Qu'est-ce qu'ELSATIA ? | « Du bureau au chantier, restez dans ELSATIA. » La phrase suppose qu'on connaît déjà ELSATIA. | ⚠️ Partiel |
| Pour qui ? | « professionnels du bâtiment » dans le sous-titre | ✅ |
| Ce que ça apporte ? | Liste de verbes (piloter, calculer, tracer…), sans bénéfice chiffré ni émotionnel | ⚠️ |
| Quelles applications ? | Ruban des 5 applications en bas du hero, visible seulement après scroll sur laptop | ⚠️ |
| Pourquoi différent ? | « un seul compte », noyé dans le texte | ❌ |
| Action suivante ? | Deux CTA : « Découvrir l'écosystème » (navigation interne, pas une conversion) et « Essayer Tools » (une autre application). **Aucun CTA vers Gestion Pro, le produit payant.** | ❌ |

### 4.2 Nouvelle architecture recommandée du hero

- **Fond** : la nouvelle bannière **déclinée sans texte** (« clean plate »), soit la courbe de la Terre et les arcs lumineux, assombrie à environ 60 % et ancrée en bas du hero. Par-dessus, une grille fine et des halos cyan.
- **Logo** : le symbole « E ruban + orbite » animé une seule fois au chargement (voir §6).
- **Titre H1, en texte HTML et non en image.** Deux options :
  - « **Les outils professionnels du bâtiment, réunis dans un seul écosystème.** » (reprise de la bannière, cohérence immédiate) ;
  - plus orientée bénéfice : « Devis, chantiers, équipes, calculs : tout votre métier dans un seul écosystème. »
- **Sous-titre** : « ELSATIA relie la gestion de l'entreprise, les outils du chantier et le suivi des finitions. Un seul compte, des applications qui se parlent. »
- **CTA principal** : « **Demander une démo de Gestion Pro** ». Il deviendra « Essai gratuit 30 jours » à l'ouverture des souscriptions.
- **CTA secondaire** : « Essayer Tools gratuitement ↗ ».
- **Lien tertiaire** : « Voir les tarifs ».
- **Visuel** : mockup de Gestion Pro sur laptop, plus un téléphone avec Tools, posés « sur » l'orbite. L'orbite relie visuellement les appareils : c'est la métaphore de l'écosystème.
- **Bandeau de confiance sous les CTA** (uniquement des faits vrais) :
  - « Hébergement des données dans l'UE » ;
  - « Conçu en Alsace » (si le fondateur valide) ;
  - « Données isolées par entreprise » ;
  - « Sans engagement mensuel ».
  - **Pas de chiffres inventés.**
- **Rangée des 5 logos de la famille** : icônes homogènes de la nouvelle famille, survol avec halo de la couleur de l'application, statut affiché en simple pastille.

---

## 5. Architecture du site

### 5.1 Inventaire complet (build `89d9add`)

| Route | Type | Statut | Mots | Remarque |
|---|---|---|---|---|
| `/` | Accueil | 200 | 2 316 | 16 000 px (ordinateur) / 23 400 px (mobile) |
| `/ecosysteme` | Marketing | 200 | 3 686 | Le plus long ; très redondant avec l'accueil |
| `/solutions/gestion-pro` | Produit | 200 | 2 335 | Bonne page ; manque FAQ et preuves |
| `/solutions/tools` | Produit | 200 | 1 134 | Bonne page |
| `/solutions/colors` | Produit (validation) | 200 | 766 | Texte très négatif |
| `/solutions/reserves` | Produit (validation) | 200 | 975 | **Placeholders visibles** |
| `/solutions/drone` | Projet | 200 | 521 | « Rien n'en est développé » |
| `/solutions/market` | Projet | 200 | 1 110 | Projet non commencé |
| `/modules/doe` | Module (dév.) | 200 | 592 | |
| `/bibliotheque-technique` | Projet | 200 | 395 | « développement non commencé » |
| `/boutique` | Espace commercial | 200 | 772 | « aucun produit, aucune commande possible » |
| `/a-venir` | Hub projets | 200 | 1 534 | |
| `/tarifs` | Tarifs + configurateur | 200 | 857 | Jargon interne, typo serif |
| `/a-propos` | Institutionnel | 200 | 257 | **Trop pauvre** |
| `/contact` | Conversion | 200 | 102 | Pauvre en réassurance |
| `/mentions-legales`, `/cgv`, `/cgu`, `/confidentialite`, `/cookies` | Légal | 200 | 162 à 801 | Seules pages indexables si `INDEXABLE=false` |
| `/api/contact` | API POST | 405 en GET | — | Correct |
| `/robots.txt`, `/sitemap.xml`, `/icon`, `/apple-icon`, `/favicon.ico` | Technique | 200 | — | |
| `/modules/boutique` → `/boutique`, `/projets` → `/a-venir` | Redirections 308 | — | — | Correctes |
| 404 | `not-found.tsx` | 404 | 21 | **Canonical pointe vers `/`** (à corriger) |

**Header (10 cibles)** : Accueil, Écosystème, Gestion Pro, Tools, Tarifs, À venir, À propos, Contact, Se connecter, Demander une démo.

**Footer (26 liens)** :
- ELSATIA : Accueil, À propos, Contact.
- Applications : Écosystème, GP, Tools, Colors, Réserves, Drone.
- Modules & projets : DOE, Bibliothèque, Market, À venir.
- Ressources : Tarifs, Ouvrir Tools↗, Se connecter à GP↗, Boutique, Démo.
- Juridique : 5 liens.

**Liens morts** : aucun lien interne cassé détecté (tous en 200). Tous les liens externes `target="_blank"` portent `rel="noreferrer"`, qui implique `noopener` : correct.

### 5.2 Problèmes d'architecture

- **5 pages sur 15** décrivent des choses **qui n'existent pas encore** : Drone, Market, Boutique, Bibliothèque, DOE. Le visiteur B2B en conclut que l'entreprise annonce plus qu'elle ne livre.
- **Redondance** : la même information de statut est présente sur l'accueil (ruban, cartes, frise), sur `/ecosysteme` (frise, cartes), sur `/a-venir` et dans le footer.
- « Accueil » dans le menu est inutile, puisque le logo y mène déjà.
- « À venir » en navigation principale met en avant ce qui n'est pas vendable.
- Pas de page **Sécurité & données**, pas de **FAQ**, pas de **Démo** dédiée.

### ÉLÉMENTS À SUPPRIMER OU FUSIONNER

| Élément | Raison | Impact | Recommandation |
|---|---|---|---|
| `/solutions/drone` | Projet « non développé », aucune date ; dessert la crédibilité | Moins de promesses vides | **Supprimer** la page (redirection 308 vers `/a-venir` ou une feuille de route) ; garder une ligne dans la feuille de route |
| `/solutions/market` | Projet non commencé ; marketplace B2C, qui pose des enjeux juridiques (DSA, consommateurs) | Évite d'annoncer un service B2C | **Supprimer** la page publique ; ligne « en réflexion » dans la feuille de route |
| `/boutique` | « Aucun produit, aucune commande possible » | Une boutique vide = signal négatif | **Retirer** du footer et du site (noindex et hors liens) jusqu'à ouverture |
| `/bibliotheque-technique` | « développement non commencé » | | **Fusionner** dans la feuille de route |
| `/modules/doe` | Module en développement de Gestion Pro | | **Fusionner** comme section « Bientôt dans Gestion Pro » de la page GP |
| `/a-venir` | Hub de 1 534 mots consacré à ce qui n'existe pas | | **Remplacer** par une `/feuille-de-route` courte et visuelle (statut, trimestre visé si assumé) |
| Ruban de statuts du hero, `PREUVES` du hero | Non-preuves (« 2 applications en ligne ») | Hero plus net | **Supprimer** |
| Section « Au-delà des applications » (accueil) | Parle de Boutique, Market, Bibliothèque | | **Supprimer** |
| Section « ELSATIA partout où vous travaillez » (3 cartes « Bientôt ») | 2 cartes sur 3 disent « pas encore » | | **Réduire** à une ligne « Web aujourd'hui · iOS & Android en préparation » |
| Bloc « Statut des applications » du footer | Quatrième répétition | | **Supprimer** du footer |
| Sections produit longues de l'accueil (GP, Tools, Colors, Réserves, Drone) | Chacune est une mini-page produit | Accueil divisé par environ 2 | **Fusionner** en une section interactive « Écosystème » (onglets ou carrousel) qui renvoie vers les pages produits |
| « Accueil » dans le menu | Redondant avec le logo | | **Supprimer** |
| « À venir » dans le menu | | | **Remplacer** par « Ressources » ou rien |
| Mentions internes visibles : « CANONICAL-V4-2026-09 », « seconde grille », « Nous préférons le dire clairement… » | Jargon de projet | | **Supprimer** |
| Placeholders « EMPLACEMENT CAPTURE » | Visible en production | | **Supprimer immédiatement**, remplacer par de vraies captures ou rien |

---

## 5 bis. Univers produit ELSATIA

| Produit | Statut réel (code) | Présentation recommandée |
|---|---|---|
| **Gestion Pro** | En ligne, souscription non ouverte | **Produit vedette.** Statut public « Disponible sur démonstration », puis « Essai gratuit » à l'ouverture |
| **Tools** | En ligne, gratuit, sans compte | « Disponible · Gratuit ». Porte d'entrée de l'écosystème (acquisition) |
| **Colors** | Écran de connexion seulement | « Bientôt disponible ». Page courte, positive, avec inscription « Être prévenu » |
| **Réserves** | En validation, non déployé | « Bientôt disponible ». Idem, **sans placeholder** |
| **Studio** | Présent dans le dépôt (`apps/studio`), **absent du site**, mais **cité dans la nouvelle bannière** | ⚠️ **Décision requise** : public ou non. S'il n'est pas public, la bannière doit être déclinée sans « Studio ». |
| **Drone / Scan** | Rien de développé | **Non présenté** (feuille de route uniquement) |
| **Market, Boutique, Bibliothèque, Card/Contact, Social** | Non commencés ou internes | **Non présentés** |

**Statuts publics simplifiés (4 au lieu de 7 libellés actuels)** :
- `Disponible` ;
- `Disponible sur démonstration` ;
- `Bientôt disponible` ;
- (non affiché).

**Section interactive « Comment les applications communiquent »** :
- schéma orbital, ELSATIA (compte unique) au centre et les applications en satellites sur l'orbite ;
- au survol ou au clic d'une application : les flux s'allument. Exemples :
  - « Tools → Gestion Pro : métrés vers devis » (seulement si c'est réel ; sinon libellé « prévu ») ;
  - « Gestion Pro → Réserves : chantier → réception » ;
  - « Colors ↔ Gestion Pro : stocks peinture par chantier » ;
- sur mobile : liste verticale avec connecteurs ;
- **chaque flux affiché doit être vrai ou marqué « prévu »**, à valider produit par produit.

---

## 6. Animations / effets / micro-interactions

Règles communes :
- **CSS d'abord**, avec `@supports (animation-timeline: view())` en amélioration progressive.
- IntersectionObserver en repli, comme aujourd'hui.
- **Aucune bibliothèque lourde** (pas de GSAP ni Framer sauf besoin avéré).
- `prefers-reduced-motion: reduce`, qui coupe tout mouvement non essentiel.
- `transform` et `opacity` uniquement ; aucune propriété de mise en page animée (**CLS = 0** à préserver).

| # | EFFET | EMPLACEMENT | OBJECTIF | IMPACT VISUEL | COÛT PERFORMANCE | MOBILE | ACCESSIBILITÉ | PRIORITÉ |
|---|---|---|---|---|---|---|---|---|
| A1 | **Tracé du logo** : le ruban « E » se dessine (SVG `stroke-dashoffset`), puis l'orbite tourne une fois (≈ 1,2 s) et la sphère s'allume | Hero (une fois par session) | Ancrer la nouvelle marque | Fort | Très faible (SVG inline < 4 Ko) | Oui, version raccourcie | Rien en reduced-motion ; `aria-hidden` | P1 |
| A2 | **Orbite lente** : ellipse fine et sphère lumineuse en rotation très lente (60 s/tour) | Fond du hero, autour du mockup | Signature « écosystème » | Fort | Faible (une seule animation `transform` en CSS) | Oui, amplitude réduite | Coupée en reduced-motion ; pause si onglet masqué | P1 |
| A3 | **Glow / halo respirant** cyan derrière le mockup (opacité 0,5 ↔ 0,7, 8 s) | Hero | Profondeur premium | Moyen | Très faible | Oui | Coupé en reduced-motion | P2 |
| A4 | **Arcs lumineux** (repris de la bannière) qui « voyagent » sur des courbes SVG | Hero et section Écosystème | Lien avec la bannière | Fort | Faible (2 ou 3 `offset-path`) | Simplifiés (1 arc) | Coupés | P2 |
| A5 | **Reveal progressif** (existant) : à conserver, plus court (24 px, 500 ms) et échelonné | Toutes les sections | Rythme | Moyen | Déjà en place | Oui | Déjà conforme | P1 (ajustement) |
| A6 | **Parallaxe légère** de la Terre (bannière) au scroll, en CSS `animation-timeline: scroll()` | Bas du hero | Profondeur | Moyen | Faible (natif, hors thread principal) | Désactivée < 768 px | Coupée | P3 |
| A7 | **Tilt 3D au mouvement de la souris** sur le mockup (±4°) | Hero (ordinateur seulement) | « Wow » contrôlé | Moyen | Faible (rAF throttlé) | **Non** | Coupé ; aucun contenu dépendant | P3 |
| A8 | **Schéma orbital interactif** : applications sur une orbite, flux qui s'allument au survol ou au focus | Nouvelle section Écosystème | Faire comprendre l'écosystème | **Très fort** | Moyen (SVG et un petit composant client, < 8 Ko) | Version liste verticale | Pilotable au clavier (boutons), texte équivalent | **P1** |
| A9 | **Sticky storytelling** « Du bureau au chantier » : l'écran du produit change en restant collé pendant que les 4 étapes défilent | Accueil, section Chaîne | Raconter la journée du client | Fort | Faible à moyen (captures déjà chargées en lazy) | Pile simple sans sticky | Contenu lisible sans animation | P2 |
| A10 | **Cartes : bordure lumineuse au survol** (dégradé conique qui suit le pointeur, couleur de l'application) | Cartes produit et tarifs | Premium, identification | Moyen | Très faible | Remplacé par l'état `:active` | Focus visible identique | P2 |
| A11 | **Boutons primaires** : reflet qui balaie une fois au survol, flèche qui glisse de 3 px | CTA | Micro-interaction | Faible | Nul | État `:active` | `:focus-visible` équivalent | P2 |
| A12 | **Compteurs animés** | Tools (16 outils, 13 familles) **uniquement pour des chiffres vrais** | Dynamisme | Faible | Nul | Oui | Valeur finale lisible par les lecteurs d'écran | P3 |
| A13 | **Captures « vivantes »** : défilement automatique lent dans le cadre de l'appareil (screencast WebM/AVIF < 400 Ko, sans son), ou fondu entre 3 captures | Pages produit | Montrer le produit réel | Fort | Moyen (vidéo lazy, `preload="none"`, poster) | Image fixe sur connexion lente (`saveData`) | Bouton pause ; jamais d'autoplay en reduced-motion | P2 |
| A14 | **Transitions de page** (View Transitions natives : fondu et morphing du logo) | Navigation | Fluidité « app » | Moyen | Nul (natif ; Chrome, Edge, Safari ; Firefox ignore proprement) | Oui | Coupées en reduced-motion | P3 |
| A15 | **Header** : fond translucide flouté qui apparaît après 24 px de scroll, et qui se masque à la descente et réapparaît à la montée sur mobile | Header | Navigation moderne | Moyen | Très faible | Oui | Toujours accessible au focus | P2 |
| A16 | **Hover sur les icônes d'application** : la sphère de l'orbite fait un tour complet (400 ms) | Rangée de logos, cartes | ADN de marque | Faible | Nul | Au toucher (`:active`) | Coupé | P2 |
| A17 | **Particules discrètes** (étoiles fixes scintillantes, ≤ 30 points en CSS) | Fond du hero uniquement | Rappel de la bannière | Faible | Faible | Désactivées < 768 px | Coupées | P3 (optionnel) |

**À proscrire** :
- curseurs personnalisés ;
- scroll-jacking (défilement détourné) ;
- textes qui s'écrivent lettre à lettre ;
- carrousels automatiques rapides ;
- vidéos plein écran en fond ;
- blobs qui se déforment en continu.

---

## 7. UX / parcours utilisateur

| Parcours | Étapes actuelles | Frictions | Amélioration |
|---|---|---|---|
| Visiteur → compréhension | 1 (hero) puis scroll long | Le H1 ne dit pas ce qu'on vend ; 28 écrans sur mobile | Nouveau hero (§4), accueil réduit de moitié |
| Visiteur → découverte produit | 2 (accueil → page produit) | Sur l'accueil, chaque section produit répète la page produit ; statuts anxiogènes | Section Écosystème interactive avec un lien unique par produit |
| Visiteur → tarification | 2 (menu → `/tarifs`) | Jargon (« composition », « canonical »), modules « tarif en cours de validation », aucune action d'achat, typographie serif | 3 offres claires + comparatif + FAQ ; configurateur en second |
| Visiteur → contact / démo | 2 (CTA → formulaire, 8 champs) | Pas de délai de réponse, pas de prise de rendez-vous, pas de téléphone | Réassurance (« réponse sous 24 h ouvrées », « démo de 30 min en visio ») + lien agenda (Cal.com ou équivalent, à valider côté RGPD) |
| Visiteur → connexion | 1 (« Se connecter ») | Le lien disparaît sur 8 pages (logique, mais déroutant) ; il mène uniquement à Gestion Pro | Garder « Se connecter » partout, avec un menu déroulant « Gestion Pro / Tools / … » une fois plusieurs applications ouvertes |
| Client → accès application | 2 | app.elsatia.fr a encore un **favicon Liria** (voir §15) | Unifier l'identité de la connexion |

---

## 8. Mobile / tablette / desktop

Tests Playwright à 320, 375, 430, 768, 1024, 1366, 1920 et 2560 px.

| Constat | Taille | Gravité |
|---|---|---|
| **Scroll horizontal** sur `/ecosysteme` (+20 px) et `/confidentialite` (+34 px) | 320 px | MEDIUM |
| Accueil de 23 400 px, page Gestion Pro de 23 500 px | 375 px | HIGH (UX) |
| 763 éléments de texte < 12 px sur l'ensemble des pages (badges 10 px, étiquettes 11 px) | Toutes | MEDIUM |
| Liens du menu à 21 px de haut (sous la cible de 24 px de WCAG 2.5.8, mais l'espacement compense) | ≥ 1024 px | LOW |
| Header surchargé (10 cibles) | 1024 à 1280 px | MEDIUM |
| Menu mobile : correct (plein écran, numéroté, Échap, focus restitué) | ≤ 768 px | ✅ |
| Grandes largeurs : contenu centré, pas d'étirement | 1920, 2560 px | ✅ |
| Hero mobile : le visuel produit arrive après 2 écrans de texte, CTA et « preuves » | 375 px | MEDIUM |

---

## 9. Accessibilité (axe-core, WCAG 2.2 AA, 21 URL)

| Gravité | Problème | Où | Correctif |
|---|---|---|---|
| **HIGH** | Blanc sur `#2d73ff` = **4,19:1** (< 4,5), **sur tous les boutons primaires** | Partout (bouton d'envoi, 404, plateformes) | Bleu bouton ≥ `#1D4FE0` (6,47:1) ou texte navy sur cyan |
| **HIGH** | `#2d73ff` sur blanc pour les petits textes (eyebrows, étiquettes, 10 à 11 px) = 4,19:1 | Légal, `/a-propos`, `/contact` | Encre `#1D4FE0` |
| MEDIUM | Footer bas : `#68778e` sur `#07101f` = 4,18:1 | Toutes pages | `#8A97AD` (6,5:1) |
| MEDIUM | Date des pages légales `#7a8799` sur fond clair = 3,65:1 ; badges 10 px `#778395` = 3,57:1 | Légal, Tools | Assombrir |
| MEDIUM | `role="tabpanel"` sur un élément non autorisé (CaptureTabs) | GP, Tools | Corriger la sémantique |
| MEDIUM | Texte < 12 px très fréquent | Partout | Minimum 12 px, 13 à 14 px recommandés |
| MEDIUM | Scroll horizontal à 320 px (WCAG 1.4.10 Reflow) | 2 pages | Corriger les débordements |
| LOW | Cibles du menu de 21 px | Ordinateur | `padding-block` |
| LOW | Le contenu masqué par Reveal dépend de JS et d'IntersectionObserver (repli `noscript` présent) ; les captures automatisées montrent des sections vides | Partout | Garder le repli ; l'animation ne doit jamais partir de `opacity: 0` sans JS |
| ✅ | Lien d'évitement, focus 3 px visible, un seul H1, labels, `alt` présents, `lang="fr"`, Échap sur le menu, reduced-motion | | |

**Obligation légale.** Voir §13. L'EAA ne s'applique en principe pas à un SaaS B2B, et l'exemption micro-entreprise s'applique. L'objectif **WCAG 2.2 AA** est tout de même recommandé.

---

## 10. Performance

| Indicateur | Mesure (local, Chromium mobile, CPU ×4) | Verdict |
|---|---|---|
| LCP | 0,66 à 1,0 s | ✅ (prod : ajouter TTFB CDN, environ 50 à 150 ms depuis cdg1) |
| CLS | **0,000** sur toutes les pages | ✅ |
| INP | Non mesurable sans terrain ; peu de JS interactif | ✅ probable |
| JS transféré | environ 160 Ko gz par page ; **environ 300 Ko gz sur `/tarifs`** (configurateur et manifeste) | ⚠️ `/tarifs` |
| CSS | environ 21 à 24 Ko gz | ✅ |
| HTML | 170 à 200 Ko non compressé (accueil, GP), 27 Ko gz ; charge RSC inline dupliquée | ⚠️ Réduire avec un accueil plus court |
| Polices | Système : 0 octet | ✅ perf, ❌ marque |
| Images | WebP 33 à 185 Ko, `next/image`, lazy, `priority` sur le hero | ✅ |
| Préchargement RSC des liens | environ 38 Ko de fetch par page | OK |
| Scripts tiers | **Aucun** | ✅ |
| Cache | `s-maxage=31536000` (statique) | ✅ |
| `X-Powered-By: Next.js` | Exposé | LOW (`poweredByHeader: false`) |

**Budget de la refonte** (à respecter malgré les animations) :
- JS ≤ 200 Ko gz par page marketing ;
- **police variable auto-hébergée ≤ 2 fichiers WOFF2 (≈ 60 Ko)**, `font-display: swap`, préchargée ;
- vidéos lazy ≤ 400 Ko ;
- hero LCP = image AVIF ≤ 120 Ko ;
- **CLS = 0**.

Toutes les animations du §6 respectent ce budget.

---

## 11. SEO

| Élément | État | Action |
|---|---|---|
| **Indexation** | Pages marketing `noindex, nofollow` et `robots.txt` en `Disallow: /`, **sauf si** `NEXT_PUBLIC_SITE_INDEXABLE=true` en prod (non vérifiable ici ; le dernier rapport le liste comme « à faire ») | **P0** : décider et basculer à la mise en ligne de la refonte |
| Title | Uniques, 17 à 69 caractères. « À propos — ELSATIA » et « Contact — ELSATIA » sont trop pauvres | Enrichir |
| Meta description | Uniques ; `/tarifs` (197) et `/a-venir` (175) trop longues ; plusieurs descriptions **négatives** (« Rien n'en est développé ») | Réécrire |
| Canonical | Corrects ; **404 → canonical `/` (erreur)** | Retirer le canonical de la 404 |
| Domaine | `www` → apex en 308 ; canonical apex ✅ | |
| Sitemap | Dynamique ; `lastmod` = date de build (pas de vraie date de modification) | Dates réelles par page |
| OpenGraph | **Même image `og.jpg` pour toutes les pages** ; 1200×800 au lieu de 1200×630 recommandé ; ancienne identité | OG par page, générée à la nouvelle identité |
| Twitter | `summary_large_image` ✅ | |
| Favicon / icônes | Ancien « E » bleu | Nouvelle famille |
| Manifest | **Absent** sur le site vitrine | Facultatif ; à ajouter avec les nouvelles icônes |
| JSON-LD | Organization (logo = `/icon` 64×64, **trop petit** ; Google recommande ≥ 112×112 et idéalement un PNG ou SVG carré), WebSite, SoftwareApplication, Breadcrumb | Logo 512 px ; `sameAs` (LinkedIn…) ; `FAQPage` sur la future FAQ ; `Offer` sur GP à l'ouverture |
| Headings | 1 H1 par page ✅ | |
| Maillage | Fort (footer), mais il pointe vers des pages faibles (projets) | Recentrer sur GP, Tools et Tarifs |
| Pages orphelines | Aucune | |

**Stratégie SEO recommandée (aucun contenu créé à ce stade)** :
- **Pages métier**, avec intention de recherche forte, par exemple :
  - « Logiciel de devis et factures BTP » ;
  - « Logiciel de gestion de chantier » ;
  - « Planning de chantier et équipes » ;
  - « Pointage des heures sur chantier » ;
  - « Application de levée des réserves » (à l'ouverture de Réserves) ;
  - « Calcul d'équerrage, de pente, de surfaces » (pages Tools, une par famille d'outils : fort potentiel longue traîne et gratuit).
- **Pages par corps d'état** : plaquiste, peintre, électricien, maçon, plombier.
- **FAQ** : abonnement, données, export, sécurité, support.
- **Ressources / guides** (plus tard) :
  - « Mentions obligatoires d'un devis BTP » ;
  - « Facturation électronique 2026-2027 pour les artisans ».
  - Gros potentiel : l'obligation de réception des factures électroniques s'applique depuis le 1er septembre 2026, et celle d'émission pour les TPE/PME au 1er septembre 2027.

---

## 12. Conversion / commercial

Ce qui **empêche aujourd'hui une entreprise de devenir cliente** :

1. Impossible de souscrire ou d'essayer Gestion Pro : seule la démo est possible, et l'accueil ne la propose pas en CTA principal.
2. Le site insiste sur ce qui **n'est pas prêt** (environ 300 formulations restrictives sur 8 pages).
3. Aucune **personne** visible : qui est derrière ? quelle expérience du BTP ? où ?
4. Aucune réassurance sur :
   - les données (hébergement UE à afficher clairement, sauvegardes, export, réversibilité) ;
   - le support (canal, délai, horaires) ;
   - l'engagement (mensuel sans engagement : à dire en haut de `/tarifs`).
5. Tarifs : modules « en cours de validation » avec prix affichés mais non commandables, d'où le doute.
6. Pas de **FAQ objections** :
   - « Puis-je importer mes clients ? »
   - « Mes données m'appartiennent-elles ? »
   - « Factur-X / facturation électronique ? »
   - « Fonctionne sans réseau ? »
7. Pas de vidéo ou démo autonome (3 minutes).
8. Pas de logos clients ni de témoignages. **Ne pas en inventer** : lancer un programme pilote et collecter de vrais retours.

---

## 13. Contenu / copywriting

### Problèmes relevés

- **Ton défensif / interne**. Exemples :
  - « Son domaine répond, mais il ne sert aujourd'hui qu'un écran d'ouverture de session : aucune fonction métier n'est ouverte derrière. »
  - « Rien encore. »
  - « Rien n'en est développé : cette page décrit une intention, pas un outil. »
  - « Nous préférons le dire clairement… »
  - « Ces offres ne sont pas une seconde grille »
  - « Grille de référence CANONICAL-V4-2026-09 »
  - « Architecture validée, développement non commencé. »
- **Répétitions** :
  - « un seul compte » (≥ 8 occurrences) ;
  - « Du bureau au chantier » ;
  - les statuts.
- **Formulations faibles** :
  - H1 « Du bureau au chantier, restez dans ELSATIA. » (suppose la marque connue) ;
  - « Pensé pour être simple. Conçu pour durer. » (générique) ;
  - « Applications simples, modernes et sécurisées. »
- **Incohérences** :
  - CGV « période d'essai de 30 jours » et « paiement Stripe » face à « aucune souscription possible » ;
  - le footer dit « 5 applications » (Drone inclus), la bannière cite Studio et non Drone ;
  - statut Gestion Pro « En ligne · commercialisation en préparation » mais tarifs publiés.
- **Ancien branding** : aucune occurrence « Liria » sur le site vitrine ✅. Il en reste dans l'application (voir §15).
- **Fautes** : aucune faute d'orthographe bloquante relevée. Ponctuation française soignée (espaces insécables présents).

### Textes à…

- **réécrire** :
  - H1 et sous-titre de l'accueil ;
  - toutes les pages « en validation » ;
  - descriptions meta négatives ;
  - intro `/tarifs` ;
  - `/a-propos`.
- **raccourcir** :
  - `/ecosysteme` (3 686 mots → environ 1 200) ;
  - accueil (2 316 → environ 1 000) ;
  - cartes produit (15 à 20 puces → 4 à 6 bénéfices).
- **développer** :
  - `/a-propos` (fondateur, histoire, Alsace, terrain) ;
  - `/contact` (réassurance) ;
  - sécurité ;
  - FAQ.
- **supprimer** :
  - jargon interne ;
  - mentions « canonical » ;
  - « EMPLACEMENT CAPTURE » ;
  - textes Drone, Market et Boutique.

---

## 14. Audit légal France / UE

> Ceci n'est **pas un avis juridique**. Les points marqués ⚖️ nécessitent la validation d'un professionnel du droit. Les références citées sont à vérifier sur Légifrance, car la numérotation de la LCEN a changé avec la loi SREN n° 2024-449 : l'ancien art. 6 III correspond à l'**art. 1-1**.

### Matrice

| EXIGENCE | PRÉSENTE | CONFORME | INCOMPLÈTE | ABSENTE | RISQUE | ACTION RECOMMANDÉE |
|---|---|---|---|---|---|---|
| Éditeur : nom, prénom, mention EI, adresse (LCEN art. 1-1 ; C. com. L526-22) | ✅ | ✅ | | | — | — |
| **Téléphone de l'éditeur** (personne physique) | | | | ❌ | Moyen (sanction pénale théorique, art. 1-2) | Ajouter un numéro joignable |
| SIREN/SIRET | ✅ (variable `850 559 873 00011`) | ✅ | | | — | Afficher le SIREN et le SIRET distinctement |
| **Registre** (RNE/RCS/RM) | | | ⚠️ « registre compétent » non nommé | | Faible | Nommer le registre (RNE, ou RCS de Strasbourg/Colmar selon l'activité) |
| **Mention TVA** (n° intracom ou « TVA non applicable, art. 293 B du CGI ») | | | ⚠️ repli « indiquée sur les devis et les factures » | | Moyen | Renseigner `NEXT_PUBLIC_LEGAL_TVA` ⚖️ (expert-comptable) |
| Directeur de publication | ✅ | ✅ | | | — | — |
| Hébergeur : nom, adresse | ✅ | | ⚠️ | | Faible | **Ajouter le téléphone** de Vercel Inc. |
| Politique de confidentialité (RGPD art. 13) : responsable, finalités, bases, durée, destinataires, transferts, droits, CNIL | ✅ | ✅ (globalement) | ⚠️ caractère obligatoire des champs non précisé ; durée des journaux techniques et de la limitation de débit (IP) non précisée ; lien CNIL absent | | Faible | Compléter ; lien `cnil.fr/plaintes` |
| DPO | n/a | | | | — | Non obligatoire a priori ⚖️ |
| Registre des traitements, DPA (Vercel, Brevo) | (hors site) | ? | | | Moyen | Vérifier que les DPA sont signés et le registre tenu |
| Cookies : information | ✅ (`/cookies`) | ✅ | | | — | — |
| Cookies : consentement | n/a (**aucun traceur**) | ✅ | | | — | Pas de bandeau nécessaire tant que rien n'est ajouté |
| Formulaire : information RGPD au point de collecte | ✅ (mention et lien) | ✅ | | | — | Préciser les champs obligatoires et la durée en une ligne |
| CGV B2B (C. com. L441-1) | ✅ | | ⚠️ **taux des pénalités de retard et délai de paiement non indiqués dans les CGV** (renvoi à la facture) ; plafonds de responsabilité renvoyés à un document non publié ; **incohérence essai 30 j / souscription fermée** | | Moyen | Compléter (L441-10, D441-5) ⚖️ |
| Exclusion du droit de la consommation | ✅ | | ⚠️ formulation absolue | | Faible à moyen | Nuancer (L221-3 : pros de ≤ 5 salariés hors champ d'activité principale, contrats hors établissement) ⚖️ |
| Conditions d'abonnement, renouvellement, résiliation | ✅ (CGV art. 7) | ✅ (B2B) | | | — | La résiliation « en 3 clics » (L215-1-1) ne vise que les consommateurs et non-professionnels, mais c'est une bonne pratique |
| **Data Act** (Règl. 2023/2854, ch. VI, depuis le 12/09/2025) : changement de fournisseur, export, frais de sortie | | | ⚠️ réversibilité présente (art. 8) mais pas de clause de « switching » | | Moyen | Clause dédiée ⚖️ (frais de sortie interdits dès le 12/01/2027) |
| CGU du site | ✅ | ✅ | | | — | — |
| Médiation de la consommation | n/a (B2B) | | | | — | À prévoir **si** Boutique ou Market ouvert aux particuliers |
| Droit de rétractation | n/a (B2B) | | | | — | Idem |
| Propriété intellectuelle : marque ELSATIA | Mentionnée | ? | | | **Moyen** | Vérifier le **dépôt INPI** (classes 9, 35, 42) ⚖️ |
| **Droits sur le nouveau logo et la nouvelle bannière** | | | | ❓ | **Moyen** | Vérifier la chaîne de droits : auteur, cession ou licence, et conditions de l'outil si généré par IA ; images de la Terre (source, licence) |
| Licences de polices | n/a (système) | ✅ | | | — | Choisir une police sous licence OFL pour la refonte |
| Licences des bibliothèques | Next.js, React (MIT) | ✅ | | | — | — |
| Newsletter / e-mailing | Absent | n/a | | | — | Si ajout : case non pré-cochée, preuve stockée dans Brevo, désinscription |
| Accessibilité (EAA, loi 2023-171) | | | | | Faible | Hors champ a priori (B2B, micro-entreprise) ⚖️. Objectif WCAG 2.2 AA quand même |
| Accessibilité (RGAA, déclaration) | n/a | | | | — | Non obligatoire (seuil de 250 M€) |
| AI Act (art. 50, depuis le 02/08/2026) | n/a sur le site | | | | — | Si un chatbot est ajouté au site : indiquer qu'il s'agit d'une IA |

### LEGAL_MANQUANT=

1. Téléphone de l'éditeur.
2. Mention TVA définitive.
3. Nom du registre d'immatriculation.
4. Téléphone de l'hébergeur.
5. CGV : taux des pénalités de retard et délai de paiement ; plafonds de responsabilité publiés ; cohérence essai/souscription ; clause Data Act de changement de fournisseur.
6. Confidentialité : caractère obligatoire des champs, durée des journaux, lien CNIL.
7. Vérification de la marque INPI et de la chaîne de droits du nouveau logo et de la nouvelle bannière.

### RGPD_STATUS=

Globalement conforme pour un site vitrine sans traceur. Il reste quelques compléments d'information (art. 13) et, hors site, la tenue du registre et la signature des DPA à confirmer.

---

## 15. Cookies : test technique (Playwright)

| Étape | Cookies | localStorage | sessionStorage | Requêtes tierces | Trackers / analytics |
|---|---|---|---|---|---|
| 1. Arrivée sans consentement (21 URL, dont la 404) | **0** | **0 clé** | **0 clé** | **0 hôte tiers** | **Aucun** |
| 2. « Refuser » | — | — | — | — | Pas de bandeau : étape **sans objet** |
| 3. « Accepter » | — | — | — | — | Sans objet |
| 4. « Modifier le choix » | — | — | — | — | Sans objet |

Constats complémentaires :
- aucune police Google, aucune vidéo intégrée, aucun reCAPTCHA ;
- aucun script Brevo côté navigateur : l'envoi se fait côté serveur ;
- la CSP interdit techniquement toute ressource tierce (`default-src 'self'`) ; même une intégration accidentelle serait bloquée.

**Réserve** : test réalisé sur le build du commit déployé, pas sur le domaine lui-même. Si Vercel Web Analytics ou Speed Insights était activé côté tableau de bord, il faudrait **aussi** l'injecter dans le code, ce qui n'est pas le cas. Un contrôle sur le domaine réel est à refaire dès que le réseau le permet.

```
COOKIE_STATUS=CONFORME — aucun traceur, aucun cookie, bandeau inutile à ce jour.
Si un outil de mesure est ajouté : Vercel Web Analytics (sans cookie) avec mention dans la politique,
ou CMP avec « Tout refuser » au même niveau que « Tout accepter », choix conservé 6 mois,
traceurs ≤ 13 mois, blocage avant consentement, lien « Gérer mes cookies » en pied de page.
```

---

## 16. Sécurité du site public

| Point | État | Gravité / action |
|---|---|---|
| HTTPS / HSTS | 2 ans, sans `includeSubDomains` (choix documenté) | ✅ |
| CSP | Stricte ; `script-src 'unsafe-inline'` (contrainte du prérendu Next sans nonce, documentée) | LOW. Acceptable pour une vitrine statique sans données utilisateur |
| X-Frame-Options, COOP, CORP, Referrer-Policy, Permissions-Policy, nosniff | ✅ | — |
| `X-Powered-By: Next.js` | Exposé | LOW : `poweredByHeader: false` |
| Cookies Secure/HttpOnly/SameSite | Aucun cookie | ✅ |
| CORS `/api/contact` | JSON, donc prévol bloqué en cross-origin | ✅ |
| Formulaire : injection, XSS | Liste blanche des sujets, échappement HTML, longueurs bornées | ✅ |
| **Anti-spam** | Honeypot et horodatage **fournis par le client** (falsifiables) ; **limitation de débit en mémoire** (inefficace sur des fonctions serverless multi-instances ; la Map n'est jamais purgée) | MEDIUM : limitation de débit via Vercel Firewall/WAF, ou un KV/Upstash, et Cloudflare Turnstile (sans cookie, à mentionner dans la politique) |
| Open redirect | Aucune redirection paramétrable | ✅ |
| `target=_blank` | `rel="noreferrer"` | ✅ |
| Dépendances | Next 16.3.0, React 19.2.8 (récents) | Lancer `npm audit` régulièrement (non bloquant) |
| Source maps | Serveur uniquement (non exposées) | ✅ |
| Fichiers oubliés | 4 rapports `.md` à la racine du dépôt, **non servis** | ✅ (hygiène : les ranger dans `docs/`) |
| Variables publiques | `NEXT_PUBLIC_*` = URL, indexabilité, SIRET : aucune donnée sensible | ✅ |
| Secrets | `BREVO_API_KEY` uniquement côté serveur, type « sensitive » sur Vercel | ✅ |
| robots.txt | Ne révèle rien | ✅ |

---

## 17. Confiance / crédibilité

| Élément | Présent | Commentaire |
|---|---|---|
| Identité société | ✅ (EI, Rhinau, SIRET), seulement dans les mentions | La remonter dans `/a-propos` et le footer (« ELSATIA — Rhinau, Alsace ») |
| Contact | E-mail support, formulaire | **Pas de téléphone**, pas de délai de réponse |
| Support | Non décrit | Créer un bloc « Support » (canal, horaires) |
| Sécurité | 1 carte « Sécurisé » | Créer une page dédiée (isolation des données, chiffrement, sauvegardes, hébergement UE de l'application, export) |
| Hébergement | Vercel US (site), données UE (application) | À dire clairement et positivement |
| RGPD | Politique présente | Ajouter un résumé visuel en 5 points |
| Témoignages, références | Aucun | ✅ ne rien inventer ; lancer un **programme pilote** |
| Chiffres | Aucun chiffre justifiable hors catalogue Tools | OK |
| Captures produit | ✅ réelles | Point fort à amplifier (vidéo, démo) |
| Transparence tarifaire | ✅ forte | À simplifier |
| Statut des produits | Trop détaillé | Simplifier (§5 bis) |

**Verdict.** Le site est *honnête* mais **pas encore rassurant**. Il manque **une personne, un téléphone, une promesse de support et une page sécurité**.

---

## 18. Benchmark visuel (sans copie)

| Référence | Bonne idée applicable à ELSATIA |
|---|---|
| Linear | Hero sombre, promesse en une ligne, **vraie interface** en perspective avec un halo : c'est exactement le registre du nouveau logo |
| Vercel | Schémas de plateforme en lignes fines : inspiration pour le **schéma orbital** de l'écosystème |
| Stripe | Carte « plateforme » modulaire et pricing exemplaire, transparent |
| Raycast / Attio | Grilles « bento » de fonctionnalités ; démos interactives |
| Notion | Onglets par métier, d'où l'idée d'onglets par corps d'état |
| Procore | Navigation par rôle (dirigeant, conducteur de travaux, compagnon) |
| Fieldwire | Téléphone en main sur chantier ; offre gratuite en porte d'entrée (= Tools) |
| Obat / Tolteck / Batappli | Pour les TPE du BTP : **essai gratuit en CTA principal**, tarifs mensuels simples, **téléphone mis en avant**, avis vérifiés |
| Graneet | Esthétique start-up, angle marge et rentabilité, aperçu des modules |

**Tendances 2026 retenues** :
- bento grids sobres ;
- halos et dégradés « aurora » maîtrisés ;
- bordures fines ;
- CSS scroll-driven animations (Chrome, Edge, Safari 26 ; Firefox derrière un flag, donc en amélioration progressive) ;
- View Transitions (même document : base commune ; entre documents : pas Firefox) ;
- démos produit interactives.

**À éviter pour un public BTP** : surcharge d'effets, contraste faible, texte minuscule. Le site doit rester lisible **dehors, au soleil, sur téléphone**.

---

## 19. IDENTITÉ VISUELLE À MIGRER

### 19.1 Évaluation des nouveaux assets

#### NOUVEAU_LOGO

- **Construction** :
  - un « E » en ruban plié (3 bras, terminaisons biseautées à environ 35°) ;
  - dégradé blanc → bleu roi → cyan/turquoise ;
  - **orbite elliptique** traversant le E, avec une **sphère lumineuse** à droite ;
  - mot-symbole « ELSATIA » en capitales géométriques, très espacées ; « A » sans barre ; triangle cyan dans le second A.
- **Qualités** : moderne, mémorisable ; métaphore claire de l'écosystème (orbite, satellite) ; très premium sur fond sombre.
- **Limites techniques** :
  - **raster uniquement** (aucun SVG) ;
  - **fond navy incrusté** (non détourable proprement) ;
  - effets de lueur et de dégradés **non reproductibles en petit** : à 16 et 32 px, l'orbite fine disparaît et le ruban devient une tache ;
  - **pas de version claire, monochrome ou compacte** ;
  - mot-symbole non vectorisé : risque de dérive typographique.
- **Indispensable avant intégration** : **redessin vectoriel** (SVG maître) du symbole et du mot-symbole, avec une grille de construction.

#### NOUVELLE_BANNIERE

- **Contenu** :
  - logo complet à gauche ;
  - filet vertical ;
  - accroche « Les outils professionnels réunis dans **un seul écosystème**. » ;
  - liste « Gestion Pro • Tools • Colors • Studio • Réserves » ;
  - fond : Terre de nuit, arcs lumineux, sphère.
- **Ratio 2,63:1, texte incrusté**. Conséquences :
  - inutilisable telle quelle en hero responsive (texte illisible sur mobile, non indexable, non accessible) ;
  - inadaptée à OpenGraph (1,91:1) ;
  - **liste de produits figée**, qui **cite Studio** (absent du site) et omet Drone : elle deviendra fausse à chaque évolution de la gamme.
- **Usage recommandé** :
  - telle quelle : **couverture LinkedIn/X**, signature de présentation, slide de titre ;
  - en **version « clean plate »** (fond seul, sans logo ni texte) : fond du hero, des sections institutionnelles et du footer, et base des images OG.
- **Ne pas l'étirer ni la recadrer brutalement** : elle doit être déclinée (voir 19.3).

### 19.2 Tableau de migration

| ASSET_ACTUEL | EMPLACEMENT | REMPLACEMENT_RECOMMANDÉ | NOUVEL_ASSET | ACTION | SUPPRESSION_OU_CONSERVATION |
|---|---|---|---|---|---|
| Logo « E » blanc sur carré `#2d73ff` (CSS `.brandMark` + texte « ELSATIA » 14 px) | `elsatia-site` : `site-header.tsx`, `site-footer.tsx`, `site-shell.module.css` | Logo horizontal (symbole + mot-symbole) SVG, variantes sombre et claire | `elsatia-logo-horizontal-{dark,light}.svg` | Remplacer | **Supprimer** le style `.brandMark` |
| `AppMark id="elsatia"` (« E » sur carré bleu) | Hero de l'accueil, `/ecosysteme` | Symbole ELSATIA animé (SVG) | `elsatia-symbol.svg` | Remplacer | **Supprimer** la variante |
| `src/app/icon.tsx` (ImageResponse 64×64, « E » Arial sur `#2d73ff`) | Site | Favicon SVG adaptatif, plus PNG 32/48/192/512 | `icon.svg`, `icon-{32,192,512}.png` | Remplacer | **Supprimer** `icon.tsx` |
| `src/app/apple-icon.tsx` (180×180) | Site | Apple touch 180 (symbole sur navy, sans transparence) | `apple-icon.png` | Remplacer | **Supprimer** |
| `src/app/favicon.ico` (« E » blanc sur bleu) | Site | ICO 16/32/48 avec **symbole simplifié** (ruban plein, sans orbite fine) | `favicon.ico` | Remplacer | **Supprimer** l'ancien |
| `public/og.jpg` (1200×800, « ELSATIA » fin + « Solutions numériques pour les professionnels », cartes bleues) | Toutes les pages (OG/Twitter) | OG 1200×630 générées **par page** à partir du clean plate de la bannière, avec titre en texte | `og/default.png` + générateur `opengraph-image.tsx` par route | Remplacer | **Supprimer** `og.jpg` (texte obsolète) |
| JSON-LD `Organization.logo` = `/icon` (64 px) | `structured-data.ts` | Logo carré 512 px | `/brand/elsatia-logo-512.png` | Mettre à jour | — |
| AppMarks Gestion Pro, Tools, Colors, Réserves, Drone (CSS) | `app-mark.tsx` / `.module.css`, cartes, ruban, frise, footer | Icônes de la nouvelle famille (§20) | `apps/{gp,tools,colors,reserves,studio}.svg` | Remplacer | **Supprimer** la variante Drone (produit non présenté) |
| Accent or `#c9a24a` / `--gold`, `--gold-ink` | `globals.css` du site | Cyan de marque | Tokens `--brand-cyan-*` | Remplacer | **Supprimer** l'or comme couleur de marque du site |
| Police système et `--font-display: ui-serif, Georgia` | `globals.css` | Police variable auto-hébergée (§21) | WOFF2 | Remplacer | **Supprimer** le serif de secours |
| Fond hero « grille et halos bleus » | `page.module.css` | Clean plate de la bannière, grille, halos cyan | `brand/banner-clean-{desktop,tablet,mobile}.avif` | Remplacer | Conserver la grille fine |
| **Gestion Pro (app.elsatia.fr)** : `src/app/favicon.ico` = **ancien logo LIRIA « LG »** | `Appli_BTP` / branche `release/commercialisation-v1` | Favicon Gestion Pro (nouvelle famille) | `favicon.ico` | **Remplacer en priorité** | **Supprimer** (image Liria visible par les clients) |
| GP : `src/app/icon.svg` et `public/icons/icon-*.png` (navy `#0d1b2a`, mot « ELSATIA » Arial, filet or) | Release | Icône d'application Gestion Pro (famille) | `icon.svg`, `icon-{192,512}`, `maskable-512` | Remplacer | **Supprimer** les anciennes |
| GP : **aucun apple-icon** | Release | Apple touch 180 | `apple-icon.png` | Ajouter | — |
| GP : `BrandWordmark` (texte « ELSATIA » + sous-titre or 9 px) | Sidebar, login | Logo horizontal Gestion Pro SVG | — | Remplacer | Conserver le composant, changer le rendu |
| GP (`main`) : `public/liria-gestion-pro-logo{,-v5}.png`, `public/icons/liria-*.png`, `liria-gestion-pro-v3-*.png`, `src/app/icon.png` et `apple-icon.png` Liria, `manifest` « Liria Gestion Pro » | `Appli_BTP/main` | — | — | La branche `main` est en retard sur la release : à aligner | **Supprimer** à la prochaine fusion de la release |
| `public/videos/Liria_Gestion_Pro_*`, `public/guides/Guide_utilisation_Liria_Gestion_Pro*.pdf` (dont un doublon « 2.pdf ») | `Appli_BTP/main` | Guides et vidéos re-brandés ELSATIA | — | Refaire | **Supprimer** des fichiers publics (ou archiver hors `public/`) |
| `output/**/liria-*`, `output/archive/brand/*` | `Appli_BTP` | — | — | — | **Archiver** hors dépôt, ou laisser en archive interne non servie |
| Tools : `icon.svg` ambre `#f5aa22` + « E » navy + flèche ; marque CSS « E » Georgia ; `og-tools.png` | `apps/tools` | Icône Tools (famille) | — | Remplacer | **Supprimer** l'« E » Georgia |
| Colors : `colors-icon.svg` aubergine + 3 pastilles + sourire | `apps/colors` | Icône Colors (famille) | — | Remplacer | Supprimer |
| Réserves : **aucune icône** ; manifest sans `icons` ; `theme_color #1f4f8f` ≠ `#10201f` | `apps/reserves` | Icône Réserves (famille) | — | Créer | Corriger l'incohérence |
| Studio : **aucune icône**, aucun manifest | `apps/studio` | Icône Studio (famille) | — | Créer | — |
| Textes incrustés : `og.jpg` (« Solutions numériques pour les professionnels ») ; bannière (liste de produits) | Site, réseaux | Texte en HTML ou généré | — | — | `og.jpg` à **supprimer** ; bannière à **décliner** |

### 19.3 DECLINAISONS_A_CREER

**Logo mère (SVG maître, puis exports)** :
1. Symbole seul : couleur sur fond sombre ; couleur sur fond clair (ruban plus saturé, orbite bleu roi) ; mono blanc ; mono navy.
2. Symbole **simplifié petite taille** (≤ 32 px) : ruban en aplats (2 tons), orbite épaissie ou supprimée, sphère conservée en point.
3. Logo horizontal (symbole à gauche, mot-symbole à droite) : sombre, clair, mono.
4. Logo vertical (symbole au-dessus, mot-symbole dessous), comme le fichier fourni, en version **transparente**.
5. Mot-symbole seul.

**Favicon et icônes** :
- `favicon.ico` 16/32/48 ;
- `icon.svg` (avec `prefers-color-scheme`) ;
- PNG 192 et 512 ;
- maskable 512 (zone de sécurité de 80 %) ;
- apple-touch 180 (fond navy plein).

**Bannière** :
- clean plate desktop 2560×1100 ;
- tablette 1536×1200 ;
- mobile 1080×1600 (Terre recentrée en bas) ;
- OG 1200×630 ;
- LinkedIn 1584×396 ;
- X 1500×500 ;
- carré 1080×1080 ;
- signature e-mail 600×150.

**Formats** :
- SVG (logos) ;
- AVIF et WebP (fonds, ≤ 120 Ko desktop, ≤ 60 Ko mobile) ;
- PNG (OG, icônes).

**Zone de protection** : égale à la hauteur de la barre centrale du « E » sur les 4 côtés.

**Tailles minimales** :
- logo horizontal ≥ 120 px de large (écran), 30 mm (impression) ;
- symbole ≥ 24 px, ou version simplifiée en dessous.

---

## 20. ELSATIA_LOGO_FAMILY_V1

### 20.1 Audit des logos actuels

| APP | LOGO_ACTUEL | QUALITÉ | COHÉRENCE_AVEC_NOUVEAU_LOGO | PROBLÈMES | À_CONSERVER | À_MODIFIER | À_SUPPRIMER | NOUVELLE_DIRECTION |
|---|---|---|---|---|---|---|---|---|
| **ELSATIA (site)** | « E » blanc Arial dans un carré bleu `#2d73ff`, glow bleu | 3/10 | 1/10 | Gabarit générique, typo système, aucun lien avec le ruban et l'orbite | Bleu comme famille chromatique | Tout | Carré « E » | Nouveau logo mère |
| **Gestion Pro** | App : tuile navy `#0d1b2a` + « ELSATIA » Arial + filet or. Site : « E » bleu + filet or. **Favicon prod : Liria** | 3/10 | 1/10 | **Deux logos différents** (site ≠ application) ; or hors palette ; **Liria encore visible** ; illisible en petit (mot complet dans l'icône) | Navy comme fond | Tout | Favicon Liria, filet or, mot dans l'icône | Dérivé du symbole, accent indigo |
| **Tools** | Tuile ambre `#f5aa22`, « E » géométrique navy, flèche crème (règle) ; marque UI : « E » **Georgia** | 6/10 | 3/10 | Seul vrai pictogramme métier (la règle) ; mais « E » serif dans l'interface ≠ « E » géométrique de l'icône ; ambre trop proche de Réserves | **Couleur ambre**, idée de la règle | Construction | « E » Georgia | Dérivé : équerre et règle, accent ambre |
| **Colors** | Tuile aubergine `#44264d`, 3 pastilles (corail, jaune, menthe), arc « sourire » | 5/10 | 2/10 | Style « illustration » différent ; sourire enfantin ; 4 couleurs dans une icône | **Corail** comme accent, idée de nuancier | Construction | Sourire, aubergine | Dérivé : éventail de nuancier, accent corail |
| **Réserves** | Carré ambre `#e0952f` + contour intérieur sur ardoise `#10201f` (CSS) ; **aucun favicon, aucune icône PWA** | 2/10 | 1/10 | Abstrait (illisible), **ambre en conflit avec Tools**, manifest incohérent | Idée du « jalon » | Tout | Ambre | Dérivé : repère et coche, accent émeraude |
| **Studio** | Texte « ELSATIA / Studio. » avec point vert `#729054` ; **aucune icône** | 2/10 | 1/10 | Pas de symbole | Le point final (clin d'œil à la sphère) | Tout | — | Dérivé : cadre et étincelle, accent violet ⚖️ (positionnement de Studio à confirmer) |
| **Drone** (site uniquement) | Cercle pointillé, anneau `#4a7fa5` | 2/10 | 2/10 | Produit non présenté | — | — | **Toute la marque Drone sur le site** | Réservé pour plus tard (accent ciel) |

### 20.2 Stratégie retenue (recommandation)

Options étudiées :
- (a) symbole commun + couleur seule : **rejeté**, différenciation insuffisante et non accessible aux daltoniens ;
- (b) symbole commun + monogramme (G, T, C, R, S) : **rejeté**, banal et collisions de lettres ;
- (c) même contour, cœur différent ;
- (d) pictogramme métier dans la même grille.

**Retenue : (c)+(d), « même orbite, cœur métier ».**

- **Élément commun (ADN)** :
  - tuile carrée navy à coins arrondis (rayon de 22 % du côté) ;
  - **orbite elliptique** identique (même inclinaison de −18°, même épaisseur, même ouverture) ;
  - **sphère satellite** identique en position et en taille.
  - L'orbite et la sphère *sont* ELSATIA.
- **Élément distinctif** : à la place du « E », un **pictogramme métier** dessiné **avec la grammaire du ruban** : bandes pleines à terminaisons biseautées à 35°, 2 ou 3 bandes maximum, dégradé de l'accent de l'application vers le blanc.
- **Couleur** : chaque application a un accent ; la sphère prend l'accent ; le navy et l'orbite restent communs.
- **Le logo mère** garde le « E » ruban : c'est le seul à porter la lettre.

Résultat : 5 tuiles côte à côte, même fond, même orbite, même sphère, même style de ruban. On voit une famille ; le cœur et la couleur identifient l'application.

### 20.3 Règles

```
LOGO_MERE=
  Symbole « E ruban » + orbite + sphère. Mot-symbole ELSATIA (capitales géométriques,
  A sans barre, triangle cyan). Versions : vertical, horizontal, symbole, simplifié ≤32 px.

STRUCTURE_COMMUNE=
  Grille 48×48 unités. Tuile 48u, rayon 10,5u (22 %). Zone utile du cœur : 28×28u centrée,
  décalée de −1u vers la gauche (l'orbite occupe la droite). Orbite : ellipse 40×16u,
  inclinée de −18°, trait de 1,75u, ouverte sur environ 25 % derrière le cœur (effet « passe derrière » / « passe devant »).
  Sphère : diamètre 5u à 2 h sur l'orbite.

REGLES_GEOMETRIQUES=
  Terminaisons des rubans biseautées à 35°. 3 bandes maximum par cœur. Épaisseur de bande 6u.
  Rayons intérieurs 3u. Pas de trait fin < 1,5u (lisibilité à 32 px). Pas de texte dans l'icône.

REGLES_TYPOGRAPHIQUES=
  Mot-symbole « ELSATIA » vectorisé (non éditable). Nom d'application dans la police de
  marque (§21), graisse Medium, même hauteur de capitale que le mot-symbole, approche normale.
  Horizontal : [symbole] ELSATIA | Gestion Pro  (filet vertical 1px cyan à 40 % entre les deux, comme sur la bannière).
  Version compacte : [icône d'application] Gestion Pro.

REGLES_COULEURS=
  Fond de tuile commun : Navy 950 #060D24 → Navy 800 #0B1A45 (dégradé radial léger).
  Orbite commune : blanc à 85 %. Sphère : couleur d'accent, glow de l'accent à 40 %.
  Cœur : dégradé accent → blanc (vers le haut à gauche).
  Version claire : tuile blanche, bordure #E3E8F5, cœur en accent « ink », orbite navy.
  Monochrome : tout en blanc (sur sombre) ou en navy (sur clair), sans dégradé.

REGLES_VARIANTES=
  Pour chaque application : icon (tuile), icon simplifiée ≤32 px (cœur en aplat, orbite épaissie
  à 2,5u, sphère conservée), horizontal, vertical, dark, light, mono, favicon .ico, PWA 192/512,
  maskable 512, apple 180, splash.

REGLES_ANIMATION=
  1. Apparition : la tuile en fondu (150 ms) → le cœur se trace (stroke-dashoffset, 600 ms)
     → l'orbite se dessine de gauche à droite (500 ms) → la sphère s'allume (glow 0→1, 200 ms).
  2. Hover : la sphère parcourt l'orbite en un tour complet (400 ms, ease-out), sans autre mouvement.
  3. Chargement : la sphère tourne en continu sur l'orbite (1,2 s/tour) ; le cœur reste fixe.
  4. Passage mère → application : morphing du « E » vers le cœur métier (View Transition,
     orbite et sphère immobiles = continuité de marque).
  5. Respect de reduced-motion : état final immédiat. Jamais de rotation de l'icône entière,
     jamais de rebond.
```

### 20.4 Fiches par application

| APP | LOGO_ACTUEL | PROPOSITION | ELEMENT_COMMUN | ELEMENT_DISTINCTIF | COULEUR (accent / ink texte) | VERSION_ICON | VERSION_HORIZONTAL | VERSION_DARK | VERSION_LIGHT | FAVICON | ANIMATION | À_SUPPRIMER |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ELSATIA** (mère) | Carré « E » bleu | Logo fourni, vectorisé | Orbite + sphère + tuile | « E » ruban | Bleu roi `#2F6BFF` → Cyan `#22D3EE` / ink `#1D4FE0` | Tuile navy + E | Symbole + ELSATIA | Fond navy, ruban dégradé | Fond blanc, ruban `#1D4FE0`→`#0E7490` | E simplifié 2 tons | Tracé + orbite | `.brandMark`, `icon.tsx`, `og.jpg` |
| **Gestion Pro** | Navy + mot + or / favicon Liria | **3 bandes ascendantes** (les bras du E redressés en histogramme) = pilotage | Idem | Histogramme ruban | Indigo `#5B6CFF` / ink `#3651E0` | Tuile + barres | Symbole GP · ELSATIA Gestion Pro | ✅ | ✅ | Barres en aplat | Les barres montent une à une | Favicon Liria, filet or, `icon.svg` mot-symbole |
| **Tools** | Ambre + E + règle | **Équerre** (2 bandes à 90°) avec graduation en encoche | Idem | Équerre | Ambre `#F5A524` / ink `#9A5B00` | ✅ | ✅ | ✅ | ✅ | Équerre en aplat | L'équerre pivote de 0 à 90° une fois | « E » Georgia, flèche crème |
| **Colors** | Aubergine + 3 pastilles + sourire | **Éventail de nuancier** (3 lames de ruban décalées en éventail) | Idem | Nuancier | Corail `#FF6B7A` / ink `#C0283E` | ✅ | ✅ | ✅ | ✅ | 3 lames | Les lames s'ouvrent en éventail | Aubergine, sourire, 4 couleurs |
| **Réserves** | Carré ambre | **Repère de plan + coche** (goutte ruban avec coche en réserve) = réserve levée | Idem | Repère et coche | Émeraude `#10B981` / ink `#047857` | ✅ | ✅ | ✅ | ✅ | Repère et coche | La coche se trace | Ambre (conflit avec Tools) |
| **Studio** ⚖️ | Texte + point vert | **Cadre + étincelle** (angle de cadre en ruban et étoile à 4 branches) = création | Idem | Cadre et étincelle | Violet `#8B5CF6` / ink `#6D28D9` | ✅ | ✅ | ✅ | ✅ | Étincelle | L'étincelle scintille une fois | — |
| *(Drone, plus tard)* | Cercle pointillé | Mire ou réticule | Idem | Réticule | Ciel `#38BDF8` / ink `#0369A1` | — | — | — | — | — | — | Marque Drone actuelle du site |

**Contrastes vérifiés** (WCAG) :
- les accents vifs sont réservés aux surfaces, icônes et fonds sombres : tous ≥ 4,2:1 sur navy `#060D24` ;
- les versions **« ink »** servent au texte sur fond blanc : toutes ≥ 5,3:1.
- le cyan `#22D3EE` ne s'emploie **jamais en texte sur blanc** (1,81:1).

### 20.5 Couleurs : décision recommandée

Une **couleur de marque commune** (navy, bleu roi, cyan) **plus un accent par application**. C'est la seule option qui fonctionne à la fois dans les interfaces des applications, sur le site, en impression et dans les favicons.

- **Impression** : prévoir des équivalents Pantone ou CMJN à l'exécution graphique. Les dégradés et glows ont une version en aplat.
- **Interfaces des applications** : l'accent sert aux éléments actifs. Le navy et le neutre sont communs.

---

## 21. DESIGN_DIRECTION (aperçu du futur site)

**Concept** : « **Orbite** ». L'écosystème comme système solaire sobre, avec ELSATIA au centre et les applications en satellites. Sombre et lumineux en haut de page (marque, émotion) ; clair et très lisible plus bas (produit, chantier, soleil).

```
NOUVELLE_PALETTE=
  Navy 950  #060D24   fonds principaux sombres (hero, footer)
  Navy 900  #0A1633   sections sombres secondaires
  Navy 800  #0B1A45   cartes sur fond sombre
  Bleu roi  #2F6BFF   couleur de marque (surfaces, icônes)
  Bleu ink  #1D4FE0   boutons primaires (blanc dessus = 6,47:1) et liens sur blanc
  Cyan      #22D3EE   accents lumineux sur sombre, halos, sphère, mots-clés du H1
  Cyan ink  #0E7490   cyan lisible sur blanc
  Glace     #EAF1FF   fonds clairs teintés
  Papier    #F6F8FC   fonds clairs neutres
  Ardoise   #5B6B85   texte secondaire sur clair (≥ 4,5:1) ; #8A97AD sur sombre
  Blanc     #FFFFFF
  + accents d'application (§20.4). L'or #c9a24a est retiré de la marque.

NOUVEAUX_GRADIENTS=
  « Ruban »  : linear 135° #FFFFFF → #2F6BFF → #22D3EE (titres clés, rubans, bordures actives)
  « Aube »   : radial à 50 % 100 %, #22D3EE à 18 % → transparent (lever de Terre en bas du hero)
  « Nuit »   : linear 180° #060D24 → #0A1633 (sections sombres)
  « Halo »   : radial #2F6BFF à 35 % → transparent, flou de 120 px, derrière les mockups
  Bordure lumineuse : conic-gradient (accent → transparent) sur les cartes au survol

NOUVEAUX_EFFETS=
  Grille fine (1 px, blanc à 4 %), étoiles discrètes, arcs lumineux, verre dépoli léger sur le header
  (backdrop-filter, repli opaque), ombres colorées très diffuses. Aucun effet néon saturé.
```

- **Typographie** :
  - une **police variable géométrique-humaniste** sous licence OFL, auto-hébergée (`next/font/local`, conforme à la CSP `font-src 'self'`) ;
  - candidates à valider : *Manrope*, *Plus Jakarta Sans*, *Sora* (plus proche du mot-symbole, pour les titres) avec *Inter* pour le texte ;
  - recommandation : **Sora (titres, 600 à 700) + Inter (texte)**, ou *Manrope* seule pour un poids minimal ;
  - plus de serif ; corps de texte ≥ 16 px ; libellés ≥ 12 px.
- **Backgrounds** :
  - hero : clean plate de la bannière (la Terre), grille, halo ;
  - sections produit : fond clair « papier » avec un **liseré de l'accent** de l'application (et non un fond entier coloré) ;
  - sections de transition : sombres « Nuit ».
- **Cartes** :
  - rayon 20 px, bordure de 1 px (`#E3E8F5` sur clair, blanc à 8 % sur sombre) ;
  - au survol : bordure lumineuse de l'accent et élévation de 2 px ;
  - 4 à 6 bénéfices maximum, une icône de la famille.
- **Boutons** :
  - primaire en pilule `#1D4FE0`, texte blanc, reflet au survol ;
  - secondaire en contour blanc à 24 % (sur sombre) ou navy (sur clair) ;
  - lien texte avec flèche qui glisse ;
  - hauteur ≥ 44 px sur mobile.
- **Iconographie** : jeu d'icônes linéaires de 1,75 px, coins arrondis, terminaisons biseautées en rappel du ruban. Une seule bibliothèque (par exemple *Lucide*, MIT) personnalisée, ou un jeu maison.
- **Mockups** : captures réelles dans des cadres d'appareils sobres (laptop, téléphone) avec un léger halo. Screencasts courts. **Jamais d'interface simulée.**
- **Illustrations** : uniquement la grammaire orbite et ruban (schémas d'écosystème) ; pas d'illustrations de personnages.
- **Hero** : voir §4.2.
- **Navigation** :
  - header translucide : logo horizontal, Produits (méga-menu avec les 5 icônes et statuts), Tarifs, Ressources, À propos, Se connecter, CTA « Demander une démo » ;
  - mobile : panneau plein écran avec les icônes d'application.
- **Footer** :
  - fond Nuit avec un arc lumineux de la bannière en haut ;
  - logo et baseline ;
  - 4 colonnes (Produits, Entreprise, Ressources, Légal) ;
  - coordonnées complètes (Rhinau, e-mail, téléphone) ;
  - ligne légale.
- **Transitions** : View Transitions natives entre pages (fondu, logo persistant) ; reveal court.

```
IMPACT_SUR_HERO=Refonte complète : fond bannière clean plate, symbole animé, H1 texte (reprise de l'accroche de la bannière), CTA démo GP, mockups sur orbite.
IMPACT_SUR_HEADER=Logo horizontal SVG (sombre/clair selon fond), menu réduit à 5 entrées + méga-menu Produits avec icônes de la famille.
IMPACT_SUR_FOOTER=Fond Nuit, arc lumineux, logo, coordonnées complètes, suppression du bloc statuts.
IMPACT_SUR_MOBILE=Fond mobile dédié 1080×1600 (Terre en bas), symbole 40 px, hero plus court (titre, sous-titre, 2 CTA, mockup), accueil environ 2× plus court.
IMPACT_SUR_SEO_SOCIAL=OG 1200×630 par page générées à la nouvelle identité, logo JSON-LD 512 px, favicons et manifest, déclinaisons LinkedIn/X depuis la bannière.
LOGO_EMPLACEMENTS_A_MODIFIER=Header, footer, hero de l'accueil, /ecosysteme, cartes produits, ruban, frise, /a-propos, favicon.ico, icon, apple-icon, OG, JSON-LD, + app.elsatia.fr (favicon Liria, icon.svg, PWA, sidebar, login), apps Tools/Colors/Réserves/Studio.
BANNIERE_EMPLACEMENTS_A_MODIFIER=Fond du hero (clean plate), fond footer (arc), section institutionnelle /a-propos, images OG, couvertures LinkedIn/X, en-tête e-mails transactionnels (version 600 px).
ANCIENS_ASSETS_A_SUPPRIMER=src/app/icon.tsx, src/app/apple-icon.tsx, src/app/favicon.ico (site) ; public/og.jpg ; styles .brandMark ; variantes AppMark actuelles ; tokens --gold* ; favicon.ico Liria de Gestion Pro ; public/liria-* et public/icons/liria-* (main) ; vidéos et guides Liria dans public/ ; marque Drone du site.
```

---

## 22. Proposition de refonte page par page

| PAGE | OBJECTIF | PROBLÈMES ACTUELS | À CONSERVER | À MODIFIER | À AJOUTER | À SUPPRIMER | NOUVEL ORDRE DES SECTIONS | ANIMATIONS | CTA | MOBILE | SEO | PRIORITÉ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Accueil** `/` | Comprendre en 5 s, puis démo GP | Trop long, défensif, 6 univers graphiques, placeholders | Captures réelles, frise | Hero, sections produits | Écosystème orbital, confiance, FAQ courte | Ruban de statuts, PREUVES, Au-delà, Plateformes, 5 sections produits longues | 1 Hero → 2 Logos de la famille → 3 Écosystème interactif → 4 GP en vedette (onglets de captures) → 5 Tools gratuit → 6 « Bientôt » (Colors, Réserves, éventuellement Studio) en une rangée → 7 Confiance (données UE, support, sans engagement) → 8 FAQ (5 questions) → 9 CTA final | A1, A2, A3, A4, A8, A9, A10 | Démo GP / Essayer Tools | environ 10 écrans maximum | H1 et description réécrits | **P0/P1** |
| **Produits** `/solutions/gestion-pro` | Convaincre et demander une démo | Long, pas de FAQ ni de réassurance | Captures, onglets, tarifs liés | Statut, texte | Vidéo de 3 min, fonctionnalités en bento, « Bientôt dans GP » (DOE), FAQ, sécurité | Négations | Hero → Captures → Bénéfices (bento) → Parcours devis → facture → Équipes et terrain → Bientôt → Tarifs (résumé) → FAQ → CTA | A13, A10, A9 | Démo / Tarifs | Bento empilé | Pages métier liées | P1 |
| `/solutions/tools` | Acquisition gratuite | Correct | Catalogue, chiffres | Charte | Pages par famille d'outils (SEO) | « Tools Pro pas encore ouvert » (une ligne suffit) | Hero → Familles → Captures → Hors connexion → CTA | A12, A13 | Ouvrir Tools | — | Longue traîne calculs | P2 |
| `/solutions/colors`, `/solutions/reserves` | Intérêt et liste d'attente | Négatif, placeholders | Description du besoin | Ton positif | Formulaire « Être prévenu » (consentement explicite) | Placeholders, listes « à l'étude » | Hero → Problème → Ce que ça fera → Être prévenu | A1 (icône) | Être prévenu | Court | noindex jusqu'à l'ouverture (option) | P1 |
| `/solutions/studio` | Si validé public | N'existe pas | — | — | Page courte | — | — | — | — | — | — | Décision |
| `/ecosysteme` | Expliquer le système | 3 686 mots, redondant | Frise | Tout | Schéma orbital plein écran, « un compte, des données partagées » | Doublons avec l'accueil | Hero → Orbite interactive → Compte unique → Flux de données → Sécurité → CTA | A8, A4 | Démo | Liste verticale | — | P1 |
| `/tarifs` | Choisir une offre | Jargon, serif, modules non commandables | Configurateur, transparence | Libellés, typo | Bascule mensuel/annuel en haut, tableau comparatif, FAQ facturation, « sans engagement », TVA | « canonical », « seconde grille », modules non arbitrés (ou les masquer) | Hero → 3 offres → Comparatif → Configurateur (repliable) → FAQ → CTA | A10, A11 | Démo / Essai | Offres en carrousel ou pile | `Offer` JSON-LD à l'ouverture | P1 |
| `/a-propos` | Incarner | 257 mots, bug d'alignement | Valeurs (réécrites) | Tout | Fondateur (photo réelle), histoire, Alsace, terrain BTP, coordonnées | — | Hero → Histoire → Fondateur → Valeurs → Où nous trouver | A5 | Contact | — | Organization | P1 |
| `/contact` | Convertir | Pas de réassurance | Formulaire | Contraste du bouton | Délai de réponse, téléphone, prise de rendez-vous, FAQ express | — | Formulaire + colonne de réassurance | A11 | Envoyer | — | — | P1 |
| **Nouvelle** `/securite` | Rassurer | — | — | — | Isolation, chiffrement, sauvegardes, hébergement, export, RGPD | — | — | — | Démo | — | Oui | P1 |
| **Nouvelle** `/faq` | Lever les objections | — | — | — | 15 à 20 questions | — | — | — | — | — | FAQPage | P2 |
| **Nouvelle** `/feuille-de-route` | Remplace `/a-venir` | — | — | — | Statuts visuels courts | — | — | — | Être prévenu | — | — | P2 |
| **Nouvelles** pages métier | SEO | — | — | — | 5 à 8 pages | — | — | — | Démo | — | Oui | P2 |
| `/solutions/drone`, `/solutions/market`, `/boutique`, `/bibliotheque-technique`, `/modules/doe`, `/a-venir` | — | Pages sur l'inexistant | — | — | — | **Supprimer, rediriger ou fusionner** | — | — | — | — | Redirections 308 | P1 |
| Légales | Conformité | Voir §14 | Structure | Compléments | Téléphone, TVA, registre, CGV | — | — | — | — | Scroll à 320 px | Indexables | **P0** |
| 404 | Rattraper | Canonical vers `/` | | | Liens utiles et recherche | Canonical | | | Accueil, Produits | | | P3 |

---

## 23. Priorisation

### P0 = critique avant commercialisation

| # | Recommandation | Niveau |
|---|---|---|
| P0-1 | Supprimer les **placeholders « EMPLACEMENT CAPTURE »** visibles | OBLIGATOIRE |
| P0-2 | **Remplacer le favicon Liria** de app.elsatia.fr (visible par les clients) | OBLIGATOIRE |
| P0-3 | Compléter les **mentions légales** : téléphone de l'éditeur, TVA, registre, téléphone de l'hébergeur | OBLIGATOIRE |
| P0-4 | **CGV** : pénalités de retard, délai de paiement, cohérence essai/souscription, clause Data Act ⚖️ | OBLIGATOIRE |
| P0-5 | Décider et **ouvrir l'indexation** (`NEXT_PUBLIC_SITE_INDEXABLE`) au lancement de la refonte | OBLIGATOIRE |
| P0-6 | Vectoriser le **nouveau logo** et produire les déclinaisons de base (favicon, icônes, horizontal, clair, sombre) | OBLIGATOIRE |
| P0-7 | Contraste des **boutons primaires** (≥ 4,5:1) | OBLIGATOIRE |
| P0-8 | Retirer le **jargon interne** visible (CANONICAL-V4…, « seconde grille ») | OBLIGATOIRE |
| P0-9 | Décider du statut public de **Studio** (et donc de la bannière) | OBLIGATOIRE (décision) |
| P0-10 | Vérifier la **chaîne de droits** du logo et de la bannière et le **dépôt de marque** ⚖️ | FORTEMENT RECOMMANDÉ |

### P1 = forte amélioration

| Recommandation | Niveau |
|---|---|
| Nouveau hero (§4.2) et accueil restructuré | FORTEMENT RECOMMANDÉ |
| Nouvelle identité : palette, police, cartes, boutons | FORTEMENT RECOMMANDÉ |
| Famille de logos (§20) sur le site, puis dans les applications | FORTEMENT RECOMMANDÉ |
| Réécriture du ton (positif, factuel) | FORTEMENT RECOMMANDÉ |
| Suppression ou fusion des pages projets | FORTEMENT RECOMMANDÉ |
| Schéma orbital interactif | FORTEMENT RECOMMANDÉ |
| Pages `/securite`, `/a-propos` enrichie, réassurance du contact | FORTEMENT RECOMMANDÉ |
| `/tarifs` simplifiée et FAQ facturation | FORTEMENT RECOMMANDÉ |
| OG par page et JSON-LD logo 512 | FORTEMENT RECOMMANDÉ |
| Anti-spam robuste (WAF, limitation de débit persistante, Turnstile) | FORTEMENT RECOMMANDÉ |

### P2 = amélioration importante

- Animations A3, A4, A9, A10, A11, A13, A15 et A16.
- FAQ.
- Feuille de route.
- Pages métier SEO.
- Pages par famille Tools.
- Correction du scroll horizontal à 320 px et des textes < 12 px.
- Sémantique `tabpanel`.
- Footer refondu.
- Liste d'attente Colors et Réserves.

Niveau : FORTEMENT RECOMMANDÉ / OPTIONNEL.

### P3 = finition / polish

- Parallaxe (A6), tilt 3D (A7), compteurs (A12), View Transitions (A14), particules (A17).
- `poweredByHeader: false`.
- Canonical de la 404.
- `lastmod` réel dans le sitemap.
- Manifest du site vitrine.
- Rangement des rapports `.md` du dépôt.

Niveau : OPTIONNEL.

---

## 24. Récapitulatif normalisé

```
P0= placeholders ; favicon Liria GP ; mentions légales (tél., TVA, registre, hébergeur) ; CGV (pénalités, délai, essai, Data Act) ;
    indexation ; vectorisation logo + déclinaisons ; contraste boutons ; jargon interne ; décision Studio ; droits logo/marque
P1= hero ; identité (palette, police, composants) ; famille de logos ; ton ; suppression des pages projets ; écosystème orbital ;
    /securite ; /a-propos ; contact ; /tarifs ; OG par page ; anti-spam
P2= animations secondaires ; FAQ ; feuille de route ; SEO métier ; reflow 320 px ; tailles de texte ; footer ; listes d'attente
P3= parallaxe, tilt, compteurs, View Transitions, particules, X-Powered-By, canonical 404, lastmod, manifest vitrine

PAGES_A_AJOUTER= /securite, /faq, /feuille-de-route, pages métier (5 à 8), pages familles Tools, (/solutions/studio si validé)
PAGES_A_REFAIRE= /, /ecosysteme, /tarifs, /a-propos, /contact, /solutions/colors, /solutions/reserves, /solutions/gestion-pro (partiel), pages légales (compléments)
PAGES_A_SUPPRIMER= /solutions/drone, /solutions/market, /boutique, /bibliotheque-technique (redirections 308) ; /modules/doe → section GP ; /a-venir → /feuille-de-route
SECTIONS_A_SUPPRIMER= ruban de statuts + PREUVES du hero ; « Au-delà des applications » ; « Partout où vous travaillez » (réduite à une ligne) ;
                      sections produits longues de l'accueil ; bloc « Statut des applications » du footer ; mentions internes ; placeholders
ANIMATIONS_RECOMMANDEES= A1 tracé du logo, A2 orbite lente, A8 écosystème orbital interactif (P1) ; A3 halo, A4 arcs lumineux, A9 sticky storytelling,
                         A10 bordure lumineuse, A11 boutons, A13 captures vivantes, A15 header, A16 sphère au survol (P2) ; A6, A7, A12, A14, A17 (P3)
NOUVELLE_ARCHITECTURE_SITE=
  /                         Accueil
  /ecosysteme               L'écosystème (orbite interactive)
  /solutions/gestion-pro    Produit vedette
  /solutions/tools          Gratuit
  /solutions/colors         Bientôt (liste d'attente)
  /solutions/reserves       Bientôt (liste d'attente)
  (/solutions/studio)       Si validé
  /tarifs                   Offres + configurateur
  /securite                 Sécurité & données
  /faq                      Questions fréquentes
  /feuille-de-route         Ce qui arrive
  /a-propos                 Entreprise & fondateur
  /contact                  Démo & contact
  /ressources/...           (phase 2 : guides, pages métier)
  /mentions-legales /cgv /cgu /confidentialite /cookies
  Menu : Produits ▾ | Tarifs | Ressources ▾ | À propos | Se connecter | [Demander une démo]
DESIGN_DIRECTION= « Orbite » : navy profond, bleu roi, cyan lumineux ; logo ruban + orbite comme signature ; Terre de la bannière en hero ;
                  police variable auto-hébergée (Sora + Inter) ; cartes à bordure lumineuse ; une famille d'icônes d'application
                  (même tuile, même orbite, cœur métier, accent propre) ; animations sobres et courtes, CSS d'abord, reduced-motion respecté.
NOUVEAU_LOGO= Fourni (raster ≈ 1254², fond opaque). À vectoriser (SVG maître) + 5 déclinaisons + version simplifiée ≤ 32 px.
NOUVELLE_BANNIERE= Fournie (raster ≈ 2000×761, texte incrusté, cite Studio). Usage direct : réseaux sociaux. Site : clean plate sans texte + déclinaisons desktop, tablette, mobile, OG, LinkedIn, X.
NOUVEAUX_GRADIENTS / NOUVEAUX_EFFETS / NOUVELLES_ANIMATIONS : voir §21 et §20.3
```

---

## 25. Risques / bloquants

1. **Site live non audité directement** : le réseau bloque elsatia.fr. Un contrôle final sur le domaine est à faire dès l'ouverture du réseau (en-têtes CDN, indexation réelle, cookies).
2. **Logo et bannière en raster uniquement** : la refonte d'identité dépend d'une **vectorisation fidèle**. Il faut un SVG maître, idéalement fourni par l'auteur du logo, sinon redessiné puis validé.
3. **Droits sur les visuels** : si générés par IA ou à partir de banques d'images, vérifier les conditions d'usage commercial et l'absence de marque tierce. Dépôt de marque ELSATIA à vérifier.
4. **Studio** : statut public inconnu, alors que la bannière l'annonce.
5. **Commercialisation non ouverte** : la conversion reste limitée à la démo tant que la souscription n'est pas ouverte. Les CGV doivent refléter la réalité.
6. **Cohérence site ↔ applications** : la famille de logos implique des modifications dans 5 applications (`Appli_BTP`, plusieurs projets Vercel), à planifier séparément du site.
7. **Contenus réels nécessaires** : photo du fondateur, captures Réserves, Colors et Studio, vidéo de démo, téléphone. Sans eux, certaines sections restent à masquer plutôt qu'à simuler.

---

## 26. Estimation de l'ampleur

| Lot | Contenu | Estimation |
|---|---|---|
| L0 Correctifs P0 hors identité | Placeholders, jargon, contrastes, légal (hors avocat), indexation, favicon Liria GP | 0,5 à 1 jour |
| L1 Identité | Vectorisation du logo, déclinaisons, favicons, OG, police, tokens | 2 à 3 jours (+ validation) |
| L2 Famille de logos | 5 icônes et leurs variantes (conception, puis exports) | 2 à 4 jours (+ validations) |
| L3 Refonte du site | Accueil, écosystème, tarifs, à propos, contact, sécurité, FAQ, feuille de route, navigation, footer, composants | 6 à 10 jours |
| L4 Animations | A1, A2, A8 et les animations P2 | 2 à 3 jours |
| L5 Contenus | Réécriture complète, pages métier (phase 2) | 3 à 5 jours (+ relecture propriétaire) |
| L6 Intégration de la famille de logos dans les applications | GP, Tools, Colors, Réserves, Studio | 2 à 3 jours |
| Validation juridique | CGV, Data Act, marque ⚖️ | Externe |

**Ampleur globale : refonte majeure**, environ 3 à 5 semaines de travail effectif en lots successifs validés. **Le socle technique est conservé** (Next.js, sécurité, statique) : c'est une refonte de marque, de contenu et d'UX, pas une réécriture technique.

---

## 27. Skills et outils utilisés

```
SKILLS_UTILISES=
- web-design-guidelines : grille d'audit UI/UX et accessibilité (hiérarchie, contrastes, cibles tactiles, focus,
  formulaires, motion, typographie), appliquée page par page aux captures et au code. Règles de motion
  (reduced-motion, transform/opacity) reprises dans §6.
- vercel-react-best-practices : revue des composants (proportion server/client, Reveal, configurateur qui fait
  ≈ 300 Ko gz sur /tarifs, RSC inline, next/image priority/lazy), budget de performance de la refonte.
- Audit sécurité (démarche du skill security-review, appliquée en lecture au site public) : en-têtes, CSP, API contact,
  anti-spam, exposition des variables.
- Playwright (Chromium pré-installé) : 21 URL × 8 viewports, inventaire cookies / localStorage /
  sessionStorage / requêtes tierces, clavier, captures, mesures LCP et CLS sous CPU ×4.
- axe-core : audit WCAG 2.2 AA automatisé sur 21 URL.
- Agents de recherche : inventaire des logos de toutes les applications (402 branches Appli_BTP) ;
  recherche juridique FR/UE (LCEN/SREN, CNIL 2025-2026, Data Act, EAA, Code conso) ; benchmark SaaS / BTP.
- API Vercel (lecture seule) : identification du projet, du dépôt et du commit réellement en production.
Non utilisés (hors sujet) : stripe-best-practices (aucun paiement sur le site), supabase-postgres-best-practices
(le site n'a pas de base de données).
```

---

```
AUDIT_TERMINE=YES
MODIFICATIONS_EFFECTUEES=NO
ATTENTE_VALIDATION_PROPRIETAIRE=YES
```
