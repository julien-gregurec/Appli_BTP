# ELSATIA — Lot ciblé : STUDIO BUILD ISOLATION V1

Base : `claude/studio-runtime-config-wiring-v1`, code SHA
`82e5ce7f66e1648a03ab8d91309b9431dfbc3506`, docs SHA `faebd70`.
**Nouveau SHA exact après ce lot : `9d4331ce7e92b8622730869aa81a392b557fbd8c`**
(court : `9d4331c`), branche `claude/studio-build-isolation-v1`. 1 seul fichier
ajouté (13 lignes), aucun autre fichier du dépôt touché. Non fusionné dans
le train principal.

---

## ROOT CAUSE

`apps/studio/npm run build` échouait avec `Cannot find module
'@tailwindcss/postcss'` en compilant `src/app/globals.css` — un fichier qui
ne contient **aucune** directive Tailwind (`@tailwind`/`@import
"tailwindcss"`), preuve immédiate que le problème n'est pas « Tailwind mal
utilisé » mais « une configuration étrangère chargée à tort ».

Preuve directe, par lecture du code source de Next 16.3.5 lui-même
(`apps/studio/node_modules/next/dist/build/webpack/config/blocks/css/plugins.js`) :
`getPostCssPlugins()` cherche une configuration PostCSS via `findConfig()`
(implémenté avec le package `find-up`), qui **remonte l'arborescence des
dossiers depuis le répertoire de l'app, sans aucune notion de limite de
monorepo**. `apps/studio` n'avait pas son propre `postcss.config.mjs` ; la
remontée atteignait donc `postcss.config.mjs` **à la racine du dépôt**, qui
appartient à une tout autre application (Gestion Pro) et déclare
`@tailwindcss/postcss` comme plugin. `apps/studio` a son propre
`package-lock.json` et son propre `node_modules`, isolés du reste du
monorepo (npm sans workspaces) : il ne possède pas ce package, d'où l'échec.

Sans configuration trouvée du tout, Next 16 n'utilise **jamais** Tailwind par
défaut (confirmé par la documentation livrée avec le paquet,
`node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` :
Tailwind est entièrement opt-in). Le bug n'était donc pas « Tailwind requis
et absent », mais « la configuration PostCSS d'une autre application,
chargée par accident via la remontée de répertoire ».

---

## CONFIG RESOLUTION

| Question posée | Réponse prouvée |
|---|---|
| Quel `postcss.config.*` Studio utilisait-il ? | Celui de la **racine du monorepo** (`/postcss.config.mjs`, `{ plugins: { "@tailwindcss/postcss": {} } }`), appartenant à Gestion Pro |
| Pourquoi Next/PostCSS remonte au root ? | `find-up` dans `findConfig()` n'a aucune notion des limites d'app dans un monorepo multi-lockfiles ; il s'arrête au premier `postcss.config.{js,mjs,cjs}` trouvé en remontant, quel que soit le propriétaire réel de ce fichier |
| Studio possédait-il déjà une config locale ? | **Non**, avant ce lot |
| La config locale était-elle ignorée ou absente ? | **Absente** — ce n'est pas un bug d'ignorance de fichier, juste l'absence pure et simple |
| Quel package/plugin était attendu ? | `@tailwindcss/postcss`, requis par la config de Gestion Pro, jamais par le code de Studio |

Fait notable, découvert en creusant la cause : `apps/colors` (une autre
application de ce même monorepo) avait **déjà résolu exactement ce problème
pour elle-même**, avant ce lot, avec son propre `apps/colors/postcss.config.mjs`
contenant `{ plugins: {} }` et un commentaire explicite (« Colors currently
uses standard CSS — no Tailwind, no PostCSS plugins »). C'est ce motif déjà
en place et éprouvé dans le dépôt — pas une improvisation — qui a servi de
base au correctif.

Aucune correction n'a été appliquée avant d'avoir cette preuve complète du
mécanisme, conformément à la consigne.

---

## FIX

Ajout d'un seul fichier, `apps/studio/postcss.config.mjs` :

```js
// Studio currently uses standard CSS — no Tailwind, no PostCSS plugins.
// Without this file, Next's postcss config lookup (find-up) walks up past
// apps/studio and resolves the monorepo root's postcss.config.mjs instead
// (which belongs to Gestion Pro and requires @tailwindcss/postcss, a
// dependency apps/studio does not have — its own package-lock.json is
// isolated from root's). This file stops that lookup here.
// If Tailwind (or any other plugin) is adopted, declare it explicitly here
// AND in apps/studio/package.json. Same pattern as apps/colors/postcss.config.mjs.
const config = {
  plugins: {},
};

export default config;
```

