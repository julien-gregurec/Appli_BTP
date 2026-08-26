# Activation et révocation d'un administrateur plateforme

Ce runbook décrit le cycle sécurisé. Il ne contient aucun secret et ne constitue pas une
autorisation d'intervenir sur Preview ou Production.

## États

- `en_attente` : email déclaré, aucun UID, aucun droit ;
- `rattachee_non_confirmee` : UID contrôlé, droits encore désactivés ;
- `active` : UID, email vérifié et MFA vérifié, activation explicite tracée ;
- `revoquee` : aucun droit, sessions support fermées, ligne conservée pour l'audit.

## Activation normale

1. Un administrateur `total` actif enregistre l'identité avec
   `plateforme_ajouter_admin` : elle reste en attente.
2. Vérifier hors de tout canal public que le compte Supabase Auth cible existe, que son email
   est confirmé et qu'un facteur MFA est vérifié.
3. Un autre administrateur `total` appelle `plateforme_rattacher_admin(email, uid)`.
4. Contrôler que l'identité est `rattachee_non_confirmee` et toujours sans droit.
5. Un autre administrateur `total` appelle `plateforme_activer_admin(email)`.
6. Vérifier `activation_at`, `activation_par`, le rôle et l'absence de session support implicite.

L'auto-rattachement et l'auto-activation sont refusés par la base. Une adresse email identique
ne remplace jamais la comparaison entre `auth.uid()` et `plateforme_admins.utilisateur_id`.

## Premier administrateur ou récupération

Il n'existe aucun bootstrap public. Si aucun administrateur `total` actif ne subsiste, une
intervention contrôlée avec le rôle de maintenance Supabase est nécessaire. Avant toute
écriture, l'opérateur doit vérifier l'UID, l'email confirmé et le facteur MFA dans `auth`, puis
effectuer l'association et l'activation dans une transaction journalisée. Une double revue
humaine et une sauvegarde préalable sont obligatoires. Aucun identifiant, jeton ou secret ne
doit être copié dans un ticket ou un rapport.

## Révocation et suppression Auth

1. Un autre administrateur `total` appelle `plateforme_retirer_admin(email)`.
2. Vérifier `statut_identite='revoquee'`, `actif=false`, `revocation_at` et
   `revocation_par` ; toutes les sessions support ouvertes doivent être fermées.
3. Appeler `plateforme_detacher_admin_revoque(email)` seulement après vérification de l'absence
   de session active.
4. La suppression éventuelle du compte Auth vient ensuite, dans un lot distinct.

Il est interdit de révoquer son propre compte ou le dernier administrateur `total` actif.

## Compte professionnel ELSATIA

`julien@elsatia.fr` est l'identité officielle à terme, mais reste sans droit jusqu'à un lot
d'activation séparé ayant validé connexion, récupération, email, MFA et absence de dépendance
à l'ancienne adresse. `julien.gregurec@gmail.com` n'est pas supprimé par ce correctif.
