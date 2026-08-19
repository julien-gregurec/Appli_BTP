# AVENANTS-V1 — Implémentation minimale

Référence : `docs/commercial/AVENANTS_V1_AUDIT_ELSATIA.md` (audit, option C retenue) et `docs/commercial/AVENANTS_V1_CHECKLIST.md`. Branche `claude/avenants-v1-implementation`, depuis `claude/facturation-btp-v1b-p0` (commits `5996626`, `252b6a5`). Périmètre strictement minimal : création, envoi, acceptation/refus, immutabilité, intégration rentabilité + plafond de facturation. Aucune IA, aucune signature électronique avancée, aucun portail client, aucun versioning complexe, aucun ordre de service.

## 1. Principe contractuel

`montant contractuel courant d'un devis = devis.montant_ht (si accepté) + Σ avenants.montant_ht où statut='accepte'`. Un avenant brouillon, envoyé, refusé ou annulé ne modifie jamais ce montant. Le devis initial reste strictement immuable (DEVIS-LOCK-V1, non touché) — un avenant est un document séparé, jamais une réécriture du devis.

## 2. Modèle de données

**Option C retenue (audit §20)** : table `avenants` dédiée + table `lignes_avenants` **propre**, distincte de `lignes_devis` — et non un `avenant_id` nullable ajouté à `lignes_devis`. Décision technique justifiée : un `avenant_id` nullable sur `lignes_devis` aurait introduit exactement le « polymorphisme fragile » que la consigne demandait d'éviter — DEVIS-LOCK-V1 suppose que toute ligne de `lignes_devis` appartient à un devis, sans exception, et son trigger de verrouillage résout le devis parent directement depuis `devis_id` ; une ligne d'avenant sans `devis_id` (ou avec un `devis_id` pointant vers le devis d'origine mais un sens différent) aurait cassé cette hypothèse silencieusement. Le coût (une table de plus, même schéma de colonnes) est mineur et sans risque.

`avenants` : `id, entreprise_id, chantier_id, devis_origine_id, ordre, statut, date_creation, date_envoi, date_acceptation, date_refus, accepte_par, montant_ht/tva/ttc, notes_client, notes_internes, created_by, created_at, updated_at`. Contraintes composites `(id, entreprise_id)`, `(devis_origine_id, ordre)` unique, FK composites `(chantier_id, entreprise_id)` et `(devis_origine_id, entreprise_id)` vers `chantiers`/`devis` — même motif que `correctif_isolation_devis_client`/`correctif_rls_isolation_factures`.

`lignes_avenants` : mêmes colonnes que `lignes_devis` (designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre). `quantite` peut être négative — représentation explicite d'une **moins-value** (même convention que les lignes d'avoir dans `lignes_factures`, en place depuis FACTURATION-BTP-V1B). Pas de contournement grossier : c'est une convention déjà en place et testée ailleurs dans le code, pas une exception ad hoc.

## 3. Numérotation

`DEV-2026-001-AV01`, `-AV02`… **Jamais stocké** : dérivé à l'affichage (`numeroAvenant(devis.numero, avenant.ordre)`, `src/lib/avenants.ts`) à partir du numéro du devis (immuable dès son acceptation, garanti par DEVIS-LOCK-V1) et de `avenants.ordre` (entier, unique par devis via contrainte `(devis_origine_id, ordre)`). Aucun risque de divergence — conforme à la consigne de ne pas stocker une donnée calculable. `ordre` est calculé dans `creer_avenant` après verrouillage (`for update`) de la ligne devis, empêchant toute collision en concurrence (deux créations simultanées sur le même devis se sérialisent).

## 4. Statuts et transitions

`brouillon → {envoye, annule}`, `envoye → {accepte, refuse, annule}`, `accepte`/`refuse`/`annule` terminaux — exactement l'ensemble de transitions demandé, ni plus ni moins. Un avenant accepté est **terminal** (contrairement à une facture, qui continue à circuler entre statuts après émission) : aucune transition n'est possible au-delà, y compris vers un autre statut non-brouillon.

