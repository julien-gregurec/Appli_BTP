# Audit des dépendances — Lot 2

Audit initial du 28 juillet 2026 : 12 entrées `high`, 0 critique. Les douze
entrées proviennent de deux avis de sécurité et de leur propagation dans l’arbre.

Après les mises à jour compatibles (`next` 16.2.12, `@sentry/nextjs` 10.68.0 et
PostCSS 8.5.24), l'audit final signale 9 entrées `high`, 0 critique. Les trois
alertes de production liées à PostCSS ont disparu. Les neuf alertes restantes
proviennent toutes de la chaîne de développement ESLint/glob et de
`brace-expansion`; elles ne sont pas chargées par le serveur de production.

| Package signalé | Direct | Usage dans Liria | Version initiale | Correction analysée | Risque Liria | Décision |
|---|---:|---|---|---|---|---|
| `postcss` | non | compilation CSS de Next/Tailwind | 8.5.10 (override Next), 8.5.16 | 8.5.24 | Faible en production : entrée CSS contrôlée au build, mais lecture locale possible en CI | Override Next mis à jour |
| `next` | oui | framework web | 16.2.11 | 16.2.12 + PostCSS corrigé | Indirect par PostCSS | Mise à jour patch |
| `@sentry/nextjs` | oui | supervision | 10.66.0 | 10.68.0 | Indirect par Next et glob de build | Mise à jour mineure |
| `brace-expansion` | non | expansion de motifs dans glob/lint | 1.1.16 et 5.0.7 | 1.1.17 / 5.0.8 selon l’ascendant | Faible : motifs internes au dépôt, pas issus d’une requête web | Attendre la résolution compatible des ascendants |
| `minimatch` | non | sélection de fichiers au lint/build | 3.1.5 et 10.2.5 | > 10.0.2 avec `brace-expansion` corrigé | Faible, outil de développement | Ne pas forcer une version majeure transitive |
| `@eslint/config-array` | non | configuration ESLint | 0.21.2 | remontée via ESLint 10 | Pas exécuté en production | Pas de passage majeur pendant le lot de stabilisation |
| `@eslint/eslintrc` | non | configuration ESLint | 3.3.5 | remontée via ESLint 10 | Pas exécuté en production | Idem |
| `eslint` | oui (dev) | lint | 9.39.4 | 10.8.0 proposé par npm | Régression possible des règles/configurations | Mise à niveau majeure différée |
| `eslint-config-next` | oui (dev) | règles Next | 16.2.11 | 16.2.12 patch | Pas exécuté en production | Mise à jour patch |
| `eslint-plugin-import` | non | lint des imports | 2.32.0 | dépend de minimatch | Pas exécuté en production | Attendre une résolution amont compatible |
| `eslint-plugin-jsx-a11y` | non | lint accessibilité | 6.10.2 | dépend de minimatch | Pas exécuté en production | Idem |
| `eslint-plugin-react` | non | lint React | 7.37.5 | dépend de minimatch | Pas exécuté en production | Idem |

Avis concernés :

- `GHSA-6g55-p6wh-862q` et `GHSA-r28c-9q8g-f849` pour PostCSS ;
- `GHSA-mh99-v99m-4gvg` pour `brace-expansion`.

Les versions majeures ou rétrogradations proposées automatiquement par
`npm audit fix --force` sont volontairement refusées. Après les mises à jour
compatibles, les contrôles TypeScript, lint, tests et build doivent tous rester
verts. Les éventuelles alertes restantes sont consignées ici plutôt que masquées.

Le correctif automatique restant proposé par npm impose ESLint 10.8.0 (version
majeure) ou, pour `eslint-config-next`, une rétrogradation incohérente vers
12.0.4. Ces deux propositions sont refusées dans le lot de stabilisation. Une
mise à niveau ESLint 10 devra être évaluée séparément dès que la chaîne Next et
ses plugins publient un ensemble compatible.
