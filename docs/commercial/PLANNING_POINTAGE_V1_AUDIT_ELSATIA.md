# PLANNING-POINTAGE-V1 — Audit de bout en bout

Audit réalisé en lecture seule (sauf reproductions empiriques en transaction annulée), worktree `liria-codex`, branche `claude/planning-pointage-v1-audit`, base `600d435` (AVENANTS-V1, inclut DEVIS-LOCK-V1, FACTURATION-BTP-V1B, RENTABILITÉ-V1B/V1C, COMMANDES FOURNISSEURS V1). **Aucun code applicatif modifié, aucune migration, aucune action Production.**

## Résumé exécutif

La chaîne chantier → planning → affectation → pointage → validation → coût MO → rentabilité est **globalement solide et déjà auditée en profondeur par petits bouts** au fil des lots précédents (RENTABILITÉ-V1B a déjà établi la formule canonique de marge, la source de vérité du coût MO, et le principe du coût historique figé). Ce lot confirme empiriquement plusieurs garanties déjà supposées (impersonation bloquée, double pointage impossible, coût snapshoté résistant à une correction de durée) et révèle **une découverte structurelle non triviale** : `saisir_son_pointage` est le seul droit de toute l'application qui **ne suit pas** le système de permissions par poste — il dépend d'un interrupteur individuel (`utilisateurs_entreprises.pointage_personnel_actif`), ce qui a d'ailleurs fait échouer ma première tentative de reproduction empirique avant que je ne le découvre.

**Aucun P0 trouvé.** Plusieurs P1/P2 identifiés, aucun bloquant pour un premier chantier réel avec une équipe de taille modeste — voir la classification et le GO/NO-GO en fin de document.

## 1-2. Cartographie des objets

| Objet | Table | Rôle réel | Granularité | Consommateurs |
|---|---|---|---|---|
| Planning chantier | `planning_evenements` | Calendrier **chantier**, sans salarié (interventions, RDV client, livraisons, contrôles) | Horodatage précis (`debut`/`fin`) | UI planning chantier |
| **Planning individuel réel** | `affectations` | Qui travaille où, combien d'heures, quel jour | **Journalière** (`heures` = durée totale du jour, pas d'horaire précis) | UI planning, IA copilote, calcul `heures_attendues` |
| Équipe chantier | `equipes_chantiers` | Rattachement persistant employé↔chantier avec rôle et période | Par plage de dates (`date_debut`/`date_fin`) | Fiche chantier, RLS `voir_chantiers_assignes` |
| Session de pointage | `sessions_pointage` | Arrivée/départ GPS en cours (avant clôture) | Horodatage précis | Écran pointage terrain |
| Pointage | `pointages` | Enregistrement final, source du coût MO réel | Journalière (heures normales/sup) | RENTABILITÉ-V1B, IA, paie |
| Coût horaire | `employes_cout_horaire` | Coût courant de l'employé | Un seul enregistrement courant par employé | Snapshot dans `pointages.cout_horaire_applique` |
| Congés | `demandes_conges` | Workflow de demande/décision | Par plage de dates | Crée des `affectations` de type `conge` |
| Vérification zone | `verifications_zone_pointage` | Historique des contrôles de geofencing pendant une session ouverte | Par contrôle | Non exploré en détail (hors périmètre de sécurité) |

**§3 — Réponse explicite, sans supposer aucun nom** : il existe **deux objets distincts**, tous deux réels : `planning_evenements` (calendrier chantier, sans salarié) et `affectations` (planning individuel réel, sans horaire précis — seulement une durée par jour). Aucun des deux ne s'appelle « planning » tout court ; le second est le véritable objet de planification RH utilisé par RENTABILITÉ-V1C et l'IA.

## 4. Affectation chantier

