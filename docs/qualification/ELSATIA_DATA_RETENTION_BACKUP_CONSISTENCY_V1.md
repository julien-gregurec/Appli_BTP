# ELSATIA — Cohérence rétention / purge / sauvegardes — V1

Date : 2026-09-26 · Branche : `claude/hopeful-tesla-r6hbea` (base : `claude/brave-planck-bzsvda`
= RGPD Purge V2, `26112ced`) · Aucune décision juridique prise.

## Verdict

# DATA RETENTION REQUIRES LEGAL DECISIONS

Les écarts **techniques** entre purge, audit, sauvegardes et restauration sont fermés et
prouvés par exécution locale réelle (PostgreSQL 16, 181 migrations, pgTAP, mock
PostgREST/Storage, vrai `@supabase/supabase-js`, vrais `pg_dump`/`pg_restore` via
`scripts/dr/`). Un défaut bloquant nouveau (F9) a été trouvé et corrigé.

Ce qui reste ouvert n'est pas technique :

- **l'activation** de la purge automatique (le mécanisme est livré, **désactivé**) ;
- **les durées de rétention** (aucune n'est codée ni appliquée) ;
- **les textes légaux** sur les sauvegardes, en contradiction avec ce qui est prouvé.

Il n'y a pas de verdict `BLOCKED` : rien n'empêche techniquement d'appliquer les décisions
une fois prises.

Réserve de périmètre, identique aux lots précédents : rien n'a été exécuté contre un
Supabase hébergé (ni vrai GoTrue, ni vraie API Storage, ni sauvegardes managées). Les
affirmations « hébergé » restent `NOT_PROVEN`.

---

## 1. Inventaire des rapports lus

Les rapports vivent sur des branches différentes, qui ne se contiennent pas les unes les
autres. Ils ont été lus avec `git show`, sans merge.

| Rapport | Branche · commit | Verdict | Ce qu'il apporte ici |
|---|---|---|---|
| RGPD Purge V2 (`ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2`) | `claude/brave-planck-bzsvda` · `26112ced` | LOCALLY QUALIFIED | Architecture de purge DELETE/ANONYMIZE/RETAIN, `platform.purge_audit`, script manuel. **Base de ce lot.** |
| DR (`ELSATIA_DR_EXACT_TIP_V2` + runbook V2) | `integration/elsatia-post-qualification-fix-convergence-v1` · `1b47ec1f` | LOCALLY PROVEN / HOSTED NOT PROVEN | `scripts/dr/` (backup/restore/verify) ; §15 : divergence des textes légaux sur les sauvegardes |
| Preview V2 (`ELSATIA_PREVIEW_GO_LIVE_CHECKLIST_V2`) | `claude/lucid-brahmagupta-xyzhlx` · `e7e8059c` | — | « Job de purge automatique : ACTUAL BLOCKER » ; « Divergence sauvegardes : ACTUAL BLOCKER (juridique) » |
| Owner Decisions (`..._REGISTER_V1`, `..._FINAL_V1`) | `claude/tender-heisenberg-brpzpn` · `ecec4865` ; `claude/kind-allen-68wk2i` · `a941c40f` | — | D4, D5, D6, P1-6, P1-7, P1-8 (`FLAG-CRONS-FAIL-OPEN`) |

Constat de branche : `main` ne contient **aucune** infrastructure de purge. La lignée
« écosystème » ne porte que la purge V1 (`20260922000327`), pas l'architecture V2. Le
travail est donc fait sur la branche RGPD V2, comme ce lot l'exige. Les migrations
`20260729000184/185` de cette lignée entrent en collision avec la lignée écosystème (déjà
signalé par Preview V2). La nouvelle migration utilise `20260923000400`, un horodatage
libre sur **toutes** les branches distantes (vérifié).

## 2. Matrice de rétention réelle

Classification lue dans la base (`tables_conservees_purge()`, `tables_anonymisees_purge()`,
`rapport_purge_entreprise()`) après les 181 migrations, **pas** dans la documentation.

| DATASET | TABLES | RETENTION_MECHANISM | PURGE_MECHANISM | BACKUP IMPACT | LEGAL_DECISION_REQUIRED |
|---|---|---|---|---|---|
| Facturation / avoirs | `factures`, `lignes_factures` | Aucune durée : conservé indéfiniment (RETAIN) | Jamais supprimé ; `purge_snapshot` si une référence est purgée (F8) | Présent dans toute sauvegarde | **Oui** : durée exacte (« 10 ans » est une hypothèse des textes, non codée) |
| Paiements / bancaire | `paiements`, `remises_banque_paiements`, `coordonnees_bancaires`, `connexions_bancaires`, `lots_virements`, `ordres_virements`, `journal_paiements_bancaires` | Aucune durée (RETAIN) | Jamais supprimé | Idem ; IBAN chiffrés, donc restaurables seulement avec `BANK_DATA_ENCRYPTION_KEY` | **Oui** : durée ; faut-il conserver `coordonnees_bancaires` après la fin du contrat ? |
| Paie (module complet) | `bulletins_paie`, `periodes_paie`, `dossiers_paie_salaries`, `validations_paie`, `absences_paie`, `indemnites_deplacement_paie`, `pieces_jointes_paie`, `journal_audit_paie`, `grands_deplacements` | Aucune durée ; tout le module est retenu (RETAIN) ; `journal_audit_paie` est immuable | Jamais supprimé | Idem | **Oui** : durée, et conservation du module en bloc ou ligne à ligne (V2 §12.2, D5) |
| Notes de frais + archivage | `notes_frais`, `depenses_fournisseurs`, `categories_notes_frais`, `documents_notes_frais`, `versions_documents_notes_frais`, `exports_notes_frais`, `elements_export_notes_frais`, **`journal_audit_notes_frais`, `validations_notes_frais` (F9)** | Aucune durée (RETAIN) ; archives immuables par trigger | Jamais supprimé ; fichiers Storage associés conservés | Idem | **Oui** : durée (D6, 10 ans proposé), sort des justificatifs Storage (V2 §12.3) |
| Documents contractuels | `signatures_documents` | Immuable par trigger (RETAIN) | Jamais supprimé ; fichiers Storage conservés | Idem | **Oui** : durée ; valeur probante (D7) |
| Journal d'activité | `journal_activite` | Aucune durée (RETAIN) ; `utilisateur_id` en clair | Jamais supprimé ni pseudonymisé | Idem | **Oui** : pseudonymiser `utilisateur_id` ? (P1-7) ; la politique publiée annonce « journaux techniques 6 à 12 mois », ce qui n'est appliqué nulle part |
| Facturation de la plateforme | `facturation_comptes_mensuelle` | RETAIN par analogie | Jamais supprimé | Idem | **Oui** (V2 §12.5) |
| Identités tiers | `clients`, `employes`, `fournisseurs` | La ligne reste (ANONYMIZE) | PII vidées par `anonymiser_table_entreprise` ; fichiers `employes.*_storage_path` supprimés | La sauvegarde garde les PII **non anonymisées** jusqu'à son expiration | **Oui** : anonymiser ou tout conserver (V2 §12.4, D4) |
| Pointage / GPS / photos | `pointages`, `sessions_pointage` + bucket `pointage-preuves` | Aucune | DELETE à la purge entreprise ; **rien** à l'anonymisation d'un seul salarié | Idem | **Oui** : P1-7 (preuve horaire ou effacement) |
| Opérationnel (98 tables) | `chantiers`, `devis`, `planning*`, `stock*`, `messages_internes`, `notifications_utilisateurs`, `journal_ia`, `support_messages`, `acces_support_log`, `abonnement_evenements`, `utilisateurs_entreprises`… | Aucune durée pendant le contrat | DELETE, dans l'ordre topologique, 30 jours après la demande | Idem | Partiel : `acces_support_log` (qui a accédé au tenant) et `abonnement_evenements` (événements Stripe de facturation plateforme) sont **supprimés** alors que leurs domaines voisins sont conservés. À confirmer. |
| Comptes / Auth | `auth.users`, `public.utilisateurs`, `appareils_comptes` | Aucune | **Hors purge entreprise** (pas d'`entreprise_id`) ; aucun mécanisme de suppression des comptes après la purge | Restaurés avec la base, hachages compris | **Oui** : la politique annonce « durée du contrat + 30 jours » pour les comptes, ce qui n'est **pas appliqué** |
| Prospects, support hors tenant | — | Aucune table | — | — | Politique : « prospects 3 ans », « support contrat + 1 an », sans mécanisme ni table dédiée |
| Journaux techniques | Vercel, Supabase, Sentry | Rétention fixée par les fournisseurs, jamais vérifiée dans ce dépôt | — | — | « 6 à 12 mois » annoncé, non vérifié |
| Preuve de purge | `platform.purge_audit` | **Append-only (A1)**, sans durée | Jamais supprimée | Dans le dump (`pg_restore -l` : schéma `platform` présent) ; **perdue** en cas de restauration antérieure à la purge. D'où A2. | Durée de conservation de la preuve elle-même |

**Conclusion de la matrice.** Le seul mécanisme de rétention réellement codé est binaire :
conserver indéfiniment (RETAIN), ou supprimer/anonymiser à la purge. Aucune purge
**par durée** n'existe (pas de `pg_cron`, aucune suppression datée dans les migrations,
vérifié par recherche). Toutes les durées publiées sont donc des engagements non appliqués.
C'est une décision juridique (quelles durées) avant d'être un travail technique.

## 3. Planificateur de purge

**Vérification.** Preview V2 avait raison : aucun job n'existait. `vercel.json` ne déclare
que `/api/cron/abonnements` et `/api/cron/notifications-push`, aucune migration n'utilise
`pg_cron`, et le script `purger-entreprise.mjs` indique « jamais automatique ».

**Peut-on l'activer sans décision légale ?** Non. P1-6 dit explicitement que l'infrastructure
« ne peut pas être activée sans cette liste », D4 laisse ouverte la question « validation
plateforme obligatoire ? », et `PROMPT_CODEX_RGPD.md` réserve ce choix à Julien. Le mécanisme
est donc **préparé et désactivé par défaut** :

- `src/lib/rgpd-purge-planificateur.ts` reproduit le déroulé du script manuel : ordre
  topologique, 5 passes de rattrapage, anonymisation, Storage (orphelins seulement),
  marquage.
- Il est greffé **en dernier** sur le cron quotidien `/api/cron/abonnements` (même raison
  que les autres fonctions greffées : limite de crons du plan Vercel Hobby). `vercel.json`
  n'est pas modifié.
- **Fail-closed** :

| `RGPD_PURGE_PLANIFICATEUR_MODE` | Effet |
|---|---|
| absent / vide / `off` (**défaut**) | Aucun appel base (prouvé : 0 requête HTTP) |
| valeur inconnue (`true`, `1`, `on`…) | `off` |
| `dry-run` | Lecture seule : rapport et classement Storage, **aucune écriture**, pas même d'audit |
| `execute` sans `RGPD_PURGE_DECISION_REF` | `off` |
| `execute` + `RGPD_PURGE_DECISION_REF` | Purge ; la référence de décision est consignée dans `platform.purge_audit` à chaque exécution |

- `RGPD_PURGE_MAX_ENTREPRISES` : 1 par défaut, plafonné à 10.
- **Sélection par l'horloge de la base** (`lister_purges_echues`, service_role), puis un
  second filtre applicatif (`evaluerEcheance`) écarte : échéance absente, illisible ou future,
  demande absente ou future, entreprise déjà purgée, horloge invalide, et **échéance plus
  courte que demande + 30 jours** (date posée à la main ou corrompue ; la voie manuelle reste
  possible). Une entreprise inéligible ne bloque pas la file.
- **`run_id` déterministe** par (entreprise, échéance) : une reprise le lendemain prolonge le
  même run dans l'audit.
- **Ne lève jamais** d'exception vers le cron : un échec de la purge n'affecte pas les autres
  tâches du cron.

Activation : une seule variable d'environnement plus une référence de décision. **Rien
d'autre à coder.**

## 4. Sauvegardes : textes légaux vs réalité technique

Aucun texte juridique n'a été modifié.

| Document · ligne | Formulation exacte | Réalité technique constatée | Écart |
|---|---|---|---|
| `docs/juridique/cgv.md:57` (7.3) | « L'Éditeur réalise des sauvegardes régulières des données conformément à sa politique de sécurité. » | Aucune sauvegarde récurrente dans le dépôt ; les procédures (`scripts/dr/05_backup.sh`, runbooks de cutover) sont **manuelles**. Aucune « politique de sécurité » de sauvegarde écrite. Sauvegarde managée Supabase **non confirmée** (DR V2 §15). | « régulières » **non prouvé** ; la « politique » citée n'existe pas |
| `docs/juridique/rgpd-registre-des-traitements.md:71` | « Sauvegardes automatiques régulières. » | Idem ; rien d'« automatique » côté application | **Contredit** tant que le PITR ou le snapshot Supabase n'est pas confirmé |
| `docs/juridique/politique-confidentialite.md:74` | « …sauvegardes régulières, journalisation. » | Idem | Non prouvé |
| `docs/juridique/dpa-entreprises-clientes.md:31` | « …sauvegardes… » (mesures art. 32) | Idem | Non prouvé |
| `docs/juridique/cgv.md:75` (10.2) · `politique-confidentialite.md:38` · `dpa…:36` | 30 jours puis **suppression**, sauf conservation légale | La purge existe, mais sans job actif (§3). Les sauvegardes antérieures gardent les données jusqu'à leur propre expiration (§5). | **Aucun texte ne mentionne les sauvegardes** dans la suppression. Le délai réel d'effacement complet = 30 j + délai d'exécution de la purge + rétention des sauvegardes (**inconnue**) |
| UI `parametres/donnees/page.tsx:98` | « Passé ce délai, vos données sont supprimées. » | Sans job : suppression seulement si un opérateur lance le script. Sauvegardes non mentionnées. | Même écart, **affiché à l'utilisateur** |
| `politique-confidentialite.md:37` · registre §1 | Comptes : « durée du contrat + 30 jours » | `auth.users` / `utilisateurs` ne sont jamais supprimés par la purge entreprise | Non appliqué |
| `politique-confidentialite.md:41` · registre §5 | Journaux techniques « 6 à 12 mois » | `journal_activite` conservé indéfiniment ; journaux des fournisseurs non vérifiés | Non appliqué |

Options, à trancher par le propriétaire (non tranchées ici) : (a) confirmer ou activer PITR ou
snapshot Supabase et documenter sa rétention, puis compléter les textes avec « les données
supprimées disparaissent des sauvegardes à l'expiration de leur durée de rétention (N jours) » ;
ou (b) reformuler les textes vers « sauvegardes réalisées par l'hébergeur » et « manuelles lors
des opérations de maintenance ».

## 5. DR : backup ↔ restore ↔ purge ↔ suppression de tenant ↔ rétention

Prouvé par exécution (`scripts/dr/05_backup.sh` et `06_restore.sh`, §7.3) :

1. **Une purge n'efface pas les sauvegardes.** Sauvegarde prise après la demande, avant la
   purge. Après une purge complète, la restauration fait **réapparaître** les données de
   l'entreprise : 5 pointages, 13 métadonnées de fichiers et le nom réel. La preuve renvoyée
   par `preuve_purge_entreprise()` le dit explicitement (champ `sauvegardes`) ; aucun code ni
   texte du dépôt ne prétend désormais le contraire.
2. **La preuve de purge en base disparaît avec une restauration antérieure** :
   `platform.purge_audit` est vide dans la base restaurée. D'où l'**export hors base** (A2) :
   `purger-entreprise.mjs <id> preuve --out=…`, qui n'écrase jamais un fichier existant.
3. **Rejeu après restauration.** Sauvegarde postérieure à la demande : le planificateur rejoue
   seul la purge. Résultat identique à la preuve archivée (`tables_purgees`,
   `tables_anonymisees` et `run_id` identiques).
4. **Sauvegarde antérieure à la demande.** L'entreprise revient sans échéance : ni la purge
   manuelle ni le planificateur ne peuvent la traiter. `restaurer_echeance_depuis_preuve()`
   (A4, service_role) ré-applique l'échéance consignée dans la preuve archivée, puis la purge
   est rejouée. Refus : preuve non `PURGEE`, dates illisibles ou futures, entreprise absente,
   déjà purgée ou portant déjà une échéance. Une seconde application est refusée.
5. **Storage : limite non couverte.** La restauration de la base remet les **métadonnées**
   `storage.objects`, pas les fichiers binaires (stockés hors Postgres chez Supabase). Après
   restauration, les fichiers déjà supprimés sont des références mortes, et les fichiers non
   supprimés sont intacts. Le rejeu de la purge nettoie les métadonnées orphelines. Non
   testable ici (pas de vraie API Storage) : **HOSTED NOT PROVEN**.
6. **Limite de l'outillage DR** (branche d'intégration, non modifiée ici) :
   `scripts/dr/04_manifest.sh` ne vérifie que les schémas `public`, `auth` et `storage`.
   `platform.purge_audit` est bien **dans le dump** (vérifié avec `pg_restore -l`), mais n'est
   pas **comparé** par `07_verify.sh`. À ajouter lors du portage.

