# ELSATIA — Lot ciblé : TOOLS + RESERVES POSTCSS ISOLATION V1

Base : `claude/studio-build-isolation-v1`, SHA `9d4331ce7e92b8622730869aa81a392b557fbd8c`
(+ docs `a8f860c`). **Nouveau SHA exact après ce lot :
`e79864f8a88c062b1fdf87938e8616c1ce3998d1`** (court : `e79864f`), branche
`claude/tools-reserves-postcss-isolation-v1`. 2 fichiers ajoutés (31 lignes
au total), aucun autre fichier touché. `apps/studio` et
`workers/studio-video` non touchés, conformément à la consigne. Non fusionné
dans le train principal.

---

## 1. Diagnostic — CSS et configuration existante

| | `apps/tools` | `apps/reserves` |
|---|---|---|
| Dépendance `tailwindcss`/`@tailwindcss/postcss` déclarée ? | Non | Non |
| `postcss.config.*` local avant ce lot ? | Non | Non |
| Directive Tailwind (`@tailwind`/`@import "tailwindcss"`) dans le CSS ? | Aucune (`globals.css` + 4 `*.module.css`, tous du CSS standard) | Aucune (`globals.css`) |
| Bundler de build | webpack (`next build --webpack`) | **Turbopack** (`next build`, pas de `--webpack`) |

Même situation que Studio avant son propre correctif : aucune des deux apps
n'utilise Tailwind, aucune n'a de configuration PostCSS à elle.

---

## 2. Preuve de la résolution PostCSS (avant correctif)

Aucune correction n'a été appliquée avant cette étape. Pour atteindre
réellement l'étape de compilation CSS — les deux builds échouent normalement
bien avant, à leur garde `verify:public-env` — chaque garde a été franchie
par son **propre mécanisme documenté de déclaration d'un build local**, tel
que suggéré par le message d'erreur de la garde elle-même : une variable
d'environnement **passée uniquement sur la ligne de commande, jamais écrite
dans un fichier, jamais commitée**. Ce n'est pas un contournement de
`verify:public-env` : c'est l'usage prévu de son propre mode `local`/`ignore`,
non bloquant par conception pour un build de recette.

- **`apps/tools`** : `NEXT_PUBLIC_TOOLS_ENV=local npm run build` (mode
  reconnu par `resolveBuildMode()`, passe la garde en « skipped », aucune
  autre variable nécessaire). Résultat : `Error: Cannot find module
  '@tailwindcss/postcss'`, exactement la même erreur que pour Studio, en
  compilant `workshop.module.css`/`viewport.module.css` — deux fichiers sans
  aucune syntaxe Tailwind.
- **`apps/reserves`** : `ELSATIA_APPLICATION_ENV=local npm run build` (mode
  reconnu par `resoudreMode()`, passe la garde en « ignore »). Résultat :
  **même erreur**, `Cannot find module '@tailwindcss/postcss'`, mais cette
  fois remontée par le pipeline **Turbopack** (`transforms/postcss.ts?config=
  [project]/postcss.config.mjs`) plutôt que webpack — preuve que le mécanisme
  de fuite touche les deux pipelines de Next 16, pas seulement webpack.

Dans les deux cas, aucun autre fichier `postcss.config.*` n'existe entre le
dossier de l'app et la racine du dépôt (seuls `apps/colors/postcss.config.mjs`
et `postcss.config.mjs` à la racine existent avant ce lot) : par élimination
et par la nature de l'erreur (`@tailwindcss/postcss`, référencé uniquement
par la config racine), la config chargée à tort est bien celle de la racine,
même mécanisme que Studio.

---

## 3. Correctif

Un seul fichier par app, motif identique à `apps/colors` et `apps/studio` —
**pas copié depuis Gestion Pro** (qui utilise réellement Tailwind) :

```js
// apps/tools/postcss.config.mjs et apps/reserves/postcss.config.mjs
const config = {
  plugins: {},
};
export default config;
```

Aucune dépendance ajoutée ni supprimée dans `apps/tools/package.json` ou
`apps/reserves/package.json`. Aucune variable d'environnement réelle
modifiée ou commitée nulle part.

---

## 4. Résultats après correctif

| Contrôle | `apps/tools` | `apps/reserves` |
|---|---|---|
| `npm run typecheck` | **PASS** | **PASS** |
| `npm run lint` | **PASS** | **PASS** |
| `npm run test` (vitest) | **PASS** — 1992/1992 | **PASS** — 178/178 |
| `npm run build` (avec la déclaration locale ci-dessus, non commitée) | **PASS** — 47/47 pages, service worker généré, exit 0, zéro occurrence « tailwind »/« postcss » dans le journal | Erreur Tailwind/PostCSS **entièrement disparue** (zéro occurrence dans le journal), mais **échec sur un blocage distinct et préexistant**, voir §5 |

