# Chapitre 9 — Messagerie, notifications et aide

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

Ce chapitre couvre trois parties distinctes de l'application : la messagerie interne (A), les notifications dans l'application et sur l'appareil (B), et l'aide/support (C).

### Objectif

Permettre d'échanger un message avec un collègue ou avec l'équipe d'un chantier, de comprendre les notifications reçues dans l'application et sur son appareil, de régler ses préférences de notification, et de savoir comment obtenir de l'aide.

### Utilisateurs concernés

- **A. Messagerie** : tout utilisateur disposant de la permission d'accès à la messagerie et relié à une fiche employé active.
- **B. Notifications** : tout utilisateur disposant d'un compte — chacun règle ses propres notifications, indépendamment de son poste.
- **C. Aide** : tout utilisateur.

### Permissions nécessaires

- `acces_messagerie` — accéder à l'écran Messagerie, démarrer et suivre ses propres conversations.
- `gerer_messagerie` — permission élargie : accéder à l'ensemble des conversations liées aux chantiers de l'entreprise, y compris celles dont l'utilisateur n'est pas membre de l'équipe.
- Notifications et Aide : aucune permission spécifique, accessibles à tout utilisateur disposant d'un compte actif.

### Procédure

**A. Messagerie**
1. Ouvrir Messagerie depuis le menu.
2. Démarrer une conversation directe avec un collègue, ou une conversation liée à un chantier — un seul fil existe par chantier, partagé avec l'équipe qui y est actuellement affectée.
3. Écrire son message et l'envoyer.
4. Joindre si besoin une à cinq photos ou vidéos au message (voir « Limites connues » pour les formats et le poids acceptés).
5. Consulter le fil : chaque conversation reste accessible tant que l'utilisateur y est autorisé (voir « Limites connues »).

**B. Notifications**
1. Les notifications récentes non lues (pointage à vérifier, nouvelle demande de congé, décision sur sa propre demande, note de frais à vérifier, changement de planning, sortie de la zone de chantier) apparaissent dans le tableau de bord, avec un lien vers l'élément concerné.
2. Depuis Paramètres > Notifications, activer les notifications push pour recevoir ces mêmes alertes directement sur l'appareil utilisé (navigateur ou téléphone), y compris lorsque l'application n'est pas ouverte.
3. Le navigateur ou le système demande une autorisation explicite lors de cette activation ; l'utilisateur doit l'accepter pour que les notifications push fonctionnent.
4. Choisir, parmi les types proposés (la liste dépend du poste), lesquels doivent être reçus sur cet appareil.
5. Répéter l'activation sur chaque appareil ou navigateur utilisé séparément — l'activation d'un appareil ne s'applique pas automatiquement aux autres.

**C. Aide**
1. Ouvrir Aide depuis le menu.
2. Décrire sa question ou son problème dans le formulaire prévu et l'envoyer.
3. Les réponses de l'équipe éditrice apparaissent dans le même fil, consultable à tout moment depuis cet écran.

### Résultat attendu

Un message a été échangé avec un collègue ou une équipe de chantier ; l'utilisateur comprend d'où viennent ses notifications et peut régler ce qu'il reçoit sur chacun de ses appareils ; une question a été transmise à l'équipe éditrice et sa réponse est consultable.

### Erreurs fréquentes

