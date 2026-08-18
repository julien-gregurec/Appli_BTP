# COMMANDES FOURNISSEURS V1 — Audit de l'existant

Audit réalisé en lecture seule, worktree `liria-codex`, branche `claude/commandes-fournisseurs-v1-audit`, base `claude/rentabilite-v1c-previsionnel` (commit `3843a7f` — inclut RENTABILITÉ-V1/V1B/V1C, C6-B, ADMIN-V1, PROMO-V1, TARIFS-V2). Aucun code modifié.

## Constat principal

**Le module Commandes fournisseurs est déjà fonctionnellement complet.** Il ne s'agit pas d'un module partiel à finir — c'est un module abouti, déjà noté « Fonctionnel » dans l'audit RENTABILITÉ-V1 (§11), qui a simplement été audité une deuxième fois ici avec un focus dédié. Tous les points de la checklist demandée existent déjà et sont correctement implémentés.

## Checklist demandée, point par point

| Demandé | État | Preuve |
|---|---|---|
| Création commande | ✅ Fait | `creerCommandeAction` → RPC `creer_commande_fournisseur` (security definer, gardée par `gerer_achats`) |
| Fournisseur | ✅ Fait | `fournisseur_id` obligatoire (FK composite `+entreprise_id`), CRUD fournisseur complet (`creerFournisseurAction`, `modifierFournisseurAction`, `changerActivationFournisseurAction`, `creerFournisseurRapideAction`) |
| Chantier | ✅ Fait | `chantier_id` optionnel, FK composite `+entreprise_id`, `ON DELETE SET NULL` |
| Lignes / quantités / prix | ✅ Fait | `lignes_commande` (désignation, description, quantité, unité, prix unitaire HT, taux TVA, ordre), recalcul automatique des totaux par trigger (`trg_recalc_commande`) |
| Date de commande | ✅ Fait | `date_commande`, défaut `current_date` |
| Livraison prévue | ✅ Fait | `date_livraison_prevue`, contrainte `>= date_commande` |
| Statuts | ✅ Fait | `brouillon → envoyee → confirmee → recue_partiel/recue → annulee`, machine à états stricte, **revalidée côté RPC** (pas seulement côté action serveur — défense en profondeur) |
| PDF bon de commande | ✅ Fait | `src/app/imprimer/commandes/[id]/page.tsx` |
| Réception partielle/totale | ✅ Fait | `enregistrer_reception_commande` : quantité reçue validée serveur (`0 ≤ quantité_reçue ≤ quantité commandée`), passage automatique `recue_partiel`/`recue` selon complétude, `changer_statut_commande('recue')` force toutes les lignes à quantité pleine si utilisé directement |
| Liaison propre avec coût chantier et rentabilité, sans double comptage | ✅ Déjà correcte, par construction | `commandes_fournisseurs`/`lignes_commande` ne sont **jamais lus** par `calculerRentabiliteChantiers`/`calculerPrevuRealiseChantiers` (vérifié par grep exhaustif sur `src/lib/rentabilite.ts`) — seul `depenses_fournisseurs` (la facture fournisseur réelle) est consommé. Le lien `depenses_fournisseurs.commande_id` sert uniquement à la traçabilité/cohérence (`trg_verifier_depense_fournisseur` vérifie que la facture correspond au même fournisseur et hérite le chantier de la commande si absent) — **jamais à additionner un montant deux fois**. |

## Ce qui est solide (au-delà de la checklist demandée)

- **Numérotation déterministe** : `next_reference(entreprise_id, 'commande-AAAA', 'CMD', 3, true)`, même compteur que celui déjà validé par les scripts de seed (`compteurs_reference`).
- **RLS complète et cohérente avec le reste du codebase** : policy permissive de base (`est_membre_actif`) + policies RESTRICTIVE par permission (`acces_achats` lecture, `gerer_achats` écriture) sur `commandes_fournisseurs` ET `lignes_commande`.
- **Sécurité en profondeur sur les RPC** : pattern `_interne` (logique) + wrapper public revoke/grant, identique au reste de l'application (ex. `enregistrer_reception_commande_interne` révoqué de `public`/`anon`/`authenticated`, seul le wrapper `enregistrer_reception_commande` est exécutable).
- **Validation serveur redondante** : les quantités de réception et les transitions de statut sont vérifiées à la fois dans l'action serveur (`src/app/actions/commandes.ts`) ET dans la fonction RPC elle-même — un appel direct à l'API ne peut pas contourner les règles métier.
- **Suppression restreinte** : seules les commandes `brouillon`/`annulee` sont supprimables.
- **Navigation correctement câblée** : `/commandes` dans le groupe `achats_stock`, gardé par `acces_achats`.
- **Traçabilité auteur** : `cree_par_utilisateur_id`/`cree_par_employe_id`.

## Le seul gap réel trouvé

**Aucun test automatisé n'existe pour ce module** — ni Vitest (`src/app/actions/commandes.ts`, `src/lib/commandes.ts`), ni pgTAP (transitions de statut, réception, RLS cross-tenant sur `commandes_fournisseurs`/`lignes_commande`). Le module fonctionne (logique lue et vérifiée par lecture de code, cohérente avec le reste de l'application testée), mais sa correction n'est vérifiée par aucune suite automatisée — contrairement à la quasi-totalité des autres modules commerciaux de l'application. C'est un gap de qualité, pas un gap fonctionnel.

## Point d'attention non bloquant

`bons_livraison` référence `commandes_fournisseurs` en FK optionnelle mais appartient à un flux différent (bons de livraison **client**, signature électronique — utilisé par `src/app/(app)/interventions/page.tsx` et `src/app/actions/signatures-documents.ts`, pas par le module commandes). Aucune confusion trouvée, aucune action nécessaire — noté ici uniquement pour mémoire, au cas où un futur lot toucherait l'un des deux flux.

## Recommandation

Pas de lot de développement nécessaire pour rendre COMMANDES FOURNISSEURS V1 utilisable avant commercialisation — il l'est déjà. Deux options, à ta décision :

1. **Ne rien faire** : le module est fonctionnel, sécurisé, et déjà accessible dans la navigation. Le risque résiduel est uniquement l'absence de filet de sécurité automatisé (une régression future ne serait pas détectée par la CI).
2. **Ajouter uniquement la suite de tests manquante** (Vitest sur les transitions/validations, pgTAP sur RLS cross-tenant + réception), sans toucher au code fonctionnel sauf bug réel découvert en écrivant ces tests. C'est un lot court, à périmètre strict, qui n'ajoute aucune fonctionnalité.

Aucune des deux options ne nécessite Commandes fournisseurs comme un « vrai lot de développement » au sens où l'entend la feuille de route — le travail de fond a déjà été fait avant cette session.
