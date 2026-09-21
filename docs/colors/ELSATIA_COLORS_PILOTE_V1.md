# ELSATIA Colors — préparation du pilote contrôlé

Lot `COLORS-COMMERCIAL-READINESS-V1`. Branche `feat/colors-commercial-readiness-v1`,
base `59e960a` (train V3, SHA métier `52d3282`, ledger 278 migrations).

Ce document décrit **comment conduire un pilote de 5 à 10 utilisateurs**. Il ne
décrit pas une commercialisation : Colors reste en accès réservé, `noindex`, sans
tarif public et sans inscription publique.

---

## 1. Ce que Colors fait — et ce qu'il ne fait pas

Colors est une **gestion de stock de peinture au seau**. Chaque seau est
individualisé, localisé, historisé : marque, produit, teinte déclarée, niveau
restant, état, emplacement, photo.

Trois choses qu'il ne fait pas, et qu'aucune communication de pilote ne doit
laisser croire :

- **Il ne mesure aucune couleur.** La teinte est saisie à la main, d'après une
  étiquette ou un nuancier physique. Une photographie non calibrée dépend de
  l'éclairage, du capteur et du traitement de l'appareil ; elle n'autorise
  aucune conclusion colorimétrique.
- **Il ne certifie aucune référence.** La correspondance de nuancier est une
  proposition de proximité, accompagnée de son écart ΔE et de sa provenance.
  Elle ne remplace pas un nuancier physique avant commande ou retouche.
- **Il ne fonctionne pas hors ligne.** Sans réseau, l'application affiche un
  écran qui le dit. Aucune donnée de stock n'est mise en cache sur l'appareil :
  le cache d'un navigateur survit à la déconnexion et n'est pas cloisonné par
  organisation.

## 2. Ouvrir un accès à un pilote

Colors n'ouvre aucun compte. L'identité ELSATIA naît sur Gestion Pro et Colors
la consomme. La chaîne complète, dans l'ordre, chaque étape étant bloquante :

1. **Compte ELSATIA** — la personne dispose d'un compte, créé sur Gestion Pro.
2. **Droit d'usage de l'organisation** — un administrateur plateforme active
   Colors pour l'entreprise (`plateforme_activer_application_entreprise`).
   Sans lui, la personne voit `/abonnement-requis`.
3. **Habilitation individuelle** — un administrateur plateforme habilite la
   personne sur Colors avec l'un des quatre rôles
   (`plateforme_habiliter_utilisateur_application`). Sans elle, la personne voit
   `/acces-refuse`. Les deux écrans sont distincts à dessein : le premier
   relève de l'organisation, le second de la personne.
4. **Première connexion** — le tableau de bord affiche un parcours de mise en
   service en quatre étapes, déduit des données réelles : créer un emplacement,
   ajouter un seau, le photographier, régler le seuil de stock faible.

> **Point ouvert.** Il n'existe aujourd'hui **aucun parcours d'invitation** dans
> le dépôt : pas de table, pas de route, pas de courriel. Les étapes 2 et 3 se
> font depuis Gestion Pro par un administrateur plateforme, une personne à la
> fois. Pour 5 à 10 utilisateurs c'est tenable ; au-delà, c'est un lot à part
> entière et il exige une migration.

### Rôles disponibles

| Rôle | Peut faire |
|---|---|
| `colors_admin_organisation` | tout, y compris les paramètres |
| `colors_gestionnaire_stock` | tout sauf les paramètres |
| `colors_utilisateur_depot` | consulter, ajouter, ajuster, déplacer, marquer vide, photographier |
| `colors_consultation` | consulter et exporter |

Un pilote de terrain type : un `colors_admin_organisation`, un ou deux
`colors_gestionnaire_stock`, le reste en `colors_utilisateur_depot`.

## 3. Entreprise de démonstration et jeu de données

**Aucun faux client, aucun faux avis, aucun chiffre commercial inventé** ne doit
apparaître nulle part — ni dans l'application, ni sur le site public.

L'entreprise de démonstration se constitue avec des données réelles de
l'exploitant ou des données manifestement fictives et nommées comme telles. Le
parcours de mise en service suffit à la peupler : quatre étapes, quelques
minutes.

Le nuancier de démonstration, s'il en faut un, doit être un nuancier dont
l'exploitant détient les droits. **ELSATIA ne fournit aucune référence** :
RAL Classic et les nuanciers fabricants sont des bases protégées. Le format
attendu est décrit dans `apps/colors/src/lib/nuancier/contrat.ts` ; le fichier
est désigné par la variable serveur `COLORS_NUANCIER_FICHIER`.

## 4. Retours, erreurs, assistance

- **Retours utilisateurs** : aucun formulaire n'est intégré à l'application, et
  le pilote n'en exige pas. Une adresse ou un fil dédié suffit à cette échelle,
  et évite d'ajouter une collecte de données à un produit en accès réservé.
- **Remontée d'erreur technique** : les échecs sont journalisés côté serveur,
  avec leur code SQLSTATE et un message nettoyé de toute valeur métier.
  Aucun message technique n'atteint l'utilisateur ni l'URL.
- **Assistance ELSATIA** : une session de support n'ouvre Colors que si Colors
  a été explicitement sélectionné, et un bandeau l'annonce à l'utilisateur
  pendant toute sa durée. Un administrateur plateforme est limité à la
  consultation, et uniquement pendant une session active.

