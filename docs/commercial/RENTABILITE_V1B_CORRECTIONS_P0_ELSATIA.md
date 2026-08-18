# RENTABILITÉ-V1B — Correction des 3 P0 de l'audit RENTABILITÉ-V1

Référence : `docs/commercial/RENTABILITE_V1_AUDIT_ELSATIA.md` (constats), `docs/commercial/RENTABILITE_V1_CHECKLIST.md` (suivi). Ce lot corrige exclusivement les 3 écarts classés P0. Aucun P1/P2/P3 n'a été traité — ils restent listés dans la checklist, à dessein.

Branche : `claude/rentabilite-v1b-p0` (depuis `9098a27`, audit RENTABILITÉ-V1). Commit dédié : `fix(rentabilite): unifier marge et historiser cout horaire`.

## 1. P0 #1 — Formule de marge unifiée

**Avant** : trois implémentations indépendantes du même calcul.
- `src/lib/rentabilite.ts` (`calculerRentabiliteChantiers`, consommée par le copilote IA) — formule réduite à 4 postes, sans filtre de statut sur les pointages (incluait les pointages rejetés/non vérifiés).
- `src/app/actions/rentabilite.ts` (`analyserRentabiliteIAAction`) — formule complète à 7 postes, filtrée `verification_statut='valide'`.
- `src/app/(app)/rentabilite/page.tsx` — copie quasi identique de la précédente (8 requêtes dupliquées).

**Après** : `src/lib/rentabilite.ts` est la seule implémentation. `src/app/actions/rentabilite.ts` et la page `/rentabilite` l'appellent et se contentent de mettre en forme le résultat. Le copilote IA (`src/lib/ai/copilote.ts`) en bénéficie automatiquement sans modification de sa propre logique.

Formule canonique :

```
marge = factureHt − coutMainOeuvre − coutAchats − coutSousTraitance
        − coutIndemnitesPaie − coutStock − coutNotesFrais
```

- `factureHt` : factures hors statuts `annulee`/`avoir_emis`.
- `coutMainOeuvre` : somme des heures de pointages **`verification_statut='valide'`** uniquement, valorisées au coût horaire **figé sur le pointage** (voir P0 #3), avec repli sur le coût courant si aucun snapshot n'existe.
- `coutAchats`/`coutSousTraitance` : `depenses_fournisseurs` hors statut `annulee`, séparés par `categorie`.
- `coutIndemnitesPaie` : RPC `couts_indemnites_paie_par_chantier`.
- `coutStock` : sorties de `mouvements_stock` valorisées au prix d'achat HT de l'article.
- `coutNotesFrais` : notes de frais aux statuts comptables (`valide`, `exporte_comptabilite`, `verrouille`, `archive`, `validee`, `remboursee`), en **TTC** — limite connue et **non corrigée dans ce lot** (voir §5), `notes_frais` n'a structurellement aucune colonne `montant_ht`.
- `budgetHt` (devis acceptés) est calculé et exposé, mais **jamais soustrait de la marge** — c'est une information d'affichage, pas une comparaison prévu/réalisé (absente, P1).

## 2. P0 #2 — RLS de `employes.cout_horaire`

**Avant** : `employes.cout_horaire` était lisible par tout salarié authentifié membre actif de l'entreprise (policy `est_membre_actif` sans permission), le masquage `voir_cout_interne_employe` n'existant qu'en JSX — contournable par un appel direct à l'API PostgREST.

**Décision architecturale** : impossible de protéger une seule colonne d'une table par ailleurs largement accessible (nom, poste, contact...) via RLS seule ; un `REVOKE` de colonne casserait toute page qui sélectionne `employes.*`. La colonne est donc isolée dans une table dédiée, suivant le même schéma que les autres modules sensibles (`20260718000113_lecture_modules_selon_permissions.sql`).

Migration `supabase/migrations/20260818000205_securiser_cout_horaire_employe.sql` :
- Nouvelle table `employes_cout_horaire (employe_id pk, entreprise_id, cout_horaire, updated_at)`, FK composite `(employe_id, entreprise_id) → employes(id, entreprise_id)`.
- Backfill 1:1 depuis `employes.cout_horaire` avant suppression de la colonne.
- RLS activée : policy permissive d'écriture (`est_membre_actif`, même périmètre que `employes` — le contrôle fin `gerer_employes` reste au niveau des Server Actions, comme pour le reste de la fiche employé) + policy **restrictive** de lecture (`voir_cout_interne_employe` OU `acces_rentabilite`, ce dernier pour que l'écran de rentabilité et l'IA restent fonctionnels indépendamment du droit d'affichage sur la fiche employé).
- `alter table employes drop column cout_horaire`.

