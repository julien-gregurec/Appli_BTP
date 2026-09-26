# Runbook — purge RGPD (art. 17) d'une entreprise — V2

Statut : architecture V2 (migration `20260729000185_purge_entreprise_architecture_v2.sql`,
script `scripts/purger-entreprise.mjs`). Corrige les 8 défauts structurels confirmés par
la qualification end-to-end V1 (voir `docs/qualification/ELSATIA_RGPD_PURGE_END_TO_END_V1.md`)
et validés par une exécution réelle décrite dans
`docs/qualification/ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md`.

Ce runbook s'adresse à l'opérateur plateforme habilité (jamais en self-service — voir
§6 Sécurité). Toute exécution contre une base de production doit être précédée d'une
revue par Julien des décisions juridiques encore ouvertes (§8) et de la vérification du
backup (§2).

## 0. Ce qui a changé depuis V1

| # | Défaut V1 | Correction V2 |
|---|---|---|
| F1 | L'audit d'un échec de `purger_table_entreprise` ne survivait jamais (rollback de transaction) | La fonction ne relance plus d'exception : elle retourne `(ok, lignes, erreur)` et consigne systématiquement dans `platform.purge_audit`, même en cas d'échec |
| F2 | Ordre de purge alphabétique | `rapport_purge_entreprise()` calcule un tri topologique réel depuis `pg_constraint` (RESTRICT/NO ACTION), recalculé à chaque appel |
| F3 | 9 tables verrouillées en permanence dès qu'une entreprise a un historique réel | `clients`/`employes`/`fournisseurs` reclassées ANONYMIZE (ligne conservée, PII vidée) ; `notes_frais`/`depenses_fournisseurs`/le module paie complet reclassés RETAIN (domaine légal explicite) |
| F4 | La purge effaçait sa propre piste d'audit en cours de run | L'audit vit dans un schéma `platform` séparé, jamais scanné par la recherche dynamique `entreprise_id` du schéma `public` |
| F5 | `journal_audit_paie` classée DELETE malgré un trigger d'immuabilité existant | Reclassée RETAIN (le trigger avait raison, la classification avait tort) |
| F6 | `signatures_documents` classée DELETE malgré un trigger d'immuabilité + valeur probante | Reclassée RETAIN, fichiers Storage jamais supprimés |
| F7 | Références Storage mortes laissées en base pour les tables bloquées | `verifier_storage_entreprise()` réconcilie dynamiquement TOUTE colonne `*_storage_path` du schéma contre les fichiers réels, classe ORPHELIN/RETAIN/A_PURGER |
| F8 | `factures.devis_origine_id` (et 11 autres colonnes) mis à `NULL` silencieusement | Instantané `{id, libelle}` écrit dans une colonne `purge_snapshot jsonb` avant tout SET NULL/SET DEFAULT déclenché par la purge |

## 1. Pré-requis

- Accès `SUPABASE_SERVICE_ROLE_KEY` et `NEXT_PUBLIC_SUPABASE_URL` de l'environnement cible.
- `suppression_prevue_at` doit être renseigné et échu sur l'entreprise cible
  (`demander_suppression_entreprise` l'a positionné à J+30 lors de la demande ; ce
  runbook ne couvre pas cette étape, antérieure).
- Lire §8 (décisions juridiques ouvertes) : la purge est **techniquement complète**
  pour toute entreprise, quel que soit son historique — mais le périmètre RETAIN
  reste une proposition technique, pas un arbitrage juridique validé.

## 2. Backup

**Toujours prendre un backup restaurable avant une purge réelle.** La purge est
irréversible pour les tables DELETE (§7). Utiliser le mécanisme de backup de
l'hébergeur (hors périmètre de ce dépôt) et vérifier qu'il couvre l'entreprise cible
avant de continuer.

## 3. Dry-run (simulation, non destructif)

```
node scripts/purger-entreprise.mjs <entreprise_id> dry-run
```

Affiche, pour l'entreprise cible :
- les tables **DELETE**, avec leur ordre topologique réel et leur nombre de lignes ;
- les tables **ANONYMIZE** (ligne conservée, PII vidée) ;
- les tables **RETAIN** (jamais touchées) ;
- les fichiers Storage réels, classés ORPHELIN / RETAIN / A_PURGER.

**Rien n'est modifié.** Faire relire ce rapport par un second opérateur avant de
continuer — en particulier vérifier que les comptes correspondent à ce qui est
attendu pour cette entreprise, et qu'aucune table RETAIN inattendue ne contient un
volume anormal (signe possible d'un arbitrage juridique à revoir, pas d'un bug).

## 4. Purge réelle

```
node scripts/purger-entreprise.mjs <entreprise_id> execute
```

Affiche un `run_id` au démarrage — **le noter**. Déroulement :
1. Purge les tables DELETE dans l'ordre topologique, avec jusqu'à 5 passes de
   rattrapage automatique en cas d'échec transitoire.
2. Anonymise les tables ANONYMIZE (`clients`, `employes`, `fournisseurs`).
3. Réconcilie Storage et supprime physiquement les fichiers devenus orphelins
   (jamais les fichiers RETAIN, même s'ils appartiennent à une table anonymisée —
   les fichiers `employes.*_storage_path` sont bien orphelins puisque la colonne DB
   est vidée par l'anonymisation, donc bien supprimés ; les fichiers de
   `signatures_documents`/`notes_frais` conservés ne le sont jamais).
