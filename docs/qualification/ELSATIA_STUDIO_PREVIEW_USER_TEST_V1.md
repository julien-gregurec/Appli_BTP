# ELSATIA Studio — Preview dédiée : guide de test utilisateur (V1)

Date : 2026-09-30 · Rapport technique : `docs/qualification/ELSATIA_STUDIO_PREVIEW_DEPLOYMENT_V1.md`

> **État : STUDIO PREVIEW BLOCKED — aucune URL de test n'existe encore.**
> Le déploiement distant n'a pas pu être fait depuis l'environnement de la mission : aucun accès
> réseau à Vercel ni à Supabase, aucun identifiant, et aucun projet Supabase Studio Preview (limite
> de 2 projets de l'organisation). Ce guide est prêt pour le jour où l'URL existera ; les parcours
> ci-dessous sont **tous vérifiés localement** sur la pile réelle dédiée (23/23 scénarios Playwright).

## 1. URL

| | Valeur |
|---|---|
| URL cible (préférée) | `https://studio-preview.elsatia.fr` — **pas encore configurée** |
| URL de repli | `https://<déploiement>.vercel.app` du projet Vercel `elsatia-studio-preview` — **pas encore déployée** |
| À ne jamais utiliser | `https://studio.elsatia.fr` (domaine de Production, fermé) |

L'opérateur renseigne l'URL réelle ici après le déploiement (rapport technique, §16).

## 2. Se connecter

1. Ouvrir l'URL Studio Preview → page « Vos histoires commencent ici ».
2. Cliquer **« Continuer avec mon compte ELSATIA »**. Il n'y a **aucun** champ mot de passe Studio et
   **aucune** inscription Studio : `/signup` renvoie vers la connexion.
3. Vous êtes redirigé vers l'identité ELSATIA **Preview** (GP Preview) : se connecter avec un
   **compte de recette** (jamais un compte client réel).
4. Retour automatique dans Studio. Premier passage : « Ouvrir mon Studio personnel ».

Comptes de recette à créer sur la GP **Preview** (identifiants communiqués hors dépôt, sans mot de passe ici) :

| Rôle | Adresse (modèle) | Usage |
|---|---|---|
| Propriétaire | `studio-owner@<domaine de recette>` | crée l'espace, les projets, invite |
| Membre | `studio-member@<domaine de recette>` | ajouté comme éditeur/lecteur |
| Invité | `studio-invited@<domaine de recette>` | reçoit une invitation (lien) |
| Révoqué | `studio-revoked@<domaine de recette>` | désactivé côté ELSATIA pendant le test |

Le domaine de recette doit figurer dans `EMAIL_PREVIEW_ALLOWLIST` si l'envoi d'e-mails est activé.

## 3. Parcours à tester

| # | Parcours | Attendu |
|---|---|---|
| P1 | Connexion ELSATIA (desktop, mobile, tablette) | aucune saisie de mot de passe Studio ; retour sur Studio |
| P2 | Espace personnel, renommage (Réglages), espace professionnel | noms à jour, sélecteur « Espace actif » |
| P3 | Projet : créer, ouvrir, modifier | page projet, éditeur |
| P4 | Médias : importer photo (JPEG/PNG) et vidéo (MP4) | vignette, lecture ; suppression → corbeille |
| P5 | Brand Kit : couleurs, logo | enregistré, visible dans le rendu |
| P6 | Rendu / export vidéo | **seulement si le worker Preview est déployé** (voir §5) |
| P7 | Lien public : créer, ouvrir en navigation privée, révoquer | visiteur anonyme voit la vidéo ; après révocation « Lien indisponible » |
| P8 | Membres : ajouter par identifiant, rôle lecteur, retirer | lecteur lit mais ne modifie pas ; retrait = accès perdu |
| P9 | Invitation : créer (lien affiché une fois), ouvrir avec le bon compte, avec un autre compte | bon compte accepté ; autre adresse refusée ; lien à usage unique |
| P10 | Lecture seule : l'opérateur retire le droit Studio du compte | lecture OK, toute écriture refusée avec message « lecture seule » |
| P11 | Révocation : l'opérateur désactive le compte « révoqué » | session Studio fermée ; reconnexion refusée |
| P12 | Déconnexion | retour à la connexion ; pages protégées refusées |
| P13 | Mobile / tablette | aucune page ne déborde horizontalement ; bouton Déconnexion accessible |

## 4. Fonctions disponibles (Preview, sous réserve du déploiement)

Connexion ELSATIA (B + I1), espaces, projets, membres, invitations par lien, médias (upload tus,
URL signées, suppression), Brand Kit, éditeur/timeline, liens publics (révocables, expirables),
lecture seule, révocation, déconnexion, suppression de compte (côté ELSATIA) → demande
d'effacement Studio (exécution **désactivée** : mode `off`, aucune durée légale choisie).

## 5. Fonctions non disponibles ou limitées

| Fonction | État | Raison |
|---|---|---|
| Rendu / export vidéo | **BLOCKED** tant que le worker Preview n'est pas hébergé | `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` + Redis Preview |
| Analyse IA des médias | désactivée (`STUDIO_AI_ANALYSIS=0`) | worker d'analyse non déployé |
| Invitations par e-mail | lien à copier (aucun e-mail) | `DECISION_REQUIRED:STUDIO-MAIL-SUBPROCESSOR` ; si activé : allowlist Preview obligatoire — `REMOTE_PROOF_REQUIRED` |
| Effacement RGPD exécuté | non (mode `off`) | durée légale = décision juridique |
| Réconciliation / effacement planifiés | manuels | les crons Vercel ne s'exécutent pas sur une Preview : planificateur externe à décider |
| Safari réel (iOS/macOS) | non testé | seul Chromium (émulation mobile/tablette) est disponible sur le banc |
| `/api/health` | absente | lot Incident Response non porté dans ce train (hors mission) |

## 6. Signaler un bug

Pour chaque anomalie, noter :

1. l'URL exacte et l'heure (UTC) ;
2. l'appareil / navigateur (et « mobile », « tablette » ou « desktop ») ;
3. le compte de recette utilisé (adresse, **jamais** le mot de passe) ;
4. les étapes, le résultat attendu, le résultat obtenu, une capture d'écran ;
5. le code affiché dans l'URL de connexion s'il y en a un (ex. `error_code=REPLAY`).

Déposer le rapport comme issue GitHub sur `julien-gregurec/appli_btp` avec l'étiquette `studio-preview`
(ou la transmettre à l'opérateur). Ne joindre **aucune donnée client réelle**.
