# ELSATIA Studio — guide de test utilisateur (Preview, V2)

Rapport technique : `docs/qualification/ELSATIA_STUDIO_PREVIEW_DEPLOYMENT_V2.md`

## 1. Lien

**https://studio-preview-elsatia.vercel.app**

(`https://studio-preview.elsatia.fr` fonctionnera dès que l'enregistrement DNS sera posé — rapport §15-D2.)

Le lien s'ouvre sans compte Vercel, depuis le Mac, un téléphone ou n'importe quel navigateur.
C'est une **Preview** : base Studio dédiée, vide, données de recette uniquement — n'y mettez aucune donnée client.

## 2. État aujourd'hui

| Étape | Disponible ? |
|---|---|
| Ouvrir la page d'entrée (Mac, téléphone, tablette) | **oui** |
| « Continuer avec mon compte ELSATIA » | **non** — la GP Preview (compte ELSATIA central) est arrêtée : vous verrez une erreur 500 sur `elsatia-preview.vercel.app`. Déblocage : rapport §15-D1 et §9 |
| Tout ce qui suit la connexion (étapes 3 à 9) | dès que la connexion fonctionne |
| Rendu / export vidéo | **non** (worker vidéo non hébergé) |
| E-mails d'invitation | **non** : le lien d'invitation s'affiche à l'écran, à copier |
| Fichiers de plus de 50 Mo | **non** (plan Supabase gratuit) |

## 3. Parcours (après déblocage de la connexion)

Comptes : uniquement des comptes de **recette** ELSATIA (GP Preview), présents dans la liste d'accès Studio.

1. **Ouvrir l'URL.** Une page « Studio. Vos histoires commencent ici. » s'affiche, avec un seul bouton. Aucun champ mot de passe, aucune inscription.
2. **Continuer avec mon compte ELSATIA.** Connexion sur ELSATIA si nécessaire, puis retour automatique dans Studio.
3. **Créer / ouvrir un workspace** (premier passage : écran d'accueil).
4. **Créer un projet** (Projets › Nouveau projet).
5. **Importer un média** factice (image JPEG/PNG ou courte vidéo MP4 < 50 Mo) dans le projet.
6. **Tester Studio** : éditeur / timeline, Brand Kit (logo), Membres (inviter un compte de recette : copier le lien affiché ; ouvrir le lien dans une autre session ; tester le rôle lecture seule).
7. **Partager** : créer un lien public sur un rendu (si un rendu existe — indisponible tant que le worker n'est pas hébergé), l'ouvrir en navigation privée, puis le révoquer et vérifier « Lien indisponible ».
8. **Mobile** : refaire 1, 2, 4, 5 sur téléphone (et tablette si possible), en Safari.
9. **Se déconnecter** (menu compte) : retour à la page d'entrée ; une page protégée (`/dashboard`) renvoie vers l'entrée.

## 4. Ce qu'il faut signaler

- toute page affichant des données d'un autre compte ;
- tout champ mot de passe ou formulaire d'inscription dans Studio ;
- tout lien vers `studio.elsatia.fr` ou une application de Production ;
- un lien public révoqué ou expiré qui s'ouvre encore ;
- un affichage cassé sur téléphone (débordement horizontal, bouton inaccessible).

## 5. Déjà vérifié automatiquement sur l'URL réelle

Page d'entrée (Chromium, WebKit/iPhone, mobile 390×844, tablette 820×1180) ; pages protégées → entrée ; inscription
refusée ; redirection ouverte neutralisée ; API anonyme refusée ; CSRF refusé ; échange de jeton sans état refusé ;
liens publics/invitations inventés « indisponible » ; aucune clé secrète dans le JavaScript ; base Studio : 836
contrôles de sécurité réussis.
