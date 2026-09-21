# `supabase/production/` — scripts de recette, réservés à Preview

Malgré son nom historique, ce dossier ne contient **aucun script destiné à une
vraie base de Production**. Ce sont des scripts SQL manuels (hors du dossier
`supabase/migrations/`, non suivis par l'historique migratoire Supabase) qui
créent, complètent ou nettoient des **données de démonstration et de recette**
sur le projet Preview `elsatia-preview`. Le nom du dossier est un héritage de
l'époque du mode prototype ; il n'a pas été renommé lors de l'audit du
07-08-2026 car plusieurs documents d'archive (`RELAIS_CHATGPT.md`,
`RELAIS_CLAUDE.md`) y font référence sous ce chemin exact et ne doivent pas
être réécrits — voir `docs/organisation/REGISTRE_CENTRAL.md`.

## `ELSATIA PREVIEW ONLY`

La seule cible autorisée pour tous les scripts de ce dossier est le projet
Supabase Preview :

```
pgvvpqyjziyapbbkydmc — ELSATIA PREVIEW ONLY
```

**Aucun script de ce dossier ne doit jamais être exécuté sur un futur projet
Supabase Production**, y compris `elsatia-production` une fois créé. Cette
interdiction ne dépend pas de connaître la référence exacte du futur projet
Production : tout ce qui n'est pas exactement `pgvvpqyjziyapbbkydmc` est
refusé par construction.

## Procédure d'exécution sécurisée

Ne collez jamais directement le contenu d'un de ces fichiers dans un éditeur
SQL. Un commentaire en tête de fichier ne protège personne d'une erreur de
cible. Utilisez systématiquement le wrapper :

```bash
node scripts/executer-script-production.mjs <nom-du-fichier.sql>
```

Ce wrapper (`scripts/executer-script-production.mjs`, logique de vérification
dans `scripts/garde-scripts-production.mjs`) vérifie, avant toute exécution :

1. que le fichier demandé fait partie d'une liste blanche explicite (aucun
   chemin arbitraire n'est accepté) ;
2. que `SUPABASE_PROJECT_REF` **et** l'hôte de `NEXT_PUBLIC_SUPABASE_URL`
   correspondent tous les deux, de façon cohérente, à `pgvvpqyjziyapbbkydmc` ;
3. que le projet réellement lié par la CLI Supabase
   (`supabase/.temp/project-ref`, celui que `--linked` ciblera concrètement)
   correspond lui aussi à `pgvvpqyjziyapbbkydmc` ;
4. pour les scripts destructifs, qu'une variable de confirmation dédiée est
   explicitement définie (voir ci-dessous).

Si l'une de ces vérifications échoue, le script s'arrête (`ARRÊT SÛR : ...`)
avant toute exécution SQL. Aucune de ces vérifications ne dépend d'une valeur
par défaut permissive : une variable absente est toujours un refus.

## Script destructif : `supprimer_entreprises_test.sql`

Ce script supprime des lignes en base (`DELETE`). En plus des vérifications
ci-dessus, il exige :

```bash
CONFIRM_DELETE_TEST_DATA=YES node scripts/executer-script-production.mjs supprimer_entreprises_test.sql
```

Sans cette variable, exactement à cette valeur, le wrapper refuse
l'exécution.

## Scripts non destructifs

`creer_entreprise_demo_18_mois.sql`, `seed_entreprise_test_5_ans.sql`,
`seed_entreprise_test_suivi_terrain.sql`, `seed_entreprise_test_tous_onglets.sql`,
`seed_juju_6_mois.sql`, `corriger_encodage_juju.sql` — ces scripts créent ou
mettent à jour des données ciblées sur des entreprises de recette nommément
identifiées (par référence interne ou par nom exact), sans supprimer de
données existantes. Ils restent malgré tout soumis aux vérifications de cible
1 à 3 ci-dessus : la protection par nom d'entreprise seule ne suffit pas à
garantir qu'on est sur le bon projet Supabase.

## `archive/` — scripts obsolètes, jamais à exécuter

`archive/NE_PAS_EXECUTER_sortie_mode_prototype.sql` : ancien script de sortie
du mode prototype. Confirmé cassé (référence une fonction qui n'existe plus)
et dangereusement obsolète (liste blanche de permissions RPC périmée d'environ
105 fonctions) par l'audit du 07-08-2026 — voir l'en-tête du fichier lui-même
pour le détail complet. Une base Production créée à partir des migrations
actuelles est déjà dans l'état que ce script visait à atteindre. Conservé à
titre d'archive uniquement ; **n'est plus référencé par le wrapper
d'exécution**.
