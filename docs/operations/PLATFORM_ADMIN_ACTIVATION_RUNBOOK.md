# Activation et révocation d'un administrateur plateforme

Ce runbook décrit le cycle sécurisé. Il ne contient aucun secret et ne constitue pas une
autorisation d'intervenir sur Preview ou Production.

## États

- `en_attente` : email déclaré, aucun UID, aucun droit ;
- `rattachee_non_confirmee` : UID contrôlé, droits encore désactivés ;
- `active` : UID, email vérifié et MFA vérifié, activation explicite tracée ;
- `revoquee` : aucun droit, sessions support fermées, ligne conservée pour l'audit.

## Activation normale

1. L'opérateur élève sa session Supabase au niveau **AAL2**. Les RPC lisent uniquement le claim
   `aal` de `auth.jwt()` ; un facteur simplement enregistré ne suffit pas.
2. Un administrateur `total` actif enregistre l'identité avec
   `plateforme_ajouter_admin` : elle reste en attente.
3. Vérifier hors de tout canal public que le compte Supabase Auth cible existe, que son email
   est confirmé et qu'un facteur MFA est vérifié.
4. Un autre administrateur `total`, toujours en AAL2, appelle
   `plateforme_rattacher_admin(email, uid)`.
5. Contrôler que l'identité est `rattachee_non_confirmee` et toujours sans droit.
6. Un administrateur `total` en AAL2 appelle `plateforme_activer_admin(email)`.
7. Vérifier `activation_at`, `activation_par`, le rôle et l'absence de session support implicite.

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

1. Un autre administrateur `total`, en session AAL2, appelle
   `plateforme_retirer_admin(email)`.
2. Vérifier `statut_identite='revoquee'`, `actif=false`, `revocation_at` et
   `revocation_par` ; toutes les sessions support ouvertes doivent être fermées.
3. Appeler `plateforme_detacher_admin_revoque(email)` en AAL2 seulement après vérification de
   l'absence de session active.
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

## Facturation et opérations globales

Les mutations d'abonnement, tarif, impayé, règlement, remise et snapshot de facturation sont
réservées à `total`/`facturation` en AAL2. Créer une entreprise ou une version du catalogue
tarifaire est réservé à `total` en AAL2. Le rôle `lecture` ne provoque aucune écriture lors de ses
consultations ; les suspensions automatiques doivent être exécutées par les mécanismes dédiés.

## Préflight avant environnement distant

Exécuter en lecture seule `PLATFORM_SECURITY_PREFLIGHT.sql` avant les migrations 234 à 237.
Toute anomalie bloquante interdit la migration. Le contrôle détecte les applications inconnues
dans l'historique, états incohérents, UID dupliqués, sessions orphelines et l'absence d'un
administrateur `total` actif.

## Compte professionnel ELSATIA

`julien@elsatia.fr` est l'identité officielle à terme, mais reste sans droit jusqu'à un lot
d'activation séparé ayant validé connexion, récupération, email, MFA et absence de dépendance
à l'ancienne adresse. `julien.gregurec@gmail.com` n'est pas supprimé par ce correctif.
