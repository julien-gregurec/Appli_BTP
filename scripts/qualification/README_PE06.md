# PE-06 — sonde de détection de tracé (canvas signature)

Pourquoi ce script existe : le `FAIL` PE-06 de
`docs/qualification/ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3.md` était attribué au fait
que le `PointerEvent` synthétique dispatché par Playwright ne faisait pas passer
`vide.current` à `false` dans `src/components/SignatureEmploye.tsx`, de sorte que
`enregistrer()` s'arrêtait côté client avant d'appeler la Server Action. Cette
hypothèse n'avait jamais été vérifiée par exécution.

Ce script la vérifie sans avoir besoin de la pile complète (pas de Postgres, pas de
GoTrue, pas de `next dev`) : il rejoue la **logique de détection de tracé du
composant** (mêmes handlers React `onPointerDown/Move/Up`, même ref `vide`, même
garde dans `enregistrer()`, React 19) dans un vrai Chromium, et compte les requêtes
réseau réellement émises.

Trois scénarios :

| # | Geste | Attendu |
|---|-------|---------|
| A | `PointerEvent` synthétiques — exactement le geste du test V3 | tracé détecté, 1 requête |
| B | `page.mouse` — geste utilisateur réel | tracé détecté, 1 requête |
| C | aucun tracé (témoin négatif) | 0 requête + message « Dessinez la signature avant d'enregistrer. » |

## Exécution

```bash
mkdir -p /tmp/pe06 && cd /tmp/pe06
npm init -y && npm i react@19 react-dom@19 esbuild playwright
cp <repo>/scripts/qualification/pe06_signature_canvas_probe.jsx app.jsx
cp <repo>/scripts/qualification/pe06_signature_canvas_probe.mjs run.mjs
./node_modules/.bin/esbuild app.jsx --bundle --outfile=bundle.js --loader:.jsx=jsx --define:process.env.NODE_ENV='"production"'
printf '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script>' > index.html
node run.mjs
```

`run.mjs` pointe sur le Chromium préinstallé de l'environnement
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) ; adapter `executablePath`
ailleurs.

## Résultat obtenu (2026-09-23)

Scénarios A et B : `pointerdown` + `pointermove`(s) + `pointerup` reçus par les
handlers React, 1 requête émise, message « Signature enregistrée. ». Scénario C :
0 requête, message de garde. **L'hypothèse de la V3 est donc réfutée** : le
`PointerEvent` synthétique déclenche bien les handlers et ne bloque pas
l'enregistrement. Voir `docs/qualification/ELSATIA_PILOT_QUICK_WINS_CLOSURE_V1.md`.
