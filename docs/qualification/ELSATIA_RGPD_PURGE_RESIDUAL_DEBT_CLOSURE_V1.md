# ELSATIA — RGPD : fermeture de la dette technique résiduelle — V1

| | |
|---|---|
| Date | 2026-09-27 |
| Base | `claude/amazing-johnson-d7nzps` @ `e64fe252` (réconciliation commandes fournisseurs, train canonique V3 + `…506`, 341 migrations) |
| Branche | `claude/hopeful-lamport-qsqd8h` (avance rapide sur la base, puis ce lot) |
| Migration | **`20260927000507_rgpd_dette_residuelle_historique_affectations_bon_commande.sql`** (342 migrations) |
| Moteur | PostgreSQL 16 réel + pgTAP, amorce `scripts/local-postgres-bootstrap` (sans Docker) ; Chromium (Playwright) pour le PDF |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge. |
| Textes légaux | Lus, **non modifiés**. Aucune décision juridique nouvelle. |

## Verdict

```
RGPD RESIDUAL TECHNICAL DEBT CLOSED
```

Les deux constats laissés ouverts par la réconciliation des commandes fournisseurs
(`ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1.md` §9 ¹ et §12) sont fermés, sans décision
juridique.

- **RD-1, historique des affectations.** Une purge laisse désormais le **même état en un
  passage** qu'après un rejeu, qu'elle soit complète ou incomplète. Le rejeu reste idempotent :
  un second passage ne supprime plus rien (0 ligne, prouvé sur 4 scénarios et en pgTAP).
  Aucune donnée conservée n'est touchée : le correctif **cesse de créer** des lignes que la
  purge effaçait ensuite, et il ne supprime rien de plus qu'avant.
- **RD-2, bon de commande.** Quand une commande quitte le brouillon, la base fige les données
  **réellement imprimées** : nom, adresse, code postal, ville et SIRET du fournisseur, plus
  l'en-tête de l'entreprise émettrice, comme pour les devis et les factures. Une commande
  envoyée ou reçue produit ensuite **toujours le même PDF**, prouvé sur un PDF Chromium réel
  avant et après modification des deux fiches. Les commandes existantes sont rattrapées et
  marquées `reconstituee`.

**Pourquoi il n'y a pas de décision juridique.**
- RD-1 ne change aucune classification. `affectations_historique` était déjà DELETE (V2). Les
  lignes en cause étaient créées par la purge elle-même puis effacées au passage suivant.
  L'état final est inchangé : il est seulement atteint en un passage.
- RD-2 applique à la commande le patron déjà en place pour les devis et les factures
  (`client_snapshot` 20260908000272, `entreprise_snapshot` 20260922000308), avec moins de
  données : ni contact, ni e-mail, ni téléphone, qui ne sont pas imprimés. Ces colonnes
  partent avec la commande (table DELETE). Elles n'entrent **pas** dans l'instantané minimisé
  de purge : la liste blanche `…506` est inchangée, et `rgpd_purge_commandes_fournisseurs_v1`
  passe toujours 75/75.

**Ce que ce verdict ne dit pas :**
- `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` (juridique, train V3) reste **ouverte**,
  sans lien avec ce lot. C'est toujours la seule cause d'une purge incomplète quand le tenant
  a signé un devis. Ici, « incomplète » veut dire : purge arrêtée proprement sur les seules
  tables contrats, **sans résidu ailleurs**.
- La confirmation par le propriétaire de `reglements_fournisseurs` en RETAIN (`…506`, D2) est
  toujours attendue. Elle n'est pas bloquante.
- La reproduction a révélé **une régression outillage de `…506`**, hors RGPD : les scripts de
  données qui insèrent une commande déjà engagée **puis** ses lignes échouent désormais sur le
  verrou PO-1. Le seed pilote et le seed DR sont corrigés et rejoués. Le seed Preview
  (`scripts/seed-elsatia-preview-year.mjs`) et deux seeds de recette ne sont pas corrigés
  (§10).

---

## 1. Base

Branche `claude/hopeful-lamport-qsqd8h`, avance rapide sur `origin/claude/amazing-johnson-d7nzps`
(`e64fe252`). La branche désignée était un ancêtre de la base : aucun commit propre n'est perdu.
Base V3 + `…506` neuve : `rebuild_db.sh` → **341/341**.

