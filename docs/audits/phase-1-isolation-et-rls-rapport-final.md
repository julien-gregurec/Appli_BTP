# Phase 1 — Rapport final isolation multi-entreprises et RLS

Date de clôture locale : 29 juillet 2026
Branche : `release/commercialisation-v1`
Périmètre : dépôt local et Supabase local uniquement. La production n’a été ni lue, ni modifiée.

## 1. État Git de départ

- Branche confirmée : `release/commercialisation-v1`.
- Commit de départ sain : `d59d4c6e5a41d183421ad386294ac60f6d27dc9a`.
- Aucun fichier suivi modifié au démarrage.
- Dix-sept fichiers ou ensembles de médias/guides non suivis existaient déjà. Ils ont été conservés et exclus de tous les commits de cette phase.

## 2. Surface auditée

| Ressource | Résultat |
|---|---:|
| Tables `public` | 143 |
| Tables avec RLS après correction | 143 / 143 |
| Policies `public` | 426 |
| Fonctions/RPC `public` | 260 |
| Fonctions `SECURITY DEFINER` | 228 |
| Fonctions `SECURITY DEFINER` avec `search_path` explicite | 228 / 228 |
| Fonctions métier `SECURITY DEFINER` exécutables par `anon` | 0 |
| Événements de triggers recensés | 151 |
| Policies Storage | 29 |
| Buckets Storage | 12 |
| Routes API | 35 |
| Modules Server Actions | 50 |
| Pages avec identifiant dans l’URL | 36 |
| Ressources répertoriées dans l’inventaire | 1 142 |

Les inventaires exhaustifs sont disponibles dans :

- `docs/securite/inventaire-multitenant-v1.md` ;
- `docs/securite/audit-tables-rls-v1.md` ;
- `docs/securite/audit-security-definer-v1.md`.

## 3. Tables sans RLS trouvées

Une table sans RLS a été trouvée à l’état initial : `public.compteurs_reference`.

Cette table technique n’est utilisée que par des fonctions internes. La RLS est désormais active sans policy applicative ; elle reste donc inaccessible directement aux rôles exposés et utilisable par les fonctions internes autorisées.

État final : zéro table `public` sans RLS.

## 4. Policies et privilèges corrigés

Les défauts suivants ont été démontrés par les tests avant correction :

1. des politiques existaient sur `clients` et `chantiers`, mais les privilèges SQL requis par `authenticated` manquaient ; PostgreSQL rejetait la requête avant l’évaluation RLS ;
2. le même défaut concernait des opérations légitimes sur `devis`, `factures`, `articles_stock`, `commandes_fournisseurs` et `mouvements_stock` ;
3. certaines fonctions appelées depuis les policies n’étaient plus exécutables par `authenticated` après un durcissement antérieur ;
4. les policies Storage de la paie consultaient directement une table d’appartenance sensible et pouvaient faire échouer l’évaluation de requêtes concernant d’autres buckets ;
5. la policy de lecture de `journal_ia` autorisait l’administrateur plateforme à voir les métadonnées IA des entreprises par défaut ;
6. `TRUNCATE`, `TRIGGER` et `REFERENCES`, qui ne sont pas protégés par la RLS comme les opérations ligne à ligne, devaient être explicitement révoqués pour `anon` et `authenticated`.

Les migrations 185 à 190 corrigent ces défauts sans modifier les migrations historiques et sans ouvrir d’accès à `anon`.

## 5. Fonctions `SECURITY DEFINER`

Les 228 fonctions ont été inventoriées avec :

- signature et paramètres ;
- `search_path` ;
- privilèges `EXECUTE` pour `anon` et `authenticated` ;
- signaux statiques de contrôle d’authentification, tenant et rôle ;
- paramètres d’identité manipulables ;
- accès potentiel à des données sensibles ;
- présence d’une journalisation détectable.

Corrections appliquées :