### Permission matrix vérifiée (pgTAP, cross-tenant réel)

| Poste | Lecture `employes_cout_horaire` |
|---|---|
| Terrain (Ouvrier) | Non |
| Chef d'équipe (sans droit financier dans le modèle de permission testé) | Non |
| Conducteur de travaux (sans droit financier) | Non |
| Comptable (`acces_rentabilite`, sans `voir_cout_interne_employe`) | Oui — via `acces_rentabilite` |
| Administrateur/Dirigeant (toutes permissions) | Oui |
| Entreprise différente (cross-tenant) | Non, y compris en lecture ciblée par `employe_id` |

**Écriture** : au même périmètre que `employes` elle-même (tout membre actif, contrôle fin au niveau Server Action) — ce n'est pas un relâchement introduit par ce lot, c'est le pattern déjà en vigueur sur `employes` (`20260710000010_employes.sql`), volontairement non durci ici pour rester dans le périmètre strict des 3 P0.

### Bug réel détecté et corrigé pendant l'implémentation

Le premier jet de la migration créait la table et les policies RLS mais **omettait le `GRANT` de base** sur `employes_cout_horaire` à `authenticated` — les policies RLS ne suffisent pas, sans grant la table est totalement inaccessible (`permission denied for table employes_cout_horaire`), y compris pour un utilisateur légitime. Détecté par le test pgTAP nouvellement écrit (pas par une vérification manuelle), corrigé avant tout déploiement Preview.

## 3. P0 #3 — Historisation du coût horaire

**Avant** : les trois formules joignaient en direct `pointages → employes.cout_horaire` : changer le salaire d'un employé aujourd'hui recalculait silencieusement la rentabilité de **tous ses chantiers passés**.

**Modèle choisi** : snapshot sur le pointage (option A du cahier des charges), pas de table d'historique daté séparée. Justification : plus simple, et surtout **aucune action de modification d'un pointage déjà validé n'existe dans l'application** (seules existent la suppression et une nouvelle déclaration, qui redéclenche naturellement une validation et donc un nouveau snapshot au coût alors en vigueur) — confirmé par recherche de code avant de choisir ce modèle, pas supposé.

Migration `supabase/migrations/20260818000206_historiser_cout_horaire_pointage.sql` :
- Nouvelle colonne `pointages.cout_horaire_applique numeric`.
- Backfill des pointages déjà validés : coût **actuel** appliqué comme meilleure approximation disponible. **Limite assumée et documentée** : pour un pointage ancien dont le salaire a changé depuis, cette approximation peut différer de la réalité historique. Acceptable pour Local/Preview (aucune donnée réelle) ; ne jamais reproduire cette approximation comme précision historique en Production sans le dire explicitement.
- `valider_preuve_pointage()` réécrite : au moment où `p_statut='valide'`, lit le coût courant dans `employes_cout_horaire` et le fige dans `cout_horaire_applique`. Rejet (`rejete`) : aucun coût capturé. Le reste de la fonction (contrôle de permission, motif de rejet obligatoire, `verification_par`) est inchangé.
- `calculerRentabiliteChantiers` utilise `cout_horaire_applique` en priorité, avec repli sur le coût courant uniquement si aucun snapshot n'existe (pointage jamais repassé par le backfill) — plutôt qu'un coût compté à 0, avec un indicateur `coutHoraireManquant` exposé.

