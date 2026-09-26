# ELSATIA-GLOBAL-OWNER-ALL-APPS-ACCESS-V1

Audit et lot d'implémentation du **propriétaire global ELSATIA**.

- **Base auditée** : `7ba62c5315213bf21b9ed8553408fc678e943327`
  (`integration/gp-postcutover-pilot-hotfix-v1`), descendant direct de la cible de
  cutover `996be15c136f09d9977375e700462b503a1720c3` / ledger 263.
- **Branche de ce lot** : `feat/gp-global-owner-all-apps-access-v1`.
- **Production** : aucune écriture, aucune migration, aucun déploiement.

---

## OWNER ACCOUNT

`julien@elsatia.fr`

## ROLE

Propriétaire global ELSATIA — rôle plateforme `total`, marqué
`plateforme_admins.proprietaire = true`. Unique par contrainte d'unicité partielle.

## CURRENT APPS

Gestion Pro · Colors · Tools (les trois lignes actives de `applications_elsatia`).

## FUTURE APPS

Accès **automatique**. Aucune habilitation, aucun entitlement, aucune exception
applicative à créer par application.

## RÉSERVES

Automatique dès l'inscription de `reserves` au catalogue actif. La migration
n'inscrit **pas** l'application : l'inscription au catalogue reste une décision
produit/commerciale. La preuve est faite par test (voir §7).

## SECURITY

AAL2 conservée sur toutes les opérations plateforme sensibles ; isolation
multi-tenant intégralement préservée.

---

## 1. État initial audité

### 1.1 Socle multi-app (migration 00234)

Le contrat d'accès applicatif était **déjà générique** et n'a pas eu à être réécrit :

| Fonction | Comportement admin plateforme |
| --- | --- |
| `a_acces_application(entreprise, code)` | `true` pour toute application **active** du catalogue, sans habilitation |
| `applications_autorisees(entreprise)` | renvoie tout le catalogue actif, rôle `administrateur_plateforme_global` |
| `contexte_application_courant()` | repli « Administration ELSATIA » pour un admin sans appartenance |

Le test `elsatia_multi_app_convergence_v1.test.sql` prouvait déjà (assertion 10)
qu'une application ajoutée **après coup** au catalogue est immédiatement visible
par un admin plateforme. La demande « applications futures automatiques » ne
nécessitait donc aucune invention d'architecture, seulement une identité active.

`packages/application-access` est lui aussi générique :
`CodeApplicationElsatia = string`, aucune énumération fermée d'applications,
aucun email codé en dur. Aucun `if (email === "julien@elsatia.fr")` n'existe dans
un composant React du dépôt (vérifié par recherche sur `src`, `apps`, `packages`).

### 1.2 Pourquoi `julien@elsatia.fr` était inactif

Deux migrations, dans cet ordre :

- **`20260826000235_platform_admin_uid_canonical_v1`** : introduit
  `utilisateur_id` + `actif` et pose la règle canonique
  `auth.uid() → plateforme_admins.utilisateur_id → actif`. Toute ligne sans compte
  Auth correspondant passe `actif = false`.
- **`20260826000236_platform_support_uid_security_v1`** : introduit
  `statut_identite` et force **explicitement**
  `actif = false` pour `julien@elsatia.fr`, avec ce commentaire :
  « Le compte professionnel officiel reste volontairement inactif jusqu'à son lot
  d'activation explicite. »

**Intention historique** : ne jamais déduire un droit d'administration d'une
correspondance d'email, et ne pas activer une identité professionnelle avant
vérification de sa connexion, de sa récupération et de son MFA.
**Conséquence** : `julien@elsatia.fr` est `actif = false`,
`statut_identite = 'en_attente'`, `utilisateur_id = NULL`.

Ce lot **est** le lot d'activation annoncé. Les migrations 00234 / 00235 / 00236 /
00237 ne sont pas réécrites.

### 1.3 Verrou d'activation constaté (P0 pour tout environnement neuf)

`plateforme_activer_admin()` exige : appelant `total` **actif**, session AAL2,
cible ≠ appelant, email cible confirmé, facteur MFA vérifié sur la cible.

Sur une base **neuve**, aucune ligne `plateforme_admins` n'a d'`utilisateur_id`
(l'`auth.users` correspondant n'existe pas encore au moment de 00235) :
**aucun administrateur `total` actif n'existe**, donc aucun appelant ne peut
exécuter `plateforme_rattacher_admin` ni `plateforme_activer_admin`. Le runbook
le reconnaît (« Premier administrateur ou récupération » → intervention SQL de
maintenance). Vérifié sur la base locale au ledger 263 :

```
           email           | role  | actif | statut_identite | a_uid
---------------------------+-------+-------+-----------------+-------
 julien.gregurec@gmail.com | total | f     | en_attente      | f
 julien@elsatia.fr         | total | f     | en_attente      | f
```

