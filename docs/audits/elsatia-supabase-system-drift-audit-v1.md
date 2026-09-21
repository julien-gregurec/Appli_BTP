# ELSATIA — Supabase System Drift Audit V1

Date : 2026-09-02
Branche auditée : `codex/elsatia-acl-reconciliation-v1`
HEAD de départ : `6a814a2bd6949fced340660657c74c6a22bdcffb`
Mode : audit local en lecture seule des catalogues, aucune correction du socle

## 1. Bases comparées

- Fresh : pile Supabase locale reconstruite depuis Git, ledger applicatif à 253 migrations, image PostgreSQL Supabase `17.6.1.143`.
- Restore : dump Production validé restauré dans `elsatia_acl_restore_v1`, migré 210 → 253, image PostgreSQL Supabase `17.6.1.155`.
- Restore PGDATA : `/Volumes/ELSATIA-PRODUCTION-DR/ELSATIA-PRODUCTION-BACKUPS/restore/acl-reconciliation-v1/production-restore/pgdata`.
- Diff ACL applicatif après `20260902000255_acl_reconciliation_v1.sql` : 0.
- Diff résiduel initial du présent audit : 532 lignes.

## 2. Ventilation exacte des 532 lignes

Une ligne Fresh-only et la ligne Restore-only symétrique sont comptées séparément lorsqu'un même droit diffère par son `GRANT OPTION`.

| Schéma | Fresh-only | Restore-only | Total | Type principal | Risque | Action |
|---|---:|---:|---:|---|---|---|
| `public` | 0 | 0 | 0 | — | Aucun | Exiger toujours 0 |
| `auth` | 0 | 0 | 0 | — | Aucun drift structurel | Exiger toujours 0 |
| `storage` | 52 | 16 | 68 | tables/GRANT OPTION managés | Faible | Allowlist versionnée ci-dessous |
| `extensions` | 0 | 19 | 19 | `pg_stat_statements`/dashboard | Faible | Allowlist extension |
| `realtime` | 159 | 9 | 168 | version de schéma/service | Faible | Allowlist versionnée |
| `_realtime` | 34 | 0 | 34 | nouveau schéma/service Fresh | Faible | Allowlist versionnée |
| `graphql` | 4 | 0 | 4 | grants managés Fresh | Faible | Allowlist versionnée |
| `graphql_public` | 4 | 0 | 4 | grants managés Fresh | Faible | Allowlist versionnée |
| `vault` | 0 | 0 | 0 | — | Aucun | Exiger toujours 0 |
| `net` | 78 | 0 | 78 | extension `pg_net` Fresh | Faible pour sécurité, disponibilité DR à documenter | Allowlist conditionnelle |
| `supabase_functions` | 156 | 0 | 156 | schéma Edge Functions Fresh | Faible | Allowlist versionnée |
| memberships (sans schéma) | 1 | 0 | 1 | `postgres` membre de `supabase_functions_admin` | Faible | Allowlist versionnée |
| `pg_catalog` | 0 | 0 | 0 | — | Aucun | Exiger toujours 0 |
| `information_schema` | 0 | 0 | 0 | — | Aucun | Exiger toujours 0 |
| **Total** | **488** | **44** | **532** | | | |

Répartition par type : 48 default privileges, 60 fonctions, 1 membership, 32 ACL de schémas et 391 ACL de relations.

## 3. Rôles système

Les attributs comparés sont identiques entre Fresh et Restore pour `postgres`, `authenticator`, `anon`, `authenticated`, `service_role`, `supabase_admin`, `supabase_auth_admin`, `supabase_storage_admin`, `supabase_realtime_admin`, `dashboard_user` et `elsatia_discount_f4_writer`.

Preuves de non-escalade :

- `anon` et `authenticated` : `BYPASSRLS=false` ;
- aucun membership de `authenticated` ou `service_role` vers les rôles admin Supabase, `dashboard_user` ou le rôle F4 ;
- `dashboard_user` et `supabase_realtime_admin` : `NOLOGIN` ;
- le seul membership divergent est Fresh-only : `postgres` → `supabase_functions_admin`, sans exposition aux rôles API ;
- `service_role` conserve son `BYPASSRLS` managé dans les deux bases, sans dérive entre elles.

## 4. Extensions

