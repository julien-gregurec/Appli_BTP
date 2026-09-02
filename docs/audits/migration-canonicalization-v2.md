# ELSATIA — Migration Canonicalization V2

Date de validation locale : 1er septembre 2026

HEAD de départ et HEAD courant : `acb6715b6e1c4de0438d2d3b9b13081384deea1b`

Périmètre : local uniquement. Aucun `db push`, `migration repair` distant, changement Auth/Stripe distant, commit, push, merge, rebase ou stash.

## Synthèse exécutable

La proposition canonique contient 252 migrations aux noms et horodatages uniques. Elle passe un replay Fresh, un upgrade simulé depuis le ledger Preview observé (242 versions), un upgrade simulé depuis le ledger Production observé (210 versions), un second passage idempotent et 869/869 tests SQL/RLS. Les sept sentinelles Production sont préservées exactement.

Les trois blocages du lot sont fermés localement :

- migration 237 : version Preview historique exacte restaurée dans la proposition ;
- TARIFS-V2 201 : préflight non destructif avant 201 et réconciliation auditable après toute la chaîne ;
- SQL/RLS : les 18 assertions initiales et l'arrêt de fixture associé sont corrigés sans affaiblir les contrôles AAL2, rôles ou isolation.

Cette validation ne vaut ni déploiement ni autorisation distante. Preview reste NO-GO jusqu'à son lot distant et son HTTP 500 reste un P0 séparé. Production reste NO-GO tant qu'une sauvegarde/restauration vérifiable n'existe pas.

## 1. Migration 237 — analyse exacte

Objets concernés par `20260826000237_platform_aal2_role_integrity_v1.sql` : helpers AAL2 et verrou transactionnel, table et trigger `plateforme_admins`, cycle de vie des administrateurs, RPC support, facturation, tarifs, création d'entreprise et convergence multi-app, préflight d'intégrité, révocations et grants applicatifs. Aucune table, policy ou grant ne diffère fonctionnellement entre les deux versions comparées.

Empreintes :

| Source | SHA-256 |
|---|---|
| fichier Git avant V2 | `b834737a7e51a1d80713db42ade3beaf39ad6a8231e18b4815e4c1233aba12b4` |
| export Preview exact, octets observés sans LF terminal | `a69827462e5038896d0713bb1fd9e119694cb82f309210ffe1f005bf91111421` |
| fichier Preview restauré avec LF terminal normalisé | `dd1fbdb90776c0cf9136ce22fa8c4fd51786c845f71d73afceab8abb6071637e` |

La lignée source est la migration 237 réellement appliquée en Preview, récupérée lors du Remote State Audit V1, confrontée au fichier suivi à `acb6715…`. Le diff brut fait 5 insertions et 41 suppressions. Quarante différences sont des lignes blanches ou commentaires de présentation. La seule différence fonctionnelle est :

```sql
drop function if exists public.plateforme_support_fils();
create or replace function public.plateforme_support_fils()
returns table (... non_lus integer, total integer, ...)
```

La migration 202 avait créé cette fonction avec des colonnes OUT `bigint`. PostgreSQL interdit à `CREATE OR REPLACE FUNCTION` de modifier le type de retour (`42P13`). La version Preview supprime donc explicitement l'ancienne signature, sans `CASCADE`, avant de la recréer. Aucun objet dépendant n'a été trouvé.

Classification du diff :

| Différence | Classe | Impact |
|---|---|---|
| `DROP FUNCTION IF EXISTS plateforme_support_fils()` | fonctionnelle, compatibilité, historique | rend le replay compatible avec la signature de 202 ; aucun relâchement ACL |
| commentaire expliquant `42P13` | historique/documentaire | traçabilité uniquement |
| lignes blanches retirées | cosmétique | aucun |
| tables, policies, grants, autres RPC | identiques fonctionnellement | aucun écart sécurité |

### Stratégie retenue

