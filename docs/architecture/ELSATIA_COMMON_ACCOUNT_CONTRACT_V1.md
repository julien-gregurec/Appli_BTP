# Contrat compte ELSATIA commun — référence pour ELSATIA Colors (et futures applications)

Ce document est la **référence unique** pour toute application ELSATIA qui rejoint la suite
(Colors en premier). Le repo `elsatia-main` (ELSATIA Gestion Pro) est **propriétaire du
schéma** décrit ici : entreprises, utilisateurs, catalogue d'applications, habilitations. Si le
repo Colors constate une divergence avec ce document, **il doit s'arrêter sur ce point et
remonter la divergence plutôt que créer un second schéma**.

## Historique de convergence

Une première version de ce socle avait été construite indépendamment des deux côtés
(Gestion Pro et Colors), dans deux dépôts locaux différents (`elsatia-main` et
`~/Documents/btp-platform`, deux clones distincts du même remote GitHub, `elsatia-main` étant
le dépôt canonique). Le schéma décrit ici **reprend et adopte le schéma déjà construit côté
Colors** (plus mature : rôles applicatifs réels, fenêtres de validité temporelle, fonctions de
contexte de session), porté à la main dans `elsatia-main` par la migration
`supabase/migrations/20260826000234_elsatia_multi_app_convergence_v1.sql` — pas par fusion Git
entre les deux dépôts. Colors doit désormais considérer ce schéma, tel qu'il existe dans
`elsatia-main`, comme sa seule source de vérité.

## Identité — une seule source

L'identité est **Supabase Auth du projet `elsatia-main`** (`auth.users`), avec un profil
applicatif dans `public.utilisateurs` (id = `auth.users.id`). **Ne créez pas un second système
d'authentification, pas de mots de passe séparés pour Colors.** Un utilisateur Colors doit être
le même compte Auth qu'un utilisateur Gestion Pro.

Le lien entreprise ↔ utilisateur est `public.utilisateurs_entreprises` (clé composite
`utilisateur_id, entreprise_id`, colonne `statut` incluant `'actif'`).

## Codes d'application stables

Table `public.applications_elsatia` (`code` = clé primaire text, contrainte
`^[a-z][a-z0-9_]{1,49}$`) :
- `gestion_pro` — ELSATIA Gestion Pro
- `colors` — ELSATIA Colors

Toute future application obtient son propre `code` stable (jamais basé sur le nom affiché).
Chaque ligne porte aussi : `actif`, `ordre`, `url_locale`/`url_preview`/`url_production`,
`icone`, `statut_produit` (`disponible`/`bientot`/`interne`).

## Modèle d'entitlement

| Niveau | Table | Question à laquelle elle répond |
|---|---|---|
| Catalogue | `applications_elsatia` | L'application existe-t-elle, est-elle active ? |
| Rôles | `roles_applications_elsatia` | Quel vocabulaire de rôle existe pour CETTE application — Colors définit ses propres rôles (`colors_admin_organisation`, `colors_gestionnaire_stock`, `colors_utilisateur_depot`, `colors_consultation`), indépendants de ceux de Gestion Pro (`gestion_pro_admin`, `gestion_pro_utilisateur`) |
| Entreprise | `acces_applications_entreprises` | L'entreprise a-t-elle souscrit/activé cette application ? Avec fenêtre `valide_du`/`valide_jusqu_au`, `source`, `reference_externe`, `metadata` |
| Utilisateur | `habilitations_applications_utilisateurs` | Cet utilisateur, dans cette entreprise, est-il habilité à cette application, avec quel rôle et quelle fenêtre de validité ? FK composite vers `utilisateurs_entreprises` : impossible d'habiliter un non-membre |
| Audit | `historique_acces_applications` | Journal append-only des activations/désactivations/habilitations |

Fonction d'entitlement que Colors doit utiliser pour vérifier l'accès (via l'API PostgREST /
RPC Supabase, avec le JWT de l'utilisateur connecté) :

```sql
select public.a_acces_application('<entreprise_id>', 'colors');
```

Cette fonction (toujours évaluée pour `auth.uid()` — jamais un utilisateur cible arbitraire)
renvoie `true` si :
- l'appelant est admin plateforme global (`est_plateforme_admin()`, bypass total sur le
  catalogue actif), **ou**
- l'appelant est membre actif de l'entreprise (`est_membre_actif`, déjà existant côté
  Gestion Pro) **et** l'entreprise a `colors` autorisé et dans sa fenêtre de validité **et**
  l'utilisateur a une habilitation `colors` autorisée, dans sa fenêtre de validité, avec un
  rôle actif.