Extensions communes, avec versions identiques : `pg_stat_statements 1.11`, `pg_trgm 1.6`, `pgcrypto 1.3`, `pgsodium 3.1.8`, `plpgsql 1.0`, `supabase_vault 0.3.1`, `uuid-ossp 1.1`.

- Fresh-only : `pg_net 0.20.3`. Le dump ne contient aucune entrée `EXTENSION pg_net`; le dépôt ne référence aucune fonction `net.*`. La différence est managée et non exploitable, mais toute future dépendance ELSATIA à `pg_net` devra ajouter un prérequis explicite au runbook de restauration.
- Restore-only : `pgtap 1.3.3`, installé localement pour la validation 870/870. C'est un artefact de test local, absent de la structure Production sauvegardée, sans grant divergent vers les rôles API dans les 532 lignes.
- `pgjwt`, `vector` et extension GraphQL : absentes des deux inventaires d'extensions comparés ; aucun drift.

Le TOC du dump déclare uniquement `pg_stat_statements`, `pgcrypto`, `supabase_vault` et `uuid-ossp` comme extensions.

## 5. Auth

- 0 différence ACL ou policy dans `auth`.
- 23 tables Auth dans les deux bases.
- `anon` et `authenticated` n'ont aucun droit INSERT/UPDATE/DELETE sur `auth.users`.
- Les six utilisateurs, facteurs, sessions et métadonnées du Restore sont des données/runtime Production et ne font pas partie du diff structurel ACL.

Classification : données Auth = hors drift ; structure/ACL Auth = alignée.

## 6. Storage

- Hash des 33 policies Storage identique : `d4800a6d0c9138ffdbbdbd3a4193f217`.
- RLS actif sur `storage.objects` dans les deux bases.
- Les droits DML d'`anon`/`authenticated` sur `storage.objects` sont identiques et restent bornés par les mêmes policies RLS ; ils ne font pas partie du drift résiduel.
- 32 lignes représentent la différence de `GRANT OPTION` sur `storage.buckets` et `storage.objects` pour le seul rôle managé `supabase_storage_admin` : 16 Fresh non grantables contre 16 Restore grantables.
- 36 lignes Fresh-only concernent `storage.iceberg_namespaces` et `storage.iceberg_tables`, absentes du Restore et sans usage ELSATIA.
- Ledger Storage différent : Fresh 61 lignes jusqu'à l'id 60 ; Restore 65 lignes jusqu'à l'id 64. Le Restore porte notamment des migrations managées plus récentes (`object-versioning-core`, corrections search), ce qui confirme une différence de version de service, pas une migration ELSATIA.

Risque du `GRANT OPTION` interne : faible mais non nul en cas de compromission du credential du service Storage. Aucun rôle API n'est membre de `supabase_storage_admin`; ce point reste sous responsabilité de la plateforme Supabase.

## 7. Realtime, Edge Functions, GraphQL et net

- Realtime : ledgers managés différents. Restore atteint au moins `20260709120000`; Fresh s'arrête à `20260706120000` mais possède le nouveau schéma `_realtime` et ses tables partitionnées. Les ACL Restore-only ciblent uniquement `supabase_realtime_admin` et `postgres`.
- `supabase_functions` : absent du Restore ; les 156 lignes Fresh-only appartiennent au bootstrap Edge Functions et à `supabase_functions_admin`.
- GraphQL : 8 grants de schéma Fresh-only ; aucun usage GraphQL trouvé dans l'application.
- `net` : 78 lignes Fresh-only correspondant au schéma de `pg_net`; aucune référence ELSATIA dans les migrations ou le code.

Ces différences peuvent affecter la disponibilité de fonctions Supabase optionnelles lors d'une reconstruction complète, mais elles ne créent pas une surface d'attaque supplémentaire dans le Restore.

## 8. ACL Restore-only et exploitabilité

Les 44 lignes Restore-only sont exhaustivement limitées à :

| Catégorie | Lignes | Rôles | Conclusion |
|---|---:|---|---|
| `extensions.pg_stat_statements*` | 19 | `dashboard_user` | rôle NOLOGIN, aucun membership API ; managé dashboard |
| fonctions/schéma `realtime` | 9 | `supabase_realtime_admin`, `postgres` | rôles internes, aucun membership API |
| `storage.buckets`/`objects` avec grant option | 16 | `supabase_storage_admin` | service interne uniquement, policies identiques |

