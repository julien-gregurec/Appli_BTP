# COMMANDES-FOURNISSEURS-V1B — Filet de sécurité automatisé

Référence : `docs/commercial/COMMANDES_FOURNISSEURS_V1_AUDIT_ELSATIA.md` (audit initial — module déjà fonctionnellement complet, seul gap identifié : aucun test automatisé). Ce lot ajoute exclusivement les tests manquants. **Aucun fichier fonctionnel n'a été modifié** (`git status` sur ce lot : 2 fichiers de test ajoutés, 0 fichier existant touché).

Branche : `claude/commandes-fournisseurs-v1b-tests` (depuis `claude/commandes-fournisseurs-v1-audit`, commit `ff311a6`).

## Tests existants trouvés (pour éviter toute duplication)

- `isolation_multitenant_comportement.test.sql` / `isolation_multitenant_roles.test.sql` : couvraient déjà le SELECT cross-tenant sur `commandes_fournisseurs` (admin A/B, comptable A/B).
- `actions_nom_propre.test.sql` : vérifiait déjà l'existence des colonnes de traçabilité auteur (`cree_par_utilisateur_id`, `cree_par_employe_id`).
- Aucune couverture existante sur `lignes_commande`, les RPC (`creer_commande_fournisseur`, `changer_statut_commande`, `enregistrer_reception_commande`), la machine à états, la réception, ou le lien avec la rentabilité.

Ce lot **ne duplique pas** les tests existants — il complète uniquement les zones non couvertes.

## Tests ajoutés

### `supabase/tests/commandes_fournisseurs_v1b.test.sql` (43 assertions pgTAP)

