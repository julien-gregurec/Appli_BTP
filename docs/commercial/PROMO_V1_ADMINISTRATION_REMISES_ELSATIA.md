# PROMO-V1 — Administration des remises ELSATIA

## Périmètre

PROMO-V1 ajoute un registre de conditions commerciales séparé du catalogue public ELSATIA. Il est destiné à l’administration plateforme en environnement Local et Preview. Il ne modifie aucun tarif public, aucun abonnement réel et aucun objet Stripe Live.

Tarifs publics inchangés : Mini 69 €, Pro 199 €, Business 399 €, Entreprise 599 € et Sur mesure sur devis.

## Capacités

Une promotion contient :

- un nom interne et une justification obligatoire ;
- une remise en pourcentage ou en montant fixe ;
- une durée ponctuelle, temporaire de 1 à 36 mois, ou permanente ;
- une date de début et, facultativement, une date de fin ;
- une ou plusieurs offres parmi Mini, Pro, Business et Entreprise ;
- une entreprise précise ou un code promotionnel lisible ;
- un indicateur « offre pilote » ;
- un statut brouillon, actif, expiré ou désactivé ;
- les références Stripe Test utiles à la traçabilité.

Les brouillons peuvent être créés et modifiés. Une promotion activée n’est plus éditable : elle doit être désactivée et une nouvelle condition commerciale doit être créée. Aucune suppression destructive n’est exposée.

## Règles de calcul

1. Une seule promotion active peut cibler une entreprise à un instant donné. Aucun cumul ambigu n’est autorisé.
2. Une remise s’applique à l’abonnement de base et aux suppléments de comptes récurrents. Ce comportement correspond au coupon porté par l’abonnement Stripe.
3. Pour un abonnement annuel, le tarif normal est d’abord calculé sur dix mois facturés. La remise commerciale s’applique ensuite une seule fois sur ce montant. Les deux mois offerts ne sont pas recomptés comme une promotion.
4. Une remise fixe est plafonnée au montant facturable : le tarif résultant ne devient jamais négatif.
5. Un pourcentage doit être strictement positif et ne peut pas dépasser 100 %.
6. Une date de fin ne peut pas précéder la date de début.
7. Une promotion expirée ou désactivée ne peut pas être réactivée.
8. Une promotion à date de début future reste un brouillon jusqu’à sa date d’effet.
9. Le changement d’offre pendant une remise doit être traité comme une nouvelle décision commerciale ; PROMO-V1 ne déplace pas automatiquement la remise vers une offre incompatible.

L’aperçu affiche le tarif normal HT, la remise HT, le tarif résultant HT et la durée. Il est indicatif et ne constitue pas une facture.

## Offres pilotes et prix contractuels

L’indicateur pilote identifie explicitement une condition commerciale expérimentale, avec justification, durée et cible. Aucun pourcentage pilote n’est présélectionné.

Le prix contractuel spécifique n’est pas automatisé dans PROMO-V1. L’architecture actuelle pourrait exiger la création ou la gestion de Prices Stripe dédiés ; cette opération est volontairement différée afin de ne jamais modifier le catalogue public ni créer un Price Live par erreur. Les conditions Sur mesure restent documentées et traitées manuellement, sur devis.

## Codes promotionnels Stripe Test

Un brouillon peut définir un code de 3 à 32 caractères, composé de lettres, chiffres, tirets ou underscores. Le code est normalisé en majuscules. Une date d’expiration et une limite d’utilisations peuvent être transmises au Promotion Code.

À l’activation, l’application crée un coupon puis, si demandé, un Promotion Code dans Stripe Test. À la désactivation, le code est rendu inactif. Le serveur refuse toute opération si la clé Stripe n’est pas une clé `sk_test_`. Les secrets ne sont ni stockés dans la table, ni écrits dans le journal.

La compatibilité avec les offres est contrôlée dans ELSATIA. PROMO-V1 ne crée aucun checkout générique pour l’offre Sur mesure.

## Permissions et sécurité

- `total` : consulter, créer, modifier, activer et désactiver ;
- `facturation` : consulter le registre uniquement ;
- `lecture` et `support` : aucun accès PROMO-V1 ;
- utilisateurs et administrateurs d’une entreprise cliente : aucun accès PROMO-V1.

Les écritures passent exclusivement par des fonctions serveur contrôlant la permission `gerer_remises`. Les écritures directes sur la table ne sont pas accordées aux utilisateurs authentifiés. La lecture est protégée par RLS et limitée aux rôles plateforme autorisés.

## Journal d’audit

Les opérations `promotion_creee`, `promotion_modifiee`, `promotion_activee` et `promotion_desactivee` sont inscrites dans le journal plateforme avec l’acteur, l’action, l’horodatage, l’identifiant de la promotion et les éléments modifiés utiles. Aucun secret n’est journalisé.

## Interface plateforme

La page `/plateforme/promotions` présente :

- le formulaire de création ou d’édition d’un brouillon ;
- l’aperçu de calcul ;
- le registre avec nom, type, valeur, offres, entreprise, dates, statut, motif, créateur et dernière modification ;
- les actions Modifier, Activer et Désactiver selon le statut et les permissions.

## Scénarios couverts

- Mini à -10 % permanent ;
- Pro à -50 € pendant trois mois ;
- Business avec date de fin ;
- expiration et désactivation ;
- offre incompatible et exclusion de Sur mesure ;
- refus des rôles non autorisés et autorisation du rôle `total` ;
- consultation seule pour `facturation` ;
- journalisation ;
- annuel calculé sur dix mois puis remisé ;
- abonnement et suppléments de comptes remisés ensemble ;
- code promotionnel valide, unique, limité et désactivable ;
- rejet d’un pourcentage supérieur à 100 %, d’une valeur négative et de dates incohérentes.

## Limitations connues

- aucun Price contractuel spécifique automatisé ;
- aucune automatisation Sur mesure ;
- aucune combinaison de plusieurs remises ;
- aucune migration automatique d’une remise lors d’un changement d’offre ;
- Stripe ne peut être appelé qu’en mode Test dans ce lot ;
- l’activation différée doit être effectuée à partir de la date de début ; aucun cron d’activation n’est ajouté dans PROMO-V1.

## Procédure future de mise en Production

La Production reste interdite tant que TARIFS-V2-D et ADMIN-V1 Production ne sont pas validés.

Quand ces deux prérequis seront levés :

1. vérifier la branche, le commit, l’état Git et la chaîne de migrations Production ;
2. confirmer que `00201` puis `00202` sont déjà appliquées ;
3. relire et appliquer uniquement la migration PROMO-V1 `00203` ;
4. vérifier les RLS, permissions et journaux sans créer de condition commerciale ;
5. déployer le commit validé sur Production ;
6. réaliser un test fonctionnel sans client réel ni remise active ;
7. préparer séparément l’autorisation Stripe Live, avec double contrôle humain ;
8. ne créer un coupon, un Promotion Code ou une remise Live qu’après autorisation explicite.

La promotion Preview ne constitue jamais une autorisation de créer un objet Stripe Live.