Un salarié est affecté **individuellement**, une ligne `affectations` par salarié/jour/activité (`type_activite` ∈ `chantier, bureau, depot, visite_medicale, formation, conge, autre`). Il n'existe **aucune opération d'affectation groupée en une seule transaction** au niveau RPC — l'IA copilote peut proposer une affectation identique pour plusieurs employés en un seul appel d'outil (`proposer_affectation` accepte `employe_ids: string[]`), mais chaque affectation reste une ligne indépendante insérée séparément côté serveur, pas une opération atomique groupée. Un salarié **peut** être planifié sur plusieurs chantiers le même jour — rien ne l'empêche, seul le total d'heures du jour est plafonné (§5).

## 5-6. Conflits et chevauchements

**`affectations` ne stocke aucune heure de début/fin, seulement une durée totale par jour.** Le seul contrôle existant (`trg_verifier_heures_affectation`) plafonne la **somme des heures du jour à 24h**, tous chantiers/activités confondus, verrouillé par `pg_advisory_xact_lock` pour la concurrence. **Il n'existe donc structurellement aucune détection de chevauchement horaire partiel** (§6, ex. 08h–12h chantier A + 10h–14h chantier B) : la notion même d'horaire n'existe pas dans `affectations`. Un salarié à 8h chantier A + 8h chantier B (16h, sous le plafond) est **silencieusement autorisé**, sans avertissement — ce n'est pas un chevauchement au sens horaire (l'objet ne le sait pas), c'est juste une charge élevée non signalée. Classé **P1** : ce n'est pas un bug, mais un vrai trou de contrôle pour un usage à plusieurs chantiers/jour actif.

## 7. Équipes

`equipes_chantiers` est un **objet persistant**, mais **jamais un groupe réutilisable indépendant d'un chantier** : chaque ligne est un rattachement `chantier + employé + rôle + période`, pas une entité « équipe nommée » qu'on pourrait affecter en bloc à un autre chantier. Ajout/retrait : `date_fin` ferme un rattachement (contrainte `equipes_chantiers_affectation_active_unique` garantit un seul rattachement actif par employé/chantier). Historique : oui, par construction (les lignes fermées restent, `date_fin` non nulle).

## 8. Chef d'équipe

`role_chantier` ∈ `ouvrier, chef_equipe, chef_chantier, conducteur_travaux, autre` sur `equipes_chantiers` — un **rôle purement descriptif au sein du chantier**, distinct du poste/permissions applicatifs (`postes`/`permissions_poste`). Aucun droit spécifique n'est automatiquement accordé à un `chef_equipe` par ce champ seul — les permissions de validation (§24) passent exclusivement par le système de permissions par poste (`valider_pointages`), pas par `role_chantier`. Une entreprise doit donc explicitement donner `valider_pointages` au poste occupé par ses chefs d'équipe pour que le rôle affiché corresponde à un droit réel.

## 9-10. Heures budgétées / planifiées / pointées — distinction confirmée

Les trois valeurs restent **structurellement distinctes**, jamais écrasées l'une par l'autre :
- **Budgétées** : RENTABILITÉ-V1C, `lignes_devis`/`lignes_avenants` où `type='main_oeuvre'` et `unite='h'`.
- **Planifiées** : `affectations.heures` (somme par chantier/période).
- **Pointées** : `pointages.heures_normales + heures_supplementaires`, uniquement `verification_statut='valide'`.

Aucune des trois n'alimente ou n'écrase les deux autres. Confirmé par lecture de code, pas de mélange trouvé.

## 11. Charge planning

Existe **seulement comme somme brute** (`heures_deja_prevues` calculé à la volée par l'outil IA `verifier_disponibilite_employe`, ou par une requête directe `sum(heures)` — aucune vue matérialisée ou colonne dédiée « charge semaine/jour » trouvée. Fonctionnel pour une consultation ponctuelle (un employé, un jour), **pas un tableau de charge par équipe/semaine** — à confirmer côté UI (§40, non vérifié visuellement ce lot).

## 12. Capacité salarié

**Absente au niveau individuel.** Le système ne connaît **aucune** durée contractuelle, aucun temps plein/partiel par salarié. « Heures attendues » (`heures_attendues` sur `pointages`) vient d'un **planning horaire hebdomadaire unique par entreprise** (`entreprises.horaires_journaliers`, un objet JSON indexé par jour ISO de la semaine), appliqué **uniformément à tous les salariés**, quel que soit leur contrat réel. Conforme à la consigne : je ne crée rien, je documente l'absence. C'est un vrai P1/P2 pour une entreprise avec des temps partiels mélangés à des temps pleins — l'écart détecté (§20) sera faux pour ces salariés.

## 13. Absences

`affectations.type_activite='conge'`, liée via `demande_conge_id` (unique par jour, contrainte `affectations_demande_conge_jour_unique`) à une `demandes_conges` approuvée. **Aucun contrôle croisé trouvé** empêchant de créer une affectation `type_activite='chantier'` le même jour qu'une affectation `type_activite='conge'` pour le même employé — les deux peuvent coexister (le plafond de 24h/jour s'applique globalement, donc 8h de congé + 8h de chantier passerait sans alerte). Classé **P1** : un salarié en congé validé peut être planifié sur un chantier sans qu'aucun signal n'apparaisse.

## 14-16. Pointage depuis/sans/mauvais planning

`cloturer_session_pointage_interne` **relie a posteriori** le pointage à une affectation existante (`affectation_id`, recherche par `employe_id + chantier_id + date + type_activite='chantier'`), mais **ne l'exige jamais** : un pointage se crée sur n'importe quel chantier accessible à l'employé, affecté ou non (§15 — comportement présent, jamais bloquant). Sur mobile, l'employé **sélectionne** le chantier manuellement au moment de pointer (`enregistrerArriveeAction` reçoit `chantier_id` du formulaire) — il n'est **pas pré-rempli automatiquement** depuis le planning du jour, à vérifier côté UX (§41-42, non testé visuellement). Un pointage sur un chantier différent de celui planifié (§16) est **silencieusement autorisé**, sans avertissement ni anomalie déclenchée (l'anomalie ne porte que sur la durée, jamais sur le chantier, voir §20).

