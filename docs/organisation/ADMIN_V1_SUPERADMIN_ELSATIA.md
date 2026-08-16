# ADMIN‑V1 — administration plateforme ELSATIA

## Objet et périmètre

ADMIN‑V1 sépare les rôles internes ELSATIA des rôles d’une entreprise cliente et applique le moindre privilège côté serveur. L’identité cible du futur super-administrateur est `julien@elsatia.fr`, sans règle spéciale fondée sur cette adresse.

Ce lot ne modifie ni les tarifs, ni Stripe Live, ni les secrets d’infrastructure, ni les données Production. La validation s’effectue d’abord en local, puis dans le projet Supabase/Vercel Preview.

## Architecture précédente

La table `plateforme_admins` contenait déjà les rôles `lecture`, `support`, `facturation` et `total`, mais l’autorisation historique reposait principalement sur la présence de l’e-mail Auth dans cette table. Plusieurs fonctions et politiques utilisaient encore un booléen global `est_plateforme_admin()` ou comparaient l’e-mail courant. Les conséquences possibles étaient :

- rôle plateforme insuffisamment lié à une identité Auth immuable ;
- différenciation incomplète des droits dans les anciennes RPC et politiques RLS ;
- accès support cross-tenant trop large ;
- contrôles frontend plus précis que certains contrôles serveur ;
- gestion des rôles sans protection complète contre l’auto-modification et la désactivation du dernier administrateur total ;
- journalisation dispersée des mutations critiques.

## Architecture finale

### Séparation des deux plans d’autorisation

- Les rôles **tenant** restent dans `utilisateurs_entreprises`, `postes` et `permissions_poste` : dirigeant, administrateur, administratif, chef d’équipe, terrain, etc.
- Les rôles **plateforme** restent exclusivement dans `plateforme_admins` : `lecture`, `support`, `facturation`, `total`.
- Un administrateur tenant n’est pas un administrateur plateforme et ne peut pas écrire dans `plateforme_admins`.
- Les metadata ou claims fournis par le client ne constituent jamais une source d’autorité pour le rôle plateforme.

### Source de vérité

`plateforme_admins.utilisateur_id` référence directement `auth.users.id`. `plateforme_role_courant()` résout le rôle actif à partir de `auth.uid()` et de cette relation UUID. L’e-mail sert à retrouver le compte lors d’une attribution administrative contrôlée, mais n’accorde jamais de droit par lui-même.

La table est inaccessible directement aux rôles `anon` et `authenticated`. La gestion passe uniquement par des RPC `SECURITY DEFINER` protégées par la permission `gerer_equipe` :

- `plateforme_lister_admins()` ;
- `plateforme_ajouter_admin(...)` ;
- `plateforme_retirer_admin(...)`.

Le compte Auth doit exister avant l’attribution. La « suppression » désactive le rôle (`actif = false`). Il est interdit de modifier son propre rôle, de désactiver son propre compte ou de désactiver le dernier compte `total` actif.

## Matrice finale des permissions

| Permission | lecture | support | facturation | total |
|---|:---:|:---:|:---:|:---:|
| Consulter la synthèse des entreprises | Oui | Oui | Oui | Oui |
| Consulter le catalogue tarifaire | Oui | Non | Oui | Oui |
| Publier une version tarifaire | Non | Non | Non | Oui |
| Consulter les fils et messages support | Non | Oui | Non | Oui |
| Répondre au support | Non | Oui | Non | Oui |
| Déclencher un reset de compte ciblé et journalisé | Non | Oui | Non | Oui |
| Consulter abonnements, factures et indicateurs de facturation | Non | Non | Oui | Oui |
| Modifier un abonnement / impayé / règlement | Non | Non | Oui | Oui |
| Classer les postes par type de compte facturable | Non | Non | Oui | Oui |
| Accorder ou retirer une remise | Non | Non | Non | Oui |
| Créer une entreprise | Non | Non | Non | Oui |
| Gérer l’équipe et les rôles plateforme | Non | Non | Non | Oui |
| Administrer le catalogue boutique | Non | Non | Non | Oui |
| Ouvrir une session d’intervention tenant | Non | Non | Non | Oui |
| Lire les données métier d’un tenant sans session explicite | Non | Non | Non | Non |
| Lire secrets, clés API, mots de passe ou tokens Auth | Non | Non | Non | Non |

