# Inventaire des usages d'email dans l'autorisation plateforme

Inventaire effectué pour la migration `20260826000236_platform_support_uid_security_v1.sql`.

## Anciennes autorisations dangereuses, neutralisées dans le schéma final

- `20260710000036_plateforme_abonnements.sql` : ancienne version de
  `est_plateforme_admin()` fondée sur `auth.email()` ; remplacée par `00235`, puis renforcée
  par `00236` avec UID, `actif` et `statut_identite='active'`.
- `20260719000115_roles_plateforme_appliques.sql` : ancienne version de
  `plateforme_role_courant()` fondée sur l'email ; remplacée par `00235`/`00236`.
- `20260714000075_acces_plateforme_impayes.sql` : `est_acces_support_actif()` et
  `plateforme_entrer_entreprise()` accordaient un droit par email ; toutes deux sont remplacées
  par `00236` et n'utilisent plus que l'UID canonique actif.
- `20260714000072_plateforme_equipe.sql` : ancien ajout/retrait administrateur ; remplacé par
  le cycle attente, rattachement, activation et révocation de `00236`.

Ces fichiers historiques restent immuables. Leur définition n'est plus celle du schéma final.

## Usages légitimes sans attribution de droit

- `auth.email()` dans les messages support, historiques multi-app et demandes de
  réinitialisation : libellé d'audit ou d'affichage ; l'autorisation préalable repose sur UID.
- `plateforme_admins.email` : clé de recherche et identité déclarative des RPC de gestion ; les
  droits sont toujours déterminés par `utilisateur_id`, `actif` et `statut_identite`.
- claim email dans les tests : preuve explicite qu'une usurpation d'email n'accorde aucun droit.
- interface plateforme : affichage et saisie d'une identité en attente, jamais activation.

## Mode prototype

Le mode local sans connexion conserve ses accès de démonstration déjà existants, mais
`DISABLE_EMAIL_LOGIN=true` ne suffit plus à l'activer. Il exige cumulativement
`ELSATIA_LOCAL_DEMO=true`, `NODE_ENV` différent de Production, l'absence de `VERCEL` et
`VERCEL_ENV`, et une URL Supabase dont l'hôte est `localhost`, `127.0.0.1` ou `::1`. Une
Production, une Preview/Vercel ou un Supabase distant reste donc en authentification réelle
même si la variable historique est mal configurée. Toute ligne administrateur écrite dans la
seule démonstration locale reste `en_attente`, sans UID et inactive ; aucun bypass SQL/RLS n'est
introduit.

## Renforcement AAL2 et rôles (migration 237)

L'email ne participe jamais à la preuve d'authentification forte. Les mutations administrateur,
support et multi-app sensibles utilisent le claim `aal` de `auth.jwt()` et exigent `aal2`.
Les mutations d'entitlements exigent en plus le rôle plateforme `total`; les rôles `lecture`,
`support` et `facturation` ne peuvent pas les appeler. `auth.email()` reste limité à l'audit,
l'affichage et la vérification de cohérence entre l'identité déclarée et le compte Auth cible.

L'inventaire global de la migration 237 classe également les opérations suivantes comme
sensibles et AAL2 : facturation mutative, création d'entreprise, catalogue tarifaire, remise,
réinitialisation assistée, fils/messages support et mutations d'identité. Les occurrences
résiduelles de `auth.email()` dans ces RPC ne prennent aucune décision d'autorisation : elles
alimentent uniquement les champs d'audit/affichage. `plateforme_quitter_entreprise()` est
l'exception documentée : elle ne peut que fermer la session support ouverte de `auth.uid()` et
restaurer son entreprise précédente, sans ouvrir ni étendre un accès.

Le schéma final ne contient aucun `SECURITY DEFINER` sans `search_path` fixé dans le périmètre
inventorié. Les tables d'accès multi-app n'accordent aux rôles applicatifs que la lecture ; les
écritures passent par les RPC `total` + AAL2. Le préflight n'est exécutable que par
`service_role`, et les helpers AAL2/verrou ne sont pas exécutables par `authenticated`.

## Isolation support et traçabilité (migration 238)

`plateforme_support_fils()` ne retourne plus aucun texte, extrait ou côté de message.
`plateforme_support_messages()` exige rôle `total`/`support`, AAL2 et session ciblée, mais reste
une lecture pure. L'acquittement explicite et les mutations multi-app/facturation utilisent
`auth.uid()` comme auteur d'audit ; `auth.email()` éventuellement conservé n'est qu'un libellé.
Les cibles inexistantes ne produisent ni succès ni historique. Les appels sans changement réel
retournent zéro/`false` sans événement, sauf le snapshot mensuel volontairement tracé comme
événement périodique.
