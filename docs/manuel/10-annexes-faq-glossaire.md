# Chapitre 10 — Annexes : FAQ, glossaire et aide

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

Ce chapitre rassemble, en un seul endroit, les réponses aux questions les plus fréquentes, un glossaire des termes utilisés dans le manuel, un rappel des erreurs et limites déjà décrites chapitre par chapitre, la procédure pour demander de l'aide, la liste des fonctions bêta ou sous conditions, et deux rappels transversaux (confidentialité, nom commercial provisoire).

### Objectif

Permettre de retrouver rapidement une réponse à une question courante, de comprendre un terme utilisé ailleurs dans le manuel, et de savoir comment demander de l'aide en cas de besoin — sans avoir à relire chaque chapitre en entier.

### Utilisateurs concernés

Tout utilisateur de l'application, quel que soit son poste.

### Permissions nécessaires

Aucune. Ce chapitre est une référence de consultation ; les permissions nécessaires pour chaque action mentionnée sont rappelées chapitre par chapitre et, pour certaines réponses ci-dessous, directement dans la réponse concernée.

### FAQ — première prise en main

**Je n'arrive pas à me connecter.**
Vérifiez d'abord votre identifiant et votre mot de passe (utilisez « Mot de passe oublié » si besoin). Si le message indique que vous avez effectué trop de tentatives, patientez quelques minutes avant de réessayer sans multiplier les essais (voir chapitre 2). Si le problème persiste, contactez la personne qui gère les comptes dans votre entreprise, ou passez par Aide (voir plus bas dans ce chapitre).

**Mon compte est en attente.**
Un compte peut être en attente le temps que l'entreprise termine sa configuration ou que votre invitation soit validée. Ce n'est pas une erreur de votre part : rapprochez-vous du dirigeant ou de la personne qui gère les comptes dans votre entreprise pour connaître l'avancement.

**Je ne vois pas un module.**
Le menu et les écrans visibles dépendent des droits de votre poste. Un module absent n'est pas forcément un bug : demandez à la personne qui gère les accès (Paramètres > Accès et rôles) de vérifier votre poste et les droits qui lui sont attribués.

**Je ne peux pas modifier une information.**
Deux droits distincts existent souvent pour un même module : un droit de consultation et un droit de gestion (modification). Voir une information ne signifie pas pouvoir la modifier. Demandez à la personne responsable des accès de vérifier lequel des deux droits vous manque.

**Mon document ne se télécharge pas.**
Les documents de l'application (justificatifs, pièces jointes, exports) ne sont jamais accessibles par un lien public permanent : chaque accès est vérifié au moment de la demande. Un échec de téléchargement peut donc venir d'un droit manquant plutôt que d'un fichier corrompu — vérifiez d'abord vos droits sur le document concerné, puis réessayez ; si le problème persiste, contactez la personne responsable ou passez par Aide.

**Mon pointage n'apparaît pas.**
Vérifiez d'abord que vous étiez bien affecté au chantier concerné ce jour-là : un pointage ne peut se rattacher qu'à une affectation existante. Si l'affectation est correcte et que le pointage manque toujours, signalez-le à la personne qui valide les pointages plutôt que de le ressaisir sans vérification.

**Une notification n'est pas reçue.**
Les notifications push dépendent d'une autorisation acceptée dans le navigateur ou le téléphone, et de la prise en charge de cette fonction par l'appareil utilisé. Elles peuvent aussi être retardées selon l'état de l'appareil au moment de l'envoi (voir chapitre 9). Vérifiez d'abord que les notifications sont activées sur l'appareil concerné (Paramètres > Notifications) avant de conclure à un problème.

**L'assistant IA refuse mon fichier.**
L'assistant accepte une photo (JPEG, PNG, GIF, WebP) ou un PDF, jusqu'à 6 Mo (voir chapitre 8). Un fichier plus lourd, dans un autre format, ou un texte de demande trop long, sera refusé avec un message explicite. Ce refus est une protection normale, pas une panne.

