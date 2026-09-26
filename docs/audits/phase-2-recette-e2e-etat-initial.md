# Phase 2 — État initial de la recette E2E

Date du constat : 30 juillet 2026

Périmètre : migrations 185 à 190, recette locale isolée et tests multi-rôles

Production : strictement hors périmètre

## Référence Git

- Branche active : `release/commercialisation-v1`
- Commit initial : `e9a996cb0a982cfb46f38f4b0432542e213c0b0c`
- Branche distante : aucun push autorisé pendant cette phase
- Déploiement public : interdit pendant cette phase
- Diff suivi au démarrage : aucun

Commits de la phase 1, du plus ancien au plus récent :

1. `3319dbe` — matrice de tests d’isolation multi-entreprises ;
2. `7a2a4c0` — durcissement multitenant et fonctions SQL ;
3. `87bf61c` — isolation Storage des documents de paie ;
4. `bede72e` — protection des exports comptables ;
5. `5b3c25a` — documentation isolation et permissions ;
6. `f76205d` — tests des URL signées Storage ;
7. `e9a996c` — rapport final de phase 1.

## Migrations à valider

| Ordre | Migration | SHA-256 |
|---:|---|---|
| 185 | `20260729000185_isolation_multitenant_grants_et_definer.sql` | `a7b0f7674edc37a797bc27b57fec7f6af982aae0029567e84248b4ee074c64ad` |
| 186 | `20260729000186_restaurer_privileges_clients_chantiers.sql` | `61cbe4f844756e064a60cfd1378eb31378f946d917371219c93edafa38eef9a1` |
| 187 | `20260729000187_restaurer_execution_fonctions_rls.sql` | `9d96268e8284d3ba4154944231fc9485716c0abb2f14cf00e5ff2f873477fac9` |
| 188 | `20260729000188_isoler_politiques_storage_paie.sql` | `0a3469d772309dcbc02d0ad9fae3cbb2949c21015d4b398f3a54b54894923023` |
| 189 | `20260729000189_restaurer_privileges_modules_metier.sql` | `b1b1e2a9c454d915464abb80f37aefb676fa0ad24330fb72e86d8fde98ef5609` |
| 190 | `20260729000190_isoler_journal_ia_plateforme.sql` | `284e096470821c90367bbdb5385dcd836a8cb25b59b309851932bbc41f977db4` |

Les fichiers ne seront pas modifiés. Un défaut démontré devra être corrigé par une migration ultérieure distincte.

## État local

La recette utilise une copie isolée du répertoire Supabase :

- copie : `/tmp/liria-phase2-recette-184f` ;
- identifiant local : `liria-phase2-recette` ;
- conteneur PostgreSQL : `supabase_db_liria-phase2-recette` ;
- contenu initial : migrations 1 à 184 uniquement.

Supabase local est disponible aux adresses suivantes :

- API : `http://127.0.0.1:54321`
- PostgreSQL : `127.0.0.1:54322`
- Studio : `http://127.0.0.1:54323`
- Mailpit/Inbucket : `http://127.0.0.1:54324`

Les services optionnels `imgproxy` et `pooler` sont arrêtés ; ils ne sont pas requis pour les contrôles prévus.

Les contrôles de phase 1 étaient réussis avant l’ouverture de cette phase :

- tables RLS : 143/143 ;
- politiques : 426 ;
- fonctions `SECURITY DEFINER` avec `search_path` fixé : 228/228 ;
- tests pgTAP : 141 ;
- tests Vitest : 106 ;
- build Next.js : 115 pages ;
- buckets privés : 11 ;
- assertions Storage : 87.

Ces résultats constituent une référence, pas le résultat final de la phase 2. Tous les contrôles seront rejoués.

## Variables nécessaires

