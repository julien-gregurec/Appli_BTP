# ELSATIA ACL Reconciliation V1

Date : 2026-09-02
Branche : `codex/elsatia-acl-reconciliation-v1`
HEAD de départ : `6a814a2bd6949fced340660657c74c6a22bdcffb`
Verdict ACL local : **GO — prêt pour checkpoint séparé**

## Périmètre exécuté

- Fresh : reset complet de la pile Supabase locale, 253 migrations jusqu'à `20260902000255`.
- Restore : nouvelle restauration du dump Production validé dans `elsatia_acl_restore_v1`, puis 210 → 253.
- Restore PGDATA : `/Volumes/ELSATIA-PRODUCTION-DR/ELSATIA-PRODUCTION-BACKUPS/restore/acl-reconciliation-v1/production-restore/pgdata`.
- Dump : 2 319 892 octets, SHA-256 `271c25e434c26c095136775de692b7c65a597c7ebea1aea57f10ef256885d84b`.
- Sentinelles Restore avant migration : Auth 6, Storage 1, migrations 210.
- Sentinelles Restore après migration : Auth 6, Storage 1, migrations 253.
- Aucun accès ni aucune mutation Production, Preview, Vercel ou Stripe.

## Diagnostic ACL

Le diff initial confirme la dérive historique : 840 privilèges de relations applicatives excédentaires selon la mesure historique. L'inventaire exhaustif utilisé ici trouve 854 ACL `public` supplémentaires pour les rôles API en incluant 14 droits de séquences. Leur origine est la combinaison suivante :

- grants historiques Production persistés dans le dump ;
- default privileges historiques plus larges (`postgres`, schéma `public`) ;
- matérialisation de ces defaults dans les ACL des objets restaurés ;
- absence de révocation symétrique dans les anciennes migrations.

Ce n'est ni un héritage des rôles applicatifs ni une divergence des policies `public` : les policies applicatives étaient identiques avant correction. Le seul écart de membership final observé concerne le socle Supabase (`postgres` → `supabase_functions_admin`), pas un rôle ELSATIA.

Les 177 écritures `authenticated` sont exactement :

- DELETE : 71 ;
- INSERT : 51 ;
- UPDATE : 55.

La liste objet par objet est conservée dans `reports/authenticated-write-extras-177.tsv` sur le volume DR chiffré.

## Correctif append-only

Migration créée : `20260902000255_acl_reconciliation_v1.sql`.

- 1 220 révocations objet par objet issues du diff Fresh canonique ;
- 14 révocations de default privileges historiques ;
- aucune migration historique modifiée ;
- aucune policy/RLS élargie ;
- no-op fonctionnel sur Fresh ;
- idempotence ledger : Fresh à jour, Restore `missing=0` au second passage.

Après application, le diff de la surface applicative `public` est nul pour les tables, colonnes, fonctions et default privileges des rôles `anon`, `authenticated`, `service_role`, `authenticator` et `elsatia_*`. Il reste 0 écriture `authenticated` excédentaire.

## Drift système résiduel, classifié ensuite

Au moment du test ACL initial, le diff exhaustif global conservait 532 lignes dans les schémas système Supabase : `_realtime`, `extensions`, `net`, `realtime`, `storage`, `supabase_functions`, ainsi que leurs default privileges et un membership interne. Ces écarts provenaient des générations différentes du socle Supabase entre le dump historique et la pile locale actuelle. Ils n'ont pas été modifiés à l'aveugle.

Répartition : DEFAULT 48, FUNCTION 60, MEMBERSHIP 1, SCHEMA 32, TABLE 391. L'audit séparé `elsatia-supabase-system-drift-audit-v1.md` a ensuite classifié ces 532 lignes : 488 Fresh-only, 44 Restore-only, drift applicatif 0, drift système exploitable 0. L'allowlist fermée et argumentée de cet audit remplace l'ancien critère artificiel de diff binaire système égal à zéro ; tout nouvel écart sort automatiquement de l'allowlist.

## Fixture et tests de sécurité

La fixture `platform_aal2_role_integrity_v1.test.sql` ne suppose plus qu'un seul admin total global. Elle vérifie maintenant la révocation de la cible synthétique et la conservation du total synthétique de la fixture, indépendamment des admins réels restaurés.

- pgTAP Fresh : 45 fichiers, 870/870 PASS ;
- pgTAP Restore : 45 fichiers, 870/870 PASS ;
- R7.1–R7.5, multi-app, MFA/AAL2, F4, support, cross-tenant : PASS via la suite complète ;
- Vitest : 85 fichiers, 646/646 PASS ;
- verify:migrations : PASS, 253 uniques ;
- verify:secrets : PASS, 1 246 fichiers suivis, aucun secret reconnu ;
- git diff --check : PASS.

## Validations ultérieures hors ACL

Au moment du test ACL initial, la QA racine restait bloquée par le périmètre TypeScript/ESLint de Tools et de l'archive Naming Studio, ainsi que par deux vulnérabilités hautes préexistantes (`browserslist`, `fast-uri`). Ces points n'appartenaient pas au correctif ACL.

Ils ont été fermés ensuite dans le lot séparé `codex/elsatia-root-qa-closure-v1`, commit `01720b66d7fb2b4505e37f8096dc73d230d3bc50`, sans absorption dans le présent lot. Le parcours MFA/AAL2 applicatif a également été validé séparément dans `codex/elsatia-mfa-aal2-v1`, commit `b4fe13035eea7800cdbb6cd42e21ac9f5aaa0eac`. Le test SQL du présent lot reste limité à l'intégrité ACL/AAL2 et n'intègre aucun code MFA applicatif.

## Backup role, DR et arrêt

`elsatia_backup` n'a pas été touché. Son état Production validé avant ce lot reste NOLOGIN, password supprimé, droits révoqués, zéro session.

Le Restore utile est conservé dans le sparsebundle chiffré (PGDATA ~219 Mio). `elsatia-acl-restore-v1` s'est arrêté proprement avec code 0. Le conteneur Fresh Supabase a résisté à `pg_ctl` via son superviseur et a finalement été arrêté par Docker avec code 137 malgré un délai de grâce de 60 secondes : anomalie d'arrêt à conserver au verdict.

## Fichiers du lot et commit

- `supabase/migrations/20260902000255_acl_reconciliation_v1.sql`
- `supabase/tests/platform_aal2_role_integrity_v1.test.sql`
- `docs/audits/elsatia-acl-reconciliation-v1.md`
- `docs/audits/elsatia-supabase-system-drift-audit-v1.md`

Le commit et le push de checkpoint sont réalisés séparément après revalidation de ces quatre fichiers uniquement.

## Verdict

La dérive ACL applicative qui provoquait 867/869 est corrigée et les deux bases passent 870/870. Les 532 écarts du socle Supabase sont classifiés, non exploitables et couverts par une allowlist fermée ; la QA racine et le MFA ont été validés dans leurs lots séparés. L'arrêt forcé historique du conteneur Fresh reste documenté comme anomalie opérationnelle sans incidence sur les résultats SQL ni sur le checkpoint ACL.

Décision : **ACL 255 locale GO — checkpoint séparé autorisé**. Cette décision n'autorise aucune migration ni mutation Production.