Ce fichier arrête la remontée de `find-up` dès `apps/studio` : Next utilise
désormais la configuration de Studio (vide, aucun plugin), jamais celle de
la racine.

**Pas copié aveuglément depuis Gestion Pro** : la config racine déclare
`@tailwindcss/postcss` parce que Gestion Pro utilise réellement Tailwind ;
Studio ne l'utilise pas (§TAILWIND ci-dessous), donc une config vide est la
solution correcte pour Studio, pas une copie de celle d'une autre app aux
besoins différents. C'est en revanche exactement le motif déjà utilisé par
`apps/colors`, une app dans la même situation que Studio (CSS standard, pas
de Tailwind) — repris à l'identique plutôt que réinventé.

---

## DEPENDENCIES

**Aucune dépendance ajoutée, aucune supprimée.** `apps/studio/package.json`
n'a pas été modifié. Le correctif est une configuration, pas un paquet.

---

## TAILWIND

- Version réellement utilisée par Studio : **aucune**. `apps/studio/package.json`
  ne déclare ni `tailwindcss` ni `@tailwindcss/postcss`, dans `dependencies`
  ni `devDependencies`.
- `apps/studio/src/app/globals.css` : CSS standard écrit à la main
  (propriétés custom, reset, pas de directive Tailwind).
- PostCSS : présent uniquement comme dépendance transitive de Next
  lui-même ; `apps/studio/package.json` a un `overrides.postcss` à
  `8.5.24`, préexistant à ce lot, sans rapport avec Tailwind.
- Plugins : aucun, avant et après ce lot (le nouveau fichier déclare
  `plugins: {}`).
- Aucune config Tailwind (`tailwind.config.*`) n'existe ni n'a été créée
  pour Studio.
- **Aucune migration de version majeure effectuée ni nécessaire** —
  conforme à la consigne.

---

## STUDIO BUILD

Rejoué deux fois (une fois par moi directement, une fois de façon
indépendante par un second passage de vérification, installation `npm`
propre à chaque fois) :

```
$ cd apps/studio && npm install && npm run build
▲ Next.js 16.3.5 (webpack)
✓ Compiled successfully in ~11-12s
  Finished TypeScript ...
✓ Generating static pages using 3 workers (12/12)
```

12 routes listées, dont `ƒ Proxy (Middleware)` — confirme au passage que le
coupe-circuit `STUDIO_ENABLED` câblé dans le lot précédent (`proxy.ts`) est
bien reconnu et appliqué par le build comme middleware réel, pas seulement
comme un fichier source. Aucune erreur, exit 0, les deux fois.

| Contrôle Studio | Résultat |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run test` (vitest) | **PASS** — 260/260 (15 fichiers, dont `tests/access.test.ts`) |
| `npm run build` | **PASS** — compilation complète, 12 routes, `Proxy (Middleware)` confirmé |

---

## MONOREPO NON-REGRESSION

Testé empiriquement (pas seulement raisonné), installation propre pour
chacune des 4 autres apps :

| App | Commande | Résultat | Comparaison à l'état préexistant |
|---|---|---|---|
| **Gestion Pro (racine)** | `npm install && npm run build` | **PASS** — `next build` (Turbopack) compile intégralement, TypeScript fini, 38/38 pages statiques, `Proxy (Middleware)` présent. Le script composite `npm run build` chaîne ensuite `apps/tools`, qui échoue sur sa propre garde (voir ligne Tools) — l'échec est **entièrement contenu dans l'étape Tools**, `next build` de Gestion Pro lui-même réussit | **Identique** à avant ce lot |
| **Tools** | `npm install && npm run build` | **FAIL** — arrêté avant `next build`, à la garde `prebuild`/`verify:public-env` (3 erreurs + 1 avis : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_TOOLS_BILLING_API_URL` absentes) | **Identique** à avant ce lot — même garde, mêmes variables manquantes, aucune trace de PostCSS/Tailwind |
| **Colors** | `npm install && npm run build` | **FAIL** — même garde `verify:public-env` (5 erreurs : Supabase URL/clé, `COLORS_URL`, `ELSATIA_ACCOUNT_URL`, `ELSATIA_APPLICATION_ENV`) | **Identique** — Colors avait déjà sa propre isolation PostCSS avant ce lot, jamais concernée par le bug |
| **Reserves** | `npm install && npm run build` | **FAIL** — même garde (4 erreurs : Supabase URL, `NEXT_PUBLIC_SUPABASE_ANON_KEY` dépréciée, `RESERVES_URL`, `ELSATIA_APPLICATION_ENV`) | **Identique** à avant ce lot |

