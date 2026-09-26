# ELSATIA Gestion Pro — interface multi-app V1

## Périmètre

Ce lot expose dans Gestion Pro les capacités du socle multi-app canonique existant. Il ajoute une seule migration centrale de lecture privilégiée et ne modifie ni Stripe, ni les remises, ni Colors.

Les nouvelles surfaces sont :

- `/plateforme/applications` : catalogue central dynamique, compteurs d’accès actifs, URL de l’environnement courant et historique en lecture seule ;
- `/plateforme/entreprises/[entrepriseId]/applications` : activation ou désactivation d’une application pour une entreprise, puis habilitation, retrait ou changement du rôle applicatif d’un utilisateur ;
- le sélecteur « Applications ELSATIA » de la barre latérale Gestion Pro.

## Source de vérité et séparation des rôles

Le catalogue vient exclusivement de `applications_elsatia`. Les rôles proposés viennent de `roles_applications_elsatia` et sont filtrés par application. L’interface ne contient donc aucune liste fermée d’applications et accepte une application future sans changement de composant.

Trois notions restent séparées :

1. les rôles métier d’une entreprise Gestion Pro ;
2. les rôles d’accès propres à une application (`gestion_pro_*`, `colors_*`) ;
3. l’administration globale de la plateforme (`administrateur_plateforme_global`).

Une habilitation utilisateur ne suffit pas : l’entreprise doit aussi disposer d’un accès actif, l’utilisateur doit être membre actif, les deux fenêtres de validité doivent être courantes et le rôle applicatif doit être actif.

## Sécurité des opérations d’administration

Chaque nouvelle page et chaque Server Action exige une réponse positive de la RPC canonique `est_plateforme_admin()`. Aucun email privilégié et aucun mode de démonstration ne participe à cette décision.

La migration `20260827000236_plateforme_lire_entreprise_membres_v1.sql` ajoute `plateforme_lire_entreprise_membres(uuid)`. Cette fonction `SECURITY DEFINER`, `STABLE` et sans SQL dynamique vérifie `est_plateforme_admin()` avant de retourner une projection minimale : identifiant, nom et référence de l’entreprise, puis identifiant, nom, prénom, statut et habilitations applicatives de ses membres. Elle n’expose ni email Auth, ni metadata, ni token, ni secret. Une entreprise inexistante produit un résultat vide.

`EXECUTE` est révoqué à `public`, `anon` et `authenticated`, puis réaccordé uniquement à `authenticated`; la garde interne refuse tout utilisateur qui n’est pas administrateur plateforme. Les RLS existantes ne sont pas modifiées. Les accès entreprise et les rôles applicatifs continuent d’être lus via leurs tables multi-app, dont les politiques autorisent déjà précisément l’administration plateforme.

Les Server Actions ne modifient jamais directement les tables d’accès. Elles appellent uniquement :

- `plateforme_activer_application_entreprise` ;
- `plateforme_desactiver_application_entreprise` ;
- `plateforme_habiliter_utilisateur_application` ;
- `plateforme_retirer_habilitation_application`.

Ces RPC contrôlent à nouveau l’administration plateforme et alimentent `historique_acces_applications`. Une désactivation change la décision d’accès mais ne supprime ni données, ni utilisateurs, ni historique.

## Sélecteur Gestion Pro

Le sélecteur consomme uniquement `applications_autorisees(entreprise_id)`. Les destinations et leurs URL sont donc calculées côté serveur à partir des droits réels et du catalogue. `ELSATIA_APPLICATION_ENV` sélectionne `local`, `preview` ou `production` ; toute autre valeur est ramenée à `local`.

La navigation utilise un lien normal dans le même onglet. Aucun cookie inter-application, jeton maison ou mécanisme SSO n’est introduit. Le menu prend en charge la souris, `ArrowDown`, `ArrowUp`, `Escape`, la restitution du focus, `aria-expanded`, `aria-controls` et les rôles de menu.

## Garanties conservées

- RLS et fonctions de décision du socle canonique inchangées ;
- aucun auto-octroi de droits ;
- aucune écriture cross-tenant par l’interface ;
- aucun contournement support ;
- une seule migration de RPC en lecture, sans modification de table ou de RLS ;
- aucun changement Colors, Stripe ou remises.

## Validation attendue

Le lot comprend au minimum 20 scénarios unitaires portant sur l’environnement, les URL, l’application courante, l’ajout dynamique d’une future application, les fenêtres de validité, les rôles et le contrat de sécurité des Server Actions. Ils complètent la suite pgTAP canonique `elsatia_multi_app_convergence_v1.test.sql`, qui vérifie les décisions d’accès, l’anti-self-grant, l’isolation inter-entreprises et l’administration plateforme.