Seuls les noms sont consignés ; aucune valeur n’est enregistrée dans ce rapport :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`
- `LIRIA_AUDIT_URL`
- `LIRIA_AUDIT_OUTPUT`
- identifiants fictifs des rôles de recette

Les variables Stripe, bancaires, Powens, Sentry et les secrets de production doivent être absents ou neutralisés.

## Données et travaux hors périmètre

Les médias et guides historiques non suivis sont conservés sans modification :

- `output/guide/` : 8 Kio ;
- `output/pub/` : vide ;
- `output/video/` : environ 257 Mio ;
- `scripts/video/orchestre.py` : environ 12 Kio.

Un travail parallèle de journal des interventions plateforme a été placé temporairement dans
`/tmp/liria-phase2-journal-hold/`. Les trois fichiers sont protégés par les empreintes suivantes :

- page : `52b0d96288b26171bbc35ed5fd69e6bd81e72ae070634d03b87bf85fea92b20a` ;
- migration 191 : `7619d09587145128583e61744ccf41cd4ec118beabdf8dd29dad38bff8ee5539` ;
- test SQL : `2bd1117c867e4ffc379498af8b5970793d3fb1a0eaaa973d7bf5f60a64d8b315`.

Ils seront restaurés après les commits de phase 2 et ne seront pas mélangés avec la recette 185–190.

## Risques initiaux

- Aucun environnement cloud de recette n’est configuré : la recette sera locale, dédiée et sans données réelles.
- Playwright n’est pas encore installé dans le projet.
- Les six migrations ont déjà été validées lors d’une reconstruction complète en phase 1, mais leur montée séquentielle depuis l’état 184 doit encore être démontrée.
- `npm audit` signalait une dépendance transitive à risque élevé dans `brace-expansion` via Sentry ; ce point n’est pas corrigé dans cette phase si aucune régression de sécurité nouvelle n’est démontrée.
- Aucun test de production ne sera utilisé comme substitut à la recette.

## Vérification préalable au lot 185

La vérification a été réalisée sans appliquer les migrations 185 à 190 et sans
modifier la base principale `postgres`.

### État confirmé

- 12 conteneurs de recette sont actifs ;
- tous les services possédant un healthcheck sont `healthy` ;
- `edge_runtime` et `rest` n'ont pas de healthcheck Docker configuré, mais sont
  actifs et la commande Supabase `status` aboutit ;
- la base principale contient 179 migrations, avec
  `20260729000184` comme version maximale ;
- aucune migration 185 à 190 n'est présente ;
- les témoins `RECETTE_A_ENTREPRISE` et `RECETTE_B_ENTREPRISE` sont présents ;
- le schéma `public` contient 143 tables et 426 policies ;
- les schémas `public`, `auth` et `storage` sont présents.

### Sauvegardes pré-185

Répertoire :
`/tmp/liria-phase2-backups/pre-185-20260730/`

| Fichier | Taille | SHA-256 | Usage |
|---|---:|---|---|
| `pre-185-full.dump` | 1 654 509 octets | `1d429b3389c0d9f407d55e0a1ae52f119d5f561217aec2445530e6f904516da1` | Référence de restauration complète |
| `pre-185-schema.sql` | 1 046 055 octets | `ef081a04cbbb62194a8cceab82d8d7d91e6c7ef8be0962ec45d42731bace98cd` | Lecture, audit et comparaison du schéma |
| `pre-185-data.sql` | 1 067 054 octets | `e0c79b0caeb9b924b666c9a97247dfcacb0ce5e43679573487906d6ca5d079d2` | Lecture des données fictives ; restauration isolée déconseillée à cause de dépendances circulaires |
| `pre-185-migrations.txt` | 2 685 octets | `0f9b82371ecf846617e135d15c25cf2833ee8bf80515e09ca0a3beedb2ffe9bf` | Contrôle des 179 versions attendues |

`pg_restore --list` lit correctement le dump custom et recense 2 498 entrées.
Les trois fichiers texte sont lisibles. Les deux entreprises témoins sont
présentes dans le dump de données.

### Preuve de restauration

Une première tentative avec le rôle `postgres` a été interrompue par :

```text
permission denied to set parameter "log_min_messages"
```

L'objet concerné est la fonction interne
`realtime.list_changes(...)`, qui fixe `log_min_messages` à `fatal`. Dans cette
image Supabase locale, `postgres` n'est pas superutilisateur, tandis que
`supabase_admin` l'est. Ce défaut ne concerne ni une migration Liria ni les
données métier.

La restauration de référence a donc été exécutée dans la base temporaire
`liria_phase2_rollback_check` avec :

```bash
docker cp \
  /tmp/liria-phase2-backups/pre-185-20260730/pre-185-full.dump \
  supabase_db_liria-phase2-recette:/tmp/liria-pre185-full.dump

docker exec supabase_db_liria-phase2-recette \
  pg_restore -U supabase_admin \
  -d liria_phase2_rollback_check \
  --no-owner --no-privileges --exit-on-error \
  /tmp/liria-pre185-full.dump
