# ELSATIA Gestion Pro — Security Reconciliation V1

Date : 1er septembre 2026
Branche : `codex/elsatia-colors-canonical-integration-v1`
HEAD initial et actuel : `d65c32062b816f0b3db09120712d11d8347ec239`
Déploiement distant : aucun
Commit : aucun

## Verdict

**SECURITY RECONCILIATION LOCAL : GO**

**PREVIEW : NO-GO tant que le ledger distant n'est pas audité**

**PRODUCTION : NO-GO tant que le ledger distant n'est pas audité**

Les 13 migrations de sécurité ont été réintégrées sans merge, rebase ou
renumérotation. Une base fraîche et une base représentant le HEAD initial ont
toutes deux atteint le même état final. La réconciliation a découvert et fermé
deux nouvelles mutations plateforme Tools créées après la lignée de sécurité.

## Préflight

Le worktree initial contenait exactement neuf fichiers modifiés par l'audit
pré-commercialisation précédent :

1. `eslint.config.mjs` ;
2. `next.config.ts` ;
3. `scripts/e2e/prepare-local-recipe.sql` ;
4. `src/lib/tools-monetization.test.ts` ;
5. `tests/e2e/auth-session.spec.ts` ;
6. `tests/e2e/helpers.ts` ;
7. `tests/e2e/roles-and-direct-access.spec.ts` ;
8. `tests/e2e/security.spec.ts` ;
9. `tsconfig.json`.

Étaient également non suivis le rapport
`docs/audits/pre-commercialisation-finale-v1.md` et le fichier historique
`tools/naming-studio/.env.example`. Ce dernier n'a pas été modifié.

## Matrice des migrations sources

| Migration | Commit source | Objet et dépendance | Équivalent initial | Déploiement prouvé |
|---|---|---|---|---|
| `20260826000236_platform_support_uid_security_v1.sql` | `082e8e90129a16aa25d9d37ecc3f2bfc75022f1c` | identité admin UID, session support ; après `00235` | PARTIEL | NON PROUVÉ |
| `20260826000237_platform_aal2_role_integrity_v1.sql` | `d5f4541b2052e4c837f6b90180d02ec0418ce8a5` | garde AAL2, rôles et transitions admin ; après `00236` | NON | NON PROUVÉ |
| `20260826000238_platform_write_surface_hardening_v1.sql` | `2e7849ca3e40b370a45f610137bf89d19c1d2155` | ACL d'écriture, rôles + AAL2 ; après `00237` | NON | NON PROUVÉ |
| `20260826000239_platform_support_isolation_audit_v1.sql` | contenu `9690bf4be2cea208c2469eeb31d948a1c4f75ca4`, nom final `7bb91dc7fcb03f0205d060b7bb5afbf0d235de11` | support isolé et mutations auditées ; après `00236–238` | NON | NON PROUVÉ |
| `20260826000240_platform_stripe_discount_consistency_v1.sql` | `b2c4d7413ceb9741c95cb869245b16f263aeaec9` | saga de remise et historique append-only ; après `00239` | NON | NON PROUVÉ |
| `20260826000241_platform_stripe_proof_webhook_coordination_v1.sql` | `53593047195b68fc757f49e47fda5e2616b4e02a` | verrou serveur, preuve Stripe et webhook ; après `00240` | NON | NON PROUVÉ |
| `20260826000242_revoke_legacy_discount_rpcs_v1.sql` | `212609d7517489b69f7ed46d46e3537a87d993be` | révocation des RPC historiques ; après `00240–241` | NON | NON PROUVÉ |
| `20260827000236_plateforme_lire_entreprise_membres_v1.sql` | `719413a8a7ac241c65995769c1e9e1b80f323cbb` | lecture membres bornée pour le multi-app ; après le socle UID/AAL2 | NON | NON PROUVÉ |
| `20260827000243_discount_column_guard_r71.sql` | `f0419be11d27a1a7b9fccdb7d2dd60b23f9b5c06` | garde colonnes remise et finalisation F4 ; après `00240–242` | NON | NON PROUVÉ |
| `20260828000244_stripe_state_attestation_r72.sql` | `07ddcaf9ada684ef0e7f84921158c9e38f3a2870` | attestation Ed25519, environnement et anti-rejeu ; après `00243` | NON | NON PROUVÉ |
| `20260828000245_stripe_discount_observation_r73.sql` | `7772a94cb1d6a3dceca2a71d65b0aa8e47dfb349` | observation Stripe non destructive ; après `00244` | NON | NON PROUVÉ |
| `20260828000246_residual_acl_hardening_r74.sql` | `c91d0b7107e72bac4353a16531fb96114017a2c4` | fermeture ACL résiduelles et lecture support bornée ; après `00239–245` | NON | NON PROUVÉ |
| `20260828000247_support_message_author_guard_r75.sql` | `3d539aacc2935cf8fa82d6b70aa7dea92b899c3e` | auteur support imposé par PostgreSQL ; après `00246` | NON | NON PROUVÉ |