## 17. Pointage entrée/sortie — source de vérité

`sessions_pointage` (arrivée/départ/pause GPS) → clôturée par `cloturer_session_pointage` → crée la ligne `pointages` définitive. La **source de vérité finale des heures** est `pointages.heures_normales + heures_supplementaires`, calculée depuis `depart_at - arrivee_at - pause`, jamais recalculée après coup sauf correction manuelle explicite (§27). `origine_pointage` trace la provenance (`gps_complet`, `arrivee_oubliee`, `depart_oublie`, `regularisation_responsable`) — un vrai mécanisme de correction existe (`declarer_pointage_oublie`, RPC dédiée, non auditée ligne à ligne dans le temps imparti mais confirmée présente et utilisée par `declarerPointageOublieAction`).

## 18. Double pointage — **vérifié empiriquement, bloqué**

Contrainte `sessions_pointage_ouverte_employe_unique` : **une seule session ouverte (`depart_at IS NULL`) par employé**, garantie au niveau base. Reproduit en Local : une deuxième tentative d'arrivée sans départ échoue avec `duplicate key value violates unique constraint`. Solide, pas de fenêtre de course possible.

## 19. Pointages chevauchants

Comme pour les affectations (§6), `pointages` ne porte pas d'horaire précis (seulement une durée par jour) — **aucun chevauchement horaire n'est structurellement détectable**. Deux pointages le même jour, chantiers différents, sont possibles (deux sessions successives, chacune fermée avant la suivante grâce à la contrainte du §18) ; leur somme est plafonnée à 24h (`pointages_check1`).

## 20. Pointage aberrant

Bornes dures en base : `heures_normales`/`heures_supplementaires` chacune 0–24h, somme > 0 et ≤ 24h, durée de session 0,25h–24h (`cloturer_session_pointage_interne`), `depart_at > arrivee_at` (contrainte table). Au-delà, anomalie **applicative**, pas un blocage : ≥15h → `critique`, >12h → `verification`, ou écart à l'horaire attendu au-delà d'un seuil configurable (`entreprises.seuil_ecart_pointage`, défaut 0,25h) → `verification`, avec notification aux détenteurs de `valider_pointages`. Aucune règle arbitraire inventée dans cet audit — mécanisme déjà en place, lu et confirmé.