## 5. Immutabilité après acceptation

Même principe que DEVIS-LOCK-V1 : trigger `BEFORE UPDATE/DELETE` sur `avenants` (`verrouiller_avenant_accepte`), bloquant tout changement de statut, montant, devis d'origine, chantier, ordre, dates de suivi une fois `statut='accepte'`. Les lignes (`lignes_avenants`) sont protégées par un trigger dédié (`verrouiller_lignes_avenant_accepte`), avec la même vigilance cross-tenant que DEVIS-LOCK-V1 (le blocage n'est prononcé que pour un appelant membre de l'entreprise concernée, pour ne jamais laisser un message différent du message RLS standard fuiter l'existence d'un avenant d'un autre tenant). Suppression d'un avenant accepté explicitement refusée.

**Capture automatique de l'acceptation** (§35) : `date_envoi`, `date_acceptation`, `accepte_par` sont posés par le même trigger, au moment exact de la transition, jamais par le client — un utilisateur ne peut donc pas falsifier la date ou l'auteur d'une acceptation. C'est mieux que ce qui existe aujourd'hui pour les devis (qui n'ont ni date d'acceptation dédiée ni auteur capturé).

## 6. Devis d'origine

`creer_avenant` exige : devis existant, même entreprise (`entreprise_id` explicite, jamais fait confiance à une valeur cliente), `statut='accepte'`, `chantier_id` renseigné. Un devis brouillon, refusé, ou d'un autre tenant est refusé avec un message clair (« introuvable » pour le cross-tenant — cohérent avec le reste de l'application, qui ne distingue jamais « existe mais pas à vous » de « n'existe pas »).

## 7. Rentabilité (RENTABILITÉ-V1C)

`calculerRentabiliteChantiers` (`src/lib/rentabilite.ts`) : `budgetHt` par chantier = Σ devis acceptés + Σ avenants acceptés du même chantier. Aucun double comptage possible : les avenants ne touchent jamais `devis.montant_ht` (DEVIS-LOCK-V1 le garantit), ils s'additionnent dans une requête séparée.

`calculerPrevuRealiseChantiers` : `heuresPrevues` intègre désormais aussi les lignes `main_oeuvre`/`h` des **avenants acceptés**, même convention empiriquement validée pour les devis en RENTABILITÉ-V1C. `coutMainOeuvrePrevu`/`coutAchatsPrevu` restent `null` pour la même raison qu'un devis : une ligne d'avenant porte un prix de vente, jamais un coût interne — rien n'est inventé.

## 8. Facturation — plafond canonique étendu

Réutilise strictement `montant_facture_devis` (source canonique FACTURATION-BTP-V1B, inchangée) pour « déjà facturé ». Nouvelle fonction interne `montant_contractuel_devis(p_entreprise_id, p_devis_id)` = devis accepté + avenants acceptés — remplace `devis.montant_ht` comme plafond dans `creer_facture_avancee` (acompte/finale) et `creer_situation_travaux`. `creer_facture_depuis_devis` (classique) n'a besoin d'aucun changement : son garde-fou compare déjà `montant_facture_devis` à 0, indépendant de la valeur exacte du plafond.

**Bug découvert et corrigé pendant l'implémentation, avant tout déploiement** : la première version de `creer_situation_travaux` calculait la période d'une nouvelle situation comme `montant_contractuel × (pct - pct_précédent) / 100` — correct **seulement si le montant contractuel n'a pas changé entre deux situations**. Testé avec un scénario réaliste (situation à 60 % avant un avenant, puis situation à 100 % après) : le résultat était incohérent (10 800 € au lieu de 12 000 €), car « 60 % » avait été facturé sur l'ancien montant (10 000 €) mais soustrait comme si c'était 60 % du nouveau (12 000 €). Corrigé en calculant la période comme une différence en **euros** (`cumul cible en euros − somme des `montant_periode_ht` déjà facturés via des situations`), jamais comme une différence de pourcentages sur des bases potentiellement différentes. Revérifié : le même scénario donne exactement 12 000 € au total.

