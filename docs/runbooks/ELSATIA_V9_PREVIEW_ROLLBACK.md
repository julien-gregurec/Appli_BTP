# ELSATIA V9 — Retour arrière du cutover Preview (pack générique, train V9.2+)

| | |
|---|---|
| Cible | Preview `pgvvpqyjziyapbbkydmc` + projet Vercel `elsatia-preview` (GP). **Production `exhvuzegsefmoguxoiak` : hors périmètre, jamais touchée.** |
| Code servi avant cutover | le déploiement Preview en cours (à consigner avant tout cutover ; historique : V8 `de50245a259e06623fbab070f9dc296573bae0ce`) |
| Code à déployer | **HEAD** du train porteur du pack (`sha_deploye` du rapport de cutover ; base V9.1 `24a0c2e9…` ancêtre exigée) |
| Migrations | `CURRENT_LEDGER` (ledger exporté) → `PENDING_MIGRATIONS` (train − ledger) → `TARGET_LEDGER` (train local) : **calculés**, jamais codés |
| Outils | `scripts/preview/v9/` (`v9-cutover.sh`, `code-deploy-gate.mjs`, `post-cutover-check.mjs`) |
| Sauvegarde | `ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md` |

## 0. Règle générale

1. **Pas de script « down » improvisé.** Aucune migration n'est annulée par du SQL écrit à la
   volée. Seuls les scripts de retour **versionnés et revus** cités au §1 (lot performance V9.2)
   peuvent être joués, sur décision humaine.
2. **Base AVANT code, et code arrière AVANT toute idée de base arrière.** Le code déjà servi est
   compatible avec la base à jour (fonctions à signature conservée, objets additifs) ; le code de
   HEAD ne l'est pas avec une base en retard (§3).
3. **Restaurer la base est le dernier recours** : seulement si des données sont corrompues.
4. Toute décision non couverte ici = `DECISION_REQUIRED` : on s'arrête, on garde les preuves, on
   choisit l'option la plus conservatrice (ne rien appliquer, ne rien restaurer, code servi inchangé).

## 1. Classement des migrations en attente (tableau GÉNÉRÉ)

Le classement **par migration** n'est plus recopié ici : il est généré depuis le SQL, pour
chaque point de départ, dans
**[`docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md`](../qualification/preview-pack/V9_MIGRATION_PLAN.generated.md)**
(colonnes Rang · Version · Nom · **Classe** · **Phase 0** · **Note**), depuis le socle V8 (plancher
`20261002000813` ORIGINALE) **et** depuis la base publiée V9.1 (`20261002001302`).

- Régénération : `node scripts/preview/v9/migration-plan-v9.mjs --write-doc` ; contrôle :
  `npm run preview:v9:preflight` (`PLAN-DOC`, `ROLLBACK-CLASSEMENT` : chaque migration en attente
  depuis le socle V8 a sa classe dans ce tableau, égale au classement calculé depuis le SQL).
- Classement du ledger RÉEL : `node scripts/preview/v9/classify-migrations-v9.mjs --ledger <export>`
  (PENDING_MIGRATIONS = train − ledger fourni).
- Classes (instructions de premier niveau, corps de fonctions exclus ; inconnu = pire cas) :
  `REVERSIBLE` (ni donnée ni structure de table touchée — pas « un retour SQL est fourni »),
  `FORWARD_ONLY` (additif : le retirer détruirait ce qui a été écrit depuis), `RESTORE_REQUIRED`
  (modifie des données ou de la structure existante au niveau supérieur : seule une restauration
  revient **exactement** à l'état antérieur — la note dit si c'est utile).

### Notes manuelles (`NOTES_RETOUR`, reprises dans la colonne « Note » du tableau généré)