- Impossible de démarrer une conversation avec un collègue : vérifier que son compte est actif (un compte sorti ou suspendu ne peut plus être destinataire d'une nouvelle conversation directe).
- Conversation de chantier introuvable : elle n'apparaît que pour les personnes actuellement affectées à l'équipe du chantier, ou disposant de `gerer_messagerie` — ne pas conclure à un bug avant d'avoir vérifié l'affectation.
- Pièce jointe refusée dans la messagerie : vérifier le format (photo ou courte vidéo uniquement) et le poids (voir « Limites connues ») avant de conclure à un problème technique.
- « Autorisation refusée par le navigateur » lors de l'activation des notifications push : l'utilisateur a refusé ou n'a pas répondu à la demande d'autorisation du navigateur — il doit l'accepter à nouveau depuis les réglages du navigateur ou du téléphone, l'application ne peut pas forcer cette autorisation.
- « Les notifications push ne sont pas prises en charge sur ce navigateur » : certains navigateurs ou configurations ne supportent pas les notifications push — ce n'est pas un défaut de l'application.
- Message envoyé depuis Aide sans réponse immédiate : la réponse est apportée par une personne de l'équipe éditrice, pas par un système automatique — un délai est normal.

### Limites connues

- **Un utilisateur ne voit que les conversations auxquelles il est autorisé** : ses conversations directes, les fils de chantier de l'équipe à laquelle il est actuellement affecté, ou l'ensemble des conversations s'il dispose de `gerer_messagerie`. Une affectation terminée retire l'accès au fil du chantier correspondant.
- **Les documents et médias échangés en messagerie restent isolés par entreprise.** Leur consultation ne passe jamais par un lien public permanent : chaque accès est vérifié et un lien temporaire est généré à la demande, valable quelques minutes seulement.
- **Un utilisateur retiré (compte suspendu ou sorti) ne doit plus pouvoir générer de nouvel accès** aux documents et médias déjà échangés dans les conversations dont il faisait partie — la vérification des droits s'applique à chaque nouvelle demande d'accès, pas seulement à l'ouverture initiale de la conversation.
- **Ne pas transmettre de données sensibles inutilement dans la messagerie** (informations personnelles, financières ou médicales, identifiants) — la messagerie reste un canal interne à l'entreprise, mais la prudence sur ce qui y est écrit reste une bonne pratique à rappeler à l'utilisateur.
- Pièces jointes de la messagerie : jusqu'à cinq photos ou vidéos par message, chacune limitée à 20 Mo ; formats acceptés : JPEG, PNG, WebP, HEIC/HEIF pour les photos, MP4, QuickTime (MOV), WebM pour les vidéos. Ces formats sont propres à la messagerie et distincts des formats acceptés par l'assistant IA (voir chapitre 8).
- **Les notifications push dépendent de l'autorisation accordée par le navigateur ou le téléphone.** Sans cette autorisation, aucune notification push ne peut être reçue sur l'appareil concerné.
- **Une notification peut être retardée ou ne pas être délivrée**, selon l'appareil, son état (mode veille, batterie, navigateur fermé) ou la qualité de connexion au moment de l'envoi — aucune garantie de délai ou de livraison ne doit être annoncée à l'utilisateur.
- L'affichage des messages et des notifications dans l'application repose sur le rechargement ou la navigation de la page ; aucun mécanisme de mise à jour instantanée sans action de l'utilisateur n'a été vérifié dans ce lot.

### Fonctions non présentées comme finalisées dans ce chapitre

- **Support temps réel garanti** : aucun mécanisme de mise à jour instantanée des conversations (sans recharger la page) n'a été identifié dans le code lu — à ne jamais promettre tant que ce n'est pas vérifié.
- **Accusé de lecture** : une colonne technique existe en base pour marquer un message comme lu, mais aucune fonctionnalité visible pour l'utilisateur (indicateur « lu », marquage manuel) n'a été trouvée dans le code lu — ne pas présenter d'accusé de lecture comme une fonctionnalité disponible.
- **Notifications sur tous les appareils sans exception** : la prise en charge dépend du navigateur et du système de chaque appareil ; certains ne supportent pas les notifications push (voir « Erreurs fréquentes »).
- **Automatisations externes liées à la messagerie ou aux notifications** (intégrations avec des outils tiers, envoi automatique vers d'autres canaux) : aucune n'a été identifiée dans le code lu et aucune ne doit être annoncée sans avoir été testée.

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`) et lecture ciblée de `src/app/(app)/messagerie/page.tsx`, `src/app/actions/messagerie.ts`, `src/app/api/messagerie/pieces-jointes/*/route.ts`, `src/lib/messagerie-medias.ts`, `supabase/migrations/20260717000096_collaboration_appels_offres_doe.sql` (fonction `peut_acceder_conversation`, politiques RLS) et `supabase/migrations/20260728000181_medias_messagerie_chantiers.sql`. Côté notifications : `src/components/PushNotificationsSettings.tsx`, `src/app/actions/push.ts`, `src/lib/notifications-registre.ts`, et la requête de notifications non lues dans `src/app/(app)/dashboard/page.tsx`. Côté aide : `src/app/(app)/aide/page.tsx`, `src/app/actions/support.ts`. Aucun de ces parcours n'a été vérifié en exécution réelle dans ce lot (lecture de code uniquement) — validation manuelle recommandée avant publication, en particulier pour la réception effective des notifications push sur différents appareils.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, vérifié par inventaire statique et lecture ciblée du code (RLS comprise pour l'isolation des conversations et des pièces jointes). Validation manuelle encore requise, en particulier pour : la réception effective des notifications push sur différents appareils et navigateurs, le comportement en cas de perte de connexion pendant l'envoi d'un message avec pièce jointe, et la confirmation qu'aucun mécanisme d'accusé de lecture ou de mise à jour temps réel n'a été ajouté depuis cette lecture.