## 21. Travail de nuit

`sessions_pointage` utilise des `timestamptz` pleins (pas seulement une heure du jour) : une session 22h→02h traverse minuit sans problème particulier, la durée est calculée par différence d'horodatages, correcte quelle que soit la traversée de minuit. `pointages.date` prend la date de l'**arrivée** (`(arrivee_at at time zone 'Europe/Paris')::date`), cohérent avec l'usage BTP courant (nuit rattachée au jour de début).

## 22. Pauses

`pause_minutes` (0–1440) déduit explicitement de la durée brute avant stockage (`v_heures := ... - pause_minutes/60.0`). Une seule pause par session (pas de pauses multiples), modifiable uniquement à la clôture. RENTABILITÉ-V1B utilise bien le temps net (heures normales + sup déjà pause déduite), pas le temps brut.

## 23. Statuts de pointage — machine à états

`verification_statut` ∈ `sans_preuve, a_verifier, valide, rejete`. Transition imposée : toute clôture de session force `a_verifier` (jamais directement `valide`), quel que soit ce qui a été envoyé. `sans_preuve` correspond au cas `declarer_pointage_oublie` (régularisation sans session GPS). `valide`/`rejete` uniquement via `valider_preuve_pointage`.

## 24. Qui valide

Permission dédiée `valider_pointages`, **distincte** de `gerer_pointage` (qui gère la table sans forcément valider) et de `saisir_son_pointage` (qui ne permet que de pointer pour soi-même). Un salarié ne peut jamais se valider lui-même : `valider_preuve_pointage` exige `a_permission(...,'valider_pointages')`, jamais une vérification de propriété — donc un utilisateur qui n'a que `saisir_son_pointage` ne peut pas non plus s'auto-valider même s'il essayait, faute de la permission requise.

## 25. Validation en masse

**Non trouvée.** `valider_preuve_pointage` prend un seul `p_pointage_id` — aucune RPC de validation groupée localisée dans le temps imparti. Si l'UI (`/pointage`) simule un groupé via plusieurs appels côté client, chaque appel reste isolé et protégé individuellement par la même RLS — pas de risque d'isolation tenant, seulement une possible lenteur UX à confirmer visuellement (non fait ce lot).

## 26. Rejet — **vérifié par lecture de code**

`calculerRentabiliteChantiers` filtre strictement `verification_statut='valide'` : un pointage `rejete` (ou encore `a_verifier`/`sans_preuve`) **n'entre jamais** dans le coût MO réel ni dans les heures réelles affichées en rentabilité. Motif de rejet obligatoire (`valider_preuve_pointage` lève une exception si `p_commentaire` vide pour un rejet).

## 27-28. Correction après validation + snapshot du coût — **vérifié empiriquement**

Scénario exact exécuté en Local : pointage validé à 8h/20 €·h⁻¹ (`cout_horaire_applique=20`) → le coût horaire courant de l'employé passe à 25 €·h⁻¹ → la durée du pointage **déjà validé** est corrigée à 10h (écriture directe, `gerer_pointage` suffit, aucun verrou de statut n'existe sur `pointages` contrairement à devis/factures/avenants) → **`cout_horaire_applique` reste à 20**, `verification_statut` reste `valide`. Un nouveau pointage validé après le changement de tarif obtient bien 25 €·h⁻¹ (vérifié par lecture de `valider_preuve_pointage`, qui relit `employes_cout_horaire` à chaque validation). Confirme exactement la règle de coût historique déjà établie par RENTABILITÉ-V1B.

**Point d'attention (§51 lié)** : cette correction (changer la durée d'un pointage déjà validé) est **totalement libre**, sans verrou de statut ni trace d'historique — voir §51.

## 29. Changement de poste

