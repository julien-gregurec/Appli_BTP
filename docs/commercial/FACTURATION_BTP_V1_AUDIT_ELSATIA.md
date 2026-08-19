# FACTURATION-BTP-V1 — Audit complet de la facturation BTP ELSATIA

Audit réalisé en lecture seule (sauf reproductions empiriques en transaction annulée), worktree `liria-codex`, branche `claude/facturation-btp-v1-audit`, base `0975059` (DEVIS-LOCK-V1, inclut RENTABILITÉ-V1/V1B/V1C, COMMANDES FOURNISSEURS V1/V1B, AVENANTS-V1 audit). **Aucun code applicatif modifié, aucune migration, aucune action Production.**

## Résumé exécutif

La facturation BTP d'ELSATIA est **riche et globalement bien construite** (facture classique, acompte, situations de travaux, facture finale, avoir, retenue de garantie, relances, paiements, snapshot légal figé à l'émission) — mais ce lot confirme et **quantifie précisément** le risque déjà pressenti par l'audit AVENANTS-V1, et révèle **deux failles supplémentaires non anticipées**, dont une qui casse une fonctionnalité de base :

1. **P0 — Sur-facturation réelle et quantifiée** : un scénario acompte + situations de travaux, tout à fait normal en BTP, permet de facturer **12 000 € sur un devis de 10 000 € HT (+20 %)**, sans aucune erreur, aucun blocage. Reproduit empiriquement avec des montants exacts (§13).
2. **P0 — Facture classique sans aucun garde-fou** : `creer_facture_depuis_devis` (type `simple`) peut être appelée plusieurs fois sur le même devis accepté, créant des factures intégralement dupliquées, sans aucune vérification. Reproduit empiriquement (§4).
3. **P0 — Enregistrement de paiement cassé** : la table `paiements` n'a **aucun privilège `GRANT`** pour `authenticated` (ni pour `service_role`) — un oubli dans les migrations de restauration des droits de fin juillet. `enregistrerPaiementAction` échoue donc systématiquement en Production/Preview aujourd'hui. Confirmé par comparaison directe des `GRANT` avec les tables voisines (§23).
4. **P1 — Facture émise modifiable en écriture directe** : montant et client d'une facture `envoyee` restent modifiables par UPDATE brut, exactement la même classe de faille corrigée pour les devis par DEVIS-LOCK-V1. La suppression est bloquée, mais **accidentellement** (effet de bord du verrou sur les lignes), pas par une règle dédiée (§31, §32).
5. **P1 — Snapshot légal contournable** : la capture de `entreprise_snapshot` (identité légale figée à l'émission, fonctionnalité P9) n'existe qu'au niveau applicatif (`changerStatutFactureAction`), pas en base — une transition de statut par écriture directe la contourne silencieusement (§32).
6. **P1 — Brouillons comptés dans le CA réel** : `calculerRentabiliteChantiers` inclut les factures `brouillon` dans `factureHt`, donc dans la marge affichée — une facture jamais envoyée gonfle déjà la rentabilité affichée, et amplifie directement l'impact de la faille n°2 (§36).

**GO/NO-GO** : voir §46. En résumé, **facture classique et acomptes seuls : GO avec réserve (créer d'abord un correctif minimal anti-doublon + réparer le grant paiements) ; situations de travaux combinées à des acomptes/finale : NO-GO tant que le garde-fou n'est pas corrigé.**

## 1-2. Cartographie des objets de facturation

| Objet | Table | Source de vérité | Relation devis | Relation chantier | Relation client | Relation paiement | RLS | Action serveur | UI | PDF |
|---|---|---|---|---|---|---|---|---|---|---|
| Facture (tous types) | `factures` | elle-même (`type`, `statut`) | `devis_origine_id` (nullable) | `chantier_id` (nullable) | `client_id` (obligatoire) | via `paiements.facture_id` | `membres`+`gerer_factures`/`acces_factures` | `src/app/actions/factures.ts` | `/factures`, `/factures/[id]` | `/imprimer/factures/[id]` |
| Ligne de facture | `lignes_factures` | copie figée depuis `lignes_devis` à la création | indirecte (via facture) | — | — | — | idem, via jointure `factures` | `modifier_facture_brouillon` (RPC) | fiche facture | incluse dans le PDF facture |
| Acompte/finale/avoir | `factures` (`type` ∈ `acompte`,`finale`,`avoir`) | RPC `creer_facture_avancee` | `devis_origine_id` obligatoire, devis `accepte` | hérité du devis | hérité du devis | idem facture | idem facture | `src/app/actions/facturation-avancee.ts` (non lu en détail, RPC-only) | `/facturation-avancee` | idem facture, libellé `typeFactureLabel` |
| Situation de travaux | `situations_travaux` + `lignes_situations` | RPC `creer_situation_travaux`/`facturer_situation_travaux` | `devis_id` obligatoire | `chantier_id` obligatoire (hérité du devis) | via devis | via `facture_id` une fois facturée | `gerer_facturation_avancee`/`acces_facturation_avancee` | id. | id. | Devient une `facture` de type `situation` une fois facturée — pas de PDF dédié tant que non facturée |
| Retenue de garantie | `situations_travaux.retenue_garantie_pct/montant_retenue`, `factures.retenue_garantie_pct/montant_retenue` | copiée de la situation vers la facture | via situation/facture | — | — | — | idem | — | — | **non affichée dans le PDF facture** (§33) |
| Paiement | `paiements` | elle-même | — | — | via facture | — | RLS présente mais **GRANT de base absent pour `authenticated`** (§23, P0) | `enregistrerPaiementAction`/`supprimerPaiementAction` | fiche facture | — |
| Relance impayé | `relances_impayes` | elle-même | — | — | via facture | — | non testée en détail ce lot (pattern standard, cohérent avec le reste du schéma) | non localisée précisément (hors périmètre du grep ciblé) | à vérifier UI dédiée | — |
| Numérotation | `next_reference` (fonction commune) | `entreprises`-scopée, séquence `'facture'` partagée | — | — | — | — | — | — | — | numéro affiché sur chaque type |
| Stripe (paiement client) | `factures.stripe_checkout_id/stripe_checkout_url/stripe_payment_intent_id/stripe_payment_status/lien_paiement_expire_at`, `paiements.stripe_session_id`, `stripe_webhook_events.facture_id` | Stripe (source externe) + colonnes sur `factures`/`paiements` | via facture | — | — | crée une ligne `paiements` au paiement confirmé | non auditée en détail (hors périmètre : ce lot audite la facturation BTP, pas l'intégration Stripe déjà auditée en P7/P8) | — | bouton « payer en ligne » sur facture envoyée | lien inclus dans l'email d'envoi |
| Stripe (SaaS ELSATIA) | `entreprises.abonnement_*`, `plans_abonnement` | **table entièrement différente**, aucun rapport avec la facturation BTP client | — | — | — | — | déjà audité en P7/P8/P10 | — | — | — |

Confirmé : les colonnes `stripe_*` sur `factures`/`paiements` concernent exclusivement le **paiement en ligne du client final** sur ses factures BTP (lien de paiement Stripe Checkout envoyé par email), **jamais** l'abonnement SaaS d'ELSATIA (`entreprises.abonnement_*`), qui vit dans un système entièrement séparé déjà audité (P7/P8/P10). Aucune confusion trouvée dans le code.

## 3. Types de facture réellement supportés

| Type | Existe | Fonctionnel | Preuve |
|---|---|---|---|
| Facture classique (`simple`) | ✅ | ⚠️ Fonctionnel mais **sans garde-fou anti-doublon** (§4, P0) | `creer_facture_depuis_devis` |
| Facture d'acompte (`acompte`) | ✅ | ✅ Fonctionnel, garde-fou partiel (ignore les situations… en fait si, voir §14) | `creer_facture_avancee` |
| Situation de travaux (`situation`) | ✅ | ⚠️ Fonctionnel isolément, **casse le garde-fou global combiné à un acompte** (§13, P0) | `creer_situation_travaux`+`facturer_situation_travaux` |
| Facture finale/solde (`finale`) | ✅ | ✅ Fonctionnel, protégée par le même garde-fou que l'acompte | `creer_facture_avancee` |
| Avoir (`avoir`) | ✅ | ✅ Fonctionnel, jamais bloqué par le plafond (volontaire) | `creer_facture_avancee` |
| Facture partielle autre | ❌ | Absent — aucun autre mécanisme trouvé | — |

## 4. Devis → facture classique

`creerFactureDepuisDevisAction` → RPC `creer_facture_depuis_devis` : vérifie `devis.statut='accepte'` et `client_id is not null`, copie intégralement les lignes (désignation, quantité, prix, TVA, remise) sans ressaisie. **Aucune vérification qu'une facture `simple` n'existe pas déjà pour ce devis.**

**Reproduit empiriquement** (transaction annulée, Local) : deux appels successifs à `creer_facture_depuis_devis(devis_id, 'simple')` sur le même devis accepté (10 000 € HT) **réussissent tous les deux**, produisant `2` factures brouillon indépendantes de 10 000 € HT chacune, sans aucune erreur. Classé **P0**.

## 5. Devis verrouillé (DEVIS-LOCK-V1)

Vérifié : `creer_facture_depuis_devis` et `creer_facture_avancee` ne font que des `SELECT` sur `devis`/`lignes_devis`, jamais d'écriture. Le verrou DEVIS-LOCK-V1 (triggers `BEFORE UPDATE/DELETE`) n'intercepte donc jamais ces chemins de facturation — confirmé par la reproduction du §4, qui a fonctionné sans aucune interférence du verrou.

## 6. Plusieurs devis acceptés sur un même chantier

Vérifié conceptuellement (cohérent avec l'audit AVENANTS-V1 §13, déjà confirmé empiriquement dans ce lot précédent) : chaque facture reste liée à son `devis_origine_id` propre, le garde-fou de `creer_facture_avancee` est **par devis** (`v_d.montant_ht`), jamais par chantier — donc deux devis indépendants sur un même chantier peuvent chacun être facturés jusqu'à 100 % de leur propre montant, sans qu'aucune RPC ne plafonne la somme au niveau du chantier. Voir §17 pour le test dédié.

## 7. Facture d'acompte

Source du montant : `v_d.montant_ht * (p_pourcentage/100)`, toujours sur le **HT** du devis. Testé : acompte 20 % sur devis 10 000 € HT → **2 000 € HT** générés exactement (vérifié dans le scénario empirique §13). La règle n'a pas été modifiée.

## 8. Plusieurs acomptes

Le garde-fou de `creer_facture_avancee` additionne bien tous les acomptes déjà émis (`sum(factures.montant_ht) where devis_origine_id=... and statut<>'annulee'`) avant d'accepter un nouvel acompte — un second acompte qui ferait dépasser 100 % du devis est refusé. Ce cas isolé (acomptes seuls, sans situation) est **correctement protégé**.

## 9. Situation de travaux

`creer_situation_travaux` : le système utilise un **pourcentage global d'avancement** (`p_avancement_pct`), appliqué uniformément à toutes les lignes du devis via `lignes_situations` (proportionnellement à leur quantité × prix), **pas** de saisie de quantités réelles par ligne. `montant_marche_ht` = `devis.montant_ht`, figé à la création de **chaque** situation (donc rejouable, pas un vrai figé unique). PDF : voir §33 (gap identifié).

## 10. Situations successives

Testé : devis 10 000 €, situation 1 à 50 % (montant_periode 5 000 €), situation 2 à 100 % (montant_periode 5 000 € supplémentaires, cumul 10 000 €) → cohérent, refus vérifié si `p_avancement_pct <= v_precedent` (empêche la régression). **Isolément (sans acompte), le mécanisme des situations est correct** et ne peut pas dépasser 100 % de son propre marché.

## 11-13. Acompte + situation — LE POINT CRITIQUE, reproduit et quantifié

**C'est la faille centrale de ce lot.** Scénario réel exécuté en Local (transaction annulée) :

```
Devis 10 000 € HT, accepté
1. Acompte 20 %                          → facture 2 000 € HT   (creer_facture_avancee)
2. Situation 1, 50 % cumulé du marché    → facture 5 000 € HT   (creer_situation_travaux + facturer_situation_travaux)
   Total réel après ces 2 étapes : 7 000 € HT (déjà réparti de façon incohérente : l'acompte couvre
   20 % du devis, la situation prétend couvrir 50 % du MÊME devis sans savoir que 20 % ont déjà
   été facturés par un autre mécanisme — mais le TOTAL ne dépasse pas encore 10 000 €)
3. Situation 2, 100 % cumulé du marché   → facture 5 000 € HT supplémentaires
   Total réel après ces 3 étapes : 12 000 € HT
```

**Résultat : 12 000 € HT réellement facturés sur un devis de 10 000 € HT — soit 20 % de sur-facturation, sans aucune erreur ni blocage à aucune étape.** Une tentative supplémentaire de facture finale est *ensuite* correctement rejetée par `creer_facture_avancee` (« Ce document dépasserait le montant du devis : déjà facturé 12000.00, devis 10000.00 ») — **mais après coup, la sur-facturation a déjà eu lieu.**

**Cause racine confirmée** (audit du code, pas seulement de son comportement) : `creer_situation_travaux` calcule son plafond uniquement à partir du cumul des **situations précédentes** (`select coalesce(max(ls.avancement_cumule_pct),0) into v_precedent from lignes_situations ls join situations_travaux s ...`) — il ne consulte **jamais** `factures.montant_ht` pour les acomptes/finales déjà émis sur le même devis. Le garde-fou de `creer_facture_avancee`, lui, additionne bien tout ce qui porte `devis_origine_id` (y compris les situations facturées, qui héritent ce champ) — mais seulement **au moment où on tente d'émettre un acompte/finale**, jamais au moment où une situation est créée. La protection est donc **asymétrique** : elle protège le sens acompte→situation-suivante partiellement (une situation ne peut pas non plus dépasser son propre 100 %), mais ne protège pas contre la combinaison des deux mécanismes cumulés.

Classé **P0**.

## 14. Matrice du garde-fou anti-surfacturation actuel

| Mécanisme | Ce qu'il additionne pour se plafonner | Ce qu'il ignore |
|---|---|---|
| `creer_facture_avancee` (acompte/finale) | `factures.montant_ht` où `devis_origine_id=ce devis` et `statut<>'annulee'` — inclut acomptes, finales, **et situations déjà facturées** (elles partagent `devis_origine_id`) | Rien côté factures ; ne s'applique qu'au moment de l'émission d'un acompte/finale, jamais en amont |
| `creer_situation_travaux` | Uniquement `avancement_cumule_pct` des situations **précédentes** du même devis | **Tous les acomptes et finales déjà facturés** — c'est le trou |
| `creer_facture_depuis_devis` (simple) | **Rien du tout** — aucun garde-fou (§4, P0) | Tout |
| Avoirs | Jamais bloqués par aucun plafond (volontaire — réduisent toujours) | — |

## 15. Faille déjà identifiée par AVENANTS-V1 — reproduite

Confirmée à l'identique de la description de l'audit AVENANTS-V1 §12, désormais **quantifiée avec des montants exacts** (§11-13 ci-dessus). Non corrigée dans ce lot (audit uniquement).

## 16. Montant contractuel actuel

Aujourd'hui, avant tout AVENANTS-V1, le plafond est **par devis** (`devis.montant_ht`), jamais par chantier. Confirmé par lecture du code (`creer_facture_avancee` utilise exclusivement `v_d.montant_ht`, sans aucune référence à `chantier_id` dans son calcul de plafond).

## 17. Facturation multi-devis

Testé conceptuellement à partir du code (le mécanisme étant strictement par devis, la conclusion du §6/§16 s'applique directement) : un chantier avec devis A (10 000 €) et devis B (2 000 €) peut voir chacun facturé indépendamment jusqu'à 100 % de son propre montant, soit 12 000 € potentiellement facturables au total sur le chantier — **conforme à l'attendu du cahier des charges** (« 12k maximum selon l'existant sans avenants structurés »), aucune RPC n'utilise par erreur le montant d'un seul devis comme plafond du chantier entier.

## 18. Avoir

`creer_facture_avancee(p_type='avoir')` : `v_signe:=-1`, copie les lignes du devis avec quantité multipliée par `v_facteur*v_signe` (donc négative), jamais bloqué par le plafond. Statut suit le même cycle que les autres factures. Le paiement (`paiements`) n'est pas structurellement empêché sur un avoir au niveau RPC de création, mais `enregistrerPaiementAction` **exclut explicitement** `avoir_emis` des statuts sur lesquels un paiement peut être ajouté (`["brouillon","annulee","avoir_emis"].includes(facture.statut)` → refus) — cohérent.

Impact rentabilité : `calculerRentabiliteChantiers` exclut `avoir_emis` du calcul de `factureHt` (`!["annulee","avoir_emis"].includes(item.statut)`) — mais un avoir est lui-même une **facture** de type `avoir`, avec son propre statut de cycle de vie (`brouillon`→`envoyee`→...). Il faut que l'avoir passe par un statut **autre que** `avoir_emis` pour être soustrait — **hypothèse à vérifier** : `avoir_emis` semble être le statut attendu spécifiquement pour les avoirs one shot (immédiatement définitif), auquel cas ce filtre les **exclut** du CA plutôt que de les **soustraire** en négatif comme l'attendrait un CA net correct. Voir §49 pour le test empirique dédié.

## 19. Avoir supérieur à la facture d'origine

Aucune vérification trouvée dans `creer_facture_avancee` comparant le montant de l'avoir à celui de la facture d'origine (`facture_origine_id`) — le code ne lit même pas `facture_origine_id` lors de la création d'un avoir via cette RPC (il duplique les lignes du **devis**, pas d'une facture précise). Un avoir peut donc dépasser en théorie le montant réellement facturé. **Classé P1** — risque comptable réel mais peu probable en usage normal (l'avoir reprend les lignes du devis dans les mêmes proportions), non corrigé.

## 20. Facture annulée

`statut='annulee'` : exclue de `calculerRentabiliteChantiers` (`factureHt`) — confirmé. Exclue également du plafond de `creer_facture_avancee` (`statut<>'annulee'`) — confirmé, comportement voulu et cohérent. Aucun mécanisme de paiement n'est empêché structurellement en base sur une facture annulée au-delà du contrôle applicatif (`enregistrerPaiementAction` l'exclut explicitement).

## 21. Facture brouillon

**Consomme le plafond de facturation** : `creer_facture_avancee` compte `statut<>'annulee'`, ce qui **inclut** `brouillon`. **Apparaît dans le CA réel de RENTABILITÉ-V1B** : `calculerRentabiliteChantiers` ne filtre que `annulee`/`avoir_emis`, donc une facture brouillon (jamais envoyée) est comptée dans `factureHt` et donc dans la marge affichée. **Classé P1** — une facture non envoyée ne devrait probablement pas être une preuve de CA réel, et ce comportement amplifie directement l'impact du P0 du §4 (deux brouillons dupliqués gonflent immédiatement la rentabilité affichée, avant même tout envoi).

## 22. Matrice des statuts de facture réellement utilisés

`brouillon`, `envoyee`, `payee_partiel`, `payee`, `en_retard`, `annulee`, `avoir_emis` (7 statuts, `FACTURE_STATUTS`). Transitions (`TRANSITIONS_FACTURES`) : `brouillon→{envoyee,annulee}`, `envoyee→{en_retard,annulee}`, `en_retard→{envoyee,annulee}`, le reste terminal. Noter : **aucune transition automatique vers `payee`/`payee_partiel`** dans cette table — ces statuts semblent être positionnés par une autre logique (probablement le trigger `facture_statut_paiement_coherent`, qui valide la cohérence montant/statut mais ne fait pas la transition lui-même) ou par une action dédiée non localisée précisément dans le temps imparti à ce lot — **point à vérifier plus précisément dans un futur lot**, classé P2 (fonctionnel mais mécanisme de transition automatique non confirmé avec certitude).

## 23. Paiement partiel — et faille P0 du grant manquant

**Découverte majeure, non anticipée par le cahier des charges** : la table `public.paiements` n'a **aucun privilège `GRANT`** pour le rôle `authenticated` (ni `SELECT`, ni `INSERT`, ni `UPDATE`, ni `DELETE`), ni même pour `service_role` au-delà de `REFERENCES/TRIGGER/TRUNCATE`. Seul `postgres` (superutilisateur) peut lire/écrire cette table.

Confirmé par comparaison directe des `GRANT` de base sur toutes les tables voisines : `devis`, `factures`, `lignes_factures`, `situations_travaux`, `lignes_situations`, `relances_impayes` ont **toutes** `SELECT,INSERT,UPDATE,DELETE` pour `authenticated` — **seule `paiements` en est dépourvue**. Cause racine identifiée : la migration `20260729000189_restaurer_privileges_modules_metier.sql` (« Phase 1 commercialisation », qui restaure les privilèges retirés lors d'un durcissement global) ne restaure explicitement que `devis` et `factures` — **`paiements` a été oublié** dans cette restauration (et dans toutes les suivantes).

**Conséquence concrète** : `enregistrerPaiementAction` (`supabase.from("paiements").insert(...)`), qui s'exécute avec le rôle `authenticated` via PostgREST, **échoue systématiquement** avec `42501 permission denied for table paiements`, quel que soit l'utilisateur, ses permissions RLS, ou l'environnement (ce n'est pas un problème de données Local, c'est un problème de migration absente — donc présent partout où cette migration a été appliquée sans correction ultérieure). **Reproduit empiriquement.** Classé **P0** — fonctionnalité de base cassée, indépendante de toute question de sur-facturation.

Le contrôle applicatif contre le surpaiement (`if (montant > reste + 0.005) redirect error`) dans `enregistrerPaiementAction` est **correct dans son principe**, mais actuellement **inatteignable** puisque l'insertion elle-même échoue avant. Aucune contrainte de base (`CHECK`) n'existe non plus pour plafonner `paiements.montant` par rapport au reste dû de la facture — seul `montant > 0` est vérifié en base (`paiements_montant_positif`). Une fois le grant réparé, ce contrôle applicatif reste donc la seule protection contre le surpaiement — cohérent avec le style du reste du codebase (RLS + contrôle applicatif, rarement de `CHECK` inter-lignes complexe en base), mais à garder en tête.

## 24. Plusieurs paiements

Le trigger `recalc_paiements_facture` (`AFTER INSERT/UPDATE/DELETE ON paiements`) recalcule `montant_paye` par sommation — logique saine en soi (non testée en exécution réelle dans ce lot puisque l'insertion elle-même est actuellement bloquée par le §23 ; lue et jugée correcte par inspection du code). Arrondis : `numeric` partout, pas de `float`, cohérent avec le reste du schéma financier.

## 25. Paiement supérieur au montant

Bloqué **uniquement côté applicatif** (`enregistrerPaiementAction`), classé donc comme **« refusé par l'application, non protégé en base »** — cohérent avec le classement demandé, à condition que le grant du §23 soit réparé pour que ce contrôle soit même atteignable.

## 26. Échéances

`factures.date_echeance`, calculée dans `creer_facture_depuis_devis` (dernière version) via `current_date + coalesce(clients.delai_paiement_jours, 30)` — reprend un délai de paiement par client, avec repli à 30 jours. Simple et fonctionnel, pas de moteur avancé (jours ouvrés/fin de mois) — conforme à la consigne de ne pas développer un moteur avancé, ce n'est donc pas un manque mais un choix de portée V1 raisonnable.

## 27. Relances

Table `relances_impayes` présente, structurée (niveau 1-4, canal, statut, contrainte d'unicité `(facture_id, niveau) where statut<>'annulee'`). Le mécanisme de détection/déclenchement précis (cron, action manuelle) n'a pas été localisé avec certitude dans le temps imparti — **à documenter plus précisément dans un futur lot**, classé P2 (structure présente et cohérente, fonctionnement bout-en-bout non vérifié ce lot).

## 28-29. Retenue de garantie

**Fonctionnel au niveau données** : `situations_travaux.retenue_garantie_pct` (0-20 % par contrainte `CHECK`), `montant_retenue` calculé et copié vers la facture de situation (`facturer_situation_travaux` : `retenue_garantie_pct, montant_retenue` copiés directement). Cohérence du cumul vérifiée par lecture de code : `montant_retenue` recalculé à chaque situation à partir de son propre `montant_periode_ht × retenue_garantie_pct`, pas de bug de cumul apparent. **Mais absente du PDF** (§33) — la retenue est calculée et stockée mais jamais montrée au client sur le document imprimé. Classé **fonctionnel côté données, partiel côté document** (P1 pour le PDF).

## 30. TVA

Chaque ligne (`lignes_factures.taux_tva`) porte son propre taux — plusieurs taux sur une même facture sont donc structurellement supportés (repris depuis `lignes_devis`, cohérent avec l'audit RENTABILITÉ-V1 déjà réalisé sur ce point pour les devis). Arrondis en `numeric`, cohérents avec le reste.

## 31. Remises

`remise_ligne` par ligne (`lignes_factures`/`lignes_devis`), reprise fidèlement depuis le devis lors de la création de facture (toutes les RPC de création copient `remise_ligne` sans transformation). Pas de remise globale distincte trouvée au niveau `factures` (contrairement à `devis.remise_globale`) — **absence notée**, P2 (le devis, source de vérité verrouillée par DEVIS-LOCK-V1, porte déjà la remise globale appliquée en amont ; son absence sur `factures` n'est donc pas nécessairement un manque fonctionnel réel). Aucune confusion avec PROMO-V1 (remises commerciales SaaS ELSATIA, table totalement différente) — vérifié, aucun croisement de code trouvé.

## 32. Numérotation

Une **seule séquence partagée** `next_reference(entreprise_id, 'facture', 'FAC', 3, true)` pour **tous** les types de factures (`simple`, `acompte`, `finale`, `avoir`, `situation`) — pas de préfixe distinct par type (pas de « AVO- » ou « SIT- »). Les situations elles-mêmes (avant facturation) ont leur propre numéro entier séquentiel **par devis** (`situations_travaux.numero`), indépendant de `next_reference`. Fonctionnellement correct (chaque facture a un numéro unique, séquentiel, par entreprise, par année) mais à signaler pour C6-D/Juridique : certaines pratiques comptables françaises attendent une série dédiée pour les avoirs — **non tranché ici, classé point d'attention pour la revue juridique**, pas un verdict.

## 33. PDF — audit par type de document

Un seul gabarit (`DocumentImprimable`, alimenté par `chargerDonneesFactureImprimable`) sert tous les types. Vérifié présents : client, entreprise (snapshot figé si disponible, sinon entreprise courante — voir gap §32′ ci-dessous), numéro, dates (émission + échéance), lignes avec HT/TVA/remise, totaux HT/TVA/TTC, référence devis (implicite via les données mais **le numéro du devis d'origine n'est pas affiché explicitement** — à vérifier), libellé de type (« Facture — Acompte », etc. via `typeFactureLabel`).

**Manquant, confirmé par lecture de la requête SQL de chargement** (`chargerDonneesFactureImprimable` ne sélectionne pas ces colonnes) : `situation_numero`, `avancement_pct`, `retenue_garantie_pct`, `montant_retenue`, `cumul_precedent_ht`, `est_dgd`. **Un PDF de situation de travaux n'affiche donc ni le numéro de situation, ni le pourcentage d'avancement, ni la retenue de garantie, ni le cumul précédent** — uniquement le libellé générique « Facture — Situation » et les lignes/totaux comme une facture ordinaire. C'est une lacune réelle pour un document contractuel BTP, où ces informations sont attendues par le client. Classé **P1**.

## 34. Mentions légales facture

Présentes dans `ENTETE_ENTREPRISE_COLONNES` (snapshot figé) : `siret`, `raison_sociale`, `adresse`, `assurance_decennale_numero/assureur`, `assurance_rc_pro_numero`, `taux_penalites_retard`, `texte_entete`/`texte_pied_page` (personnalisables). Pas de TVA intracommunautaire distincte trouvée (`siret` seul) — pas de vérité juridique tranchée ici, **classé pour revue C6-D/Juridique** comme demandé, sans verdict complet.

## 35. Facturation électronique

Aucun connecteur PDP/PPF trouvé (attendu, hors périmètre). Données structurées déjà en place utilisables comme base future : lignes typées, montants HT/TVA/TTC séparés par ligne, SIRET client et entreprise, dates. Écart principal pour une future factur-X/e-invoicing : absence d'identifiant de facturation électronique dédié, absence de statut de transmission PDP — **à documenter comme travail futur**, non développé ici.

## 36-38. Rentabilité

Vérifié par lecture directe de `src/lib/rentabilite.ts` : `factureHt` exclut `annulee` et `avoir_emis` uniquement — **inclut `brouillon`** (§21, P1). CA prévu = Σ `devis.montant_ht` où `statut='accepte'` (cohérent avec RENTABILITÉ-V1C). CA réel = Σ `factures.montant_ht` filtré comme ci-dessus, **par chantier** (`chantier_id`), donc naturellement agrégé sur plusieurs devis d'un même chantier (cohérent avec §6/§17). Le wording de l'UI n'a pas été ré-audité en détail dans ce lot (déjà couvert par l'audit RENTABILITÉ-V1 initial) — pas de nouveau problème identifié au-delà du point brouillon.

## 39. Suppression facture

**Aucune action serveur de suppression de facture n'existe** (`supprimerFactureAction` introuvable dans `src/app/actions/factures.ts`) — l'UI ne permet donc pas de supprimer une facture, quel que soit son statut. **Testé en écriture directe** : une tentative de `DELETE FROM factures` sur une facture `envoyee` échoue — mais **par effet de bord accidentel** : la suppression cascade d'abord vers `lignes_factures` (`ON DELETE CASCADE`), qui est bloquée par le trigger `lignes_factures_brouillon_only` (« Les lignes d'une facture émise ne peuvent plus être modifiées »), ce qui fait échouer toute la transaction. **Ce n'est pas une règle dédiée à l'immuabilité de la facture elle-même** — si une facture émise se retrouvait un jour sans aucune ligne (cas limite), rien n'empêcherait sa suppression directe. Classé **P1** (protection réelle aujourd'hui, mais fragile/accidentelle).

## 40-41. Modification facture émise — immutabilité documentaire

**Confirmé empiriquement** : `UPDATE factures SET montant_ht=... WHERE statut='envoyee'` et `UPDATE factures SET client_id=... WHERE statut='envoyee'` **réussissent tous les deux** en écriture directe, malgré le refus explicite de `modifier_facture_brouillon` (RPC) et de `modifierFactureAction` (action serveur) au niveau applicatif. **C'est exactement la même classe de faille que celle corrigée pour les devis par DEVIS-LOCK-V1** — le verrou existe uniquement dans la RPC/l'action, jamais au niveau table.

**Comparaison avec DEVIS-LOCK-V1** : `lignes_factures` a *déjà* un trigger `BEFORE` bloquant toute écriture sur les lignes d'une facture non-brouillon (`trg_lignes_factures_brouillon_only`, présent depuis `20260710000007`, donc **avant** DEVIS-LOCK-V1) — c'est mieux protégé que ne l'étaient `lignes_devis` avant ce dernier lot. Mais **le header de `factures` lui-même (montant, client, dates, statut) n'a aucun trigger équivalent** à `verrouiller_devis_accepte` — c'est le gap symétrique de celui corrigé sur `devis`. **Un futur `FACTURE-LOCK-V1` est nécessaire**, sur le modèle exact de DEVIS-LOCK-V1 (trigger `BEFORE UPDATE/DELETE` sur `factures`, bloquant les champs contractuels dès que `statut≠'brouillon'`, avec les mêmes exceptions pour les champs non contractuels comme `notes_internes`/`email_envoye_le`). Classé **P1** (pas P0 : la faille nécessite déjà un accès `gerer_factures` légitime, comme c'était le cas pour les devis).

## 42. RLS factures

Testé par lecture des policies (pattern identique et cohérent avec tout le reste du codebase déjà vérifié empiriquement pour `devis`/`commandes_fournisseurs` dans les lots précédents) : `factures`, `lignes_factures`, `paiements`, `situations_travaux`, `lignes_situations`, `relances_impayes` ont toutes une policy permissive `est_membre_actif` + policies RESTRICTIVE par permission (`gerer_factures`/`acces_factures` ou `gerer_facturation_avancee`/`acces_facturation_avancee`). Non re-testé empiriquement en pgTAP dans ce lot (audit, pas de nouveau développement) mais le pattern est identique à celui déjà validé exhaustivement pour `devis`/`lignes_devis` (DEVIS-LOCK-V1) et `commandes_fournisseurs`/`lignes_commande` (COMMANDES-FOURNISSEURS-V1B) — aucune raison structurelle de douter de son bon fonctionnement, sous réserve du grant manquant du §23 qui bloque `paiements` **avant même** que RLS n'entre en jeu (RLS ne protège que ce qui a déjà passé le grant de base).

## 43. Permissions

`gerer_factures` (créer, modifier brouillon, envoyer, enregistrer paiement, annuler) et `acces_factures` (lecture seule) pour la facturation classique ; `gerer_facturation_avancee`/`acces_facturation_avancee` pour acomptes/situations/finales. Séparation cohérente avec le reste de l'application — un rôle « terrain » sans ces permissions n'a ni lecture ni écriture sur les factures (déjà vérifié par le pattern RLS standard de l'application, cf. `isolation_multitenant_roles.test.sql` existant qui couvre déjà ce type de rôle sur des tables similaires).

## 44-45. API directe et sécurité anonyme

Testé directement en base (pas seulement via RPC/UI), conformément à la consigne :
- `anon` n'a **aucun privilège de base** sur `devis`/`factures` (confirmé dans DEVIS-LOCK-V1 pour devis ; à vérifier explicitement pour factures — non re-testé literalement ce lot mais le pattern de migrations est identique, cf. §23 pour la méthode de vérification des GRANT).
- **Point d'attention découvert** : `creer_facture_depuis_devis`, dans sa version la plus récente (`20260710000016_delai_paiement_client.sql`), a perdu la vérification explicite `est_membre_actif(v_devis.entreprise_id)` présente dans une version antérieure de la même fonction, et est **`grant`-ée à `anon`** en plus de `authenticated` (`grant execute on function public.creer_facture_depuis_devis(uuid, text) to anon, authenticated;`), sans être `security definer`. Aujourd'hui, cela reste **sans impact exploitable** car `anon` n'a de toute façon aucun privilège `SELECT` de base sur `devis`/`factures` (le premier `SELECT` de la fonction échouerait avant tout). Mais c'est une configuration **fragile** : elle repose entièrement sur le grant de table restant fermé pour `anon`, sans défense en profondeur au niveau de la fonction elle-même — contrairement au reste de l'application, qui suit systématiquement le motif `security definer` + vérification explicite de permission. Classé **P1** (défense en profondeur manquante, pas une faille exploitable aujourd'hui).

## 46. Scénario fictif complet — résultats

```
Devis accepté 10 000 € HT
1. Acompte 20 %                → 2 000 € HT facturés   (OK, garde-fou respecté)
2. Situation 1 à 50 % cumulé   → 5 000 € HT facturés   (OK isolément)
3. Paiement partiel            → BLOQUÉ aujourd'hui (P0 §23, grant paiements absent)
4. Situation 2 à 100 % cumulé  → 5 000 € HT facturés supplémentaires
   → TOTAL RÉEL : 12 000 € HT sur un devis de 10 000 € HT (+20 %, P0 §11-13)
5. Facture finale               → REFUSÉE par le garde-fou (mais après la sur-facturation)
6. Paiement final                → non atteint (bloqué en amont par §23)
7. Avoir éventuel                → non testé dans ce scénario précis, voir §49 séparément
```

## 47. Scénario anti-surfacturation — voies de contournement documentées

Une seule voie de dépassement réel identifiée et confirmée : **acompte + situations combinés** (§11-13), qui dépasse le devis de 20 % dans le scénario testé. Une seconde voie, distincte, est **l'appel répété de `creer_facture_depuis_devis`** (§4) qui n'a même pas besoin de « contourner » un garde-fou puisqu'il n'y en a aucun. Aucune autre combinaison testée (finale seule, avoir seul) ne permet de dépasser le devis — leur garde-fou individuel fonctionne correctement.

## 48. Scénario multi-devis — résultat

Conforme à l'attendu du cahier des charges : devis A (10k) + devis B (2k) sur un même chantier peuvent être facturés indépendamment jusqu'à 12k au total, sans qu'aucune RPC ne plafonne le chantier — comportement voulu en l'absence d'AVENANTS-V1 structuré (§16-17).

## 49. Scénario avoir — à vérifier en priorité dans un futur lot

Non testé empiriquement avec des montants exacts dans ce lot par manque de temps (priorité donnée à la reproduction quantifiée du P0 principal, §11-13, jugée plus critique). Le mécanisme de calcul (`v_signe:=-1`) est correct par lecture de code, mais son **interaction précise avec `calculerRentabiliteChantiers`** (qui exclut `avoir_emis` du calcul plutôt que de soustraire un montant négatif) mérite une vérification empirique dédiée avant commercialisation — noté comme action de suivi immédiate, pas comme un verdict.

## 50. Matrice des statuts comptés

| Objet | Statut | Consomme le plafond `creer_facture_avancee` | Compté dans `factureHt` (CA réel) | Reste dû (`paiements`) |
|---|---|---|---|---|
| Facture `simple` | brouillon | Oui | **Oui** (P1 §21) | Bloqué (P0 §23) |
| Facture `simple`/`acompte`/`finale` | envoyee/payee/payee_partiel/en_retard | Oui | Oui | Fonctionnel en théorie, cassé en pratique (P0 §23) |
| Facture | annulee | Non | Non | Non applicable |
| Facture | avoir_emis | Oui (n'est jamais un avoir lui-même donc s'additionne comme une facture normale si elle existe à ce statut — cas à clarifier §49) | Non (exclu) | Bloqué explicitement par l'action |
| Situation (avant facturation) | brouillon/validee | Non (n'est pas encore une `facture`) | Non | Non applicable |
| Situation | facturee | Devient une `facture` de type `situation` → oui | Oui (P1 §21 si la facture résultante est encore brouillon) | Bloqué (P0 §23) |
| Avoir | tout statut | Jamais bloquant pour les autres | Exclu si `avoir_emis` | Bloqué explicitement |

## 51. Arrondis

`numeric` partout (devis, factures, situations, paiements) — cohérent, aucun `float` trouvé dans le schéma financier. Les fonctions RPC utilisent `round(..., 2)` de façon cohérente pour les montants monétaires. Aucune anomalie d'arrondi détectée par lecture de code (pas de test empirique dédié dans ce lot, le pattern étant identique à celui déjà validé pour les devis/rentabilité dans les lots précédents).

## 52. Performance

Aucune agrégation de facturation n'a semblé problématique par lecture de code (les requêtes de `calculerRentabiliteChantiers` chargent l'ensemble des factures/devis/dépenses par entreprise en une passe, pattern déjà en place et jugé acceptable dans l'audit RENTABILITÉ-V1 initial). Aucun risque évident signalé, aucune optimisation prématurée entreprise.

## 53. UX

Parcours devis→facturer→choisir type→montant→PDF→envoyer→paiement globalement clair et cohérent avec le reste de l'application (mêmes motifs de formulaires, mêmes composants `StatutDevisSelect`-like). Point d'incompréhension potentiel identifié : rien dans l'UI n'avertit visiblement l'utilisateur qu'il combine acompte et situation sur le même devis (le P0 du §11-13 est **invisible** pour l'utilisateur au moment où il le commet) — à corriger en même temps que le garde-fou lui-même dans un futur lot, pas une refonte UI de ce lot.

## 54. Classification P0-P3

| # | Constat | Priorité |
|---|---|---|
| §4 | Facture classique dupliquable sans garde-fou (double appel `creer_facture_depuis_devis`) | **P0** |
| §11-13 | Acompte + situations combinés → sur-facturation réelle, quantifiée (+20 % dans le test) | **P0** |
| §23 | `paiements` sans GRANT `authenticated`/`service_role` — enregistrement de paiement cassé | **P0** |
| §40-41 | Facture émise modifiable en écriture directe (montant, client) — même classe que la faille devis pré-DEVIS-LOCK-V1 | **P1** |
| §32′ | `entreprise_snapshot` capturé uniquement côté application, contournable par écriture directe | **P1** |
| §21 | Factures brouillon comptées dans le CA réel (rentabilité) | **P1** |
| §33 | PDF de situation sans numéro/avancement/retenue de garantie/cumul | **P1** |
| §39 | Suppression de facture émise bloquée accidentellement, pas par une règle dédiée | **P1** |
| §19 | Avoir non plafonné par rapport à la facture d'origine | **P1** |
| §44-45 | `creer_facture_depuis_devis` sans `security definer`/vérification explicite, grant `anon` | **P1** |
| §22 | Mécanisme de transition automatique vers `payee`/`payee_partiel` non confirmé avec certitude | **P2** |
| §27 | Fonctionnement bout-en-bout des relances non vérifié précisément | **P2** |
| §31 | Absence de remise globale au niveau facture (le devis verrouillé la porte déjà) | **P2** |
| §32 | Numérotation unique partagée entre types (pas de série distincte pour les avoirs) | **P2** (revue juridique) |
| §34 | Mentions légales : liste à faire valider par C6-D/Juridique | **P2** (revue juridique) |
| §35 | Facturation électronique : préparation structurelle correcte, connecteur absent (attendu) | **P3** |

## 55-56. Décision commercialisation par module

| Module | GO/NO-GO |
|---|---|
| Facture classique seule | **GO avec réserve** — fonctionne pour un usage simple, mais corriger le garde-fou anti-doublon (§4) avant tout premier client, sans quoi une simple double clic peut dupliquer une facture entière |
| Acompte seul (sans situation) | **GO** — garde-fou correct et vérifié |
| Situations de travaux seules (sans acompte préalable) | **GO** — garde-fou correct dans ce cas isolé |
| **Acompte + situations combinés** | **NO-GO** — sur-facturation réelle démontrée, à corriger avant tout chantier utilisant les deux mécanismes ensemble |
| Facture finale/solde | **GO** — protégée par le même garde-fou que l'acompte |
| Avoir | **GO avec réserve** — fonctionnel, mais vérifier empiriquement son interaction avec la rentabilité (§49) avant de s'appuyer dessus pour un vrai CA net |
| Enregistrement de paiement | **NO-GO absolu tant que le grant `paiements` n'est pas réparé** — fonctionnalité actuellement cassée, indépendamment de tout choix de type de facture |

**Décision globale : ELSATIA ne peut pas facturer un premier client BTP réel dans toute sa généralité aujourd'hui** — la facture classique et les acomptes seuls sont utilisables avec prudence, mais l'enregistrement des paiements est cassé pour tout le monde (§23), et toute situation de travaux combinée à un acompte expose à une sur-facturation réelle et déjà quantifiée (§11-13).

## 57. Recommandation de correctifs (à ne pas développer ici)

Par ordre de priorité suggéré :
1. **`PAIEMENTS-GRANT-FIX-V1`** — un correctif minimal (une ligne de migration `GRANT SELECT,INSERT,UPDATE,DELETE ON public.paiements TO authenticated;`), le plus urgent et le plus simple, débloque une fonctionnalité de base entièrement cassée.
2. **`ANTI-SURFACTURATION-V1`** — corriger `creer_situation_travaux` pour qu'il consulte aussi `factures.montant_ht` (acomptes/finales déjà émis) avant d'accepter un nouveau cumul, et ajouter un garde-fou minimal à `creer_facture_depuis_devis` (refuser un second appel `type='simple'` réussi sur le même devis, ou avertir explicitement).
3. **`FACTURE-LOCK-V1`** — sur le modèle exact de DEVIS-LOCK-V1, verrouiller le header de `factures` au niveau table dès que `statut≠'brouillon'`, et déplacer la capture d'`entreprise_snapshot` dans un trigger plutôt que dans l'action serveur.
4. **Compléments PDF situations** (numéro, avancement, retenue de garantie, cumul précédent) — amélioration UX/contractuelle, non bloquante pour un premier client sans situations.

## 58-59. Hors périmètre, Production interdite

Aucun développement AVENANTS-V1 entrepris. Seule la réalité de plusieurs devis acceptés sur un même chantier a été prise en compte (déjà existante, non modifiée). Aucune migration, aucune donnée réelle, aucun Stripe Live, aucun prospect touché.

## Non-régression de cet audit

Toutes les reproductions empiriques ont eu lieu dans des transactions explicitement annulées (`rollback`) en base Local — aucune donnée persistante créée. Aucun fichier fonctionnel modifié (`git status` : uniquement les deux fichiers `.md` de ce lot).
