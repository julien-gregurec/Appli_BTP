# ELSATIA Colors — intégration au contrat canonique V1

## Source unique

Le dépôt `elsatia-main`, au commit canonique `d770053bdbb902d5da2f6f1f0a2e3ca547c1172a`, est propriétaire du schéma multi-app. Le contrat de référence est `docs/architecture/ELSATIA_COMMON_ACCOUNT_CONTRACT_V1.md` dans ce dépôt canonique.

Colors consomme, sans les créer ni les modifier :

- `applications_elsatia` ;
- `roles_applications_elsatia` ;
- `acces_applications_entreprises` ;
- `habilitations_applications_utilisateurs` ;
- `historique_acces_applications` ;
- `contexte_application_courant()` ;
- `a_acces_application(uuid, text)` ;
- `applications_autorisees(uuid)`.

Les anciennes migrations centrales Colors 184, 185 et 186 sont abandonnées et absentes de la base canonique de cette branche. La fonction concurrente `est_administrateur_plateforme_global()` et l’équivalent d’appartenance `est_membre_organisation_elsatia()` sont abandonnés. Aucune migration centrale n’est créée par ce lot.

## Identité et accès

L’identité est `auth.uid()` du projet Supabase canonique. L’entreprise active est résolue par `contexte_application_courant()`. Pour un utilisateur normal, `a_acces_application(entreprise_id, 'colors')` exige simultanément : application active, membre actif, droit entreprise actif dans sa fenêtre temporelle, habilitation individuelle active dans sa fenêtre temporelle et rôle Colors actif.

Les rôles admis sont :

- `colors_admin_organisation` ;
- `colors_gestionnaire_stock` ;
- `colors_utilisateur_depot` ;
- `colors_consultation`.

Un administrateur Gestion Pro n’obtient aucun rôle Colors par héritage. Un utilisateur ne peut ni s’auto-habiliter ni écrire directement dans les tables d’entitlement. Les RPC ne prennent aucun identifiant d’utilisateur cible pour les consultations ordinaires.

## Administrateur plateforme et support

Colors ne teste jamais un email. Le statut plateforme vient de `est_plateforme_admin()`, dont la décision canonique est `plateforme_admins.utilisateur_id = auth.uid()` avec `actif = true`. Le rôle opérateur vient de `plateforme_role_courant()`.

L’accès au catalogue ne constitue pas un bypass des données métier locataires. Toute intervention support future devra utiliser `plateforme_acces_entreprises` et `est_acces_support_actif(entreprise_id)`. Aucun bypass Colors n’est ajouté.

## Login et refus

Le serveur distingue :

- Auth refusée : `Identifiants incorrects.` ;
- Auth acceptée mais Colors non autorisé : fermeture de cette session puis `Votre compte ELSATIA ne dispose pas d’un accès actif à Colors.` ;
- session SSO ou préexistante avec entreprise sans droit Colors actif : page `abonnement-requis` ;
- session SSO ou préexistante avec entreprise autorisée mais utilisateur non habilité : page `acces-refuse`.

La décision finale reste toujours la RPC canonique. La lecture du droit entreprise ne sert qu’à expliquer un refus, jamais à autoriser.

## Catalogue, URLs et sessions

Le sélecteur consomme `applications_autorisees()`. Il est dynamique et choisit `url_locale`, `url_preview` ou `url_production` selon `ELSATIA_APPLICATION_ENV`. Aucun fallback par code d’application n’est conservé.

La V1 partage les identifiants mais pas les cookies entre domaines. Le SSO silencieux reste un lot séparé ; aucun cookie parent ou jeton en URL n’est introduit.

## Propriété des tests

Les invariants SQL/RLS sont testés dans le dépôt canonique par :

- `supabase/tests/elsatia_multi_app_convergence_v1.test.sql` — 27 assertions ;
- `supabase/tests/platform_admin_uid_canonical_v1.test.sql` — 13 assertions ;
- `supabase/tests/colors_canonical_integration_v1.test.sql` — les quatre rôles Colors, vérifiés par la RPC réelle.

Colors teste son adaptation : appels RPC sans utilisateur cible, quatre rôles canoniques, refus serveur, diagnostic post-authentification, sélecteur dynamique, URL par environnement, clavier et absence des anciens symboles centraux.

## Limites

- aucune donnée métier Colors n’est ajoutée dans ce lot ;
- aucune modification Preview ou Production ;
- aucun SSO silencieux ;
- le mode support n’est pas utilisé tant que Colors ne possède pas de tables métier locataires ;
- toute évolution du contrat doit être proposée dans `elsatia-main`, jamais migrée unilatéralement ici.
