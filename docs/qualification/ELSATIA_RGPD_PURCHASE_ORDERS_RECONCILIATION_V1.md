# ELSATIA — Réconciliation RGPD × commandes fournisseurs — V1

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `integration/elsatia-canonical-train-v3` @ `ef7443c0` (340 migrations, dernière `20260926000505`) |
| Branche | `claude/amazing-johnson-d7nzps` |
| Migration | **`20260926000506_rgpd_purge_commandes_fournisseurs_reconciliation.sql`** (341 migrations) |
| Moteur | PostgreSQL 16 réel + pgTAP, amorce `scripts/local-postgres-bootstrap` (sans Docker) |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge. |
| Textes légaux | Lus, **non modifiés**. Aucune décision juridique nouvelle. |

## Verdict

```
RGPD PURCHASE ORDER BLOCKER TECHNICALLY CLOSED
```

Le constat du train V3 (§12, `DECISION_REQUIRED:RGPD-PURGE-VS-COMMANDE-FOURNISSEUR`) est
fermé par la migration `…506`, active sur cette branche. Une entreprise qui a des commandes
fournisseurs envoyées, confirmées ou reçues **n'est plus bloquée** par CM-06 :

- chaque commande engagée est figée dans un **instantané immuable et minimisé** qui ne contient
  **aucune donnée personnelle**. Il garde numéro, dates, statut, articles, quantités, montants,
  TVA, réception et liens comptables, plus l'empreinte SHA-256 du document complet ;
- elle n'est supprimée que **pendant la purge**, par `service_role`, dans la transaction de
  l'étape. La base vérifie à ce moment-là que l'instantané correspond au contenu **exact** de la
  commande ;
- les factures fournisseurs et leurs règlements (les pièces comptables) sont **prouvés
  inchangés** à chaque étape.

**Pourquoi ce n'est pas `LEGAL DECISION REQUIRED`.** Pour les contrats acceptés, la question
juridique ouverte porte sur la **durée** de conservation, parce que l'instantané d'un devis garde
l'identité imprimée d'un client, souvent un particulier. C'est une donnée personnelle, et
l'art. 5.1.e impose une durée. Ici, c'est la liste blanche qui fait la différence : l'instantané
d'une commande ne garde ni notes, ni auteur, ni salarié, ni chantier, ni description libre, ni
nom ou coordonnées du fournisseur, et la base le prouve (§5, pgTAP §8). Conserver ce qui reste,
des données commerciales non personnelles, ne relève donc pas de l'art. 5.1.e. Cette
conservation suit deux règles déjà actées :
- le principe V2 : « toute ambiguïté de rétention est résolue par défaut vers la conservation » ;
- le régime, non daté, des pièces comptables fournisseurs, déjà RETAIN.

La classification V2 (`commandes_fournisseurs` et `lignes_commande` en DELETE) n'est pas changée.

**Ce que ce verdict ne dit pas :**
- Une purge **complète** d'un tenant réel qui a aussi signé un devis reste arrêtée par
  `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT`. C'est la décision déjà nommée du train V3,
  sans lien avec les commandes. Prouvé sur le tenant réaliste et sur le pilote : les commandes ne
  figurent plus parmi les causes, seules restent les tables contrats (§8).
- Une décision est à confirmer par le propriétaire, **non bloquante** : le passage de
  `reglements_fournisseurs` en RETAIN (§6, D2). Il était imposé par l'intégrité d'une table déjà
  RETAIN, mais `src/lib/rgpd.ts` demande que toute liste RETAIN soit confirmée.

La reproduction a aussi révélé **trois défauts réels**, que le refus « sûr » de CM-06 masquait.
Tous sont corrigés et testés :