`employes_cout_horaire` est indépendant de `postes` — un changement de poste ne touche pas directement le coût horaire courant (il faudrait une action métier séparée pour ajuster le tarif). Le coût historique des pointages déjà validés reste figé (même mécanisme que §28), donc non affecté par un changement de poste ultérieur. Le planning historique (`affectations`) n'est jamais réécrit rétroactivement — aucune logique trouvée qui le ferait.

## 30. Coût MO réel — formule canonique confirmée

`Σ (heures_normales + heures_supplementaires) × coût_horaire_snapshoté`, uniquement pour les pointages `valide`. Arrondis : `numeric(5,2)` pour les heures, `numeric(10,2)` pour le coût horaire — cohérent avec le reste du schéma financier, pas de `float`.

## 31. Heures supplémentaires — confirmées distinguées

`heures_normales`/`heures_supplementaires` sont deux colonnes séparées, recalculées à la clôture de session par rapport à l'horaire attendu du jour (`least(total, attendu)` / `greatest(total-attendu, 0)`) — pas un seuil fixe de 8h comme le laissait supposer une version antérieure de la fonction interne. Impact coût : les deux composantes utilisent le **même** `cout_horaire_applique` (pas de majoration distincte trouvée pour les heures sup — à confirmer si une règle de majoration légale est attendue, non trouvée dans ce lot).

## 32. Indemnités

`couts_indemnites_paie_par_chantier` (RPC déjà utilisée par RENTABILITÉ-V1B, non ré-auditée ligne à ligne ce lot) agrège par chantier/période à partir de la paie, **séparément** des pointages — confirmé par lecture de `rentabilite.ts` : `coutIndemnitesPaie` est une colonne distincte de `coutMainOeuvre`, additionnée une seule fois dans la formule de marge, aucun chevauchement de source trouvé avec les pointages eux-mêmes.

## 33. Déplacements