Option A : restaurer dans Git la version Preview historique exacte. Elle est la version déjà déployée, contient le prérequis de compatibilité manquant dans Git et ne retire aucun durcissement. Aucun changement Git fonctionnel ultérieur propre à ce fichier n'est à réémettre : les écarts restants sont cosmétiques. Les durcissements postérieurs restent append-only dans 238–254. Cette décision a été prise après les trois simulations, pas comme remplacement silencieux.

**MIGRATION 237 : RESOLVED**

## 2. TARIFS-V2 201 — reproduction et cause exacte

La reproduction minimale est couverte par `migration_canonicalization_v2.test.sql`. Le statement qui échoue en premier est l'ajout de :

```sql
alter table public.plans_abonnement
  add constraint plans_abonnement_tarif_public_coherent
  check (... devis_obligatoire ... prix_mensuel_ht ... prix_annuel_ht ...);
```

État attendu par 201 : les lignes actives à devis obligatoire n'ont pas de prix public, les autres lignes satisfont la cohérence prix/catalogue, et les dates historiques restent ordonnées. État Production rejoué : l'ancien plan actif `sur_mesure` porte encore `devis_obligatoire = true` avec des prix non nuls. La migration ajoute la contrainte avant de transformer le catalogue : la contrainte valide immédiatement les données existantes et échoue.

Un second défaut temporel rendait le replay tardif fragile : les anciens plans créés avec `valide_du = current_date` le 1er septembre 2026 sont ensuite clôturés par 201 à `valide_au = '2026-08-15'`, ce qui viole `plans_abonnement_check`. La migration supposait implicitement un passage autour du 16 août 2026. Il ne manque ni table, ni colonne, ni enum, ni fonction ; le défaut est une combinaison d'ordre DDL/DML, d'état de données antérieur et de date d'exécution non figée.

### Correctif retenu

`20260815000200_reconciliation_pre_tarifs_v2.sql` est placé avant 201. Il :

- est un vrai no-op si `plans_abonnement_tarif_public_coherent` existe déjà (Fresh déjà réconcilié ou Preview) ;
- capture dans une table marqueur verrouillée uniquement les valeurs originales des plans cibles actifs affectés ;
- désactive avant la contrainte les lignes incompatibles et retire temporairement la contrainte de dates ;
- ne supprime aucune ligne métier.

`20260901000254_migration_canonicalization_v2.sql` finalise append-only :

- restaure les anciens plans et leurs valeurs d'origine en état inactif avec des dates valides ;
- décale l'entrée en vigueur des plans 201 actifs à la date réelle de replay lorsque nécessaire ;
- écrit cinq entrées d'audit sur Fresh/Production et zéro sur Preview, où le préflight est un no-op ;
- restaure les contraintes et supprime la table marqueur ;
- peut être rejouée sans effet additionnel.

Impact données : aucune suppression, aucune perte, historique ancien conservé inactif, catalogue courant unique et valide. Le correctif est auditable et ne réécrit pas 201.

**TARIFS-V2 201 : RESOLVED**

## 3. Les 18 échecs SQL/RLS initiaux

Les 18 assertions avaient toutes la même valeur obtenue : `Rôle plateforme insuffisant`. Les attentes distinguaient volontairement l'absence de session plateforme (`réservé à la plateforme`) et le rôle insuffisant (`Action réservée…`). La migration 202 avait remplacé le helper différencié par ce message générique. Sévérité : haute pour la régression de contrat sécurité/audit, sans preuve de contournement d'autorisation.

