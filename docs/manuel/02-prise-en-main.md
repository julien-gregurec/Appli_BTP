# Chapitre 2 — Prise en main

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

### Objectif

Permettre à un nouvel utilisateur de se connecter à Liria Gestion Pro et de comprendre les premiers éléments du tableau de bord.

### Personnes concernées

Tout utilisateur disposant d'un compte actif dans une entreprise cliente.

### Permissions nécessaires

Aucune permission spécifique pour la connexion elle-même. Le contenu visible sur le tableau de bord ensuite dépend des permissions attribuées au poste de l'utilisateur (voir chapitre 19, non encore rédigé).

### Procédure

1. Ouvrir la page de connexion (`/login`).
2. Saisir l'adresse e-mail et le mot de passe du compte.
3. En cas de mot de passe oublié, utiliser le lien « Mot de passe oublié ? » présent sur l'écran de connexion, qui mène à `/mot-de-passe-oublie`.
4. Valider le formulaire. Un message d'erreur s'affiche directement sur la page si les identifiants sont incorrects.
5. Une fois connecté, l'utilisateur arrive sur le tableau de bord (`/dashboard`), qui présente une vue d'ensemble filtrée selon ses permissions.
6. Si l'entreprise n'a pas encore terminé sa configuration initiale, un parcours d'accueil (`/onboarding`) peut être proposé avant l'accès au tableau de bord — ce parcours n'est pas détaillé dans ce chapitre et sera couvert séparément si nécessaire.

### Résultat attendu

L'utilisateur accède au tableau de bord de son entreprise, avec les modules et indicateurs correspondant à ses permissions.

### Erreurs fréquentes

- Identifiants incorrects : message d'erreur affiché directement sur `/login`, pas de procédure de contournement à documenter.
- Compte non encore activé ou en attente de validation : redirection possible vers un écran d'attente (`/en-attente`) — comportement exact non vérifié en exécution réelle dans ce lot, à confirmer avant publication.

### Limites connues

Le contenu exact du tableau de bord (widgets affichés, indicateurs) varie selon l'offre souscrite et les permissions du poste ; ce chapitre décrit le principe, pas chaque variante possible.

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`) et lecture ciblée de `src/app/login/page.tsx`. Le comportement de l'écran `/en-attente` n'a pas été lu en détail dans ce lot — vérification manuelle requise avant publication.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, non vérifié en exécution réelle. Le point sur `/en-attente` nécessite une vérification manuelle avant publication.