Pour lister les applications accessibles à l'utilisateur courant (utile pour un sélecteur) :

```sql
select * from public.applications_autorisees('<entreprise_id>');
-- retourne : application_code, nom, role_code, url_locale, url_preview, url_production,
-- icone, est_admin_plateforme
```

Pour résoudre le contexte de session (utilisateur + entreprise active, avec repli admin
plateforme sans entreprise) :

```sql
select * from public.contexte_application_courant();
```

**Important sécurité** : aucune de ces fonctions n'accepte de `utilisateur_id` cible arbitraire
— elles n'opèrent que sur `auth.uid()`. N'ajoutez jamais de paramètre permettant à un appelant
de sonder l'accès d'un tiers sans revérifier son autorisation à administrer ce tiers.

## Admin plateforme global

`public.plateforme_admins` + `public.est_plateforme_admin()` — mécanisme déjà existant côté
Gestion Pro (utilisé dans ~40 endroits). **Ne créez pas de second mécanisme d'admin global**
(une fonction `est_administrateur_plateforme_global()` avait été introduite côté Colors avant
la convergence — elle est abandonnée au profit de `est_plateforme_admin()`, seule fonction
canonique désormais).

**Identité et autorisation (depuis `20260826000235_platform_admin_uid_canonical_v1.sql`)** :
l'autorisation repose sur `auth.uid()`, pas sur l'email :

```sql
select coalesce(
  exists(select 1 from public.plateforme_admins where utilisateur_id = auth.uid() and actif),
  false
);
```

`plateforme_admins.email` reste une donnée d'identité/audit/bootstrap (affichage et recherche)
— **ce n'est jamais une racine d'autorisation et aucune correspondance automatique par email
n'est permise**. Une ligne avec un email correct mais un `utilisateur_id` incorrect, absent ou
inactive n'accorde aucun droit. `plateforme_admins.email` reste la clé primaire de la
table (aucune refonte de clé primaire dans ce lot — jugée inutilement risquée avant
commercialisation) ; `utilisateur_id` porte une contrainte `UNIQUE` et une FK vers
`auth.users(id) on delete restrict`. Une identité administrative peut être enregistrée avant
la création de son compte Auth uniquement avec `utilisateur_id = NULL` et `actif = false` ;
la contrainte `plateforme_admins_actif_requiert_utilisateur_id` interdit tout administrateur
actif sans UID. La migration `20260826000236_platform_support_uid_security_v1.sql` ajoute le
cycle explicite suivant :

| `statut_identite` | UID | `actif` | Droits |
|---|---:|---:|---|
| `en_attente` | absent | false | aucun |
| `rattachee_non_confirmee` | présent | false | aucun |
| `active` | présent | true | selon le rôle plateforme |
| `revoquee` | facultatif jusqu'au détachement | false | aucun |

