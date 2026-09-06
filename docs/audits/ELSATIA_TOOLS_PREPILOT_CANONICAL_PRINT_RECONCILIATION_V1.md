# ELSATIA — Réconciliation canon Tools pré-pilote × correctif impression (V1)

**Lot :** `ELSATIA-TOOLS-PREPILOT-CANONICAL-PRINT-RECONCILIATION-V1`
**Date :** 2026-09-06
**Branche produite :** `integration/tools-prepilot-canonical-print-v1`
**Worktree isolé :** `scratchpad/wt-print-canon` (base exacte `a54cc4d`)

---

## 1. Topologie Git réelle

| Élément | SHA | Nature |
| --- | --- | --- |
| Canon pré-pilote Tools | `a54cc4d5c0b9672e00788fb08dcde054265e90ee` | `chore(tools): consolidate prepilot canonical branch` |
| Parent du canon | `bc67ca7b9ee38aaa88623d87f974e4d9116bb936` | — |
| Correctif impression | `c8260e113188b5000a4d8c8492ffc171c0a1fb9b` | `fix(tools): restore safe print export flow` |
| Parent de `c8260e1` | `9bd2615c153e90e3daa8a54c69590eecf1faa30b` | — |
| **merge-base(`a54cc4d`, `c8260e1`)** | **`9bd2615c153e90e3daa8a54c69590eecf1faa30b`** | = parent direct de `c8260e1` |

**Conséquence :** `c8260e1` est un commit unique posé directement sur la merge-base. Les deux
lignées ont divergé à partir du même point ; le canon a poursuivi seul (Atelier, PWA, sécurité,
Conseils…), et a au passage introduit **son propre correctif impression partiel**.

Fichiers touchés par `c8260e1` : `apps/tools/src/lib/exports/print.ts`, `print.test.ts` (nouveau).
Aucun autre fichier — le correctif n'a jamais touché la sécurité, Engine B, la PWA ni les exports.

---

## 2. Les deux corrections impression face à face

Le canon `a54cc4d` **contenait déjà** une correction locale (une ligne, réécrite) :

```ts
// a54cc4d (canon) — correction partielle
const target = window.open("", "_blank");
if (!target) throw new Error("Autorisez l’ouverture de la vue d’impression.");
target.opener = null;
target.addEventListener("load", () => { target.focus(); target.print(); }, { once: true });
target.document.open(); target.document.write(renderPrintHtml(document)); target.document.close();
```

### Matrice comportementale

| Comportement | Canon `a54cc4d` | `c8260e1` | Version retenue |
| --- | --- | --- | --- |
| Récupération de la fenêtre | oui | oui | identique |
| `noopener` | retiré | retiré | identique |
| `noreferrer` | retiré | retiré | identique |
| `opener = null` | oui, nu | oui, via `detachOpener()` `try/catch` | **`c8260e1`** |
| Ordre de sécurité (coupure avant écriture) | oui | oui | identique |
| `document.write` | oui | oui | identique |
| `document.close` | oui | oui | identique |
| Écoute `load` avant `close()` | oui (avant `open()`) | oui (avant `close()`) | **`c8260e1`** |
| Repli `readyState === "complete"` | **absent** | présent | **`c8260e1`** |
| Repli temporel (400 ms) | **absent** | présent | **`c8260e1`** |
| Garde anti-double impression | **absent** | `launched` | **`c8260e1`** |
| Fenêtre refermée par l'utilisateur | **non gardé** | `target.closed` | **`c8260e1`** |
| Absence de `window.print` (WebView Capacitor) | **non géré** | `close()` + message PDF/Partager | **`c8260e1`** |
| `focus()` défensif | non | `try/catch` | **`c8260e1`** |
| Documentation du « pourquoi » | courte | complète | **`c8260e1`** |

**`c8260e1` est un sur-ensemble strict du correctif canon.** Aucune amélioration du canon n'est
perdue : le canon n'apportait sur ce fichier que ce que `c8260e1` apporte déjà, en plus complet.

---

## 3. Stratégie retenue

**Option C — résolution manuelle ciblée**, et non un `cherry-pick`.

Motif : `print.ts` a divergé sur les deux lignées (le canon porte sa propre correction partielle),
un `cherry-pick` de `c8260e1` produisait donc un conflit sur la seule ligne réécrite, pour un
résultat identique à la reprise directe. Le delta étant strictement circonscrit à deux fichiers,
la reprise ciblée est plus lisible et plus vérifiable.

