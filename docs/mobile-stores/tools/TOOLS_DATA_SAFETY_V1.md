# ELSATIA Tools — Google Play Data Safety — V1

Base : `094bd43`. Établi à partir du comportement réel du code. Aucune déclaration fictive.

Play Console demande, pour **chaque** type de données : est-elle collectée, est-elle partagée,
est-elle chiffrée en transit, est-elle obligatoire, à quoi sert-elle, et l'utilisateur peut-il en
demander la suppression. La matrice ci-dessous répond aux six colonnes.

## Vocabulaire Play, et son application ici

- **Collected** : la donnée quitte l'appareil vers un serveur. Ce qui reste sur l'appareil n'est
  **pas** « collecté » au sens de Play — c'est ce qui exempte tout le mode Free.
- **Shared** : la donnée est transmise à un **tiers**. Un sous-traitant qui héberge pour le
  compte de l'éditeur n'est pas un tiers.
- **Optional** : l'utilisateur peut se servir de l'application sans fournir la donnée.

Sur ce dernier point, Tools est dans une position simple : **tout le mode Free fonctionne sans
compte**. Chaque donnée ci-dessous est donc facultative.

## Matrice

| Type de données | Collectée | Partagée | Chiffrée en transit | Obligatoire | Finalité |
|---|---|---|---|---|---|
| **E-mail** | Oui, si compte connecté | Non | Oui (HTTPS) | Non — facultative | Gestion du compte |
| **ID utilisateur** | Oui, si compte connecté | Non | Oui (HTTPS) | Non — facultative | Gestion du compte, fonctionnalité |
| **Historique d'achat** | Oui, si abonnement | Non | Oui (HTTPS) | Non — facultative | Fonctionnalité de l'application |
| **Fichiers et documents** (tracés, projets) | Oui, **uniquement si la synchronisation est activée** | Non | Oui (HTTPS) | Non — facultative | Fonctionnalité de l'application |
| Nom, adresse postale, téléphone | Non | — | — | — | — |
| Position approximative ou précise | Non | — | — | — | — |
| Photos et vidéos | **Non** | — | — | — | — |
| Fichiers audio | Non | — | — | — | — |
| Contacts, agenda | Non | — | — | — | — |
| Messages | Non | — | — | — | — |
| Informations financières | Non | — | — | — | — |
| Santé et forme | Non | — | — | — | — |
| Activité dans l'application, historique de navigation ou de recherche | **Non** | — | — | — | — |
| Journaux de plantage, diagnostics, performances | **Non** | — | — | — | — |
| Identifiants publicitaires | **Non** | — | — | — | — |

## Réponses aux questions globales

| Question | Réponse | Justification |
|---|---|---|
| L'application collecte-t-elle des données ? | **Oui** | dès qu'un compte ELSATIA est connecté |
| Les données sont-elles chiffrées en transit ? | **Oui** | HTTPS exclusivement ; `allowMixedContent = false` dans la configuration Capacitor, vérifié par test |
| L'utilisateur peut-il demander la suppression ? | **Oui** | in-app et par URL publique — voir ci-dessous |
| Les données sont-elles partagées avec des tiers ? | **Non** | Supabase, Apple et Google agissent comme fournisseurs, pas comme destinataires tiers |
| L'application est-elle destinée aux enfants ? | **Non** | usage professionnel |
| L'application contient-elle de la publicité ? | **Non** | aucun SDK publicitaire |
| Suivi à des fins publicitaires ? | **Non** | aucun identifiant publicitaire lu |
| L'application a-t-elle été auditée par un tiers indépendant ? | **Non** | ne pas cocher : aucun audit externe n'a eu lieu |

## Suppression des données

Play exige une URL de suppression **atteignable sans installer l'application** :

```
https://tools.elsatia.fr/suppression-compte
```

La page est publique, accessible sans connexion, et propose deux voies : la demande in-app une
fois connecté, et une voie par e-mail sinon.

**Ce qu'il faut déclarer avec exactitude**, sous peine de contradiction entre la fiche et le
comportement réel : la demande est **enregistrée immédiatement** (statut `pending`), et la
suppression effective intervient **après** vérification des obligations légales de conservation.
Ce n'est pas une suppression instantanée, et la fiche ne doit pas le laisser croire.

Play distingue « supprimer le compte » et « supprimer les données ». Tools propose la suppression
du compte ELSATIA commun **et** des données associées : les deux cases se cochent.

Le délai de traitement et la liste des données conservées au titre d'une obligation légale
doivent être arrêtés par Julien et publiés dans la politique de confidentialité — c'est la
réserve **P1-3** du dossier. La fiche Data Safety doit dire la même chose que cette politique.

## Points d'attention

1. **Ne pas cocher « No data collected ».** Ce serait faux dès qu'un compte est connecté.
2. **Photos : non.** L'image de référence importée dans l'Atelier est lue par le sélecteur
   système, traitée dans la WebView et rattachée au tracé **local**. Elle ne part vers aucun
   serveur, et aucune permission `READ_MEDIA_IMAGES` n'est demandée — le manifeste fusionné le
   confirme.
3. **Diagnostics : non.** Aucun SDK de rapport de plantage n'est embarqué dans Tools.
4. **Les fichiers ne sont collectés que si la synchronisation est activée.** La déclaration doit
   rester conditionnelle : par défaut, sans compte, les tracés ne quittent pas l'appareil.
5. La fiche Data Safety doit être **relue à chaque version** qui touche à une donnée. Play
   sanctionne l'écart entre la déclaration et le comportement observé, y compris après publication.

## À faire avant la soumission

- [ ] saisir la matrice dans Play Console
- [ ] vérifier que `https://elsatia.fr/confidentialite` décrit les mêmes traitements
- [ ] arrêter le délai de traitement des demandes de suppression (P1-3) et le publier
- [ ] contrôler que l'URL de suppression répond 200 sans session
