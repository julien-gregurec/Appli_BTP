# Suppression des données et des comptes connectés

_Dernière mise à jour : 03/10/2026_

Cette page explique quelles données ELSATIA conserve lorsqu'un compte Facebook, Instagram ou LinkedIn est connecté à ses outils, et comment en demander la suppression. Elle sert d'**instructions de suppression des données** pour les applications Meta (Facebook, Instagram) et LinkedIn d'ELSATIA.

ELSATIA est édité par **Julien GREGUREC, entrepreneur individuel, exerçant sous le nom commercial ELSATIA**.

## 1. À quoi servent ces connexions

ELSATIA Social est un outil **interne** : il gère uniquement les comptes officiels d'ELSATIA (Page Facebook, compte Instagram professionnel et Page Entreprise LinkedIn ELSATIA). Il n'est pas proposé aux clients d'ELSATIA et ne se connecte à aucun compte personnel pour publier.

Aucune connexion Facebook, Instagram ou LinkedIn n'est utilisée pour vous identifier dans ELSATIA Gestion Pro ou dans les autres applications ELSATIA.

## 2. Données réellement conservées

### Si vous êtes membre de l'équipe ELSATIA et avez connecté un compte

| Donnée | Détail |
|---|---|
| Jetons d'accès | Jetons OAuth de la Page ou de l'organisation, **chiffrés** (AES-256-GCM, clé conservée hors de la base). Jamais affichés ni transmis au navigateur. |
| Compte connecté | Nom et identifiant de la Page ou de l'organisation, nom d'utilisateur Instagram, permissions accordées, dates d'expiration, dernier diagnostic. |
| Connexion en cours | Résultat chiffré de l'autorisation, conservé **15 minutes au plus** le temps de choisir la Page, puis supprimé. |
| Journal | Actions effectuées (connexion, publication, révocation), avec la date et l'adresse e-mail de la personne de l'équipe qui a agi. |

### Si vous avez interagi avec une page ELSATIA

Lorsque vous commentez une publication ou écrivez un message privé à une page ELSATIA, l'outil peut conserver, pour y répondre :

| Donnée | Détail |
|---|---|
| Commentaire ou message | Texte, date, publication concernée. |
| Auteur | Nom affiché et identifiant fourni par la plateforme (identifiant propre à la page pour Messenger et Instagram). |
| Réponse | Brouillon et réponse envoyée par l'équipe ELSATIA. |
| Notification technique | Contenu de la notification envoyée par Meta ou LinkedIn (webhook), utilisé pour éviter les doublons. |

ELSATIA ne collecte **pas** votre adresse e-mail, votre mot de passe, votre liste d'amis, vos publications personnelles ni vos données de profil au-delà de ces éléments. Aucune de ces données n'est vendue ni utilisée à des fins publicitaires.

### Durées de conservation

Aucune durée automatique ne s'applique encore aux commentaires, messages et notifications : ils sont conservés tant qu'ils sont utiles au suivi des échanges avec ELSATIA, puis supprimés. Ils sont supprimés **sur simple demande**, selon la procédure ci-dessous. Les statistiques des publications ELSATIA (vues, réactions, partages) sont des totaux et ne contiennent pas de données personnelles.

## 3. Demander la suppression de vos données

Envoyez un e-mail à **[EMAIL_SUPPORT]** avec pour objet « Suppression des données — réseaux sociaux ». Indiquez :

- le réseau concerné (Facebook, Instagram ou LinkedIn) ;
- le nom affiché sur votre compte ;
- si possible, la date approximative ou le lien du commentaire ou du message.

Nous supprimons alors de nos systèmes vos commentaires, messages, réponses associées et notifications techniques. Nous vous confirmons la suppression par e-mail **dans un délai d'un mois au plus** (article 12 du RGPD). Nous pouvons vous demander une information complémentaire si la demande ne permet pas de retrouver les données.

La suppression dans les outils ELSATIA ne supprime pas un commentaire publié sur Facebook, Instagram ou LinkedIn : vous pouvez le supprimer vous-même sur la plateforme à tout moment.

## 4. Retirer l'accès d'ELSATIA à un compte

- **Facebook et Instagram** : Paramètres et confidentialité › Paramètres › Intégrations professionnelles (ou « Apps et sites web »), puis retirer l'application ELSATIA. Le jeton cesse aussitôt de fonctionner ; l'outil le constate à sa vérification suivante et marque le compte « à reconnecter ». Pour supprimer aussi les données conservées, suivre la procédure du § 3.
- **LinkedIn** : Préférences › Confidentialité des données › Autres applications, puis retirer l'application ELSATIA. Même effet que ci-dessus.
- **Équipe ELSATIA** : la révocation depuis l'outil (Comptes › Révoquer) supprime immédiatement les jetons de nos systèmes et demande leur révocation à la plateforme.

## 5. Vos droits

Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition et de limitation. Pour les exercer : **[EMAIL_SUPPORT]**. Vous pouvez aussi adresser une réclamation à la CNIL (www.cnil.fr).

Voir aussi la [politique de confidentialité](/confidentialite).
