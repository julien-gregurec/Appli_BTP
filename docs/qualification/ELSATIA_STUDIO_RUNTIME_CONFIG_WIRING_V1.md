# ELSATIA — Lot ciblé : STUDIO RUNTIME CONFIG WIRING V1

Base : `8f6640306547c8609852894719776ebef571b45a` (lot STUDIO ENV MANIFEST,
37/37 erreurs closes), lui-même sur `d4b9c79`.
**Nouveau SHA exact après ce lot : `82e5ce7f66e1648a03ab8d91309b9431dfbc3506`**
(court : `82e5ce7`), branche `claude/studio-runtime-config-wiring-v1`.
2 commits au-dessus de `d4b9c79` au total. **Non fusionné dans le train
principal, comme demandé.**

Aucun secret committé. Aucun bypass navigateur-only pour le signup : toute la
logique de contrôle vit dans le Server Action `signup()`
(`apps/studio/src/app/actions.ts`, `"use server"`), jamais dans un composant
client — un attaquant qui désactive JavaScript ou appelle l'action
directement se heurte exactement au même contrôle. Fail-closed appliqué à
tous les contrôles de sécurité (signup, allowlist, légal). Aucun accès
Preview ni Production.

---

## Rapport des 8 variables

| Variable | Doit piloter le produit ? | Décision | Où |
|---|---|---|---|
| `STUDIO_SIGNUP_MODE` | **Oui** — c'est le contrôle d'accès aux inscriptions | **Câblée, FAIL-CLOSED.** `studioSignupMode()` (`packages/studio-domain/src/access.ts`) : seules les valeurs exactes `"open"`/`"allowlist"` sont acceptées ; tout le reste (absent, `"closed"`, faute de frappe) → `"closed"`. Appelée en tête de `signup()`. Corrige le `FLAG-FAIL-OPEN` précédemment documenté (`F-STUDIO-SIGNUP-DEFAULT-OPEN`, désormais `status: fixed`) | `apps/studio/src/app/actions.ts` |
| `STUDIO_SIGNUP_ALLOWLIST` | **Oui**, conditionnel à `STUDIO_SIGNUP_MODE=allowlist` | **Câblée, FAIL-CLOSED.** `isStudioSignupAllowlisted(email, allowlist)` : correspondance exacte insensible à la casse, ou `@domaine` pour un domaine entier ; **jamais** de correspondance partielle (`a@notelsatia.fr` ne matche pas `@elsatia.fr`, `a@elsatia.fr.evil.test` non plus) ; liste vide ou absente = personne n'est autorisé | `apps/studio/src/app/actions.ts` |
| `STUDIO_ENABLED` | **Oui** — coupe-circuit d'exploitation | **Câblée, fail-open par conception** (conservé tel que déjà documenté par le manifeste : c'est un interrupteur d'exploitation, pas un contrôle d'accès — un oubli de configuration ne doit pas couper tout le site). `studioEnabled()` en tête de `proxy.ts` (équivalent middleware de cette app, matcher = toutes les routes sauf assets statiques) : renvoie 503 immédiatement si la valeur vaut explicitement `0`/`false`/`off` | `apps/studio/src/proxy.ts` |
| `STUDIO_LEGAL_PUBLISHED` | **Oui, mais portée redéfinie** — aucune page légale/consentement n'existe dans le code : impossible de « gater l'affichage d'un parcours légal » qui n'existe pas. Interprétation retenue et documentée dans le manifeste : bloquer la **création de compte** tant que le juridique n'est pas publié, plutôt que de laisser la variable décorative | **Câblée, FAIL-CLOSED**, `studioLegalPublished()`, même point que le signup — seule la valeur exacte `"1"` autorise l'inscription | `apps/studio/src/app/actions.ts` |
| `STUDIO_LEGAL_TEXT_VERSION` | **Non, pas dans cet état du produit** — variable de version d'un texte légal à « présenter à l'acceptation » : aucune UI d'acceptation n'existe pour l'afficher. La construire exigerait un vrai texte légal (contenu juridique), explicitement hors périmètre de ce lot | **Retirée du manifeste et du gabarit** (`config/env-manifest.json`, `apps/studio/.env.example`). À réintroduire quand un parcours d'acceptation légale réel existera | — |
| `RESEND_API_KEY` | **Non** — aucune fonctionnalité d'envoi d'e-mail n'existe dans Studio à ce jour | **Retirée du manifeste et du gabarit.** `ELSATIA-STUDIO-V1-ARCHITECTURE.md` et `ELSATIA-STUDIO-V1-LOT-A-REPORT.md` déclarent explicitement les invitations par e-mail hors périmètre de cette fondation | — |
| `STUDIO_MAIL_PROVIDER` | **Non**, même raison | **Retirée du manifeste et du gabarit** | — |
| `STUDIO_MAIL_FROM` | **Non**, même raison | **Retirée du manifeste et du gabarit** | — |

