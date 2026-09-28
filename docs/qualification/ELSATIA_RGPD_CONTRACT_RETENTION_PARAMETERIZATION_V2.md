# ELSATIA — RGPD : conservation des contrats acceptés — dossier de décision et paramétrage technique (V2)

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v4` @ `b7fa9e2c` (verdict `CANONICAL TRAIN V4 READY FOR REMOTE PREVIEW` ; 352 migrations, dernière `20260927100000`) |
| Branche | `claude/sharp-knuth-aebwck` (repartie de la base ci-dessus) |
| Migration | **`20260928000100_rgpd_conservation_contrats_parametrage_v2.sql`** (353 migrations) |
| Décision à prendre | **`docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md`** (champs A, B, C) |
| Moteur | PostgreSQL 16.13 réel + pgTAP, amorce `scripts/local-postgres-bootstrap` (sans Docker) |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge. Aucune durée activée nulle part. |
| Textes légaux | Lus, **non modifiés**. Aucune décision juridique prise. |

## Verdict

```
RGPD CONTRACT RETENTION TECHNICALLY READY FOR OWNER DECISION
```

- La stratégie `conserver_contrat_minimise` (déjà retenue) est désormais **entièrement
  paramétrable** : durée, point de départ (7 règles calculables, combinables, avec repli
  facultatif) et sort des photos. Une fois la décision signée, l'activation tient en **une
  instruction** dans une migration d'une ligne, sans autre migration métier (§5).
- **Fail-closed conservé et renforcé** : tant qu'un seul des trois paramètres manque, la purge
  des contrats acceptés et la suppression des instantanés échus refusent, avant toute écriture,
  avec une cause nommée et la liste des paramètres manquants (§6). L'ancienne ligne d'activation
  à 4 arguments documentée par `…504` **n'active plus rien** : elle ne fixe ni point de départ
  ni choix explicite des photos.
- **Rien n'est activé** : état livré `duree_requise`, paramètres manquants
  `duree, point_depart, pieces_photos`. Le contrôle 14 du pack Preview signale désormais toute
  durée présente comme un écart **bloquant**.
- Preuves : suite pgTAP V2 **102/102** ; 8 suites RGPD existantes **307/307** ; harnais
  sauvegarde → purge → échéance → restauration → rejeu pour les durées de TEST 1 / 5 / 10 ans :
  **0 écart** (§11) ; fresh 353/353 ; upgrade V4 → V2 : compteurs inchangés, schéma = fresh.

Seule chose restante : la décision écrite du propriétaire (A durée, B point de départ,
C photos).

---

## 1. Base et lectures

| Élément | Référence | Ce qui en est repris |
|---|---|---|
| Train canonique V4 | `integration/elsatia-canonical-train-v4` @ `b7fa9e2c` | Base, plus récente du dépôt (contient V3, commandes fournisseurs, dette résiduelle). |
| Réconciliation factures V1 | `ELSATIA_RGPD_INVOICE_IMMUTABILITY_RECONCILIATION_V1.md`, migration `…501` | Autorisation de purge liée à la transaction (R1), garde-fou comptable, factures RETAIN inchangées. |
| Réconciliation contrats acceptés V1 | `ELSATIA_RGPD_ACCEPTED_CONTRACTS_RECONCILIATION_V1.md`, migration `…502` | Instantané minimisé (liste blanche `_contrat_minimise`), empreinte du document complet, verrous, `purger_contrats_conserves_echus` non planifiée. |
| Canonical V3 | `ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md`, migration `…504` | Décision propriétaire `conserver_contrat_minimise`, durée non validée, état `duree_requise`, refus `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT`. |
| Canonical V4 | `ELSATIA_CANONICAL_TRAIN_V4_PREVIEW_CANDIDATE.md` | Décision ouverte « durée seule », contrôle 14 du DB verify. |
| Purchase orders | `ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1.md`, migration `…506` | Version courante de `purger_table_entreprise` (reprise à l'identique hors blocs V2). |
| Residual debt | `ELSATIA_RGPD_PURGE_RESIDUAL_DEBT_CLOSURE_V1.md`, migration `…508` | Purge complète en un passage ; modèle du harnais DR. |

Ce que ces rapports laissaient ouvert pour la stratégie C : la durée (V3/V4), le point de
départ (« date du contrat » codée en dur dans `_preserver_contrats_acceptes`, modifiable
seulement par une migration), le sort des photos (`inclure_photos`, défaut `false` qui ne
distinguait pas « décidé : non » de « pas décidé »). Ce lot rend les trois paramétrables et
exige qu'ils soient tous exprimés.

---

## 2. Inventaire exact de ce que conserve `conserver_contrat_minimise`

Source de vérité : `public._contrat_minimise` (liste **blanche** ; une colonne ajoutée plus tard
à `devis` n'est conservée que si on l'ajoute explicitement) et les colonnes de
`platform.contrats_acceptes_purges`. Inventaire relevé sur une exécution réelle (tenant de test,
paramètres de TEST), pas seulement lu dans le code.

Une ligne par contrat accepté (devis ou avenant) de l'entreprise purgée.

### 2.1 Métadonnées de la ligne (`platform.contrats_acceptes_purges`)

| Colonne | Contenu |
|---|---|
| `id` | Identifiant technique de l'instantané |
| `entreprise_id` | Identifiant de l'entreprise cliente purgée |
| `run_id` | Identifiant de l'exécution de purge |
| `type_contrat` | `devis` ou `avenant` |
| `source_id` | Identifiant du devis / de l'avenant supprimé |
| `reference` | Numéro du devis (`DEV-…`) ; avenant : `<numéro du devis> / avenant <ordre>` |
| `politique`, `niveau` | `conserver_contrat_minimise`, `contrat_minimise` |
| `decision_ref` | Référence de la décision du propriétaire en vigueur à la purge |
| `contenu` | Instantané minimisé (§2.2 / §2.3) |
| `empreinte_document` | SHA-256 du document **complet** avant minimisation (authentifie une copie restituée ; ne permet pas de reconstituer le contenu) |
| `empreinte_contenu` | SHA-256 du contenu minimisé |
| `date_depart_conservation` | **V2** — point de départ calculé et figé |
| `regles_depart_appliquees` | **V2** — règle(s) ayant produit la date (`repli:<code>` si repli) |
| `duree_conservation` | **V2** — durée en vigueur à la purge, figée |
| `dernier_jour_conserve` | **V2** — départ + durée (jour civil inclus) |
| `conserver_jusqu_au` | Premier instant de suppression possible : lendemain du dernier jour, 00:00 Europe/Paris |
| `inclure_photos` | **V2** — choix des photos en vigueur à la purge, figé |
| `cree_le` | Horodatage de création de l'instantané |

### 2.2 Devis — champ par champ

Colonnes : **But** (business purpose) · **Compta** (accounting relevance) · **Preuve** (contract
evidence) · **Perso** (donnée personnelle) · **Sensible** (catégorie particulière, art. 9 RGPD) ·
**Dépend de** (retention dependency).

| Champ conservé | But | Compta | Preuve | Perso | Sensible | Dépend de |
|---|---|---|---|---|---|---|
| `id`, `type`, `statut` | Identifier le contrat et son état (`accepte`) | Lien avec les factures conservées (`devis_origine_id`) | Oui | Non | Non | A, B |
| `numero` | Référence imprimée | Oui (cité par les factures) | Oui | Non | Non | A, B |
| `date_emission`, `date_validite` | Chronologie contractuelle | Oui | Oui | Non | Non | A, B |
| `email_envoye_le` | Date d'envoi au client (l'adresse n'est pas gardée) | Non | Oui (communication de l'offre) | Non | Non | A, B |
| `remise_globale`, `montant_ht`, `montant_tva`, `montant_ttc` | Prix convenu | **Oui** (rapprochement factures/avoirs) | Oui | Non | Non | A, B |
| `conditions` | Conditions verrouillées à l'acceptation | Oui (échéancier, acompte) | Oui | Possible (texte libre) | Possible (texte libre) | A, B |
| `notes_client` | Note imprimée au client | Non | Oui | Possible (texte libre) | Possible (texte libre) | A, B |
| `lignes[]` : `designation`, `description` | Objet des travaux | Oui | Oui | Possible (ex. « maison Lefèvre ») | **Possible** (ex. travaux d'adaptation liés à un handicap) | A, B |
| `lignes[]` : `type`, `quantite`, `unite`, `prix_unitaire_ht`, `remise_ligne`, `taux_tva`, `ordre` | Détail chiffré | **Oui** | Oui | Non | Non | A, B |
| `client` : `type`, `nom`, `prenom`, `nom_affiche` | Identité imprimée du cocontractant | Oui (également dans les factures, conservées à part) | Oui | **Oui** (particulier, entrepreneur individuel) | Non | A, B |
| `client` : `societe`, `raison_sociale`, `nom_commercial`, `forme_juridique`, `siret`, `numero_tva` | Identité imprimée d'un client professionnel | Oui | Oui | Possible (entrepreneur individuel) | Non | A, B |
| `client` : `adresse_facturation`, `adresse_complement`, `code_postal`, `ville`, `pays` | Adresse imprimée | Oui | Oui | **Oui** (particulier : adresse du domicile) | Non | A, B |
| `client` : `provenance`, `identite_incertaine`, `herite_de`, `version` | Traçabilité technique du figement de l'identité | Non | Oui (fiabilité de l'identité figée) | Non | Non | A, B |
| `client_snapshot_at` | Date du figement de l'identité client | Non | Oui | Non | Non | A, B |
| `entreprise` (23 clés de `construire_entreprise_snapshot`) : `nom`, `raison_sociale`, `siret`, `adresse`, `code_postal`, `ville` | Identité imprimée de l'émetteur (client Elsatia) | Oui | Oui | Possible (entrepreneur individuel) | Non | A, B |
| `entreprise` : `assurance_decennale_numero`, `assurance_decennale_assureur`, `assurance_rc_pro_numero`, `taux_penalites_retard`, `texte_entete`, `texte_pied_page` | Mentions imprimées | Non | Oui | Non (texte libre : possible) | Non | A, B |
| `entreprise` : `logo_url` + 12 clés de mise en page (`police_documents`, `taille_police_documents`, `couleur_documents`, `couleur_secondaire_documents`, `logo_largeur_documents`, `mise_en_page_documents`, `position_logo_documents`, `afficher_logo_documents`, `afficher_descriptions_documents`, `afficher_tva_lignes_documents`) | Reproduire la présentation du document | Non | Oui (rendu fidèle) | Non | Non | A, B ; **le fichier logo** reste RETAIN dans Storage tant que l'instantané existe (§2.5) |
| `photos[]` : `nom_original`, `legende`, `mime_type`, `taille_octets` | Décrire les photos imprimées | Non | Oui | Possible (nom de fichier, légende libres) | Possible | A, B |
| `photos[]` : `storage_path` (+ **fichier image** dans Storage) | Conserver l'image imprimée | Non | Oui | **Oui** (logement, personnes éventuelles) | **Possible** | **C**, A, B |
| `nb_audio_non_conserves` | Compter les notes vocales supprimées | Non | Non (trace de minimisation) | Non | Non | A, B |
| `signatures[]` : `id`, `document_sha256`, `signed_at` | Référence des signatures internes (salarié) ; nom et fonction restent dans `signatures_documents` (RETAIN, rétention distincte) | Non | Oui | Non (identifiants) | Non | A, B ; `signatures_documents` (hors décision) |

### 2.3 Avenant — champ par champ

| Champ conservé | But | Compta | Preuve | Perso | Sensible | Dépend de |
|---|---|---|---|---|---|---|
| `id`, `type`, `ordre`, `statut` | Identifier l'avenant | Oui | Oui | Non | Non | A, B |
| `devis_origine_id`, `devis_origine_numero` | Rattachement au contrat initial | Oui | Oui | Non | Non | A, B |
| `date_creation`, `date_envoi`, `date_acceptation` | Chronologie | Oui | Oui | Non | Non | A, B |
| `acceptation_saisie_par_un_membre` | Booléen remplaçant l'identifiant de l'utilisateur qui a saisi l'acceptation | Non | Oui | Non | Non | A, B |
| `montant_ht`, `montant_tva`, `montant_ttc` | Prix de l'avenant | **Oui** | Oui | Non | Non | A, B |
| `notes_client` | Note au client | Non | Oui | Possible | Possible | A, B |
| `lignes[]` (mêmes 9 champs que le devis) | Objet et détail chiffré | Oui | Oui | Possible (texte libre) | Possible (texte libre) | A, B |

### 2.4 Jamais conservé (retiré avant figement)

E-mail, téléphone et contact (nom, fonction, e-mail, téléphone) du client ; `client_id` ;
référence interne et conditions de paiement de la fiche client ; adresse d'envoi de l'e-mail
(`email_envoye_a`) ; notes internes (devis, avenant) ; identifiants d'utilisateurs
(`created_by`, `accepte_par`) ; `chantier_id` et adresse du chantier ; fichiers audio et leurs
métadonnées ; nom et fonction du salarié signataire (non recopiés) ; chemins Storage des photos
si C = non. Vérifié par les suites `rgpd_purge_contrats_acceptes_conserver_v1` (regex sur
e-mail, téléphone, contact, notes internes, identifiants, audio) et
`rgpd_conservation_contrats_parametrage_v2` (7.7 : aucun chemin photo si C = non).

### 2.5 Hors de l'instantané, à connaître (pas modifié par ce lot)

| Donnée | Où | Durée |
|---|---|---|
| Fichier logo de l'entreprise émettrice | Storage, classé RETAIN (`__contrat_conserve__`) tant qu'un instantané le référence | Suit l'instantané (supprimé comme ORPHELIN ensuite) |
| Journal de purge (`platform.purge_audit`) : empreintes, références, dates, chemins des photos supprimées | Base, schéma `platform` | Non purgé par ce mécanisme (rétention du journal d'audit, hors décision) |
| Preuve hors base (`preuve_purge_entreprise`) | Archive de l'exploitant | Hors base |
| Factures, paiements, signatures internes | Tables RETAIN | Rétention propre, indépendante de cette décision |

---

## 3. Origine des données

Toutes les données conservées proviennent de la saisie de l'entreprise cliente (membre
authentifié) dans Gestion Pro, figées au moment de l'émission ou de l'acceptation :

| Bloc | Origine | Moment du figement |
|---|---|---|
| Identité client | Fiche client → `devis.client_snapshot` (`…272`) | Émission du devis |
| Identité émetteur | Fiche entreprise → `devis.entreprise_snapshot` (`…308`) | Sortie du brouillon |
| Lignes, montants, conditions, notes | Saisie du devis/avenant ; verrouillés à l'acceptation (`…210`, `…213`, `…272`) | Acceptation |
| Acceptation | **Saisie interne** d'un membre (accord obtenu hors de l'application, `…311`) ; aucune signature du client | Acceptation |
| Photos | Téléversées par un membre (`pieces_jointes_devis`, bucket `devis-medias`) | Ajout |
| Signatures internes | Salarié de l'entreprise (`signatures_documents`) | Signature |
| Point de départ (V2) | Données de la base au moment de la purge (§4) | Première étape de la purge |

Tableau champ par champ (but, pertinence comptable, preuve, personnel, sensible, dépendance) :
§2.2 et §2.3.

---

## 4. Point de départ : options techniques

Aucune option n'est choisie. Toutes sont implémentées dans `public._date_regle_depart_contrat`,
testées (pgTAP §4) et proposées au propriétaire (champ B).

| Demande de la mission | Code | Calcul | Déterminable ? |
|---|---|---|---|
| signature | `acceptation` | Avenant : `date_acceptation` (jour civil Paris). Devis : première entrée `devis_accepte` de `journal_activite` (RETAIN). | Avenant : toujours. Devis : seulement si l'application a journalisé l'acceptation (l'acceptation est une saisie interne, sans signature client). |
| — (comportement V1) | `date_contrat` | Devis : `date_emission`. Avenant : acceptation, à défaut création. | Toujours. |
| fin du contrat | `derniere_facture`, `dernier_paiement`, `fin_chantier`, `reception_travaux` | Voir ci-dessous : l'application n'a pas de date « fin du contrat » propre ; ces quatre événements en sont les approximations calculables. | Selon les données. |
| fin du chantier | `fin_chantier` | `max(chantiers.date_fin_reelle)` des chantiers rattachés (`devis.chantier_id`, `chantiers.devis_source_id`, `avenants.chantier_id`) ; **tous** doivent avoir une fin réelle. | Non si un chantier rattaché est en cours ou sans date, ou sans chantier. |
| — (réception) | `reception_travaux` | `max(reserves_chantiers.date_reception)` pour **chaque** chantier rattaché (module Réserves). | Non sans Réserves / sans réception. |
| dernière facture | `derniere_facture` | `max(factures.date_emission)` des factures non brouillon du devis porteur (acomptes, situations, finales, avoirs). | Non si jamais facturé. |
| — (dernier paiement) | `dernier_paiement` | `max(paiements.date)` de ces factures. | Non sans paiement. |
| résiliation | — | **Non implémentable** : aucune donnée de résiliation de devis/avenant en base. Refusée par la contrainte (test 2.1). | — |
| autre | `demande_suppression` | `entreprises.suppression_demandee_at` (jour civil Paris). | Non si la suppression a été programmée sans demande. |

Mécanique commune :

- **Combinaison** : plusieurs règles → la date la plus **tardive** ; une seule règle
  indéterminable rend la combinaison indéterminable (jamais de date partielle, test 4.14).
- **Repli** facultatif : règle utilisée si la combinaison est indéterminable ; tracée
  `repli:<code>` dans l'instantané (test 4.13). Sans repli : refus
  `DECISION_REQUIRED:RGPD-DEPART-CONSERVATION-INDETERMINE`, purge du contrat et de l'entreprise
  arrêtée, rien supprimé.
- **Déterminisme** : aucune règle ne lit l'horloge ; les `timestamptz` sont convertis en jour
  civil Europe/Paris explicitement, indépendamment du fuseau de session (test 6.8). Une
  purge rejouée après restauration produit les mêmes dates (§11).
- **Figement dès la première étape (R5)** : avec une politique active, l'instantané est figé à
  la **première** étape de la purge, quelle que soit la table, avant que les données du point
  de départ (réception Réserves, chantiers) ne soient supprimées. Test 7.2–7.5 : la purge
  commence par `reserves_chantiers`, l'instantané porte bien la date de réception. Un échec de
  figement anticipé est audité et n'empêche pas la purge des tables sans contrat ; les tables
  porteuses refusent ensuite avec la même cause.

---

## 5. Paramétrage

### 5.1 Où vivent les paramètres

`platform.purge_politique_contrats` (une ligne, aucun droit applicatif, journal en ajout seul
`purge_politique_contrats_journal`, étendu aux nouvelles colonnes) :

| Paramètre | Colonne | Validation (contrainte CHECK) |
|---|---|---|
| A. Durée | `duree_conservation interval` | > 0 ; aucune composante négative ; aucune composante horaire (jour civil). |
| B. Point de départ | `regles_depart text[]` (**nouveau**) | Non vide, sans doublon ni NULL, dans la liste fermée `platform.regles_depart_conservation_contrat()`. |
| B. Repli | `regle_depart_repli text` (**nouveau**) | NULL (= refuser) ou un code de la liste. |
| C. Photos | `inclure_photos boolean` + `choix_photos_explicite boolean` (**nouveau**) | Le choix doit avoir été **exprimé** : le défaut `false` ne vaut pas décision. |
| Hors C | — | Aucun paramètre de conservation pour `non_decidee` / `supprimer_apres_preuve`. |

### 5.2 Activation (le jour de la décision, pas avant)

```sql
select platform.definir_politique_purge_contrats(
  'conserver_contrat_minimise', '<référence de la décision>',
  interval '<A>', <C>, array['<B1>', …], <B2 : code de repli | null>);
