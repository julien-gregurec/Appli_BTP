# ELSATIA — Réconciliation RGPD × immutabilité des factures émises — V1

Date : 2026-09-26 · Branche : `claude/great-curie-i94633`
Base : `integration/elsatia-canonical-train-v1` @ `1c1fed66` (train canonique V1, le plus récent)
Aucun texte légal modifié. Aucune décision juridique prise.

## Verdict

```
RGPD INVOICE BLOCKER TECHNICALLY CLOSED
```

Le blocage identifié par le train canonique (§6, `DECISION_REQUIRED:RGPD-PURGE-VS-FACTURE-EMISE`)
est fermé par la migration `20260923000347`, **active sur cette branche** : la purge délie une
facture émise de son chantier et de son devis supprimés sans rien changer d'autre, et la
base le prouve à chaque étape. Cette question ne demandait pas de décision juridique : aucun
rendu de la facture ne lit `chantiers` ni `devis` (§3), et le contenu comptable de chaque
facture est contrôlé par empreinte avant et après chaque étape.

**Ce que ce verdict ne dit pas.** Le tenant réaliste demandé par la mission (devis accepté,
avenant, acompte, finale, avoir, paiements) révèle un **second blocage, distinct** : les devis
et avenants **acceptés** sont eux aussi verrouillés, et leur suppression par la purge est une
question juridique (preuve contractuelle). Tant qu'elle n'est pas tranchée, la purge d'une
entreprise réelle reste incomplète, sans danger (§6) :

```
Purge RGPD d'un tenant réel avant Preview : LEGAL DECISION REQUIRED
DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — prototype non activé + tests prêts
```

Réserve de périmètre (la même que les lots précédents) : PostgreSQL 16 local et bootstrap
Supabase minimal (`scripts/local-postgres-bootstrap/`). Rien n'a été exécuté contre un
Supabase hébergé.

---

## 1. Lectures

| Document | Branche · commit | Ce qui sert ici |
|---|---|---|
| `ELSATIA_CANONICAL_TRAIN_EXECUTION_V1` | train · `1c1fed66` | §6 : constat, preuve de cause, prototype GUC non appliqué ; §8 : décision ouverte |
| `ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2` | train (STEP 4) | Architecture DELETE / ANONYMIZE / RETAIN, F1–F8, `purge_snapshot` (F8) |
| `ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1` | `claude/hopeful-tesla-r6hbea` · `fa0f30e4` (**hors train**) | Rejeu après restauration, preuve hors base, F9 ; même conflit « effacement vs archive immuable » signalé côté utilisateurs |
| Facturation / immutabilité | migrations `20260822000222`, `20260908000272`, `20260922000307`, `20260922000308`, `20260902000255` | Verrou `verrouiller_facture_emise`, snapshots client/entreprise, ACL service_role |

Le lot « rétention / sauvegardes » n'est pas dans le train. Sa migration `20260923000400` ne
redéfinit aucune des fonctions modifiées ici ; `20260923000347` s'appliquera avant elle.

---

## 2. Reproduction

Tenant réaliste construit **par les chemins applicatifs**, sous l'identité de
l'administrateur du tenant (`supabase/tests/fixtures/rgpd_tenant_facture_emise.inc`) :

| Élément | Construction |
|---|---|
| Client | particulier, adresse, téléphone, e-mail |
| Chantier | adresse + GPS, rattaché au client |
| Devis | brouillon → lignes → `envoye` → **`accepte`** |
| Avenant | `creer_avenant` → `envoye` → **`accepte`** |
| Acompte 30 % | `creer_facture_avancee`, émis |
| Facture finale 70 % | `creer_facture_avancee` (DGD), émise |
| Paiements | `enregistrer_paiement_facture` : acompte soldé (1 080 €), finale 500 € |
| Avoir 10 % | `creer_facture_avancee('avoir', …)` sur la finale, émis (finale → `avoir_emis`) |
| Note de frais | rattachée au chantier |
| Documents / Storage | document de chantier + fichier, logo de l'entreprise (bucket public) |
| Audit | `journal_activite` (écrit par les RPC), `platform.purge_audit` |

Plus le jeu d'isolation existant (`isolation_multitenant.inc`, tenants A et B complets).

