# ELSATIA Gestion Pro — Audit mobile réel (phase A)

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1`
Branche : `feat/gp-mobile-application-foundation-v1`
Base : `52d3282bede2203eb41bf8caa530a2ca5d86aa8e` (SHA métier Train V3, ledger 278)
Worktree : `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-mobile-foundation-v1`
Date : 2026-09-09

## 0. Méthode et limites déclarées

Cet audit combine trois sources :

1. **Lecture du code** — les 141 `page.tsx` de `src/app`, leurs composants importés depuis
   `@/components`, le shell applicatif, le service worker, le manifeste.
2. **Analyse statique outillée** — un scanner (`scan-mobile.mjs`) classe chaque page selon
   les signaux qui cassent réellement un écran de 375 px : tableau, grille ≥ 3 colonnes,
   largeur fixe en pixels, canvas, iframe, éditeur.
3. **Interrogation du schéma réel** — la base du décor E2E Train V3 (`supabase_db_elsatia-train-v3-e2e`,
   déjà en service, aucune pile supplémentaire démarrée) pour les colonnes, contraintes,
   déclencheurs et politiques RLS qui commandent ce qui est faisable hors ligne.

**Ce qui n'a PAS été mesuré à ce stade, et pourquoi.** Le rendu réel aux cinq largeurs
demandées (375 / 390 / 430 / 768 / 1024 px) exige de faire tourner Gestion Pro contre un
Supabase local. Aucun fichier `.env.local` n'existe dans le dépôt — la recette E2E du Train V3
avait reçu ses clés par variables d'environnement exportées dans le shell de l'opérateur, qui
n'ont pas survécu à la session. La mesure navigateur est donc **différée en phase H**, où elle
sera conduite sur l'arbre figé. Tout ce qui est affirmé ici sans mesure navigateur est
explicitement marqué « analyse statique ». Rien n'est présenté comme mesuré alors qu'il ne
l'est pas.

## 1. Constat d'ensemble : le socle mobile est réel, pas absent

L'attente initiale — « Gestion Pro est une application de bureau qu'il faut rendre mobile » —
est **fausse**. Un travail mobile substantiel existe déjà et il est de bonne facture :

| Élément | État |
|---|---|
| `src/app/manifest.ts` | Manifeste complet : `standalone`, `start_url: /dashboard`, `scope: /`, 4 icônes dont 2 maskable, `theme_color` et `background_color` cohérents, `lang: fr`, catégories |
| `src/app/layout.tsx` | `viewport` avec `viewportFit: "cover"` (encoches iOS), `themeColor`, `appleWebApp.capable`, `statusBarStyle: black-translucent`, `formatDetection.telephone: false` |
| `public/sw.js` (96 l.) | Service worker **sobre et sûr** : statiques versionnés en cache-first, navigation réseau-d'abord avec repli `/offline`, cross-origin jamais intercepté, mutations jamais interceptées, **aucune donnée métier en cache** |
| Push | Chaîne complète : `PushNotificationsSettings.tsx` (VAPID, souscription, préférences) + handlers `push` et `notificationclick` dans le service worker + `src/lib/push.ts` côté serveur |
| Installation | `PwaInstallButton.tsx` : `beforeinstallprompt`, détection `display-mode: standalone`, `navigator.standalone` iOS, guide « Partager → Sur l'écran d'accueil », enregistrement de la présence |
| Navigation | `Sidebar.tsx` : header fixe mobile `md:hidden`, tiroir latéral `translate-x`, overlay de fermeture, groupes `<details>` |
| Retour | `MobileBack.tsx` : bouton flottant `md:hidden`, indispensable en standalone où il n'y a pas de bouton retour navigateur |
| Terrain | `PointageArriveeDepart.tsx` est **déjà pensé mobile d'abord** : boutons pleine largeur `py-4 text-lg`, `watchPosition` GPS, motif obligatoire si GPS absent |
| Justificatifs | `ExpenseDocumentUploader.tsx` : `capture=`, aperçu, **détection de flou par variance de gradient** avant envoi |

Le travail restant n'est donc pas de partir de zéro : c'est de **combler des manques précis**
et de **retirer un correctif global qui masque les défauts au lieu de les corriger**.

## 2. Le point dur : le bloc CSS correctif du shell

`src/app/(app)/layout.tsx` embarque un `<style>` de 18 règles sous `@media (max-width:767px)`
appliqué à **toutes** les pages authentifiées. Il force notamment :

```css
.app-shell main [class*="grid-cols-"]{grid-template-columns:minmax(0,1fr)!important}
.app-shell main [class*="col-span-"]{grid-column:auto!important}
.app-shell main .flex{flex-wrap:wrap}
.app-shell main table{min-width:680px}
.app-shell main :is(button,a.rounded-md){min-height:42px}
```

C'est un **cataplasme**, et il faut le nommer comme tel :

- **`!important` sur des sélecteurs d'attribut** (`[class*="grid-cols-"]`) : n'importe quelle
  grille devient une colonne, y compris celles qui étaient déjà correctes en 2 colonnes sur
  téléphone. Aucune page ne peut s'y soustraire sans lutter contre le shell.
- **`table{min-width:680px}`** : garantit le débordement horizontal de **tout** tableau, puis
  le rattrape par un `overflow-x:auto` sur le conteneur. Un tableau de 8 colonnes reste
  illisible sur 375 px — on fait défiler à l'aveugle. C'est la définition même du « bureau
  miniature » que le lot doit supprimer.
- **`min-height:42px`** : sous le seuil de 44 px des recommandations tactiles Apple et Android.
- **`.flex{flex-wrap:wrap}`** appliqué à toute la page : casse les alignements voulus.

Ce bloc explique pourquoi l'application « passe » sur mobile sans y être réellement utilisable.
La V1 terrain doit livrer de **vraies** dispositions mobiles pour ses six parcours et laisser
le cataplasme en place uniquement pour les pages hors périmètre, où il reste préférable à rien.

## 3. Matrice d'audit

| Axe | État | Constat |
|---|---|---|
| Interface responsive | **Partiel** | Shell correct ; correctif global masquant ; tableaux non transformés en cartes |
| Manifeste PWA | **Opérationnel** | Complet et cohérent |
| Service worker | **Opérationnel** | Sobre, sûr, versionné (`elsatia-v4`) |
| Stratégie de cache | **Partiel** | Statiques seulement — volontairement. Rien pour le terrain |
| Mode hors ligne | **Absent** | Une page `/offline` de courtoisie. Aucune donnée, aucune saisie |
| IndexedDB / stockage local | **Absent** | 0 fichier dans `src/`. `localStorage` sur 6 fichiers (préférences d'affichage) |
| Notifications | **Opérationnel** | Push VAPID de bout en bout, préférences utilisateur |
| Caméra / import photo | **Opérationnel** | `capture=` sur 5 écrans, `getUserMedia` sur 3 |
| Scan de justificatifs | **Opérationnel** | Aperçu + détection de flou avant envoi |
| Partage de fichiers | **Partiel** | `navigator.share` sur 2 écrans d'invitation seulement |
| Export PDF | **Opérationnel** | Serveur (`puppeteer-core` + `@sparticuz/chromium`), routes `/imprimer/*` |
| Authentification mobile | **Opérationnel** | Supabase SSR par cookies, MFA (`/mfa/challenge`) |
| Sessions expirées | **Partiel** | `src/proxy.ts` redirige ; aucun traitement d'expiration pendant une saisie |
| Biométrie | **Absent** | Aucun WebAuthn. Non requis en V1 |
| Deep links | **Absent** | Aucun schéma d'URL natif |
| Installation iOS/Android | **Partiel** | PWA installable ; aucun paquet natif pour GP |
| Capacitor / wrapper | **Absent pour GP** | Existe et fonctionne pour `apps/tools` — précédent exploitable |
| Tests mobiles | **Partiel** | Playwright a déjà les profils `iphone-webkit`, `android-chromium`, `tablet-webkit` ; **un seul** test GP `@responsive` (5 routes, débordement horizontal) contre 7 côté Réserves |
| Téléphone / tablette | **Partiel** | Rupture unique à 768 px : pas de palier tablette |

## 4. Classement des 141 pages (analyse statique)

> **Correction apportée en phase C — cette section est périmée.** Le scanner utilisé ici
> comptait tout `<table>` comme hostile, sans voir que `/planning`, `/notes-frais` et
> `/chantiers` embarquent **déjà** une vue mobile dédiée, le tableau étant réservé au grand
> écran par `hidden md:block`. Les chiffres ci-dessous **surestiment** le travail restant.
> Le classement corrigé fait foi : `ELSATIA_GP_MOBILE_BACKLOG_141_PAGES_V1.md`.
> En bref : 25 pages lourdes et non 36, 75 sans aucun signal et non 41.

Score d'hostilité mobile : tableau 3, largeur fixe 3, canvas 3, éditeur 3, grille ≥ 3 colonnes 2,
iframe 2, en-têtes de tableau 1, dialogue 1.

| Tranche | Pages | Lecture |
|---|---|---|
| Lourd (≥ 6) | 36 | Refonte nécessaire ou écran d'administration assumé sur ordinateur |
| Moyen (3–5) | 32 | Correction légère |
| Léger (1–2) | 32 | Déjà utilisable |
| Aucun signal | 41 | Déjà utilisable |

Les 10 pages les plus hostiles sont toutes des écrans de gestion, pas de terrain :
`/stock` (10), puis à 9 : `/abonnement`, `/connecteurs`, `/depenses`, `/facturation-avancee`,
`/inventaires/[id]`, `/paie/[id]`, `/paie/[id]/[dossierId]`, `/paie/parametres`,
`/paiements-bancaires`, `/parametres/relances`, `/plateforme/*` (7 pages), `/rentabilite`,
`/sous-traitants`, `/tarifs`.

**C'est une bonne nouvelle** : le périmètre V1 terrain est nettement moins dégradé que la
moyenne de l'application.

| Page V1 | Score | Verdict statique |
|---|---|---|
| `/mes-travaux` | 0 | Déjà utilisable |
| `/pointage` | 2 | Déjà bon — cartes, gros boutons, GPS |
| `/pointage/gestion` | 2 | Correction légère |
| `/chantiers/[id]` | 2 | Correction légère |
| `/chantiers/[id]/documents` | 2 | Correction légère |
| `/chantiers/nouveau` | 2 | Correction légère |
| `/notes-frais/[id]` | 2 | Correction légère |
| `/chantiers` | 4 | Tableau → cartes |
| `/dashboard` | 6 | Grilles ≥ 3 colonnes + largeurs fixes |
| `/notes-frais` | 6 | Tableau → cartes |
| `/planning` | 7 | **Le plus dur du périmètre** : tableau + largeurs fixes |

## 5. Contrainte d'architecture décisive pour iOS/Android

`src/app/layout.tsx` déclare `export const dynamic = "force-dynamic"`, imposé par la CSP à
nonce. S'y ajoutent les Server Actions, l'authentification Supabase par cookies SSR,
`serverExternalPackages` et `outputFileTracingIncludes` (ExcelJS, Chromium).

**Conséquence : `output: "export"` est impossible pour Gestion Pro.** La recette qui marche
pour `apps/tools` — `ELSATIA_TOOLS_NATIVE=1` active `output: "export"`, Capacitor embarque
`out/` — **ne se transpose pas**. Tools est une application de géométrie côté client ; GP est
une application serveur multi-locataire.

Capacitor reste possible pour GP, mais **uniquement en mode `server.url`** : une coque native
qui charge `app.elsatia.fr`. Cette voie est traitée en phase B, avec ses conséquences (revue
App Store au titre de la fonctionnalité minimale, premier chargement nécessairement en ligne).

## 6. Ce que le schéma autorise réellement hors ligne

Interrogation de la base Train V3 (ledger 278) :

- **`sessions_pointage.id`, `pointages.id`, `notes_frais.id`** ont pour défaut
  `gen_random_uuid()` — donc **le client peut fournir l'identifiant**. Le rejeu idempotent est
  atteignable sans nouvelle colonne.
- **`sessions_pointage`** : `UNIQUE (id, entreprise_id)`, RLS `INSERT` sous
  `peut_pointer_pour_employe(entreprise_id, employe_id)`, RLS `UPDATE` à **`false`** (les
  sessions ne se modifient que par RPC `SECURITY DEFINER`). Aucun déclencheur ne réécrit
  `arrivee_at` : **une arrivée préparée hors ligne peut porter l'heure réelle de l'appareil**.
- **`cloturer_session_pointage`** accepte déjà `p_depart_at` en paramètre : l'heure de départ
  est **déjà** fournie par l'appelant. Aucun changement de contrat nécessaire.
- **`notes_frais.statut`** admet déjà `'brouillon'` : un brouillon préparé hors ligne se rejoue
  comme une insertion normale.
- **`pointages.origine_pointage`** est contraint à
  `gps_complet | arrivee_oubliee | depart_oublie | regularisation_responsable`. Il n'existe
  **aucune** valeur signifiant « préparé hors ligne, transmis plus tard ».

### Le seul point qui touche à une migration

Un pointage différé reste traçable **sans** migration : l'écart entre `created_at` (horloge
serveur, non falsifiable) et `arrivee_at` / `depart_at` (horloge de l'appareil) révèle le
report. La V1 hors ligne est donc livrable en l'état.

Un marqueur explicite (`origine_pointage = 'hors_ligne_differe'` et une colonne `capture_at`)
serait **préférable** pour un contrôle anti-fraude lisible sans calcul. Il exigerait une
migration. Conformément à la consigne, **aucune migration ne sera créée** : le SQL sera livré
en `.sql.proposed`, hors `supabase/migrations`, sans numéro de ledger, comme amélioration
soumise à arbitrage — **et non comme un blocage**, puisque la V1 fonctionne sans lui.

## 7. Moteur hors ligne de Réserves : ce qui est réutilisable, ce qui ne l'est pas

`apps/reserves/src/lib/offline/` (1 450 lignes, tests inclus) est de grande qualité. En
particulier `contrat.ts` est un module **pur** : ni réseau, ni DOM, ni IndexedDB. Il porte les
7 états (`brouillon`, `en_attente`, `en_cours`, `synchronise`, `echec`, `conflit`, `annule`),
la table des transitions autorisées, et surtout ce qui en est **absent** — rien ne ramène
`synchronise` ou `conflit` vers `en_attente`, ce qui interdit par construction qu'une boucle
de reprise renvoie une mutation déjà acquittée.

`api/offline/mutations/route.ts` pose trois principes directement transposables : aucun droit
nouveau (RPC du domaine sous RLS normale), identité déclarée vérifiée (refus si la session
courante n'est pas celle qui a préparé la mutation), rejeu normal (RPC idempotentes).

**Décision (à confirmer en phase B).** Réserves reste une application autonome ; son moteur ne
sera **pas** déplacé, ni dupliqué, ni généralisé de force. Gestion Pro recevra sa propre file,
minimale, qui **reprend le vocabulaire d'états et les trois principes** sans importer le code
de Réserves — les charges utiles, les RPC et les règles métier diffèrent trop pour qu'une
abstraction commune soit honnête aujourd'hui.

## 8. Réserves de l'audit

1. **Aucune mesure navigateur** aux cinq largeurs à ce stade : reportée en phase H, faute de
   clés Supabase locales. C'est la principale lacune de cet audit.
2. Le décor E2E Train V3 (`RECETTE_A` / `RECETTE_B`) est un jeu de recette, pas un jeu
   réaliste : il ne dira rien des volumes réels (un planning à 40 salariés, un chantier à
   300 documents).
3. La charge machine au moment de l'audit (`load average` 14,15 ; ~20 conteneurs actifs ;
   VM Docker à 899 % CPU) interdit toute pile supplémentaire et repousse les tests lourds.