`lecture` est strictement en consultation. `support` utilise des RPC dédiées et n’ouvre pas une session universelle dans un tenant. `facturation` accède uniquement aux données nécessaires aux abonnements et relevés. `total` dispose des fonctions applicatives complètes, mais l’accès métier cross-tenant nécessite une intervention explicite.

## Protection serveur et accès cross-tenant

Les actions serveur vérifient une permission précise avec `aPermissionPlateforme(...)`. Le backend SQL répète le contrôle via `plateforme_exiger_permission(...)`. Le masquage des boutons et les redirections ne sont qu’une défense complémentaire.

Les RPC remplacées ou renforcées couvrent notamment :

- abonnements, impayés, règlements et relevés ;
- catégories de comptes facturables et indicateurs d’usage ;
- support et réinitialisation ciblée ;
- remises ;
- création d’entreprise ;
- catalogue tarifaire ;
- équipe plateforme ;
- boutique et feature flags ;
- rôles de démonstration.

Une session cross-tenant est réservée à `total`, exige un motif d’au moins cinq caractères et est enregistrée dans `plateforme_acces_entreprises`. Une seule session active est autorisée par administrateur. `est_acces_support_actif(...)` n’autorise les politiques métier que pour le tenant explicitement ouvert. Le rôle `total` ne voit donc aucune donnée métier tenant avant cette opération.

## Données sensibles

- **lecture** : synthèse non financière ; aucune donnée métier ou support.
- **support** : fils support, messages, code d’adhésion utile au diagnostic et reset ciblé ; aucune facture, document, note de frais ou donnée IA.
- **facturation** : abonnements, factures d’abonnement, consommation et indicateurs nécessaires à la facturation ; aucun client, chantier, document, support ou donnée IA.
- **total** : informations de plateforme ; données métier uniquement pendant une session d’intervention ciblée et journalisée.

Les secrets Vercel, clés API, mots de passe et tokens Auth ne sont ni stockés ni exposés par l’espace plateforme. L’administration applicative reste distincte de l’administration d’infrastructure.

## Actions critiques et journalisation

`plateforme_journal_actions` enregistre l’acteur Auth, l’action, la cible, des détails non secrets et la date. Sa consultation est réservée à `total`. Sont journalisés dans ADMIN‑V1 :

- ajout, changement ou désactivation d’un rôle plateforme ;
- création d’une entreprise ;
- modification d’un abonnement ;
- signalement d’impayé et enregistrement d’un règlement ;
- changement de type de compte d’un poste ;
- application ou retrait d’une remise.

Les versions tarifaires continuent d’être tracées dans `historique_tarification`. Les interventions tenant restent tracées dans `plateforme_acces_entreprises`. Les resets ciblés restent tracés dans `plateforme_reinitialisations_mot_de_passe`.

Une centralisation avancée, une conservation réglementaire paramétrable, l’export ou l’alerting des journaux pourront relever d’ADMIN‑V2.

## Tests automatisés

Le test `admin_v1_roles_plateforme.test.sql` couvre notamment :

- claim/metadata `platform_role=total` ignoré ;
- refus d’auto-promotion d’un administrateur tenant ;
- refus d’écriture directe dans la table d’autorité ;
- séparation tenant A / tenant B ;
- absence de données métier pour `lecture`, `support` et `facturation` ;
- lecture sans mutation pour `lecture` ;
- support limité à ses RPC et refus de l’entrée tenant ;
- facturation autorisée sur l’abonnement mais refusée sur support et publication tarifaire ;
- fermeture de l’ancienne RPC d’indicateurs financiers au support ;
- visibilité des versions tarifaires inactives limitée aux rôles autorisés ;
- absence d’accès métier pour `total` avant intervention ;
- accès de `total` limité au tenant explicitement choisi ;
- refus de modifier son propre rôle plateforme.