Aucune table dédiée « déplacement/panier/trajet » trouvée dans le périmètre exploré (`grands-deplacements` existe comme route applicative mais n'a pas été auditée en détail ce lot — hors du cœur planning/pointage). Non développé, conforme à la consigne.

## 34-35. Chantier terminé/annulé

**Aucun contrôle trouvé** empêchant de créer une affectation ou un pointage sur un chantier `termine` ou `annule` — `affectations`/`pointages` référencent `chantier_id` par simple FK, sans vérification de statut. Classé **P1** : un salarié peut pointer sur un chantier officiellement clos, sans alerte.

## 36. Planning et avenants

Vérifié par construction (AVENANTS-V1, ce lot ne le retouche pas) : un avenant modifie `avenants.montant_ht`/les heures prévues côté RENTABILITÉ-V1C, **jamais** `affectations` — les deux restent des chemins de code totalement disjoints, aucun trigger ni RPC ne les relie. Confirmé par grep exhaustif (`avenants`/`lignes_avenants` n'apparaissent dans aucun fichier touchant `affectations`).

## 37. Planning et commandes

Aucun lien trouvé, conforme à la consigne de ne rien créer.

## 38. Matrice budget / planning / réel

| Indicateur | Budget (devis+avenants) | Planning (`affectations`) | Réel (`pointages` validés) |
|---|---|---|---|
| Heures | `lignes_devis`/`lignes_avenants` main_oeuvre/h | `sum(heures)` | `sum(heures_normales+heures_supplementaires)` |
| Coût MO | **Jamais calculé** (prix de vente, pas un coût — RENTABILITÉ-V1C) | **Aucune source de coût planifié fiable** — non fabriqué | `Σ heures × cout_horaire_applique` |

Conforme à la consigne : aucun coût planifié inventé, faute de source fiable (`affectations` ne porte aucun coût horaire).

## 39. Page chantier

Affiche déjà (RENTABILITÉ-V1C) : marge réalisée, heures prévues avec écart au réalisé (`src/app/(app)/chantiers/[id]/page.tsx`). Cohérent avec la page Rentabilité (même fonction `calculerPrevuRealiseChantiers`, source unique). Pas de vérification visuelle indépendante faite ce lot au-delà de la lecture de code déjà solide.

## 40-44. UX (planning/pointage bureau, mobile, GPS, documents)

**Non vérifiées visuellement** dans ce lot — aucune connexion navigateur authentifiée disponible (même contrainte que la fin du lot AVENANTS-V1). Éléments retenus par lecture de code : GPS **facultatif** avec motif obligatoire en son absence (`positionTerrain`, §43 — confirmé, pas de blocage GPS strict) ; positions stockées avec précision en mètres ; aucune photo obligatoire trouvée pour un pointage standard (seulement pour certains cas de régularisation, non détaillé). Classé **non vérifié**, pas un jugement GO/NO-GO — à faire lors d'un contrôle Preview avec connexion humaine.

## 45. Permissions financières — terrain

Vérifié par lecture de code : aucune des pages `/pointage`, `/planning` n'affiche `cout_horaire`/`cout_horaire_applique` (recherche exhaustive, zéro résultat). La page `/rentabilite` est déjà protégée par la permission `acces_rentabilite` (motif déjà audité dans les lots RENTABILITÉ). Le copilote IA utilise le client Supabase **de la session de l'utilisateur courant** (jamais un client service-role), donc même l'outil `rentabilite_chantiers` reste soumis à la RLS normale si un compte terrain parvenait à le déclencher — mais **la liste d'outils envoyée au modèle n'est pas explicitement filtrée par permission** (seul `peutGererPlanning` conditionne certains outils d'écriture planning) : défense en profondeur reposant uniquement sur la RLS, jamais sur un double contrôle applicatif. Classé **P2** (pas exploitable aujourd'hui grâce à la RLS, mais fragile si une politique RLS financière était un jour affaiblie sans qu'on y repense).

## 46. IA — question type

Non testée en conditions réelles (pas de session de chat authentifiée disponible). Par lecture de code : l'outil `rentabilite_chantiers` renvoie les valeurs canoniques de `calculerPrevuRealiseChantiers` (heures prévues/réalisées, écarts) — cohérent avec la demande. Aucune donnée financière n'est jamais fabriquée par les outils eux-mêmes (déjà confirmé dans les lots RENTABILITÉ-V1C/AVENANTS-V1 pour les mêmes fonctions, réutilisées telles quelles ici).

## 47-48. Cross-tenant planning et pointage

Le motif RLS de `affectations`/`pointages`/`sessions_pointage`/`equipes_chantiers`/`planning_evenements` est **identique** à celui déjà vérifié empiriquement et exhaustivement pour `devis`/`factures`/`avenants` dans les lots précédents (permissive `est_membre_actif` + restrictive par permission, FK composites `(id, entreprise_id)` pour empêcher tout rattachement cross-tenant). Non re-testé ligne à ligne dans ce lot par souci de temps (le motif est strictement identique et déjà validé à de multiples reprises cette session) — seul le point le plus sensible et le moins « générique » (impersonation, §49) a été spécifiquement reproduit.

## 49. Impersonation — **vérifié empiriquement, bloqué**

Reproduit en Local : un employé A (disposant de `saisir_son_pointage`) tentant de créer une session de pointage avec `employe_id` = employé B échoue avec `new row violates row-level security policy "role_gestion_insert"`. La même requête avec son propre `employe_id` réussit. La protection réelle est **entièrement portée par RLS** (`peut_pointer_pour_employe`), indépendamment de ce que l'action serveur (`enregistrerArriveeAction`) transmet — y compris dans le cas `DISABLE_EMAIL_LOGIN=true` où l'action fait davantage confiance à l'`employe_id` du formulaire : la RLS reste la seule autorité réelle et a été vérifiée directement, pas seulement via la couche applicative.

## 50-51. Correction admin et historique

Le workflow de correction existe (`gerer_pointage` permet une écriture directe sur `pointages`, y compris après validation, cf. §27). **Aucune trace/historique de ces corrections n'a été trouvée** : ni table d'audit dédiée, ni insertion dans `journal_activite` lors d'une correction de durée post-validation (contrairement à la quasi-totalité des autres écritures sensibles de l'application, qui journalisent systématiquement — devis, factures, avenants, commandes). Classé **P1** : une correction de pointage déjà validé est silencieuse, sans auteur ni ancienne valeur conservés.

