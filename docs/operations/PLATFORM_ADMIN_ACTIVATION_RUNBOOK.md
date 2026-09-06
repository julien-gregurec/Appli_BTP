# Activation et révocation d'un administrateur plateforme

Ce runbook décrit le cycle sécurisé. Il ne contient aucun secret et ne constitue pas une
autorisation d'intervenir sur Preview ou Production.

## États

- `en_attente` : email déclaré, aucun UID, aucun droit ;
- `rattachee_non_confirmee` : UID contrôlé, droits encore désactivés ;
- `active` : UID, email vérifié et MFA vérifié, activation explicite tracée ;
- `revoquee` : aucun droit, sessions support fermées, ligne conservée pour l'audit.

## Écran opérateur

Depuis ELSATIA-GP-PLATFORM-SECOND-ADMIN-OPERABILITY-P1-V1, tout le cycle se pilote depuis
`/plateforme`, section « Équipe plateforme ». Aucune intervention SQL n'est nécessaire pour
créer, activer, révoquer ou détacher un second administrateur plateforme.

L'écran ne fait que router les appels : il n'ajoute, ne déplace et n'assouplit aucune garde.
Le rôle `total` et l'AAL2 sont exigés par les RPC elles-mêmes. Les commandes du cycle ne sont
affichées que si `plateforme_ecriture_autorisee('total')` répond vrai ; un `false` explicite
les masque et affiche la condition manquante. Ce voyant explique une commande absente, il ne
décide de rien : une commande visible reste refusée par la base hors rôle `total` et AAL2.
Aucun mot de passe, jeton ni identifiant de compte existant n'est rendu par l'écran.

Le seul élément à reporter manuellement est l'identifiant du compte Supabase de la cible
(Authentication → Users → UID). Il est saisi dans le champ de rattachement ; la base vérifie
ensuite que ce compte existe, porte exactement l'adresse déclarée et l'a confirmée.

## Activation normale

1. L'opérateur élève sa session Supabase au niveau **AAL2**. Les RPC lisent uniquement le claim
   `aal` de `auth.jwt()` ; un facteur simplement enregistré ne suffit pas.
2. Un administrateur `total` actif enregistre l'identité avec le formulaire « Déclarer »
   (`plateforme_ajouter_admin`) : elle reste en attente, sans compte et sans droit.
3. Créer le compte de connexion dans Supabase (Authentication → Add user) avec le même email.
   Vérifier hors de tout canal public que ce compte existe, que son email est confirmé et
   qu'un facteur MFA est vérifié. Ne recopier aucun mot de passe dans un ticket ni dans l'écran.
4. Un autre administrateur `total`, toujours en AAL2, saisit l'UID dans « Rattacher »
   (`plateforme_rattacher_admin(email, uid)`).
5. Contrôler que l'identité affiche « Rattachée, à activer » et reste sans droit.
6. Un administrateur `total` en AAL2 confirme « Activer » (`plateforme_activer_admin(email)`).
7. Vérifier `activation_at`, `activation_par`, le rôle et l'absence de session support implicite.

Chaque étape demande une confirmation explicite énonçant l'effet exact de l'action. La trace
reste portée par la base : `plateforme_admins` enregistre `activation_at`/`activation_par`,
`revocation_at`/`revocation_par`/`revocation_origine` et `role_updated_at`/`role_updated_by`
avec l'`auth.uid()` de l'appelant. L'application ne peut pas écrire ce journal :
`plateforme_journaliser` est révoquée à `authenticated`.

L'auto-rattachement et l'auto-activation sont refusés par la base. Une adresse email identique
ne remplace jamais la comparaison entre `auth.uid()` et `plateforme_admins.utilisateur_id`.
Le MFA de la cible prouve qu'elle est préparée à l'authentification forte ; l'AAL2 de l'appelant
prouve l'élévation de l'opération courante. Aucun des deux contrôles ne remplace l'autre.

## Premier administrateur ou récupération

Il n'existe aucun bootstrap public. Si aucun administrateur `total` actif ne subsiste, une
intervention contrôlée avec le rôle de maintenance Supabase est nécessaire. Avant toute
écriture, l'opérateur doit vérifier l'UID, l'email confirmé et le facteur MFA dans `auth`, puis
effectuer l'association et l'activation dans une transaction journalisée. Une double revue
humaine et une sauvegarde préalable sont obligatoires. Aucun identifiant, jeton ou secret ne
doit être copié dans un ticket ou un rapport.