- **Gap comblé** : SELECT cross-tenant sur `lignes_commande` (non testé avant).
- **INSERT/UPDATE/DELETE cross-tenant** sur `commandes_fournisseurs`, vérifiés en contexte superuser après tentative (pas depuis le point de vue de l'attaquant lui-même — cette erreur de méthode a été détectée et corrigée pendant l'écriture des tests, voir « Bug détecté » ci-dessous).
- **RPC `creer_commande_fournisseur`** : refus cross-tenant (`p_entreprise_id` d'une autre entreprise), fournisseur d'un autre tenant refusé, chantier d'un autre tenant refusé, lignes invalides refusées (désignation vide, quantité nulle, prix négatif), création valide avec calcul de totaux vérifié au centime (5×10 + 2×20 HT, TVA 20 %, TTC).
- **Machine à états** (`changer_statut_commande`) : `brouillon→envoyee` autorisé, `envoyee→brouillon` refusé (pas de retour arrière arbitraire), `envoyee→confirmee` autorisé, `confirmee→recue` (forcé) autorisé et fige toutes les lignes à quantité pleine, une commande `recue` n'a plus aucune transition possible.
- **Réception** : partielle (4/10 sur une ligne → `recue_partiel`), sur-réception refusée (11 sur 10), réception complémentaire cumulée (10/10 + 3/3 sur deux lignes → `recue`), chaque ligne conserve son propre suivi indépendamment.
- **Annulation** : une commande annulée ne peut plus être réceptionnée ; aucune dépense fournisseur n'est jamais créée automatiquement par une commande (créée ou annulée) — vérifié par comptage explicite.
- **Rentabilité, test critique (§16 du cahier des charges)** : une commande seule (sans dépense réelle) n'ajoute aucun coût au chantier ; la dépense fournisseur réelle correspondante compte le coût une seule fois ; le lien `commande_id` trace la relation sans dupliquer l'agrégat (une seule ligne de dépense par commande).
- **Rapprochement dépense↔commande** : une dépense ne peut pas se rattacher à une commande d'un fournisseur différent (garde-fou déjà en place, testé ici).
- **Permissions** : un salarié terrain sans `gerer_achats`/`acces_achats` ne peut ni lire ni créer de commande (RPC refusée).
- **RPC cross-tenant** : `changer_statut_commande` et `enregistrer_reception_commande` refusent tous deux un appel avec `p_entreprise_id` d'une autre entreprise.
- **Requête utilisée par la page d'impression** (`lignes_commande` filtré par `commande_id` seul, sans `entreprise_id` explicite dans le `WHERE`) : confirmé protégée par RLS pour un autre tenant, fonctionnelle pour le propriétaire légitime — ce test reproduit exactement le motif de requête utilisé par `src/app/imprimer/commandes/[id]/page.tsx`, sans modifier ce fichier.

### `src/lib/commandes.test.ts` (9 tests Vitest)

Logique pure côté client, non couverte par pgTAP :
- `statutCommande` (résolution par clé, repli sur `brouillon` si clé inconnue).
- **La machine à états `TRANSITIONS_COMMANDES` est figée telle qu'elle existe aujourd'hui**, avec un commentaire explicite qu'elle doit rester synchrone avec `changer_statut_commande_interne` côté base — une divergence future entre le client et le serveur serait détectée par ce test.
- `statutsCommandeAccessibles` (statut courant + transitions autorisées, jamais plus).
- `totauxCommande` : ligne unique, plusieurs lignes à taux de TVA différents, aucune ligne (0).

## Scénario fictif complet (§23 du cahier des charges)

Documenté et vérifié via la combinaison des tests de réception et de rentabilité ci-dessus plutôt que dupliqué dans un test monolithique séparé :

```
Fournisseur A (ab000000...) → Chantier A (a4000000...) → Commande (2 lignes : 10u @ 5€ HT, 3u @ 8€ HT)
  → envoyee → réception partielle ligne A (4/10) → statut recue_partiel
  → réception complémentaire (10/10 + 3/3) → statut recue
  → commande séparée (1 ligne, 500€ HT) rattachée au même chantier, sans dépense réelle
    → coût réel chantier = 0 € (la commande seule ne compte pas)
  → dépense fournisseur réelle créée, rattachée via commande_id, montant_ht = 500€
    → coût réel chantier = 500 € (une seule fois, jamais 1000€)
```

## Bug détecté et corrigé pendant l'écriture des tests (dans les tests, pas dans le code)

En écrivant les tests UPDATE/DELETE cross-tenant, la première version vérifiait le résultat **depuis le point de vue de l'attaquant lui-même** (`admin-b`) — une erreur de méthode : RLS masque de toute façon la ligne à `admin-b` en lecture, donc un test `select count(*) ... = 0` aurait été vrai que la modification ait réussi ou échoué, sans rien prouver. Détecté en exécutant la suite (le test échouait de façon inattendue sur la suppression), corrigé en vérifiant systématiquement depuis un contexte capable de voir la ligne (superuser), avant de rebasculer sur le rôle testé. Aucun code applicatif n'était en cause — uniquement la méthode de test.

## Non-régression

- RENTABILITÉ-V1B/V1C : suite `rentabilite.test.ts` (22 tests) et `rentabilite_v1b_p0.test.sql`/`rentabilite_v1c_previsionnel.test.sql` toujours au vert, inchangés.
- Aucun fichier de C6-B/ADMIN-V1/PROMO-V1/TARIFS-V2/auth n'a été touché.

## Qualité

`npm run typecheck` (0 erreur), `npm run lint` (0 erreur, 3 avertissements `<img>` préexistants hors périmètre), `npm run test` (342/342), `npm run test:db` (408/408 assertions pgTAP, dont les 43 nouvelles + les 9 déjà existantes sur `commandes_fournisseurs`), `npm run build` (réussi). Aucun secret dans le diff. **Aucune migration** — le schéma n'a pas changé.

## Déploiement

Aucun code applicatif modifié → aucun déploiement Preview nécessaire (conforme à la consigne du lot : ne pas déployer « pour le principe »). Les tests Local/DB suffisent à prouver la couverture.

## Bugs réels découverts dans le module lui-même

Aucun. Le comportement observé pendant l'écriture des 43 + 9 tests correspond exactement à ce que l'audit initial avait décrit par lecture de code — aucune divergence, aucune régression, aucune correction fonctionnelle nécessaire.