**Aucune variable de sécurité n'est restée décorative** : les deux qui
pilotent réellement un contrôle d'accès (`STUDIO_SIGNUP_MODE`,
`STUDIO_SIGNUP_ALLOWLIST`) sont câblées fail-closed avec tests ; celle qui
gate la création de compte (`STUDIO_LEGAL_PUBLISHED`) aussi ; celle qui est
un interrupteur d'exploitation (`STUDIO_ENABLED`) reste fail-open par
conception documentée, pas par oubli. Les 4 restantes n'ont aucune prise
réelle sur le produit et ont été retirées plutôt que laissées comme
déclarations mortes.

Le finding `F-STUDIO-MAIL-PROVIDER` (deux fournisseurs e-mail, Resend vs
Brevo) est marqué `accepted` : plus de variables Studio à arbitrer tant que
la fonctionnalité d'e-mail n'existe pas ; à rouvrir le jour où elle sera
construite.

---

## Code ajouté

`packages/studio-domain/src/access.ts` (nouveau, pur, sans effet de bord —
même style que `analysisEnabled()` déjà existant dans `analysis.ts`) :
`studioSignupMode`, `isStudioSignupAllowlisted`, `studioEnabled`,
`studioLegalPublished`. Testé isolément dans
`apps/studio/tests/access.test.ts` (9 cas : défauts fail-open/fail-closed,
casse, domaines, absence de correspondance partielle de domaine).

Points d'application, tous côté serveur :
- `apps/studio/src/proxy.ts` — équivalent middleware de cette app (fichier
  et export nommés `proxy`/`proxy()`, convention déjà en place avant ce lot,
  partagée avec `apps/reserves/src/proxy.ts` ; ce n'est pas une invention de
  ce lot). `config.matcher` couvre déjà toutes les routes sauf les assets
  statiques Next — le coupe-circuit s'applique donc à toute la surface web.
- `apps/studio/src/app/actions.ts`, fonction `signup()` — un Server Action
  (`"use server"`), jamais exposé au bundle client ; c'est la seule voie
  serveur par laquelle un compte peut être créé (le formulaire
  `src/app/signup/page.tsx` poste directement dessus, sans détour API
  publique parallèle qui contournerait le contrôle).

---

## Rejeu des contrôles

| Contrôle | Résultat |
|---|---|
| `node scripts/check-env-manifest.mjs` | **PASS**, exit 0, 0 erreur (constats ouverts : 13, contre 15 avant ce lot — 2 fermés/acceptés) |
| `node --test scripts/check-env-manifest.test.mjs` | **PASS**, 58/58 |
| `apps/studio` : `npm run typecheck` | **PASS** |
| `apps/studio` : `npm run lint` | **PASS** |
| `apps/studio` : `npm run test` (vitest) | **PASS** — 260/260 (15 fichiers, dont le nouveau `tests/access.test.ts`, 9/9 isolément) |
| `apps/studio` : `npm run build` | **FAIL** — cause exacte identifiée ci-dessous, **non corrigée délibérément** |
| `workers/studio-video` : `npm run typecheck` | **PASS** |
| `workers/studio-video` : `npm run lint` | **PASS** |
| `workers/studio-video` : `npm run test` (vitest) | **FAIL partiel, inchangé** — 3/22 (voir §FFmpeg) |