## 5. Métriques, sans surveillance intrusive

Ce qui est déjà mesurable sans rien ajouter, et sans suivre personne :

- nombre de seaux, d'emplacements, de mouvements par organisation ;
- volume du journal d'activité, par type d'événement ;
- échecs techniques journalisés, par code.

Aucune télémétrie comportementale n'est en place et le pilote n'en réclame pas.
Ce qu'un pilote de 5 à 10 personnes apprend s'apprend en leur parlant.

## 6. Révocation d'un accès

1. Retirer l'habilitation individuelle
   (`plateforme_retirer_habilitation_application`). L'effet est **immédiat** :
   l'accès est revérifié à chaque rendu de page et la RLS refuse toute lecture
   dès la requête suivante. Une session déjà ouverte cesse de fonctionner sans
   attendre son expiration.
2. Pour couper l'organisation entière :
   `plateforme_desactiver_application_entreprise`.

**Appareil perdu ou volé.** Une déconnexion depuis n'importe quel appareil
révoque la session Supabase de la personne. En cas de doute, retirer
l'habilitation est plus sûr et plus rapide : elle ne dépend d'aucune action de
l'utilisateur.

## 7. Supprimer des images

Les photos vivent dans le bucket privé `colors-seaux`, non public, cloisonné par
organisation, servi uniquement par des liens signés de 300 secondes.

- **Remplacer** une photo depuis la fiche supprime l'ancienne du stockage. Si la
  suppression échoue, elle est inscrite dans un suivi de nettoyage visible sur
  la fiche, et reprise ensuite : aucune photo orpheline ne disparaît des radars.
- **Supprimer sans remplacer** n'a pas d'interface. La suppression manuelle
  passe par le stockage Supabase.

> **Point ouvert.** Il n'existe **aucune règle de conservation** : ni durée de
> vie des photos, ni purge des analyses de lecture d'étiquette, ni expiration
> du journal. Pour un pilote borné dans le temps c'est acceptable si la durée et
> le sort des données sont annoncés aux participants ; pour une
> commercialisation, non.

## 8. Sauvegarde, restauration, retour arrière

- **Données** : Colors n'a ni base ni stockage propres. Il vit dans le projet
  Supabase de l'écosystème et suit ses sauvegardes. Aucune procédure spécifique
  à Colors n'est requise, et aucune n'est possible séparément.
- **Application** : chaque déploiement Vercel est réversible par retour à la
  version précédente. Le lot ne comporte **aucune migration**, donc aucun retour
  arrière de schéma n'est nécessaire — c'est la propriété qui rend son
  déploiement sûr.
- **Nuancier** : c'est un fichier. Le retirer suffit à revenir à l'état sans
  correspondance, sans toucher aux données.

## 9. Conditions à lever avant d'ouvrir le pilote

| # | Condition | Pourquoi |
|---|---|---|
| P1 | **Déployer la version du train V3** | Ce qui est servi aujourd'hui sur `colors.elsatia.fr` est un build très antérieur : `/mot-de-passe-oublie`, `/nouveau-mot-de-passe`, `/auth/confirm` et `/robots.txt` répondent 404, et aucune en-tête de sécurité — ni CSP, ni `X-Frame-Options`, ni `Referrer-Policy`, ni `X-Robots-Tag` — n'est émise. Une personne qui perd son mot de passe pendant le pilote est bloquée. |
| P2 | **Vérifier les cinq variables publiques en Production** | La garde `verify:public-env` refuse un build publié sans elles ; il faut qu'elle passe, pas qu'elle bloque le jour J. |
| P3 | **Décider du sort des données du pilote** | Aucune règle de conservation n'existe. Annoncer aux participants la durée du pilote et ce qui sera supprimé ensuite. |
| P4 | **Fournir ou renoncer au nuancier** | Sans fichier, l'écran Nuanciers explique son absence et les fiches n'affichent aucune proposition. C'est cohérent, mais il faut le savoir avant de présenter le produit. |
| P5 | **Décider de la lecture d'étiquette** | Elle est inactive et aucun prestataire n'est contractualisé. L'activer suppose un contrat de sous-traitance, une base légale et une information des personnes. Sans cela, le pilote se conduit sans OCR. |
| P6 | **Arbitrer la migration proposée** | `docs/migrations-proposees/colors-finition-et-reference-nuancier-v1.sql.proposed`. Sans elle, la finition reste hors du produit et aucune référence ne peut être confirmée par un humain. |

## 10. Conditions supplémentaires avant commercialisation

Distinctes des précédentes, et plus lourdes :

- **Parcours d'invitation** — indispensable au-delà d'une poignée d'utilisateurs.
- **Règles de conservation et purge** — obligation, pas confort.
- **Écrans Catalogues, Imports, Utilisateurs** — encore des annonces
  « bientôt disponible ». Un produit vendu ne comporte pas de rubriques vides.
- **Suppression de photo à l'unité** depuis l'interface.
- **Nuancier fourni sous licence**, ou renoncement assumé et documenté.
- **Recette fonctionnelle authentifiée de bout en bout**, non réalisée dans ce
  lot faute de base au ledger du train V3 (voir le rapport).