Sur la **Production** (restauration au ledger 210 puis migration), `auth.users`
contient déjà `julien.gregurec@gmail.com` : 00235 le rattache, 00236 le passe
`active`. Le cycle à deux comptes y reste donc praticable.

---

## 2. Architecture retenue

Trois manques réels, trois réponses — le reste du socle est réutilisé tel quel.

### 2.1 Registre du propriétaire (déclaratif)

`plateforme_admins.proprietaire boolean not null default false`
+ index unique partiel (un seul propriétaire)
+ contrainte `proprietaire ⇒ role = 'total'`.

`julien@elsatia.fr` est marqué propriétaire par la migration. **Cette désignation
n'accorde aucun droit** : l'identité reste soumise au même cycle
`utilisateur_id / actif / statut_identite` que tout autre administrateur.

### 2.2 Prédicats canoniques

| Fonction | Vrai pour |
| --- | --- |
| `est_plateforme_proprietaire()` | l'identité `proprietaire`, `actif`, `statut_identite='active'`, `role='total'`, compte Auth sain |
| `plateforme_est_superuser()` | toute identité `total` active et saine (propriétaire inclus) |
| `plateforme_identite_auth_saine(uid)` | email confirmé, compte ni banni ni supprimé |

Tous résolus par `auth.uid()`. **L'email n'entre jamais dans un prédicat
d'autorisation** — c'est exactement la faille que 00235/00236 avaient fermée.
L'état Auth est revérifié à chaque appel : un JWT encore valide ne survit pas à
une suspension de compte.

`plateforme_est_superuser()` est le **contrat générique demandé au §7** : ouvrir
une application sans créer manuellement un rôle applicatif
(`colors_admin_organisation`, `reserves_*`, …) dans chaque nouvelle application.
Il est volontairement plus étroit que `est_plateforme_admin()` : `support`,
`facturation` et `lecture` ne deviennent pas superusers applicatifs.

### 2.3 Revendication du compte propriétaire

`plateforme_proprietaire_revendiquer()` — chemin **unique, borné, audité**, ouvert
à la seule identité propriétaire. Conditions cumulatives, toutes serveur :

1. session **AAL2** (claim `aal` du JWT vérifié par Supabase, jamais un paramètre client) ;
2. **facteur MFA vérifié** sur le compte appelant ;
3. email Auth **confirmé**, compte ni banni ni supprimé ;
4. l'email du compte appelant est **exactement** celui de la ligne `proprietaire` ;
5. la ligne propriétaire n'est **pas déjà rattachée à un autre compte** ;
6. la ligne n'est **pas révoquée** (une révocation ne se contourne pas soi-même).

Transition en deux temps (`en_attente → rattachee_non_confirmee → active`), sous
le verrou advisory de 00237, journalisée dans `plateforme_journal_actions`
(`proprietaire_plateforme_revendique`). Idempotente.

Le cycle à deux personnes reste **obligatoire pour tout administrateur délégué** :
`plateforme_activer_admin()` refuse toujours l'auto-activation.

Cette RPC résout aussi le verrou §1.3 : un environnement neuf redevient
administrable par le propriétaire sans intervention SQL de maintenance.

### 2.4 Protection de l'identité propriétaire

`plateforme_retirer_admin()` et `plateforme_modifier_role_admin()` sont redéfinies
à l'identique avec **une garde supplémentaire chacune** : le propriétaire ne peut
être ni révoqué ni dégradé depuis la plateforme. Sans cela, un `total` **délégué**
pouvait évincer le propriétaire dès qu'un second `total` actif existait (la garde
« dernier total actif » de 00237 ne s'y opposait plus).

### 2.5 Tools

`tools_resoudre_entitlements()` gagne une branche en tête : si
`plateforme_est_superuser()`, retour `tier = 'pro'`, source `plateforme`,
jeu de capacités Pro complet, grâce offline de 7 jours — donc Atelier complet,
exports, projets, tracé avancé.

Le niveau Pro est **synthétisé à la lecture** : aucune ligne n'est écrite dans
`entitlements_utilisateurs_elsatia`, donc ni la facturation ni l'historique de
monétisation R9 ne sont faussés. Le reste du corps est celui de R9, inchangé :
sans droit serveur, un utilisateur normal reste **Free**.

Côté client : `ENTITLEMENT_SOURCES` gagne `"plateforme"`, libellée
« Plateforme ELSATIA ». `shouldPreventDuplicatePurchase` la traite comme un droit
actif : le propriétaire ne peut pas acheter par erreur un abonnement inutile.

---

## 3. Applications

### Gestion Pro

