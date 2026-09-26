# Runbook — purge RGPD (art. 17) d'une entreprise

Statut au 2026-09-22 : **NE PAS EXÉCUTER EN PRODUCTION EN L'ÉTAT.** Ce runbook
documente la procédure telle qu'elle existe aujourd'hui (migration
`20260729000184_purge_entreprise_supprimee.sql`, script
`scripts/purger-entreprise.mjs`) ET les défauts confirmés qui la rendent
inutilisable telle quelle pour une entreprise ayant un historique comptable ou
de paie réel — c'est-à-dire la quasi-totalité des entreprises pour lesquelles
la règle de rétention de 10 ans existe. Voir
`docs/qualification/ELSATIA_RGPD_PURGE_END_TO_END_V1.md` pour la preuve
complète, table par table, sur données réelles.

Ce runbook s'adresse à l'opérateur plateforme habilité (jamais en self-service —
voir §Sécurité). Toute exécution contre une base de production doit être
précédée d'une revue par Julien des points marqués **BLOQUANT**.

## 0. Pré-requis

- Accès `SUPABASE_SERVICE_ROLE_KEY` et `NEXT_PUBLIC_SUPABASE_URL` de
  l'environnement cible.
- `suppression_prevue_at` doit être renseigné et échu sur l'entreprise cible
  (`demander_suppression_entreprise` l'a positionné à J+30 lors de la demande ;
  ce runbook ne couvre pas cette étape, antérieure).
- **BLOQUANT — confirmer AVANT toute purge réelle** que l'entreprise cible n'a
  aucune donnée dans les tables suivantes, ou accepter consciemment qu'elle ne
  pourra structurellement pas être totalement purgée (voir §5 Cas bloqués) :
  `factures` (référence `clients`/`chantiers`/`devis`), `bulletins_paie` et
  `ordres_virements` (référencent `employes`/`fournisseurs`/`notes_frais`/
  `depenses_fournisseurs`).

## 1. Dry-run (rapport de simulation, non destructif)

```
node scripts/purger-entreprise.mjs <entreprise_id>
```

Affiche : tables qui seraient purgées (DELETE) avec nombre de lignes, tables
conservées (RETAIN) avec nombre de lignes, fichiers Storage qui seraient
supprimés par bucket. **Rien n'est supprimé.** Faire relire ce rapport par un
second opérateur avant de continuer — en particulier vérifier que le nombre de
lignes DELETE/RETAIN correspond à ce qui est attendu pour cette entreprise.

## 2. Backup

**BLOQUANT — aucune procédure de backup n'est documentée ni automatisée par ce
lot.** Avant toute purge réelle en production, prendre un backup restaurable de
la base (le mécanisme de backup de l'hébergeur Supabase de production, hors
périmètre de cette qualification locale) et vérifier qu'il couvre bien
l'entreprise cible. La purge est irréversible (voir §6).

## 3. Purge réelle

```
node scripts/purger-entreprise.mjs <entreprise_id> --confirmer
```

Comportement observé (qualification E2E, données réelles) :
- Purge table par table dans l'ordre alphabétique renvoyé par
  `rapport_purge_entreprise` — **pas un ordre de dépendances**. S'arrête à la
  première table en échec (violation de contrainte FK) et affiche
  `ÉCHEC sur <table> : <raison>`.
- Chaque table réussie est réellement supprimée (vérifié) et le message
  `OK  <table>` s'affiche.
- **Le script s'arrête net dès la première table qui échoue** ; il ne
  continue pas sur les tables suivantes de la liste.

## 4. Retry (rejeu après échec)

Relancer exactement la même commande (`--confirmer`). Le rapport dynamique
(`rapport_purge_entreprise`) ne recompte que les lignes encore présentes, donc
les tables déjà vidées disparaissent naturellement du rapport suivant — rejouer
est sûr au niveau ligne (aucun risque de double-suppression dangereuse,
confirmé par test direct : appeler `purger_table_entreprise` sur une table déjà
vide renvoie `0`, sans erreur).

**Limite confirmée** : si la table en échec est bloquée pour une raison
structurelle (voir §5), rejouer produit exactement le même échec, indéfiniment.
Le script ne propose aucune stratégie de contournement automatique.

**Limite confirmée sur la traçabilité** : `purge_entreprises_progres` (la table
de suivi elle-même) est traitée comme une table métier ordinaire par le
mécanisme dynamique et finit purgée dans le même run qui l'alimente — l'historique
des succès d'un run antérieur peut disparaître avant que l'opérateur ait pu le
consulter. Ne pas se fier à cette table comme unique preuve d'exécution :
conserver systématiquement la sortie stdout complète du script (voir §7
Evidence).

## 5. Cas bloqués — pas de solution par simple rejeu