**Blocage reproduit sur le train (T0, sans `…347`)** — harnais §8, étape 1 :

```
   factures émises sans identité émettrice figée (T0) : 4
   purge : incomplete:avenants,lignes_devis,chantiers,devis
   échec avenants : Cet avenant est accepté et ne peut plus être supprimé.
   échec chantiers : Cette facture a déjà été émise et ne peut plus être modifiée.
   échec devis : Cette facture a déjà été émise et ne peut plus être modifiée.
   échec lignes_devis : Ce devis est accepté et ne peut plus être modifié.
```

Le blocage du train est reproduit (`chantiers`, `devis` : verrou facture). Le tenant
réaliste en montre deux autres, qui ne viennent pas des factures (`avenants`, `lignes_devis` :
verrous des contrats acceptés, §6). Et 4 factures émises n'ont pas d'identité émettrice figée (§3).

`purge_entreprise_architecture_v2` : **18/26**, `purge_entreprise_supprimee` : **19/20** (identique
au rapport du train).

---

## 3. Ce que « la facture » contient réellement

Inventaire de tous les chemins de rendu et d'export (fichier:ligne dans le code) :

| Chemin | Lit `chantiers` / `devis` ? | Identité client | Identité émettrice |
|---|---|---|---|
| PDF / impression (`chargerDonneesFactureImprimable`, `src/lib/documents-commerciaux.ts:125`) | **Non** | `client_snapshot` (prioritaire) | `entreprise_snapshot`, **sinon fiche vivante** |
| Lien public / PDF partagé (`document_commercial_public_par_token`, `…308`) | **Non** | snapshot | snapshot, sinon fiche vivante |
| E-mail avec PDF (`src/lib/documents-envoi.ts`) | **Non** | snapshot | idem (+ nom vivant dans l'objet) |
| Export comptable CSV/XLSX (`src/app/api/exports/comptabilite/route.ts`) | **Non** (ventes, règlements, TVA) | snapshot | — |
| Page de détail dans l'application | Oui (lien chantier, n° devis) | snapshot | — (aperçu, pas le document) |

Aucun PDF n'est stocké : tout est régénéré. Aucun export Factur-X / FEC n'existe.

Conséquences :

1. `chantier_id` et `devis_origine_id` sont des **clés de navigation internes**, pas des
   mentions de la facture. Les passer à NULL ne change pas le document.
2. **Défaut réel trouvé** : `factures.entreprise_snapshot` n'était écrit que par
   `changerStatutFactureAction` (TypeScript). Une facture émise par un autre chemin (RPC,
   mise à jour directe du statut, factures antérieures au 2026-08-12) n'en avait pas : après
   `marquer_entreprise_purgee`, elle se serait imprimée au nom de « Entreprise supprimee »,
   sans SIRET ni adresse. Reproduit sur T0 : 4 factures émises du tenant A (3 par les RPC
   applicatives, 1 par insertion directe) n'ont pas d'identité émettrice figée.
3. **Défaut réel trouvé** : le logo figé dans `entreprise_snapshot` n'était protégé que par
   la fiche vivante ; après anonymisation, la purge le classait ORPHELIN et le supprimait.

---

## 4. Options comparées

| | Intégrité (pas de référence cassée) | Auditabilité | Immutabilité de la facture | Impact RGPD | Retour arrière | Complexité | Risque |
|---|---|---|---|---|---|---|---|
| **A. SET NULL contrôlé** (colonnes ajoutées aux champs libres du verrou) | Oui | Faible sans instantané | **Affaiblie pour tous** : n'importe quel utilisateur pourrait délier une facture | Efface bien | Facile | Faible | **Élevé** : ouvre le verrou aux flux ordinaires |
| **B. Snapshot comptable immuable** (tout ce qui est imprimé, figé à l'émission) | Ne règle pas la FK seule | Bonne | Préservée | Conserve ce que la loi impose, rien de plus | Facile | Faible | Faible. Nécessaire mais pas suffisant. Déjà en place pour le client ; **manquant en base pour l'émetteur** (R4) |
| **C. Tombstone anonymisé** (garder chantier/devis vidés de leurs PII) | Oui, ligne facture intacte | Bonne | Totale (ligne facture inchangée) | Résidu : textes libres (désignations, conditions, notes) difficiles à nettoyer sûrement | Moyen | **Élevée** : classification par ligne, rapport et marquage à revoir, verrous devis à lever quand même pour anonymiser | Moyen : fuite résiduelle, et le devis accepté reste un contrat modifié |
| **D. Pseudonymisation des entités** | Oui | Bonne | Totale | **Insuffisant** : une donnée pseudonymisée reste personnelle (RGPD art. 4.5, cons. 26) | Moyen | Élevée (clé à gérer) | Élevé : ne satisfait pas l'effacement |
| **E. Snapshot de références avant purge** (F8, `purge_snapshot`) | Oui avec A/F | **Bonne** : id + libellé du chantier / numéro du devis | Écrit dans la facture → bloqué par le verrou sans F | Libellé du chantier conservé (voir §9) | — | Déjà en place | Faible |
| **F1. Exception par drapeau de session** (prototype du train) | Oui | Bonne avec E | Préservée… si le drapeau est infalsifiable | Efface bien | Facile | Faible | **Élevé** : `set_config()` est exécutable par tout rôle ; toute future fonction SECURITY INVOKER ou chemin SQL direct ouvrirait l'exception |
| **F2. Exception liée à la transaction** (autorisation écrite dans un schéma privé par la seule fonction de purge) | Oui | Bonne avec E + empreinte | Préservée : inatteignable hors purge, bornée à 2 colonnes + trace | Efface bien | Facile (migration inverse) | Faible | Faible |

**Choix : B + E + F2**, plus un garde-fou comptable qui rend la propriété vérifiable plutôt
que supposée. Ni C ni D ne dispensent de modifier un document verrouillé (le devis
accepté), et D ne remplit pas l'effacement.

---

## 5. Implémentation active — `20260923000347_rgpd_purge_facture_emise_reconciliation.sql`

| Réf. | Changement | Pourquoi |
|---|---|---|
| **R1** | Table `platform.purge_autorisations_facture (txid, entreprise_id, table_purgee)` ; **aucun droit** pour anon, authenticated, service_role. `purger_table_entreprise` y dépose une autorisation liée à `txid_current()`, puis la retire avant de rendre la main (en cas d'erreur, l'annulation du bloc la retire aussi). | Seule la fonction de purge (service_role, échéance vérifiée) peut ouvrir l'exception. Pas de GUC. |
| **R2** | `verrouiller_facture_emise` : avec cette autorisation (même transaction, même entreprise), une facture émise accepte **uniquement** `chantier_id → NULL` (purge de `chantiers`, chantier réellement supprimé, référence déjà dans `purge_snapshot`), idem `devis_origine_id` (purge de `devis`), et un `purge_snapshot` qui ne fait qu'ajouter des clés. Chaque condition est un booléen strict (`coalesce(…, false)`). Suppression et retour en brouillon toujours interdits. | Exception minimale, contrôlée colonne par colonne. |
| **R3** | Garde-fou comptable : `empreinte_comptable_factures_entreprise()` (tout le contenu de chaque facture sauf les 2 clés et `purge_snapshot`, + lignes + paiements) avant et après **chaque** étape ; différence → étape annulée, `ok=false`, cause auditée. Empreinte consignée dans `platform.purge_audit.detail`. | Même un effet de bord sur un champ laissé libre par le verrou (statut, montant payé) est intercepté. Coût mesuré : **0,46 s** par empreinte pour 5 000 factures / 15 000 lignes / 5 000 paiements. |
| **R4** | Trigger `capturer_entreprise_snapshot_factures` à l'émission (même règle que les devis, `…308`) ; reprise des factures émises sans snapshot (`provenance = backfill_identite_actuelle`, `identite_incertaine = true`) ; contrôle et reprise de dernier recours dans `marquer_entreprise_purgee`. | §3 point 2. |
| **R5** | Même contrôle de dernier recours pour `client_snapshot` dans `anonymiser_table_entreprise('clients')`. | Une facture émise ne doit jamais dépendre de la fiche client anonymisée. |
| **R6** | `factures_devis_origine_entreprise_fkey` : `ON DELETE SET NULL (devis_origine_id)`, comme sa jumelle chantier. | Même comportement que la FK simple ; l'invariant F3 redevient vrai (`purge_entreprise_supprimee` test 17). |
| **R7** | `verifier_storage_entreprise` : le logo figé dans l'identité émettrice d'une facture conservée est RETAIN. | §3 point 3. |
| **R8** | `BEFORE TRUNCATE` refusé sur `factures`, `lignes_factures`, `paiements`. | TRUNCATE ne déclenche pas les triggers de ligne ; service_role garde ce droit après `…255`. |

Également : **balayage final** avant le marquage dans `scripts/purger-entreprise.mjs` (et le
déroulé SQL des tests). Défaut V2 réel, indépendant des factures : supprimer des devis après
`entreprises_dashboard_cache` recrée une ligne de cache par trigger, et
`marquer_entreprise_purgee` refusait alors le marquage (« 1 table DELETE a encore des lignes »).

### 5.1 Ce que garde une facture conservée après purge (prouvé, tenant réaliste et tenant C)

| Exigence de la mission | Preuve |
|---|---|
| numéro, date, totaux, TVA | Égalité champ à champ + empreinte identique ; totaux attendus vérifiés (300 HT, TVA 10 % + 20 % = 40, 340 TTC) |
| paiement, historique | Paiements identiques ; règlements 1 080 € + 500 € ; lien avoir → facture finale intact |
| snapshot client | `client_snapshot` identique ; destinataire lisible alors que la fiche client est anonymisée |
| identité émettrice | `entreprise_snapshot` identique ; rendu = identité figée alors que la fiche entreprise est « Entreprise supprimee » ; logo conservé |
| snapshot devis si nécessaire | `purge_snapshot` : id + libellé du chantier, id + **numéro** du devis, avant délien |
| sans dépendre d'une ligne supprimée | `chantier_id` / `devis_origine_id` à NULL, aucune référence cassée ; aucun rendu ne lit ces tables |
| audit | Chaque étape consigne `controle_factures = empreinte_inchangee`, le nombre de factures et l'empreinte |

---

## 6. Second blocage : contrats acceptés — DECISION_REQUIRED

### 6.1 Constat

Sur le tenant réaliste, une fois les factures débloquées, la purge échoue encore :

```
   purge (sans décision contrats) : incomplete:avenants,lignes_devis,chantiers,devis
   échec avenants : Cet avenant est accepté et ne peut plus être supprimé.
   échec chantiers : Ce devis est accepté et ne peut plus être modifié.
   échec devis : Ce devis est accepté et ne peut plus être supprimé.
   échec lignes_devis : Ce devis est accepté et ne peut plus être modifié.
```

Plus aucune erreur « facture » : `chantiers` et `devis` échouent désormais sur le verrou du
devis accepté, pas sur celui de la facture.

`verrouiller_devis_accepte` refuse la suppression d'un devis accepté, la mise à NULL de son
chantier (FK SET NULL quand le chantier est supprimé) et le recalcul de ses montants quand ses
lignes sont supprimées ; `verrouiller_avenant_accepte` refuse la suppression d'un avenant
accepté. Toute entreprise qui a signé un devis est concernée. Échec **sûr** : rien n'est
supprimé à moitié, l'entreprise n'est pas marquée, les factures ne bougent pas (prouvé).

La qualification RGPD V2 ne l'a pas vu : son jeu de données n'a plus pu être chargé sur le
train (le seed `seed_purge_qualification_v2.sql` échoue sur le plafond de personnes, puis sur
ce même verrou), et ses tests pgTAP n'utilisent que des devis brouillon.

### 6.2 Pourquoi c'est juridique, et pas le blocage facture

Pour la facture, la purge ne détruit **pas** le document : elle délie deux clés internes et
la base prouve que le contenu est inchangé. Pour un devis ou un avenant accepté, la purge
**détruit le document contractuel lui-même**. Qu'il faille le conserver (et combien de temps)
est une question de droit, à trancher par le conseil de l'éditeur. Pistes à vérifier, non
tranchées ici : preuve du contrat d'entreprise et prescription, responsabilité décennale
après réception (BTP), conservation des contrats conclus par voie électronique avec un
consommateur au-delà d'un seuil de montant ; et, en amont, qui conserve (l'éditeur est
sous-traitant du client-entreprise pour ces données, DPA art. 8 : « supprimer ou restituer
… sauf obligation légale de conservation »).

### 6.3 Ce qui est prêt

| Réponse | État |
|---|---|
| **« Supprimer »** (la classification V2, devis et avenants = DELETE, est maintenue) | **Prototype non activé** : `docs/migrations-proposees/rgpd-purge-contrats-acceptes-v1.sql.proposed` + `…pgtap.sql.proposed`. Réutilise l'autorisation R1 : pendant une purge seulement, les verrous laissent supprimer la ligne, recalculer ses montants, délier un chantier supprimé. Statut, numéro, client, dates, conditions restent verrouillés même pendant la purge. **43/43**, purge complète du tenant réaliste, rejeu après restauration identique (§8). Activation : copier en migration après `…347`. |
| **« Conserver »** | Non prototypé : c'est un changement de classification (rétention **par ligne** : devis/avenants acceptés + leurs lignes et pièces jointes RETAIN, les autres DELETE), qui touche `rapport_purge_entreprise`, `purger_table_entreprise`, `marquer_entreprise_purgee`, et demande le délien du chantier sur le devis conservé (même mécanisme R1/R2 + une colonne `purge_snapshot` sur `devis` et `avenants`). Estimation : une migration de taille comparable à `…347`. Le périmètre exact (pièces jointes, signatures) dépend de la réponse. |

---

## 7. Sécurité

Tous exécutés (pgTAP, `supabase/tests/rgpd_purge_facture_emise_reconciliation_v1.test.sql`) :

| Cas demandé | Résultat |
|---|---|
| authenticated refusé | Pas d'EXECUTE sur la purge ni l'empreinte ; aucun accès au schéma `platform` ; délier une facture émise → refusé ; forger `purge_snapshot` → refusé ; drapeau de session `elsatia.purge_en_cours=on` → **aucun effet** |
| administrateur du tenant refusé | Appel direct de la purge → `42501` ; forger une autorisation → `42501` ; supprimer un chantier facturé → refusé ; modifier une facture émise → refusé |
| service_role : purge autorisée | Purge complète (tenant C ; tenant réaliste avec le prototype) |
| service_role hors purge | Écriture directe sur `factures` → `42501` ; dépôt d'autorisation → aucun droit ; `TRUNCATE factures` → refusé (R8) ; purge avant échéance → `ok=false` |
| mauvais tenant refusé | Autorisation pour A → rien sur les factures de B ; B sans échéance → purge refusée ; l'admin de A ne voit ni ne supprime le chantier de C (RLS) ; factures de B intactes après la purge de A |
| modification normale refusée | Pendant la purge (autorisation présente) : montant, délien d'un chantier encore existant, `devis_origine_id` sous une autorisation « chantiers », suppression → tous refusés. Après la purge : modification, effacement de la trace, suppression → refusés |

---

## 8. Sauvegarde, restauration, rejeu — et montée de version

`scripts/qualification/rgpd-invoice-immutability-v1.sh`, exécuté de bout en bout :

```
== sortie : <dossier de sortie>
== 1. T0 (train sans 20260923000347) : reproduction
   migrations appliquées : 328
   factures émises sans identité émettrice figée (T0) : 4
   purge : incomplete:avenants,lignes_devis,chantiers,devis
   échec avenants : Cet avenant est accepté et ne peut plus être supprimé.
   échec chantiers : Cette facture a déjà été émise et ne peut plus être modifiée.
   échec devis : Cette facture a déjà été émise et ne peut plus être modifiée.
   échec lignes_devis : Ce devis est accepté et ne peut plus être modifié.
== 2. UPGRADE : T0 + données → + 20260923000347
   migration appliquée sur base avec données : OK
   reprise des identités émettrices : 5 facture(s) ; restantes sans snapshot : 0
   compteurs inchangés : factures 5 → 5, lignes 9 → 9, paiements 2 → 2
   fresh : 329 migrations
   schéma upgrade = schéma fresh : IDENTIQUE
   purge (sans décision contrats) : incomplete:avenants,lignes_devis,chantiers,devis
   échec avenants : Cet avenant est accepté et ne peut plus être supprimé.
   échec chantiers : Ce devis est accepté et ne peut plus être modifié.
   échec devis : Ce devis est accepté et ne peut plus être supprimé.
   échec lignes_devis : Ce devis est accepté et ne peut plus être modifié.
== 3. PROTO : + prototype contrats acceptés (non activé dans le dépôt)
   prototype appliqué
== 4. DR : sauvegarde avant purge → purge → restauration → rejeu
   sauvegarde : 5.5M
   purge : complete
   factures : empreinte avant 69028efef44738b9bbac79846304cfb0 / après 69028efef44738b9bbac79846304cfb0
   état après purge : 95ee7a3494c1fcb91b0377177d6976cd
   restauration : erreurs pg_restore = 0
   base restaurée : purgée=f, chantiers=3, client=Lefèvre, audit du run=0
   rejeu de la purge : complete
   état après rejeu : 95ee7a3494c1fcb91b0377177d6976cd
   REJEU = PURGE D'ORIGINE : IDENTIQUE
== 5. FRESH : pgTAP
   rgpd_purge_facture_emise_reconciliation_v1 : 1..48 ok=48 not_ok=0
   purge_entreprise_architecture_v2 : 1..26 ok=26 not_ok=0
   purge_entreprise_supprimee : 1..20 ok=20 not_ok=0
   verrouiller_facture_emise : 1..6 ok=6 not_ok=0
   factures_relance_auto_exclue_verrou_v1 : 1..20 ok=20 not_ok=0
   correctif_isolation_factures : 1..10 ok=10 not_ok=0
   correctif_rls_isolation_factures : 1..28 ok=28 not_ok=0
   idempotence_paiement_et_avoir : 1..8 ok=8 not_ok=0
   gp_pilot_paiement_avoir_idempotence : 1..12 ok=12 not_ok=0
   document_partage_public_par_jeton_v1 : 1..42 ok=42 not_ok=0
   prototype (non activé) : 1..43 ok=43 not_ok=0
```

Lecture :
- **Upgrade** : `…347` s'applique sur une base T0 **avec données** ; les identités émettrices
  manquantes sont reprises (provenance marquée) ; compteurs inchangés ; schéma identique au
  fresh.
- **Rejeu** : la restauration d'une sauvegarde prise avant la purge fait réapparaître les
  données (attendu, déjà documenté par le lot rétention V1) et **perd l'audit du run** ; le
  rejeu de la purge produit exactement le même état (factures, délien, `purge_snapshot` hors
  horodatage, comptes par table, fiches anonymisées, fichiers Storage).
- Les fichiers Storage binaires ne sont pas dans une sauvegarde Postgres : sur un Supabase
  hébergé, la restauration remet les métadonnées d'un logo ou d'un document déjà supprimé.
  NOT PROVEN hébergé (même réserve que le lot rétention V1).

---

## 9. Tests

| Suite | Base | Résultat |
|---|---|---|
| Fresh | 329 migrations sur base vide | **329/329**, 0 erreur ; T0 (sans `…347`) : 328/328 |
| Upgrade | T0 (328) + données + `…347` | voir §8 |
| `rgpd_purge_facture_emise_reconciliation_v1` (nouveau) | fresh | **48/48** |
| `purge_entreprise_architecture_v2` | fresh | **26/26** (18/26 sur T0) |
| `purge_entreprise_supprimee` | fresh | **20/20** (19/20 sur T0) |
| `verrouiller_facture_emise` · `factures_relance_auto_exclue_verrou_v1` · `correctif_isolation_factures` · `correctif_rls_isolation_factures` · `idempotence_paiement_et_avoir` · `gp_pilot_paiement_avoir_idempotence` · `document_partage_public_par_jeton_v1` | fresh | 6/6 · 20/20 · 10/10 · 28/28 · 8/8 · 12/12 · 42/42 |
| Prototype contrats acceptés (non activé) | fresh + prototype | **43/43** |
| pgTAP complet (chaque fichier sur une base neuve) | T0 vs fresh | T0 : 106 fichiers propres / 118, 2 463 ok, 23 not ok · avec `…347` : **109 / 118, 2 520 ok, 14 not ok**. Seules différences : `purge_entreprise_architecture_v2` 18→26/26, `purge_entreprise_supprimee` 19→20/20, nouveau fichier 48/48. Les 9 fichiers restants sont les dettes connues du tronc, identiques sur T0 (7 Studio « Inscription fermée », `r72` pgsodium, Tools cloud sync) |
| `verify:migrations` · `verify:secrets` | — | 329 valides · aucun secret |
| `eslint scripts/purger-entreprise.mjs` · Vitest ciblés (`rgpd`, snapshot client, migrations) | — | 0 erreur · 109/109 |

---

## 10. Décisions et points ouverts

| ID | Question | État |
|---|---|---|
| `DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE` | Un devis / avenant accepté peut-il être supprimé par la purge, ou doit-il être conservé comme preuve du contrat ? | **Bloquant pour une purge réelle.** Prototype « supprimer » prêt (§6.3) ; « conserver » décrit |
| `DECISION_REQUIRED:RGPD-PURGE-VS-FACTURE-EMISE` (train §8) | La purge peut-elle délier une facture émise ? | **Fermée techniquement** par `…347` : le document et son contenu comptable sont prouvés inchangés |
| Conservation des factures par l'éditeur (préexistant, matrice rétention V1) | Durée ; et l'éditeur, sous-traitant, doit-il conserver ou restituer les factures du client-entreprise ? | Ouvert, non modifié. `…347` ne change pas ce qui est conservé |
| Minimisation dans `client_snapshot` | Le snapshot garde e-mail, téléphone et contact du client, qui ne sont pas imprimés sur la facture. Les vider à la purge modifierait un snapshot figé. | Ouvert, juridique. Rien modifié |
| Libellé du chantier dans `purge_snapshot` (V2 F8) | Le nom d'un chantier peut contenir un nom de personne (« Rénovation maison Lefèvre »). | Ouvert. Comportement V2 conservé |
| `remises_banque` (DELETE) supprime en cascade `remises_banque_paiements` (RETAIN) | Une table conservée perd des lignes par cascade | Signalé, non corrigé (classification) |
| `capturer_client_snapshot` et `capturer_entreprise_snapshot_facture` respectent un snapshot fourni à l'émission | Un membre du tenant peut figer une identité arbitraire en émettant par écriture directe. Conservé volontairement pour l'émetteur (même comportement que l'action TypeScript et que les devis ; une reprise de factures historiques doit pouvoir fournir leur identité d'origine) | Préexistant, faible (données de son propre tenant), signalé |
| Remplacement du logo | `modifierLogoEntrepriseAction` supprime l'ancien fichier : les factures déjà émises perdent leur logo, hors purge | Préexistant, signalé |
| Seed `supabase/production/seed_purge_qualification_v2.sql` | Ne se charge plus sur le train (plafond de personnes, devis accepté) | Signalé ; le tenant de ce lot le remplace pour les tests |
| Portage du lot rétention V1 | Son planificateur (`rgpd-purge-planificateur.ts`) doit reprendre le balayage final avant marquage | À faire au portage |

---

## 11. Fichiers

| Fichier | Nature |
|---|---|
| `supabase/migrations/20260923000347_rgpd_purge_facture_emise_reconciliation.sql` | Migration active (R1–R8) |
| `supabase/tests/rgpd_purge_facture_emise_reconciliation_v1.test.sql` | pgTAP, 48 assertions |
| `supabase/tests/fixtures/rgpd_tenant_facture_emise.inc` | Tenant réaliste, chemins applicatifs |
| `supabase/tests/fixtures/rgpd_purge_driver.inc` | Déroulé SQL de `purger-entreprise.mjs` (service_role) |
| `scripts/purger-entreprise.mjs` | Balayage final avant marquage |
| `docs/migrations-proposees/rgpd-purge-contrats-acceptes-v1.sql.proposed` | Prototype **non activé** |
| `docs/migrations-proposees/rgpd-purge-contrats-acceptes-v1.pgtap.sql.proposed` | Tests du prototype, 43 assertions |
| `scripts/qualification/rgpd-invoice-immutability-v1.sh` | Harnais : T0, upgrade, prototype, DR, fresh |
