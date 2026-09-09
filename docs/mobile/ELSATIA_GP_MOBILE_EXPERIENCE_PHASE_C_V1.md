# ELSATIA Gestion Pro — Expérience mobile V1 terrain (phase C)

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1` · Base `52d3282` · 2026-09-09

Périmètre borné par arbitrage : **six parcours terrain**, 12 pages. Aucune autre page n'est
refactorisée dans ce lot.

## 1. Ce qui a été fait, et pourquoi

### 1.1 Le correctif global sort du rendu serveur et devient franchissable

Le bloc `<style>` de 18 règles vivait dans `src/app/(app)/layout.tsx` et était **re-sérialisé
dans le HTML à chaque rendu serveur de chaque page authentifiée**. Il est désormais dans
`src/app/mobile.css` : minifié, mis en cache, servi une fois.

Il **reste** un correctif de rattrapage, et le fichier le dit explicitement. Ses `!important`
sur des sélecteurs d'attribut forcent en une colonne des mises en page conçues pour un grand
écran. C'est un pis-aller assumé pour la centaine de pages de gestion que ce lot ne refond
pas : mieux vaut une colonne tassée qu'un débordement horizontal.

Le changement de fond est qu'il devient **franchissable**. Une page qui pose `.ecran-mobile`
sur son propre `<main>` déclare assumer sa mise en page mobile, et le correctif la laisse
tranquille. Les 12 pages du périmètre V1 le font.

> **Détail qui compte.** La classe est portée par `<main>` plutôt que détectée par `:has()`.
> Un sélecteur `:has()` non reconnu fait tomber la règle **entière** : sur un navigateur qui ne
> le gère pas, le rattrapage disparaîtrait d'un coup pour les cent pages qui en dépendent.
> `:not(.ecran-mobile)` est compris partout.

La règle de conduite pour la suite est écrite dans le fichier : on retire du correctif à
mesure que des pages passent en `.ecran-mobile`. Le jour où il ne reste rien à rattraper, le
fichier disparaît.

### 1.2 Deux seuils tactiles corrigés

| Avant | Après | Motif |
|---|---|---|
| `min-height: 42px` | `min-height: 44px` | 42 px passait **sous** le seuil recommandé par Apple *et* par Android |
| *(rien)* | `input,select,textarea { font-size: max(16px, 1em) }` | Sous 16 px, Safari iOS **zoome automatiquement** à la mise au point : la page saute et l'utilisateur doit dézoomer à la main |
| `max-height: calc(100vh …)` | `calc(100dvh …)` | Avec `vh`, la barre d'adresse mobile masque le bas des dialogues, donc leurs boutons de validation |

### 1.3 Un palier tablette, qui n'existait pas

L'application n'avait **qu'une** rupture, à 768 px. Un iPad en portrait fait exactement 768 px
de large : il recevait donc la barre latérale de bureau (240 px) plus un contenu prévu pour
1 280 px, dans 768 px.

Le palier `768–1023 px` rend au contenu la largeur que la barre lui prend (`13rem` au lieu de
`15rem`), ramène les grilles denses à `auto-fit / minmax(15rem, 1fr)`, et **conserve le seuil
tactile de 44 px** — sur une tablette, le moyen de pointage reste le doigt.

### 1.4 Les deux seuls vrais défauts de grille du périmètre

| Fichier | Avant | Après |
|---|---|---|
| `src/app/(app)/dashboard/page.tsx:347` | `grid grid-cols-3 gap-2` | `grid gap-2 sm:grid-cols-2 lg:grid-cols-3` |
| `src/app/(app)/chantiers/nouveau/page.tsx:92` | `grid grid-cols-3 gap-4` | `grid gap-4 sm:grid-cols-3` |

Sans préfixe de palier, `grid-cols-3` s'applique **dès 375 px** : trois colonnes de ~110 px.

**Faux positif écarté** : `PhotosCompteRendu.tsx:46` utilise `grid-cols-3 sm:grid-cols-4` pour
des **vignettes photo**. Trois vignettes de 110 px sur un téléphone sont un bon choix. Non
corrigé.

### 1.5 États d'écran explicites

`EtatEcran` distingue **quatre** états visuellement et par leur texte : chargement, vide,
erreur, hors ligne. L'application disait déjà « Aucun chantier pour l'instant » ici, « Aucune
dépense accessible » là, chaque fois autrement.

Sur un téléphone, cette variété coûte cher : l'utilisateur ne sait pas si l'écran est vide
parce qu'il n'y a rien, parce que ça charge, ou parce que le réseau a lâché — et les trois
appellent des gestes opposés.

Le cas **hors ligne** est traité comme un état de plein droit, pas comme une erreur. Ce n'est
pas une panne : c'est la situation normale d'un sous-sol. Le message dit ce qui reste possible,
pas ce qui a échoué.

Accessibilité : `role="alert"` + `aria-live="assertive"` pour l'erreur seule ; `role="status"`
+ `aria-live="polite"` pour le reste. Un lecteur d'écran ne doit pas couper la lecture en cours
pour annoncer une liste vide.

### 1.6 Barre d'action mobile

Sur grand écran, l'action principale vit en haut à droite. Sur téléphone, elle se retrouve
après le contenu — parfois après deux écrans de défilement — et surtout **hors de portée du
pouce**, qui atteint le bas, pas le haut.

`BarreActionMobile` la ramène sous le pouce. Trois précautions y sont prises, chacune corrigeant
un défaut observable :

1. `env(safe-area-inset-bottom)` — sans elle, l'indicateur d'accueil des iPhone récents
   recouvre le bas du bouton, qui devient partiellement intouchable.
2. **Un bloc de réserve de même hauteur dans le flux** — une barre `fixed` sans réserve masque
   la fin du contenu, et le dernier élément d'une liste devient inatteignable.
3. **Un décalage à gauche (`pl-20`)** — `MobileBack` occupe déjà le coin bas-gauche. Sans ce
   décalage, les deux se superposent et le retour devient le bouton que l'on touche en visant
   l'action principale.

Branchée sur `/chantiers`, où « + Nouveau chantier » se perd après 25 lignes de liste.

### 1.7 Conservation d'un brouillon lors d'une interruption

Cas visé, banal sur un chantier : saisie d'une note de frais, appel entrant, bascule
d'application, onglet évincé par le système. Au retour, formulaire vide. À la troisième fois,
le salarié cesse de saisir sur le téléphone.

`src/lib/mobile/brouillon.ts` est **pur** — ni DOM, ni React, stockage injecté — donc testable
sans navigateur. `useBrouillon` l'expose à React.

Le déclencheur qui compte est `visibilitychange`, pas le délai d'inactivité : un système mobile
qui évince un onglet ne prévient pas, et `beforeunload` n'est pas fiable sur iOS.
`visibilitychange` est le dernier moment garanti pour écrire.

Ce que le module **ne fait pas**, volontairement : aucun fichier ni image (une photo se
recapture ; l'écrire en base64 ferait exploser le quota) ; rien sans identité ; et surtout il
ne remplace pas la file hors ligne — **un brouillon est un travail en cours, pas une mutation
soumise**. Les confondre finirait par envoyer au serveur une saisie jamais validée.

### 1.8 Isolation et purge des données locales

`src/lib/mobile/identite-locale.ts` impose que **toute** clé locale porte le couple
`(entrepriseId, utilisateurId)`.

La raison mérite d'être dite : un téléphone de chantier est **partagé**. Le conducteur de
travaux se connecte le matin, le chef d'équipe l'après-midi ; une tablette de dépôt sert à
trois sous-traitants dans la semaine. Une clé sans identité mélange les données de deux
personnes — au mieux un brouillon qui réapparaît chez le suivant, au pire une note de frais
envoyée sous le mauvais nom.

`cleLocale()` renvoie `null` quand l'identité manque, plutôt que de retomber sur une clé
« anonyme » qui serait partagée par tous les comptes de l'appareil — précisément le défaut que
le module existe pour empêcher.

**La purge a deux déclencheurs, et aucun ne suffit seul :**

| Déclencheur | Couvre |
|---|---|
| `BoutonDeconnexion` — purge à la **soumission** | La déconnexion volontaire |
| `PurgeLocaleAuLogin` — purge au montage de `/login` | **L'expiration de session et la révocation à distance** |

Le second n'est pas une redondance : la déconnexion est un Server Action, elle ne peut rien
effacer sur l'appareil, et un salarié dont le jeton expire pendant la nuit ne clique sur rien.

La purge **n'appelle pas `clear()`**. La même origine sert d'autres applications ELSATIA ; tout
balayer ferait perdre un travail sans rapport avec la session fermée. Un effacement large
paraît plus sûr et ne l'est pas : il est simplement moins précis.

## 2. Tests livrés

23 tests unitaires, tous verts, sur les trois modules purs :

| Fichier | Ce qui est éprouvé |
|---|---|
| `identite-locale.test.ts` | Séparation de deux entreprises pour un même utilisateur ; séparation de deux utilisateurs d'une même entreprise ; refus de clé sans identité complète ; non-revendication des clés d'autres applications |
| `brouillon.test.ts` | Restitution après interruption ; **invisibilité du brouillon d'autrui sur le même appareil** ; péremption à 24 h avec nettoyage ; refus des valeurs non sérialisables, du quota atteint, d'une charge trop grosse ; rejet d'un contenu corrompu |
| `purge-locale.test.ts` | Effacement de toutes les identités présentes ; **préservation de ce qui n'appartient pas à GP** ; aucune clé sautée sur 12 (régression de parcours par index) ; stockage inaccessible sans levée |

## 3. Ce qui n'est PAS fait, et pourquoi

- **Aucune mesure navigateur.** Tout ce qui précède est vérifié par typecheck, lint et tests
  unitaires. L'effet réel aux cinq largeurs est mesuré en phase H.
- **Les 129 autres pages ne sont pas touchées.** Elles restent sous le correctif de rattrapage.
- **Fiches clients et salariés** : non modifiées, conformément à l'arbitrage. Elles seront
  vérifiées *consultables* en phase H.
- **La barre d'action n'est branchée que sur `/chantiers`.** Le composant est prêt ; l'étendre
  aux autres écrans relève du confort, pas de la fondation.

## 4. Réserve ouverte

En retirant le correctif de rattrapage des 12 pages V1, on retire aussi
`.flex { flex-wrap: wrap }`, qui **masquait peut-être** des débordements sur ces pages. Le
scanner corrigé n'en signale aucun, mais il lit le code, pas le rendu.

**Si la mesure de la phase H révèle un débordement sur une page `.ecran-mobile`, la correction
est de corriger cette page — jamais de lui remettre le correctif global.** Le remettre
rétablirait le confort d'affichage en renonçant à l'objectif du lot.