- `entreprise_sans_membres(uuid)` fixe maintenant explicitement `search_path = public` ;
- `peut_voir_document_chantier(uuid)` n’est plus directement exécutable par `public` ou `anon` ;
- `plateforme_creer_version_tarif(...)` est réservée à `authenticated` et conserve son contrôle d’administrateur plateforme ;
- sept fonctions trigger ne sont plus exposées comme RPC anonymes ;
- les trois fonctions nécessaires à l’évaluation RLS sont explicitement accordées à `authenticated` et refusées à `public`/`anon`.

État final : aucune fonction `SECURITY DEFINER` sans `search_path` explicite et aucune fonction métier de cette catégorie directement exécutable par `anon`.

## 6. Route serveur corrigée

La route `GET /api/exports/comptabilite` filtrait déjà les lignes par entreprise, mais ne vérifiait pas le droit métier d’export. Elle pouvait donc exposer des données financières de l’entreprise à tout membre authentifié capable d’appeler directement l’URL.

La route exige désormais `acces_exports` côté serveur. Le contrôle est centralisé dans `peutExporterComptabilite` et couvert par deux tests unitaires.

Les usages de la clé service-role dans les routes Stripe, rapprochement bancaire, signatures, paie, tâches planifiées et notifications ont été recherchés et revus statiquement. Aucun nouvel appel non gardé n’a été ajouté. Les intégrations avec un prestataire externe restent à tester dans leur environnement dédié lors d’une phase ultérieure.

## 7. Storage

| Contrôle | Résultat |
|---|---|
| Buckets privés | 11 |
| Bucket public intentionnel | `entreprise-assets` uniquement |
| Policies Storage | 29 |
| Isolation A/B | Réussie |
| Chemin d’une autre entreprise | Refusé |
| Document d’un autre salarié | Refusé sans permission |
| Policies paie | Réécrites avec les fonctions tenant/permission |

`entreprise-assets` doit rester réservé aux logos et ressources de marque destinés à être publics. Aucun document métier ne doit y être importé.

Les durées des URL signées utilisées par l’application sont bornées entre 60 et 900 secondes. Leur création est précédée d’une lecture tenant/RLS ou d’un contrôle serveur. L’expiration réelle d’un jeton dans deux sessions de navigateur n’a pas été simulée de bout en bout dans cette phase locale ; ce contrôle reste un test E2E de défense en profondeur, pas une vulnérabilité P0/P1 connue.

## 8. Rôles testés

- ouvrier ;
- chef d’équipe ;
- conducteur de travaux ;
- comptable ;
- dirigeant/gérant ;
- administrateur entreprise ;
- administrateur plateforme.

Les données utilisent exclusivement des identités fictives et les préfixes `TEST_A_` et `TEST_B_`.

## 9. Modules testés

La matrice couvre les ressources critiques suivantes :

- entreprises, adhésions, postes et permissions ;
- employés et actions en son nom propre ;
- clients, prospects, chantiers, équipes et documents ;
- devis, factures et export comptable ;
- planning et pointages ;
- notes de frais et justificatifs ;
- fournisseurs, commandes et stock ;
- messagerie, messages et médias ;
- journal IA ;
- administration plateforme ;
- Storage privé et documents salariés/paie.

L’audit statique couvre en plus les 143 tables, 260 fonctions/RPC, 151 événements de triggers, 455 policies SQL/Storage, 35 routes API, 50 modules d’actions et 36 pages à identifiant. La matrice comportementale cible les domaines sensibles ; elle ne prétend pas exécuter chaque combinaison CRUD possible sur chacune des 143 tables.

## 10. Tests ajoutés

- 3 fichiers pgTAP ;
- 1 fixture SQL multi-entreprises ;
- 88 assertions SQL supplémentaires, portant le total de 53 à 141 ;
- 1 fichier Vitest ;
- 2 assertions applicatives supplémentaires, portant le total de 104 à 106.

### Tests positifs

- lecture et mutation de ses ressources selon le rôle ;
- visibilité d’un chantier affecté ;
- actions de responsable avec permission ;
- export comptable avec `acces_exports` ;
- accès Storage à ses propres documents ;
- fonctions RLS exécutables par un membre authentifié autorisé.