## 2. Historique des affectations : reproduction et cause

### Reproduction exacte (harnais §1, déroulé d'origine `…506`, sans `…507`)

Tenant pilote GP (seed `supabase/production/seed_entreprise_pilote_btp.sql`) : 300 affectations,
**aucune** ligne d'historique au départ. Politique contrats livrée, donc purge incomplète.

```
historique avant : 0
passage 1 : incomplete:lignes_devis,chantiers,devis ; historique restant 300 ; audit : affectations=300 ; étape affectations_historique=non exécutée
lignes restantes : suppression=300 (auteur null)
passage 2 : incomplete:chantiers,lignes_devis,devis ; supprimé : affectations_historique=300 ; historique restant 0
```

C'est exactement le constat `…506` §9 ¹.

### Pourquoi le premier passage ne suffit pas

1. `rapport_purge_entreprise` ne liste que les tables DELETE **non vides**. Au départ,
   `affectations_historique` est vide : elle n'a pas d'étape dans ce passage.
2. L'étape `affectations` fait un DELETE direct des 300 affectations.
3. `trg_historiser_affectation` (PL-03, `20260923000351`) écarte les suppressions « de
   contexte » en testant l'**absence du parent** : salarié, chantier, congé, entreprise. Or,
   pendant la purge, ces parents existent tous encore :
   - le salarié est ANONYMIZE, jamais supprimé ;
   - l'entreprise n'est jamais supprimée ;
   - le chantier est retenu par les contrats.

   Le trigger écrit donc 300 lignes `suppression` (auteur `null`, `service_role`). Son propre
   commentaire pose pourtant la règle inverse : « historiser une purge RGPD irait à l'encontre
   de la purge ».
4. Une purge **complète** rattrape ces lignes au balayage final du déroulé. Une purge
   **incomplète** s'arrête avant ce balayage (`scripts/purger-entreprise.mjs`,
   `src/lib/rgpd-purge-planificateur.ts`, pilote SQL de test). Seul le passage suivant les
   voit alors, parce que la table est devenue non vide.

**Variante masquée.** Si le tenant a déjà de l'historique, la table est listée. Son étape suit
alors `affectations` (même rang topologique, départage alphabétique), et elle rattrape les lignes
dans le même passage : harnais, première exécution, étape `affectations_historique=305`. Le
résultat ne dépendait donc que de **l'ordre des noms de tables**. Le correctif supprime cette
dépendance.

## 3. Atomicité

Matrice, harnais §2 : pilote, politique livrée, historique après **un** passage / lignes
supprimées au **second**.

| | déroulé d'origine | déroulé corrigé |
|---|---|---|
| **sans `…507`** | **300** / `affectations_historique=300` | 0 / aucune |
| **avec `…507`** | 0 / aucune | 0 / aucune |

Chaque correctif suffit seul. La cause racine est traitée en base : elle vaut pour tout appelant
de `purger_table_entreprise`, y compris un opérateur qui appellerait les RPC à la main. Le
déroulé corrigé est un filet générique pour toute autre table re-remplie par un trigger.

| Scénario (harnais §5, base upgradée) | Passage unique | Relance sur la même base | Rejeu après restauration |
|---|---|---|---|
| A, politique livrée (historique préexistant) | incomplète, historique 0 | supprimé : **aucune**, état **inchangé** | **IDENTIQUE** |
| Pilote, politique livrée (historique vide) | incomplète, historique 0 | supprimé : **aucune**, état **inchangé** | **IDENTIQUE** |
| A, politique activée (durée de TEST) | **complète**, marquée, historique 0 | supprimé : aucune, état inchangé | **IDENTIQUE** |
| Pilote, politique activée (durée de TEST) | **complète**, marquée, historique 0 | supprimé : aucune, état inchangé | **IDENTIQUE** |

Avant ce lot, la colonne « relance » du pilote en politique livrée était « état modifié »
(`…506` §9 ¹).

## 4. Correctif

**RD-1a, en base (`…507`).** `trg_historiser_affectation` n'écrit rien pendant une **étape de
purge autorisée** : `_etape_purge_en_cours(entreprise)` vérifie l'autorisation R1
(`platform.purge_autorisations_facture`, `…501`). Cette autorisation est bornée de quatre façons :
- elle est liée à `txid_current()` et à l'entreprise ;
- seule `purger_table_entreprise` la dépose (`service_role`, échéance échue vérifiée) ;
- elle est retirée avant de rendre la main ;
- aucun rôle applicatif ne peut l'écrire.

