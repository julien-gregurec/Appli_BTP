# ELSATIA multi-app convergence V1

Statut : **socle backend convergé, corrigé UID et testé** (schéma, RLS, RPC, pgTAP). L'UI Gestion Pro
(sélecteur d'applications, page `/plateforme/applications`, sections entreprise/utilisateur,
mobile/accessibilité) est **hors scope de cette passe** — voir "Hors scope" ci-dessous.

## Pourquoi cette convergence

Deux socles multi-applications avaient été construits indépendamment, dans deux dépôts locaux
séparés du même remote GitHub (`elsatia-main`, canonique, et `~/Documents/btp-platform`, source
Colors). Le schéma Colors était plus mature (rôles réels par application, fenêtres de validité
temporelle, fonctions de contexte de session, sélecteur UI déjà fonctionnel). Cette convergence
adopte ce schéma comme référence, **porté à la main dans `elsatia-main`** (pas de fusion Git
entre les deux dépôts, jugée inutile et risquée vu que les deux clones ont divergé sur des
commits sans rapport avec ce socle).

## Ce qui a changé par rapport au premier socle (541f1ba, jamais mergé)

| | Ancien socle (541f1ba, abandonné) | Socle convergé (cette passe) |
|---|---|---|
| Tables accès | `acces_applications_entreprise` (singulier), `acces_applications_utilisateur` | `acces_applications_entreprises`, `habilitations_applications_utilisateurs` (repris de Colors) |
| Rôles | `admin`/`utilisateur` génériques | Rôles réels par app (`colors_gestionnaire_stock` etc.) |
| Validité temporelle | Absente | `valide_du`/`valide_jusqu_au` sur les deux tables d'accès |
| Fonction admin global | `application_accessible_utilisateur`, `mes_applications_accessibles` | `a_acces_application`, `applications_autorisees` (repris de Colors), s'appuyant sur `est_plateforme_admin()` existant |
| Audit | `historique_acces_applications` | **Conservé** — seule pièce du socle Gestion Pro à avoir survécu à la convergence, absente du socle Colors d'origine |
| RPC de mutation | 4 RPC déjà écrites | Réécrites sur le schéma convergé (`autorise`/`valide_du`/`valide_jusqu_au` au lieu de `actif`) — comblent une lacune que le socle Colors documentait lui-même ("le portail d'administration reste à construire") |

