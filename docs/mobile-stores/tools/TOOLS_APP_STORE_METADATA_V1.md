# ELSATIA Tools — métadonnées App Store — V1

Base : `094bd43`. Textes prêts à saisir, **après relecture juridique et commerciale par Julien**.
Rien n'a été saisi dans App Store Connect.

## Règle appliquée à tous les textes

Ne décrire que ce que le code fait aujourd'hui. En particulier, **ne pas mentionner** :

- ELSATIA Gestion Pro et ELSATIA Colors — ce sont d'autres applications, hors de cette fiche ;
- une fonction non ouverte, même prévue ;
- un chiffre de clientèle, de chantiers ou de téléchargements — aucun n'existe et aucun ne
  serait vérifiable ;
- la marque suivie du symbole ®. ELSATIA est une marque déposée ; la mention « marque déposée »
  est admissible, le symbole ® ne l'est pas tant que l'enregistrement n'est pas prononcé.

## Champs

| Champ | Valeur | Limite Apple |
|---|---|---|
| Name | `ELSATIA Tools` | 30 — utilisé : 13 |
| Subtitle | `Calculs et tracés chantier` | 30 — utilisé : 26 |
| Bundle ID | `fr.elsatia.tools` | — |
| Primary category | Utilitaires | — |
| Secondary category | Productivité | — |
| Age rating | 4+ | — |
| Copyright | `© 2026 ELSATIA` — **forme légale exacte à confirmer** | — |

### Promotional text (170 max)

```
Les calculs essentiels du chantier, des plans cotés précis et vos tracés d'ouvrage
disponibles sur iPhone et iPad, y compris sans réseau.
```

### Description

```
ELSATIA Tools est la boîte à outils numérique conçue pour les professionnels du chantier.

Calculez, contrôlez et tracez depuis votre iPhone ou votre iPad, y compris sans réseau.
Tout ce qui est inclus reste accessible sans compte et sans abonnement.

INCLUS SANS ABONNEMENT
16 calculs de chantier : angles et équerrage, géométrie, surfaces, pentes et niveaux,
répartitions, quantités. Chaque calcul affiche son résultat, son schéma coté et la marche
à suivre pour le reporter sur le chantier.

L'Atelier de traçage est lui aussi inclus. Une bibliothèque de 13 modèles paramétriques —
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
Facultatif pour les outils Free. Un même compte retrouve vos droits sur le Web, iOS et
Android. Si vous travaillez pour plusieurs entreprises, chaque espace reste séparé.

CONFIDENTIALITÉ
Les calculs et les documents sont produits localement. Aucune permission sensible n'est
demandée : ni appareil photo, ni photos, ni localisation, ni micro, ni notifications.
Aucun traceur publicitaire, aucun outil de mesure d'audience.
```

### Keywords (100 caractères, virgules comprises, sans espace après la virgule)

```
chantier,BTP,calcul,géométrie,traçage,plan,cotation,artisan,mesure,PDF,tracé,équerrage
```

86 caractères. Ne pas répéter le nom de l'application ni la catégorie : Apple les indexe déjà.

### URL

| Champ | Valeur | État |
|---|---|---|
| Support URL | `https://elsatia.fr/contact` | à revérifier au dépôt |
| Marketing URL | `https://tools.elsatia.fr` | à revérifier au dépôt |
| Privacy Policy URL | `https://elsatia.fr/confidentialite` | **obligatoire** |

Ces trois URL sont celles de `src/lib/site.ts`. Apple vérifie qu'elles répondent : les contrôler
juste avant le dépôt, un 404 fait rejeter la fiche.

### Notes pour l'App Review

```
Tools Free fonctionne intégralement sans compte : catalogue d'outils, calculs, Atelier de
traçage, projets locaux et exports PDF/SVG sont accessibles dès le lancement, y compris hors
connexion. Vous pouvez évaluer l'essentiel de l'application sans vous connecter.

La création de compte ne se fait pas dans l'application : l'écran Compte renvoie vers
app.elsatia.fr dans le navigateur système. Un compte de revue dédié est fourni ci-dessous pour
contrôler Tools Pro, la synchronisation et la restauration d'achat.

ABONNEMENTS
Deux abonnements auto-renouvelables : fr.elsatia.tools.pro.monthly et
fr.elsatia.tools.pro.annual. L'achat passe exclusivement par StoreKit 2. Aucun paiement
externe n'est proposé ni suggéré depuis l'application iOS. Le bouton « Restaurer mes achats »
est sur l'écran Compte. La gestion d'abonnement ouvre apps.apple.com/account/subscriptions.

SUPPRESSION DE COMPTE
Écran Compte, puis « Supprimer mon compte », ou directement
https://tools.elsatia.fr/suppression-compte, accessible sans connexion. La demande est
enregistrée immédiatement et la session est fermée. Le compte ELSATIA étant commun à plusieurs
applications, la suppression est traitée après vérification des obligations légales de
conservation. L'écran indique explicitement que la suppression ne résilie pas l'abonnement
Apple, qui se gère depuis les réglages du compte Apple.

HORS LIGNE
L'application est un paquet local : aucune page n'est chargée depuis un serveur distant.
Vous pouvez couper le réseau, quitter et relancer : les calculs, l'Atelier et les exports
continuent de fonctionner.

COMPTE DE REVUE
Identifiant : review@elsatia.fr
Mot de passe : [à saisir dans App Store Connect, jamais dans Git]
```

Ne jamais fournir `julien@elsatia.fr` aux relecteurs.

### Nouveautés de cette version (première soumission)

```
Première version d'ELSATIA Tools.
```

## Localisation

Langue principale : **français (France)**. L'interface est intégralement en français, sans
chaîne anglaise résiduelle. Ne pas déclarer d'autre langue tant qu'aucune traduction n'existe :
une langue déclarée sans traduction fait rejeter la fiche.

## À la charge de Julien avant saisie

- [ ] relecture juridique de la description et des notes de revue
- [ ] forme légale exacte du copyright
- [ ] décision sur la mention « marque déposée »
- [ ] contrôle des trois URL (200 attendu)
- [ ] création du compte de revue et saisie de son mot de passe **dans la console uniquement**