### Tests négatifs

- lecture, création, modification et suppression inter-entreprises ;
- forçage de `entreprise_id` ;
- accès direct avec UUID d’une ressource B ;
- pointage, note de frais, congé, message ou profil au nom d’un autre salarié ;
- auto-attribution d’un rôle ou d’une permission ;
- accès financier sans permission ;
- export comptable sans `acces_exports` ;
- chemin ou document Storage d’une autre entreprise ;
- accès plateforme par défaut aux données IA privées.

## 11. Problèmes découverts et corrigés

| Problème | Gravité initiale | Correction |
|---|---|---|
| `compteurs_reference` sans RLS | Moyenne | RLS activée, aucun accès applicatif direct |
| Export comptable sans droit explicite | Haute | contrôle serveur `acces_exports` |
| Privilèges légitimes manquants avant RLS | Haute fonctionnelle | privilèges minimaux restaurés, `anon` révoqué |
| Fonctions nécessaires aux policies non exécutables | Haute fonctionnelle | `EXECUTE` minimal pour `authenticated` |
| Policy Storage paie dépendante d’une lecture sensible directe | Haute | helpers tenant/permission `SECURITY DEFINER` |
| Journal IA lisible par l’admin plateforme par défaut | Haute | suppression de l’exception plateforme |
| `search_path` manquant sur un definer | Moyenne | `search_path = public` |
| Fonctions trigger exposées à `anon` | Moyenne | révocation `public`/`anon` |
| Privilèges hors RLS non nécessaires | Moyenne | révocation globale et défauts futurs durcis |

Un test a volontairement échoué avant la migration 190 : l’administrateur plateforme voyait deux lignes IA privées. La même assertion réussit après correction.

## 12. Résultats complets

| Validation | Résultat |
|---|---|
| Reconstruction Supabase locale | Réussie, migrations 1 à 190 |
| Vérification des migrations | 185 fichiers valides et uniques |
| pgTAP | 9 fichiers, 141 tests réussis |
| TypeScript | Réussi |
| ESLint | 0 erreur, 3 avertissements `<img>` historiques hors périmètre |
| Vitest | 29 fichiers, 106 tests réussis |
| Build Next.js | Réussi, compilation et génération de 115 pages statiques |
| `git diff --check` | Réussi |
| Diff schéma `public,storage` | Aucun écart : `No schema changes found` |

La différence entre « 185 migrations valides » et « migrations 1 à 190 » vient des numéros volontairement non contigus de l’historique ; aucun doublon ni ordre invalide n’a été détecté.

## 13. Commits créés

Les commits sont atomiques et locaux. Aucun n’a été poussé :

1. `3319dbe` — `test(security): ajouter matrice isolation multi-entreprises` ;
2. `7a2a4c0` — `fix(db): renforcer isolation multitenant et fonctions` ;
3. `87bf61c` — `fix(storage): isoler les documents de paie` ;
4. `bede72e` — `fix(authz): proteger export comptable` ;
5. documentation et inventaires — hash communiqué dans le compte rendu final.

Le hash du commit documentaire contenant ce rapport est communiqué dans le compte rendu final afin d’éviter une référence circulaire au hash de son propre contenu.

## 14. Fichiers créés ou modifiés

### Application

- `src/app/api/exports/comptabilite/route.ts`
- `src/lib/permissions-financieres.ts`
- `src/lib/permissions-financieres.test.ts`

### Migrations

- `supabase/migrations/20260729000185_isolation_multitenant_grants_et_definer.sql`
- `supabase/migrations/20260729000186_restaurer_privileges_clients_chantiers.sql`
- `supabase/migrations/20260729000187_restaurer_execution_fonctions_rls.sql`
- `supabase/migrations/20260729000188_isoler_politiques_storage_paie.sql`
- `supabase/migrations/20260729000189_restaurer_privileges_modules_metier.sql`
- `supabase/migrations/20260729000190_isoler_journal_ia_plateforme.sql`

### Tests

