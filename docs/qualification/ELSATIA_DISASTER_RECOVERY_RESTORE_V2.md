# ELSATIA — Disaster Recovery & Restore Qualification V2

## Verdict

**ELSATIA DR LOCALLY QUALIFIED**

La qualification porte sur une restauration **locale**, sur des bases jetables. Elle ne vaut pas
pour l'hébergé (Supabase, Vercel, Stripe live), où rien n'a été exécuté. Les RTO/RPO ci-dessous
sont des **mesures locales**, pas un SLA commercial.

| | |
|---|---|
| Base | `integration/elsatia-canonical-train-v5` @ `f6399f15` (V5 qualifié), comme l'impose la mission. V6 était encore en cours au démarrage ; il a été déclaré qualifié pendant la mission. Un contrôle de compatibilité sur le schéma V6 est présenté à part (§16). |
| Branche de travail | `claude/determined-rubin-zdzpmy` (repositionnée sur `f6399f15`, sans commit propre au préalable) |
| Train | 355 migrations, la dernière est `20260928000301_reserves_hote_suspendu_lecture_seule_v1.sql` |
| Moteur | PostgreSQL 16.13 réel + pgTAP 1.3 (apt), sans Supabase CLI, avec l'amorce `scripts/local-postgres-bootstrap` |
| Storage | **Vraie** `supabase/storage-api:v1.25.7` (image Docker officielle, backend fichier) |
| Auth | **Vrai** GoTrue `v2.196.0` (`supabase/auth`, compilé depuis les sources) |
| Commande | `npm run dr:verify` → `ELSATIA DR LOCALLY QUALIFIED`, deux fois : run A sur la base du harnais, run B reconstruit de zéro (§10) |

| Bloc | Résultat |
|---|---|
| Backup (§3) | complet, avec manifeste et SHA-256 ; lisible (TOC de 5 279 entrées) ; **restaurable à l'identique** (restauration de test, 0 écart) |
| Disaster 1 — suppression accidentelle (§4) | 13 tables touchées, 396 lignes perdues → restauration **0 écart** ; 35/35 contrôles métier V5 + 16/16 smokes |
| Disaster 2 — migration cassée (§5) | appliquée à moitié (GRANT anon, policy trop large, backfill) ; 55 écarts détectés → restauration **0 écart** |
| Disaster 3 — purge RGPD interrompue (§6) | interrompue à 6/11 tables ; la reprise sur place **et** restauration + rejeu donnent tous deux l'**état de la purge de référence** ; les autres tenants sont inchangés |
| Disaster 4 — corruption Stripe locale (§7) | une restauration seule **rouvre** 2 droits ; la garde les signale ; après rejeu, les droits = vérité Stripe (19/19) ; doublons et événement tardif sans effet |
| Storage (§8) | métadonnées **et** fichiers : 24/24 objets relus par l'API avec leur SHA-256 d'origine ; la désynchronisation est détectée ; contre-épreuve sur les xattrs |
| Auth (§9) | limites **mesurées** avec GoTrue réel : 4 régressions de sécurité identifiées, 2 mesures correctives prouvées |
| Garde-fous (§13) | Production refusée par défaut ; cible distante seulement sur autorisation explicite ; 10/10 tests + 5 refus en situation |

Trois défauts ont été trouvés **dans la chaîne de restauration elle-même**, pendant la mise au point.
Ils sont corrigés et encadrés (§3.3, §8.3) :

1. Un `search_path` de base restauré sous forme de littéral unique (`"public, extensions"`) casse
   silencieusement la résolution des schémas.
2. `pg_dump` sans `--create` ne reporte pas les réglages `ALTER DATABASE … SET`, et `create database
   … template` non plus.
3. Une archive des fichiers Storage faite **sans attributs étendus** rend 24/24 objets illisibles,
   alors que la cohérence métadonnées ↔ fichiers est parfaite.

---

## 1. Base

La mission dit : « Si V6 est encore en cours : utiliser V5 qualifié », et fixe V5 @ `f6399f15`.
Au démarrage de la mission (~17:35 UTC), `integration/elsatia-canonical-train-v6` était **en
cours** :

- son rapport n'était qu'un brouillon à 17:52 (`c580e5a`, « Playwright et verdict en attente ») ;
- le verdict `CANONICAL TRAIN V6 LOCALLY QUALIFIED` date de 18:08 (`9102ec8`), pendant la mission.

La base qualifiée reste donc **V5 @ `f6399f15`** (`docs(qualification): train canonique V5 —
CANONICAL TRAIN V5 LOCALLY QUALIFIED`), 355 migrations. La branche de travail pointait sur un
ancêtre de V5 (`4d92ddb`) sans commit propre ; elle a été repositionnée sur `f6399f15`.

Par précaution, l'outillage a aussi été exécuté sur le **schéma V6** (358 migrations : les 3
migrations V6 appliquées sur le jeu DR). Voir §16 : ce contrôle ne change pas la base qualifiée.

Les éléments existants ont été réutilisés, sans modification :