Actions :

1. `print.ts` ← version `c8260e1` **verbatim** (sur-ensemble strict).
2. `print.test.ts` ← ajouté depuis `c8260e1` **verbatim** (11 tests).
3. `print-window.test.ts` (**test propre au canon, absent de `c8260e1`**) ← **conservé et adapté**.

### Arbitrage sur `print-window.test.ts`

Ce garde-fou n'existe que sur la lignée canon. Il échouait contre `c8260e1` sur **une seule
assertion**, un ordre d'appels figé :

```
attendu : ["listen:load", "open", "write", "close", "focus", "print"]
obtenu  : ["open", "write", "listen:load", "close", "focus", "print"]
```

Le contrat réel est « abonnement posé **avant `close()`** », car c'est `close()` — et lui seul —
qui déclenche le `load` du document écrit. La position *avant `open()`* était **incidente**, pas
contractuelle. `c8260e1` satisfait le contrat réel.

Décision : **conserver le fichier** (aucune couverture canon supprimée), corriger l'assertion
d'ordre, et **ajouter un test explicite** de l'invariant (`indexOf("listen:load") < indexOf("close")`),
qui verrouille le contrat sans figer une position arbitraire. Le faux document du test reçoit
également un `readyState` passant à `complete` sur `close()` — plus fidèle au navigateur réel, et
supprime au passage un timer résiduel.

Aucune suppression de test. Aucune baisse de couverture.

---

## 4. Nouveau canon — comportement

