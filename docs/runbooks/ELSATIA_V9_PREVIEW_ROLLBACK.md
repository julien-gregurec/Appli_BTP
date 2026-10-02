# ELSATIA V9 — Retour arrière du cutover Preview 372 → 389

| | |
|---|---|
| Cible | Preview `pgvvpqyjziyapbbkydmc` + projet Vercel `elsatia-preview` (GP). **Production `exhvuzegsefmoguxoiak` : hors périmètre, jamais touchée.** |
| Code V8 servi aujourd'hui | `de50245a259e06623fbab070f9dc296573bae0ce` (V8 + 813 originale) |
| Code V9 à déployer | `6392131aa02cecc9991358915963068de8292d24` |
| Outils | `scripts/preview/v9/` (`v9-cutover.sh`, `code-deploy-gate.mjs`, `post-cutover-check.mjs`) |
| Sauvegarde | `ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md` |

## 0. Règle générale

1. **Pas de script « down » dans le dépôt.** Aucune migration V9 n'est annulée par du SQL écrit à la volée.
2. **Base AVANT code, et code arrière AVANT toute idée de base arrière.** Le code V8 est compatible
   avec la base 389 ; le code V9 ne l'est pas avec la base 372 (§3).
3. **Restaurer la base est le dernier recours** : seulement si des données sont corrompues. Le
   classement ci-dessous montre qu'**aucune** des 17 migrations n'exige de restauration pour
   revenir au code V8.
4. Toute décision non couverte ici = `DECISION_REQUIRED` : on s'arrête, on garde les preuves, on
   choisit l'option la plus conservatrice (ne rien appliquer, ne rien restaurer, code V8 servi).

## 1. Classement des 17 migrations (déterminé depuis le SQL)

Produit par `npm run preview:v9:classify` (instructions de premier niveau, corps de fonctions
exclus ; inconnu = pire cas). Vérifié contre ce tableau par `npm run preview:v9:preflight`.