```

- Une migration d'**une ligne** citant la décision (même modèle que `…504`). Aucune autre
  migration métier : les règles, l'échéance, la préservation, la suppression et les rapports
  lisent ces paramètres.
- Exécutable par le **propriétaire de la base** seulement (aucun GRANT ; refusé à
  `service_role` et `authenticated`, tests 8.12 et sécurité V1).
- Refusée pendant une purge ou une suppression d'instantanés en cours.
- Changer ensuite de durée ou de règle = même instruction. Les instantanés déjà figés gardent
  leur départ ; la suppression prend la plus tardive des échéances figée et recalculée (§9).
- Ajouter une règle de départ nouvelle (ex. résiliation, si l'application la suit un jour)
  demanderait une migration technique : c'est volontaire (liste fermée).

### 5.3 Simulation sans activation

`platform.simuler_conservation_contrat(type, id, durée, règles, repli)` (propriétaire
seulement) calcule, pour un contrat existant et des paramètres **candidats**, le départ, les
dates de chaque règle, le dernier jour et l'échéance, **sans rien écrire** (test 4.16). Permet au
conseil de voir l'effet concret d'une option avant de décider.

### 5.4 Lecture pour l'exploitation

- `rapport_contrats_acceptes_purge(entreprise)` (service_role) : ajoute `regles_depart`,
  `regle_depart_repli`, `inclure_photos`, `choix_photos_explicite`, `parametres_manquants`.
- `rapport_echeances_contrats_conserves(instant)` (service_role) : échéances figées et
  recalculées, statut échu à un instant donné, sans contenu.
- `scripts/purger-entreprise.mjs` (`dry-run`, `verify`) : affiche point de départ, photos et
  paramètres manquants, et la cause `RGPD-PARAMETRES-CONSERVATION-CONTRAT`.

---

## 6. Fail-closed

| État effectif (`platform.etat_politique_contrats()`) | Condition | Purge des contrats | Suppression des échus |
|---|---|---|---|
| `non_decidee` | — | Refus `RGPD-PURGE-VS-CONTRAT-ACCEPTE` | Refus |
| `duree_requise` (**livré**) | C sans durée | Refus `RGPD-DUREE-CONSERVATION-CONTRAT` (+ paramètres manquants) | Refus |
| `parametres_requis` (**nouveau**) | C avec durée, sans point de départ ou sans choix des photos | Refus `RGPD-PARAMETRES-CONSERVATION-CONTRAT` (+ paramètres manquants) | Refus |
| `conserver_contrat_minimise` | Les trois paramètres | Autorisée, instantané d'abord | Autorisée pour les échus |
| `supprimer_apres_preuve` | (option D, non retenue) | Autorisée | Rien d'éligible (aucune échéance) |

Défense en profondeur : `_preserver_contrats_acceptes` refuse aussi seul
(tests 3a.6) ; `_purge_contrat_autorisee` (lue par les verrous) exige l'état actif ; le trigger
d'immutabilité recalcule l'échéance avec l'état courant ; point de départ indéterminable sans
repli → refus. Le refus est **audité avant toute écriture** (`lignes_affectees` NULL,
`detail.parametres_manquants`). Testé combinaison par combinaison (pgTAP §3) et sur le jeu
réaliste (harnais §2 : `incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis`,
4 contrats intacts, 0 instantané, échéance refusée).

Aucun paramètre n'est activé : état livré après upgrade `duree_requise`, manquants
`duree, point_depart, pieces_photos` (harnais §1, test 1.1–1.3). Le contrôle 14 de
`ELSATIA_PREVIEW_DB_VERIFY_V1.sql` passe à l'attendu `conserver_contrat_minimise / durée non
validée` : une durée présente en Preview devient un écart **bloquant** (vérifié : durée de test
posée dans une base jetable → `ok = false`).

---

## 7. Preuves avec des valeurs fictives

Les durées **1 an, 5 ans, 10 ans** sont utilisées **uniquement comme paramètres techniques de
test**, posés dans la transaction pgTAP ou dans les bases jetables du harnais, puis annulés ou
supprimés. **Ce ne sont pas des recommandations juridiques.** Les références de décision de ces
tests sont préfixées `TEST-` / `QUALIF-`.

| Preuve | Où | Résultat |
|---|---|---|
| 1 / 5 / 10 ans sur un devis réel : dernier jour et échéance | pgTAP 5.1 | conformes |
| Arithmétique : 2025-06-15 + 1 an, 2021-06-15 + 5 ans, 2016-06-15 + 10 ans → 2026-06-15 | pgTAP 5.2–5.4 | conformes |
| Purge complète + échéance, chacune des trois durées | harnais §3 | 1 an : 3 instantanés échus supprimés, 1 conservé ; 5 et 10 ans : 0 échu, 4 conservés |

---

## 8. Expiration

Convention technique (conservatrice, jamais plus tôt) : **dernier jour conservé** =
départ + durée, **inclus** ; suppression possible à partir du **lendemain 00:00 Europe/Paris**.
Fonctions pures `platform.dernier_jour_conservation_contrat` et
`platform.echeance_conservation_contrat` (immuables, indépendantes du fuseau de session).

| Cas | Preuve | Résultat |
|---|---|---|
| Avant échéance | 6.7 (veille du dernier jour), 7.10, 7.11 (1 µs avant), 9.7 | conservé |
| Jour de l'échéance | 6.7 (00:00 et 23:59:59.999999 Paris), 9.7 (`JOUR-J` : dernier jour = aujourd'hui) | **conservé** |
| Après échéance | 6.7 (lendemain 00:00, 2031), 7.11 (à l'instant exact), 9.7 (`ECHU-1`, `ECHU-2`) | échu, supprimé par la fonction contrôlée |
| Changement d'heure | 6.1 (hiver : 23:00 UTC), 6.2 (été : 22:00 UTC), 6.3 (dernier jour = jour du passage à l'heure d'été) | conformes |
| 29 février | 6.4 (+1 an → 28 février), 6.5 (+4 ans → 29 février) | arithmétique PostgreSQL, documentée |
| Fuseau de session | 6.8–6.9 (Pacific/Kiritimati +14, America/Los_Angeles, UTC) ; harnais §3 (échéance rejouée sous Kiritimati) | identiques |
| Rejeu | 9.12–9.13 (second lot : 0, état identique) ; harnais §3 | identique |

---

## 9. Immutabilité pendant la conservation

| Tentative | Résultat | Test |
|---|---|---|
| UPDATE (contenu, échéance, départ, durée…) — même propriétaire | Refusé | 8.1–8.4, sécurité V1 |
| DELETE avant échéance — même propriétaire | Refusé | 8.5 |
| DELETE après échéance hors de `purger_contrats_conserves_echus` — même propriétaire | **Refusé (nouveau)** : autorisation liée au txid et à la ligne exigée | 9.1 |
| DELETE après échéance figée, mais durée allongée depuis | Refusé (échéance recalculée non atteinte) | 9.7 `ALLONGE` |
| Durée raccourcie depuis | Échéance figée prévaut, jamais de suppression anticipée | 9.7 `RACCOURCI` |
| Paramètres retirés / politique non décidée | Plus rien d'échu, suppression refusée | 9.15–9.18 |
| TRUNCATE | Refusé | 8.6 |
| service_role : lecture / suppression directes ; authenticated : toute fonction | 42501 | 8.7–8.11 |
| Instantané dont l'échéance ne découle pas de départ + durée | Refusé (CHECK `contrats_acceptes_purges_parametres_v2`) | 6.6 |

Les verrous des devis/avenants acceptés actifs sont inchangés (suites V1 : 46/46, 30/30, 16/16).

---

## 10. Suppression après échéance

`public.purger_contrats_conserves_echus(limite)` (service_role, **toujours non planifiée**) :

| Exigence | Mise en œuvre | Preuve |
|---|---|---|
| Contrôlée | Refus nommé si état non actif ; verrou consultatif (une exécution à la fois) ; autorisation par ligne liée au txid, retirée aussitôt ; double condition d'échéance (figée et recalculée) | 3a.4, 9.1, 9.5, 9.11, 9.15, 9.17 |
| Auditable | Une entrée `echeance_contrat_conserve` par instantané : référence, empreintes, départ, règles, durée figée et courante, dernier jour, décision figée et courante, chemins des photos | 9.10 |
| Transactionnelle | Tout ou rien : une panne au milieu du lot annule suppressions et audit | 9.2–9.4 |
| Rejouable | Ordre déterministe (échéance, id) ; second passage sans effet ; chemins Storage triés | 9.9, 9.12–9.13, harnais §3 |
| Fichiers | La fonction renvoie les chemins des photos à supprimer par l'API Storage (comme `…502`) | 9.9, harnais §3 (photo supprimée pour 1 an) |

---

## 11. Sauvegarde → purge → restauration → rejeu

`scripts/qualification/rgpd-contract-retention-v2.sh ret_v4` (base V4 neuve sans la migration
V2), exécution intégrale, 55 s. Durées **de TEST** ; règle **de TEST** `fin_chantier`, repli
`date_contrat`, photos conservées ; jeu réaliste (fixtures isolation A/B, facture émise, contrats
acceptés, commandes fournisseurs), chantier des 2 devis + avenant terminé depuis 400 jours,
chantier du 3e devis en cours.

```
== 1. UPGRADE : V4 + jeu réaliste → + 20260928000100
   migrations V4 : 352 ; V2 présente : f
   migration appliquée sur base avec données : erreurs=0
   compteurs avant/après upgrade : IDENTIQUE
   état livré après upgrade : duree_requise ; manquants=duree,point_depart,pieces_photos
   schéma upgrade = schéma fresh : IDENTIQUE
