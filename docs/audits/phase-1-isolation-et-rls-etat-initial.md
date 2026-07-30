# Phase 1 — État initial isolation multi-entreprises et RLS

Date du relevé : 29 juillet 2026
Périmètre : Supabase local et dépôt local uniquement.

## État Git

- Branche : `release/commercialisation-v1`
- Commit de départ : `d59d4c6e5a41d183421ad386294ac60f6d27dc9a`
- Modifications suivies : aucune
- Fichiers non suivis : 17 fichiers, tous conservés sans modification (manuel, visuels, vidéos, sous-titres, fichiers audio/données de montage et script vidéo).

## Résultats de référence

| Contrôle | Résultat initial |
|---|---:|
| TypeScript | Réussi |
| ESLint | 0 erreur, 3 avertissements `<img>` hors périmètre |
| Vitest | 28 fichiers, 104 tests réussis |
| pgTAP | 6 fichiers, 53 tests réussis |

## Surface SQL locale

| Ressource | Nombre |
|---|---:|
| Tables publiques | 143 |
| Tables publiques avec RLS | 142 |
| Policies publiques | 426 |
| Fonctions publiques `SECURITY DEFINER` | 228 |
| Vues publiques | 0 |
| Triggers applicatifs publics | 85 |
| Policies Storage | 29 |
| Buckets Storage | 12 |

La seule table publique sans RLS est `public.compteurs_reference`. Elle doit être auditée en priorité : son absence de `entreprise_id` direct peut être intentionnelle, mais elle ne doit pas devenir une source d’écriture arbitraire ou de fuite de références.

## Buckets Storage

| Bucket | Public | Limite |
|---|---:|---:|
| `bulletins-paie` | non | 20 Mo |
| `chantier-documents` | non | 15 Mo |
| `devis-medias` | non | 20 Mo |
| `documents-employes` | non | 10 Mo |
| `documents-paie` | non | 20 Mo |
| `entreprise-assets` | **oui** | 5 Mo |
| `factures-fournisseurs` | non | 20 Mo |
| `fiches-techniques` | non | 20 Mo |
| `messagerie-medias` | non | 20 Mo |
| `notes-frais` | non | 15 Mo |
| `notes-frais-exports` | non | 250 Mo |
| `pointage-preuves` | non | 10 Mo |

`entreprise-assets` est public. Son contenu et ses chemins doivent être limités à des ressources destinées à l’affichage public (logos et éléments de marque) et ne doivent contenir aucun document métier.

## Rôles réellement définis

Les modèles applicatifs présents sont :

1. Ouvrier
2. Chef d’équipe
3. Chef de chantier
4. Conducteur de travaux
5. Directeur travaux
6. Administration
7. RH
8. Comptable
9. Gérant
10. Administrateur plateforme, géré séparément par `plateforme_admins`

La base reconstruite ne contient pas encore d’instance de poste, car aucun `seed.sql` n’est exécuté après le reset. Les tests de phase créeront les rôles à partir des modèles existants, sans inventer de rôle supplémentaire.

## Modules prioritaires

- entreprises, adhésions, postes et permissions ;
- employés, actions personnelles, planning, pointages et congés ;
- clients, prospects, chantiers, tâches, devis et factures ;
- notes de frais, paie, RIB et documents employés ;
- fournisseurs, commandes, factures fournisseurs et paiements ;
- articles, stock, inventaires, outillage et flotte ;
- messagerie, notifications, documents, médias et IA ;
- rentabilité, exports, abonnement et administration plateforme ;
- routes API, Server Actions, RPC et téléchargements par identifiant direct.

## Anomalies connues au démarrage

1. `public.compteurs_reference` est la seule table publique sans RLS.
2. Le nombre élevé de fonctions `SECURITY DEFINER` (228) impose une revue systématique du `search_path`, des contrôles utilisateur/entreprise et des droits `EXECUTE`.
3. `entreprise-assets` est le seul bucket public.
4. La reconstruction locale ne fournit aucun jeu de données métier par défaut (`supabase/seed.sql` absent).
5. Les tests initiaux couvrent certaines actions personnelles et certains buckets, mais pas encore l’ensemble des 143 tables ni toutes les routes directes.
6. Trois avertissements ESLint liés aux balises `<img>` sont connus et explicitement hors périmètre de cette phase.