Hors purge, PL-03 est inchangé : `pl03_historique_affectations` 24/24, et la nouvelle suite §5
et §7 le vérifie avant et après une purge.

**RD-1b, dans les déroulés.** Le balayage final s'exécute aussi quand la purge s'arrête. Il
exclut les tables en échec de ce passage, et il ne touche que les tables DELETE : le serveur
refuse RETAIN et ANONYMIZE. La même règle est appliquée à l'identique dans :
- `scripts/purger-entreprise.mjs` (fonction `balayageFinal`) ;
- `src/lib/rgpd-purge-planificateur.ts` (fonction `balayer`) ;
- `supabase/tests/fixtures/rgpd_purge_driver.inc`.

**« Ne jamais supprimer un historique légalement conservé par erreur. »**

| Garde | Preuve |
|---|---|
| Aucune classification changée ; `affectations_historique` était déjà DELETE | `tables_conservees_purge()` inchangée |
| Les lignes préexistantes partent par leur **propre** étape, une seule fois, comme avant | pgTAP §6 : 1 étape `affectations_historique` avec lignes |
| Le contexte « purge » est borné à l'entreprise purgée et à la transaction de l'étape | pgTAP : 0 autorisation résiduelle ; tenant B : historique intact, puis toujours alimenté |
| Aucune table RETAIN ne grandit ni ne rétrécit pendant la purge | reproduction : seule `affectations_historique` grandissait ; empreinte DR (factures, factures fournisseurs, règlements, instantanés) identique |
| Le balayage n'insiste pas sur une table en échec et ne touche ni RETAIN ni ANONYMIZE | Vitest planificateur (nouveau cas) |

## 5. Bon de commande : reproduction et données imprimées

### Reproduction (harnais §1, sans `…507`)

```
bon imprimé : CMD-2026-003 → Négoce Matériaux Rhin / 5 quai des Bateliers / 98765432100017
fiche fournisseur modifiée → bon réimprimé : CMD-2026-003 → Nouveau Nom SAS / 99 rue Nouvelle / 99999999900099
```

La commande `CMD-2026-003` est **reçue**. Le bon historique change pourtant, parce que
`src/app/imprimer/commandes/[id]/page.tsx` joint `fournisseurs(nom,adresse,code_postal,ville,siret)`
et `entreprises(*)` **en direct**. Le PDF serveur (`src/lib/pdf/generer.ts`) imprime cette même
page avec Chromium.

### Données réellement imprimées (`DocumentImprimable`)

| Bloc | Champs imprimés | Figés ? |
|---|---|---|
| Destinataire (fournisseur) | nom, adresse, code postal, ville, SIRET | **oui** (`fournisseur_snapshot`) |
| Fournisseur, non imprimé | contact, e-mail, téléphone, TVA, notes, assurances | **non** : jamais imprimés, donc non figés |
| Émetteur (entreprise) | nom, raison sociale, SIRET, adresse, logo, assurances, pénalités, en-tête/pied, mise en forme | **oui** (`entreprise_snapshot` = `construire_entreprise_snapshot`, même en-tête que devis/factures) |
| Numéro, dates, lignes, montants | déjà figés par le verrou PO-1 (`…506`) | — |
| Signatures internes | blocs de signature (`signatures_documents`, RETAIN) | ajoutées après coup par nature (attestations qui citent `document_sha256`), comme devis/factures |

L'e-mail d'envoi au fournisseur (`contenuEmailCommande`) lit l'adresse courante de la fiche.
Ce n'est pas le document imprimé : ce lot ne le change pas (§11).

## 6. Instantané