### Régression détectée et corrigée pendant l'implémentation

La réécriture de `valider_preuve_pointage()` a été construite à partir de sa version précédente (`20260713000065`), qui accordait `EXECUTE` à `anon` en plus de `authenticated`. Une migration ultérieure et distincte (`20260714000078_fermeture_acces_anonyme_production.sql`) avait **déjà révoqué** cet accès anonyme sur toutes les fonctions `SECURITY DEFINER` existantes à l'époque — `valider_preuve_pointage` n'était donc **plus** exécutable par `anon` avant ce lot. En recopiant l'ancien `GRANT ... TO anon, authenticated`, la première version de la migration 206 **rouvrait involontairement** cet accès anonyme. Détecté par le test de surface pgTAP existant (`isolation_multitenant_surface.test.sql`, assertion « aucune fonction SECURITY DEFINER métier n'est exécutable par anon »), qui a viré au rouge après application de la migration — pas anticipé, découvert par la suite de tests. Corrigé : le grant ne porte plus que sur `authenticated`.

## 4. Tests

### Unitaires (`src/lib/rentabilite.test.ts`, 13 tests, mock du client Supabase)
Scénario de référence du cahier des charges (CA 10 000 €, MO 2 000 €, achats 3 000 € → marge 5 000 €, taux 50 %), sous-traitance distincte des achats, notes de frais TTC, sorties de stock valorisées, indemnités de paie, exclusion facture annulée/avoir émis, `budgetHt` calculé mais jamais soustrait, priorité au coût figé sur le coût courant, repli sur le coût courant si absence de snapshot, `coutHoraireManquant` si aucun coût disponible, filtre `verification_statut='valide'`, isolation multi-chantier, absence de dérive d'arrondi sur montants décimaux.