| Rang | Version | Classe | Effet | Sous code V8 | Retour |
|---|---|---|---|---|---|
| 373 | `20261002000901` | FORWARD_ONLY | schéma `platform`, 2 tables (versions légales + acceptations append-only), 3 lignes de référence, RPC | inutilisé, inoffensif | **laisser en place** : preuves d'acceptation, jamais supprimées |
| 374 | `20261002001001` | REVERSIBLE | 5 policies réécrites sans « entreprise sans membres » | compatible (création d'entreprise V8 par RPC `SECURITY DEFINER`) | **NE JAMAIS revenir** : correctif de sécurité (lecture fail-open) |
| 375 | `20261002001002` | REVERSIBLE | `synchroniser_abonnement_stripe_service` (même signature) | compatible | laisser en place |
| 376 | `20261002001003` | REVERSIBLE | `appliquer_evenement_facture_abonnement_service` (même signature) | compatible | laisser en place |
| 377 | `20261002001101` | REVERSIBLE | fonctions finance / exports | compatible | laisser en place |
| 378 | `20261002001102` | REVERSIBLE | `planning_semaine`, `pointages_equipe_periode` | compatible | laisser en place |
| 379 | `20261002001103` | REVERSIBLE | `chantier_donnees_chiffrees` | compatible | laisser en place |
| 380 | `20261002001104` | REVERSIBLE | `journal_ia_consommation` | compatible | laisser en place |
| 381 | `20261002001105` | REVERSIBLE | 3 fonctions pointage + 2 index | compatible | laisser en place |
| 382 | `20261002001106` | REVERSIBLE | `modifier_facture_brouillon` (même signature) | compatible | laisser en place |
| 383 | `20261002001107` | REVERSIBLE | fonctions rentabilité | compatible | laisser en place |
| 384 | `20261002001108` | REVERSIBLE | agrégats fiches GP + index | compatible | laisser en place |
| 385 | `20261002001109` | REVERSIBLE | agrégats pilotage GP | compatible | laisser en place |
| 386 | `20261002001110` | REVERSIBLE | agrégats plateforme | compatible | laisser en place |
| 387 | `20261002001111` | REVERSIBLE | sélecteurs GP + index + statistiques étendues | compatible | laisser en place |
| 388 | `20261002001112` | FORWARD_ONLY | registre des clés bancaires (k1 active), colonne `iban_hash_cle`, garde d'écriture | compatible : le code V8 écrit en v1 (k1), accepté par la garde | **laisser en place** |
| 389 | `20261002001113` | REVERSIBLE | `consulter_rate_limit` (service_role seul) | inutilisé | laisser en place |

**Bilan : 15 REVERSIBLE, 2 FORWARD_ONLY, 0 RESTORE_REQUIRED.** « REVERSIBLE » signifie : ni
donnée ni structure de table touchée ; pas qu'un retour SQL est fourni ou souhaitable.

**Limite (honnêteté)** : la compatibilité « code V8 sur base 389 » est **déduite du SQL**
(signatures conservées, objets additifs, RPC `SECURITY DEFINER`) ; elle n'a **pas** été exécutée
de bout en bout (code V8 servi sur une base V9). D'où la vérification obligatoire après tout
retour code (§2 cas B / C, « preuves »).

### Piège de downgrade applicatif (corruption)

- **IBAN** : tant que le pack est en Preview, **ne pas** poser `BANK_DATA_ENCRYPTION_KEYS`, ni
  `BANK_DATA_ENCRYPTION_WRITE_FORMAT=v2`, ni activer `k2`. Le code V9 écrirait alors des valeurs
  `v2:k2:…` que le code V8 ne sait pas lire. Avec `BANK_DATA_ENCRYPTION_KEY` seule, V9 écrit en
  `v1` (octet pour octet comme V8) : le retour code est sûr.
- **Acceptations légales (901)** : écrites par l'onboarding V9, ignorées par V8 ; ne pas les
  purger au retour.
- **Rien d'autre** : aucune migration V9 ne réécrit de données existantes.

## 2. Les trois cas

### Cas A — la migration DB échoue avant le déploiement du code

Symptôme : `v9-cutover.sh --apply-preview` s'arrête à l'étape 11 (`db push en échec`) ;
`CODE_DEPLOY_ALLOWED=false`.

| | |
|---|---|
| On arrête | tout : **aucun** déploiement de code V9, aucune nouvelle tentative à chaud |
| On ne touche pas | le code servi (V8 `de50245a`), les variables Vercel, le ledger (aucun `migration repair`), la Production |
| Redéployer V8 ? | **Non** : il est toujours servi |
| Restaurer la DB ? | **Non**, si l'export du ledger après échec (`<out>/ledger-apres-echec.json`) montre un préfixe V9 strict (`PREVIEW_LEDGER_PARTIAL_V9`) : la CLI applique les fichiers un par un et n'inscrit au ledger que ceux qui ont réussi (comportement reproduit par le banc ; c'est l'export qui fait foi, pas cette phrase). Un préfixe V9 est compatible avec le code V8 (objets additifs) |
| Quand restaurer | seulement si l'export du ledger montre une **divergence** (pas un préfixe) ou si DB verify révèle une corruption → décision humaine, procédure de restauration (§4) |
| Reprise | après correction de la cause (accès, verrou, délai) **sans modifier le train** : `v9-cutover.sh --resume-partial …` (dry-run, puis `--apply-preview --confirm-ref`). Le pack n'accepte qu'un préfixe V9 strict et vérifie que le dry-run annonce exactement les migrations restantes |
| Si la cause est le SQL d'une migration | **arrêt** : défaut du train, nouvelle qualification ; ne jamais éditer une migration sur place |
| Preuves | `<out>/db-push.txt`, `<out>/ledger-apres-echec.json`, `<out>/cutover-report.json`, sortie `check-ledger-v9.mjs --expect post`, heure, version de la CLI |

### Cas B — la DB passe (389) mais le code Preview V9 échoue

Symptôme : build Vercel en échec, ou smoke HTTP / `post-cutover-check.mjs` NO-GO après alias.

| | |
|---|---|
| On arrête | l'alias vers V9 ; la recette pilote |
| On ne touche pas | **la base (389)** ; les variables (sauf variable manifestement fautive identifiée) ; la Production |
| Redéployer V8 ? | **Oui, immédiatement** si le déploiement V9 était aliasé : `vercel alias set <URL du déploiement V8 consignée> <alias Preview>` (le déploiement V8 existe encore ; aucun rebuild) |
| Restaurer la DB ? | **Non** : V8 est compatible avec la base 389 (§1) |
| Ne PAS restaurer | même si le code V9 a échoué : restaurer ferait perdre les écritures faites depuis le cutover sans rien corriger |
| Après retour V8 | `npm run preview:http-smoke -- --gp <alias>` ; connexion pilote ; `/plateforme` (annuaire) |
| Preuves | logs de build Vercel, URL des deux déploiements, sortie `post-cutover-check.mjs`, `vercel inspect <url>` |

### Cas C — code et DB passent, la recette fonctionnelle révèle un problème

| Gravité | Action |
|---|---|
| Défaut fonctionnel sans perte de données (écran faux, agrégat erroné) | consigner, **rester en V9** si contournable, sinon retour code V8 (cas B) ; base inchangée |
| Fuite de données inter-entreprises, ou écriture erronée en cours | **retour code V8 immédiat** (alias) ; base inchangée ; geler la recette ; analyse des lignes touchées |
| Données corrompues avérées (lignes fausses écrites par V9) | retour code V8, **puis** décision humaine : correction ciblée prouvée OU restauration (§4). Jamais de restauration sans inventaire de ce qui serait perdu |

Preuves : capture de l'écran, heure, utilisateur de recette (jamais de mot de passe), requêtes en
lecture seule montrant les lignes en cause, `post-cutover-check.mjs`.

## 3. Pourquoi jamais « code V9 sur base 372 »

- `src/lib/security/login-rate-limit.ts` appelle `consulter_rate_limit` (1113) et **refuse la
  connexion** sur erreur (fail-closed) : plus personne ne se connecte.
- L'onboarding V9 appelle `creer_entreprise_avec_acceptation` (901) ; les écrans GP appellent les
  agrégats 1101-1111 ; `bank-keys` lit le registre 1112.
- D'où la porte `code-deploy-gate.mjs` : `CODE_DEPLOY_ALLOWED=true` seulement après ledger 389 +
  DB verify GO + contrôles V9 GO (rapport de moins de 24 h).

## 4. Restauration de la base (dernier recours, décision humaine)

Ne s'applique qu'au cas C « données corrompues » ou à une divergence de ledger constatée.

1. Retour code V8 d'abord (alias). Couper la recette.
2. Prouver la sauvegarde : restauration **locale** (procédure dans
   `ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md` §4), export du ledger restauré = socle 372.
3. Choisir la méthode (`DECISION_REQUIRED:V9-PREVIEW-RESTORE`) :
   - sauvegarde du tableau de bord Supabase si le plan en fournit une (identifiant consigné) ;
   - sinon rejeu des dumps dans la Preview : opération destructive, jamais scriptée par le pack,
     exécutée par une personne avec la sauvegarde vérifiée sous les yeux.
4. Après restauration : `v9-cutover.sh` (dry-run) doit redonner `PREVIEW_LEDGER_PREFIX_OK` /
   `PENDING_MIGRATIONS=17`.
5. Ce qui est perdu : toutes les écritures entre la sauvegarde et la restauration (comptes Auth
   créés, acceptations légales, données de recette). Le consigner.

## 5. Ce que le pack refuse toujours

`--include-all`, `migration repair`, une cible autre que `pgvvpqyjziyapbbkydmc`, un `--out` dans le
dépôt, une application sans sauvegarde conforme, une application sans `--confirm-ref`, un
ledger qui n'est pas un préfixe exact du train.
