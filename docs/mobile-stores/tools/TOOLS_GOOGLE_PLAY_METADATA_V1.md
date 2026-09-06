# ELSATIA Tools — métadonnées Google Play — V1

Base : `094bd43`. Textes prêts à saisir, **après relecture juridique et commerciale par Julien**.
Rien n'a été saisi dans Play Console.

Mêmes interdits que la fiche Apple : pas de Gestion Pro, pas de Colors, pas de fonction non
ouverte, aucun chiffre de clientèle, pas de symbole ®.

## Champs

| Champ | Valeur | Limite Play |
|---|---|---|
| App name | `ELSATIA Tools` | 30 — utilisé : 13 |
| Package | `fr.elsatia.tools` | — |
| Catégorie | Outils | — |
| Tags | Outils, Productivité | 5 max |
| Site web | `https://tools.elsatia.fr` | — |
| E-mail de contact | à confirmer par Julien — **sera public sur la fiche** | — |
| Politique de confidentialité | `https://elsatia.fr/confidentialite` | obligatoire |
| Publicités | **Non**, l'application ne contient aucune publicité | — |
| Achats intégrés | **Oui**, abonnements | — |

### Description courte (80 max)

```
Calculs, tracés et plans cotés du chantier, même sans connexion.
```

64 caractères.

### Description longue (4000 max)

```
ELSATIA Tools rassemble les calculs et les tracés essentiels du chantier dans une
application rapide, utilisable hors connexion.

INCLUS SANS ABONNEMENT
16 calculs de chantier : angles et équerrage, géométrie, surfaces, pentes et niveaux,
répartitions, quantités. Chaque calcul donne son résultat, son schéma coté et la marche à
suivre pour le reporter sur le chantier.

L'Atelier de traçage est lui aussi inclus. Une bibliothèque de 13 modèles paramétriques :
cercles divisés, rosaces, arches, ogives, ellipses, spirales, étoiles. Vous saisissez vos
dimensions, le moteur calcule la géométrie, les cotations et les points de report. Chaque
tracé est enregistré sur l'appareil, en continu, et s'exporte en dossier PDF ou en plan SVG.

TOOLS PRO
L'abonnement ajoute 10 outils avancés — arches complexes, niches cintrées, plafonds
circulaires, ellipses, couronnes, rosaces radiales et fleurs à 4, 5, 6 ou 8 pétales — avec
leurs plans cotés, leurs points de construction et leurs quantités dérivées. Il ouvre aussi
« Mes projets » : l'enregistrement, la duplication et l'archivage des projets d'outils, avec
leurs exports PDF et SVG, l'impression et le partage.

COMPTE ELSATIA
Facultatif pour les outils Free. Un même compte retrouve vos droits sur le Web, Android et
iOS. Si vous travaillez pour plusieurs entreprises, chaque espace reste séparé.

HORS CONNEXION
L'application est installée en entier sur l'appareil. Les calculs, l'Atelier et les exports
fonctionnent sans réseau.

CONFIDENTIALITÉ
Une seule autorisation est demandée : l'accès à Internet, pour le compte et l'abonnement.
Ni appareil photo, ni photos, ni localisation, ni micro, ni notifications. Aucun traceur
publicitaire, aucun outil de mesure d'audience.
```

## Classification du contenu

Le questionnaire est à remplir en console. Réponses attendues, à confirmer une par une :

| Question | Réponse | Justification |
|---|---|---|
| Violence, sexualité, langage grossier, substances | Non | application utilitaire |
| Jeu d'argent, loterie | Non | — |
| Contenu généré par l'utilisateur partagé publiquement | **Non** | les tracés restent locaux ou dans l'espace privé de l'entreprise ; aucun flux public |
| Partage de localisation | Non | aucune API de localisation |
| Accès web non filtré | **Non** | l'application ouvre des URL ELSATIA fixes et les pages de gestion d'abonnement, pas de navigateur libre |
| Achats numériques | **Oui** | abonnements Play Billing |

Classification attendue : tous publics.

## Visuels

| Élément | Exigence Play | État |
|---|---|---|
| Icône de fiche | 512 × 512 PNG 32 bits | **produite** — `native-assets/store/play-icon-512.png`, opaque |
| Visuel principal | 1024 × 500 | **produit** — `native-assets/store/play-feature-graphic-1024x500.png` |
| Captures téléphone | 2 min., 8 max., ratio entre 16:9 et 9:16 | **9 produites** en 1080 × 1920 |
| Captures tablette 7 et 10 pouces | exigées seulement si la distribution tablette est revendiquée | **non produites** — décision en attente (réserve P1-7) |

Les captures se trouvent dans
`/Volumes/ELSATIA-DEV/ELSATIA-MOBILE-STORES/captures/store-dist-v1/google-phone/` et se
régénèrent par `scripts/capture-store-screenshots.mjs`. Elles montrent des valeurs réellement
calculées par le moteur — aucune maquette, aucune donnée réelle.

## Déclarations obligatoires

| Déclaration | Réponse |
|---|---|
| Publicités | Non |
| Data Safety | voir `TOOLS_DATA_SAFETY_V1.md` |
| Application financière | Non |
| Application de santé | Non |
| COVID-19 | Non |
| Applications gouvernementales | Non |
| Public cible | adultes, usage professionnel — **pas** de public enfant |
| Conformité aux règles familiales | sans objet, aucun public enfant déclaré |

## Notes pour la revue Play

```
Tools Free fonctionne intégralement sans compte : catalogue, calculs, Atelier de traçage,
projets locaux et exports PDF/SVG sont accessibles dès le lancement, hors connexion comprise.

La création de compte n'a pas lieu dans l'application : l'écran Compte ouvre app.elsatia.fr
dans le navigateur. Un compte de revue dédié est fourni pour contrôler Tools Pro, la
synchronisation et la restauration d'achat.

Abonnements : tools_pro_monthly et tools_pro_annual, exclusivement par Google Play Billing.
Aucun paiement externe n'est proposé ni suggéré depuis l'application Android. La gestion
d'abonnement ouvre play.google.com/store/account/subscriptions.

Suppression de compte : écran Compte, ou directement
https://tools.elsatia.fr/suppression-compte, accessible sans connexion.

Compte de revue : review@elsatia.fr — mot de passe saisi dans Play Console uniquement.
```

## À la charge de Julien avant saisie

- [ ] relecture juridique de la description
- [ ] e-mail de contact public à choisir — il sera visible de tous
- [ ] décision sur la revendication tablette
- [ ] contrôle des URL (200 attendu)
- [ ] création du compte de revue et saisie de son mot de passe **dans la console uniquement**