- `scripts/local-postgres-bootstrap/rebuild_db.sh` : base fraîche, 355/355 migrations ;
- `scripts/qualification/upgrade-v4-v5.sh` : la base réaliste « avec historique » du train
  (35/35 contrôles métier) ;
- `supabase/tests/fixtures/rgpd_purge_driver.inc` : le déroulé SQL exact de
  `scripts/purger-entreprise.mjs` ;
- `upgrade_v4_v5_business_checks.sql` : les contrôles métier V5.

L'outillage DR V1 (`scripts/dr/0*.sh`, rapport `ELSATIA_DR_EXACT_TIP_V2.md`) reste en place.
V2 le complète, il ne le remplace pas.

## 2. Dataset

Le jeu n'est **pas** un seed synthétique de plus. C'est la base réaliste du train, construite comme
une vraie base de production avec historique :

1. migrations V3 ;
2. jeu V3 : fixtures multi-tenant, fixtures RGPD, recettes Réserves, pilote GP, Colors, compléments
   V1→V2→V3→V4 ;
3. migrations V4, puis données V4 (GP ↔ Réserves, hôte suspendu D-01, Relevé Lots 2-4, Stripe) ;
4. migrations V5.

C'est la sortie de `upgrade-v4-v5.sh`, avec ses 35/35 contrôles métier. Elle est copiée dans
`elsatia_dr_v2_src`. `scripts/dr/v2/dataset_complement.sql` ajoute ensuite ce que ce jeu laisse vide
sur V5. Toutes les écritures du complément passent par les **RPC réelles** :

- 3 événements de planning ;
- un relevé « atelier » avec un **plan 2D** créé par `tools_releve_plan_creer` ;
- les **états Stripe ordonnés** : une facture payée par `appliquer_evenement_facture_abonnement_v2_service`
  et un abonnement Tools Pro par `tools_server_appliquer_abonnement_ordonne` (filigranes posés) ;
- une entrée d'**audit** plateforme ;
- une **suppression RGPD programmée** échue.

`elsatia_dr_v2_live` (la « production » simulée) est une copie de `elsatia_dr_v2_src`.

| Domaine | Contenu (base `elsatia_dr_v2_live`) |
|---|---|
| GP | 16 entreprises, 52 utilisateurs (`auth.users` + profils + appartenances), 36 salariés, 15 clients, 12 chantiers, 300 affectations, 17 tâches, 1 avenant |
| Devis / factures | 13 devis (19 lignes, 2 pièces jointes), 12 factures (18 lignes, 6 paiements) — dont des factures émises verrouillées |
| Commandes | 12 commandes fournisseurs (18 lignes), 11 fournisseurs, 6 dépenses, 5 règlements |
| Stock | 17 articles, 77 mouvements |
| Pointages | 303 pointages, 4 demandes de congés |
| Tools | 1 projet, abonnement Tools Pro (Stripe test) + 3 entitlements, 2 offres catalogue |
| Relevé | 2 relevés (chantiers, bâtiments, 3 étages, 1 zone, 2 pièces, 4 éléments, 3 photos, 1 version, 1 **plan 2D**), journal de 23 entrées |
| Colors | 3 seaux, 3 emplacements, 3 mouvements, paramètres |
| Réserves | 11 réserves, 3 chantiers, 3 intervenants, 3 photos, 2 plans, conversation et messages, 19 entrées d'historique, 17 transitions ; hôte suspendu (D-01) |
| États Stripe | entreprises actif / essai / suspendu / annulé (dont une subscription terminée, cible du réabonnement V5) ; 4 `abonnement_evenements` ; 2 décisions au journal d'ordre et 3 filigranes (`stripe_objets_ordre`) ; 3 factures d'abonnement ; abonnement Tools Pro ordonné |
| Photos (métadonnées) | 20 `storage.objects` répartis sur 9 buckets (`reserves-photos`, `tools-releves`, `chantier-documents`, `devis-medias`…), 20 buckets |
| Plans | 2 `reserves_plans`, 1 `tools_releves_plans` |
| Audit | `journal_activite`, `reserves_historique`, `tools_releves_journal`, `historique_entitlements_elsatia`, `plateforme_journal_actions`, `platform.purge_audit` (D3) |
| Total | **272 tables, 3 427 lignes**, 639 policies RLS, 862 fonctions, 248 triggers, 2 096 contraintes |

## 3. Backup

### 3.1 Contenu

`scripts/dr/v2/backup.sh <base> <dossier>` écrit `<dossier>/<backup_id>/` :

| Fichier | Contenu |
|---|---|
| `db.dump` | `pg_dump --format=custom` : schéma, données, **ACL**, **policies RLS**, séquences, sur tous les schémas (`public`, `platform`, `auth`, `storage`, `extensions`) |
| `roles.sql` | `pg_dumpall --roles-only --no-role-passwords` (rôles du cluster : `anon`, `authenticated`, `service_role`, `authenticator`…) |
| `db_settings.sql` | les `ALTER DATABASE … SET` (`search_path`) : **absents d'un `pg_dump` sans `--create`** (§3.3) |
| `snapshot.json` | l'instantané strict de référence (§3.2) |
| `storage_inventory.json` | l'inventaire des **métadonnées** Storage (buckets, objets, octets déclarés, références métier → objets). Les octets n'y sont **pas** (§8) |
| `manifest.json` | `backup_id`, `backup_at_utc`, train (SHA git, 355 migrations, dernière migration), version PostgreSQL, nombre d'entrées de TOC, taille et SHA-256 de chaque fichier, durées |
| `SHA256SUMS` | le SHA-256 de chaque fichier, manifeste compris (`sha256sum -c`) |