**Second bug découvert dans la même vérification** : `facturer_situation_travaux` (RPC préexistante, non modifiée par FACTURATION-BTP-V1B) recalculait ses lignes de facture **depuis les lignes de devis brutes** (`quantité × pourcentage`), ignorant le montant déjà correctement calculé dans `lignes_situations.montant_periode_ht`. Corrigé pour dériver la quantité facturée directement de ce montant (`montant_periode_ht / prix net`), garantissant que la facture générée correspond exactement à ce que la situation annonce, avenants compris.

Un avenant **plus-value** libère de la marge de facturation ; un avenant **moins-value** en retire — testé explicitement (`AVENANTS-V1 audit §51`) : si un devis est déjà facturé à 10 000 € et qu'une moins-value de -1 000 € est ensuite acceptée, le système **refuse** toute nouvelle facturation qui dépasserait les 9 000 € restants (comportement correct et attendu), mais **ne supprime ni ne modifie aucune facture déjà émise** et **ne crée aucun avoir automatiquement** — une régularisation (avoir) reste une décision humaine explicite, jamais automatisée.

## 9. Avoir ≠ moins-value contractuelle

Les deux mécanismes restent distincts, comme demandé : un avoir (`creer_facture_avancee(p_type='avoir')`) corrige un document déjà facturé, une moins-value (avenant) réduit le montant contractuel futur. Aucune transformation automatique de l'un vers l'autre.

## 10. PDF

`/imprimer/avenants/[id]` réutilise le composant `DocumentImprimable` partagé (devis/factures), sans nouveau gabarit — conforme à « éviter un PDF surchargé ». Affiche : type (« AVENANT AVnn — nom du chantier »), numéro, référence devis initial, client, date, lignes, variation HT/TVA/TTC. Le montant initial du devis, le cumul des avenants précédents acceptés et le nouveau montant contractuel sont regroupés dans un résumé textuel (même zone que les notes client), pour rester sur le gabarit existant plutôt que d'en créer un nouveau.

**Snapshot légal** (§34) : volontairement **non appliqué** aux avenants dans ce lot — un avenant réimprimé reflète l'identité légale actuelle de l'entreprise, pas une version figée au moment de l'acceptation. Différence assumée avec les factures (P9, `entreprise_snapshot`) : un avenant est un document nettement moins fréquemment réimprimé après coup, et son propre contenu (lignes, montants) est déjà verrouillé par l'immutabilité de la table `avenants` — seul l'en-tête entreprise pourrait dériver dans le temps, un risque mineur jugé acceptable pour rester dans le périmètre minimal (« ne refonds pas toute l'identité légale »).

## 11. UI