Confirmé sur un jeu de données réaliste (voir rapport de qualification, F3/F5/F6) :
les tables suivantes ne peuvent **jamais** être purgées par ce mécanisme tant que
l'entreprise a un historique réel dans les tables conservées correspondantes,
quel que soit l'ordre ou le nombre de tentatives :

| Table bloquée | Bloquée par (table conservée) | Nature |
|---|---|---|
| `clients` | `factures.client_id` (RESTRICT) | FK — voir F3 |
| `chantiers`, `devis` | `factures.chantier_id`/`devis_id` (NO ACTION) | FK — voir F3 |
| `employes` | `ordres_virements.employe_id`, `bulletins_paie.employe_id` (RESTRICT) | FK — voir F3 |
| `fournisseurs` | `ordres_virements.fournisseur_id` (RESTRICT), et via `depenses_fournisseurs` | FK — voir F3 |
| `notes_frais` | `ordres_virements.note_frais_id` (RESTRICT) | FK — voir F3 |
| `depenses_fournisseurs` | `ordres_virements.depense_fournisseur_id` (RESTRICT) | FK — voir F3 |
| `journal_audit_paie`, `dossiers_paie_salaries`, `periodes_paie` | trigger `journal_paie_immuable` | immuabilité — voir F5 |
| `signatures_documents` | trigger `signature_document_immuable` | immuabilité — voir F6 |

Pour ces tables, la seule voie actuelle est une **décision juridique et
technique explicite de Julien** (arbitrage entre le droit à l'effacement et
l'obligation de conservation ~10 ans), suivie d'un correctif de schéma — hors
périmètre de cette qualification (qui ne prend aucune décision juridique
nouvelle, conformément à sa mission).

## 6. Cas d'irréversibilité (rollback impossible)

- Toute ligne supprimée par `purger_table_entreprise` l'est définitivement —
  aucune corbeille, aucun `deleted_at`. Seul un restore de backup permet de
  revenir en arrière (voir §2).
- Toute suppression Storage (`supabase.storage.from(bucket).remove()`) est
  définitive côté objet — confirmé (fichiers réellement supprimés du disque
  dans cette qualification).
- `marquer_entreprise_purgee` anonymise la ligne `entreprises` (nom, SIRET,
  adresse, assurances) de façon définitive et marque `purgee_at` — aucune
  fonction de restauration n'existe.
- **Défaut confirmé (F8)** : purger `devis` met silencieusement à `NULL`
  `factures.devis_origine_id` sur toutes les factures conservées qui en avaient
  un (`ON DELETE SET NULL`) — cette perte de traçabilité comptable est
  elle-même irréversible et n'est précédée d'aucune confirmation ni d'aucun
  avertissement.

## 7. Verify (vérification post-purge)

Après une purge (partielle ou complète), vérifier :
1. `select * from rapport_purge_entreprise('<id>')` : les tables encore
   listées en DELETE avec des lignes restantes sont soit en attente de rejeu,
   soit structurellement bloquées (§5).
2. `select * from lister_fichiers_storage_entreprise('<id>')` : doit être vide
   si le retrait Storage a réussi.
3. **Recherche de références mortes (confirmée nécessaire)** : pour les tables
   bloquées en §5, les colonnes `*_storage_path` (ex. `employes.photo_storage_path`,
   `notes_frais.justificatif_storage_path`, `signatures_documents.signature_storage_path`)
   peuvent pointer vers des fichiers déjà supprimés du Storage. Aucune requête
   de nettoyage n'existe aujourd'hui pour ce cas — à faire manuellement/au cas
   par cas tant que §5 n'est pas résolu.
4. Conserver la sortie stdout complète de l'exécution comme preuve (voir §8).

## 8. Evidence (preuve d'exécution à conserver)

Étant donné le défaut F4 (la table `purge_entreprises_progres` peut s'auto-purger
en cours de run), la preuve d'exécution fiable est aujourd'hui, dans l'ordre de
préférence :
1. La sortie stdout complète du script, horodatée et archivée hors base
   (`node scripts/purger-entreprise.mjs ... --confirmer 2>&1 | tee purge-<entreprise>-<date>.log`).
2. Le rapport de simulation (§1) exécuté juste avant, comme preuve de l'état
   initial.
3. `purge_entreprises_progres`, en sachant qu'elle peut être incomplète (F4).

## 9. Sécurité

Confirmé par test direct (anon / authenticated / aucune clé) : seul
`service_role` peut exécuter `purger_table_entreprise`, `marquer_entreprise_purgee`,
`rapport_purge_entreprise` et `lister_fichiers_storage_entreprise` — toute
autre tentative échoue avec `permission denied`. La demande de suppression
(`demander_suppression_entreprise`) reste self-service pour un admin
(`gerer_parametres`) ; la purge effective ne l'est jamais.