| Version | Note de retour arrière |
|---|---|
| `20261002000901` | Preuves d'acceptation légale (append-only) : **ne jamais supprimer**, même en rollback. |
| `20261002001001` | **CORRECTIF DE SÉCURITÉ** (lecture fail-open fermée) : ne JAMAIS rejouer les anciennes policies, même en rollback code. |
| `20261002001112` | Registre des clés + garde d'écriture : le code V8 écrit en v1 (k1), accepté par la garde ; laisser en place. |
| `20261002001113` | Limiteur de connexion : requis par le code V9 (login fail-closed sans lui) ; sans effet sur le code V8. |
| `20261003000103` | Données de référence **locales** (url_locale de Réserves), mises à jour seulement si encore à la valeur d'origine ; sans effet sur l'accès : laisser en place. |
| `20261003000201` | Pont d'upgrade **PRODUCTION** (phase 0, marqueur `-- elsatia:upgrade-phase0`) : **no-op en Preview** (`20260921000300` déjà au ledger), appliqué dans l'ordre lexical normal ; aucun retour à prévoir. Son classement SQL (`RESTORE_REQUIRED`) décrit le chemin Production, jamais exécuté en Preview. |
| `20261003000202` | Pont d'upgrade **PRODUCTION** (contrôle final) : no-op en Preview si les lignes sont conformes, échec propre sinon ; aucun retour à prévoir. |
| `20261003001406` | Recalcul unique du cache du tableau de bord (donnée dérivée, idempotent) : aucune restauration nécessaire, laisser en place. |
| `20261003001407` | **Confidentialité du coût horaire** : ne JAMAIS rouvrir la colonne (ni grant, ni retour arrière), même en rollback code. |
| `20261003001501` | File push durable : retour arrière `scripts/perf/hardening/rollback/rollback_20261003001501.sql` (décision humaine). |
| `20261003001503` | RLS 13 tables : verrous `ACCESS EXCLUSIVE` pris d'un coup avec `lock_timeout` 10 s — un échec est **propre** (transaction annulée, ledger inchangé) et **rejouable** (`--resume-partial`) ; retour arrière `scripts/perf/hardening/rollback/rollback_20261003001503.sql`. |

**Phase 0 (ponts d'upgrade Production).** Sur une Preview dont le ledger contient
`20260921000300`, les migrations marquées `-- elsatia:upgrade-phase0` sont des no-op : le plan les
signale (« phase 0 : no-op en Preview, 300 déjà au ledger ») et aucune procédure spéciale n'est
suivie. Un ledger **sans** `20260921000300` est refusé (`LEDGER-PHASE0-PRODUCTION`) : historique
de type Production, hors périmètre du pack Preview (`scripts/upgrade/preflight.mjs --phase 0`).

**Limite (honnêteté)** : la compatibilité « code servi sur base à jour » est **déduite du SQL**
(signatures conservées, objets additifs, RPC `SECURITY DEFINER`) ; elle n'a pas été exécutée de
bout en bout pour chaque point de départ. D'où la vérification obligatoire après tout retour code
(§2 cas B / C, « preuves »).

### Piège de downgrade applicatif (corruption)

- **IBAN** : tant que le pack est en Preview, **ne pas** poser `BANK_DATA_ENCRYPTION_KEYS`, ni
  `BANK_DATA_ENCRYPTION_WRITE_FORMAT=v2`, ni activer `k2`. Le code récent écrirait alors des valeurs
  `v2:k2:…` que le code V8 ne sait pas lire. Avec `BANK_DATA_ENCRYPTION_KEY` seule, l'écriture
  reste en `v1` (octet pour octet comme V8) : le retour code est sûr.
- **Acceptations légales (901)** : écrites par l'onboarding V9, ignorées par V8 ; ne pas les
  purger au retour.
- **Coût horaire (1407)** : un retour code ne rouvre jamais la colonne ; le code ancien qui la
  lirait directement doit être corrigé, pas la base.

## 2. Les trois cas

### Cas A — la migration DB échoue avant le déploiement du code

Symptôme : `v9-cutover.sh --apply-preview` s'arrête à l'étape 11 (`db push en échec`) ;
`CODE_DEPLOY_ALLOWED=false`.

| | |
|---|---|
| On arrête | tout : **aucun** déploiement du code de HEAD, aucune nouvelle tentative à chaud |
| On ne touche pas | le code servi, les variables Vercel, le ledger (aucun `migration repair`), la Production |
| Redéployer l'ancien code ? | **Non** : il est toujours servi |
| Restaurer la DB ? | **Non**, si l'export du ledger après échec (`<out>/ledger-apres-echec.json`) est un **préfixe exact** du train (`check-ledger-v9.mjs --expect reprise` → `PREVIEW_LEDGER_PREFIX_OK`, `CURRENT_LEDGER` entre l'ancien ledger et `TARGET_LEDGER`) : la CLI applique les fichiers un par un et n'inscrit au ledger que ceux qui ont réussi (comportement reproduit par le banc ; c'est l'export qui fait foi). Un préfixe exact est compatible avec le code servi (objets additifs) |
| Quand restaurer | seulement si l'export du ledger montre une **divergence** (pas un préfixe) ou si DB verify révèle une corruption → décision humaine, procédure de restauration (§4) |
| Reprise | après correction de la cause (accès, verrou — p. ex. `lock_timeout` de `20261003001503` —, délai) **sans modifier le train** : `v9-cutover.sh --resume-partial …` (dry-run, puis `--apply-preview --confirm-ref`). Le pack recalcule `PENDING_MIGRATIONS` et vérifie que le dry-run annonce exactement les migrations restantes |
| Si la cause est le SQL d'une migration | **arrêt** : défaut du train, nouvelle qualification ; ne jamais éditer une migration sur place |
| Preuves | `<out>/db-push.txt`, `<out>/ledger-apres-echec.json`, `<out>/cutover-report.json`, sortie `check-ledger-v9.mjs --expect post`, heure, version de la CLI |