== 2. FAIL-CLOSED (politique livrée, aucun paramètre validé)
   purge : incomplete:avenants,lignes_devis,pieces_jointes_devis,chantiers,devis
   causes : RGPD-DUREE-CONSERVATION-CONTRAT [["duree", "point_depart", "pieces_photos"]]
   contrats acceptés restants : 4 ; instantanés : 0
   échéance : ERREUR:DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT
== 3. DR — durée de TEST 1 year (règle de TEST fin_chantier, repli date_contrat, photos conservées)
   purge : complete
   instantanés : 4 (avenant départ 2025-08-24 [fin_chantier] dernier jour 2026-08-24 ; devis … ; devis … ;
                    devis départ 2026-09-28 [repli:date_contrat] dernier jour 2027-09-28)
   E1 (après purge) : 34c5dbb65f9096fa3a6dcca9933d3e4e
   échéance : lot 3:;;a0000000-…/c3000000-…-000000000002/facade.jpg
   E2 (après échéance) : 1d0f2208b4f970a4c0251ffb7e0e125f ; instantanés restants : 1
   rejeu immédiat de l'échéance (lot / état) : IDENTIQUE / IDENTIQUE
   restauration B1 (après purge) : erreurs pg_restore = 0
   état restauré = E1 : IDENTIQUE ; échéance rejouée (lot) : IDENTIQUE ; (état) = E2 : IDENTIQUE
   restauration B1, rejeu sous Pacific/Kiritimati : lot IDENTIQUE ; état = E2 : IDENTIQUE
   restauration B0 (avant purge) : purge rejouée = E1 : IDENTIQUE ; échéance (lot) : IDENTIQUE ;
                                  chaîne complète = E2 : IDENTIQUE
   sauvegarde ANTÉRIEURE aux paramètres : état restauré duree_requise ; purge incomplete:… ;
     échéance ERREUR:DECISION_REQUIRED:RGPD-PARAMETRES-CONSERVATION-CONTRAT ;
     paramètres de TEST ré-appliqués → purge complete ; lot IDENTIQUE ; état = E2 : IDENTIQUE