### Base de données (`supabase/tests/rentabilite_v1b_p0.test.sql`, 22 assertions pgTAP, exécution réelle contre Postgres)
Schéma (colonne retirée/ajoutée, RLS active), permission matrix complète (admin/comptable/ouvrier/chef d'équipe/conducteur/cross-tenant, y compris lecture ciblée par id — équivalent d'un accès API direct), historisation (coût figé à la validation, pointage déjà validé insensible à un changement de salaire ultérieur, nouveau pointage capture le nouveau coût, rejet ne capture aucun coût, suppression d'un pointage non validé), régression anon corrigée (`throws_ok` sur exécution anonyme).

### Dynamique — chantier fictif « Audit Rentabilité P0 »
Construit en Local avec l'ensemble des postes de coût (facture 10 000 € HT payée + facture annulée 500 € HT exclue, devis accepté 8 000 € HT jamais soustrait, 100 h de MO à 20 €/h figées = 2 000 €, achats 3 000 €, sous-traitance 1 000 €, stock 10 × 5 € = 50 €, notes de frais 100 €, pointage rejeté exclu). Résultat de la **vraie fonction** `calculerRentabiliteChantiers` interrogée contre la **vraie base Postgres locale** (pas un mock) :

| Poste | Attendu | Obtenu |
|---|---|---|
| factureHt | 10 000 | 10 000 |
| coutMainOeuvre | 2 000 | 2 000 |
| coutAchats | 3 000 | 3 000 |
| coutSousTraitance | 1 000 | 1 000 |
| coutStock | 50 | 50 |
| coutNotesFrais | 100 | 100 |
| budgetHt (non soustrait) | 8 000 | 8 000 |
| **marge** | **3 850** | **3 850** |
| **taux** | **38,5 %** | **38,5 %** |

Conforme au chiffre près. Le même chantier a été reconstruit à l'identique en Preview (entreprise « ELSATIA — Recette Preview ») pour la vérification visuelle humaine (§6).

### Divergence entre consommateurs
Éliminée structurellement : il n'existe plus qu'une seule implémentation, consommée par la page, l'action IA et le copilote — un test comparatif entre 3 implémentations n'a plus de sens puisqu'il n'y en a plus qu'une. `src/lib/ai/copilote.ts` n'a été modifié que dans la description de l'outil exposé au modèle (mention des postes de coût désormais complets) ; sa fonction d'appel déléguait déjà à `calculerRentabiliteChantiers` et en bénéficie automatiquement.

### Non couvert dans ce lot
- Pas de test de charge dédié (volume de pointages/dépenses) — l'agrégation reste en mémoire, sans pagination, déjà noté P2 dans l'audit et non traité ici.
- Pas de re-test manuel supplémentaire des permissions IA au-delà de la matrice pgTAP : le copilote appelle la même fonction sous la même session authentifiée que le reste de l'application, donc soumis aux mêmes RLS ; aucune surface spécifique à l'IA n'a été modifiée.

## 5. Non traité dans ce lot (P1, rappel explicite)

Ces écarts restent ouverts, listés dans `RENTABILITE_V1_CHECKLIST.md`, non touchés par construction (hors périmètre du prompt) :
- `chantiers.budget_previsionnel` non relié aux devis acceptés (deux notions de « budget » disjointes).
- Aucun concept d'avenant (un nouveau devis sur le même chantier reste la méthode de fait, non documentée officiellement comme telle).
- RLS de `mouvements_stock` non durcie (lisible par tout membre actif sans permission).
- Garde-fou de surfacturation partiel (ne tient pas compte de `situations_travaux`).
- Achats engagés (commandes non facturées) et sous-traitance prévisionnelle non intégrés à un calcul de coûts prévus.
- Aucune comparaison prévu/réalisé sur `/rentabilite`.
- `coutNotesFrais` reste en TTC (seul poste dans ce cas) — `notes_frais` n'a structurellement aucune colonne `montant_ht`, correction hors périmètre P0.

## 6. Déploiement

- **Local** : `supabase migration up --local` — schéma, backfill (1:1, 0 écart) et RLS vérifiés directement en base (`psql` via `docker exec`).
- **Preview** (`elsatia-preview`, projet `pgvvpqyjziyapbbkydmc`) : les deux migrations appliquées **isolément** via `supabase db query --linked --file ...` puis enregistrées dans l'historique via `supabase migration repair --linked --status applied` — jamais via `db push`/`migration up` globaux, pour ne pas entraîner l'application de `20260812000200` (gap volontaire et documenté depuis C6-B, hors périmètre de ce lot). Vérifié après coup : colonne supprimée, table créée, RLS active, backfill 25/25, `20260812000200` toujours absente.
- **Production** : **aucune action**, conformément au périmètre imposé.
- Déploiement Preview de la branche : `dpl_135LM1dt66xKu1eUi8CYdmavEfzs`, `https://elsatia-preview-n4t9edn44-julien-gregurec1.vercel.app`. `/login` vérifié accessible sans erreur.
- Chantier fictif « Audit Rentabilité P0 » reconstruit à l'identique dans l'entreprise « ELSATIA — Recette Preview » pour permettre une vérification visuelle humaine (compte `julien.gregurec@gmail.com`, poste Gérant).

## 7. Qualité

`npm run typecheck` (0 erreur), `npm run lint` (0 erreur, 3 avertissements `<img>` préexistants hors périmètre), `npm run test` (324/324), `npm run test:db` (357/357 assertions pgTAP, incluant les 22 nouvelles), `npm run build` (réussi, toutes les routes listées). Scan de secrets sur le diff : aucun trouvé.

## 8. Non-régression

Aucun fichier des lots TARIFS-V2/ADMIN-V1/PROMO-V1/C6-B/AUTH-RECOVERY-V1 modifié. Leurs suites de tests dédiées (`admin_v1_roles_plateforme.test.sql`, `c6b_premier_client.test.sql`, `promo_v1_administration_commerciale.test.sql`, `tarification.test.ts`, `auth.test.ts`, `auth-erreurs.test.ts`, `auth-redirects.test.ts`, `plateforme-auth.test.ts`) passent toutes dans les suites complètes ci-dessus.