### Build Studio : cause exacte, non corrigée

Hypothèse initiale (« `@tailwindcss/postcss` manquant dans
`apps/studio/package.json` ») **vérifiée fausse par lecture directe du code
source de Next 16.3.5** (`node_modules/next/dist/build/webpack/config/blocks/css/plugins.js`,
`getPostCssPlugins()`/`getDefaultPlugins()`) et de sa documentation livrée
(`node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`) :

- Sans configuration PostCSS trouvée, Next 16 utilise par défaut
  uniquement `postcss-flexbugs-fixes` + `postcss-preset-env` — **jamais**
  Tailwind par défaut. `apps/studio/src/app/globals.css` ne contient d'ailleurs
  aucune directive Tailwind (`@tailwind`/`@import "tailwindcss"`), donc
  Tailwind ne devrait strictement pas intervenir dans ce build.
- La recherche de configuration (`findConfig`, via `find-up`) remonte
  l'arborescence des dossiers **sans connaître les limites du monorepo**.
  `apps/studio` n'a pas son propre `postcss.config.mjs` ; la remontée
  atteint donc le `postcss.config.mjs` **de la racine du dépôt**, qui
  appartient à une autre application (Gestion Pro) et référence
  `@tailwindcss/postcss` — package que `apps/studio` (lockfile isolé) ne
  possède pas.

**Cause réelle : fuite de configuration inter-applications par remontée de
répertoire, pas une dépendance manquante.** Ajouter `@tailwindcss/postcss`
au `package.json` de Studio ferait disparaître l'erreur mais **masquerait**
ce bug d'isolation au lieu de le corriger, et changerait potentiellement le
pipeline CSS de Studio de façon non vérifiable ici (le comportement exact du
plugin Tailwind sur un CSS qui n'utilise aucune de ses directives n'a pas été
vérifié empiriquement). Une correction propre (fichier
`apps/studio/postcss.config.mjs` isolant l'app, avec les bons plugins par
défaut) changerait le comportement du pipeline CSS de Studio et n'est donc
**ni minimale ni certaine** au sens de la consigne — délibérément **non
appliquée**. Diagnostic complet transmis pour décision séparée : ce défaut
préexiste à `d4b9c79`, est indépendant des 8 variables de ce lot, et n'a pas
été introduit par lui.

### FFmpeg worker : limitation documentée, non touchée

`workers/studio-video` : `tests/render.test.ts` (×2) et
`tests/templates.test.ts` (×1) échouent avec
`[AVFilterGraph] No such filter: 'drawtext'`, plus une erreur en cascade de
framerate constant sur `xfade`. Le binaire `ffmpeg-static` embarqué dans ce
bac à sable ne supporte pas le filtre `drawtext` malgré la configuration
`--enable-libfreetype` attendue par le code. **Confirmé identique à
l'échec déjà documenté dans le lot précédent** (même 3 tests, même cause) :
c'est une limitation du binaire ffmpeg de cet environnement d'exécution, pas
du code. Non refactoré, conformément à la consigne.

---

## VERDICT

**`STUDIO CONFIG PARTIALLY WIRED`**

Le contrat des 8 variables lui-même est **entièrement traité** : 4 câblées
côté serveur avec tests (fail-closed pour les contrôles de sécurité,
fail-open documenté et volontaire pour le seul interrupteur d'exploitation),
4 proprement retirées du manifeste faute de tout consommateur réel possible
sans construire une fonctionnalité hors périmètre. `verify:env-manifest`,
`typecheck`, `lint` et `test` de Studio sont tous verts.

Le libellé retenu n'est pas « CLOSED » à cause d'un seul point, explicitement
demandé dans les vérifications finales : **`npm run build` de Studio reste en
échec**, pour une cause préexistante à ce lot, indépendante des 8 variables
et diagnostiquée avec certitude (fuite du `postcss.config.mjs` racine vers
`apps/studio` par remontée de répertoire), mais non corrigée ici faute d'un
correctif à la fois minimal et certain, conformément à la consigne. Ce point
reste bloquant pour un build Studio propre et devra être traité séparément.