| | Défaut | Gravité |
|---|---|---|
| **D1** | La purge vidait `lignes_commande` **avant** de buter sur la commande. Le recalcul ramenait chaque commande confirmée ou reçue à **0 ligne et 0 €**, statut inchangé : la commande restait en base, amputée, ni conservée ni supprimée. | Élevée (intégrité) |
| **D2** | `reglements_fournisseurs` (DELETE) était purgée alors que `depenses_fournisseurs` (facture fournisseur, RETAIN) est conservée. Le recalcul **réécrivait la pièce comptable conservée** : pilote `ACH-PILOTE-001` passée de `payee` 5 724 € à `a_payer` 0 €. L'export comptable des achats était faux. | Élevée (comptable) |
| **D3** | Hors purge, un utilisateur avec `gerer_achats` pouvait modifier une commande **reçue** en PostgREST direct : numéro, montants, fournisseur, ajout de lignes. Il pouvait aussi la **repasser en brouillon puis la supprimer**, ce qui contournait CM-06. | Élevée (sécurité, §7 de la mission) |

---

## 1. Base

Branche `claude/amazing-johnson-d7nzps`, remise à zéro sur `origin/integration/elsatia-canonical-train-v3`
(`ef7443c0`) ; la branche ne portait aucun commit propre (même base que `main` @ `4d92ddbe`).
V3 neuve : `rebuild_db.sh v3_fresh` → **340/340**.

## 2. Reproduction

Tenant réaliste construit **par les chemins applicatifs**, sous l'identité de l'administrateur
du tenant (`supabase/tests/fixtures/rgpd_tenant_commandes_fournisseurs.inc`, combiné aux
fixtures factures et contrats du train) :