| Élément | Mise en œuvre |
|---|---|
| Colonnes | `commandes_fournisseurs.fournisseur_snapshot`, `entreprise_snapshot`, `identite_figee_le`, `identite_provenance` (`envoi` / `reconstituee`) |
| Calcul | trigger `capturer_identite_commande_fournisseur` (BEFORE INSERT/UPDATE, passe avant le verrou PO-1). La base calcule l'identité **quand la commande quitte le brouillon** (envoi, ou annulation d'un brouillon) ; une valeur fournie par la requête est **ignorée** |
| Fournisseur | `construire_fournisseur_snapshot_commande(fournisseur, entreprise)` : `version`, `fournisseur_id`, `nom`, `adresse`, `code_postal`, `ville`, `siret`. Exige la même entreprise : la fonction est SECURITY DEFINER, la FK composite le garantit déjà |
| Brouillon | aucune identité : un brouillon forgé est remis à `NULL`, et le brouillon affiche les fiches à jour, annoncé dans l'interface |
| Contrainte | `commandes_fournisseurs_identite_figee_check` : brouillon ⇔ aucune identité ; sinon identité, date et provenance présentes. Tient même triggers suspendus (`session_replication_role = replica`, pgTAP) |
| Lecture | `src/lib/commande-document.ts` (`identiteBonCommande`) : l'instantané prime dès la sortie du brouillon, sans repli sur les fiches même s'il est vide. Utilisé par la page d'impression, donc aussi par le PDF serveur. La fiche commande affiche la provenance (`mentionIdentiteBonCommande`) |
| Droits | 3 fonctions nouvelles : aucune exécutable par `anon`, `authenticated` ou `service_role` |
| RGPD | dans le document complet (`_document_commande_fournisseur`, `to_jsonb`), donc couvert par l'empreinte de purge ; **hors** de l'instantané minimisé (liste blanche inchangée) ; supprimé avec la commande ; restitué par l'export RGPD |

## 7. Immutabilité