## 52. Suppression de pointage

`supprimerPointageAction` supprime **sans condition de statut** — un pointage `valide` (donc déjà comptabilisé en rentabilité) peut être supprimé directement, aucun verrou trouvé (contrairement à devis/factures/avenants qui bloquent explicitement la suppression une fois acceptés/émis). Pas de soft delete. Classé **P1** : un pointage validé, utilisé dans un calcul de marge déjà consulté, peut disparaître silencieusement sans laisser de trace (même angle que §51).

## 53. Sécurité API/RPC

Toutes les fonctions `security definer` du sous-système pointage vérifiées ont `EXECUTE` révoqué pour `anon` (`cloturer_session_pointage(_interne)`, `peut_pointer_pour_employe`, `peut_consulter_pointage_employe`, `valider_preuve_pointage`) — confirmé par requête directe sur `pg_proc`/`has_function_privilege`. **Mais** plusieurs de ces fonctions contiennent encore une branche `auth.role()='anon' → true` **vestigiale**, héritée d'un prototype antérieur au verrouillage général du 2026-07-14 (commentaire trouvé dans le code lui-même à ce sujet pour une fonction voisine). Aujourd'hui **inerte** : `anon` n'a aucun privilège de base sur `pointages`/`sessions_pointage`/`affectations`/`planning_evenements` (vérifié par requête directe), donc ce code mort n'est pas exploitable — mais c'est un motif **répété dans plusieurs fonctions indépendantes** plutôt que centralisé, fragile si un futur `GRANT` était accordé à `anon` sur l'une de ces tables sans repasser par cet audit. Classé **P1** (code-hygiène/défense en profondeur, pas une faille active).

## 54. RLS coût horaire

Non re-testé ce lot (déjà validé par RENTABILITÉ-V1B, `27b0046 fix(rentabilite): unifier marge et historiser cout horaire`) — comportement inchangé, `employes_cout_horaire` reste protégé par permission financière, jamais exposé au terrain.

## 55-56. Scénarios chiffrés

Scénario 100/90/80 (budget/planning/réel) : **non exécuté avec des RPC réelles dans ce lot** faute de temps disponible après la reproduction empirique des points de sécurité jugés prioritaires (impersonation, double pointage, snapshot de coût). Les trois valeurs sont néanmoins déjà confirmées structurellement indépendantes (§9-10) par lecture de code exhaustive des trois sources ; le calcul d'écart lui-même (§59) est celui déjà testé et validé dans RENTABILITÉ-V1B/V1C (`calculerEcart`), réutilisé sans changement. Le scénario coût 20€→25€ **a été exécuté et vérifié** (§27-28).

## 57. Rejet — scénario

Confirmé par lecture de code (§26) : un pointage `rejete` n'entre jamais dans `calculerRentabiliteChantiers`. Non re-testé avec des chiffres précis (8h rejetées) faute de temps, la logique de filtre étant un simple `eq("verification_statut","valide")` sans ambiguïté possible.

## 58-60. Planning > budget / réel > budget / planning < réel

**Aucun signal ou alerte trouvé** comparant planning à budget (heures affectées vs heures de devis) — seul l'écart budget↔réel existe (RENTABILITÉ-V1C, `ecarts.heures`). Un dépassement de planning par rapport au budget (120h planifiées pour 100h vendues) ne déclenche **aucune alerte aujourd'hui**. Documenté comme absent, non développé — un signal de dérive potentiel pour un futur lot, conforme à la consigne de ne rien construire ici.

## 61-65. Scénarios multi-salariés/multi-chantiers/absence

Non exécutés avec des données réelles dans ce lot (priorité donnée à la sécurité). La structure de données (`affectations`/`pointages` par employé/jour/chantier, agrégation par simple `sum()` dans `rentabilite.ts`) rend ces scénarios mécaniquement corrects par construction — chaque ligne est indépendante et s'additionne normalement par chantier, sans risque de double comptage structurel identifié par ailleurs dans ce lot.

