# ADMIN-GLOBAL-V1-R7.1 — frontière d’écriture des remises

## Décision de sécurité

Les huit colonnes de remise de `public.entreprises` ne sont jamais une surface d’écriture
applicative directe : `remise_stripe_coupon_id`, `remise_description`,
`remise_motif_interne`, `remise_duree_mois`, `remise_type`, `remise_valeur`,
`remise_cree_par` et `remise_appliquee_at`.

La migration append-only `20260827000243_discount_column_guard_r71.sql` retire leurs privilèges
`INSERT`/`UPDATE` aux rôles API tout en conservant les écritures sur les colonnes métier non
sensibles. Le trigger `proteger_colonnes_remise` lève explicitement `42501` si un autre acteur
tente de modifier ces valeurs. Cette règle vaut pour un client, un administrateur d’entreprise,
les rôles plateforme `total`, `facturation`, `support` ou `lecture`, AAL2 compris, un wrapper,
une fonction `SECURITY DEFINER` générique et `service_role` direct.

## Unique chemin autorisé

Seul `plateforme_finaliser_operation_remise_serveur(uuid,uuid,uuid)` écrit ces colonnes. La
fonction appartient à `elsatia_discount_f4_writer`, rôle interne `NOLOGIN`, `NOINHERIT`,
`NOBYPASSRLS`, sans membre API et sans privilège `CREATE`. L’adhésion technique du rôle de
migration `postgres`, nécessaire au transfert de propriété, n’est exposée à aucune connexion
applicative. Ses grants et policies sont limités aux
lectures/écritures nécessaires au finaliseur. Le rôle API `service_role` peut exécuter le
finaliseur, mais ne peut ni assumer son rôle propriétaire ni écrire directement les colonnes.

Avant l’écriture, F4 exige le JWT serveur, le verrou de l’abonnement, une saga au statut
`database_finalization_pending`, ainsi qu’une preuve liée à l’intention, à l’abonnement et au
numéro de tentative. La preuve doit confirmer exactement le coupon appliqué ou l’absence de
coupon pour un retrait. La cible entreprise/abonnement est revérifiée sous verrou. Après
l’écriture, les huit colonnes sont relues et comparées avant le passage de la saga à `completed`.

## Expiration Stripe

Une expiration naturelle n’utilise plus d’`UPDATE` direct. Le webhook, déjà sous le verrou de
l’abonnement, appelle `plateforme_commencer_expiration_remise_serveur`, qui crée une intention
de retrait idempotente sans toucher à `entreprises`. Le moteur relit Stripe : si l’absence de
coupon est confirmée, la preuve F4 est enregistrée puis le finaliseur efface l’état local ; si
un coupon est réapparu, l’intention pending est annulée sans aucun `DELETE` Stripe.

## Concurrence et audit

Le verrou exclusif par abonnement et l’index unique des sagas actives empêchent deux
finalisations concurrentes. Les refus directs ne créent ni saga ni entrée de tarification.
Une finalisation légitime conserve l’historique append-only et l’entrée
`historique_tarification`. La révocation ultérieure de l’administrateur auteur ne rend pas une
saga prouvée orpheline : son UUID historique reste référencé sans lui redonner de droit.

## Préflight et récupération exceptionnelle

`docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql` est strictement read-only. Il bloque si le
rôle interne est mal configuré, si un rôle API possède encore un grant sensible, si le trigger
ou le propriétaire F4 manque, si l’état des colonnes est partiel, ou si une remise active ne
correspond pas à une saga F4 prouvée.

Une anomalie de remise ne doit jamais être réparée par un `UPDATE` direct, un `SET ROLE`, une
désactivation du trigger ou un élargissement de grant. La récupération autorisée consiste à :

1. geler les mutations Stripe et conserver les identifiants de l’entreprise, de l’abonnement,
   de l’intention et de la tentative ;
2. relire Stripe en environnement contrôlé ;
3. créer ou reprendre une saga F4 sous verrou avec une preuve serveur fraîche ;
4. laisser le finaliseur F4 converger l’état et vérifier les historiques ;
5. documenter l’incident sans secrets ni données client dans le rapport d’exploitation.

Production, Preview, Stripe réel et comptes réels sont hors du périmètre de cette migration.