Exemple (run A) : `drv2-20260928T181901215565179`, dump de 6 878 901 octets, 5 279 entrées de TOC,
`db.dump` sha256 `8fc09979…73481556`.

### 3.2 « Lisible » ne suffit pas : restauration de test stricte

`verify_backup.sh` contrôle d'abord `SHA256SUMS`, le manifeste (`backup_id` = dossier) et la table
des matières (`pg_restore --list`, dont le nombre d'entrées doit égaler le manifeste). Il
**restaure** ensuite la sauvegarde dans une base jetable, en prend l'instantané et le compare à
`snapshot.json`, avec **zéro écart toléré**. Un fichier lisible n'est pas une sauvegarde
restaurable.

L'instantané (`snapshot.py`) couvre :

| Catégorie | Contenu comparé |
|---|---|
| Lignes / checksums | le nombre de lignes et le md5 du contenu complet de **chacune des 272 tables** (tous schémas) |
| RLS | RLS activée / forcée, par table |
| Policies | les 639 policies : commande, rôles, permissive, md5 de `USING` / `WITH CHECK` |
| Grants | les ACL de 287 relations, 862 fonctions (avec `SECURITY DEFINER`) et 8 schémas, les privilèges par défaut, les attributs et appartenances des rôles d'API |
| Schéma | l'empreinte des fonctions, triggers, contraintes, index et vues ; les extensions ; la **valeur de chaque séquence** ; les **réglages de la base** |
| États métier | la distribution de 48 colonnes d'état (`statut`, `status`, `decision`, `abonnement_statut`…) |
| Droits | pour chaque entreprise, `abonnement_statut` + subscription ; pour chaque entitlement, s'il est actif |
| Sonde RLS réelle | les lignes **visibles** par chacun des 52 membres (`set local role authenticated` + claims JWT, transaction annulée) sur 37 tables métier, soit 1 924 cellules, plus la sonde `anon` |

Résultat : la restauration de test donne **0 écart**, sur chaque run.

### 3.3 Défauts de la chaîne de restauration trouvés par la comparaison stricte

La première restauration de test comptait 1 268 écarts. L'analyse les a répartis ainsi :

| Constat | Nature | Traitement |
|---|---|---|
| `search_path` de la base restauré en `"public, extensions"` (**un seul** schéma entre guillemets), à cause d'un `quote_literal` de l'outillage sur une valeur de liste. Toutes les définitions (policies, signatures) se résolvaient alors autrement : 1 188 écarts de policies, 50 de fonctions… | **défaut réel** : une base restaurée ainsi ne trouve plus `extensions.*` | corrigé (`dr2_reglages_base` ne cite pas `search_path`) ; les réglages sont comparés (`reglages_base`) |
| `create database … template` et `pg_dump` sans `--create` ne reportent **pas** `ALTER DATABASE … SET search_path` | **défaut réel** des procédures « restaurer dans une base neuve » | `db_settings.sql` est ajouté au backup et rejoué par `restore.sh` |
| 24 ACL `postgres=arwdDxt/postgres` devenues `NULL` après restauration | **équivalent** : `pg_dump` n'émet pas une ACL égale à `acldefault()` | normalisation `coalesce(acl, acldefault(type, propriétaire))` |
| 2 `CHECK` relus `a AND b AND c` au lieu de `a AND (b AND c)` (`communications_canaux_check`, `pointages_coordonnees_check`) | **équivalent** : PostgreSQL ré-analyse l'expression à la restauration | l'empreinte des contraintes ignore les parenthèses (type et validation restent comparés) |

## 4. Disaster 1 — suppression accidentelle de données métier

Avant le sinistre, une écriture métier est faite **après** la sauvegarde : un événement de planning.
Les erreurs d'opérateur suivantes sont ensuite exécutées sur `elsatia_dr_v2_live`, en superutilisateur
(éditeur SQL), une instruction à la fois :

| Opération | Résultat |
|---|---|
| `delete from pointages where entreprise_id = <pilote>` | exécutée |
| `delete from mouvements_stock where entreprise_id = <pilote>` | exécutée |
| `delete from reserves_photos` (WHERE oublié) | exécutée |
| `delete from tools_releves_elements` | exécutée |
| `delete from colors_mouvements` | exécutée |
| `delete from devis where statut = 'brouillon'` | exécutée |
| `delete from factures where entreprise_id = A` | **refusée** par `verrouiller_facture_emise()` (immuabilité des factures émises) |
| `delete from chantiers where entreprise_id = A` | **refusée** (FK : pointages rattachés) |
| `delete from planning_evenements` | exécutée |
| `delete from storage.objects where bucket_id = 'reserves-photos'` | exécutée (métadonnées seulement) |
| `delete from auth.users where id = <utilisateur>` | exécutée, **en cascade** sur les profils et appartenances |

Le sinistre est détecté par la comparaison stricte : **13 tables touchées, 396 lignes perdues**.

Après `restore.sh <B0> elsatia_dr_v2_live --force` :

| Contrôle | Résultat |
|---|---|
| Lignes, checksums, RLS, policies, grants, schéma, états métier, droits, sonde RLS | **0 écart** sur 272 tables / 3 427 lignes, 639 policies, 1 924 cellules RLS |
| Écriture postérieure au backup | **perdue**. Le RPO local est l'âge de la sauvegarde (49 s dans le run A) : aucun WAL ni PITR n'est disponible localement |
| Contrôles métier V5 (`upgrade_v4_v5_business_checks.sql`) | **35/35** |
| Smokes DR (`restore_smokes.sql`) | **16/16** : isolation A/B, `anon` refusé, stock (RLS + trigger), planning, plan 2D, dédup Stripe, filigrane, Tools, RGPD, Réserves |

## 5. Disaster 2 — migration cassée après la sauvegarde

`scripts/dr/v2/d2_migration_cassee.sql` est une migration **fictive**, jamais placée dans
`supabase/migrations/`. Elle reprend le motif courant du dépôt : plusieurs blocs
`begin; … commit;` dans un même fichier. Le bloc 1 est validé :

- une colonne ajoutée et un backfill sur `clients` ;
- la policy « membres planning » remplacée par une policy `using (true)` ;
- un `grant select on clients to anon` ;
- les événements de planning passés à `annule`.

Le bloc 2 échoue (index unique sur des données non uniques). `psql` rend le code 3 : **la migration
est en échec ET à moitié appliquée**.

| Détection (instantané vs B0) | Écarts |
|---|---|
| Policies | 2 |
| Grants (`anon` sur `clients`) | 2 |
| Schéma (colonne) | 1 |
| Tables (backfill) | 2 |
| États métier (`planning_evenements.statut`) | 1 |
| **Sonde RLS réelle** : 46 membres voient désormais le planning des autres tenants, et `anon` a un nouvel accès | 47 |
| Total | 55 |

La restauration de B0 donne **0 écart**. Le `GRANT` anon abusif a disparu
(`has_table_privilege('anon','public.clients','select') = false`).

Leçon : une migration « en échec » n'est pas une migration « sans effet ». La comparaison stricte
voit ce que la RLS laisse fuir, pas seulement les changements de schéma.

## 6. Disaster 3 — purge RGPD interrompue

Tenant : « Peintures Recette A » (Colors, sans contrat accepté), suppression programmée échue,
politique livrée du dépôt.

| Étape | Résultat |
|---|---|
| Référence : purge complète sans incident, sur une restauration de B0 | `complete` (empreinte `255e603c…`) |
| Interruption : comme `purger-entreprise.mjs`, une RPC `purger_table_entreprise` par table, chacune dans sa transaction ; le processus meurt après **6/11 tables** | état partiel (5 tables / 17 lignes restantes), tenant **non** marqué purgé |
| (a) Reprise sur place, sans restauration : rejeu intégral du déroulé | `complete`, **état = référence** |
| (b) Restauration de B0 (0 écart), puis rejeu intégral | `complete`, **état = référence** |
| Autres tenants (devis, factures, clients, objets Storage de chacun) | **inchangés** |
| Purge relancée sur le tenant déjà purgé | idempotente, état inchangé |

L'empreinte vient de `d3_empreinte.sql`, reprise de `rgpd-end-to-end-v3.sh`. Elle est indépendante
de l'horloge et des identifiants de run, et couvre :

- les factures et leurs empreintes comptables ;
- le rapport de purge ;
- les clients ;
- l'entreprise ;
- les objets Storage ;
- les preuves de contrats figées.

**Conséquence opérationnelle** : une restauration **ressuscite** les données d'un tenant dont la
purge s'était terminée après la sauvegarde. Toute purge programmée échue doit être relancée après
une restauration (procédure, §README étape 5). Le rejeu est sûr, parce que la purge est idempotente.

## 7. Disaster 4 — corruption de l'état Stripe local

Le risque propre à Stripe : **une restauration rouvre des droits**. La sauvegarde fige les droits à
`backup_at`, et tout événement Stripe postérieur (échec de paiement, résiliation) est perdu.

| Étape | État GP « UPG4 converti » / Tools Pro |
|---|---|
| B0 (filigranes du complément, il y a 2 jours) | `actif` / actif |
| Après B0, événements reçus par le webhook : `invoice.payment_failed` (E2) et `customer.subscription.deleted` (E3), traités par les RPC ordonnées (`applique`) | **`suspendu` / révoqué**, la « vérité Stripe » |
| Corruption (script fautif) : journal d'ordre et filigranes effacés, accès et droit rouverts à la main | `actif` / actif |
| Restauration de B0 **seule** (0 écart vs B0) | `actif` / actif : **réouverture abusive** |
| Garde `stripe_controle_post_restauration.sql -v backup_at=…` | signale **2 droits à reconcilier**, AVANT toute réouverture : chaque droit ouvert dont la dernière décision Stripe connue est ≤ `backup_at` |
| Rejeu des événements créés depuis `backup_at` (fichier `d4_evenements_stripe_post_backup.sql`, les mêmes RPC que les webhooks) | E2 `applique`, E3 `applique` → **`suspendu` / révoqué** |
| Second rejeu (doublons Stripe) | E2 `deja_traite`, E3 `deja_traite`, aucun effet |
| `invoice.paid` **antérieur** livré en retard | `perime` : pas de réouverture |
| Garde relancée | levée pour les droits rejoués |
| Tous les droits (19 lignes : entreprises + entitlements) | **identiques** à l'état d'avant la corruption |

Le mécanisme d'ordre de Stripe (filigrane `event.created`, décision `deja_traite` / `perime`) rend
le rejeu sûr. Mais il ne protège pas d'une restauration **sans** rejeu : c'est l'objet de la garde.

En Production, la source du rejeu est Stripe lui-même : l'Events API `created[gte]=<backup_at>`,
renvoyée vers les 4 webhooks. Stripe ne conserve les événements que **30 jours** (limite
documentée par Stripe, non testée ici) : au-delà, la réconciliation passe par la relecture des
abonnements. Cette partie n'est **pas prouvée** (aucune clé Stripe utilisée).

## 8. Storage

### 8.1 Distinction

| | Où | Couvert par `db.dump` |
|---|---|---|
| Métadonnées (`storage.buckets`, `storage.objects` : chemin, version, taille, propriétaire, policies) | PostgreSQL | **oui** (checksums §3.2, `storage_inventory.json`) |
| Fichiers (octets) | magasin d'objets (S3 en hébergé, disque ici) | **non**. Une sauvegarde de base seule ne restaure aucune photo, aucun plan, aucun PDF |

### 8.2 Drill avec la vraie storage-api (`storage_drill.sh`)

Le service est l'image officielle `supabase/storage-api:v1.25.7`. Elle exécute ses propres
migrations Storage sur `elsatia_dr_v2_storage`, avec un backend fichier. Les 4 buckets reprennent
ceux de l'application (`reserves-photos`, `tools-releves`, `chantier-documents` privés,
`entreprise-assets` public), avec 24 objets (1 à 512 Kio).

