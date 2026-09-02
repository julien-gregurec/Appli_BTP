# ELSATIA — Root QA Closure V1

## Séparation des applications

Le dépôt contient deux applications TypeScript autonomes : Gestion Pro à la racine et ELSATIA Tools sous `apps/tools`. Tools possède son propre `package.json`, son lockfile, ses dépendances Capacitor, ses alias TypeScript et ses scripts de validation. Le glob historique `**/*.ts(x)` du `tsconfig.json` racine analysait Tools avec les alias et les dépendances de Gestion Pro, ce qui provoquait notamment l’erreur `TS2307` sur `@capacitor/cli`.

Le `tsconfig` racine cible désormais explicitement Gestion Pro, ses packages partagés et ses tests. Les scripts racine `typecheck`, `lint`, `test` et `build` enchaînent ensuite les commandes correspondantes de Tools. Tools n’est donc pas soustrait à la QA : chaque application est vérifiée avec sa configuration canonique.

## Archive Naming Studio

`docs/archive/naming-studio-recovery` est une archive documentaire partielle, non exécutable, non distribuée et déclarée non reproductible dans son propre README. ESLint ignore uniquement ce chemin. Aucune règle globale n’est désactivée et aucun fichier historique n’est modifié.

## Dépendances de sécurité

- `browserslist` était résolu en `4.28.5` par des dépendances transitives de Babel, webpack et Sentry. Les versions jusqu’à `4.28.6` sont affectées par les avis `GHSA-c83g-rgw3-j3cx` et `GHSA-73wf-gq98-2v4g`; le correctif est disponible en `4.28.7`.
- `fast-uri` était résolu en `3.1.5` via `ajv`, `schema-utils`, webpack et Sentry. Les avis signalés par npm affectent les versions `3.0.0` à `3.1.5`; le correctif compatible de la branche 3 est `3.1.6`.

Ces deux paquets sont transitifs. Des overrides exacts imposent uniquement les versions patchées, sans mise à niveau majeure ni `npm audit fix --force`. Leur chemin concerne principalement les outils de compilation et de validation de schémas; aucune utilisation applicative directe n’a été trouvée.

## Portée

Ce lot ne modifie ni le commit MFA `b4fe13035eea7800cdbb6cd42e21ac9f5aaa0eac`, ni Production, Supabase, Vercel, Stripe, Storage DR, ACL ou Colors.

## Validation finale

Branche QA seule : 646 tests Gestion Pro et 107 tests Tools passent. Le typecheck, le lint et le build des deux applications passent. L’inventaire contient 252 migrations uniques, la recherche de secrets est vide, `npm audit` ne rapporte aucune vulnérabilité et `git diff --check` passe. Le lint conserve trois avertissements historiques `@next/next/no-img-element`, sans erreur.

Intégration locale du commit MFA avec les corrections QA : 39/39 tests MFA ciblés, 673/673 tests Gestion Pro et 107/107 tests Tools. Le typecheck, le lint et le double build passent. Aucun merge de release et aucune opération distante n’ont été effectués.