`/plateforme` reste gardée par `est_plateforme_admin()`. Le propriétaire y arrive
avec `plateforme_role_courant() = 'total'`. `plateforme_lister_admins()` expose
désormais `proprietaire` ; l'écran affiche un badge **« Propriétaire ELSATIA »** et
masque la commande « Retirer » sur cette ligne. Les autres administrateurs sont
inchangés — `admin@elsatia.fr` et `julien.gregurec@gmail.com` conservent
exactement leur cycle actuel.

### Colors

Aucun changement applicatif. `connexionAction` et `getContexteColors` passent déjà
par `contexte_application_courant()` + `a_acces_application()`, tous deux
génériques. Le propriétaire ouvre Colors sans octroi manuel par environnement.

`colors_action_autorisee()` reste **inchangée** : un admin plateforme n'obtient que
`voir`, et uniquement sous session support active sur l'entreprise ciblée. C'est
la frontière §6 et elle n'est pas déplacée.

### Tools

Voir §2.5. Réserve d'exploitation : `tools_lister_entreprises_autorisees()` exige
une **appartenance entreprise réelle**. Un propriétaire sans appartenance n'a pas
de contexte cloud (projets synchronisés) — c'est volontaire : lui servir toutes
les entreprises du parc serait une surface cross-tenant. Le propriétaire doit être
membre d'au moins une entreprise ELSATIA pour le cloud Tools ; l'usage local et
les droits Pro fonctionnent sans.

---

## 4. Entreprises : ce que « accès total » ne signifie pas

| Portée | Propriétaire global |
| --- | --- |
| Ouvrir une application du catalogue | **Oui**, automatiquement |
| Administrer la plateforme (`/plateforme`) | **Oui**, rôle `total` + AAL2 |
| Lire/écrire les données métier d'une entreprise | **Non** — RLS métier inchangées |
| Écrire dans Colors pour une entreprise | **Non** — session support requise, lecture seule |
| Contexte entreprise / impersonation | **Conservé** : `plateforme_entrer_entreprise` avec motif, 4 h, audité |

Prouvé par test : le propriétaire lit **0 client** et **0 chantier** des entreprises
A et B, et `colors_action_autorisee(..., 'modifier_seau')` reste `false`.

---

## 5. MFA / AAL2

Aucun assouplissement. Toutes les gardes `plateforme_exiger_session_aal2()` de
00237 restent en place, et la revendication propriétaire en ajoute une nouvelle
(AAL2 **et** facteur MFA vérifié). Prouvé par test : AAL1 ⇒ revendication refusée.

## 6. Audit trail

- `plateforme_journal_actions` : `proprietaire_plateforme_revendique` (UID + email
  + méthode), inséré par une fonction `SECURITY DEFINER` — `authenticated` n'a
  aucun droit d'écriture sur cette table.
- `historique_acces_applications` : inchangé, continue de tracer activations,
  habilitations et retraits avec `auteur_utilisateur_id`.
- Aucun bypass silencieux : chaque prédicat est nommé, versionné et testé.

---

## 7. Tests

### pgTAP — `supabase/tests/platform_global_owner_all_apps_v1.test.sql` (40 assertions)

| Exigence §17 | Couverture |
| --- | --- |
| 1. propriétaire → plateforme total | `plateforme_role_courant() = 'total'`, `est_plateforme_proprietaire()` |
| 2. propriétaire → Gestion Pro | `a_acces_application(..., 'gestion_pro')` |
| 3. propriétaire → Tools | accès + `tier = 'pro'` + source `plateforme` |
| 4. propriétaire → Colors | `a_acces_application(..., 'colors')` |
| 5. propriétaire → `future_test_app` | accès + présence dans `applications_autorisees` |
| 6. user normal sans entitlement | refusé, application absente du sélecteur, Tools Free |
| 7. user normal avec entitlement | autorisé (accès entreprise + habilitation) |
| 8. cross-tenant | 0 client, 0 chantier, aucune écriture Colors |
| 9. admin non `total` | ni propriétaire, ni superuser, aucun Tools Pro |
| 10. identité inactive | révoquée ⇒ aucun droit ; ne se réactive pas elle-même |
| 11. utilisateur banni | `banned_until` futur ⇒ tous les droits tombent |
| 12. AAL1 → opération sensible | revendication refusée (`%AAL2%`) |
| 13. AAL2 → opération autorisée | revendication aboutit, idempotente |
| bonus | `reserves` automatique ; propriétaire ni révocable ni dégradable par un délégué ; aucune ligne d'entitlement commercial créée |

Résultat local (migration appliquée dans une transaction annulée, base au ledger
263) : **40/40**.

### Régression pgTAP

`platform_aal2_role_integrity_v1` (80), `platform_support_uid_security_v1` (38),
`platform_support_isolation_audit_v1` (67), `platform_write_surface_hardening_v1`
(23), `platform_residual_acl_hardening_r74` (28), `platform_admin_uid_canonical_v1`
(13), `elsatia_multi_app_convergence_v1` (27), `elsatia_tools_r8/r9/r10` (28/26/17),
`colors_canonical_integration_v1` (8), `migration_canonicalization_v2` (9),
`plateforme_lire_entreprise_membres_v1` (10) — **toutes vertes**.

