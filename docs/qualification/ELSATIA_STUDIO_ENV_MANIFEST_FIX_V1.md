# ELSATIA — Lot ciblé : fermeture des 37 erreurs `verify:env-manifest` (Studio)

Base : `d4b9c79` (train `claude/compassionate-euler-5j6avr`).
**Nouveau SHA exact après correctif : `8f6640306547c8609852894719776ebef571b45a`**
(court : `8f66403`), sur la branche `claude/studio-env-manifest-fix-v1`, 1 commit
au-dessus de `d4b9c79`. 3 fichiers modifiés, 32 insertions, 4 suppressions —
aucune ligne de code applicatif touchée (uniquement 2 gabarits `.env.example`
et 1 entrée de `config/env-manifest.json`).

Aucune valeur secrète réelle n'a été créée. Aucun placeholder trompeur n'a été
posé pour faire passer le gate artificiellement : chaque valeur ajoutée est
soit reprise telle quelle du champ `expected` déjà déclaré par le manifeste
lui-même, soit un défaut sûr et documenté en commentaire (avec la décision
produit encore ouverte citée explicitement), soit vide pour l'unique secret
concerné. Aucun autre domaine touché : aucun prix, aucun plan, aucune donnée
Preview ou Production.

---

## Détail des 37 erreurs

12 variables distinctes portent les 37 erreurs (le contrôleur compte 3
occurrences — local/preview/production — pour la plupart des variables, mais
Studio et le worker n'ont chacun qu'**un seul** gabarit `.env.example`
générique par application, pas un par environnement : une seule ligne ajoutée
referme donc les 3 occurrences en une fois).

