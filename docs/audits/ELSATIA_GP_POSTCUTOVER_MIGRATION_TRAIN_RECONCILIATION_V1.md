# ELSATIA-GP-POSTCUTOVER-MIGRATION-TRAIN-RECONCILIATION-V1

Réconciliation du train de migrations post-cutover. Aucune de ces migrations n'est
appliquée en Production : la renumérotation décrite ici ne réécrit donc aucun
historique appliqué.

## Base

| Élément | Valeur |
|---|---|
| Base post-cutover | `integration/gp-postcutover-pilot-hotfix-v1` — `7ba62c5` |
| Ledger de base | 263 migrations (dernier numéro de séquence : `00265`) |

L'écart entre le nombre de fichiers (263) et le dernier numéro de séquence (265)
est historique et antérieur au cutover ; il n'est pas corrigé ici.

## Lots réconciliés

| Lot | Branche source | SHA | Migration d'origine |
|---|---|---|---|
| Propriétaire global | `feat/gp-global-owner-all-apps-access-v1` | `90b636f` | `20260906000266_platform_global_owner_all_apps_v1.sql` |
| Support reply e-mail | `feat/gp-support-reply-email-p1-closure-v1` | `4010179` | `20260905000266_support_reply_notification_recipient_v1.sql` |

## Collision constatée

Les deux lots ont été écrits en parallèle depuis le même ledger 263 et revendiquent
tous les deux le **numéro de séquence 266**, avec des préfixes de date différents
(`20260906` et `20260905`).

Ce que ce n'est **pas** : un doublon interdit. `scripts/verify-migrations.mjs` ne
contrôle que l'unicité des 14 chiffres, et le dépôt porte déjà six numéros de séquence
dupliqués hérités de lots parallèles (`000200`, `000236` ×3, `000237`, `000238`,
`000239`, `000240`). La clé réelle est le préfixe complet, pas le compteur.

Ce que c'est : une **insertion rétrograde**. Le lot Global Owner est validé et part en
premier ; le lot support est différé. Appliquer `20260906000266`, puis ajouter plus tard
`20260905000266` revient à insérer une migration antérieure à la dernière appliquée.
Reproduit sur stack locale (ledger 263 → Global Owner → tentative d'ajout du lot support
à sa numérotation d'origine) :

```
LegacyMigrationMissingRemoteError
Found local migration files to be inserted before the last migration on remote database.
suggestion: Rerun the command with --include-all flag …
```

Le lot support serait donc soit bloqué, soit appliqué sous `--include-all`, c'est-à-dire
enregistré au ledger dans un ordre différent de son ordre lexical. C'est cette ambiguïté
que la réconciliation supprime.

## Dépendances

Aucune dépendance croisée. Les deux migrations ne se recouvrent sur aucun objet SQL :

- Global Owner : colonne `plateforme_admins.proprietaire`, `est_plateforme_proprietaire()`,
  `plateforme_est_superuser()`, `plateforme_identite_auth_saine()`,
  `plateforme_proprietaire_revendiquer()`, `plateforme_lister_admins()`,
  `plateforme_retirer_admin()`, `plateforme_modifier_role_admin()`,
  `tools_resoudre_entitlements()`.
- Support reply : `plateforme_support_destinataire_reponse()` seule.

Les deux ne consomment que des objets présents au ledger 263
(`plateforme_exiger_role`, `plateforme_exiger_session_aal2`,
`plateforme_verrouiller_mutations_admin`, `est_acces_support_actif`, `support_messages`).
Elles sont donc **commutatives** ; l'ordre est un choix d'exploitation, pas une
contrainte SQL.

## Ordre canonique retenu

| # | Migration | Lot |
|---|---|---|
| 266 | `20260906000266_platform_global_owner_all_apps_v1.sql` | Propriétaire global (inchangée) |
| 267 | `20260906000267_support_reply_notification_recipient_v1.sql` | Support reply (renumérotée) |

**Une seule migration est renumérotée**, et c'est celle du lot différé :
`20260905000266` → `20260906000267`. Justification :

- le lot Global Owner est validé et part en premier — le renuméroter modifierait un
  contenu déjà revu ;
- le lot support n'est appliqué nulle part, donc le renommer ne coûte rien ;
- l'ordre lexical redevient l'ordre d'application réel : plus d'insertion rétrograde,
  plus de `--include-all`, et une séquence de nouveau monotone sur la queue du train.

Le corps SQL du lot support est repris **octet pour octet** ; seul le nom du fichier
change.

## Périmètre du lot support

`feat/gp-support-reply-email-p1-closure-v1` porte deux commits absents de la base :
`3285e23` (« close precommercial operations p1 gaps ») puis `4010179` (support reply).
Seul `4010179` est repris ici, pour ne pas élargir le train à un lot non demandé.
Conséquence documentaire : `docs/operations/MATRICE_EMAILS_V1.md`, créé par `3285e23`,
n'existe pas dans ce train ; la section « Répondre dans l'application » de
`docs/commercial/SUPPORT_PREMIERS_CLIENTS.md` est conservée sans son renvoi vers ce
fichier, et les renvois vers les autres documents de `3285e23` ne sont pas importés.

## Ledger

| Scénario | Ledger |
|---|---|
| Base `7ba62c5` | 263 |
| Global Owner seul | 264 |
| Support reply seul | 264 |
| Train complet | **265** |

## Vérifications exécutées

Stack Supabase locale isolée (projet `elsatia-postcutover-train-dbtest`, ports 573xx)
pour ne pas toucher la stack `btp-platform` en cours d'usage. Aucune base liée, aucun
déploiement, aucun appel Stripe ou Brevo réel.

| Scénario | Résultat |
|---|---|
| Fresh depuis zéro | 265 migrations appliquées, ledger 265, dernière `20260906000267` |
| Restore 263 → 266 | ledger 264, Global Owner seul, pgTAP 40/40 |
| Restore 264 → 267 | ledger 265, schéma `public` **identique** au Fresh (`pg_dump -s`, diff vide) |
| Support seul depuis 263 | ledger 264, pgTAP 15/15 — aucune dépendance au Global Owner |
| Rollback drill 263 → 265 → 263 | schéma `public` identique au 263 initial (diff vide) |
| pgTAP complet | 56 fichiers, 1224 assertions, `Result: PASS` |
| `verify:migrations` | 265 migrations valides, noms et horodatages uniques |

Le rollback drill est un **retour par reconstruction** (reset au ledger 263), pas un
rollback automatique : ces migrations n'ont pas de script `down`. Il prouve que l'état
263 est reproductible à l'identique, donc qu'un retour arrière par restauration est sûr —
il ne fabrique pas une procédure de rollback Production.

## Hors périmètre

- Aucune migration liée, aucun `db push`, aucun déploiement Vercel.
- `docs/operations/MATRICE_EMAILS_V1.md` reste à réintégrer avec le lot
  `feat/gp-precommercial-ops-p1-closure-v1`, avec la section « Réponse du support »
  que le lot support y avait ajoutée.