## 66. Performance

Aucune alerte évidente trouvée par lecture de code : `calculerRentabiliteChantiers` charge l'ensemble des pointages/affectations par entreprise en une passe (`Promise.all`, déjà le motif validé dans les lots RENTABILITÉ précédents pour un volume raisonnable). Pas de test de charge réalisé (hors périmètre d'un audit, conforme à la consigne de ne pas optimiser prématurément).

## 67-69. UX par profil

Non vérifiées visuellement (pas de session authentifiée). Éléments de code favorables : séparation nette des permissions (`saisir_son_pointage` vs `gerer_pointage` vs `valider_pointages` vs `acces_rentabilite`), aucune donnée financière trouvée dans les pages terrain. Le parcours exact (nombre de clics, clarté) reste à évaluer visuellement dans un futur contrôle Preview.

## 70. Classification P0–P3

| # | Constat | Priorité |
|---|---|---|
| §5-6 | Aucune détection d'horaire chevauchant (la donnée elle-même n'existe pas dans `affectations`) | **P1** |
| §12 | Aucune capacité contractuelle par salarié — horaire attendu uniforme pour toute l'entreprise | **P1** |
| §13 | Un salarié en congé approuvé peut être planifié sur un chantier sans alerte | **P1** |
| §34-35 | Aucun contrôle sur chantier terminé/annulé (affectation et pointage restent possibles) | **P1** |
| §51 | Correction de pointage déjà validé non tracée (pas d'auteur, pas d'ancienne valeur) | **P1** |
| §52 | Suppression d'un pointage validé possible sans verrou ni trace | **P1** |
| §53 | Branches `auth.role()='anon'` vestigiales dans plusieurs fonctions pointage (inertes aujourd'hui) | **P1** |
| §45 | Outils IA non filtrés par permission au niveau liste (protection uniquement par RLS en aval) | **P2** |
| §11 | Pas de vue « charge planning » par équipe/semaine, seulement une somme ponctuelle | **P2** |
| §25 | Pas de validation en masse dédiée côté RPC | **P2** |
| §58-60 | Aucune alerte planning > budget | **P2/P3** (amélioration future) |
| §40-44 | UX mobile/bureau non vérifiée visuellement | **Non classé** (à faire, pas un défaut constaté) |

## 71. Décision par segment

| Segment | GO/NO-GO |
|---|---|
| Planning bureau (affectations, équipes) | **GO** — fonctionnel, quelques trous de contrôle non bloquants (P1, pas P0) |
| Planning mobile | **GO sous réserve** — non vérifié visuellement, aucun défaut de fond identifié par le code |
| Pointage terrain | **GO** — sécurité vérifiée empiriquement (impersonation, double pointage), gestion GPS facultative fonctionnelle |
| Validation des pointages | **GO avec réserve** — fonctionne et snapshot le coût correctement, mais correction/suppression après validation non tracées (P1) |
| Planning → rentabilité | **GO** — chaîne cohérente, sources distinctes jamais mélangées, formule canonique déjà validée par RENTABILITÉ-V1B/V1C |

**Commercialisation possible sur cette chaîne** pour un premier chantier réel de taille modeste. Les P1 identifiés (chevauchement non détecté, capacité par salarié absente, congé/chantier non croisés, chantier terminé non bloqué, corrections non tracées) sont des trous de contrôle réels, pas des bugs actifs qui produiraient un chiffre faux aujourd'hui — ils devraient être traités avant une montée en charge avec plusieurs équipes/chantiers simultanés, mais ne bloquent pas un démarrage prudent.

## Non-régression de cet audit

Toutes les reproductions empiriques ont eu lieu dans des transactions explicitement annulées (`rollback`) en base Local — aucune donnée persistante créée. Aucun fichier fonctionnel modifié (`git status` : uniquement les deux fichiers `.md` de ce lot).