**L'application indique trop de requêtes.**
Certaines actions répétées trop rapidement (connexion, appels à l'assistant IA, certains référentiels) peuvent être temporairement bloquées par une protection contre les usages abusifs. Patientez quelques minutes avant de réessayer plutôt que d'insister ou de multiplier les tentatives — ce n'est pas une panne de l'application.

**Comment changer les permissions d'un salarié ?**
Depuis Paramètres > Accès et rôles, une personne disposant du droit de gestion des utilisateurs peut consulter et ajuster la matrice des droits par poste, qui détermine précisément ce que chaque poste peut voir et faire dans l'application (voir chapitre 8).

**Comment contacter le support ?**
Depuis l'écran Aide, décrivez votre question ou votre problème dans le formulaire prévu. Une personne de l'équipe éditrice vous répond dans le même fil de discussion, consultable à tout moment (voir chapitre 9).

### Glossaire

*Termes utilisés dans l'application, dans l'ordre alphabétique.*

- **Abonnement** : formule payante souscrite par l'entreprise pour utiliser l'application, avec une offre et une périodicité (mensuelle ou annuelle) données.
- **Affectation** : lien entre un salarié et un chantier pour une période donnée, à l'origine de ce qui apparaît dans son planning et de ce sur quoi il peut pointer.
- **Chantier** : dossier regroupant les informations d'un lieu de travail (client, adresse, équipe affectée, planning, pointages, suivi financier).
- **Commande (fournisseur)** : demande d'achat de matériel ou de matériaux passée auprès d'un fournisseur, suivie jusqu'à sa réception.
- **Devis** : proposition commerciale chiffrée envoyée à un client avant réalisation des travaux ; peut être transformé en facture une fois accepté.
- **Entreprise (compte)** : espace de travail propre à une société cliente ; les données d'une entreprise ne sont jamais visibles par une autre.
- **Facture (standard)** : document définitif réclamant paiement au client, distinct de la facturation avancée (situations, acomptes, avoirs) non incluse dans cette version.
- **Justificatif** : pièce jointe (photo ou PDF) associée à une note de frais, dont l'accès reste toujours contrôlé.
- **Matrice des droits par poste** : tableau qui définit, pour chaque poste, les permissions activées ou non — c'est le réglage central de qui peut faire quoi dans l'application.
- **Note de frais** : dépense avancée par un salarié, saisie avec un justificatif, puis validée par une personne habilitée.
- **Offre IA à paliers** : option d'abonnement donnant accès à un nombre d'appels quotidiens à l'assistant IA selon le palier choisi.
- **Palier** : niveau d'une offre (par exemple, un nombre d'appels IA inclus par jour) associé à l'abonnement de l'entreprise.
- **Permission** : droit précis (par exemple, consulter ou gérer un module) attribué à un poste, jamais à une personne directement.
- **Planning** : vue d'ensemble des affectations des salariés aux chantiers sur une période donnée.
- **Pointage** : enregistrement des heures réellement travaillées par un salarié sur un chantier, avec arrivée et départ.
- **Poste** : fonction attribuée à un salarié dans l'entreprise, à laquelle est associée la matrice des droits.
- **Prestation** : ligne de service ou de fourniture, préenregistrée ou saisie librement, utilisée dans un devis ou une facture.
- **Rentabilité** : suivi des coûts et des recettes d'un chantier pour évaluer sa marge.
- **Stock** : suivi des quantités de matériel ou de matériaux disponibles, avec seuils d'alerte.
- **Suivi de zone (chantier)** : vérification que le salarié se trouve bien à proximité du chantier au moment de pointer, active uniquement lorsque l'application est ouverte.

*Termes du métier BTP, cités dans ce manuel mais dont la fonction correspondante n'est pas incluse dans cette version — voir `PERIMETRE-V1.md` :*

- **Acompte / Situation de travaux / DGD (Décompte Général et Définitif)** : mécanismes de facturation avancée du BTP par étapes ou paiements intermédiaires. Non inclus dans la facturation standard décrite au chapitre 3.
- **Avoir** : document correctif annulant tout ou partie d'une facture déjà émise. Non inclus dans la facturation standard décrite au chapitre 3.
- **Sous-traitant** : entreprise tierce intervenant sur un chantier pour le compte de l'entreprise cliente. Un module dédié existe dans le code mais n'est pas inclus dans le périmètre commercial actuel.

### Erreurs fréquentes (rappel transversal)

Cette section ne remplace pas les sections « Erreurs fréquentes » de chaque chapitre, plus précises : elle rappelle seulement les cas qui reviennent le plus souvent, tous modules confondus.

- Un écran ou un bouton attendu est absent : à vérifier en premier lieu du côté des permissions du poste (Paramètres > Accès et rôles), avant de conclure à un défaut de l'application.
- Un message signale un blocage temporaire pour usage répété : toujours patienter quelques minutes plutôt que de réessayer immédiatement — voir la FAQ ci-dessus.
- Un document ou un média refuse de s'afficher ou de se télécharger : vérifier les droits d'accès avant de conclure à un fichier corrompu.