## Révocation et suppression Auth

1. Un autre administrateur `total`, en session AAL2, confirme « Retirer »
   (`plateforme_retirer_admin(email)`).
2. Vérifier `statut_identite='revoquee'`, `actif=false`, `revocation_at` et
   `revocation_par` ; toutes les sessions support ouvertes doivent être fermées.
3. Confirmer « Détacher le compte » (`plateforme_detacher_admin_revoque(email)`) en AAL2
   seulement après vérification de l'absence de session active. Une identité révoquée peut
   ensuite être rattachée à un nouveau compte puis réactivée, sans SQL.
4. Vérifier l'existence d'un historique support. Sa FK peut volontairement interdire la
   suppression Auth même après détachement.
5. Si un historique existe, conserver le compte technique désactivé. Sa suppression ou son
   anonymisation relève d'un futur lot ; ne jamais affaiblir la FK ou utiliser une cascade.

Il est interdit de révoquer son propre compte ou le dernier administrateur `total` actif.
Un verrou advisory transactionnel sérialise toutes les mutations du cycle administrateur avant
le recomptage du dernier `total`.

## Support

- ouvrir ou changer une session exige le rôle `total` ou `support` et AAL2 ;
- la session vise une entreprise unique et expire après quatre heures ;
- répondre exige une session explicite active sur la même entreprise ;
- `lecture` et `facturation` ne peuvent pas ouvrir de session ;
- fermer sa propre session reste possible sans nouvelle élévation ;
- la révocation ferme immédiatement toutes les sessions ouvertes de la cible.

Les fils et messages support sont réservés à `total`/`support` en AAL2. Lire le contenu d'un fil,
le marquer comme lu, répondre ou lancer une réinitialisation assistée exige en plus une session
support active sur l'entreprise explicitement ciblée.

La liste globale des fils ne contient que des métadonnées minimales : identifiant/nom de
l'entreprise, dates et compteurs. Elle ne doit jamais servir d'aperçu du contenu. Sélectionner
ou afficher un fil n'acquitte rien. Après lecture, l'opérateur choisit explicitement « Marquer
comme lus », qui appelle `plateforme_support_marquer_messages_lus()` ; un second appel sans
nouveau message retourne zéro et ne crée pas de faux audit. Tout changement de cible impose une
nouvelle ouverture de session support avec motif.

## Facturation et opérations globales

Les mutations d'abonnement, tarif, impayé, règlement, remise et snapshot de facturation sont
réservées à `total`/`facturation` en AAL2. Créer une entreprise ou une version du catalogue
tarifaire est réservé à `total` en AAL2. Le rôle `lecture` ne provoque aucune écriture lors de ses
consultations ; les suspensions automatiques doivent être exécutées par les mécanismes dédiés.
Une cible inexistante doit produire une erreur explicite. Les appels idempotents retournent
`false` sans journalisation ; l'audit d'un vrai changement conserve toujours l'UID appelant,
l'entreprise et l'objet. Le snapshot mensuel est volontairement audité comme événement
périodique même lorsque son nombre de lignes modifiées vaut zéro.

## Préflight avant environnement distant

Exécuter en lecture seule `PLATFORM_SECURITY_PREFLIGHT.sql` avant les migrations 234 à 238.
Toute anomalie bloquante interdit la migration. Le contrôle détecte les applications inconnues
dans l'historique, états incohérents, UID dupliqués, sessions orphelines et l'absence d'un
administrateur `total` actif.

## Compte professionnel ELSATIA

`julien@elsatia.fr` est l'identité officielle à terme, mais reste sans droit jusqu'à un lot
d'activation séparé ayant validé connexion, récupération, email, MFA et absence de dépendance
à l'ancienne adresse. `julien.gregurec@gmail.com` n'est pas supprimé par ce correctif.

`DISABLE_EMAIL_LOGIN` n'est jamais une procédure d'administration. Le mode démonstration exige
en plus `ELSATIA_LOCAL_DEMO=true`, une base Supabase locale, un environnement non Production et
l'absence de Vercel. Ces variables ne doivent figurer dans aucun environnement distant.