| # | Test / assertion | Objet | Attendu | Cause et migration responsable | Correction |
|---:|---|---|---|---|---|
| 1 | `elsatia_multi_app_convergence_v1` 25 | RPC multi-app | `%réservé à la plateforme%` | helper générique, 202 | helper différencié en 254 |
| 2 | `elsatia_tools_r8` 6 | mutation Tools plateforme | `%réservé à la plateforme%` | idem | idem |
| 3 | `platform_aal2_role_integrity` 22 | mutation admin | `%Action réservée%` | idem | idem |
| 4 | `platform_aal2_role_integrity` 23 | mutation admin | `%Action réservée%` | idem | idem |
| 5 | `platform_aal2_role_integrity` 24 | mutation admin | `%Action réservée%` | idem | idem |
| 6 | `platform_aal2_role_integrity` 25 | mutation admin | `%Action réservée%` | idem | idem |
| 7 | `platform_support_isolation_audit` 57 | RPC support | `%Action réservée%` | idem | idem |
| 8 | `platform_support_isolation_audit` 58 | RPC support | `%Action réservée%` | idem | idem |
| 9 | `platform_support_isolation_audit` 60 | RPC support | `%Action réservée%` | idem | idem |
| 10 | `platform_support_uid_security` 2 | ajout admin | `%réserv%` | idem | idem |
| 11 | `platform_support_uid_security` 6 | rattachement admin | `%réserv%` | idem | idem |
| 12 | `platform_support_uid_security` 9 | activation admin | `%réserv%` | idem | idem |
| 13 | `platform_support_uid_security` 10 | retrait admin | `%réserv%` | idem | idem |
| 14 | `platform_support_uid_security` 11 | entrée support | `%réserv%` | idem | idem |
| 15 | `platform_support_uid_security` 32 | réponse support | `%réserv%` | idem | idem |
| 16 | `platform_write_surface_hardening` 15 | mutation plateforme | `%Action réservée%` | idem | idem |
| 17 | `platform_write_surface_hardening` 16 | mutation plateforme | `%Action réservée%` | idem | idem |
| 18 | `platform_write_surface_hardening` 17 | mutation plateforme | `%Action réservée%` | idem | idem |

Cause structurelle unique des 18 assertions : écrasement historique du contrat d'erreur par 202. Une seconde cause, distincte des 18 assertions, arrêtait ensuite `platform_aal2_role_integrity_v1.test.sql` après le test 25 : `RESET ROLE` ne vidait pas les claims JWT de la fixture et le trigger 204 lisait encore une identité utilisateur. La fixture vide désormais explicitement `request.jwt.claim.sub`, `request.jwt.claim.email` et remet `request.jwt.claims` à `{}` avant la mise à jour directe privilégiée. Cela corrige l'isolation du test sans affaiblir le trigger.

La migration 254 réaffirme aussi deux états finaux rendus incorrects par l'ordre propre à Production : suppression de l'ancienne surcharge `plateforme_appliquer_remise(uuid,text,text)` réintroduite par 202 après 223, et réinstallation de `valider_preuve_pointage` sans branche `anon` après l'application tardive de 206 suivant 219.

## 4. Préflight de signature avant 237

Production 210 possédait `plateforme_entreprises()` avec des colonnes OUT `option_ia_*`, tandis que la 237 Preview exacte retourne les colonnes de remise. `CREATE OR REPLACE` échouait donc également sur `42P13` pendant l'upgrade Production.

`20260825000232_platform_function_signature_preflight_v2.sql` supprime conditionnellement cette fonction seulement si sa signature contient `option_ia_statut`. Il est no-op sur Fresh et Preview, ne fait pas de `CASCADE`, et aucune migration 233–236 ne dépend de l'ancienne signature.

## 5. Proposition d'historique expérimental

La proposition a d'abord été construite dans `/tmp/elsatia-migration-canonicalization-v2.UIFGG0`. Les migrations canoniques n'ont été matérialisées dans le dépôt qu'après réussite des trois scénarios.

Elle réintègre exactement les seize migrations Preview-only : 201–206, 210–215 et Colors 246–249. Elle conserve la conclusion `SAFE_TO_REISSUE` pour R74/R75, déplacées de 246/247 vers 252/253, après revalidation de leurs tests et de la référence applicative.

### Fresh database

`EMPTY DB → 252 migrations → PASS`, sans correctif manuel après coup.

- ledger : 252/252 versions uniques ;
- plans actifs : 5 ; incohérents : 0 ; dates invalides : 0 ;
- audit de réconciliation tarifaire : 5 lignes ; marqueur temporaire absent ;
- SQL/RLS : 869/869 PASS.

### Upgrade Preview simulé

Base reconstruite depuis le ledger Preview observé de 242 versions et son état de schéma documenté, puis application des seules migrations absentes : préflight tarifs 200, préflight signature 232, cinq migrations Git-only, R74/R75 252/253 et réconciliation 254.