- **Fiche chantier** : nouvelle section « Avenants » (numéro, devis d'origine, statut, variation HT, montant contractuel courant), pas de refonte de la fiche chantier existante.
- **Fiche devis accepté** : bouton « Créer un avenant », aucun déverrouillage du devis.
- **`/avenants/nouveau`** et **`/avenants/[id]/modifier`** : éditeur dédié (`AvenantEditor`), volontairement séparé de `DevisEditor` (650 lignes, IA, médias, création rapide de client/chantier) plutôt que de le complexifier — un avenant n'a besoin d'aucun de ces éléments, son devis/chantier/client sont déjà déterminés.
- **`/avenants/[id]`** : référence, chantier, statut (`StatutAvenantSelect`, même motif que `StatutDevisSelect`), lignes, variation, montant contractuel, PDF, suppression (brouillon uniquement).

## 12. Sécurité

RLS identique au motif `devis` (permissive `est_membre_actif` + restrictive `gerer_devis`/`acces_devis`, permissions réutilisées, aucune nouvelle permission créée). `anon` sans aucun privilège sur `avenants`/`lignes_avenants`, aucune fonction `security definer` métier exécutable par `anon` (vérifié par le test de surface déjà existant, `isolation_multitenant_surface.test.sql` — un oubli de `revoke` sur `recalc_totaux_avenant` a été détecté par ce test dès la première exécution et corrigé). `montant_contractuel_devis` est une fonction interne uniquement (revoquée de `public`/`anon`/`authenticated`), jamais un point d'entrée direct — même motif que `montant_facture_devis` (FACTURATION-BTP-V1B), pour ne jamais devenir un oracle de montant contractuel cross-tenant.

## 13. Tests

- **pgTAP** (`supabase/tests/avenants_v1.test.sql`, 25 assertions) : création brouillon, devis accepté requis, cross-tenant refusé, ligne positive/moins-value, avenant brouillon/envoyé/refusé/annulé exclus du contrat, avenant accepté inclus, capture automatique de l'acceptation, multi-avenants (numérotation sans collision), immutabilité (header + lignes + suppression), cross-tenant, anon, plafond de facturation intégrant les avenants, moins-value + plafond, situation reflétant le montant contractuel courant, finale cohérente.
- **Vitest** (`src/lib/avenants.test.ts`, 13 tests ; `src/lib/rentabilite.test.ts`, +5 tests) : statuts/transitions, calcul des totaux (plus-value, moins-value, mixte), numérotation dérivée, intégration budget/heures prévues avec avenants acceptés, scénario contractuel complet.
- **Non-régression** : un fichier de test préexistant (`facturation_btp_v1b_p0.test.sql`) ajusté — deux messages d'erreur intentionnellement reformulés (« montant contractuel » plutôt que « montant total »/« montant du devis »), logique inchangée.
- **Suite complète** : `npm run test:db` → **496/496**, `npm run test` → **360/360**, `npm run typecheck` → 0 erreur, `npm run lint` → 0 erreur (3 avertissements `<img>` préexistants hors périmètre), `npm run build` → succès.

## 14. Scénario contractuel de référence — vérifié en Local et sur Preview

```
Devis initial accepté : 10 000 €
AV01 +2 000 €, accepté  → montant contractuel : 12 000 €
AV02 -500 €, accepté    → montant contractuel : 11 500 €
AV03 +3 000 €, brouillon → montant contractuel reste : 11 500 €
```
Exécuté avec des UUID réels, RPC réelles (`creer_avenant`, transitions de statut), résultat exact à chaque étape — vérifié en Local puis rejoué sur Preview.

## 15. Non-régression

DEVIS-LOCK-V1, FACTURATION-BTP-V1B (paiements, anti-surfacturation, facture-lock), RENTABILITÉ-V1B/V1C, Commandes fournisseurs, C6-B, isolation multi-tenant, TARIFS-V2, ADMIN-V1, PROMO-V1 : toutes les suites pgTAP/Vitest dédiées restent vertes.

## 16. Déploiement

- **Local** : les trois migrations s'appliquent proprement depuis une base vierge (`supabase db reset`), suite complète verte.
- **Preview** (`elsatia-preview`) : migrations appliquées isolément (`supabase db query --linked`, pas de `db push` global — le gap hors périmètre `20260812000200` reste non touché, comme pour les lots précédents). Scénario contractuel complet rejoué directement sur Preview (création, acceptation, capture automatique des dates/auteur, verrou, intégration situation à 100 % du montant contractuel avec avenant), données de test entièrement nettoyées ensuite. Code applicatif déployé sur Vercel.

## 17. Limites volontairement hors périmètre V1

Signature électronique avancée, portail client, IA avenants, workflow de validation multi-niveaux, ordres de service, versioning contractuel avancé, notifications sophistiquées, snapshot légal figé sur le PDF avenant, indicateurs de tableau de bord dédiés — tous documentés comme non traités, conformément à la consigne.