== 3. DR — durée de TEST 5 years   : purge complete ; lot 0 ; 4 instantanés ; 12/12 comparaisons IDENTIQUE
== 3. DR — durée de TEST 10 years  : purge complete ; lot 0 ; 4 instantanés ; 12/12 comparaisons IDENTIQUE
== ÉCARTS : 0          (38 comparaisons IDENTIQUE : 2 d'upgrade + 12 par durée de test)
```

L'empreinte d'état couvre : empreintes comptables des factures, rapport de purge par table,
marquage de l'entreprise, fichiers Storage, instantanés (empreintes, départ, règles, durée,
dernier jour, échéance, photos) et entrées d'audit d'échéance. Elle exclut les identifiants de
run et l'horloge d'exécution. Comme dans les lots précédents, une restauration efface ce qui a
été fait après la sauvegarde ; le rejeu reproduit le même état. Une sauvegarde antérieure à
l'activation restaure un état **fermé** : il faut ré-appliquer la migration d'activation (ce que
fait un `db push`) puis rejouer.

Réserve de périmètre, identique aux lots précédents : PostgreSQL 16 local, Storage simulé par
`storage.objects` ; rien n'a été exécuté contre un Supabase hébergé.

---

## 12. Document de décision

`docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md` : uniquement les champs à
décider — **A** durée, **B** point de départ (B1 règle(s), B2 conduite si indéterminable),
**C** fichiers photo conservés ou non — avec, pour chaque option, la donnée utilisée et sa
limite connue, sans recommandation. La ligne d'activation se déduit mécaniquement des réponses.

---

## 13. Tests et contrôles

| Suite / contrôle | Base | Résultat |
|---|---|---|
| Fresh | 353 migrations sur base vide (`rebuild_db.sh`) | **353/353**, 0 erreur |
| Upgrade | V4 (352) + jeu réaliste + V2 | compteurs inchangés ; schéma = fresh (harnais §1) |
| `rgpd_conservation_contrats_parametrage_v2` (**nouveau**) | V4 + V2 | **102/102** |
| Suites RGPD existantes (8) | V4 + V2 | **307/307** (dette résiduelle 48, export 14, V3 30, commandes 75, contrats C 30, sécurité 46, D 16, factures 48) |
| `purge_entreprise_architecture_v2` · `purge_entreprise_supprimee` · `purge_preuve_et_garde_annulation` · `elsatia_tools_releve_metre_rgpd_purge_v1` · `gp_pilot_rgpd_manifeste_fichiers` | V4 + V2 | 26/26 · 20/20 · 43/43 · 13/13 · 9/9 |
| pgTAP complet (chaque fichier sur une base neuve) | V4 vs V4 + V2 | voir §13.1 |
| Harnais `rgpd-contract-retention-v2.sh` | V4 → V4 + V2 | **0 écart** (§11) |
| `verify-migrations` · `verify-migration-targets` · `verify-secrets` · `train-expectations --check` | — | 353 valides · partagé 353 · aucun secret · attendus à jour |
| `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | V4 + V2 | contrôle 1 : 353 / `20260928000100` ; contrôle 14 : ok (durée non validée) ; avec une durée de test : **ok = false, bloquant** |

### 13.1 Suite pgTAP complète

Chaque fichier de `supabase/tests` (147) est exécuté sur une base neuve (`pgtap-run-v3.sh`) :
V4 = train V4 seul (352 migrations) ; V4 + V2 = fresh 353 migrations (`rebuild_db.sh`).

| | Fichiers propres | ok | not ok |
|---|---|---|---|
| V4 | 133 / 147 | 3 961 | 23 |
| **V4 + V2** | **138 / 147** | **4 122** | **14** |

Seules différences (sortie ligne à ligne comparée) : les 5 fichiers qui utilisent la signature
V2 de `definir_politique_purge_contrats` ou les nouvelles colonnes, et qui n'ont donc pas d'objet
sur V4 — `rgpd_conservation_contrats_parametrage_v2` (102/102), `rgpd_dette_residuelle_v1`
(48/48), `rgpd_politique_contrats_conserver_minimise_v3` (30/30),
`rgpd_purge_commandes_fournisseurs_v1` (75/75), `rgpd_purge_contrats_acceptes_conserver_v1`
(30/30). Les 142 autres fichiers donnent une sortie **identique** sur V4 et sur V4 + V2.

Les 9 fichiers non propres sont **identiques sur V4 et sur V4 + V2** ; ce sont les dettes
connues du tronc, déjà listées par les rapports précédents : les 7 fichiers Studio
(« Inscription fermée »), `platform_stripe_state_attestation_r72` (pgsodium réel absent de
l'amorce locale), `elsatia_tools_cloud_sync_entitlement_closure_v1` (erreurs d'amorce, 8/8
assertions exécutées ok).

### 13.2 Tests existants adaptés (et pourquoi)

Ces tests simulaient l'activation de C avec l'appel à 4 arguments de `…504`. Sous V2 cet
appel **n'active plus rien** (c'est l'effet recherché : aucun point de départ implicite). Ils
passent désormais un point de départ **de TEST** explicite (`array['date_contrat']`, le
comportement V1) ; aucune assertion n'a été supprimée ni affaiblie :

| Fichier | Changement |
|---|---|
| `rgpd_politique_contrats_conserver_minimise_v3` | + 2 assertions : l'appel à 4 arguments reste `parametres_requis` ; activation de test avec règle explicite (28 → 30) |
| `rgpd_purge_contrats_acceptes_conserver_v1` | Activation de test avec règle explicite ; l'assertion d'échéance suit la convention V2 (dernier jour inclus, lendemain 00:00 Paris) au lieu de « date + durée » à minuit UTC ; l'instantané échu inséré par le propriétaire porte les colonnes V2 |
| `rgpd_dette_residuelle_v1`, `rgpd_purge_commandes_fournisseurs_v1` | Activation de test avec règle explicite |

Les harnais historiques (`rgpd-accepted-contracts-v1.sh`, `rgpd-purchase-orders-v1.sh`,
`rgpd-residual-debt-v1.sh`, `rgpd-end-to-end-v3.sh`) ne sont pas modifiés : ils rejouent des
bases **antérieures** à V2 (T0 figés sur des commits précis) où la signature à 6 arguments
n'existe pas. Sur une base V2, leur ligne d'activation laisse la politique non active
(fail-closed) ; `rgpd-contract-retention-v2.sh` les complète.

---

## 14. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260928000100_rgpd_conservation_contrats_parametrage_v2.sql` | **Nouveau** : R1–R8, aucune activation |
| `supabase/tests/rgpd_conservation_contrats_parametrage_v2.test.sql` | **Nouveau** : 102 assertions |
| `scripts/qualification/rgpd-contract-retention-v2.sh` | **Nouveau** harnais : upgrade, fail-closed, DR × 3 durées de test |
| `docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md` | **Nouveau** : décision A / B / C |
| `supabase/tests/rgpd_politique_contrats_conserver_minimise_v3.test.sql`, `rgpd_purge_contrats_acceptes_conserver_v1.test.sql`, `rgpd_dette_residuelle_v1.test.sql`, `rgpd_purge_commandes_fournisseurs_v1.test.sql` | Activation de test explicite (§13.2) |
| `scripts/purger-entreprise.mjs` | Affichage des paramètres V2 et de la cause `RGPD-PARAMETRES-CONSERVATION-CONTRAT` |
| `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | Contrôle 14 : aucune durée activée (bloquant) ; attendus du train régénérés (353 / `20260928000100`) |
| `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md`, `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md` | Attendus du train régénérés (`npm run sync:train-expectations`) |

## 15. Reproduire

```bash
git worktree add /tmp/train-v4 origin/integration/elsatia-canonical-train-v4
/tmp/train-v4/scripts/local-postgres-bootstrap/rebuild_db.sh ret_v4      # 352 migrations, sans V2
scripts/qualification/rgpd-contract-retention-v2.sh ret_v4 /tmp/dr-v2    # harnais §11
scripts/local-postgres-bootstrap/rebuild_db.sh ret_fresh                 # 353 migrations
scripts/qualification/pgtap-run-v3.sh ret_fresh "rgpd_*.test.sql" "purge_*.test.sql"
```