4. Anonymise la fiche `entreprises` elle-même (`marquer_entreprise_purgee`), sous
   réserve d'une garde de complétude : refuse tant qu'il reste des lignes DELETE ou
   des fichiers Storage A_PURGER.

## 5. Interruption / reprise

En cas d'interruption (Ctrl+C, crash, panne réseau) à n'importe quelle étape :

```
node scripts/purger-entreprise.mjs <entreprise_id> execute --run-id=<run_id noté ci-dessus>
```

Sûr par construction : `purger_table_entreprise`/`anonymiser_table_entreprise` sont
idempotents (une table déjà vide/déjà anonymisée renvoie `ok=true`, 0 ligne, sans
erreur) — la reprise ne refait aucun travail déjà fait et ne peut pas produire de
double suppression. Le `run_id` relie les nouvelles entrées d'audit aux précédentes
dans `platform.purge_audit` pour garder une piste continue du run entier.

## 6. Vérification

```
node scripts/purger-entreprise.mjs <entreprise_id> verify
```

Code de sortie 0 si la purge est complète (0 table DELETE avec des lignes, 0 fichier
Storage A_PURGER), 1 sinon avec le détail de ce qui reste. Affiche aussi un résumé de
la piste d'audit (`platform.purge_audit`, y compris les échecs consignés). À exécuter
systématiquement après une purge réelle, et utilisable à tout moment (avant, pendant,
après) pour un état des lieux sans effet de bord.

## 7. Ce qui est irréversible / ce qui ne l'est pas

- **Irréversible** : les tables DELETE (données définitivement supprimées) et les
  fichiers Storage physiquement supprimés — seule une restauration de backup les
  récupère.
- **Réversible partiellement** : l'anonymisation (ANONYMIZE, entreprise) écrase les
  colonnes personnelles — récupérable uniquement par backup, la ligne elle-même
  n'est pas supprimée.
- **Jamais affecté** : les tables RETAIN. Leur contenu peut recevoir un
  `purge_snapshot` (instantané des références purgées, F8) mais n'est jamais
  supprimé ni altéré autrement que par ce mécanisme.

## 8. Décisions juridiques encore ouvertes

Voir `docs/qualification/ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md` §12 pour la
liste complète et à jour. En résumé, cette V2 ne tranche AUCUNE décision juridique
nouvelle ; elle rend techniquement cohérent et exécutable le périmètre proposé par les
lots précédents (conserver par défaut en cas de doute), mais les points suivants
restent `LEGAL_DECISION_REQUIRED` :
- Durée exacte de conservation de chaque domaine RETAIN (10 ans comptable est une
  hypothèse, pas une valeur codée en dur ni vérifiée table par table).
- Périmètre exact du module paie retenu en bloc (dossiers/périodes/absences/
  indemnités) — une purge plus fine par ancienneté est possible mais non implémentée.
- Sort des fichiers Storage `notes_frais` (justificatifs) conservés : conservés par
  défaut avec la ligne, jamais réévalués indépendamment.
- Anonymisation vs conservation intégrale de `clients`/`employes`/`fournisseurs` :
  cette V2 anonymise (recommandé RGPD), mais le choix engage la plateforme.

## 9. Sécurité

- Toutes les fonctions de purge (`rapport_purge_entreprise`, `purger_table_entreprise`,
  `anonymiser_table_entreprise`, `verifier_storage_entreprise`,
  `marquer_entreprise_purgee`, `lire_audit_purge_entreprise`) sont réservées à
  `service_role` — jamais self-service, jamais accessible à `anon`/`authenticated`
  (vérifié par pgTAP, `supabase/tests/purge_entreprise_architecture_v2.test.sql`).
- `platform.purge_audit` n'est lisible que par `service_role` (RLS activée, aucune
  policy, + REVOKE explicite).
- La purge n'est jamais déclenchée automatiquement (aucun `pg_cron`) : toujours une
  exécution manuelle supervisée par la plateforme, conforme à `PROMPT_CODEX_RGPD.md`.
  Un planificateur existe depuis `20260923000400` (`src/lib/rgpd-purge-planificateur.ts`,
  greffé sur `/api/cron/abonnements`) mais il est **désactivé par défaut** et ne s'active
  qu'avec `RGPD_PURGE_PLANIFICATEUR_MODE=execute` + `RGPD_PURGE_DECISION_REF`.
- Après chaque purge : `preuve --out=<fichier>` et archivage **hors base**. Après toute
  restauration de sauvegarde : rejouer les purges archivées (`restaurer-echeance` si
  besoin, puis `execute`) — voir
  `docs/qualification/ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md` §5.

## 10. Cas bloqués

Aucun, structurellement, dans cette V2 : toute table auparavant verrouillée de façon
permanente (F3) est désormais soit RETAIN soit ANONYMIZE, jamais laissée dans un état
où la purge échoue indéfiniment. Un échec réel à l'exécution (`ok=false` sur une table
DELETE après les 5 passes de rattrapage) signale un problème imprévu par cette
architecture (schéma modifié depuis, cycle de dépendances introduit par une migration
ultérieure — voir le garde-fou anti-cycle dans `rapport_purge_entreprise()`) : à
investiguer au cas par cas, jamais à contourner en forçant une suppression.