| Contrôle | Résultat |
|---|---|
| Sauvegarde **appariée** (un `backup_id` commun) : `pg_dump` de la base Storage + archive des fichiers + manifeste du SHA-256 de chaque objet **téléchargé par l'API** | 24/24 = SHA-256 à l'envoi |
| Écritures postérieures : ajout X, suppression Y, remplacement Z | — |
| S1 : restauration de la **base seule** | désynchronisation **détectée** : 2 lignes sans octets, 2 fichiers orphelins, 2 objets illisibles (HTTP 500) |
| S2-0 : contre-épreuve, fichiers restaurés **sans attributs étendus** (`tar` par défaut) | **24/24 illisibles**, alors que la cohérence est parfaite (0/0) |
| S2 : perte totale (base + fichiers), puis restauration appariée | **24/24 objets re-téléchargés avec le SHA-256 du manifeste** ; cohérence 0 manquant / 0 orphelin |
| Objet écrit après la sauvegarde | absent (RPO Storage = âge de la sauvegarde appariée) |
| URL signée émise avant la sauvegarde | toujours valide après restauration (même secret JWT) : une URL signée fuitée survit à une restauration tant que le secret n'a pas tourné |

### 8.3 Constat xattrs

Le backend fichier de storage-api range le `content-type` et le `cache-control` de chaque objet dans
des **attributs étendus** (`user.supabase.content-type`, `user.supabase.cache-control`). Une archive
qui les perd rend tous les objets illisibles. L'archive doit être faite avec
`tar --xattrs --xattrs-include='user.*'` (c'est ce que fait l'outillage). En hébergé, la
question ne se pose pas dans les mêmes termes (backend S3, métadonnées d'objet S3) : **non testé**.

### 8.4 Ce qui reste non prouvé (hébergé)

- La sauvegarde des objets d'un projet Supabase hébergé. Les sauvegardes de base Supabase ne
  contiennent que les métadonnées. Il faut une copie S3 → S3 (par exemple via l'endpoint S3 de
  Storage), liée au `backup_id` de la base. Rien n'a été exécuté.
- Le volume réel (les buckets de Production), la durée de copie et le coût.
- Le remappage de `storage.objects.owner` en cas de restauration dans un **autre** projet (autres
  `auth.users.id`).

## 9. Auth

### 9.1 Dans la base (restauré par `db.dump`)

Sont restaurés : `auth.users` (y compris le **hachage bcrypt** du mot de passe, `banned_until`,
`deleted_at`), `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_factors` et les
23 tables du schéma GoTrue réel. Côté application : `utilisateurs`, `utilisateurs_entreprises`, les
permissions. Le rapport V1 (§9) affirmait que les hachages n'étaient « pas portables ». Avec un vrai
GoTrue, le hachage restauré **fonctionne** (A-2) : la réserve V1 est levée pour le local.

### 9.2 Mesures avec GoTrue réel (`auth_drill.sh`)

Scénario : U1 a 2 sessions et U2 existe → sauvegarde → U1 change son mot de passe et ferme sa
session 2, U2 est banni, U3 s'inscrit → restauration.

| # | Constat après restauration | Gravité |
|---|---|---|
| A-2 | **L'ancien mot de passe de U1 fonctionne de nouveau** (le changement postérieur est perdu) | régression de sécurité |
| A-3 | le nouveau mot de passe est refusé | perte pour l'utilisateur |
| A-4 | **La session fermée après la sauvegarde est ressuscitée** (le refresh est accepté) | régression de sécurité |
| A-5 | **Le ban de U2 est levé** | régression de sécurité |
| A-6 | U3 n'existe plus ; son jeton d'accès est refusé (403) | perte (il doit se réinscrire) |
| A-7 | un refresh token émis après la sauvegarde est refusé | reconnexion forcée |
| A-9 | un jeton d'accès émis avant la sauvegarde (non expiré) est toujours accepté | à couvrir par A-11 / A-12 |

Mesures correctives **prouvées** :

- **A-10 / A-11** : la révocation globale des sessions (`delete from auth.sessions`, en cascade sur
  les refresh tokens) fait refuser tous les refresh tokens et les jetons d'accès liés (403).
- **A-12** : la rotation du secret JWT fait refuser les jetons signés avec l'ancien secret ; une
  nouvelle connexion fonctionne.

Les **bans et changements de mot de passe postérieurs** à la sauvegarde ne se reconstituent pas
depuis la base : `auth.audit_log_entries` est restauré au même instant. Il faut une source externe
(journaux de la plateforme, exports d'audit applicatif).

### 9.3 Nécessite Supabase hébergé (non prouvé)

Ce qui suit vit dans la **configuration** du projet, pas dans la base, et n'est donc pas restauré
par une sauvegarde de base :

- les clés de signature JWT / le secret ;
- les providers OAuth ;
- SMTP et gabarits d'e-mail ;
- les Auth Hooks ;
- les réglages MFA ;
- les URL de redirection.

Autres points non prouvés :

- La restauration du schéma `auth` d'un projet géré (droits limités sur `auth` en hébergé) et la
  PITR hébergée.
- La révocation globale des sessions en hébergé (SQL sur `auth.sessions` depuis l'éditeur, ou
  rotation des clés JWT) : procédure à valider sur Preview.
- Les secrets TOTP de `auth.mfa_factors`, restaurés avec la base, dont le chiffrement éventuel
  dépend de la configuration de la plateforme.

## 10. RTO / RPO (mesures locales)

Machine : 4 vCPU, 15 Gio, PostgreSQL 16 local, sans réseau entre les composants. Base de 272 tables
et 3 427 lignes (dump de 6,9 Mo). **Ces valeurs ne sont pas un SLA** : elles ne disent rien d'un
volume de Production ni de l'hébergé.

| Mesure | Run A | Run B (reconstruit de zéro) |
|---|---|---|
| Construction du jeu (355 migrations + harnais d'upgrade) | réutilisé | 221,9 s |
| `pg_dump` | 0,43 s | 0,43 s |
| Backup complet (dump + rôles + réglages + instantané + inventaire + manifeste) | 24,1 s | 24,7 s |
| Vérification du backup (restauration de test + comparaison stricte) | 24,6 s (restauration 2,4 s) | 24,9 s (restauration 2,7 s) |
| Restauration (D1 / D2 / D3 / D4) | 3,10 / 3,00 / 2,75 / 3,02 s | 3,10 / 3,30 / 3,01 / 3,10 s |
| Vérification après restauration (instantané + comparaison) | 21,0 – 21,6 s | 22,0 – 22,3 s |
| Smokes métier (35 + 16) | 0,41 s | 0,45 s |
| RPO local observé (âge du backup au sinistre D1) | 49,3 s | 50,2 s |
| Storage : backup base / fichiers / manifeste | 0,15 / 0,19 / 0,49 s | 0,12 / 0,17 / 0,51 s |
| Storage : restauration base / fichiers / redémarrage API / vérification | 0,34 / 0,04 / 2,19 / 0,34 s | 0,37 / 0,04 / 2,19 / 0,35 s |
| Auth : backup / restauration | 0,13 / 0,42 s | 0,14 / 0,39 s |
| `npm run dr:verify` complet | 263 s (jeu réutilisé) | 490 s |

Lecture :

- Le **RTO local** est dominé par la **vérification** (~21 s : sonde RLS de 52 membres), pas par la
  restauration (~3 s).
- La sonde RLS montre au passage que la policy de `pointages` coûte ~0,85 s pour 303 lignes par
  membre (~2,8 ms/ligne). C'est une observation de performance, sans rapport avec le DR, à suivre
  hors mission.
- Le **RPO local** est l'âge de la dernière sauvegarde : il n'y a ni archivage WAL ni PITR
  localement.
- Les RTO/RPO hébergés restent **NOT PROVEN**, comme dans `ELSATIA_DR_EXACT_TIP_V2.md`.

## 11. Validation après restauration

Sur chaque restauration de B0 (D1 dans le drill, D1 à D4 par la comparaison) :

- la comparaison stricte donne **0 écart** ;
- **35/35** contrôles métier V5, rejoués tels quels (Relevé plan 2D, Réserves D-01, réabonnement
  Stripe) ;
- **16/16** smokes DR (`restore_smokes.sql`, transaction annulée).

| Smoke | Contrôle |
|---|---|
| I01-I04 | isolation multi-tenant réelle (A ne voit ni clients, ni factures, ni chantiers de B, et réciproquement) |
| I05 | `anon` refusé sur `clients` (GRANT restauré) |
| W01-W02 | mouvement de stock sous RLS + permission `gerer_stock`, trigger appliqué (+5) |
| W03-W04 | planning créé ; plan 2D restauré lisible par le métreur |
| S01 | webhook déjà reçu avant la sauvegarde : `duplicate` |
| S02-S04 | facture déjà appliquée : `deja_traite` ; échec antérieur au filigrane : `perime`, accès inchangé |
| S05 | droit Tools Pro restauré, conforme à l'état Stripe sauvegardé |
| G01 | rapport de purge RGPD calculable |
| G02 | Réserves : chantier de l'hôte suspendu en lecture seule pour l'intervenant |

Pas de typecheck : il n'y a aucune modification applicative (`src/`, `apps/`), comme le permet la
mission.

## 12. Automation

`npm run dr:verify` (`scripts/dr/v2/dr-verify.mjs`) :

1. applique le garde-fou (§13) avant toute action ;
2. lance `drill.sh` (base), `storage_drill.sh` (Storage) et `auth_drill.sh` (Auth) ;
3. écrit `results.json` pour chaque partie ;
4. imprime une synthèse et le verdict `ELSATIA DR LOCALLY QUALIFIED` / `ELSATIA DR BLOCKED`
   (codes 0 / 1 ; 3 = cible refusée).

| Option | Effet |
|---|---|
| `--db-only` | base seule |
| `--backup <dossier>` | vérifie une sauvegarde existante : intégrité, TOC, restauration de test locale, comparaison stricte |
| `--strict` | Storage et Auth doivent être **exécutés** (sinon `*_NOT_PROVEN` n'échoue pas) |
| `--out <dossier>` | dossier de sortie |
| `DR2_REBUILD=1` | reconstruit le jeu de zéro (base fraîche + harnais d'upgrade) |

Intégration au dépôt :

- `npm run test:dr-guard` (10 tests du garde-fou, sans base), ajouté au job CI existant.
- 9 variables d'outillage déclarées au manifeste d'environnement (`verify:env-manifest` OK) :
  `DR_PGHOST`, `DR_PGPORT`, `DR_PGUSER`, `DR_ALLOW_REMOTE`, `DR_REMOTE_ALLOWLIST`, `DR2_PSQL_MODE`,
  `DR2_PROBE_WORKERS`, `STORAGE_URL`, `STORAGE_JWT_SECRET`. S'y ajoutent `PGPASSWORD` en variable
  système et l'accès dynamique justifié du garde-fou.
- Les 8 fichiers SQL de `scripts/dr/v2/` sont classés au registre des seeds (couverture
  `dr-v2-drill`, `test:seeds` 48/48).

Le drill complet n'est **pas** en CI : il exige Docker (storage-api), un GoTrue compilé et les refs
V3/V4. Il reste une commande opérateur.

## 13. Garde-fous

`scripts/dr/v2/garde-cible.mjs` est un module pur, testé par `garde-cible.test.mjs` (10/10). Il est
appelé par `dr-verify.mjs` **et** par chaque script bash (`dr2_garde`), qui ajoute un second
contrôle indépendant (hôte local + préfixe).

| Règle | Détail |
|---|---|
| **Production refusée par défaut**, dans tous les modes, même avec une autorisation distante | indices : `VERCEL_ENV` / `ELSATIA_ENV` / `APP_ENV` / `NODE_ENV = production`, projet Supabase autre que la référence Preview (`NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_URL`, `SUPABASE_PROJECT_REF`), nom de base ou d'hôte évoquant la production, hôte Supabase hébergé non Preview |
| **Cible distante** | refusée sauf `DR_ALLOW_REMOTE=1` **et** hôte listé exactement dans `DR_REMOTE_ALLOWLIST` ; même alors, uniquement en mode non destructif `verify-backup`, jamais pour un drill |
| **Base locale** | nom `elsatia_dr_*` obligatoire |
| Restauration | sha256 (SHA256SUMS + manifeste) et TOC vérifiés **avant** toute action ; écrasement d'une base non vide refusé sans `--force` ; `pg_restore --exit-on-error` (pas de succès partiel silencieux) |

Refus vérifiés en situation (drill §6, run A) :

| # | Cas | Résultat |
|---|---|---|
| F-1 | sauvegarde altérée d'un octet | refusée (`ECHEC INTEGRITE`) |
| F-2 | écrasement sans `--force` | refusé |
| F-3 | base hors préfixe (`upg_v4_v5`) | refusée |
| F-4 | `VERCEL_ENV=production` | refusé |
| F-5 | hôte distant non autorisé | refusé |

`npm run dr:verify` refuse aussi, avant toute action, avec `VERCEL_ENV=production` et avec
`DR_PGHOST=10.0.0.9` (code 3).

## 14. Constats et recommandations

| # | Constat | Priorité | Action |
|---|---|---|---|
| R1 | Une restauration **rouvre des droits** Stripe (D4) | P0 procédure | Rendre obligatoire, après toute restauration et avant réouverture du trafic : garde `stripe_controle_post_restauration.sql`, puis rejeu Events API `created[gte]=backup_at` (fenêtre Stripe de 30 jours) |
| R2 | Une restauration **ressuscite** d'anciens mots de passe, des sessions fermées et des bans levés (Auth A-2/A-4/A-5) | P0 procédure | Après restauration : révocation globale des sessions + rotation des clés JWT ; ré-appliquer bans et réinitialisations depuis une source d'audit externe |
| R3 | Les fichiers Storage ne sont **pas** dans la sauvegarde de base ; une restauration de base seule désynchronise | P0 hébergé | Mettre en place une copie S3 → S3 appariée au `backup_id` et vérifiée par SHA-256 (manifeste). À exécuter et mesurer sur Preview |
| R4 | Une archive de fichiers sans xattrs rend Storage illisible (backend fichier) | P2 | `tar --xattrs` (fait) ; vérifier l'équivalent des métadonnées d'objet en S3 |
| R5 | Les réglages `ALTER DATABASE … SET` ne suivent pas un `pg_dump` sans `--create` | P1 | `db_settings.sql` (fait) ; à reporter dans toute procédure de restauration manuelle |
| R6 | Une restauration ressuscite un tenant purgé après la sauvegarde | P1 procédure | Relancer les purges programmées échues après restauration (idempotent, prouvé en D3) |
| R7 | Une migration à plusieurs `commit;` peut rester à moitié appliquée | P2 | Un seul bloc transactionnel par migration ; sauvegarde vérifiée avant chaque lot |
| R8 | Les RTO/RPO hébergés ne sont pas prouvés | — | Drill Preview (PITR, restauration de projet, copie Storage), hors mission, avec autorisation explicite |

## 15. Reproduction

```bash
git checkout claude/determined-rubin-zdzpmy
git fetch origin integration/elsatia-canonical-train-v3 integration/elsatia-canonical-train-v4   # harnais d'upgrade
apt-get install -y postgresql-16-pgtap          # pgTAP (contrôles métier et smokes)
pg_ctlcluster 16 main start
dockerd &  && docker pull supabase/storage-api:v1.25.7                      # Storage réel
# GoTrue : voir scripts/local-postgres-bootstrap/gotrue_pilot_bootstrap.sh (étape 1, build Go)
DR2_REBUILD=1 npm run dr:verify                 # → ELSATIA DR LOCALLY QUALIFIED
npm run dr:verify -- --backup /tmp/elsatia-dr-v2/run-…/db/backups/drv2-…   # vérifier une sauvegarde
```

`npm run dr:verify -- --backup <B0 du run B>` rend `BACKUP VERIFIED — restaurable à l'identique`
(0 écart, restauration de test 2,66 s, vérification 25,6 s).

Les journaux et `results.json` des runs A et B sont hors dépôt (données de bases jetables). Ce
rapport en reprend les valeurs.

## 16. Contrôle de compatibilité V6 (hors base qualifiée)

V6 a été déclaré qualifié pendant la mission (§1). Pour vérifier que l'outillage ne dépend pas du
seul schéma V5, voici ce qui a été exécuté :

1. B0 du run B restauré dans `elsatia_dr_v2_v6` ;
2. les **3 migrations V6** appliquées depuis `origin/integration/elsatia-canonical-train-v6`
   (`…0401` géométrie de bâtiment, `…0501` conservation RGPD des contrats v2, `…0601` surface de
   pièce synchronisée), soit 358 migrations ;
3. `backup.sh` puis `verify_backup.sh`.

| Contrôle | Résultat |
|---|---|
| Migrations V6 sur les données DR | 3/3 appliquées |
| Backup V6 | TOC 5 326 entrées |
| Restauration de test + comparaison stricte | **0 écart** (restauration 2,69 s, vérification 25,1 s) |
| Smokes DR après restauration | **16/16** |

Ce contrôle ne rejoue ni les 4 catastrophes, ni Storage, ni Auth sur V6. Les contrôles métier V5
(`upgrade_v4_v5_business_checks.sql`) sont propres au jeu V5. Lors de la fusion de cette branche
avec V6, trois fichiers modifiés des deux côtés seront à réconcilier : `.github/workflows/ci.yml`,
`scripts/seeds/registry.mjs` et `scripts/seeds/registry.test.mjs` (ensemble `EXTERNAL_COVERAGE`).