### Limites connues (rappel transversal)

- Ce manuel décrit le fonctionnement observé dans le code et, quand c'est précisé, vérifié par des tests automatisés ; il ne garantit pas un comportement identique dans toutes les configurations d'entreprise, de navigateur ou d'appareil.
- Les fonctions listées « bêta », « disponible sous conditions », « en préparation » ou « dépendante d'un prestataire externe » ne doivent jamais être présentées comme pleinement opérationnelles (voir section suivante).
- Certaines limites décrites dans ce manuel (notamment les protections contre les usages abusifs) sont confirmées sur la branche de commercialisation (`release/commercialisation-v1`) et pas encore nécessairement présentes partout ailleurs — voir la mention en tête de chaque fichier.

### Procédure pour demander de l'aide

1. Ouvrir Aide depuis le menu de l'application.
2. Décrire la question ou le problème rencontré, avec le plus de détails utiles (écran concerné, action tentée, message affiché).
3. Envoyer le message : il est transmis à l'équipe éditrice.
4. Consulter la réponse dans le même fil, à tout moment depuis l'écran Aide.
5. Pour un problème lié à ses propres droits ou à son compte (accès, permissions, activation), se rapprocher d'abord de la personne de l'entreprise qui gère les comptes, avant de solliciter le support éditeur.

### Fonctions bêta ou sous conditions

Ces fonctions existent dans l'application mais ne font l'objet d'aucune procédure détaillée dans ce manuel tant qu'elles n'ont pas été validées spécifiquement (liste complète et justifications : `PERIMETRE-V1.md`) :

| Fonction | Statut |
|---|---|
| Boutique | Disponible sous conditions |
| Facturation automatique de l'Option IA | Disponible sous conditions |
| Banque (connexion bancaire) | Dépendante d'un prestataire externe |
| Virements fournisseurs | Dépendante d'un prestataire externe |
| Virements de salaires | Dépendante d'un prestataire externe |
| CRM | Non incluse dans la version commerciale actuelle |
| Facturation avancée (situations, acomptes, avoirs, DGD) | Non incluse dans la version commerciale actuelle |
| Ouvrages et métrés | Non incluse dans la version commerciale actuelle |
| Interventions | Non incluse dans la version commerciale actuelle |
| Sous-traitants | Non incluse dans la version commerciale actuelle |
| Appels d'offres | Non incluse dans la version commerciale actuelle |
| Connecteurs fournisseurs | Non incluse dans la version commerciale actuelle |
| Paie (virement des salaires) | Non incluse dans la version commerciale actuelle |
| Grands et petits déplacements | Non incluse dans la version commerciale actuelle |

### Rappel — confidentialité

Les données de chaque entreprise sont isolées et ne sont jamais visibles par une autre entreprise cliente. Cela ne dispense pas de la prudence habituelle : ne transmettez pas de données sensibles (identifiants, informations financières ou personnelles) sans nécessité réelle, que ce soit dans la messagerie interne (chapitre 9) ou à l'assistant IA (chapitre 8), même si l'isolation technique est assurée.

### Rappel — nom commercial provisoire

Le nom commercial de l'application utilisé dans ce manuel est provisoire. Il devra être remplacé dans l'ensemble du manuel avant toute publication — voir la note en tête de `README.md`.

### Résultat attendu

L'utilisateur retrouve une réponse à une question courante ou la définition d'un terme sans relire un chapitre entier, sait comment demander de l'aide, et connaît les fonctions qui ne sont volontairement pas détaillées dans ce manuel.

### Source de validation

Synthèse des chapitres 1 à 9 de ce manuel et de `PERIMETRE-V1.md`, complétée par une lecture ciblée de `src/app/(app)/aide/page.tsx` et `src/app/actions/support.ts` pour la procédure d'aide. Les réponses de la FAQ reprennent des constats déjà sourcés chapitre par chapitre ; aucune vérification en exécution réelle n'a été ajoutée spécifiquement pour ce chapitre.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, vérifié par cohérence avec les chapitres 1 à 9 déjà validés et par lecture ciblée du code pour la procédure d'aide. Validation manuelle encore requise avant publication, notamment pour confirmer que la liste des fonctions bêta reste exacte au moment de la publication (elle peut évoluer plus vite que ce chapitre) et pour vérifier chaque réponse de la FAQ en situation réelle avec un utilisateur.