Une activation nécessite deux opérations séparées, effectuées par un autre administrateur
`total` actif : `plateforme_rattacher_admin(email, uid)` puis
`plateforme_activer_admin(email)`. Le compte Auth cible doit avoir un email vérifié, identique
à l'identité déclarée, et un facteur MFA vérifié. L'auto-rattachement et l'auto-activation sont
interdits. `activation_at`/`activation_par` et `revocation_at`/`revocation_par` conservent la
date et l'UID de l'auteur. Une révocation ferme les sessions support ouvertes ; le détachement
de l'UID révoqué précède toute suppression éventuelle du compte Auth.
`plateforme_role_courant()` (utilisé par 6 RPC de gestion — abonnements, tarifs, impayés,
règlements, support, création d'entreprise — via `plateforme_exiger_role()`) suit la même
logique : `select role from plateforme_admins where utilisateur_id = auth.uid() and actif`.

`julien@elsatia.fr` est l'identité administrative officielle prévue. La migration corrective la
maintient explicitement `en_attente` ou `rattachee_non_confirmee`, toujours inactive. Elle ne
devient administrateur effectif qu'une fois son compte Auth vérifié, son UID rattaché, son MFA
vérifié et son activation effectuée dans un lot séparé. `julien.gregurec@gmail.com` reste
provisoirement actif jusqu'à validation
complète du compte professionnel. Un administrateur plateforme actif accède aux applications
actives sans ligne d'habilitation explicite.

Un admin d'une entreprise cliente (gérant) **n'est pas** admin plateforme global : il ne peut
pas activer Colors pour sa propre entreprise ni s'auto-habiliter. Ces actions sont centralisées
côté plateforme (RPC ci-dessous) — pas de RPC équivalente à créer côté Colors.

L'auto-accès de l'admin plateforme global au catalogue **ne donne aucun accès SQL cross-tenant
aux données métier** : les tables métier de chaque application restent gouvernées par leurs
propres RLS, inchangées. Pour une intervention réelle dans les données d'une entreprise cliente,
réutiliser le mode support Gestion Pro (`plateforme_acces_entreprises` +
`est_acces_support_actif(entreprise_id)`). Une session support est explicite, liée à l'UID de
l'administrateur, limitée à une entreprise, fermable, révocable et automatiquement expirée
après quatre heures. La fonction exige une identité `active` et un rôle `total` ou `support` ;
aucun email ne participe à cette décision. Ne jamais construire de bypass RLS silencieux.

La procédure opérationnelle, y compris le cas du premier administrateur, est décrite dans
[`PLATFORM_ADMIN_ACTIVATION_RUNBOOK.md`](../operations/PLATFORM_ADMIN_ACTIVATION_RUNBOOK.md).

## RPC d'administration (plateforme uniquement)

- `plateforme_activer_application_entreprise(entreprise_id, application_code, valide_du?, valide_jusqu_au?, source?, reference_externe?)`
- `plateforme_desactiver_application_entreprise(entreprise_id, application_code)`
- `plateforme_habiliter_utilisateur_application(utilisateur_id, entreprise_id, application_code, role_code, valide_du?, valide_jusqu_au?)`
- `plateforme_retirer_habilitation_application(utilisateur_id, entreprise_id, application_code)`

Toutes réservées à `est_plateforme_admin()`, journalisées dans `historique_acces_applications`.

## Sécurité — pas d'écriture directe

Aucune des quatre tables d'entitlement n'a de policy RLS d'écriture (INSERT/UPDATE/DELETE), et
le rôle `authenticated` n'a qu'un `GRANT SELECT` dessus. Toute modification passe exclusivement
par les RPC ci-dessus. **Colors ne doit jamais tenter d'écrire directement dans ces tables** —
ni depuis son backend avec la clé service-role, ni depuis le frontend.

## URLs du catalogue

`url_locale`/`url_preview`/`url_production` par application. Pour `colors`, `url_production` est
un **placeholder temporaire** (`https://colors.elsatia.fr`) — à corriger dès que l'URL réelle est
connue, par une simple mise à jour de ligne (pas de migration lourde).

## SSO — état actuel

Non implémenté, non audité dans cette passe. Si Gestion Pro et Colors sont sur des domaines
différents, ne bricolez pas de cookies cross-domaine non sécurisés : pour l'instant, un
utilisateur qui bascule de Gestion Pro vers Colors se reconnecte avec les mêmes identifiants
(compte ELSATIA commun, pas de second mot de passe). Un audit SSO dédié sera fait séparément
avant toute implémentation.

## Ce que Colors ne doit pas faire

- Créer ses propres tables `applications`, `entreprises`, ou `utilisateurs` — ce repo est la
  source de vérité.
- Dupliquer ou contourner `plateforme_admins`/`est_plateforme_admin()`, ni réintroduire
  `est_administrateur_plateforme_global()`.
- Réutiliser le modèle `postes`/`permissions_poste` de Gestion Pro (métier BTP) pour ses propres
  rôles — Colors définit ses rôles dans `roles_applications_elsatia` sous son propre
  `application_code`, déjà fait (`colors_admin_organisation`, `colors_gestionnaire_stock`,
  `colors_utilisateur_depot`, `colors_consultation`).
- Écrire directement dans les tables d'entitlement — uniquement via les RPC listées ci-dessus.

En cas de doute ou de divergence constatée avec ce document : **s'arrêter et remonter le point**
plutôt que de faire un choix unilatéral côté Colors.

## Package partagé `@elsatia/application-access`

Le package privé `packages/application-access` expose uniquement le contrat TypeScript commun :

- codes d'application et rôles Colors stables ;
- types des lignes renvoyées par `applications_autorisees(uuid)` ;
- contrôle serveur via `a_acces_application(uuid,text)` ;
- exigence d'accès et erreur métier contrôlée ;
- normalisation défensive du sélecteur d'applications.

Il n'accorde jamais d'accès, n'accepte aucun identifiant d'utilisateur cible et n'utilise aucune
permission métier Gestion Pro telle que `/stock`. Chaque application lui injecte son propre
client Supabase serveur, construit avec la session Auth courante. Les erreurs techniques du
backend ne sont pas propagées dans ses messages publics.
