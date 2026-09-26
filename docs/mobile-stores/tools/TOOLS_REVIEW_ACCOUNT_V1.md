# ELSATIA Tools — compte de revue — contrat V1

Base : `094bd43`.

> **Ce compte n'a pas été créé.** Ce document en fixe le contrat. La création, le mot de passe
> et la saisie dans les consoles relèvent de Julien seul, et le mot de passe n'entre jamais
> dans Git.

## Pourquoi il est indispensable

Tools Free fonctionne sans compte : catalogue, calculs, Atelier, projets locaux et exports sont
évaluables tels quels. Un relecteur peut donc juger l'essentiel de l'application sans session.

Mais **trois choses restent invérifiables sans compte** : Tools Pro, la synchronisation
multi-entreprise, et la restauration d'achat. Or ce sont précisément les trois que la revue
contrôle quand une application déclare des abonnements. Sans compte de test fonctionnel, Apple
rejette en 2.1 (App Completeness) et Google en « Broken functionality ».

## Identité

| Élément | Valeur |
|---|---|
| Adresse | `review@elsatia.fr` |
| Nature | boîte dédiée à la revue, distincte de toute boîte personnelle |
| Mot de passe | fort, stocké dans le gestionnaire de Julien, saisi **dans les consoles uniquement** |
| Double authentification | **désactivée** — voir ci-dessous |

**Ne jamais fournir `julien@elsatia.fr` aux relecteurs Apple ou Google.** C'est un compte réel,
avec des droits réels et des données réelles. Un relecteur qui s'y connecte verrait une
production ; il pourrait aussi la modifier.

**Ne pas activer la double authentification sur ce compte.** Un relecteur ne peut pas recevoir de
code : Apple demande explicitement un compte utilisable sans second facteur, ou à défaut une
procédure de contournement documentée. Le désactiver est donc une exigence, pas un relâchement —
et c'est acceptable parce que le compte ne donne accès à aucune donnée réelle.

## Droits — le minimum qui permet de tout contrôler

| Droit | Valeur | Pourquoi |
|---|---|---|
| Entreprise de rattachement | **une seule**, de démonstration, créée pour cet usage | isole la revue de toute donnée réelle |
| Application | Tools uniquement | pas d'accès à Gestion Pro ni à Colors |
| Rôle | le plus bas permettant d'ouvrir les projets et de voir l'état d'abonnement | principe du moindre privilège |
| Droit Tools Pro | **actif** | sans lui, la revue ne voit que Free et ne peut pas juger l'abonnement |
| Administration plateforme | **aucune** | un relecteur n'a rien à administrer |
| Facturation, données financières | **aucun accès** | — |

L'entreprise de démonstration ne doit être rattachée à aucun client, aucun chantier réel, aucun
devis réel.

## Données de démonstration

Trois à cinq projets, pas davantage — assez pour montrer, trop peu pour égarer :

- un calcul abouti, par exemple l'angle droit 3-4-5, avec ses valeurs réelles ;
- un tracé d'ouvrage issu de la bibliothèque, par exemple une rosace à 6 pétales ;
- un projet contenant un export PDF déjà produit.

**Contraintes strictes** : aucun nom de client, aucune adresse, aucun numéro de téléphone,
aucune référence de chantier réelle, aucun montant réel. Des libellés neutres du type
« Plafond — rosace 6 » ou « Chantier de démonstration ».

Ce sont exactement les libellés utilisés dans la série de captures Store, et ce n'est pas un
hasard : la fiche et le compte de revue doivent montrer la même chose.

## Achats pendant la revue

Le compte de revue **n'achète pas réellement**.

- **Apple** : la revue se fait en environnement Sandbox. Créer les testeurs Sandbox dans App
  Store Connect, et vérifier que l'achat, la restauration et l'expiration s'y comportent
  correctement **avant** de soumettre.
- **Google** : déclarer le compte comme **testeur de licence** dans Play Console. Les achats
  sont alors sans frais et testables.

Sans ces deux déclarations, le relecteur tombera sur un vrai écran de paiement et abandonnera
le contrôle — ou le fera échouer.

## Cycle de vie

| Étape | Règle |
|---|---|
| Création | juste avant la première soumission, pas plus tôt |
| Durée de vie | tant qu'une version est en revue ou en vente |
| Rotation du mot de passe | après chaque cycle de revue majeur, et à toute suspicion |
| Réinitialisation des données | avant chaque nouvelle soumission — repartir d'un jeu propre |
| Surveillance | vérifier après chaque revue qu'aucune donnée réelle n'y est apparue |
| Suppression | quand l'application est retirée des deux Stores |

## Procédure de réinitialisation

1. se connecter au compte de revue ;
2. supprimer les projets accumulés pendant la revue précédente ;
3. recréer les trois à cinq projets de démonstration ci-dessus ;
4. vérifier que le droit Tools Pro est toujours actif ;
5. vérifier que le compte n'appartient toujours qu'à l'entreprise de démonstration ;
6. vérifier que la double authentification est toujours désactivée ;
7. tester la connexion **dans un contexte neuf**, comme le ferait un relecteur.

## Ce qui se saisit où

| Donnée | Emplacement |
|---|---|
| Identifiant et mot de passe | App Store Connect → App Review Information ; Play Console → notes de test |
| Étapes de contrôle | notes de revue, rédigées dans les deux fiches de métadonnées |
| Mot de passe | **jamais** dans Git, jamais dans un document du dépôt, jamais dans un ticket |

## Checklist de création

- [ ] boîte `review@elsatia.fr` créée
- [ ] entreprise de démonstration créée, sans donnée réelle
- [ ] compte rattaché à cette seule entreprise, sur Tools seulement
- [ ] droit Tools Pro activé
- [ ] double authentification désactivée
- [ ] 3 à 5 projets de démonstration créés
- [ ] testeur Sandbox Apple déclaré
- [ ] testeur de licence Google déclaré
- [ ] connexion testée depuis un appareil neuf
- [ ] identifiants saisis dans les deux consoles
