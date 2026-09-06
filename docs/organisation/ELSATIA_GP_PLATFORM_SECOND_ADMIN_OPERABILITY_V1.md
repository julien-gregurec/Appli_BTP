# ELSATIA-GP-PLATFORM-SECOND-ADMIN-OPERABILITY-P1-V1

Base technique : `f34601a`
Branche : `feat/gp-platform-second-admin-operability-p1-v1`
Ledger migrations : **263** (inchangé — aucune migration ajoutée, modifiée ni supprimée)
Production : aucune migration, aucun déploiement, aucun accès distant.

Ce lot ferme le **bus factor 1 côté plateforme** : un second administrateur plateforme
peut désormais être déclaré, rattaché, activé, révoqué et détaché **sans SQL**.

---

## 1. Audit des RPC exactes

Les cinq RPC du cycle d'identité existent depuis la migration
`20260826000237_platform_aal2_role_integrity_v1.sql` et n'ont pas été touchées.

| RPC | Signature | Effet |
| --- | --- | --- |
| `plateforme_ajouter_admin` | `(p_email text, p_nom text, p_role text)` | crée/met à jour une identité `en_attente` (ou `revoquee`), sans UID ni droit |
| `plateforme_rattacher_admin` | `(p_email text, p_utilisateur_id uuid)` | `en_attente`/`revoquee` → `rattachee_non_confirmee`, toujours sans droit |
| `plateforme_activer_admin` | `(p_email text)` | `rattachee_non_confirmee` → `active`, droits du rôle accordés |
| `plateforme_retirer_admin` | `(p_email text)` | → `revoquee`, ferme les sessions support ouvertes de la cible |
| `plateforme_detacher_admin_revoque` | `(p_email text)` | libère l'UID d'une identité révoquée |