Les 13 fichiers locaux sont bit à bit identiques aux versions finales de la
branche source ; leurs SHA-256 ont été comparés pendant l'extraction.

## Collision et identité historique

Il n'existe aucune collision de timestamp complet dans la série finale. La
branche source a temporairement attribué `20260826000238` à l'isolation support,
puis l'a renommée `20260826000239` car le numéro `00238` final appartient au
durcissement des écritures. Les migrations Tools réutilisent les suffixes
`236–239` les 30 et 31 août, mais leurs timestamps complets sont différents.

Le risque distant reste réel : si un environnement a appliqué la version
transitoire `20260826000238_platform_support_isolation_audit_v1.sql`, son ledger
peut afficher `20260826000238` tout en contenant un schéma différent. Aucune
preuve distante ne permet de l'exclure dans ce lot. Aucun fichier historique n'a
donc été renommé ou déclaré déployé par supposition.

## Extraction ciblée

Soixante-seize fichiers ont été extraits depuis le delta de sécurité à partir du
socle commun `d770053b`, sans merger la branche. Ils comprennent :

- les 13 migrations et 12 nouveaux fichiers pgTAP associés ;
- les actions plateforme, support, remises et multi-app ;
- le cloisonnement des webhooks Stripe par environnement ;
- la saga de remise, le gateway serveur et les attestations Stripe ;
- les pages d'administration multi-app et le switcher applicatif ;
- les tests Vitest négatifs correspondants ;
- les runbooks et contrats d'architecture sécurité.

`.env.local.example` a été réconcilié en ajoutant uniquement
`ELSATIA_LOCAL_DEMO=false` tout en conservant les variables Tools R9/R10.
`tsconfig.json` conserve les exclusions du précédent audit et ajoute l'alias du
package partagé `@elsatia/application-access`.

## Migration de réconciliation nouvelle

`20260901000240_security_reconciliation_tools_entitlements_aal2_v1.sql` ferme
deux RPC postérieures à R7.5 :

- `plateforme_attribuer_entitlement_utilisateur` ;
- `plateforme_revoquer_entitlement_utilisateur`.

La migration R8 historique n'est pas modifiée. Ses deux implémentations sont
renommées en helpers internes, révoquées pour `public`, `anon`, `authenticated`
et `service_role`, puis appelées par des wrappers canoniques qui exigent dans
cet ordre : rôle `total|facturation`, session `aal2`, logique métier et audit R8.

Le test global avait détecté ces deux RPC avec le résultat `2` au lieu de `0`.
Après correction, l'inventaire global revient à zéro. Le test Tools vérifie
explicitement que l'attribution et la révocation échouent en AAL1 et réussissent
en AAL2.

## Base fraîche et upgrade

### Fresh

`supabase db reset` a reconstruit une base vide avec les **231 migrations** dans
l'ordre canonique : PASS. Aucun patch SQL post-migration n'a été utilisé.

### Upgrade

Un répertoire temporaire a été construit par `git archive HEAD supabase`, donc
avec les **217 migrations du HEAD initial uniquement**. Après reset local depuis
cet état, la commande locale :

```text
supabase migration up --local --include-all
```

a appliqué les 13 migrations historiques puis la migration de réconciliation,
sans réappliquer R8/R9/R10 : PASS. Les 860 assertions ont ensuite repassé.