Vérifié deux fois indépendamment (une fois par moi, une fois par un second
passage de vérification avec installation `npm` propre), résultats
identiques.

---

## 5. Blocage distinct découvert sur Reserves (non corrigé, hors périmètre)

Après disparition complète de l'erreur PostCSS, `apps/reserves` échoue
encore sur : `Error: Module not found: Can't resolve '@sentry/nextjs'`
(`sentry.server.config.ts`, `sentry.edge.config.ts`,
`src/instrumentation.ts`).

Caractérisation précise (établie par la vérification indépendante) : ces
fichiers Sentry ne vivent **pas** dans `apps/reserves` — ce sont ceux de
**Gestion Pro, à la racine du monorepo**. `apps/reserves/next.config.ts`
règle `turbopack.root` sur la racine du dépôt (nécessaire pour ses paquets
liés en `file:`), ce qui fait que Turbopack découvre **aussi** les fichiers
d'instrumentation de la racine lors du build de Reserves. Le résultat dépend
alors de l'état de `node_modules` à la racine :
- racine non installée → l'erreur `@sentry/nextjs` apparaît (état reproduit
  et documenté ici) ;
- racine installée (le paquet `@sentry/nextjs` de Gestion Pro devient
  résolvable par la remontée `node_modules` de Node) → le build Reserves
  **réussit**, mais embarque alors la configuration Sentry de Gestion Pro,
  pas la sienne.

C'est donc une **deuxième fuite inter-applications**, de nature différente
de celle de PostCSS (fichiers d'instrumentation découverts via
`turbopack.root`, pas résolution de config PostCSS) et **non traitée dans ce
lot** : le périmètre demandé était strictement l'isolation PostCSS. Ni
dépendance ajoutée ni `turbopack.root` modifié sans preuve supplémentaire du
bon correctif — signalé pour un lot séparé.

---

## 6. Non-régression monorepo

Testé empiriquement, pas seulement raisonné :

| App | Résultat | Comparaison à l'état préexistant |
|---|---|---|
| **Gestion Pro (racine)** | `next build` propre — 38/38 pages, TypeScript sans erreur. Le script composite racine ne chaîne que `apps/tools` (vérifié dans `package.json` : `next build && npm --prefix apps/tools run build`, pas reserves/colors) ; l'étape Tools chaînée s'arrête à sa garde `verify:public-env` en mode Production forcé (variables `NEXT_PUBLIC_*` réelles absentes) **avant même `next build`** — comportement inchangé, avec ou sans ce correctif, puisque ce chemin d'appel n'atteint jamais la compilation CSS | **Identique** à avant ce lot |
| **Colors** | `npm install`, typecheck/lint/test (427/427) et build tous PASS, zéro trace de PostCSS/Tailwind | **Identique** — Colors avait déjà son isolation avant ce lot, non affectée |
| **`apps/studio`** | Non reconstruit, non modifié (`git status` vide sur ce dossier) | Intact, comme demandé |
| **`workers/studio-video`** | Non touché | Intact, comme demandé |

Lockfiles : `apps/tools/package-lock.json`, `apps/reserves/package-lock.json`,
`package-lock.json` (racine) et `apps/colors/package-lock.json` byte-
identiques avant/après chaque `npm install` (empreintes comparées) — aucun
changement de dépendance nulle part.

---

## VERDICT

**`POSTCSS ISOLATION FIXED`**

La fuite de configuration PostCSS vers la racine du monorepo, déjà corrigée
pour Studio, est **prouvée puis corrigée** pour `apps/tools` et
`apps/reserves`, par le même mécanisme minimal et déjà éprouvé dans ce
dépôt (`{ plugins: {} }`, aucune dépendance ajoutée). Aucune régression sur
Gestion Pro, Colors ; Studio et le worker vidéo non touchés.

`apps/tools` est désormais vert de bout en bout (typecheck, lint, tests,
build). `apps/reserves` a son isolation PostCSS entièrement prouvée et
fermée, mais reste bloqué en build par un défaut **distinct, préexistant et
non lié à PostCSS/Tailwind** (fuite d'instrumentation Sentry racine → sous-
app via `turbopack.root`) : ce blocage-là n'est pas fermé par ce lot,
délibérément, faute d'être dans son périmètre.