Les actions Next.js ont un test de refus démontrant que l’appel s’arrête avant toute requête métier lorsque la permission manque.

## Procédure Preview

1. Vérifier que le projet Supabase lié est exclusivement `pgvvpqyjziyapbbkydmc` et que Vercel cible `elsatia-preview`.
2. Vérifier en lecture seule si `julien@elsatia.fr` existe dans Auth Preview, son UUID, son rôle plateforme actuel et ses éventuelles appartenances tenant.
3. Appliquer la migration `20260816000202_admin_v1_roles_plateforme.sql` à Supabase Preview uniquement.
4. Si le compte Auth n’existe pas, le créer dans Preview et faire définir/valider son mot de passe par le propriétaire sans jamais le reproduire dans un rapport.
5. Depuis un autre compte `total` contrôlé, appeler `plateforme_ajouter_admin('julien@elsatia.fr', ..., 'total')` afin de lier le rôle à son UUID Auth.
6. Déployer la branche sur Vercel Preview uniquement.
7. Tester connexion, panneau plateforme, entreprises, tarification TARIFS‑V2, facturation, support, absence de secrets, ouverture/fermeture d’une intervention tenant et déconnexion.
8. Vérifier la révocation en désactivant un compte fictif, puis confirmer le refus d’accès lors d’une nouvelle session.
9. Tester les rôles fictifs `lecture`, `support` et `facturation` directement sur les RPC sensibles.
10. Conserver les identifiants de comptes fictifs hors Git et supprimer/désactiver ceux qui ne sont plus nécessaires.

## Procédure future Production — non exécutée dans ADMIN‑V1

1. Geler le commit ADMIN‑V1 validé en Preview et contrôler une dernière fois le diff/migrations.
2. Sauvegarder la base et vérifier la cible Supabase Production avant toute commande.
3. Appliquer la migration ADMIN‑V1 à Production, sans migration TARIFS‑V2/Stripe non autorisée dans la même opération.
4. Créer `julien@elsatia.fr` dans Auth Production uniquement s’il n’existe pas, puis faire valider l’adresse et définir un mot de passe fort via le flux Auth.
5. Depuis une session administrative contrôlée, attribuer `total` par `plateforme_ajouter_admin(...)`. Ne jamais modifier les metadata pour accorder le rôle.
6. Vérifier côté serveur `plateforme_role_courant() = 'total'` et les permissions attendues.
7. Tester le panneau plateforme, la tarification en lecture, les actions autorisées sur une cible de test contrôlée, puis fermer toute session tenant.
8. Vérifier l’écriture des journaux et la déconnexion.
9. En cas d’incident, révoquer le rôle avec `plateforme_retirer_admin('julien@elsatia.fr')`, révoquer les sessions Auth et vérifier immédiatement le refus d’accès.

## État de validation et risques restants

- Local : migration appliquée, 40 tests ADMIN‑V1 et suite RLS complète validés.
- Application : TypeScript, lint, tests, recherche de secrets et build de production validés.
- Preview : à renseigner après audit humain de l’identité Auth, migration et tests fonctionnels.
- Production : aucune écriture ni promotion effectuée.
- Risque externe au lot : un reset complet d’une base vierge reste bloqué dans la migration TARIFS‑V2 précédente `20260816000201` lorsque les données seed ont déjà une période commençant le 16/08/2026. ADMIN‑V1 s’applique et se teste correctement sur la base locale existante ; la reproductibilité TARIFS‑V2 doit être corrigée séparément avant une reconstruction complète depuis zéro.
- Risque résiduel : la qualité opérationnelle des journaux (rétention, export, alertes et revue périodique) reste à cadrer dans ADMIN‑V2.
