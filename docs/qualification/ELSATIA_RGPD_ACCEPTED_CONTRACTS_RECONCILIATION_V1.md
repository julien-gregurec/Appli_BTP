# ELSATIA — Réconciliation RGPD × contrats acceptés (devis, avenants) — V1

Date : 2026-09-26 · Branche : `claude/beautiful-archimedes-sc6t9g`
Base : `integration/elsatia-canonical-train-v2` @ `819ebe56` (train canonique V2, 335 migrations)
\+ portage du lot « factures émises » (`e0de3dd8`, migration renumérotée `20260926000401`).
Aucun texte légal modifié. Aucune décision juridique prise.

## Verdict

```
LEGAL DECISION REQUIRED
```

**Côté technique, plus rien ne bloque.** La migration `20260926000402` met en place un
mécanisme de purge des contrats acceptés, piloté par une **politique**. Les deux stratégies
réalistes y sont **implémentées, testées et rejouables à l'identique après restauration** :

- **C — `conserver_contrat_minimise`** : un instantané immuable et minimisé de chaque contrat
  est figé, avec une échéance, puis les objets métier sont supprimés ;
- **D — `supprimer_apres_preuve`** : seule une preuve minimale, qui n'identifie personne
  (numéro, dates, montants, empreinte SHA-256), est gardée, puis le contrat est supprimé.

La politique livrée est **`non_decidee`**, et ce n'est **pas activé**. Pour un tenant réel qui a
signé un devis, la purge reste incomplète, mais **sans danger et avec une cause explicite**
(`DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE`, consignée dans l'audit, avant toute
écriture). Le choix entre C et D, ou une autre réponse, porte sur ce qu'il est
**légalement obligatoire ou permis de conserver**. Ce n'est pas une question technique :
aucune des deux options n'est techniquement supérieure à l'autre (§4). Une fois la décision
prise, l'activation tient en une ligne de migration (§11).

```
Purge RGPD d'un tenant réel avant Preview : LEGAL DECISION REQUIRED (C ou D, prêts)
Sans décision : purge incomplète, explicite et sûre (défaut)
```

Ce lot corrige aussi trois **défauts réels trouvés en reproduisant le cas** ; ils ne
dépendent d'aucune décision :

1. Sur le train actuel, la purge **supprime déjà les photos et notes vocales d'un devis
   accepté** alors que le devis lui-même reste bloqué : `pieces_jointes_devis` n'a pas de
   verrou. Reproduit sur T0 : 2 pièces avant la purge, 0 après (§2).
2. `service_role` a le droit **TRUNCATE** sur `devis`, `lignes_devis`, `avenants`,
   `lignes_avenants` et `pieces_jointes_devis`. TRUNCATE ne déclenche pas les verrous de
   ligne : c'est l'**unique** écriture qui pouvait effacer un contrat accepté sans preuve.
   C'est le même trou que celui fermé par R8 pour les factures.
3. Le planificateur applicatif (`src/lib/rgpd-purge-planificateur.ts`, désactivé par
   défaut) n'avait pas le balayage final avant marquage. Le rapport factures V1 l'avait
   signalé (« à faire au portage »). Dès qu'un devis peut être supprimé, le marquage aurait
   toujours échoué.

Réserve de périmètre, identique aux lots précédents : PostgreSQL 16 local et amorce Supabase
minimale (`scripts/local-postgres-bootstrap/`). Rien n'a été exécuté contre un Supabase
hébergé, ni contre le Storage réel : les fichiers sont simulés par `storage.objects`.

---

## 1. Base et lectures

| Élément | Référence | Utilisation ici |
|---|---|---|
| Train canonique V2 | `integration/elsatia-canonical-train-v2` @ `819ebe56` | Base. 335 migrations, dernière `20260923000400`. Contient RGPD Purge V2 (`…331`) et Data Retention / Backup Consistency V1 (`…400`). |
| RGPD Invoice Immutability Reconciliation V1 | `claude/great-curie-i94633` @ `1011ce37`, construit sur le train **V1** | **Porté** sans conflit (commit `e0de3dd8`). `…347` devient `…401` : le train V2 réservait 347, mais sa dernière migration est 400 ; garder 347 aurait cassé la montée de version monotone (`supabase db push` refuse sans `--include-all`). Aucune fonction de 347 n'est redéfinie par 350–400 (vérifié). |
| Data Retention Backup Consistency V1 | `…400` (dans le train V2) | Preuve hors base `preuve_purge_entreprise`, rejeu après restauration, planificateur. Étendus ici (P6, balayage final). |
| RGPD Purge V2 | `…331`, rapport `ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2` | Classification DELETE / ANONYMIZE / RETAIN par table, `purge_snapshot` (F8), audit `platform.purge_audit`. Inchangés. |
| Textes légaux | `docs/juridique/` | Lus, **non modifiés**. Voir §11. |