Les 4 échecs/succès sont exactement ceux déjà connus et documentés avant ce
lot (garde `verify:public-env` faute de vraies valeurs `NEXT_PUBLIC_*` dans
ce bac à sable sans identifiants — un défaut d'environnement préexistant,
sans rapport avec PostCSS). **Aucun des 4 n'a changé de comportement.** Le
nouveau fichier vit uniquement sous `apps/studio/` : il ne peut structurellement
pas intervenir dans la résolution de configuration d'une autre app (`find-up`
part du dossier de CETTE app, jamais d'un dossier voisin).

`git diff` confirme qu'aucun fichier hors `apps/studio/postcss.config.mjs`
n'a été modifié dans ce lot ; les `package-lock.json` de la racine, `tools`,
`colors`, `reserves` sont restés byte-identiques après leurs `npm install`
respectifs (seul celui de `studio` a bougé, par churn de métadonnées
`libc` sans changement de version, écarté avant ce commit).

---

## ENV RECHECK

| Contrôle | Résultat |
|---|---|
| `node scripts/check-env-manifest.mjs` | **PASS**, 0 erreur |
| `node --test scripts/check-env-manifest.test.mjs` | **PASS**, 58/58 |

Les corrections des lots précédents (37 erreurs ENV manifest fermées,
câblage runtime des 4 variables de sécurité) restent intactes — ce lot ne
touche ni `config/env-manifest.json` ni aucun `.env.example`.

---

## OPEN RISKS

- **`apps/tools` et `apps/reserves` n'ont toujours pas leur propre
  `postcss.config.mjs`**, contrairement à `apps/colors` et désormais
  `apps/studio`. Elles sont donc structurellement exposées au même mécanisme
  de fuite si leur build atteignait un jour l'étape de compilation CSS —
  aujourd'hui elles échouent plus tôt (garde `verify:public-env`), ce qui a
  masqué le problème jusqu'ici, exactement comme pour Studio avant ce lot.
  **Non corrigé ici** : hors périmètre explicite de cette mission (« Studio
  uniquement »), et corriger des apps qui n'ont pas encore manifesté le
  symptôme risquerait de changer un comportement non vérifié pour elles.
  Signalé pour un lot séparé si souhaité.
- Le mécanisme racine (`find-up` sans limite de monorepo) n'est pas corrigé
  au niveau Next/outillage — seul son symptôme sur Studio est neutralisé par
  isolation locale. C'est la solution correcte et suffisante pour Studio,
  mais toute future app ajoutée à ce monorepo sans son propre
  `postcss.config.mjs` reproduira le même risque de fuite si son build
  atteint la compilation CSS.
- Le build Studio n'a été vérifié qu'en local, sans les vraies variables
  `NEXT_PUBLIC_SUPABASE_*` de Preview (aucun accès à ces valeurs depuis
  cette session) — la compilation réussit sans elles parce qu'aucune route
  statiquement pré-rendue n'en dépend au moment du build ; leur absence en
  exécution réelle ferait toujours échouer les fonctions serveur qui les
  lisent (`config.ts`), comportement attendu et inchangé.
- `workers/studio-video` (limitation ffmpeg `drawtext`) : non touché, comme
  demandé — `FFMPEG_DRAWTEXT = ENVIRONMENT_LIMITATION`.

---

## VERDICT

**`STUDIO BUILD ISOLATED`**

Cause prouvée par lecture directe du code source de Next, pas supposée.
Correctif minimal (un seul fichier, 13 lignes, motif déjà éprouvé dans ce
même monorepo pour une app dans la même situation), zéro dépendance
ajoutée, zéro contournement (pas de webpack modifié à l'aveugle, pas de
Tailwind désactivé puisqu'il n'était de toute façon jamais utilisé par
Studio, pas de package installé pour masquer le symptôme). `npm run build`
de Studio est vert de bout en bout, vérifié deux fois indépendamment.
Non-régression prouvée empiriquement sur les 4 autres apps du monorepo :
aucune n'a changé de comportement.

Studio n'est pas encore un `STUDIO PREVIEW CANDIDATE LOCALLY` au sens plein
du terme : ce lot ferme uniquement le blocker de build. Les autres réserves
déjà documentées dans les lots précédents (aucun accès Preview réel depuis
cette session, valeurs `NEXT_PUBLIC_*` réelles non vérifiées, `pgTAP` non
exécutée, `STUDIO_SIGNUP_REMOTE_BLOCKER` sur le hook Auth distant) restent
entières et non résolues par ce lot.