- résultat : PASS ; ledger final 252/252 unique ;
- plans actifs : 5 ; incohérents : 0 ; dates invalides : 0 ;
- audit tarifs ajouté : 0, car le préflight détecte l'état déjà migré ;
- table marqueur absente ;
- second `migration up` : `applied: []` ;
- SQL/RLS : 869/869 PASS.

La reconstruction est fidèle aux versions et objets observés, mais reste une simulation locale et non un dump physique du projet Preview. Le HTTP 500 Preview demeure donc un P0 distinct.

### Upgrade Production simulé

Base reconstruite depuis les 210 versions Production observées (liste Appendix C du Remote State Audit V1), puis application de 42 migrations absentes.

- résultat : PASS ; ledger final 252/252 unique ;
- second `migration up` : `applied: []` ;
- plans actifs : 5 ; incohérents : 0 ; dates invalides : 0 ;
- audit tarifs ajouté : 5 ; table marqueur absente ;
- SQL/RLS : 869/869 PASS.

Les sept sentinelles synthétiques liées ont été vérifiées avant/après :

| Sentinelle | Vérification finale |
|---|---|
| utilisateur Auth + profil/membership | présente, identifiants et lien inchangés |
| entreprise | nom, statut, offre `business`, prix `449` inchangés |
| client | présent, rattachement entreprise inchangé |
| chantier | présent, budget `12345.67` inchangé |
| devis | présent, total `1200` inchangé |
| facture | présente, total `1200` inchangé |
| abonnement | présent, offre `business`, prix `449`, statut `active` inchangés |

La simulation a d'abord révélé la signature incompatible de 237, puis trois dérives d'ordre (surcharge remise, mutation sans AAL2 via cette surcharge, branche `anon` de pointage). Elles ont été corrigées append-only ; le replay final propre est celui rapporté ci-dessus.

## 6. Ledger final

| Scénario | Départ | Cible | Unicité | Collision 246/247 | Second passage |
|---|---:|---:|---|---|---|
| Fresh | 0 | 252 | PASS | aucune | sans objet |
| Preview | 242 | 252 | PASS | Colors reste 246/247, R74/R75 252/253 | `applied: []` |
| Production | 210 | 252 | PASS | idem | `applied: []` |

`npm run verify:migrations` confirme : **252 migrations valides, noms et horodatages uniques**. Aucun trou incohérent requis par un fichier présent et aucune dépendance R74/R75 cassée n'a été détecté.

## 7. SQL/RLS et tests négatifs

Après reset Fresh canonique : **45 fichiers, 869 tests, 869/869 PASS**. Le test V2 ajoute neuf assertions, notamment la reproduction isolée du défaut 201, le préflight, les contraintes finales, l'absence de marqueur et le bilan de données.

Les suites finales couvrent explicitement :

- admin plateforme sans AAL2 : refusé ;
- utilisateur normal vers RPC admin : refusé ;
- support sans rôle ou sans session ciblée : refusé ;
- accès cross-tenant A/B : refusé ;
- helpers `service_role`/internes : non exécutables par `anon`/`authenticated` ;
- preuve Stripe falsifiée, croisée, obsolète ou du mauvais environnement : refusée.

## 8. Tests application

| Contrôle | Résultat |
|---|---|
| Vitest | 85 fichiers, 646/646 PASS |
| E2E local | 40/40 scénarios uniques PASS |
| TypeScript | PASS |
| ESLint | PASS, 0 erreur, 3 avertissements `<img>` préexistants |
| build Next.js 16.2.12 | PASS |
| `npm audit --audit-level=high` | 0 vulnérabilité |
| `verify:migrations` | 252 valides et uniques |
| `verify:secrets` | 1223 fichiers suivis, aucun secret reconnu |