Ce que disent les textes, et ce qu'ils ne tranchent pas :

- **DPA** (`dpa-entreprises-clientes.md`, §5 point 8) : au terme du contrat, l'éditeur, en tant
  que **sous-traitant**, doit « supprimer ou restituer les données selon le choix du
  Responsable […] sauf obligation légale de conservation ».
- **CGV art. 10** : le client peut exporter ses données (10.1) et dispose de 30 jours pour les
  récupérer, puis elles sont supprimées « sous réserve des obligations légales de
  conservation (notamment comptables) » (10.2).
- **Politique de confidentialité §4** et **registre** : la conservation de 10 ans vise la
  facturation **de l'abonnement Elsatia**, pour laquelle l'éditeur est responsable de
  traitement. Elle ne vise pas les devis des clients du client.

Aucun texte ne dit si un devis ou un avenant accepté relève d'une « obligation légale de
conservation » **qui pèserait sur l'éditeur**. C'est l'objet de la décision.

---

## 2. Reproduction

Le tenant réaliste est construit par les chemins applicatifs, sous l'identité de
l'administrateur du tenant : `fixtures/rgpd_tenant_facture_emise.inc` (lot factures), complété
par le nouveau `fixtures/rgpd_tenant_contrats_acceptes.inc`.

| Élément | Contenu |
|---|---|
| Client | particulier, adresse, téléphone, e-mail ; **contact principal** (nom, e-mail, téléphone) |
| Devis accepté n° 1 | 3 lignes, brouillon → envoyé → **accepté** ; porte l'acompte, la finale et l'avoir |
| Devis accepté n° 2 | 2 lignes, conditions, note au client, **notes internes** avec un numéro de téléphone, adresse d'envoi de l'e-mail, **photo** et **note vocale** (bucket `devis-medias`), **signature interne** d'un salarié (`signatures_documents`) |
| Avenant accepté | `creer_avenant` → envoyé → **accepté** (l'acceptation enregistre date et utilisateur) |
| Acompte 30 %, finale 70 %, avoir 10 % | `creer_facture_avancee`, émis |
| Paiements | acompte soldé, finale partiellement réglée |
| Chantier, documents, Storage | chantier géolocalisé, document de chantier, logo |
| Audit | `journal_activite`, `platform.purge_audit` |
| Isolation | tenant B complet (`isolation_multitenant.inc`), qui a aussi un devis accepté |

**T0 : train V2 seul** (harnais §8, étape 1) :

```
   contrats acceptés du tenant A : 3 devis, 1 avenant(s)
   purge : incomplete:avenants,lignes_devis,chantiers,devis
   échec avenants : Cet avenant est accepté et ne peut plus être supprimé.
   échec chantiers : Cette facture a déjà été émise et ne peut plus être modifiée.
   échec devis : Cette facture a déjà été émise et ne peut plus être modifiée.
   échec lignes_devis : Ce devis est accepté et ne peut plus être modifié.
   pièces jointes du devis accepté restantes après la purge T0 : 0 (2 avant)
```

- Le blocage « facture » est bien celui que le lot factures a fermé (`…401`).
- Le blocage « contrat » est reproduit : `avenants` et `lignes_devis`, puis `devis` et
  `chantiers` une fois `…401` appliquée.
- **Défaut 1** : la purge a supprimé les deux pièces jointes (photo et note vocale) d'un
  devis qu'elle n'a pas pu supprimer. Le contrat est amputé, sans preuve, et sans que
  personne l'ait décidé.

---

## 3. Ce qu'est un « contrat accepté » dans l'application (faits vérifiés)

| Fait | Source | Conséquence |
|---|---|---|
| Aucune acceptation par le client lui-même : le statut `accepte` est une **saisie interne** d'un membre (`changerStatutDevisAction`), qui enregistre un accord obtenu hors de l'application | `20260922000311` (en-tête) | La base ne contient **pas** la preuve du consentement du client (pas d'IP, pas de texte accepté, pas de signature client). Elle contient le **contenu** du contrat tel que l'entreprise l'a saisi. |
| `devis` n'a **ni date ni auteur d'acceptation** (seule une ligne `journal_activite`, table RETAIN, trace l'événement) ; `avenants` a `date_acceptation` et `accepte_par` | schéma | La preuve D garde la date d'émission du devis. C part de la date d'émission pour le devis et de la date d'acceptation pour l'avenant (§11). |
| Le PDF du devis imprime : identité émettrice figée, identité client figée (nom affiché, adresse, SIRET), lignes, totaux, note au client, signatures internes, **photos** (`type_media = image`). **Il n'imprime pas** les conditions, les notes internes, l'e-mail ni le téléphone du client, le chantier | `src/lib/documents-commerciaux.ts:49-120`, `client-snapshot.ts:83` | Base de la minimisation (§7). |
| Les pièces jointes d'un devis sont des **photos et des notes vocales** (contrainte `mime_type`), pas des scans signés | contraintes `pieces_jointes_devis` | La voix est une donnée personnelle et ne fait pas partie du document : jamais conservée. Les photos imprimées ne le sont que si la décision le prévoit. |
| Les avenants n'ont **ni écran ni PDF** : seulement la RPC `creer_avenant` | `src/` (aucune occurrence) | Le contrat d'un avenant, c'est sa ligne et ses `lignes_avenants`. |
| `signatures_documents` (RETAIN, immuable) : signature **interne d'un salarié**, avec `document_sha256` calculé par l'application | `20260718000102` | Conservée dans tous les cas. C et D gardent la référence (id + empreinte). |
| `exporter_donnees_entreprise` (restitution, CGV 10.1) ne parcourt que les tables qui ont `entreprise_id` : **`lignes_avenants` n'y figure pas** | `20260922000310` | Constat ouvert (§12). Il compte pour D, où la restitution au client serait la seule copie complète. |
| `service_role` : aucun INSERT, UPDATE ni DELETE sur les tables des contrats, mais **TRUNCATE** sur les 5 | `information_schema.role_table_grants` | **Défaut 2**, corrigé (P7). |
| Verrous : `authenticated` ne peut modifier ni supprimer un devis ou un avenant accepté, ni leurs lignes | `…210`, `…213`, `…272` | Inchangés hors purge. |

---

## 4. Options comparées

| | A. Conservation intégrale | B. Conservation + anonymisation en place | C. Instantané immuable + suppression des objets actifs | D. Suppression totale après preuve | E. Tombstone / pseudonymisation |
|---|---|---|---|---|---|
| **Intégrité** | Totale (lignes intactes) | **Détruite** : réécrire un contrat signé | Totale : empreinte du contenu **exact**, vérifiée dans le verrou au moment de la suppression | Empreinte seule | Faible (identifiants seuls) |
| **Preuve juridique** | Maximale (tout, y compris hors document) | Contradictoire : on prouve un document qui n'est plus celui accepté | Contenu contractuel + identité imprimée des parties + échéance | La plateforme ne peut pas reproduire le contrat ; elle **authentifie** une copie (restituée au client) par son empreinte | Aucune |
| **RGPD** | Tout est gardé : e-mail, téléphone, contact, notes internes, audio, identifiants | Bon, mais incompatible avec le principe 4 | Minimisé (§7) et borné dans le temps | Minimal : rien d'identifiant | Une donnée pseudonymisée reste personnelle (art. 4.5, cons. 26) |
| **Liens comptables** | Intacts | Intacts | Factures conservées inchangées (empreinte R3) ; numéro du devis dans `factures.purge_snapshot` | idem C | idem |
| **Audit** | — | Écritures à tracer champ par champ | 1 entrée `preuve_contrats_acceptes` (référence de décision, empreintes) + preuve hors base | idem C | — |
| **Restauration / rejeu** | Trivial | Difficile (réécriture non déterministe) | **Prouvé** identique (§8) | **Prouvé** identique (§8) | — |
| **Complexité** | **Élevée** : rétention **par ligne** dans une table DELETE ; touche `rapport_purge_entreprise`, `purger_table_entreprise`, `marquer_entreprise_purgee`, Storage, délien du chantier | **Élevée** + ouverture des verrous champ par champ | **Moyenne** : 1 table hors du périmètre de la purge + 1 porte dans `purger_table_entreprise` + 1 exception bornée dans 2 verrous | Faible (même mécanisme que C, autre minimisation) | Faible |
| **Support futur** | Lignes fantômes d'un tenant purgé dans les tables métier : toute future requête ou fonctionnalité doit les exclure | idem A | Tables métier vidées ; preuves dans `platform`, lecture service_role par fonction dédiée, échéance outillée | Le plus simple | — |

**Écartées techniquement** :
- **A**, pour sa complexité et parce qu'elle garde tout ;
- **B**, parce qu'elle contredit le principe « aucun contrat accepté ne devient modifiable » ;
- **E**, parce qu'elle ne remplit pas l'effacement et ne prouve rien.

**C et D** ont la même architecture : mêmes garanties, même rejeu, même audit. Elles ne
diffèrent que par **ce qui est conservé**, et ce choix est juridique. Les deux sont donc
implémentées derrière une politique non activée.

---

## 5. Principe : aucun contrat accepté ne devient modifiable

| Exigence | Mise en œuvre |
|---|---|
| Jamais modifiable par un utilisateur normal | Verrous inchangés hors purge. `authenticated` et l'administrateur du tenant sont refusés (tests). |
| Transformation **service_role only** | Seule `purger_table_entreprise` (EXECUTE réservé à service_role, échéance échue vérifiée) dépose l'autorisation. Aucun rôle applicatif ne peut écrire l'autorisation, la politique ni les preuves, ni appeler `_preserver_contrats_acceptes`. |
| **Transaction-bound** | Autorisation R1 liée à `txid_current()`, à l'entreprise **et** à la table en cours de purge, retirée avant de rendre la main. Pas de paramètre de session (GUC) : `set_config()` est ouvert à tous. |
| **Audited** | Entrée `preuve_contrats_acceptes` (politique, référence de la décision, niveau, empreintes) ; chaque étape consigne la politique ; chaque refus consigne `DECISION_REQUIRED`. |
| **Not user-callable** | Aucune fonction d'écriture n'est exposée. Changer la politique : ni service_role ni authenticated, le propriétaire seulement, donc par migration. |
| Suppression **seulement avec preuve à jour** | Le verrou recalcule l'empreinte du contrat au moment du `DELETE` et exige une preuve identique. Une photo ajoutée entre la preuve et la suppression suffit à la refuser (testé). |
| Aucun champ modifiable, même pendant la purge | Seul le délien `chantier_id → NULL` d'un chantier **effectivement supprimé** est toléré, dans l'étape `chantiers`, avec une preuve à jour. Montant, lien vers un chantier existant, etc. restent refusés (testé). |
| TRUNCATE | Refusé sur les 5 tables (P7). |

---

## 6. Implémentation — `20260926000402_rgpd_purge_contrats_acceptes_politique.sql`

| Réf. | Changement |
|---|---|
| **P0** | `platform.purge_politique_contrats` : une seule ligne, `non_decidee` par défaut. Contraintes : référence de décision obligatoire hors `non_decidee` ; durée obligatoire pour C, interdite pour D. Aucun droit applicatif. Journal `purge_politique_contrats_journal` en ajout seul (état initial consigné). `platform.definir_politique_purge_contrats()` sans GRANT ; refusée pendant une purge en cours. |
| **P1** | `non_decidee` : `purger_table_entreprise` refuse `devis`, `lignes_devis`, `avenants`, `pieces_jointes_devis` et `chantiers` **avant toute écriture** tant qu'un contrat accepté existe. Le refus est audité avec `DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE`. **Ferme le défaut 1.** |
| **P2 / P3** | Politique décidée : à la première étape qui touche un contrat, `_preserver_contrats_acceptes` fige pour **chaque** contrat accepté le document complet (`_document_contrat_accepte` : ligne entière via `to_jsonb`, donc toute colonne future incluse ; lignes ; pièces jointes ; signatures ; numéro du devis d'origine pour un avenant) et son empreinte SHA-256. Elle en stocke ensuite la version minimisée (`_contrat_minimise`, **liste blanche**). L'opération est idempotente : une nouvelle ligne n'est créée que si le contenu a changé. Les lignes et pièces d'un devis accepté ne sont supprimées **qu'avec** lui (cascade de l'étape `devis`), jamais avant, pour qu'aucun contrat ne soit amputé en base. |
| **P4** | `verrouiller_devis_accepte` / `verrouiller_avenant_accepte` : exception bornée (§5). Le corps est inchangé ailleurs. |
| **P5** | `platform.contrats_acceptes_purges` : hors du périmètre dynamique de la purge (schéma `platform`). Ajout seul ; UPDATE refusé ; DELETE seulement après `conserver_jusqu_au` (jamais pour D) ; TRUNCATE refusé ; aucun droit applicatif. Unicité par (type, contrat, empreinte). Lecture via `lire_contrats_acceptes_purges` et rapport via `rapport_contrats_acceptes_purge` (service_role). `purger_contrats_conserves_echus` (service_role, **non branchée** sur un planificateur) supprime les instantanés échus et renvoie les chemins Storage à supprimer. |
| **P6** | `preuve_purge_entreprise` (preuve hors base) : nouvelle clé `contrats_acceptes` (type, id, niveau, politique, référence, empreintes, échéance). Format `v1` compatible (`restaurer_echeance_depuis_preuve` ne lit pas cette clé). |
| **P7** | `BEFORE TRUNCATE` refusé sur `devis`, `lignes_devis`, `avenants`, `lignes_avenants`, `pieces_jointes_devis`. **Ferme le défaut 2.** |
| Storage | `verifier_storage_entreprise` : les photos et le logo d'un instantané C non échu sont `RETAIN` (`__contrat_conserve__`). Sinon, comportement de `…401`. |

Hors SQL :
- `scripts/purger-entreprise.mjs` : `dry-run` et `verify` affichent la politique, les contrats
  actifs, les preuves figées et `DECISION_REQUIRED` le cas échéant.
- `src/lib/rgpd-purge-planificateur.ts` : balayage final avant marquage, comme le script.
  **Ferme le défaut 3.** Test Vitest ajouté.

**Comportement par politique** (tenant réaliste, harnais §8) :

| Politique | Résultat de la purge | Ce qui reste des 4 contrats |
|---|---|---|
| `non_decidee` (livrée) | `incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis`, 5 refus `DECISION_REQUIRED`, rien d'écrit sur ces tables | Contrats, lignes, photos, audio : intacts |
| `supprimer_apres_preuve` | `complete` | 4 preuves `preuve_minimale`, sans échéance |
| `conserver_contrat_minimise` (10 ans, photos) | `complete` | 4 instantanés `contrat_minimise`, échéance = date du contrat + 10 ans ; photo conservée |

---

## 7. Minimisation des données personnelles

Colonne « Document » : ce que le devis imprimé montre.

| Donnée | Document | C (`contrat_minimise`) | D (`preuve_minimale`) | Justification technique |
|---|---|---|---|---|
| Numéro, dates d'émission et de validité, statut | oui | ✅ | ✅ | Identifient le contrat, rien d'identifiant sur une personne |
| Montants HT / TVA / TTC, remise globale | oui | ✅ | ✅ (sans remise) | Lien avec les factures conservées |
| Lignes : désignation, description, quantité, prix, TVA | oui | ✅ | ❌ (nombre seulement) | Objet du contrat. Texte libre qui peut citer une personne (« maison Lefèvre ») : non filtrable sans altérer la preuve (§11) |
| Conditions (verrouillées à l'acceptation) | non imprimées | ✅ | ❌ | Verrouillées par `verrouiller_devis_accepte`, donc contractuelles |
| Note au client | oui | ✅ | ❌ | Imprimée |
| Client : nom, prénom, société, raison sociale, forme, SIRET, TVA, adresse de facturation | oui (nom affiché, adresse, SIRET) | ✅ | ❌ | Identification de la partie cocontractante |
| Client : **e-mail, téléphone, contact** (nom, fonction, e-mail, téléphone du contact), référence interne, statut, conditions de paiement de la fiche, `client_id` | non | ❌ | ❌ | Inutiles à la preuve (servent à l'envoi) |
| Adresse d'envoi de l'e-mail (`email_envoye_a`) | non | ❌ (date d'envoi gardée) | ❌ | Donnée de contact |
| **Notes internes** (devis, avenant) | non | ❌ | ❌ | Internes, souvent chargées de données personnelles (exemple du fixture : un téléphone) |
| Identité émettrice figée (`entreprise_snapshot`) | oui | ✅ | ❌ | Partie cocontractante. Personnelle si entrepreneur individuel (§11) |
| **Signatures internes** | oui (nom, fonction, date) | id, empreinte du document signé, date | idem C | Nom et fonction du salarié déjà conservés dans `signatures_documents` (RETAIN), non recopiés |
| Photos imprimées | oui | métadonnées ; fichier seulement si `inclure_photos` | nombre seulement | Décision (§11) |
| **Notes vocales** | non | ❌ (nombre seulement) | ❌ | Voix, non imprimée |
| Avenant : `accepte_par`, `created_by` (identifiants d'utilisateurs) | — | ❌ → booléen « acceptation saisie par un membre » | ❌ | Identifiants internes, inutiles à la preuve |
| Avenant : dates de création, d'envoi, d'acceptation | — | ✅ | création et acceptation | Chronologie contractuelle |
| Chantier (`chantier_id`, adresse du chantier) | non | ❌ | ❌ | Non imprimé ; l'adresse du lieu des travaux n'est pas dans le document |
| Empreinte SHA-256 du document complet (**avant** minimisation) | — | ✅ | ✅ | Authentifie une copie complète (export restitué, sauvegarde). Ne permet pas de reconstituer le contenu (§11) |

Tests : aucun e-mail, téléphone, contact, note interne, identifiant d'utilisateur, nom de
fichier audio ni nom de salarié dans les instantanés C. Aucun nom, adresse, désignation,
SIRET, clé `client` ou `entreprise` ni chemin Storage dans les preuves D (expressions
régulières dans les suites pgTAP).

---

## 8. Sauvegarde → purge → restauration → rejeu

`scripts/qualification/rgpd-accepted-contracts-v1.sh`, exécuté de bout en bout
(sortie de l'exécution finale ; empreintes indépendantes de l'horloge, comparées **au sein d'une même exécution** — le tenant est daté relativement au jour d'exécution) :

```
== 1. T0 (train V2 sans 20260926000401 ni 20260926000402) : reproduction
   migrations appliquées : 335
   contrats acceptés du tenant A : 3 devis, 1 avenant(s)
   purge : incomplete:avenants,lignes_devis,chantiers,devis
   échec avenants : Cet avenant est accepté et ne peut plus être supprimé.
   échec chantiers : Cette facture a déjà été émise et ne peut plus être modifiée.
   échec devis : Cette facture a déjà été émise et ne peut plus être modifiée.
   échec lignes_devis : Ce devis est accepté et ne peut plus être modifié.
   pièces jointes du devis accepté restantes après la purge T0 : 0 (2 avant)
== 2. UPGRADE : T0 + données → + 20260926000401 + 20260926000402
   migrations appliquées sur base avec données : OK
   devis : 4 → 4
   lignes_devis : 5 → 5
   avenants : 1 → 1
   lignes_avenants : 1 → 1
   pieces_jointes_devis : 2 → 2
   factures : 5 → 5
   paiements : 2 → 2
   politique après upgrade : non_decidee
   fresh : 337 migrations
   schéma upgrade = schéma fresh : IDENTIQUE
   purge (politique non décidée) : incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis
   échec avenants : DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — 4 contrat(s) accepté(s) …
   échec chantiers : DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — 4 contrat(s) accepté(s) …
   échec devis : DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — 4 contrat(s) accepté(s) …
   échec lignes_devis : DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — 4 contrat(s) accepté(s) …
   échec pieces_jointes_devis : DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — 4 contrat(s) accepté(s) …
== 3. DR — politique supprimer_apres_preuve
   sauvegarde avant purge : 5.6M
   purge : complete
   factures : empreinte avant 16538a153144b0daf5762fddf43e6efe / après 16538a153144b0daf5762fddf43e6efe
   preuves figées : 4 preuve_minimale
   état après purge : 3866c98ca02c4b0cc589c036a15c3819
   restauration : erreurs pg_restore = 0
   base restaurée : purgée=f, devis acceptés=3, preuves=0, politique=supprimer_apres_preuve
   rejeu de la purge : complete
   état après rejeu : 3866c98ca02c4b0cc589c036a15c3819
   REJEU = PURGE D'ORIGINE : IDENTIQUE
   preuve hors base (empreintes des contrats) : IDENTIQUE
   variante — sauvegarde antérieure à la décision : politique restaurée=non_decidee, rejeu=incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis
   décision ré-appliquée, rejeu : complete
   REJEU (sauvegarde ancienne) = PURGE D'ORIGINE : IDENTIQUE
== 3. DR — politique conserver_contrat_minimise
   sauvegarde avant purge : 5.6M
   purge : complete
   factures : empreinte avant 16538a153144b0daf5762fddf43e6efe / après 16538a153144b0daf5762fddf43e6efe
   preuves figées : 4 contrat_minimise
   état après purge : 02188f975a2a698d9e52e3b1d762931a
   restauration : erreurs pg_restore = 0
   base restaurée : purgée=f, devis acceptés=3, preuves=0, politique=conserver_contrat_minimise
   rejeu de la purge : complete
   état après rejeu : 02188f975a2a698d9e52e3b1d762931a
   REJEU = PURGE D'ORIGINE : IDENTIQUE
   preuve hors base (empreintes des contrats) : IDENTIQUE
   variante — sauvegarde antérieure à la décision : politique restaurée=non_decidee, rejeu=incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis
   décision ré-appliquée, rejeu : complete
   REJEU (sauvegarde ancienne) = PURGE D'ORIGINE : IDENTIQUE
```

Lecture :
- **Même état final** après le rejeu, dans les deux stratégies : factures, délien,
  `purge_snapshot`, comptes par table, fiches anonymisées, fichiers Storage, **preuves de
  contrats** (type, id, niveau, politique, référence, empreintes, échéance). L'empreinte
  d'état couvre tout cela.
  - Cela tient parce que l'échéance C part de la **date du contrat**, pas de la date de
    purge, et que les documents sont sérialisés en UTC.
- Une restauration **efface les preuves du run**. C'est attendu : elles sont dans la base,
  comme `platform.purge_audit`. La preuve hors base (`purge-entreprise.mjs preuve`) les
  garde, et le rejeu produit **les mêmes empreintes**.
- **Sauvegarde antérieure à la décision** : la politique restaurée est `non_decidee`, donc
  le rejeu s'arrête sans danger. Il faut ré-appliquer la migration de décision, ce que fait
  un `db push` après restauration, puis rejouer : on obtient le même état final.
- Le Storage binaire n'est pas dans une sauvegarde Postgres : même réserve que les lots
  précédents (NOT PROVEN sur un Supabase hébergé).

---

## 9. Tests

| Suite | Base | Résultat |
|---|---|---|
| Fresh | 337 migrations sur base vide | 337/337, 0 erreur ; T0 : 335/335 |
| Upgrade | T0 (335) + données + 401 + 402 | compteurs inchangés, schéma = fresh (§8) |
| `rgpd_purge_contrats_acceptes_securite_v1` (nouveau) | fresh | **46/46** : défaut `non_decidee`, accès, exception bornée, cross-tenant, TRUNCATE, immutabilité |
| `rgpd_purge_contrats_acceptes_conserver_v1` (nouveau) | fresh, C activée dans la transaction | **30/30** |
| `rgpd_purge_contrats_acceptes_supprimer_v1` (nouveau) | fresh, D activée dans la transaction | **16/16** |
| `rgpd_purge_facture_emise_reconciliation_v1` | fresh | **48/48** (assertion 24 adaptée : le blocage est désormais le refus explicite, pas l'erreur du verrou) |
| `purge_entreprise_architecture_v2` · `purge_entreprise_supprimee` · `purge_preuve_et_garde_annulation` | fresh | 26/26 · 20/20 · 43/43 (T0 : 18/26 · 19/20 · 43/43) |
| `verrouiller_facture_emise` · `correctif_isolation_devis_client` · `gp_pilot_notification_devis_accepte` · `document_partage_public_par_jeton_v1` · `idempotence_paiement_et_avoir` | fresh | 6/6 · 19/19 · 7/7 · 42/42 · 8/8 |
| pgTAP complet (130 fichiers, chacun sur une base neuve) | T0 vs fresh | voir §9.1 |
| Vitest `rgpd-purge-planificateur`, `rgpd` | — | 33/33 (dont le nouveau test « balayage final ») |
| `verify:migrations` · `verify:secrets` · `eslint` · `tsc --noEmit` | — | 337 valides · aucun secret · 0 erreur · 0 erreur |
| `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | fresh + registre CLI simulé à 337 versions | contrôle 1 OK (attendu réaligné sur 337 / `20260926000402`) |

### 9.1 Suite pgTAP complète

Chaque fichier est exécuté sur une base neuve (T0 = train V2 seul, 335 migrations ; fresh = 337).

| | Fichiers propres | ok | not ok |
|---|---|---|---|
| T0 | 115 / 130 | 2 809 | 23 |
| Fresh (401 + 402) | **121 / 130** | **2 958** | **14** |

Seules différences entre T0 et fresh :
- `purge_entreprise_architecture_v2` : 18 → 26/26 ;
- `purge_entreprise_supprimee` : 19 → 20/20 ;
- les 4 fichiers RGPD (factures et contrats), qui n'ont pas d'objet sur T0 : 48 + 46 + 30 + 16.

Les 9 fichiers non propres sont **identiques sur T0 et sur fresh** ; ce sont les dettes connues
du tronc, déjà listées par les lots précédents :
- les 7 fichiers Studio (« Inscription fermée ») ;
- `platform_stripe_state_attestation_r72` (pgsodium réel absent de l'amorce locale) ;
- `elsatia_tools_cloud_sync_entitlement_closure_v1` (erreurs d'amorce, 8/8 assertions
  exécutées ok).

### 9.2 Matrice demandée

| Cas | Preuve |
|---|---|
| authenticated refusé | Aucun accès à la politique ni aux preuves. Pas d'EXECUTE sur la définition de politique, le rapport, la lecture ni la préservation. Admin du tenant : suppression ou modification d'un devis accepté, d'une ligne, d'un avenant → refusées. |
| service_role autorisé | Purge complète en C et en D. Rapport et lecture des preuves par fonctions dédiées. Rejeu idempotent. Suppression des instantanés échus. |
| service_role hors purge | Aucun droit DELETE sur devis ou avenants (42501). TRUNCATE refusé. Écriture de la politique, lecture directe des preuves et préservation → 42501. |
| cross tenant | Une autorisation pour A ne permet pas de supprimer le devis accepté de B. La purge de A ne fige aucune preuve pour B. Les devis de B sont strictement inchangés (empreinte). Les factures de A et B sont inchangées. |
| exception bornée | Sans preuve → refusé. Autorisation d'une autre étape → refusé. Montant ou délien d'un chantier existant pendant la purge → refusé. Preuve périmée → refusé. Preuve à jour + bonne étape → accepté. |

---

## 10. Sécurité : ce qui a changé pour un attaquant

| Avant ce lot | Après |
|---|---|
| service_role pouvait `TRUNCATE lignes_avenants` et vider les lignes de tous les avenants acceptés, sans trace | Refusé (P7) |
| La purge supprimait les photos et notes vocales d'un devis accepté (défaut 1) | Refusé sans décision ; avec décision, elles ne partent qu'avec le devis, après preuve |
| — | Aucune nouvelle surface applicative : toutes les nouvelles fonctions sont refusées à anon et authenticated ; service_role n'a que la lecture, le rapport et l'échéance |

---

## 11. Décisions requises (non tranchées)

| ID | Question | Ce qui est prêt |
|---|---|---|
| **`DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE`** | À la purge d'une entreprise cliente, l'éditeur (sous-traitant, DPA §5.8) doit-il **conserver** les devis et avenants acceptés (C), ou les **supprimer** après restitution, en ne gardant qu'une preuve minimale non identifiante (D) ? | C et D implémentées, testées et rejouables. Défaut : aucune des deux. |
| — si C : durée | Quelle durée ? Pistes à vérifier par le conseil, non tranchées : prescription du contrat, responsabilité décennale après réception, contrats électroniques avec un consommateur au-delà d'un seuil. | Paramètre `duree_conservation` obligatoire |
| — si C : point de départ | Date du contrat (implémenté : émission du devis, acceptation de l'avenant) ou **réception des travaux**, que l'application ne suit pas ? | Changer le point de départ = une ligne dans `_preserver_contrats_acceptes` |
| — si C : photos | Les photos imprimées sur le devis font-elles partie de la preuve à conserver ? | `inclure_photos` (défaut : non) |
| — si C : texte libre | Les désignations, conditions et notes au client peuvent citer une personne. Les garder tels quels (preuve fidèle) ou non ? Le lot ne les modifie pas. | — |
| — si C : identité émettrice | Pour un entrepreneur individuel, l'identité émettrice figée est personnelle. Qui en est responsable après la purge ? | — |
| — si D | L'empreinte SHA-256 d'un document qui contient des données personnelles est-elle elle-même une donnée personnelle ? Faut-il **exiger** l'export (restitution) avant la purge, et le rendre complet (`lignes_avenants`, §12) ? | Empreinte de document complet déjà dans la preuve |
| Textes | Si C est retenue, la politique de confidentialité (§4), le registre et le DPA ne mentionnent pas cette conservation. **Non modifiés** par ce lot. | — |

**Activation, une fois la décision prise** : une migration d'une ligne, citant la décision.

```sql
select platform.definir_politique_purge_contrats(
  'conserver_contrat_minimise', '<référence de la décision>', interval '<durée>', <photos: true|false>);
-- ou
select platform.definir_politique_purge_contrats('supprimer_apres_preuve', '<référence de la décision>');
```

Rien d'autre à déployer. Les deux chemins sont testés à chaque exécution de la suite pgTAP.

---

## 12. Constats ouverts (hors décision)

| Constat | État |
|---|---|
| `exporter_donnees_entreprise` n'exporte pas `lignes_avenants` (pas de colonne `entreprise_id`). La restitution d'un avenant est donc incomplète. | Signalé, non corrigé : fonction d'export, hors périmètre de la purge |
| `devis` n'a ni date ni auteur d'acceptation ; l'acceptation est une saisie interne sans preuve du consentement du client (`…311`) | Signalé (produit) |
| L'empreinte `signatures_documents.document_sha256` est calculée par l'application ; après la purge, le document signé n'existe plus que sous forme d'instantané (C) ou d'empreinte (D) | Signalé : la référence est conservée |
| Points ouverts du lot factures V1 (§10 de son rapport) : minimisation de `client_snapshot` des factures, libellé du chantier dans `purge_snapshot`, `remises_banque` | Inchangés |

---

## 13. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260926000401_rgpd_purge_facture_emise_reconciliation.sql` | Porté du lot factures V1 (ex-`…347`, SQL identique) |
| `supabase/migrations/20260926000402_rgpd_purge_contrats_acceptes_politique.sql` | **Nouveau** : P0–P7, politique `non_decidee` |
| `supabase/tests/rgpd_purge_contrats_acceptes_{securite,conserver,supprimer}_v1.test.sql` | **Nouveaux** : 46 + 30 + 16 assertions |
| `supabase/tests/fixtures/rgpd_tenant_contrats_acceptes.inc` | **Nouveau** : complément du tenant réaliste |
| `supabase/tests/rgpd_purge_facture_emise_reconciliation_v1.test.sql` | Assertion 24 adaptée |
| `scripts/qualification/rgpd-accepted-contracts-v1.sh` | **Nouveau** harnais (T0, upgrade, DR ×2, pgTAP). Remplace `rgpd-invoice-immutability-v1.sh`, supprimé |
| `docs/migrations-proposees/rgpd-purge-contrats-acceptes-v1.*.proposed` | **Supprimés** : remplacés par `…402` (stratégie D, plus l'exigence de preuve) |
| `scripts/purger-entreprise.mjs` | Affichage de la politique des contrats (dry-run, verify) |
| `src/lib/rgpd-purge-planificateur.ts` (+ test) | Balayage final avant marquage |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql`, `ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | Attendu réaligné : 337 migrations, dernière `20260926000402` |
| `docs/qualification/ELSATIA_RGPD_INVOICE_IMMUTABILITY_RECONCILIATION_V1.md` | Note de portage en tête, texte d'origine conservé |