`window.open("", "_blank")` sans `noopener`/`noreferrer` (sans quoi la poignée serait `null` par
spécification, et l'impression impossible) ; `opener` coupé immédiatement, **avant toute écriture** ;
garde WebView si `print` n'est pas une fonction ; écriture ; abonnement `load` avant `close()` ;
puis trois voies de déclenchement (`load`, `readyState === "complete"`, repli 400 ms) convergeant
vers **une seule** impression via le drapeau `launched`.

---

## 5. Sécurité — inchangée

`c8260e1` ne touche **aucun** fichier de sécurité. En-têtes du canon vérifiés **en réel** sur le
build web servi (`next start`) :

```
Content-Security-Policy: default-src 'self'; base-uri 'none'; object-src 'none';
  frame-ancestors 'none'; frame-src 'none'; form-action 'self';
  script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self';
  connect-src 'self' https://<supabase> wss://<supabase> https://<billing> wss://<billing>;
  worker-src 'self'; manifest-src 'self'; media-src 'self'; upgrade-insecure-requests
X-Frame-Options: DENY · X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin · Permissions-Policy: 17 capacités refusées
Cross-Origin-Opener-Policy: same-origin-allow-popups
Cross-Origin-Resource-Policy: same-site
```

CSP **non affaiblie**. COOP `same-origin-allow-popups` reste la condition qui rend la poignée
exploitable ; `frame-src 'none'` interdit toujours le repli par `<iframe>`. `window.opener === null`
est vérifié **avant écriture** par test unitaire **et** par recette navigateur réelle.

---

## 6. Recette navigateur (CSP réelle du canon)

Serveur : build web `next start`, en-têtes réelles. WebKit exige HTTPS (voir §9 *note*), servi via
un proxy TLS local ; Chromium testé aussi en HTTP direct.

Sonde : `window.open` enveloppé, `print` neutralisé **avant** appel — aucune boîte d'impression
réelle ouverte, contrat du module intégralement observé.

| Scénario | Chromium desktop | WebKit desktop | iPhone WebKit | Android Chromium |
| --- | --- | --- | --- | --- |
| Fenêtre obtenue, `opener` coupé, **une seule** impression | ✅ | ✅ | ✅ | ✅ |
| Navigateur silencieux (aucun `load`) → repli imprime 1× | ✅ | ✅ | ✅ | ✅ |
| WebView sans `window.print` → PDF/Partager, fenêtre refermée | ✅ | ✅ | ✅ | ✅ |
| Popup bloquée → message actionnable | ✅ | ✅ | ✅ | ✅ |

**16/16.** Contrôles inclus dans ces scénarios : `features` transmis = `undefined` (aucun
`noopener`/`noreferrer`), `opener === null` à l'écriture **et** à l'impression, `writes === 1`,
`prints === 1`, **zéro violation CSP** (`securitypolicyviolation`), zéro erreur console.

Contenu du document imprimé vérifié : titre projet, cotes (`mm`), géométrie (`<svg>`), plan coté,
points de construction, étapes chantier, footer `ELSATIA Tools - Document généré localement`.

---

## 7. Non-régression

- **Suite exports complète** (PDF, SVG, DXF, PNG, chantier/mosaïque, 1:1, partage, adaptateurs
  Atelier) : **127 tests / 12 fichiers verts**. Le correctif ne touche aucun autre format.
- **PWA** : service worker enregistré et **activé**, cache `elsatia-tools-*` peuplé, aucun worker
  `waiting` résiduel, navigation **hors ligne** servie depuis le precache. ✅
- **Responsive** : 11 routes × 4 largeurs (375 / 430 / 768 / 1440), Chromium **44/44** et
  WebKit **44/44** — aucun débordement horizontal, aucune erreur console.

---

## 8. Statut `connect-src` (P1 du canon)

`apps/tools/next.config.ts` construit la CSP **au `next build`**, à partir de
`NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_TOOLS_BILLING_API_URL` lus dans `process.env`.

Vérifié par build réel :

- **avec** env réaliste → `connect-src 'self' https://<supabase> wss://<supabase> https://<billing> wss://<billing>` ✅
- **sans** env → `connect-src 'self'` — **et le build réussit sans le moindre avertissement**.

**Verdict : SAFE FOR PRODUCTION BUILD**, sous condition — Vercel injecte les variables du projet
dans l'environnement de build, donc un projet Production correctement configuré produit la bonne
politique. Le mécanisme est sain.

**Réserve (P1 conservé, non élargi ici) :** la dégradation est **silencieuse**. Une variable
absente, renommée ou non cochée pour l'environnement Production produit un build vert dont la CSP
bloque, à l'exécution, tout appel Supabase (auth, realtime) et l'API d'abonnement. Le contrat de
dégradation est déjà verrouillé au niveau unitaire (`security-headers.test.ts` : `buildConnectSrc()`
sans valeur → `["'self'"]`), mais **rien n'échoue au build**.

*Correctif futur recommandé (hors périmètre de ce lot) :* faire échouer `next build` hors
développement quand `NEXT_PUBLIC_SUPABASE_URL` est absente ou non-http(s) — quelques lignes dans
`next.config.ts`, à couvrir par un test dédié. Aucune variable Vercel n'a été lue, créée ni modifiée.

*Note d'environnement (sans impact production) :* `upgrade-insecure-requests` fait échouer les
sous-ressources en HTTP sur `localhost` **sous WebKit** (Chromium exempte `localhost`). C'est un
artefact de recette locale : la production est servie en HTTPS.

---

## 9. SEO

**Hors canon, et laissé hors canon.** `apps/tools/src/lib/seo.ts`, `apps/tools/scripts/`,
`apps/tools/public/og-tools.png` et les modifications de pages associées restent **non commités**
dans le checkout principal. Aucun de ces fichiers n'a été lu, repris ni intégré dans cette branche.
Aucun WIP d'une autre session n'a été touché.

---

## 10. Périmètre — ce qui n'a pas été touché

Engine B (structure) · Supabase · GP · Colors · site vitrine · Production · variables Vercel ·
en-têtes de sécurité · service worker · autres formats d'export · WIP SEO.

Aucun déploiement. Trois fichiers modifiés, tous dans `apps/tools/src/lib/exports/`.

---

## 11. Gaps restants

**P0 : aucun.**

**P1 :**

1. **`connect-src` — dégradation silencieuse au build** (§8). Le seul gap structurel. Correctif
   documenté ci-dessus, volontairement non intégré à ce lot.
2. **Recette WebKit dépendante d'un banc HTTPS local** (§8, note). Confort d'outillage, sans effet
   sur la production.

**Hors périmètre, connus par ailleurs :** lot ELSATIA-UI-V2 (refonte visuelle avant
commercialisation) ; SEO Tools non commité (§9).

---

## 12. Verdict

Le canon pré-pilote Tools et le correctif impression le mieux validé sont réconciliés en une
branche unique, sans perte : aucun lot du canon retiré, aucun test supprimé, comportement
d'impression de `c8260e1` retenu intégralement et vérifié sur quatre moteurs sous la CSP réelle.

`a54cc4d` et `c8260e1` ne sont plus nécessaires comme références de travail : leur contenu utile
est intégralement porté par `integration/tools-prepilot-canonical-print-v1`, qui devient le
**nouveau canon Tools pré-pilote**.