Précision E2E : le lancement monolithique partage le compteur anti-abus `/login` (10 tentatives/10 min) entre des scénarios indépendants et provoque ensuite des 307/429 attendus mais parasites. Les six fichiers ont donc été exécutés avec troncature de la seule table éphémère `rate_limits_applicatifs` entre lots. Le test 429 est exécuté dans son lot sur compteur vierge et passe réellement. Les quatre validations IA invalides ont été rejouées avec `FEATURE_AI_ENABLED=true` et une clé synthétique ; elles s'arrêtent en 400/413 avant tout appel fournisseur. Aucune requête fournisseur réelle n'a été faite.

Un premier `test:db` après E2E a logiquement trouvé trois libellés de fixture (`RECETTE_A_ENTREPRISE`) au lieu du nom canonique. Après `db:reset`, le replay des 252 migrations et les 869 assertions passent. Ce résultat intermédiaire n'est pas un défaut de migration.

## 9. Risques et limites

- Les historiques Preview/Production sont reconstruits depuis les ledgers et objets observés, pas depuis une restauration physique distante.
- Aucun plan ne doit être appliqué à Production sans sauvegarde et test de restauration vérifiables.
- Le P0 HTTP 500 Preview n'est pas traité ici ; aucune causalité directe avec l'histoire des migrations n'a été prouvée localement.
- Les migrations exactes restaurées doivent faire l'objet d'un checkpoint Git séparé et audité ; elles sont actuellement non indexées.
- Les changements non liés déjà présents dans le worktree ne font pas partie de cette proposition.
- Les cinq entrées d'audit Production simulées sont attendues ; leur contenu devra être relu dans le runbook distant avant autorisation.

## 10. Fichiers proposés pour un futur staging séparé

Migrations :

- modification documentée de `supabase/migrations/20260826000237_platform_aal2_role_integrity_v1.sql` ;
- suppression des anciennes positions R74/R75 : `20260828000246_residual_acl_hardening_r74.sql`, `20260828000247_support_message_author_guard_r75.sql` ;
- ajouts exacts Preview : 201–206, 210–215 et Colors 246–249 ;
- ajouts V2 : `20260815000200_reconciliation_pre_tarifs_v2.sql`, `20260825000232_platform_function_signature_preflight_v2.sql`, `20260901000254_migration_canonicalization_v2.sql` ;
- ajouts Git-only consolidés : 250/251 ;
- réémissions R74/R75 : 252/253.

Tests et documentation :

- `supabase/tests/migration_canonicalization_v2.test.sql` ;
- `supabase/tests/platform_aal2_role_integrity_v1.test.sql` ;
- `src/lib/support-author-guard.test.ts` (référence 247 → 253) ;
- ce rapport `docs/audits/migration-canonicalization-v2.md`.

À exclure : `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, les fichiers E2E, `tsconfig.json`, les trois rapports antérieurs non suivis et tout `tools/`, sauf audit séparé démontrant leur appartenance à un futur lot.

## 11. Contrôles Git

Au moment de la rédaction : aucun fichier indexé, aucun commit et aucun push. `tools/` et les changements antérieurs sont conservés sans suppression.

Contrôles finaux :

- `git diff --check` : PASS, aucune sortie ;
- `git diff --cached --name-only` : vide, aucun staging ;
- HEAD inchangé : `acb6715b6e1c4de0438d2d3b9b13081384deea1b`.

`git status --short` distingue les changements antérieurs conservés, les fichiers V2 proposés et `tools/` non suivi. La sortie exacte est jointe au compte rendu final ; aucune suppression ou incorporation implicite des éléments hors périmètre n'est autorisée.

## 12. Verdicts

```text
MIGRATION 237 : RESOLVED
TARIFS-V2 201 : RESOLVED
SQL/RLS CANONICAL : GO
CANONICAL HISTORY : GO
PREVIEW MIGRATION PLAN : READY
PRODUCTION MIGRATION PLAN : READY

PREVIEW : NO-GO
PRODUCTION : NO-GO
```

Le NO-GO Preview couvre le lot distant séparé et le P0 HTTP 500. Le NO-GO Production couvre notamment l'absence de sauvegarde/restauration vérifiable. **AUCUNE MUTATION DISTANTE. AUCUN COMMIT AUTOMATIQUE.**