## Tests négatifs

Les tests pgTAP et Vitest couvrent notamment :

- utilisateur normal appelant une RPC plateforme : refusé ;
- admin plateforme AAL1 : mutations protégées refusées ;
- rôles lecture/support hors périmètre : mutation refusée ;
- métadonnées/email/entreprise falsifiés : refusés ;
- RPC de remise réservée au writer serveur : client et `service_role` générique refusés ;
- preuve Stripe absente, falsifiée ou liée à une autre saga : refusée ;
- preuve expirée ou rejouée : refusée ;
- mauvais environnement Stripe : refusé ;
- anciennes RPC de remise : non exécutables ;
- contenu support cross-tenant et auteur falsifié : refusés ;
- écriture directe sur les tables plateforme : révoquée ;
- historique des remises : append-only.

## Résultats exacts

| Contrôle | Résultat |
|---|---|
| Base fraîche | PASS, 231 migrations |
| Upgrade depuis HEAD initial | PASS, 14 migrations ajoutées avec `--include-all` |
| SQL/RLS après fresh | PASS, 44 fichiers, 860/860 assertions |
| SQL/RLS après upgrade | PASS, 44 fichiers, 860/860 assertions |
| Vitest | PASS, 85 fichiers, 646/646 tests |
| E2E local | PASS, 40/40 scénarios cumulés |
| TypeScript | PASS |
| ESLint | PASS, 0 erreur, 3 avertissements `<img>` préexistants |
| Build Next.js | PASS, 36 pages statiques |
| Migrations statiques | PASS, 231 noms/timestamps uniques |
| Secrets suivis | PASS, 1 169 fichiers, aucun secret reconnu |
| `npm audit --audit-level=high` | PASS, 0 vulnérabilité |
| `git diff --check` | PASS |

La première invocation Playwright sans privilèges a été bloquée par le sandbox
macOS (`EPERM`) et une invocation a omis les variables E2E Supabase. Les mêmes
tests ont été relancés correctement contre `localhost` et Supabase local : tous
les scénarios concernés passent. Ces erreurs d'orchestration ne sont pas
comptées comme des échecs applicatifs.

## Procédure distante ultérieure

À exécuter dans un lot séparé avec autorisation explicite, d'abord en Preview :

1. travailler depuis une copie propre et identifier explicitement le project ref ;
2. confirmer le SHA déployé et réaliser un backup vérifié ;
3. exécuter `supabase migration list --linked` en lecture seule ;
4. exporter le ledger `supabase_migrations.schema_migrations` sans donnée métier ;
5. comparer les 14 versions attendues et rechercher spécialement `20260826000238` ;
6. si `00238` existe, vérifier les objets/fonctions réellement installés pour
   distinguer le durcissement d'écriture de la migration support transitoire ;
7. classer toute divergence `BLOQUANT DISTANT`, sans `repair` ni `db push` ;
8. préparer backup, dry-run, ordre `--include-all`, rollback et recette Preview ;
9. seulement après GO Preview, répéter l'audit en Production sans appliquer ;
10. demander une autorisation séparée avant toute migration distante.

Le lien Supabase local du dépôt et `.vercel/project.json` sont historiques ; ils
ne doivent pas être utilisés pour cette procédure sans reliaison explicite.

## Risques résiduels

- ledger et contenu de schéma Preview/Production inconnus ;
- migration support transitoire `00238` potentiellement appliquée quelque part ;
- disponibilité de `pgsodium` et clés d'attestation à confirmer sur chaque distant ;
- comptes Auth, MFA et AAL2 réels de `julien@elsatia.fr` toujours non vérifiés ;
- variables Stripe et writer F4 distants non vérifiés ;
- aucune recette avec un vrai facteur MFA n'a été effectuée dans ce lot local.

## Git

Aucun fichier n'est indexé. Aucun commit, push, merge, rebase, stash, déploiement,
`db push`, modification distante ou activation Stripe Live n'a été effectué.

Commit proposé après validation explicite :

```text
fix(security): reconcile platform MFA ACL and Stripe migrations
```