Restore-only pour `anon` : 0.
Restore-only pour `authenticated` : 0.
Restore-only pour `service_role` : 0.
Restore-only pour `authenticator` : 0.

## 9. Tests hostiles et preuves

Les contrôles de catalogue ont confirmé sur Fresh et Restore :

- aucune écriture Auth par `anon`/`authenticated` ;
- aucun accès SELECT à `vault.secrets` par `anon`/`authenticated` ;
- aucun SET ROLE/membership vers les rôles système ou F4 ;
- aucun BYPASSRLS pour les rôles utilisateur ;
- RLS actif sur Auth et Storage ;
- hashes de policies identiques pour `public` (`838bf88de91ddc269d2b3e5b3935638c`) et `storage` ;
- diff ACL applicatif final : 0 ;
- suite hostile complète Fresh : 870/870 ;
- suite hostile complète Restore : 870/870, couvrant cross-tenant, writes plateforme, self-grant, support spoof, F4, UID admin, multi-app et MFA/AAL2.

Aucun drift système exploitable depuis les rôles API n'a été identifié.

## 10. Allowlist explicite V1

Sont acceptés uniquement lorsque les rôles API n'acquièrent aucun droit Restore-only et que les tests ci-dessus restent verts :

1. `_realtime` : objets/ACL Fresh-only du service Realtime.
2. `realtime` : ACL appartenant exclusivement à `supabase_realtime_admin` ou `postgres`, justifiées par le ledger du service.
3. `supabase_functions` : objets, defaults et membership Fresh-only appartenant au bootstrap Edge Functions.
4. `net` : objets Fresh-only appartenant à `pg_net`, tant qu'ELSATIA ne dépend d'aucune fonction `net.*`.
5. `graphql` et `graphql_public` : grants de schémas Fresh-only du bootstrap Supabase.
6. `storage.iceberg_namespaces` et `storage.iceberg_tables` : ACL Fresh-only de fonctionnalité managée non utilisée.
7. `storage.buckets` et `storage.objects` : différence de grant option exclusivement pour `supabase_storage_admin`, avec policies identiques.
8. `extensions.pg_stat_statements` et `pg_stat_statements_info` : ACL Restore-only exclusivement pour `dashboard_user`.
9. `pgtap` Restore-only : artefact de validation locale, jamais requis en Production.

L'allowlist n'autorise aucun écart dans `public`, `auth`, `vault`, les policies, les rôles/attributs applicatifs, ni aucun droit Restore-only pour `anon`, `authenticated`, `service_role` ou `authenticator`. Tout nouvel objet, rôle, schéma, type de privilège ou changement de sens Fresh/Restore sort automatiquement de l'allowlist et redevient bloquant.

## 11. Nouveau critère DR

### APPLICATION CANONICAL DRIFT

Doit rester exactement égal à 0 pour les objets, ACL, memberships, defaults et policies contrôlés par Git/ELSATIA.

### SUPABASE MANAGED DRIFT

Peut être non nul uniquement si chaque ligne appartient à l'une des neuf catégories fermées ci-dessus, est liée à une version managée observable, n'accorde aucune capacité Restore-only aux rôles API, conserve les policies attendues et passe les sondes hostiles.

Pour la présente photographie :

- drift applicatif bloquant : 0 ;
- drift système exploitable : 0 ;
- drift système managé allowlisté : 532 lignes ;
- écarts de disponibilité à surveiller : `pg_net`, Edge Functions et générations Realtime/Storage, sans dépendance ELSATIA actuellement démontrée.

## 12. Décision

Les 532 lignes sont classifiées A/B/C (socle managé, métadonnées/version d'environnement, extensions/rôles système). Aucun cas D/E/F exploitable ou bloquant pour la frontière de sécurité applicative n'a été trouvé. Cette décision ne remplace pas le backup des objets binaires Storage et n'autorise aucune migration Production.

Les deux PostgreSQL locaux ont été arrêtés proprement après l'audit (`Exited (0)`), sans suppression du Restore chiffré. Aucun commit ni push n'a été effectué.

Verdict : **VALIDÉ pour le critère ACL DR révisé**.
