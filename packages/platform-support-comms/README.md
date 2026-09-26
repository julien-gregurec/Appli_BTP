# @elsatia/platform-support-comms

Contrat transverse ELSATIA pour **l'accès d'assistance** et le **centre de
communications** interapplications.

Ce paquet ne contient que des règles pures : aucun accès réseau, aucun
`server-only`, aucune dépendance à Supabase. Il est importable tel quel par
Gestion Pro, Colors, Réserves, Tools, la future application Drone / Scan et
toute application inscrite au catalogue.

## Ce que le paquet décide

* la validité d'une session d'assistance (application, entreprise, périmètre,
  expiration, révocation, inactivité, hors-ligne) ;
* le contenu du bandeau permanent « Session d'assistance ELSATIA » ;
* la forme normalisée des événements d'audit (acteur réel, jamais le client) ;
* le texte des notifications envoyées à l'entreprise assistée (motif *public*) ;
* la validation d'une communication (contenu, image, lien, ciblage) ;
* l'évaluation d'une audience (applications, entreprises, postes/rôles) ;
* la politique d'affichage, d'acquittement et de consentement ;
* la réconciliation hors-ligne des communications et des accusés de lecture.

## Ce que le paquet ne décide pas

**L'autorité reste la base de données.** Chaque règle exprimée ici est le miroir
testable d'un contrôle serveur (RLS + fonctions `security definer`). Un appelant
qui n'utiliserait pas ce paquet ne gagne aucun droit ; un appelant qui l'utilise
ne contourne aucun contrôle. Le paquet sert à masquer ce qui serait de toute
façon refusé, à écrire les mêmes textes partout, et à rendre les règles
vérifiables par des tests unitaires plutôt que par relecture.