Les anciennes tables `acces_applications_entreprise`/`acces_applications_utilisateur` n'ont
jamais existé sur `release/commercialisation-v1` (le socle 541f1ba n'a jamais été mergé) — rien
à supprimer, aucune migration destructive nécessaire.

## Schéma (migration `supabase/migrations/20260826000234_elsatia_multi_app_convergence_v1.sql`)

Voir le détail des tables/fonctions dans
[`ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md`](ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md) — ce document
est désormais le contrat commun Gestion Pro/Colors, identique des deux côtés.

Décisions de réutilisation (pour ne pas multiplier les mécanismes concurrents) :
- **Admin global** : `est_plateforme_admin()` (existant, ~40 usages) — la fonction équivalente
  côté Colors (`est_administrateur_plateforme_global()`) est abandonnée.
- **Appartenance active** : `est_membre_actif(entreprise_id)` (existant) — la fonction
  équivalente côté Colors (`est_membre_organisation_elsatia()`) est abandonnée, non portée.
- **Gestion des accès** : `peut_gerer_acces(entreprise_id)` (existant) réutilisé pour restreindre
  la lecture des habilitations d'un tiers à un gestionnaire d'accès de l'entreprise.

## Mode support — pas de bypass silencieux

L'auto-accès de l'admin plateforme au catalogue d'applications ne donne aucun accès direct aux
données métier d'un tenant. Pour toute intervention réelle dans les données d'une entreprise
cliente, le mécanisme existant `plateforme_acces_entreprises` +
`est_acces_support_actif(entreprise_id)` (déjà utilisé en production pour le suivi des impayés)
reste le modèle à réutiliser — traçable, à durée limitée, un seul actif par admin.

La revue indépendante a découvert que les anciennes définitions de
`est_acces_support_actif()` et `plateforme_entrer_entreprise()` autorisaient encore par email
malgré la conversion de `est_plateforme_admin()` vers l'UID. La migration corrective
`20260826000236_platform_support_uid_security_v1.sql` remplace ces fonctions : UID identique,
identité explicitement active, rôle `total`/`support`, session ciblée et expiration quatre
heures sont désormais tous obligatoires. Le scénario historique « bon email, UID absent,
actif=false » est couvert par un test de régression et ne crée plus de session.

La migration append-only `20260826000237_platform_aal2_role_integrity_v1.sql` complète ce
socle avec : AAL2 de la session appelante lu uniquement via `auth.jwt()`, rôle `total` pour les
mutations d'entitlements, ouverture support AAL2 réservée à `total`/`support`, UID et email
immuables pendant l'état actif, cycle révocation/détachement/rattachement/activation, verrou
advisory transactionnel du dernier total et état révoqué daté/attribué. Les opérations support
et de facturation mutatives ont également été classées par rôle et exigent AAL2 ; une
consultation `lecture` n'exécute plus la suspension automatique des impayés. Le préflight
versionné et `docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql` contrôlent les données avant
tout environnement distant.

La migration append-only `20260826000239_platform_support_isolation_audit_v1.sql` ferme les
deux effets résiduels découverts en revue : le catalogue global des fils ne contient plus aucun
texte de message et `plateforme_support_messages()` n'effectue plus d'UPDATE implicite. Une
session support AAL2 ciblée est obligatoire avant toute lecture de contenu ; l'acquittement est
une RPC séparée, ciblée et auditée. La même migration rend les mutations multi-app idempotentes,
ajoute les états avant/après, refuse les cibles de facturation inexistantes et centralise la
traçabilité UID des mutations plateforme. Le snapshot mensuel est explicitement classé comme
événement périodique, distinct d'un faux historique de changement.

Le mode sans connexion TypeScript n'est plus activable par `DISABLE_EMAIL_LOGIN=true` seul : il
exige également `ELSATIA_LOCAL_DEMO=true`, une URL Supabase locale, un environnement non
Production et l'absence de tout contexte Vercel. Il ne modifie aucune règle SQL ou RLS.

## Tests (`supabase/tests/elsatia_multi_app_convergence_v1.test.sql`)

27 assertions pgTAP, réutilisant le fixture partagé `fixtures/isolation_multitenant.inc` :
entreprise autorisée/non autorisée, utilisateur habilité/non habilité, rôle Colors réel retourné
(pas un générique), admin Gestion Pro sans Colors refusé, cross-tenant (lecture + écriture),
self-grant impossible (`permission denied`), FK anti-habilitation dans une organisation
étrangère (`foreign key violation`), admin plateforme (accès automatique + future application
visible sans ligne d'habilitation), application désactivée au catalogue (refusée malgré
`autorise=true`), validité temporelle entreprise (expirée/future/sans fin) et utilisateur
(expirée), cycle complet RPC (activer → habiliter → vérifier → retirer → désactiver → vérifier)
avec audit (4 actions journalisées), admin d'entreprise ne pouvant pas activer une application
lui-même, et vérification structurelle qu'aucune fonction n'accepte de `utilisateur_id` cible
arbitraire (signatures `a_acces_application(uuid,text)` / `applications_autorisees(uuid)`).

La migration `00239` ajoute 60 assertions ciblées couvrant la liste support sans contenu,
l'isolation A/B, la lecture pure, l'acquittement explicite et idempotent, les sessions absentes,
étrangères, expirées ou fermées, l'historique multi-app sur changement réel, les cibles de
facturation et l'audit UID. Les suites `00234` à `00237` restent rejouées cumulativement. Trois
tests historiques fragiles avaient déjà été corrigés sans changer le
comportement métier : refus d'écriture Alertes vérifié par SQLSTATE, devis brouillon utilisés
pour atteindre réellement les contraintes cross-tenant, et lecture de vérification Remises
effectuée hors session plateforme afin de préserver l'absence de bypass RLS cross-tenant.

La migration administrateur `20260826000235` accepte aussi les identités déclarées avant leur
compte Auth sous forme strictement inactive (`utilisateur_id = NULL`, `actif = false`). Une
contrainte interdit qu'une telle ligne soit activée. `20260826000236` ajoute les états explicites
`en_attente`, `rattachee_non_confirmee`, `active`, `revoquee`, le MFA obligatoire pour une
activation normale, l'interdiction de l'auto-activation et la révocation des sessions support.
Aucune autorisation du schéma final ne repose sur l'email.

## Package TypeScript partagé

`packages/application-access` fournit le package privé
`@elsatia/application-access` : constantes d'applications/rôles, types de contexte et wrappers
défensifs des RPC `a_acces_application` et `applications_autorisees`. Il ne contient aucune
mutation, aucune permission métier `/stock` et ne propage pas les messages techniques du
backend. Cinq tests Vitest dédiés couvrent son contrat.

## QA

Le détail chiffré de la QA cumulative `00234 → 00238` est consigné dans le rapport du commit de
correction. Aucun test distant, déploiement Preview ou migration distante ne fait partie de
cette validation locale.

## Hors scope de cette passe (itération suivante)

Page admin `/plateforme/applications`, section "Applications ELSATIA" dans la fiche entreprise
et la fiche utilisateur, sélecteur d'applications dans `Sidebar.tsx` côté Gestion Pro (le
sélecteur existe déjà côté Colors, `ApplicationSwitcher`/`ApplicationSwitcherMenu`, à porter
séparément), passes mobile/accessibilité sur cette UI (qui n'existe pas encore côté Gestion
Pro), SSO cross-domaine (audit préparé, non implémenté).

## Preview avant Production

Cette migration n'a été appliquée qu'en local (Supabase local via `db:reset`). **Non appliquée à
Preview ni Production.** Avant toute application à Preview : vérifier l'absence de collision
avec des migrations déjà appliquées côté Preview (aucune trouvée dans `elsatia-main` au moment
de l'écriture — le catalogue de tables/fonctions introduit ici n'existait nulle part avant).
