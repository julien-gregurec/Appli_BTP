# Phase 2 — Rapport intermédiaire migrations 185 à 190

Date : 31 juillet 2026

Environnement : Supabase local isolé `/tmp/liria-phase2-recette-184f`

Production, push, déploiement public et E2E : non utilisés

## Conclusion

Le lot 185–190 est validé sur la recette locale. Les six migrations ont été
appliquées séquentiellement et une seule fois. La base finale s'arrête à 190,
les données témoins sont conservées, les tests SQL, Storage et applicatifs sont
réussis, aucun drift de schéma n'est détecté et le dump pré-185 a été restauré
avec succès après la montée complète.

## Migrations

| Version | Fichier | Résultat |
|---|---|---|
| 185 | `20260729000185_isolation_multitenant_grants_et_definer.sql` | Réussie |
| 186 | `20260729000186_restaurer_privileges_clients_chantiers.sql` | Réussie |
| 187 | `20260729000187_restaurer_execution_fonctions_rls.sql` | Réussie |
| 188 | `20260729000188_isoler_politiques_storage_paie.sql` | Réussie |
| 189 | `20260729000189_restaurer_privileges_modules_metier.sql` | Réussie |
| 190 | `20260729000190_isoler_journal_ia_plateforme.sql` | Réussie |

Historique final : 185 migrations, maximum `20260729000190`, aucune migration
future.

## État final

- 143 tables `public`, 143 avec RLS ;
- 426 policies `public` ;
- 29 policies `storage.objects` ;
- 11 buckets privés ;
- 228 fonctions `SECURITY DEFINER`, toutes avec `search_path` fixé ;
- zéro fonction `SECURITY DEFINER` exécutable par `anon` ;
- `RECETTE_A_ENTREPRISE` et `RECETTE_B_ENTREPRISE` présentes.

## Tests

| Contrôle | Résultat |
|---|---|
| pgTAP | 9 fichiers, 141 assertions réussies |
| Storage | 11 buckets, 87 assertions réussies |
| TypeScript | Réussi |
| ESLint | Réussi, 0 erreur et 3 avertissements historiques `<img>` |
| Vitest | 29 fichiers, 106 tests réussis |
| Build Next.js | Réussi |
| Diff `public,storage` | Aucun changement de schéma inattendu |

Les avertissements lint concernent :

- `src/app/(app)/boutique/[produitId]/page.tsx` ;
- `src/app/(app)/boutique/page.tsx` ;
- `src/components/SignatureEmploye.tsx`.

## Sauvegarde et rollback

Sauvegarde de référence :

`/tmp/liria-phase2-backups/pre-185-20260730/pre-185-full.dump`

SHA-256 :

`1d429b3389c0d9f407d55e0a1ae52f119d5f561217aec2445530e6f904516da1`

Une restauration post-190 a réussi avec `supabase_admin` dans
`liria_phase2_rollback_post190_check`. Elle restitue 179 migrations, un maximum
à 184, aucune migration 185 à 190, les deux entreprises témoins, 143 tables,
426 policies et les schémas `auth`, `public`, `storage`.

Le rôle `postgres` n'est pas adapté à la restauration complète de cette image
locale, car une fonction interne Supabase Realtime fixe
`log_min_messages = fatal`. La restauration de référence doit utiliser
`supabase_admin` avec `--no-owner --no-privileges --exit-on-error`.

## Particularité du test Storage

Un fixture historique insérait les métadonnées de deux objets directement dans
`storage.objects` sans créer leurs fichiers physiques. Pour éviter un faux
échec `ENOENT`, une copie temporaire du fixture sous `/tmp` a omis uniquement
ces deux blocs pendant le test. Aucun fixture versionné n'a été changé. Les
objets du test ont ensuite été créés puis supprimés via l'API Storage ; aucun
artefact `test_storage` ne subsiste.

## Limites et suite

Cette validation couvre les migrations, les invariants de sécurité testés, la
restaurabilité et les contrôles applicatifs statiques/unitaires. Elle ne couvre
pas encore la recette E2E multi-rôles et multi-entreprises. La prochaine étape
peut commencer uniquement après validation explicite de ce rapport.