- `supabase/tests/fixtures/isolation_multitenant.inc`
- `supabase/tests/isolation_multitenant_comportement.test.sql`
- `supabase/tests/isolation_multitenant_roles.test.sql`
- `supabase/tests/isolation_multitenant_surface.test.sql`

### Documentation et outillage

- `docs/audits/phase-1-isolation-et-rls-etat-initial.md`
- `docs/audits/phase-1-isolation-et-rls-rapport-final.md`
- `docs/securite/inventaire-multitenant-v1.md`
- `docs/securite/audit-tables-rls-v1.md`
- `docs/securite/audit-security-definer-v1.md`
- `scripts/security/generate-phase1-inventory.mjs`

## 15. Commandes principales exécutées

- `git branch --show-current`
- `git rev-parse HEAD`
- `git status --short`
- `npm run db:reset`
- `npm run verify:migrations`
- `npm run test:db`
- `node scripts/security/generate-phase1-inventory.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npx supabase db diff --local --schema public,storage`
- requêtes `psql` locales de comptage des tables, policies, fonctions, triggers, privilèges et buckets
- `git diff --check`

## 16. Risques restant ouverts

Aucune vulnérabilité P0 ou P1 connue ne reste ouverte dans le périmètre local audité.

Risques résiduels :

1. **Moyen** — les URL signées et retraits d’adhésion doivent encore être testés dans deux sessions navigateur réelles avec attente d’expiration ;
2. **Moyen** — les webhooks et fournisseurs externes utilisant le service-role nécessitent des tests d’intégration dédiés avec leurs signatures réelles ;
3. **Moyen** — l’inventaire statique doit être régénéré à chaque nouvelle migration, route ou bucket ;
4. **Faible** — le bucket public `entreprise-assets` doit rester strictement limité aux ressources de marque ;
5. **Faible** — trois avertissements `<img>` de performance subsistent volontairement hors périmètre ;
6. **Opérationnel** — les migrations 185 à 190 n’ont volontairement pas été appliquées en production. Leur déploiement devra suivre la procédure validée après revue.

## 17. Recalcul de l’avancement

Ces pourcentages sont des estimations d’audit, pas des métriques contractuelles :

| Indicateur | Avant | Après |
|---|---:|---:|
| Avancement global du produit | 82 % | 84 % |
| Sécurité isolation/autorisation | 58 % | 86 % |
| Préparation commerciale | 72 % | 77 % |

La progression globale reste limitée car cette phase ne traite volontairement ni e-mail, ni Stripe, ni CSP, ni rate limiting, ni antivirus, ni exploitation. En revanche, le socle multitenant local est nettement renforcé et reproductible.

## 18. Conclusion de phase

La phase 1 est **terminée pour son périmètre local** :

- 143/143 tables `public` ont la RLS active ;
- les inventaires SQL et serveur sont générés ;
- les entreprises A et B restent isolées dans la matrice automatisée ;
- les actions personnelles et données financières critiques sont testées ;
- les documents Storage testés sont isolés ;
- l’administrateur plateforme n’accède plus par défaut au journal IA client ;
- TypeScript, lint, Vitest, pgTAP, build, reset et diff de schéma sont verts ;
- aucun P0/P1 connu ne reste ouvert dans ce périmètre.

La validation en production n’est pas incluse et n’a pas été tentée, conformément aux consignes.

## 19. Proposition pour la phase suivante

Sans l’exécuter avant validation :

1. préparer un environnement de recette distinct de la production ;
2. y appliquer les migrations validées avec sauvegarde et plan de retour arrière ;
3. exécuter les scénarios E2E multi-session : ouvrier, responsable, comptable, dirigeant et administrateur plateforme ;
4. tester réellement l’expiration des URL signées et le retrait d’un membre ;
5. tester les webhooks signés et les appels service-role avec doubles et replays ;
6. traiter ensuite, dans un lot distinct, les en-têtes de sécurité/CSP et la limitation de débit ;
7. ne promouvoir en production qu’après rapport de recette et validation explicite.