**Procédure opérateur après toute restauration** (à ajouter au runbook DR lors du portage) :
pour chaque preuve archivée dont `purgee_at` est postérieur au point de restauration →
`restaurer-echeance --preuve=…` si l'entreprise n'a pas d'échéance → `execute` → `verify` →
nouvelle `preuve`.

**Suppression de tenant pendant une purge (A3, défaut corrigé).**
`annuler_suppression_entreprise` était appelable **en cours de purge** : l'entreprise restait à
moitié supprimée, avec son échéance remise à `NULL`, et la purge ne pouvait plus être terminée.
`demander_suppression_entreprise` permettait aussi de repousser l'échéance en cours de purge.
Les deux refusent désormais dès qu'une étape a réellement modifié des données
(`purge_entreprise_commencee`). Avant ce point, le comportement est inchangé.

## 6. Audit : survie de la preuve

| Menace | Avant | Après |
|---|---|---|
| Purge de sa propre piste | Déjà corrigé (V2 F4 : schéma `platform`) | Inchangé |
| `UPDATE`, `DELETE` ou `TRUNCATE` de l'audit (propriétaire, fonction SECURITY DEFINER, superutilisateur) | Possible : seuls des GRANT limitaient `service_role` | **Refusé par trigger** (A1), prouvé contre le superutilisateur |
| Restauration antérieure à la purge | Preuve perdue sans trace | Preuve JSON archivée hors base, avec empreinte SHA-256 déterministe de la piste (A2) ; toute entrée ajoutée change l'empreinte |
| Traçabilité de l'automatisation | — | Chaque exécution du planificateur consigne son mode et la `decision_ref` (étape `planificateur`, jamais comptée comme purge commencée) |
| Traçabilité d'un rejeu | — | `restauration_echeance` consignée, avec l'empreinte de la preuve source |