| Élément | Construction |
|---|---|
| Fournisseur | société, contact nommé, e-mail, téléphone, SIRET, notes avec un portable |
| Commande brouillon | `creer_commande_fournisseur` |
| Commande confirmée | brouillon → `envoyee` → `confirmee` (`changer_statut_commande`), notes internes avec nom et téléphone d'un particulier, description de ligne |
| Commande reçue | `envoyee` → réception complète (`enregistrer_reception_commande`, clé d'idempotence) |
| Commande reçue partiellement | réception partielle + réception par lot (`enregistrer_reception_lot`, entrée de stock) |
| Commande annulée | `envoyee` → `annulee` |
| Facture fournisseur | `depenses_fournisseurs` rattachée à la commande reçue |
| Paiement | `reglements_fournisseurs` : 300 € (facture → `payee_partiel`) |
| Documents | signature interne d'un salarié sur la commande reçue (`signatures_documents`) + image Storage |
| Audit | `journal_activite`, `platform.purge_audit` |
| Isolation | tenant B : fournisseur + commande confirmée ; + seed pilote GP (`SARL Bati-Rhone`, 4 commandes, 2 factures fournisseurs, 1 règlement) |

**Blocage reproduit sur V3 (T0, sans `…506`)** — politique contrats activée avec une durée de
**test** dans la base jetable, pour isoler les commandes (harnais §10, étape 1) :

```
   tenant a0000000-0000-0000-0000-000000000001
     avant : commandes CMD-2026-002=confirmee/1101.60€/2l CMD-2026-003=recue/973.92€/2l CMD-2026-004=recue_partiel/315.60€/2l ; factures fournisseurs FAC-NMR-2026-0457=payee_partiel/300.00€
     purge : incomplete:commandes_fournisseurs ; causes : commandes_fournisseurs:COMMANDE_SUPPRESSION_STATUT_INTERDIT
     après : commandes CMD-2026-002=confirmee/0.00€/0l CMD-2026-003=recue/0.00€/0l CMD-2026-004=recue_partiel/0.00€/0l ; factures fournisseurs FAC-NMR-2026-0457=a_payer/0.00€
   tenant 337c80c3-… (pilote GP)
     avant : commandes CMD-PILOTE-001=recue/4536.00€/2l CMD-PILOTE-002=recue_partiel/831.00€/2l CMD-PILOTE-003=confirmee/2880.00€/1l ; factures fournisseurs ACH-PILOTE-001=payee/5724.00€ ACH-PILOTE-002=a_payer/0.00€
     purge : incomplete:commandes_fournisseurs ; causes : commandes_fournisseurs:COMMANDE_SUPPRESSION_STATUT_INTERDIT
     après : commandes CMD-PILOTE-001=recue/0.00€/0l CMD-PILOTE-002=recue_partiel/0.00€/0l CMD-PILOTE-003=confirmee/0.00€/0l ; factures fournisseurs ACH-PILOTE-001=a_payer/0.00€ ACH-PILOTE-002=a_payer/0.00€
   D3 (administrateur du tenant, PostgREST direct) : commande reçue → brouillon puis supprimée ; reste D3=0
```

Le blocage du train est reproduit. Les lignes « après » montrent **D1** (0 ligne, 0 €) et **D2**
(facture fournisseur réécrite), et la dernière ligne montre **D3**. Sans décision contrats, la
purge s'arrête aussi sur les contrats. Les commandes sont touchées de la même façon, puisque
l'ordre de purge ne dépend pas des contrats.

## 3. Classification : ce qu'est une commande fournisseur dans le produit

| Nature | Oui / non | Faits (code) |
|---|---|---|
| **Preuve commerciale** | **Oui** | Bon de commande numéroté (`CMD-AAAA-NNN`, `next_reference`), imprimé (`src/app/imprimer/commandes/[id]/page.tsx` : numéro, dates, fournisseur, lignes avec description, totaux, signatures), signable en interne (`signatures_documents`, `type_document = 'commande'`). Le PDF lit la fiche **vivante** du fournisseur et de l'entreprise (pas d'instantané). |
| **Document contractuel** | **Oui, à partir de `confirmee`** (accord du fournisseur) | Mais le statut `confirmee` est une **saisie interne**. La base ne contient aucune preuve de l'acceptation par le fournisseur (ni signature, ni échange), comme `devis.accepte`. |
| **Document logistique** | **Oui** | `quantite_recue` par ligne, statut `recue_partiel`/`recue`, `receptions_idempotence`, `mouvements_stock.ligne_commande_id`, rattachement article ↔ ligne. |
| **Preuve comptable** | **Non (dans le produit)** | Aucune écriture, et absente de l'export comptable (`src/app/api/exports/comptabilite/route.ts` ne lit que `depenses_fournisseurs`). La pièce comptable est la **facture fournisseur** (`depenses_fournisseurs`, RETAIN), qui cite la commande par `commande_id` (FK SET NULL + instantané F8). La commande en est au plus un **justificatif annexe**. |