### Cas B — la DB passe (ledger = train complet) mais le code Preview échoue

Symptôme : build Vercel en échec, ou smoke HTTP / `post-cutover-check.mjs` NO-GO après alias.

| | |
|---|---|
| On arrête | l'alias vers le nouveau déploiement ; la recette pilote |
| On ne touche pas | **la base** ; les variables (sauf variable manifestement fautive identifiée) ; la Production |
| Redéployer l'ancien code ? | **Oui, immédiatement** si le nouveau déploiement était aliasé : `vercel alias set <URL du déploiement précédent consignée> <alias Preview>` (le déploiement existe encore ; aucun rebuild) |
| Restaurer la DB ? | **Non** : le code servi avant est compatible avec la base à jour (§1) |
| Ne PAS restaurer | même si le nouveau code a échoué : restaurer ferait perdre les écritures faites depuis le cutover sans rien corriger |
| Après retour | `npm run preview:http-smoke -- --gp <alias>` ; connexion pilote ; `/plateforme` (annuaire) |
| Preuves | logs de build Vercel, URL des deux déploiements, sortie `post-cutover-check.mjs`, `vercel inspect <url>` |

### Cas C — code et DB passent, la recette fonctionnelle révèle un problème

| Gravité | Action |
|---|---|
| Défaut fonctionnel sans perte de données (écran faux, agrégat erroné) | consigner, **rester sur le nouveau code** si contournable, sinon retour code (cas B) ; base inchangée |
| Fuite de données inter-entreprises, ou écriture erronée en cours | **retour code immédiat** (alias) ; base inchangée ; geler la recette ; analyse des lignes touchées |
| Données corrompues avérées (lignes fausses écrites par le nouveau code) | retour code, **puis** décision humaine : correction ciblée prouvée, script de retour versionné (§1) OU restauration (§4). Jamais de restauration sans inventaire de ce qui serait perdu |

Preuves : capture de l'écran, heure, utilisateur de recette (jamais de mot de passe), requêtes en
lecture seule montrant les lignes en cause, `post-cutover-check.mjs`.

## 3. Pourquoi jamais « code de HEAD sur base en retard »

- `src/lib/security/login-rate-limit.ts` appelle `consulter_rate_limit` (1113) et **refuse la
  connexion** sur erreur (fail-closed) : plus personne ne se connecte.
- L'onboarding appelle `creer_entreprise_avec_acceptation` (901) ; les écrans GP appellent les
  agrégats et garde-fous des migrations en attente ; `bank-keys` lit le registre 1112.
- D'où la porte `code-deploy-gate.mjs` : `CODE_DEPLOY_ALLOWED=true` seulement après ledger =
  train complet (`PENDING_MIGRATIONS=0`) + DB verify GO + contrôles V9 GO, rapport de moins de
  24 h **portant le SHA de HEAD**.

## 4. Restauration de la base (dernier recours, décision humaine)

Ne s'applique qu'au cas C « données corrompues » ou à une divergence de ledger constatée.

1. Retour code d'abord (alias). Couper la recette.
2. Prouver la sauvegarde : restauration **locale** (procédure dans
   `ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md` §4), export du ledger restauré = ledger d'avant
   cutover (`CURRENT_LEDGER` consigné dans `cutover-report.json`, clé `train`).
3. Choisir la méthode (`DECISION_REQUIRED:V9-PREVIEW-RESTORE`) :
   - sauvegarde du tableau de bord Supabase si le plan en fournit une (identifiant consigné) ;
   - sinon rejeu des dumps dans la Preview : opération destructive, jamais scriptée par le pack,
     exécutée par une personne avec la sauvegarde vérifiée sous les yeux.
4. Après restauration : `v9-cutover.sh` (dry-run) doit redonner `PREVIEW_LEDGER_PREFIX_OK` et le
   même `CURRENT_LEDGER` / `PENDING_MIGRATIONS` qu'avant le cutover (`--attendu-courant <n>`).
5. Ce qui est perdu : toutes les écritures entre la sauvegarde et la restauration (comptes Auth
   créés, acceptations légales, données de recette). Le consigner.

## 5. Ce que le pack refuse toujours

`--include-all`, `migration repair`, une cible autre que `pgvvpqyjziyapbbkydmc`, un `--out` dans le
dépôt, une application sans sauvegarde conforme, une application sans `--confirm-ref`, un
ledger qui n'est pas un préfixe exact du train, un ledger sans le plancher 813 ORIGINALE, un
ledger sans `20260921000300` (phase 0 de type Production).