Limite : l'empreinte est **inviolable a posteriori** (toute modification est détectable), mais
elle n'est pas **signée**. Horodater ou signer les preuves chez un tiers est une décision de
niveau de preuve (liée à D7).

## 7. Tests et exécutions réelles

### 7.1 Automatisés

| Suite | Résultat |
|---|---|
| Rejeu des migrations sur base neuve | **181/181** |
| pgTAP (9 fichiers, dont `purge_preuve_et_garde_annulation.test.sql` : 43) | **142/142** |
| vitest (30 fichiers, dont `rgpd-purge-planificateur.test.ts` : 24) | **136/136** |
| `tsc --noEmit` | OK |
| `eslint` | 0 erreur (3 warnings `<img>` préexistants) |
| `verify:migrations` · `verify:secrets` | OK · OK |
| `next build` | OK (compilé, exit 0) |

Couverture demandée :

| Cas | Test |
|---|---|
| Planificateur off par défaut, aucun accès base | vitest « mode off » + E2E (0 requête HTTP) |
| Idempotence | vitest (double purge : 0 ligne de plus, entreprise non re-sélectionnée) ; pgTAP (table vide = ok/0 ; A4 : seconde application refusée) ; E2E passage 3 |
| Mauvaise date | vitest : `null`, `""`, illisible, non-texte, future (+1 s), époque 1970, délai < 30 j, demande absente/illisible/future, horloge invalide ; pgTAP : dates illisibles ou futures dans une preuve ; E2E : tenant B avec délai incohérent ignoré |
| Retry | vitest : échec transitoire rattrapé dans le passage ; échec persistant, puis reprise le lendemain avec le même `run_id` ; échec Storage, puis reprise ; exception ; audit indisponible. E2E : verrou réel |