| Cas | Résultat |
|---|---|
| Fiche fournisseur **et** fiche entreprise modifiées après l'envoi | identité figée inchangée, 4/4 (pgTAP) ; **texte du PDF identique**, 5/5 commandes non brouillon (harnais §4) |
| Administrateur du tenant : écrire `fournisseur_snapshot`, `entreprise_snapshot`, `identite_provenance` | `COMMANDE_ENGAGEE_VERROUILLEE` (verrou PO-1, qui fige toute colonne d'une commande non brouillon) |
| SQL direct (propriétaire) | refusé, même verrou |
| Triggers suspendus | la contrainte refuse encore une commande envoyée sans identité, et un brouillon avec identité (`23514`) |
| Envoi avec une identité forgée dans la requête | ignorée ; l'identité est calculée par la base depuis la fiche au moment de l'envoi |
| Brouillon | suit les fiches à jour : le texte du PDF change, comme attendu |

PDF réel, harnais §4 :
- données **lues en base** avant et après modification des fiches ;
- même composant et même mapping que `/imprimer/commandes/[id]` ;
- impression A4 par Chromium avec les mêmes options que `src/lib/pdf/generer.ts` ;
- texte extrait du PDF (`unpdf`).

```
Tests  7 passed (7)
CMD-2026-002 engagee texte PDF identique avant/après 0e2e84148ba30f26
CMD-2026-003 engagee texte PDF identique avant/après 6bbaa3c130bc295c
CMD-2026-004 engagee texte PDF identique avant/après 0cdbf329ee53b9ee
CMD-2026-005 engagee texte PDF identique avant/après f95934bfaa7c3fee   (annulée après envoi)
CMD-2026-006 engagee texte PDF identique avant/après 14485748fa8303a2   (envoyée après 507 : provenance envoi)
CMD-2026-001 brouillon texte PDF CHANGÉ 870c5dce7efda170
```

Pour chaque commande non brouillon, le PDF contient l'ancien nom du fournisseur et l'ancien
SIRET de l'émetteur. Il ne contient ni le nouveau nom ni le nouveau SIRET.

## 8. Commandes existantes : rattrapage

- **Portée.** Toute commande non brouillon sans identité reçoit l'identité **reprise des
  fiches au moment de la migration**, avec `identite_provenance = 'reconstituee'`. C'est le
  même choix que pour les rattrapages `client_snapshot` et `entreprise_snapshot` des devis :
  l'identité réellement imprimée à l'époque n'est pas connue.
- **Provenance.** L'interface l'annonce : « elles peuvent différer du bon réellement envoyé à
  l'époque, et ne changent plus ».
- **Fiche fournisseur absente.** Ce cas n'arrive pas, puisque la FK est RESTRICT. Si c'était le
  cas, l'identité serait vide et marquée `reconstituee`, sans jamais retomber sur une fiche
  courante.
- **Mécanique.** Le rattrapage n'est pas un événement métier. Seuls deux triggers sont suspendus,
  pour cette seule instruction : le verrou PO-1 et la capture. La contrainte est posée
  **après** le rattrapage : elle prouve qu'il est complet.

Résultats du harnais §3, upgrade avec données :

| | |
|---|---|
| Commandes | `reconstituee = 8`, brouillons sans identité = 4 |
| Contrôles | non brouillon sans identité = **0**, brouillon avec identité = **0** |

## 9. Tests

| Suite | Base | Résultat |
|---|---|---|
| Fresh | 342 migrations, base vide | **342/342**, 0 erreur |
| Upgrade V3+`…506` + données → `…507` | 4 fixtures RGPD + seed pilote, 248 tables, 40 utilisateurs | ✅ 0 erreur, 0 warning ; comptes : **0 écart** ; empreintes métier (colonnes d'avant) **57/57 identiques** ; RLS et 599 policies inchangées ; sonde RLS **0 écart** ; droits de table 0 changé ; EXECUTE existants 0 changé ; 3 fonctions nouvelles, 0 exécutable par un rôle applicatif |
| Schéma upgrade vs fresh | `pg_dump -s`, ACL comprises | ✅ **IDENTIQUE** (28 697 lignes) |
| `rgpd_dette_residuelle_v1` (nouvelle) | fresh | **48/48** (sans `…507` : 1/48) |
| `rgpd_purge_commandes_fournisseurs_v1`, `cm06_…`, `gp_reception_…` (`…506`) | fresh | 75/75, 13/13, 66/66 |
| RGPD, purge, PL-02/03/05, isolation, numérotation | fresh | **22 fichiers propres, 742/742** (harnais §6) |
| pgTAP maximal (une base neuve par fichier) | fresh | **126/135** propres, 3 307 ok, 14 not ok : les mêmes 9 fichiers que V3/`…506` (§9.1) |
| Vitest (Gestion Pro) | — | **1 863/1 863** (+ 8 `commande-document`, + 1 planificateur : échoue sans le correctif, passe avec) |
| PDF (Chromium + `unpdf`, données réelles) | upgrade | **7/7** (§7) |
| Purge + sauvegarde / restauration / rejeu | upgrade | 4/4 scénarios : 0 erreur `pg_restore`, **rejeu = purge d'origine**, relance : **0 ligne supprimée** (§3) |
| typecheck · eslint | — | ✅ · 0 erreur (15 warnings préexistants) |
| `verify:migrations` · `verify:train-expectations` · `test:preview-pack` · DB verify | — | 342 valides · attendus resynchronisés (342 / `…507`) · 27/27 · 15/17 (les 2 écarts sont propres à Preview et préexistants : `url_preview`, propriétaire plateforme) |

### 9.1 pgTAP maximal

| | Fichiers | Propres | ok | not ok |
|---|---|---|---|---|
| `…506` (rapport précédent) | 134 | 125 | 3 259 | 14 |
| **`…507` (ce lot)** | **135** | **126** | **3 307** | **14** |

L'écart est exactement la nouvelle suite : +1 fichier, +48 ok. Les **9 fichiers non propres
sont les mêmes** que sur V3 et `…506` : 7 Studio, `platform_stripe_state_attestation_r72`
(stub pgsodium) et `elsatia_tools_cloud_sync_entitlement_closure_v1`. Ils sont sans lien avec
ce lot.

## 10. Défauts découverts en route

| | Constat | Traitement |
|---|---|---|
| **S1** | Depuis `…506`, `supabase/production/seed_entreprise_pilote_btp.sql` **échoue** sur une base neuve (`COMMANDE_ENGAGEE_VERROUILLEE` : lignes insérées dans une commande déjà `recue`). Le rapport `…506` ne l'avait pas vu, parce que son harnais chargeait le seed **avant** `…506` puis faisait l'upgrade | **corrigé** : commande créée en brouillon, lignes, puis statut ; harnais §3 « seed pilote sur base fresh : OK », montants identiques au rapport `…506` (4 536 / 831 / 2 880 €) |
| **S2** | Même défaut dans le seed du drill DR (`scripts/dr/03_seed_synthetic_dataset.sql`) | **corrigé**, rejoué sur V3+`…507` : 4 commandes, montants recalculés depuis les lignes comme avant |
| **S3** | Même défaut dans le seed Preview `scripts/seed-elsatia-preview-year.mjs` (commandes `recue`/`confirmee`/`annulee` insérées avant leurs lignes, étapes `commandes` puis `lignesCommande`) | **non corrigé** : machinerie de reprise et d'idempotence à adapter, avec ses tests. Non exécutable ici (API Supabase). **À traiter avant tout reseed Preview** |
| **S4** | `seed_entreprise_test_5_ans.sql` et `seed_juju_6_mois.sql` échouent **avant ce lot**, pour d'autres causes : verrou des devis acceptés (V3), et `raise exception U&'…'` invalide | non corrigé (préexistant, hors RGPD) ; ils auront aussi besoin du patron S1 |

## 11. Décisions et points ouverts

| ID | Nature | État |
|---|---|---|
| Historique d'affectations après purge incomplète (`…506` §9 ¹) | technique | **Fermé** par `…507` + déroulés |
| Bon de commande relisant les fiches vivantes (`…506` §12) | technique | **Fermé** par `…507` |
| `DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT` | juridique (V3), inchangée | ouverte |
| Confirmation `reglements_fournisseurs` RETAIN | propriétaire, non bloquante (`…506`) | à confirmer |
| E-mail d'envoi d'une commande : lit l'adresse courante de la fiche fournisseur | produit | non imprimé, donc hors RD-2. Si un renvoi doit repartir vers l'adresse d'origine (comme `client_snapshot.email` pour les devis), c'est un choix produit, pas RGPD |
| Logo de l'émetteur | limite commune aux devis, factures et commandes | l'instantané fige l'URL, pas le fichier |
| Seeds S3, S4 | outillage | §10 |
| Numérotation | à noter pour la suite | `…507` suit `…506` ; les branches en vol (`…401` Tools, `…347` Réserves) devront être renumérotées **après `…507`** |
| Fichiers Storage binaires, GoTrue, Supabase hébergé | exécution distante | NOT PROVEN localement (même réserve que les lots précédents) |

## 12. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260927000507_rgpd_dette_residuelle_historique_affectations_bon_commande.sql` | RD-1 (trigger), RD-2 (colonnes, capture, rattrapage, contrainte) |
| `supabase/tests/rgpd_dette_residuelle_v1.test.sql` | pgTAP, 48 assertions |
| `supabase/tests/fixtures/rgpd_purge_driver.inc`, `scripts/purger-entreprise.mjs`, `src/lib/rgpd-purge-planificateur.ts` (+ test) | balayage final aussi en cas d'échec |
| `src/lib/commande-document.ts` (+ test), `src/app/imprimer/commandes/[id]/page.tsx`, `src/app/(app)/commandes/[id]/page.tsx` | lecture de l'identité figée, mention de provenance |
| `scripts/qualification/rgpd-residual-debt-v1.sh`, `scripts/qualification/pdf/*` | harnais : T0, matrice, upgrade, PDF, DR, pgTAP |
| `supabase/production/seed_entreprise_pilote_btp.sql`, `scripts/dr/03_seed_synthetic_dataset.sql` | S1, S2 |
| DB verify, pack, runbook V3, rapport V3 | attendus générés resynchronisés (`npm run sync:train-expectations`) |
| `docs/qualification/ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1.md` | §12 : les deux constats renvoient à ce rapport |

## 13. Reproduire

```bash
git checkout claude/hopeful-lamport-qsqd8h && npm ci
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap
# Base V3 + 506 SANS 507 (modèle du harnais) :
mv supabase/migrations/20260927000507_*.sql /tmp/ && scripts/local-postgres-bootstrap/rebuild_db.sh rd_v506 && mv /tmp/20260927000507_*.sql supabase/migrations/
scripts/qualification/rgpd-residual-debt-v1.sh rd_v506 /var/tmp/rd-v1     # T0, matrice, upgrade, PDF, DR, pgTAP ciblé (≈ 4 min)
scripts/local-postgres-bootstrap/rebuild_db.sh rd_v507 && scripts/qualification/pgtap-run-v3.sh rd_v507   # pgTAP maximal
```