Données personnelles réellement portées :
- sur la commande : `notes` (texte libre), `cree_par_utilisateur_id`, `cree_par_employe_id`, `chantier_id` (le chantier d'un particulier) ;
- sur les lignes : `description` (texte libre, imprimé) ;
- **pas** sur la commande elle-même : le contact, l'e-mail et le téléphone du fournisseur, qui
  vivent dans `fournisseurs` (ANONYMIZE depuis V2).

## 4. Options comparées

| | A. Conserver intégralement | B. Conserver une version minimisée **en place** | C. Instantané immuable (minimisé) + suppression des objets actifs | D. Supprimer après preuve (empreinte seule) |
|---|---|---|---|---|
| **Intégrité (§6)** | Totale | **Détruite** : réécrire une commande confirmée | Totale : contenu minimisé + empreinte du document **exact**, vérifiée dans CM-06 au moment de la suppression | **Perdue** : articles, quantités, réception disparaissent |
| **Sécurité (§7)** | Suppose un verrou (absent : D3) | **Contradiction** : il faut ouvrir la commande à l'écriture | Aucune ouverture : seule la suppression est admise, pendant la purge, avec preuve | idem C |
| **RGPD** | Garde notes, auteur, salarié, chantier | Bon, mais incompatible avec §7 | **Aucune donnée personnelle** dans l'instantané (liste blanche prouvée) | Minimal |
| **Liens comptables** | Intacts | Intacts | Facture fournisseur inchangée (empreinte), numéro de commande en F8, pièces citées dans l'instantané | F8 seul (numéro) |
| **Complexité** | **Élevée** : rétention par ligne dans une table DELETE, lignes « fantômes » d'un tenant purgé | Élevée | **Moyenne** : même architecture que les contrats (R1, empreinte, table `platform`) | Faible |
| **Décision juridique requise** | Oui (conserver des données personnelles : durée) | Oui | **Non** : rien de personnel n'est conservé | Oui : c'est une suppression de preuve contractuelle |

**Choix : C.** Elle reprend de D l'empreinte du document complet, qui permet d'authentifier la
copie restituée par l'export RGPD. Les autres options sont écartées :
- A garde des données personnelles et laisse des lignes dans les tables métier d'un tenant purgé ;
- B contredit §7 ;
- D perd ce que §6 demande de préserver, et **supprimerait** une preuve contractuelle, ce qui
  serait, lui, une décision juridique.

## 5. Minimisation

Liste **blanche** (`public._commande_minimisee`). Une colonne ajoutée plus tard n'est jamais
conservée d'office.

| Donnée | Instantané | Où elle reste après la purge |
|---|---|---|
| numéro, statut, date de commande, date de livraison prévue | **conservée** | — |
| montants HT / TVA / TTC | **conservée** | — |
| lignes : désignation, quantité, unité, PU HT, taux de TVA, quantité reçue, `article_id` | **conservée** | — |
| réception : quantité commandée / reçue, complète | **conservée** | — |
| pièces comptables liées : id, numéro de pièce, date, montants | **conservée** | `depenses_fournisseurs` (RETAIN) |
| signatures : id, `document_sha256`, date | **conservée** | `signatures_documents` (RETAIN, nom du signataire compris : comportement V2 inchangé) |
| fournisseur : id + référence interne (`FRN-0001`) | **conservée** | fiche `fournisseurs` ANONYMIZE (nom gardé, contact/e-mail/téléphone/adresse/SIRET/notes vidés) |
| **contact, e-mail, téléphone** du fournisseur | retirée | vidés par l'anonymisation V2 |
| **notes** | retirée (booléen `non_conserve.notes`) | supprimées avec la commande |
| **utilisateur / salarié auteur** | retirée (booléen) | — |
| **descriptions** de lignes (texte libre) | retirée (compteur) | — |
| **chantier** | retiré | — |
| nom et fonction du signataire | retirés | `signatures_documents` |
| **metadata** (`created_at`, `updated_at`) | retirées | — |

Preuve, pgTAP §8 : aucune des 18 valeurs personnelles de la fixture (contact, e-mail, deux
téléphones, adresse, SIRET, nom du particulier et son téléphone, nom et identifiant du salarié,
identifiant de l'utilisateur, identifiant du chantier, notes, descriptions) n'apparaît dans
aucun instantané.

**Risque résiduel, signalé, non bloquant** : la désignation d'une ligne est un texte libre
(« Carrelage SDB M. X » reste possible). C'est le même résidu que `lignes_factures`, déjà RETAIN.
La supprimer contredirait §6 (« articles »).

## 6. Intégrité

| Exigence (§6) | Mise en œuvre | Preuve |
|---|---|---|
| numéro, date, statut | instantané | pgTAP §7 : champ à champ, 4/4 commandes |
| articles, quantités, TVA | instantané (lignes) | pgTAP §7 : lignes identiques, 4/4 |
| montants | instantané | idem |
| réception | `quantite_recue` par ligne + synthèse | `CMD-2026-004` : 17 / 80, non complète |
| liens comptables | `pieces_comptables` dans l'instantané ; F8 dans la facture fournisseur (`purge_snapshot.commande_id.libelle = CMD-2026-003`) | pgTAP §7 |
| document complet | `empreinte_document` = SHA-256 de la commande entière (`to_jsonb`) + lignes + signatures + pièces | égale à l'empreinte calculée avant purge, 4/4 |
| **D1** : jamais amputée | l'étape `lignes_commande` ne supprime que les lignes des **brouillons** ; les autres partent en cascade avec leur commande | purge : `lignes_commande` 0 ligne supprimée seule, puis tout en cascade |
| **D2** : pièces comptables inchangées | `reglements_fournisseurs` → **RETAIN** + garde-fou `empreinte_comptable_fournisseurs_entreprise` avant/après **chaque** étape (comme R3) : un écart annule l'étape | facture `payee_partiel` 300 € conservée ; pilote `payee` 5 724 € conservée ; empreinte identique |

`reglements_fournisseurs` RETAIN est **symétrique** de `paiements` (RETAIN depuis V2). Une autre
option aurait été de supprimer les règlements en figeant `montant_regle` et le statut. Elle
aurait laissé une facture « payée » sans aucun règlement, donc falsifiée. À confirmer par le
propriétaire (voir `src/lib/rgpd.ts`, « périmètre proposé… à faire confirmer »).

## 7. Sécurité

**PO-1, verrou des commandes engagées** (statut autre que `brouillon`), sur **tous** les rôles, y compris en SQL direct :

| Autorisé | Refusé (`COMMANDE_ENGAGEE_VERROUILLEE`) |
|---|---|
| transitions du produit (`TRANSITIONS_COMMANDES` ∪ réception) : `envoyee → confirmee/recue_partiel/recue/annulee`, `confirmee → recue_partiel/recue/annulee`, `recue_partiel → recue/annulee` | toute autre transition, dont `recue → brouillon` et `recue → annulee` (D3) |
| `updated_at` | numéro, montants, fournisseur, dates, notes, auteur, **toute colonne future** |
| délien d'un chantier / auteur **réellement supprimé** (FK SET NULL) | rattachement à un autre chantier |
| lignes : `quantite_recue` et article `NULL → valeur` (commande envoyée/confirmée/partielle) | ajout, suppression hors cascade, toute autre modification de ligne |

Les RPC du produit (statut, réception, réception par lot, scan) sont inchangées et passent
(`gp_reception_commande_stock_transactionnel_v1` 66/66). Un brouillon reste librement modifiable.

**PO-3, exception CM-06 bornée.** Suppression d'une commande engagée admise **uniquement** avec :
- l'autorisation R1 (`platform.purge_autorisations_facture`) liée à `txid_current()`, à
  l'entreprise et à la table `commandes_fournisseurs`. Seule `purger_table_entreprise` la dépose
  (EXECUTE `service_role` seul, échéance échue vérifiée), et elle la retire avant de rendre la
  main. Pas de GUC ;
- un instantané dont l'empreinte est égale à celle du contenu **actuel**, recalculée dans le trigger.

| Cas (pgTAP) | Résultat |
|---|---|
| administrateur du tenant : montants, numéro, notes, retour en brouillon, annulation d'une reçue, ajout de ligne, suppression | refusés |
| SQL direct (propriétaire) : prix d'une ligne reçue, suppression d'une ligne hors cascade | refusés |
| `service_role` hors purge : DELETE direct | `42501` |
| `service_role` : TRUNCATE commandes / règlements | refusé (PO-5, 4 tables) |
| `service_role` : `_preserver_commandes_fournisseurs`, lecture directe des instantanés | `42501` |
| purge avant échéance | `ok = false` |
| instantané périmé (réception après l'instantané) + autorisation | suppression **refusée** |
| instantané à jour **sans** autorisation | suppression **refusée** |
| instantané à jour + autorisation | admise |
| instantanés : UPDATE / DELETE / TRUNCATE | refusés (aucune échéance posée) |

## 8. Purge

| Exigence | Preuve |
|---|---|
| **service_role only** | ci-dessus ; 16 fonctions nouvelles : aucune exécutable par `anon` ni `authenticated` ; 3 par `service_role`, en lecture seule (empreinte comptable fournisseurs, rapport, lecture des instantanés) ; l’écriture passe uniquement par `purger_table_entreprise` |
| **transaction bound** | R1 `txid_current()` ; aucune autorisation résiduelle après une étape en échec (pgTAP §5) |
| **audit** | `preuve_commandes_fournisseurs` (empreintes par commande) ; chaque étape consigne `controle_factures_fournisseurs = empreinte_inchangee` ; preuve hors base `preuve_purge_entreprise.commandes_fournisseurs` (4 empreintes) |
| **rollback** | effet de bord simulé sur la facture fournisseur pendant l'étape : `ok = false`, cause auditée (« Garde-fou comptable fournisseurs… »), **0 instantané, 0 commande supprimée** |
| **replay after restore** | §9 |

Résultats (base upgradée, harnais §10, étape 3) :

| Tenant | Politique contrats livrée (`duree_requise`) | Politique contrats activée (durée de TEST, base jetable) |
|---|---|---|
| A réaliste (3 engagées + brouillon + annulée, facture + règlement, signature, devis/avenant acceptés) | `incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis`. **Seule cause : `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT`**. Commandes supprimées, 3 instantanés, facture fournisseur inchangée | **`complete`**, marquée purgée, 3 instantanés, facture fournisseur `payee_partiel` 300 € inchangée |
| Pilote GP (3 engagées, 2 factures fournisseurs dont une payée) | `incomplete:lignes_devis,chantiers,devis`. Même seule cause contrats | **`complete`**, `ACH-PILOTE-001 = payee/5724 €` inchangée |

Partout : factures clients inchangées, factures fournisseurs et règlements inchangés
(empreinte), autres tenants inchangés.

## 9. Sauvegarde, restauration, rejeu

Pour chacune des **4 exécutions** : `pg_dump` → purge → E1 → `pg_restore` dans une base neuve → rejeu → E2.

| | A livrée | Pilote livrée | A activée | Pilote activée |
|---|---|---|---|---|
| erreurs `pg_restore` | 0 | 0 | 0 | 0 |
| base restaurée | commandes réapparues, 0 instantané, audit du run perdu | idem | idem | idem |
| **rejeu = purge d'origine** | **IDENTIQUE** | **IDENTIQUE** | **IDENTIQUE** | **IDENTIQUE** |
| relance sur la même base | état inchangé | état modifié ¹ | état inchangé | état inchangé |

L'empreinte d'état couvre :
- factures clients (contenu comptable) ;
- factures fournisseurs, avec leur `purge_snapshot` hors horodatage ;
- règlements et fiches fournisseurs ;
- rapport de purge ;
- entreprise, fichiers Storage ;
- instantanés de contrats et de commandes, avec leurs empreintes.

Les instantanés sont déterministes (UTC, tri stable) : le rejeu produit **les mêmes empreintes
de document et de contenu**.

¹ Préexistant, **sans lien avec les commandes**. Une purge **incomplète** (contrats) ne passe pas
par le balayage final du déroulé. Les 300 lignes `affectations_historique`, recréées par trigger
quand les affectations sont supprimées, ne sont donc retirées qu'à la relance suivante (audit du
second run : `affectations_historique 300`). La purge complète converge (colonnes « activée »).
Signalé pour le lot de rétention, non corrigé ici.

## 10. Export RGPD

`exporter_donnees_entreprise` (`…505`) parcourt les tables qui portent `entreprise_id`.
`commandes_fournisseurs`, `lignes_commande`, `depenses_fournisseurs`, `reglements_fournisseurs`
et `fournisseurs` en portent toutes une : elles sont exportées **sans changement** (pgTAP §4).

| Contrôle | Résultat |
|---|---|
| toutes les commandes du tenant (tous statuts) | ✅ nombre = base |
| toutes les lignes | ✅ nombre = base |
| factures fournisseurs, règlements, fournisseurs | ✅ présents |
| commande complète (notes, auteur) | ✅ : l'export restitue **tout**, la minimisation ne vaut que pour la purge |

L'export (CGV 10.1, restitution) est la copie complète que l'`empreinte_document` de l'instantané
permet d'authentifier plus tard. Aucune table enfant sans `entreprise_id` n'est concernée : pas
de correctif d'export nécessaire.

## 11. Tests

| Suite | Base | Résultat |
|---|---|---|
| Fresh | 341 migrations, base vide | **341/341**, 0 erreur |
| Upgrade V3 (340) + données → `…506` | jeu réaliste : 4 fixtures RGPD + seed pilote, 247 tables, 40 utilisateurs | ✅ 0 erreur, 0 warning ; comptes : **0 écart** (1 table nouvelle, vide) ; empreintes métier **57/57 identiques** ; RLS et 599 policies inchangées ; sonde RLS **0 écart** ; droits de table 0 changé ; EXECUTE existants 0 changé ; 16 fonctions nouvelles : 0 pour anon/authenticated, 3 (lecture) pour service_role |
| Schéma upgrade vs fresh | `pg_dump -s`, ACL comprises | ✅ **IDENTIQUE** (28 626 lignes) |
| `rgpd_purge_commandes_fournisseurs_v1` (nouvelle) | fresh | **75/75** (sans `…506` : ne s'exécute pas) |
| `cm06_suppression_commande_fournisseur_statut` (adaptée ²) | fresh | **13/13** (sans `…506` : 11/13) |
| `gp_reception_commande_stock_transactionnel_v1` (adaptée ²) | fresh | **66/66** (sans `…506` : 65/66) |
| RGPD, purge, isolation, numérotation (15 autres suites) | fresh | toutes propres, 601/601 pour les 17 suites du harnais |
| pgTAP maximal (une base neuve par fichier) | fresh | **125/134** propres, 3 259 ok, 14 not ok. V3 : 124/133, 3 181 ok, 14 not ok. Les 9 fichiers non propres sont **les mêmes** que sur V3 (7 Studio, `r72` pgsodium, Tools cloud sync) |
| Vitest (Gestion Pro) | — | **1 854/1 854** (`rgpd.test.ts` : miroir TS = dernière définition SQL) |
| typecheck · eslint | — | ✅ · 0 erreur (15 warnings préexistants) |
| `verify:migrations` · `verify:secrets` · `verify:train-expectations` · `test:preview-pack` | — | 341 valides · aucun secret · attendus resynchronisés (341 / `…506`) · 27/27 |

² **Deux assertions existantes changent de sens, volontairement.** Chacune figeait le trou D3 :

- **Ancien test CM-06 n° 8.** Il posait qu'« annuler une commande reçue (UPDATE direct) reste
  possible, et la rend supprimable ». Le produit l'interdit pourtant (`recue: []` dans
  `TRANSITIONS_COMMANDES`, `changer_statut_commande` refuse). C'était précisément le
  contournement de CM-06. Nouvelle version :
  - annuler une commande **confirmée** reste possible, puis supprimable (8, 8b) ;
  - annuler une commande **reçue** est refusé, et elle reste non supprimable (8c, 8d).
- **Test FK de la réception (65).** Il changeait l'article d'une ligne déjà reliée d'une commande
  **reçue**. C'est désormais refusé par le verrou, ce qui fait l'objet d'une nouvelle assertion.
  La FK composite est prouvée sur une ligne de brouillon, le seul état où l'article peut encore
  changer.

Aucun test n'est supprimé ni désactivé.

## 12. Décisions et points ouverts

| ID | Nature | État | Effet |
|---|---|---|---|
| `DECISION_REQUIRED:RGPD-PURGE-VS-COMMANDE-FOURNISSEUR` (V3 §12) | — | **Fermée techniquement** par `…506` | les commandes ne bloquent plus aucune purge |
| `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` | juridique (V3), inchangée | ouverte | reste la seule cause d'une purge incomplète d'un tenant qui a signé un devis |
| Confirmation `reglements_fournisseurs` RETAIN | propriétaire, non bloquante | à confirmer | alternative : aucune qui ne falsifie la facture fournisseur conservée (§6) |
| Durée de conservation des instantanés de commandes | non requise au titre du RGPD (aucune donnée personnelle) | `conserver_jusqu_au = NULL` : régime des pièces comptables, non daté (point préexistant « conservation des factures par l'éditeur », rapport factures V1 §10) | si une durée est fixée pour les pièces comptables, une migration pourra la poser (le trigger d'immutabilité admet déjà la suppression après échéance) |
| Désignations libres des lignes | résiduel | signalé | même résidu que `lignes_factures` (RETAIN) |
| Le bon de commande imprimé lit la fiche **vivante** du fournisseur et de l'entreprise | préexistant, hors purge | **fermé** par `…507` (`ELSATIA_RGPD_PURGE_RESIDUAL_DEBT_CLOSURE_V1.md`) | identité imprimée figée à la sortie du brouillon |
| `affectations_historique` après purge incomplète | préexistant | **fermé** par `…507` (`ELSATIA_RGPD_PURGE_RESIDUAL_DEBT_CLOSURE_V1.md`) | §9 ¹ : la purge n'historise plus ses propres suppressions ; balayage final aussi en cas d'échec |
| Fichiers Storage binaires, GoTrue, Supabase hébergé | exécution distante | NOT PROVEN localement | même réserve que les lots précédents |
| Numérotation | à noter pour la suite | — | `…506` suit `…505` ; les branches en vol listées par V3 (`…401` Tools, `…347` Réserves) devront être renumérotées **après `…506`** |

## 13. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260926000506_rgpd_purge_commandes_fournisseurs_reconciliation.sql` | PO-1 à PO-6 |
| `supabase/tests/rgpd_purge_commandes_fournisseurs_v1.test.sql` | pgTAP, 75 assertions |
| `supabase/tests/fixtures/rgpd_tenant_commandes_fournisseurs.inc` | tenant réaliste, chemins applicatifs |
| `supabase/tests/cm06_suppression_commande_fournisseur_statut.test.sql`, `gp_reception_commande_stock_transactionnel_v1.test.sql` | assertions adaptées (²) |
| `scripts/qualification/rgpd-purchase-orders-v1.sh` | harnais : T0, upgrade, fresh, DR, pgTAP |
| `scripts/local-postgres-bootstrap/upgrade_snapshot.py` | + `lignes_commande`, `fournisseurs`, `receptions_idempotence` (empreintes), + 4 tables achats (sonde RLS) |
| `scripts/purger-entreprise.mjs` | `dry-run`/`verify` affichent les commandes engagées et les instantanés |
| `src/lib/rgpd.ts` | miroir `TABLES_CONSERVEES_PURGE` + `reglements_fournisseurs` |
| DB verify, pack, runbook V3, rapport V3 | attendus générés resynchronisés (`npm run sync:train-expectations`) |

## 14. Reproduire

```bash
git checkout claude/amazing-johnson-d7nzps && npm ci
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap
# Base V3 SANS 506 (modèle du harnais) :
mv supabase/migrations/20260926000506_*.sql /tmp/ && scripts/local-postgres-bootstrap/rebuild_db.sh v3_fresh && mv /tmp/20260926000506_*.sql supabase/migrations/
scripts/qualification/rgpd-purchase-orders-v1.sh v3_fresh /var/tmp/po-v1     # T0, upgrade, fresh, DR, pgTAP ciblé
scripts/qualification/pgtap-run-v3.sh po_fresh                                # pgTAP maximal (125/134)
```