### 7.2 E2E planificateur (vrai `supabase-js` → mock PostgREST/Storage → PostgreSQL)

Jeu de données `seed_purge_qualification_v2.sql`. Tenant A échu ; tenant B avec échéance
incohérente (demande J-1, échéance H-1), témoin d'isolation.
Exécuteur : `.qualification-tools/planificateur_purge_e2e.mts`.

| # | Scénario | Résultat réel |
|---|---|---|
| 1 | Mode par défaut | `off`, **0 requête HTTP** |
| 2 | `execute` sans référence | `off` (`execute_sans_reference_de_decision`), 0 requête |
| 3 | `dry-run` | A : 11 DELETE / 3 ANONYMIZE / 4 fichiers à traiter ; B ignoré (`delai_incoherent`) ; **audit : 0 ligne écrite** ; données intactes |
| 4a | `execute`, `pointages` verrouillée en ACCESS EXCLUSIVE par une autre session | Le rapport échoue (lock timeout) → `erreur`, **rien modifié**, échec audité |
| 4b | `execute`, `pointages` verrouillée en SHARE (lecture permise, DELETE bloqué) | `incomplete` : 9 tables purgées, `pointages` (lock timeout) et `chantiers` (FK) en échec après rattrapage, **entreprise non marquée** ; `preuve` = `PURGE_COMMENCEE` |
| 5 | Passage suivant, verrou levé | `complete` : +2 tables, 3 anonymisées, 10 fichiers orphelins supprimés, **même `run_id`** (1 seul run dans l'audit) |
| 6 | Passage suivant (idempotence) | A non re-sélectionnée, B toujours ignoré |
| 7 | `verify` · `preuve --out` | `PURGE COMPLÈTE` (exit 0) · `PURGEE`, empreinte `ccb2905c…` ; une seconde écriture est refusée (`EEXIST`) |
| 8 | Isolation de B | Empreinte identique avant et après : `1c0c8cba2392a9524f25e074cc436c12` |
| 9 | `UPDATE` / `DELETE` sur `platform.purge_audit` | Refusés (A1) |

### 7.3 E2E DR ↔ purge

| Étape | Résultat réel |
|---|---|
| `05_backup.sh` après la demande, avant la purge | `backup_id=20260923T183305Z` |
| Purge par le planificateur, puis `preuve` | `complete`, run `9341e999…`, 11 tables, 10 fichiers |
| `06_restore.sh` (intégrité sha256 OK) | Base restaurée : **5 pointages, 13 fichiers, nom réel, non purgée, audit = 0** |
| Planificateur sur la base restaurée | `complete`, **même `run_id`** ; `tables_purgees` et `tables_anonymisees` identiques à la preuve archivée |
| Base restaurée, échéance effacée (sauvegarde antérieure à la demande) | Planificateur : rien à traiter ; `restaurer-echeance --preuve` → échéance ré-appliquée ; 2ᵉ application refusée ; rejeu `complete` |

Incident d'outillage, par transparence : lors d'un premier essai du rejeu, l'ancien serveur
mock n'avait pas été arrêté (PID de sous-shell). Le résultat « identique » obtenu portait
donc sur la **même** base : il a été écarté puis refait correctement (tableau ci-dessus).

## 8. Défauts trouvés et corrigés dans ce lot

| # | Défaut | Preuve | Correction |
|---|---|---|---|
| **F9** | `journal_audit_notes_frais` et `validations_notes_frais` sont immuables par trigger mais classées **DELETE** : toute entreprise ayant utilisé l'archivage des notes de frais échoue **définitivement** à la purge et n'est jamais marquée. Non vu en V2 : le jeu de données n'avait aucune ligne dans ces tables. | Reproduit : `purger_table_entreprise` → `ok=false`, « Cet enregistrement d'archive est immuable » | Reclassées RETAIN (règle F5/F6 de V2 ; leurs FK ne visent que des tables jamais supprimées) ; miroir TS mis à jour ; **nouveau test vitest de synchronisation SQL↔TS** ; assertion pgTAP générique : aucune table DELETE ne porte un trigger d'archive immuable |
| A3 | Annulation ou nouvelle demande possible en cours de purge | pgTAP | Refus dès que la purge a commencé |
| A1 | Audit modifiable par le propriétaire ou un superutilisateur | pgTAP | Trigger append-only (UPDATE/DELETE/TRUNCATE) |
| A2 / A4 | Preuve et rejeu impossibles après restauration | E2E §7.3 | `preuve_purge_entreprise`, `restaurer_echeance_depuis_preuve`, modes de script |

Signalés, **non corrigés** (hors périmètre ou décision) :

- Les FK `ON DELETE SET NULL` depuis `utilisateurs` vers des tables immuables
  (`journal_audit_notes_frais`, `validations_notes_frais`, via `trg_refuser_mutation_archive`)
  font **échouer la suppression d'un utilisateur** qui y figure. C'est la même nature de
  conflit « effacement vs archive immuable » que P1-7 ; aucun chemin de suppression de compte
  n'existe encore.
- `annuler_suppression_entreprise` reste possible **après** l'échéance tant que la purge n'a
  pas commencé, alors que l'UI dit « passé ce délai, vos données sont supprimées ». C'est un
  choix produit, non modifié.
- `DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN` (P1-8) : le planificateur est fail-closed par sa
  propre variable, indépendamment de ce flag.

## 9. Fichiers modifiés

- `supabase/migrations/20260923000400_purge_preuve_et_garde_annulation.sql` : F9, A1, A2, A3,
  A4, `lister_purges_echues`, `consigner_planificateur_purge` ; nouvelles fonctions
  service_role uniquement.
- `src/lib/rgpd-purge-planificateur.ts` (+ `.test.ts`) : planificateur désactivé par défaut.
- `src/app/api/cron/abonnements/route.ts` : greffe du planificateur (sans effet en mode off).
- `scripts/purger-entreprise.mjs` : modes `preuve` et `restaurer-echeance`.
- `src/lib/rgpd.ts` (+ test) : miroir F9 et test de synchronisation.
- `supabase/tests/purge_preuve_et_garde_annulation.test.sql` : 43 assertions.
- `.qualification-tools/planificateur_purge_e2e.mts` : exécuteur E2E.
- `.env.local.example` : 3 variables, vides par défaut.

## 10. Décisions propriétaire nécessaires (aucune prise ici)

1. **Activer la purge automatique ?** Si oui : `RGPD_PURGE_PLANIFICATEUR_MODE=execute` et
   `RGPD_PURGE_DECISION_REF=<référence écrite>` (conseillé : une période en `dry-run` d'abord).
   Préalables : P1-6 (liste RETAIN/DELETE), D4 (validation plateforme ou non).
2. **Durées de rétention** par domaine (§2). Aucune n'est appliquée aujourd'hui ; leur
   application exigera un mécanisme de purge par durée, à construire une fois les durées fixées.
3. **Sauvegardes** : confirmer ou activer PITR/snapshot Supabase et sa rétention, **ou**
   reformuler les 4 textes (§4), et dans les deux cas indiquer que l'effacement dans les
   sauvegardes suit leur rétention.
4. **Comptes utilisateurs** après purge (« contrat + 30 jours » annoncé, non appliqué) et
   conflit avec les archives immuables (§8).
5. Classement de `acces_support_log` et `abonnement_evenements` (supprimés aujourd'hui).
6. Conservation, signature ou horodatage tiers des preuves de purge (§6).
7. Portage vers la ref déployable : cette branche hérite de la collision `20260729000184/185`
   (renumérotation obligatoire, cf. Preview V2).