Les quatre états sont contraints par `plateforme_admins_statut_coherent_check` et les
transitions par le trigger `plateforme_verifier_transition_admin` (email immuable, UID
d'une identité active figé jusqu'à révocation, retours d'état interdits).

**Constat d'entrée confirmé** : `plateforme_ajouter_admin` et `plateforme_retirer_admin`
étaient câblées dans `src/app/actions/plateforme.ts` ; `plateforme_rattacher_admin`,
`plateforme_activer_admin` et `plateforme_detacher_admin_revoque` ne l'étaient pas.
Déclarer une identité était donc possible depuis l'écran, mais elle restait inerte :
les deux étapes qui la rendent opérationnelle n'avaient d'autre chemin que du SQL manuel.

## 2. Audit permissions / AAL2

Chaque RPC du cycle applique, dans cet ordre :

1. `plateforme_exiger_role('total')` — refus avant de prendre le verrou ;
2. `plateforme_exiger_session_aal2()` — lit **uniquement** le claim `aal` de `auth.jwt()` ;
3. `plateforme_verrouiller_mutations_admin()` — `pg_advisory_xact_lock(21453, 1001)` ;
4. `plateforme_exiger_role('total')` **à nouveau** — couvre une révocation concurrente
   de l'appelant pendant l'attente du verrou.

`plateforme_role_courant()` résout le rôle par `auth.uid()` sur une ligne `actif` et
`statut_identite='active'` : **l'email n'est jamais une preuve d'autorisation**.

Gardes supplémentaires, toutes déjà présentes et vérifiées :

- auto-rattachement et auto-activation refusés (`p_utilisateur_id = auth.uid()`) ;
- compte Auth cible obligatoire, même email, `email_confirmed_at` non nul ;
- facteur MFA `verified` obligatoire **sur le compte cible** à l'activation — distinct
  de l'AAL2 de l'appelant, aucun des deux ne remplace l'autre ;
- révocation du dernier `total` actif et auto-révocation refusées ;
- détachement refusé tant qu'une session support de la cible est ouverte.

**ACL** : les cinq RPC sont `revoke ... from public, anon` puis `grant execute ... to
authenticated`, et révoquées à `service_role` par `20260902000255_acl_reconciliation_v1`.
L'application les atteint donc avec la session de l'opérateur, jamais avec la clé de
service. `plateforme_exiger_role` est révoquée à `authenticated` : elle n'est appelable
que depuis l'intérieur des fonctions `SECURITY DEFINER`.

## 3. Écran opérateur

`/plateforme` → section « Équipe plateforme ».

- La liste utilise `plateforme_lister_admins()` (permission `gerer_equipe`, donc `total`
  seul), qui expose déjà `statut_identite` depuis `20260901000251`. Chaque identité porte
  désormais un badge d'état : *Déclarée, sans compte* · *Rattachée, à activer* · *Active* ·
  *Révoquée*.
- Les actions proposées suivent strictement l'état : rattacher (`en_attente`, `revoquee`),
  activer (`rattachee_non_confirmee`), retirer (tout sauf `revoquee`), détacher (`revoquee`).
- Les commandes du cycle ne sont rendues que si `plateforme_ecriture_autorisee('total')`
  renvoie vrai — c'est-à-dire rôle `total` **et** `aal2`. Un `false` explicite masque les
  commandes et affiche la condition manquante. Si le prédicat n'est pas interrogeable, les
  commandes restent visibles : rendre la plateforme inadministrable sur une erreur de
  lecture rouvrirait précisément le bus factor que ce lot ferme, et chaque RPC oppose de
  toute façon son propre refus. Ce voyant est un reflet, jamais une garde.
- Le mode démonstration (`DISABLE_EMAIL_LOGIN`) ferme la section avec son propre message
  et refuse explicitement les trois actions avant tout appel.

### Secrets

L'écran n'affiche **aucun** secret : ni mot de passe, ni jeton, ni identifiant de compte
existant. L'UID de la cible est saisi une fois, jamais rendu, jamais renvoyé dans l'URL
de retour (test dédié). Le texte d'aide rappelle de ne recopier aucun mot de passe.

### Ce qui reste hors de l'écran

La création du compte Supabase Auth (Authentication → Add user), la confirmation de
l'adresse et l'enrôlement du facteur MFA restent des gestes Supabase : ils ne sont pas
exposables sans clé de service, et l'UID produit est reporté manuellement dans le champ
de rattachement. **Aucune de ces étapes n'est du SQL.**

## 4. Journalisation

Aucune journalisation n'est ajoutée, et aucune ne peut l'être depuis l'application :
`plateforme_journaliser` est `revoke ... from authenticated`. La trace du cycle est
écrite par les RPC elles-mêmes dans `plateforme_admins` :

- `activation_at` / `activation_par` ;
- `revocation_at` / `revocation_par` / `revocation_origine` ;
- `role_updated_at` / `role_updated_by`.

Ces colonnes portent l'`auth.uid()` réel de l'appelant, résolu côté base. L'écran ne peut
ni les écrire, ni les contourner, ni les falsifier.

## 5. Confirmations

Les quatre actions destructrices ou élevantes passent par `ConfirmSubmitButton`. Chaque
message énonce l'effet exact : ce que l'action accorde (activation : droits immédiats du
rôle sur toutes les entreprises), ce qu'elle n'accorde pas (rattachement : aucun droit),
ce qu'elle ferme (révocation : sessions support fermées immédiatement) et la garde que la
base opposera (dernier `total` actif, session support encore ouverte).

## 6. Tests

### Exécutés

`src/app/actions/plateforme-second-admin.test.ts` — 24 tests, couche de câblage :

| Cas | Attendu | Résultat |
| --- | --- | --- |
| Rattachement nominal | RPC `plateforme_rattacher_admin` avec email normalisé + UID | ✅ |
| UID rendu | absent de l'URL de retour | ✅ |
| UID non-UUID | refus local, aucun appel base | ✅ |
| Email sans arobase | refus local, aucun appel base | ✅ |
| Activation nominale | RPC `plateforme_activer_admin` | ✅ |
| Détachement nominal | RPC `plateforme_detacher_admin_revoque` | ✅ |
| Email manquant | refus local, aucun appel base | ✅ |
| Compte non administrateur (×3 actions) | `/dashboard`, aucun appel base | ✅ |
| Mode démonstration (×3 actions) | refus explicite, aucun appel base | ✅ |
| AAL1 refusée (×2 actions) | message base remonté tel quel, aucun succès | ✅ |
| Rôle non `total` (×2 actions) | message base remonté tel quel | ✅ |
| Utilisateur absent | `Compte Auth absent…` remonté | ✅ |
| Doublon / état incompatible | message base remonté | ✅ |
| MFA cible absent | message base remonté | ✅ |
| Auto-rattachement / auto-activation | message base remonté | ✅ |
| Session support encore ouverte | message base remonté | ✅ |

Suite complète GP : **891 tests / 95 fichiers, 0 échec**.
`typecheck`, `lint` (0 erreur) et `build` passent. `verify:migrations` : **263 migrations**.

### Ajoutés, non exécutés ici

`supabase/tests/platform_aal2_role_integrity_v1.test.sql` — bloc « E bis » : utilisateur
absent, doublon de rattachement, doublon d'activation, doublon de déclaration, et
cloisonnement (le gérant d'une entreprise cliente possède un compte Auth confirmé mais
n'est ni rattachable ni activable côté plateforme, et aucune identité n'est créée pour lui).

**Ces assertions pgTAP n'ont pas été exécutées** : ni la CLI `supabase` ni un démon Docker
ne sont disponibles dans cet environnement. Elles doivent être passées par
`npm run test:db` avant toute promotion.

La matrice AAL1 refusée / AAL2 autorisée / rôles `support`, `facturation`, `lecture` /
cloisonnement multi-tenant était déjà couverte par les mêmes fichiers pgTAP
(`platform_aal2_role_integrity_v1`, `platform_support_uid_security_v1`) et n'a pas été
dupliquée côté application : le câblage n'ajoute aucune décision d'autorisation.

## 7. Périmètre non traité

- Aucune migration, aucun changement d'ACL, aucun changement de RPC.
- Aucune création de compte Auth, aucun envoi d'email, aucun enrôlement MFA depuis l'écran.
- Le journal `plateforme_journal_actions` n'est pas alimenté par le cycle d'identité :
  l'ouvrir en écriture exigerait une migration, explicitement hors périmètre.
- Le premier administrateur / la récupération totale restent une intervention contrôlée
  avec le rôle de maintenance Supabase (voir le runbook, section « Premier administrateur »).

## 8. Conclusion

Le bus factor 1 côté plateforme est fermé : un second administrateur plateforme se gère
entièrement depuis `/plateforme`, sous rôle `total` et session AAL2, sans SQL.