```

La commande s'est terminée avec le code 0. La base restaurée contient les mêmes
179 migrations, s'arrête à la migration 184, ne contient aucune migration 185 à
190, conserve les deux entreprises témoins, et possède les mêmes 143 tables et
426 policies `public`.

La comparaison structurelle logique est identique pour :

- 194 tables ;
- 2 366 colonnes de tables ;
- 1 124 contraintes ;
- 580 index ;
- 371 fonctions ;
- 455 policies tous schémas applicatifs confondus ;
- 91 triggers ;
- 179 migrations.

Le diff SQL brut se limite aux marqueurs aléatoires `restrict/unrestrict` de
`pg_dump` et à une parenthèse redondante normalisée dans une contrainte. Les
numéros internes `attnum` diffèrent sur quelques tables internes Supabase parce
que le dump ne recrée pas les emplacements historiques de colonnes supprimées ;
les noms, types et attributs des 2 366 colonnes logiques sont identiques.

Le dump custom `pre-185-full.dump` est par conséquent la sauvegarde de référence
pré-185.

## Validation séquentielle des migrations 185 à 190

La montée a été exécutée exclusivement dans la copie locale isolée
`/tmp/liria-phase2-recette-184f`, une migration à la fois et dans l'ordre. Les
six fichiers ont conservé les empreintes indiquées plus haut. Chaque commande
de migration s'est terminée avec un code nul et chaque version apparaît une
seule fois dans `supabase_migrations.schema_migrations`.

| Migration | Résultat | Contrôle principal |
|---|---|---|
| 185 | Réussie | RLS des compteurs, suppression des exécutions dangereuses pour `anon`, `search_path` fixé |
| 186 | Réussie | droits `authenticated` restaurés sur clients et chantiers, aucun droit `anon` |
| 187 | Réussie | exécution des fonctions d'aide RLS restaurée pour `authenticated`, refusée à `anon`/`public` |
| 188 | Réussie | bucket `documents-paie` privé et policies réservées aux utilisateurs authentifiés autorisés |
| 189 | Réussie | privilèges des modules métier restaurés sans réintroduire de droit `anon` |
| 190 | Réussie | lecture de `journal_ia` limitée à l'utilisateur ou aux membres actifs autorisés, sans accès administrateur plateforme implicite |

État final de la base principale de recette :

- 185 migrations au total ;
- version maximale `20260729000190` ;
- aucune migration postérieure à 190 ;
- 143 tables `public`, toutes avec RLS activé ;
- 426 policies `public` et 29 policies sur `storage.objects` ;
- 11 buckets privés ;
- 228 fonctions `SECURITY DEFINER`, toutes avec `search_path` fixé ;
- aucune fonction `SECURITY DEFINER` exécutable par `anon` ;
- les deux entreprises témoins initiales sont intactes.

## Résultats des contrôles après migration

- pgTAP : 9 fichiers, 141 assertions, toutes réussies ;
- Storage : 11 buckets privés, 87 assertions réussies, incluant isolation,
  création d'URL signée, lecture, listage, modification, suppression et
  expiration ;
- TypeScript : réussi ;
- ESLint : réussi sans erreur, avec trois avertissements historiques sur
  l'utilisation de `<img>` ;
- Vitest : 29 fichiers et 106 tests réussis ;
- build Next.js : réussi ;
- `supabase db diff --local --schema public,storage` : aucune différence de
  schéma après reconstruction complète de la base fantôme.

Le test Storage exige de vrais objets physiques. Les données techniques A/B
historiques inséraient seulement des métadonnées dans `storage.objects`, ce qui
provoquait un `ENOENT` local lors d'un GET signé. Pour le seul chargement de
recette, une copie temporaire du fixture a omis mécaniquement ces deux blocs de
métadonnées ; le fixture versionné n'a pas été modifié. Le test a ensuite créé
ses fichiers via l'API Storage puis les a supprimés. Aucun artefact
`test_storage` ne subsiste.

## Rollback contrôlé après migration 190

Après la montée complète de la base principale à 190, le dump de référence
pré-185 a été restauré une seconde fois dans la base temporaire
`liria_phase2_rollback_post190_check` avec `supabase_admin` :

```bash
docker exec -i supabase_db_liria-phase2-recette \
  pg_restore -U supabase_admin \
  -d liria_phase2_rollback_post190_check \
  --no-owner --no-privileges --exit-on-error \
  < /tmp/liria-phase2-backups/pre-185-20260730/pre-185-full.dump
```

La restauration s'est terminée avec le code 0. La base restaurée contient 179
migrations, s'arrête à 184, ne contient aucune migration 185 à 190, conserve
les deux entreprises témoins, les 143 tables et les 426 policies `public`, et
possède les schémas `auth`, `public` et `storage`. La sauvegarde pré-185 reste
donc restaurable même après l'application complète du lot.

Cette validation ne constitue pas une promotion en production. Aucun push,
aucun déploiement public et aucun test E2E n'ont été réalisés.