### Application

`npm run typecheck`, `npm run lint` (0 erreur), `npm test` : **1 057 tests verts**
(949 Gestion Pro + 108 Tools). `npm run verify:migrations` : 264 migrations valides.

---

## 8. Security review

| Risque | Traitement |
| --- | --- |
| Privilege escalation | Aucun droit dérivé d'un email dans un prédicat. Le seul chemin d'auto-activation est borné à l'identité `proprietaire`, sous AAL2 + MFA vérifié + email confirmé. |
| Email spoofing | Impossible sans contrôler la boîte `julien@elsatia.fr` **et** y attacher un MFA. Après la première revendication l'UID est figé ; un autre compte est refusé. |
| Stale JWT | `plateforme_identite_auth_saine()` revérifie `banned_until` / `deleted_at` / `email_confirmed_at` à chaque appel. Test 11 le prouve. |
| Admin inactive | `statut_identite = 'active'` exigé partout ; une identité révoquée ne se réactive pas elle-même. |
| Entitlement bypass utilisateur normal | La branche Tools est gardée par `plateforme_est_superuser()` seul. Un `lecture` actif reste Free (test 33). |
| RLS bypass accidentel | Aucune policy modifiée, aucun `security definer` nouveau lisant des données métier. Les deux fonctions redéfinies (retirer / modifier rôle) ne font que **restreindre**. |
| Cross-tenant / IDOR | `a_acces_application` et `applications_autorisees` n'acceptent toujours aucun `utilisateur_id` cible. Isolation métier testée. |
| Éviction du propriétaire | Nouvelle garde : un `total` délégué ne peut ni révoquer ni dégrader le propriétaire. |

**Risque résiduel accepté** : quiconque contrôle la boîte `julien@elsatia.fr` et
peut y enrôler un MFA peut revendiquer la propriété tant qu'elle n'a jamais été
revendiquée. C'est le compte propriétaire lui-même ; la fenêtre se referme à la
première revendication.

---

## 9. Migration

- **Nécessaire** : OUI.
- **Numéro** : `20260906000266_platform_global_owner_all_apps_v1.sql`
  (prochain disponible ; ledger 263 → 264 fichiers, séquence 265 → 266).
- **Nature** : strictement **additive** et **post-cutover**. Aucune migration
  historique modifiée (233/234/235/236/237 intactes).
- **Rejouabilité** : `add column if not exists`, `create unique index if not
  exists`, contrainte posée sous `do $$ … $$`, `insert … on conflict do nothing`,
  `update … where not proprietaire`. Une seule redéfinition destructive contrôlée :
  `drop function plateforme_lister_admins()` (changement de type de retour,
  42P13), même procédé qu'en 00251, aucun objet SQL dépendant.

---

## 10. Position par rapport au cutover

Ce lot **ne modifie pas** la cible de cutover `996be15` / ledger 263. Le
déroulement reste :

```
cutover initial (996be15, ledger 263)
  → validation Production
  → hotfix pilote (7ba62c5)
  → ce lot (migration 266)
```

Aucun blocage démontré qui l'imposerait avant le pilote : sur Production, le
cycle à deux comptes reste praticable via `julien.gregurec@gmail.com`.

**Réserve à porter au runbook** : si un environnement **neuf** (Preview reconstruit,
Fresh de contrôle) doit être administré, il est bloqué sans ce lot ou sans
intervention SQL de maintenance (§1.3).

---

## 11. Écarts restants

### P0

Aucun sur le périmètre de ce lot.

### P1

1. **Prérequis d'exploitation** : le compte Auth `julien@elsatia.fr` doit exister,
   avoir son email confirmé et **un facteur MFA vérifié** avant la revendication.
   Rien dans ce lot ne crée de compte Auth.
2. **Cloud Tools sans entreprise** : le propriétaire doit être membre actif d'au
   moins une entreprise ELSATIA pour la synchronisation des projets (§3, Tools).
   Choix délibéré d'isolation, pas un défaut.
3. **`reserves` absent du catalogue** : volontaire. Son inscription est une
   décision produit/commerciale, hors périmètre technique.
4. **Écran de revendication** : `plateforme_proprietaire_revendiquer()` n'a pas de
   bouton dédié dans Gestion Pro. Appelable par RPC authentifiée en AAL2 ; un
   écran d'onboarding propriétaire pourra l'exposer plus tard.
5. **`plateforme_ajouter_admin`** peut toujours créer une seconde ligne `total` :
   c'est le mécanisme d'admin délégué, voulu, mais il mérite une revue périodique
   de la liste `/plateforme`.