| # | Variable | Fichier(s) concerné(s) | Utilisée réellement ? | Build-time / Runtime | Obligatoire (manifeste) | Nom canonique | Action |
|---|---|---|---|---|---|---|---|
| 1–3 | `STUDIO_ENABLED` | `apps/studio/.env.example` (EXAMPLE-MISSING × local/preview/production) | **NON** — absente de tout le code source analysé (`apps/studio/src`, `workers/studio-video/src`) ; la description du manifeste cite `apps/studio/src/lib/config.ts` comme emplacement d'implémentation, mais ce fichier ne la lit pas — référence de manifeste obsolète | Runtime (déclaré `build_time: false, runtime: true`) | Facultative (`required: false`, drapeau fail-open : absent = actif) | `STUDIO_ENABLED` | **Ajouter au template** — `STUDIO_ENABLED=1`, valeur reprise de `expected.{local,preview,production}` du manifeste (identique sur les 3 environnements) |
| 4–6 | `STUDIO_SIGNUP_MODE` | `apps/studio/.env.example` (× 3) | **NON** — aucune lecture trouvée dans le code | Runtime | Facultative (fail-open, `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` ouverte pour la valeur cible en production) | `STUDIO_SIGNUP_MODE` | **Ajouter au template** — `STUDIO_SIGNUP_MODE=closed` (valeur sûre par défaut, commentée : preview/production doivent la fixer explicitement, décision production non tranchée ici) |
| 7–9 | `STUDIO_SIGNUP_ALLOWLIST` | `apps/studio/.env.example` (× 3) | **NON** — aucune lecture trouvée | Runtime | Facultative, pertinente seulement si `STUDIO_SIGNUP_MODE=allowlist` | `STUDIO_SIGNUP_ALLOWLIST` | **Ajouter au template** — vide (`STUDIO_SIGNUP_ALLOWLIST=`) |
| 10–12 | `STUDIO_LEGAL_PUBLISHED` | `apps/studio/.env.example` (× 3) | **NON** — aucune lecture trouvée | Runtime | Facultative (fail-closed : absent = refusé) | `STUDIO_LEGAL_PUBLISHED` | **Ajouter au template** — `STUDIO_LEGAL_PUBLISHED=1`, reprend `expected.local`/`expected.preview` ; commentaire : production reste une décision explicite à poser |
| 13 | `STUDIO_LEGAL_TEXT_VERSION` | `apps/studio/.env.example` (EXAMPLE-MISSING, production uniquement — le manifeste ne la déclare que pour cet environnement) | **NON** — aucune lecture trouvée | Runtime | **Corrigée** : `required: true` → `false` (voir #14) | `STUDIO_LEGAL_TEXT_VERSION` | **Ajouter au template** — `STUDIO_LEGAL_TEXT_VERSION=v1` (valeur d'exemple non engageante) |
| 14 | `STUDIO_LEGAL_TEXT_VERSION` (ENV-REQUIRED-UNUSED) | `config/env-manifest.json` | **NON**, confirmé par le contrôleur lui-même (« déclarée obligatoire mais lue nulle part dans le code analysé ») | Runtime déclaré, mais aucune fonctionnalité d'affichage de version n'existe | Était `required: true` — incohérent avec l'absence totale d'usage | `STUDIO_LEGAL_TEXT_VERSION` | **Corriger le manifeste** — `required: false`, description complétée expliquant pourquoi (implémenter l'affichage de version est hors périmètre de ce lot ; à repasser obligatoire quand la fonctionnalité existera) |
| 15–17 | `STUDIO_AI_ANALYSIS` | `workers/studio-video/.env.example` (EXAMPLE-MISSING × 3) | **OUI** — lue dans `apps/studio/src/lib/analysis.ts:11` **et** `workers/studio-video/src/analysis-worker.ts:19` (déjà présente dans `apps/studio/.env.example`, seul le gabarit worker manquait) | Runtime | Facultative (fail-closed, défaut OFF) | `STUDIO_AI_ANALYSIS` | **Ajouter au template worker** — `STUDIO_AI_ANALYSIS=0`, valeur déjà utilisée côté Studio, cohérente |
| 18–20 | `STUDIO_ANALYSIS_PYTHON` | `workers/studio-video/.env.example` (× 3) | **OUI** — `workers/studio-video/src/analysis-worker.ts:30` (`required("STUDIO_ANALYSIS_PYTHON")`, exigé quand `STUDIO_AI_ANALYSIS=1`) | Runtime | Facultative, conditionnelle | `STUDIO_ANALYSIS_PYTHON` | **Ajouter au template worker** — vide, cohérent avec le gabarit Studio existant |
| 21–23 | `STUDIO_ANALYSIS_CONCURRENCY` | `workers/studio-video/.env.example` (EXAMPLE-MISSING × 3) **et** `apps/studio/.env.example` (EXAMPLE-FOREIGN × 1, ligne 12) | **OUI, mais uniquement dans le worker** — `workers/studio-video/src/analysis-worker.ts:236`. Aucune lecture dans `apps/studio/src` | Runtime | Facultative (défaut 1) | `STUDIO_ANALYSIS_CONCURRENCY` — manifeste : `applications: ["studio_worker"]` uniquement | **Retirer du template Studio** (ligne 12, hors périmètre réel de l'app web) **+ ajouter au template worker** — `STUDIO_ANALYSIS_CONCURRENCY=1` (valeur déplacée telle quelle, pas modifiée) |
| 24–26 | `STUDIO_ANALYSIS_TIMEOUT_SECONDS` | `workers/studio-video/.env.example` (EXAMPLE-MISSING × 3) **et** `apps/studio/.env.example` (EXAMPLE-FOREIGN × 1, ligne 13) | **OUI, uniquement dans le worker** — `workers/studio-video/src/analysis-worker.ts:129`. Aucune lecture dans `apps/studio/src` | Runtime | Facultative (défaut 120) | `STUDIO_ANALYSIS_TIMEOUT_SECONDS` — manifeste : `applications: ["studio_worker"]` uniquement | **Retirer du template Studio** (ligne 13) **+ ajouter au template worker** — `STUDIO_ANALYSIS_TIMEOUT_SECONDS=120` (valeur déplacée telle quelle) |
| 27–29 | `RESEND_API_KEY` | `apps/studio/.env.example` (× 3) | **NON** — aucune lecture trouvée | Runtime | Facultative, conditionnelle (`quand STUDIO_MAIL_PROVIDER=resend`) — **secret** (`secret: true`) | `RESEND_API_KEY` | **Ajouter au template** — vide (`RESEND_API_KEY=`), aucune valeur secrète créée, conforme à la convention déjà utilisée pour les autres secrets du dépôt (`BREVO_API_KEY=`, `SUPABASE_SERVICE_ROLE_KEY=` en gabarit preview) |
| 30–32 | `STUDIO_MAIL_PROVIDER` | `apps/studio/.env.example` (× 3) | **NON** — aucune lecture trouvée | Runtime | Facultative (`allowed_values: mailpit, resend`) | `STUDIO_MAIL_PROVIDER` | **Ajouter au template** — `STUDIO_MAIL_PROVIDER=mailpit` (outil de dev local documenté par le manifeste, ne nécessite pas `RESEND_API_KEY`) |
| 33–35 | `STUDIO_MAIL_FROM` | `apps/studio/.env.example` (× 3) | **NON** — aucune lecture trouvée | Runtime | Facultative (`quand STUDIO_MAIL_PROVIDER est défini`) | `STUDIO_MAIL_FROM` | **Ajouter au template** — `STUDIO_MAIL_FROM=studio@example.com` (domaine `example.com`, réservé par la RFC 2606 pour la documentation — non un domaine réel, non trompeur) |

Total : 37/37 erreurs couvertes (3+3+3+3+1+1+3+3+4+4+3+3+3 = 37, vérifié).

### Constat transversal

**8 des 12 variables concernées (`STUDIO_ENABLED`, `STUDIO_SIGNUP_MODE`,
`STUDIO_SIGNUP_ALLOWLIST`, `STUDIO_LEGAL_PUBLISHED`,
`STUDIO_LEGAL_TEXT_VERSION`, `RESEND_API_KEY`, `STUDIO_MAIL_PROVIDER`,
`STUDIO_MAIL_FROM`) ne sont lues par aucun code applicatif à ce jour.** Le
manifeste les avait déclarées par anticipation d'une fonctionnalité (kill
switch Studio, politique d'inscription, parcours légal, e-mail
transactionnel) qui n'est pas encore câblée dans le code — la description du
manifeste pour `STUDIO_ENABLED` cite même un emplacement de code
(`apps/studio/src/lib/config.ts`) qui ne l'implémente pas réellement. Ce lot
ferme le gate `verify:env-manifest` (synchronisation gabarit ↔ manifeste,
strictement) **sans implémenter ces fonctionnalités** : c'est un domaine
distinct (produit/sécurité), volontairement non touché ici conformément au
périmètre demandé. Signalé pour suite à donner séparément.

Seules 4 des 12 variables (`STUDIO_AI_ANALYSIS`, `STUDIO_ANALYSIS_PYTHON`,
`STUDIO_ANALYSIS_CONCURRENCY`, `STUDIO_ANALYSIS_TIMEOUT_SECONDS`) sont
réellement lues par du code existant et fonctionnel.

### `NOT_PROVEN_REMOTE`

**Aucune des 37 erreurs ne relevait d'une configuration distante réelle** —
toutes les 37 étaient une désynchronisation purement locale entre deux
gabarits `.env.example` versionnés et `config/env-manifest.json`, un fichier
lui-même versionné. `verify:env-manifest` est un script à zéro dépendance
(pas d'appel réseau, aucun identifiant requis) : sa réussite est donc
directement vérifiable et vérifiée dans cette session, sans réserve.

Ce qui reste, en revanche, `NOT_PROVEN_REMOTE` et distinct de ce lot :
- la valeur **réellement posée** sur le projet Vercel/Supabase Preview pour
  chacune de ces variables (ce lot ne fixe qu'un gabarit d'exemple, pas une
  valeur Preview réelle) ;
- les **10 `DECISION_REQUIRED` produit** déjà ouvertes par le manifeste
  (dont `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT`, qui détermine la vraie
  valeur cible de `STUDIO_SIGNUP_MODE` en production) — non tranchées ici,
  hors périmètre d'un lot de synchronisation de gabarits ;
- le fait que **8 variables sur 12 ne sont pas câblées dans le code** :
  fermer le gate ne rend pas ces fonctionnalités opérantes en Preview réelle.

---

## Rejeu des contrôles après correctif

| Contrôle | Avant | Après |
|---|---|---|
| `node scripts/check-env-manifest.mjs` | `FAIL`, exit 1, 37 erreurs | **`PASS`, exit 0** — « aucune erreur — 10 décision(s) DECISION_REQUIRED en attente (non bloquantes) » |
| `node --test scripts/check-env-manifest.test.mjs` | 57/58 | **58/58** |
| `apps/studio` : `npm run typecheck` | — | **PASS**, 0 erreur |
| `apps/studio` : `npm run lint` | — | **PASS**, 0 erreur |
| `apps/studio` : `npm run test` (vitest) | — | **PASS**, 251/251 |
| `apps/studio` : `npm run build` | — | **FAIL** — `Cannot find module '@tailwindcss/postcss'` (compilation de `src/app/globals.css`). Dépendance manquante de `apps/studio/package.json`, préexistante, **sans rapport avec ce lot** : `package.json`/`package-lock.json` de Studio n'ont pas été touchés, et l'échec survient avant même d'atteindre la vérification des variables Supabase de `config.ts`. Non corrigé ici (hors périmètre : ce lot ne touche que le manifeste ENV) |
| `workers/studio-video` : `npm run typecheck` | — | **PASS** |
| `workers/studio-video` : `npm run lint` | — | **PASS** |
| `workers/studio-video` : `npm run test` (vitest) | — | **FAIL partiel** — 15/22 passés, 3 échecs (`tests/render.test.ts`, `tests/templates.test.ts`), 4 ignorés. Cause : le binaire `ffmpeg-static` 7.0.2 de ce bac à sable ne contient pas le filtre `drawtext` malgré `--enable-libfreetype`, plus une erreur de framerate constant sur `xfade`. Limitation de l'environnement d'exécution (binaire ffmpeg embarqué), **sans rapport avec ce lot** : aucun fichier du worker autre que son `.env.example` n'a été modifié |

Les deux échecs relevés (`@tailwindcss/postcss` manquant, `ffmpeg` sans
`drawtext`) sont **préexistants à `d4b9c79`** et indépendants de ce lot —
confirmés par un rejeu indépendant qui n'a modifié aucun fichier de code, ni
`package.json`, ni lockfile (les lockfiles régénérés par `npm install` ont
été délibérément écartés avant ce commit pour ne garder que les 3 fichiers
concernés par le correctif ENV manifest).

---

## VERDICT

**`STUDIO ENV MANIFEST CLOSED`**

Les 37 erreurs sont fermées, vérifié par un rejeu indépendant de
`verify:env-manifest`/`test:env-manifest` (PASS, 0 erreur, 58/58 tests). Le
correctif est strictement local et documentaire (2 gabarits `.env.example` +
1 entrée de manifeste), sans code applicatif touché, sans valeur secrète
créée, sans placeholder trompeur, sans changement de prix/plan, sans aucun
accès Preview ni Production.

Deux défauts **distincts et préexistants** ont été mis au jour en rejouant
typecheck/lint/tests/build de Studio comme demandé — ni causés ni couverts
par ce lot, signalés pour suite séparée :
1. `apps/studio` : dépendance manquante `@tailwindcss/postcss`, empêche
   `next build` de compiler `globals.css`.
2. `workers/studio-video` : le binaire `ffmpeg-static` de cet environnement
   ne supporte pas le filtre `drawtext`, fait échouer 3 tests de rendu.

Ces deux points ne relèvent pas du domaine « ENV manifest » et n'ont pas été
traités ici conformément au périmètre demandé.
