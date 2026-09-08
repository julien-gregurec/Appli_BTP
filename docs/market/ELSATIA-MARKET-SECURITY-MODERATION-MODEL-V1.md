# ELSATIA-MARKET-SECURITY-MODERATION-MODEL-V1

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1` — Phase 10
Révision : **R2 — décisions produit fermées** (`ELSATIA-MARKET-R2-FINAL-PRODUCT-DECISIONS`)
Branche : `feat/market-architecture-legal-business-v1` — base `1fc1331` — R1 `281769b`

---

## 1. Le changement de modèle de menace

Toutes les applications existantes de l'écosystème partagent une propriété : **elles ne sont
accessibles qu'à des utilisateurs authentifiés, membres d'une organisation cliente.** L'audit l'a
confirmé — aucune policy n'accorde de `select` au rôle `anon` sur une donnée métier, dans aucune des
272 migrations.

Market rompt cette propriété. Il expose des données de clients à **Internet**, à des visiteurs
anonymes, avec une messagerie ouverte entre inconnus et une incitation économique à la fraude.

| | Applications existantes | Market |
|---|---|---|
| Accès | authentifié, tenant | **anonyme, public** |
| Adversaire | utilisateur légitime maladroit, ex-salarié | **attaquant motivé, escroc, robot d'aspiration** |
| Donnée exposée | aucune hors tenant | annonces, identité d'entreprise, localisation approchée |
| Contenu | produit par des collègues | **produit par des inconnus, pour des inconnus** |
| Incitation à l'abus | faible | **forte** (biens de valeur, mise en relation) |

**Conséquence** : la sécurité de Market ne peut pas être une extension de celle des autres
applications. Elle a besoin de ses propres gardes.

---

## 2. Vérification des entreprises

### 2.1 Le dispositif (rappel et approfondissement)

| Niveau | Contrôle | Automatisable | Décision |
|---|---|:---:|---|
| **N1** | SIRET formellement valide : 14 chiffres, clé de Luhn | oui, hors ligne | automatique |
| **N2** | SIRET **existant et actif** dans un registre officiel, raison sociale concordante | oui, **source externe requise** | automatique |
| **N3** | Preuve de **rattachement** de la personne à l'entreprise | non | **revue humaine** |
| **N4** | Assurance RC pro / décennale (déjà sur `entreprises`), ancienneté, historique | partiel | alimente le score |

**N1 et N2 sont bloquants avant toute publication. N3 est bloquant avant la première publication.**

**Décision R2 : en l'absence de vérification automatique disponible, la validation manuelle par la
plateforme est le chemin de repli — et c'est un chemin de premier rang.** N2 se tient alors par
contrôle sur pièce (extrait de registre de moins de trois mois fourni par le demandeur), avec
`source_verification = 'revue_manuelle'` ou `'document_fourni'`, l'identité du modérateur et la pièce
conservée. Le modèle complet du dossier de vérification — champs, résultats, expiration, journal — est
spécifié au §2.7 de `ELSATIA-MARKET-FUNCTIONAL-SPECIFICATION-V1.md`.

**Décision R2 : aucun prestataire payant n'est choisi sans comparaison ultérieure.** Le modèle est
donc indépendant de la source : `source_verification` et `reference_source` sont des champs, pas des
constantes.

Le rejet de N2 doit être **motivé et contestable** : une entreprise récemment immatriculée, un
établissement fermé mais une entreprise active, un changement de dénomination — les cas légitimes
existent, et un refus automatique sans recours ferait fuir des clients valables.

### 2.2 Ce qui manque, et pourquoi c'est bloquant

L'audit l'établit : `entreprises.siret` est un `text` **nullable, sans format, sans unicité, sans
trace de vérification**. Aucune colonne ne dit si, quand, par qui et contre quelle source le SIRET a
été contrôlé.

**Sans N2, il n'y a pas de barrière à l'entrée.** Une place de marché de biens professionnels sans
barrière à l'entrée est un canal de recel. Ce n'est pas une hypothèse pessimiste : c'est le mode de
défaillance connu et documenté de ce type de service.

**Ce qui change en R2** : le prérequis n'est plus *contracter une source externe*, mais **tenir N2
par un moyen ou par un autre**. La validation manuelle rend l'ouverture possible sans contrat
externe. Le risque se déplace : il devient **opérationnel** — capacité de traitement, délai tenu,
homogénéité des décisions — et non plus contractuel.

Trois conséquences à assumer :

| Conséquence | |
|---|---|
| **Le délai devient une promesse commerciale** | un vendeur en attente de vérification est un vendeur qui ne paie pas encore et qui peut renoncer. Le délai annoncé doit être tenu. |
| **L'homogénéité doit être outillée** | des critères écrits, des motifs de refus normalisés et une revue croisée des refus, sans quoi deux modérateurs décideront différemment sur le même dossier. |
| **La montée en charge est bornée** | la revue manuelle ne suit pas au-delà d'un certain volume. L'automatisation de N2 reste l'objectif ; elle cesse seulement d'être un préalable au lancement. |

**Le pire scénario reste d'ouvrir sans aucune vérification.** Ni la voie automatique ni la voie
manuelle ne sont facultatives.

### 2.3 Conservation des pièces

Les pièces de N3 (et celles qu'imposerait la traçabilité DSA) sont des données sensibles.

| Règle | |
|---|---|
| Stockage | bucket **privé et dédié**, jamais mêlé aux photos d'annonces |
| Accès | modérateurs vérificateurs uniquement, **jamais** un rôle applicatif d'entreprise |
| Journalisation | **chaque accès** est journalisé, nominativement |
| Conservation | durée définie par le régime applicable (J-1/DSA) ; purge automatique à l'échéance |
| Exposition | **jamais** en réponse d'API publique, jamais dans un export d'entreprise |

---

## 3. Score de confiance vendeur

### 3.1 Principe

Un score **interne**, calculé, destiné à **prioriser la modération** — pas à classer les annonces.

**Le score ne doit pas influencer le classement public en V1.** Deux raisons : le DSA et le P2B
imposent la transparence des critères de classement, et un score opaque serait précisément ce qu'ils
proscrivent ; et un score reposant sur peu de données produit des injustices que le vendeur ne peut
ni comprendre ni contester.

### 3.2 Composantes

| Élément | Effet |
|---|---|
| Niveau de vérification atteint (N1→N4) | **+++** |
| Ancienneté du compte et de l'abonnement | ++ |
| Assurance RC pro / décennale renseignée | + |
| Annonces publiées sans incident | + |
| Remises confirmées par code de retrait | **++** |
| Réactivité aux demandes de contact | + |
| Preuves d'achat fournies | + |
| Signalements **fondés** reçus | **- - -** |
| Annonces refusées ou suspendues | - - |
| Tentatives de publication en catégorie interdite | **- - -** |
| Annonces vendues hors plateforme et non retirées | - |
| Messages détectés comme tentative de sortie de plateforme | - - |

### 3.3 Usage

| Usage | Autorisé |
|---|---|
| Priorisation de la file de modération | **oui** |
| Déclenchement d'une vérification a priori | **oui** |
| Plafond d'annonces pour un compte récent | **oui**, si annoncé dans les CGU |
| Classement des résultats publics | **non en V1** |
| Affichage public d'une note | **non** |
| Suspension automatique | **non** — une suspension est toujours une décision humaine motivée |

---

## 4. Signalement et modération

### 4.1 Signalement

| Caractéristique | Choix |
|---|---|
| Accessible aux **anonymes** | **oui** — exigence DSA, et un signalement ne doit jamais être découragé |
| Rate-limité | oui, sur `rate_limits_applicatifs` (existant, identifiants hachés SHA-256) |
| Catégories | contenu illicite · bien dangereux ou interdit · contrefaçon · arnaque ou hameçonnage · usurpation d'entreprise · erreur de catégorie · autre |
| Accusé de réception | **oui**, si le signalant est identifié |
| Décision motivée notifiée | **oui** |
| Identité du signalant | **protégée** ; jamais communiquée au vendeur |
| Signalement abusif répété | compté ; limitation du signalant |

Le signalement **« ce vendeur usurpe mon entreprise »** est traité en **priorité absolue** : c'est le
signal le plus fiable d'une fraude en cours, et la victime est un tiers qui n'a aucun autre recours.

### 4.2 File de modération

```
   ENTRÉES                                    PRIORITÉ
   ────────────────────────────────────────────────────
   Signalement « usurpation »            →    P0  immédiat
   Signalement « bien dangereux/interdit »→   P0  immédiat
   Signalement « contrefaçon »           →    P1
   Signalement « arnaque »               →    P1
   Annonce en catégorie sous conditions  →    P2  a priori, avant publication
   Première annonce d'une entreprise     →    P2  a priori
   Détection automatique (prix, motifs)  →    P3
   Autres signalements                   →    P3
   Contrôle par échantillon              →    P4
```

**Décisions possibles** : accepter · accepter avec correction demandée · refuser (motivé) ·
suspendre (motivé) · suspendre le compte vendeur · escalader vers le Global Owner ·
signaler aux autorités.

**Chaque décision est motivée, notifiée, journalisée et contestable.** Ce n'est pas une politesse :
c'est une obligation DSA et P2B, et c'est ce qui préserve la position juridique d'ELSATIA.

### 4.3 Contestation

```
décision → notification motivée → contestation par le vendeur (délai borné)
        → réexamen par un modérateur DIFFÉRENT → décision motivée → clôture
```

Le réexamen par une personne différente n'est pas une formalité : c'est ce qui distingue un recours
d'une confirmation automatique.

### 4.4 Contrôle des images

| Contrôle | Moment | Nature |
|---|---|---|
| Format, taille, nombre | à l'envoi | technique |
| **Suppression des métadonnées EXIF** — GPS en premier lieu | à l'envoi | **impératif** : sans cela, l'adresse exacte du dépôt que le modèle protège fuite par la photo |
| Redimensionnement, vignettes | à l'envoi | technique |
| Détection de contenu manifestement inapproprié | à l'envoi | **externe** — dépendance à contracter |
| Détection de coordonnées incrustées dans l'image | a posteriori | contournement de la messagerie |
| Revue humaine | sur signalement, ou catégorie sous conditions | — |

La suppression de l'EXIF est le point le plus souvent négligé et l'un des plus dommageables : une
photo de matériel prise dans un dépôt porte les coordonnées GPS de ce dépôt.

---

## 5. Messagerie : limitation, blocage, protection

| Menace | Contre-mesure |
|---|---|
| Spam de masse | quota de messages par compte et par jour, **croissant avec l'ancienneté et le score** |
| Démarchage commercial déguisé | détection de motifs répétitifs ; le message commercial non sollicité est interdit par les CGU |
| Hameçonnage par lien de paiement | **aucun lien externe cliquable** dans les messages en V1 ; bandeau permanent : ELSATIA n'encaisse jamais le prix d'un bien |
| Sortie de plateforme dès le premier message | détection des motifs de coordonnées (téléphone, e-mail, messageries) ; avertissement à l'auteur **et** au destinataire ; pondération du score |
| Harcèlement | blocage entre comptes, bilatéral et immédiat |
| Usurpation d'identité dans le fil | l'identité affichée est celle du **compte vérifié**, jamais un libellé saisi |
| Pièces jointes | **interdites en V1** — vecteur de logiciel malveillant, sans contrepartie fonctionnelle |

**Accès de la modération aux conversations privées.** Règle stricte :

1. **Aucun accès par défaut**, pour personne — modérateur, support, Global Owner compris.
2. Accès **uniquement** sur signalement portant sur cette conversation, et **limité aux messages
   concernés**.
3. Chaque accès est **journalisé nominativement**.
4. **Les deux parties en sont informées.**

Une messagerie lisible par la plateforme « au cas où » est un passif RGPD et un risque de fuite. Ce
n'est pas une prudence excessive : c'est la condition pour que les utilisateurs s'y expriment.

---

## 6. Fraudes spécifiques aux places de marché

| Fraude | Signal | Contre-mesure |
|---|---|---|
| **Annonce fantôme** (bien inexistant, acompte demandé) | vendeur récent, prix bas, pression à payer d'avance | N1–N3 ; aucun paiement plateforme ; avertissement explicite ; score |
| **Faux transporteur** | proposition d'un transporteur « partenaire », lien de paiement | aucun transporteur recommandé en V1 ; avertissement dès que l'expédition est évoquée |
| **Hameçonnage de vendeur** (faux acheteur, faux justificatif) | message hors sujet, urgence, lien | pas de lien cliquable ; e-mail vendeur jamais exposé |
| **Usurpation d'entreprise** | SIRET d'un tiers, raison sociale connue | N2 + N3 ; signalement P0 ; suspension immédiate sur faisceau d'indices |
| **Faux produits / contrefaçon** | marque premium, prix anormal, photos génériques | signalement prioritaire ; retrait ; conservation des éléments |
| **Prix manifestement frauduleux** | écart statistique fort par catégorie | mise en file **P3**, jamais un blocage automatique — un déstockage réel peut être très bas |
| **Recel** | absence de preuve d'achat, numéro de série retiré, lots hétérogènes récurrents | numéro de série collecté ; preuve d'achat pondérée ; coopération sur réquisition |
| **Aspiration du catalogue** | volume, régularité, absence de session | rate-limiting ; pagination bornée ; pas d'API publique ; coordonnées absentes des pages |
| **Énumération des vendeurs** | recherche par fragments de SIRET | **aucune recherche par SIRET partiel** — garde reprise de l'annuaire Réserves |
| **Fraude au paiement** | — | **sans objet en V1** : ELSATIA n'encaisse pas la vente. C'est le principal bénéfice sécurité du modèle S1+S5+S6. |

---

## 7. Multi-tenant, RLS, exposition publique

### 7.1 Les trois surfaces

```
┌─────────────────────────────────────────────────────────────┐
│ SURFACE PUBLIQUE — anonyme                                  │
│  · projection index_recherche_annonces (annonces PUBLIÉES,  │
│    champs PUBLICS uniquement)                               │
│  · fonctions security definer à PROJECTION EXPLICITE        │
│  · bucket photos public                                     │
│  · aucun identifiant technique ne circule                   │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ SURFACE AUTHENTIFIÉE — acheteur                             │
│  · favoris, alertes, conversations, offres, réservations    │
│  · RLS par sujet (compte particulier OU membre d'organisation)│
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ SURFACE VENDEUR — tenant                                    │
│  · RLS par entreprise_id + a_acces_application('market')    │
│    + habilitation + rôle Market                             │
│  · partie privée des annonces, pièces, journal              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Les six règles non négociables

| # | Règle |
|---|---|
| **S1** | La surface publique lit **une projection**, jamais les tables métier. Ce qui n'est pas public n'y est **pas présent** — pas « filtré », **absent**. |
| **S2** | Toute lecture publique passe par une **fonction à projection explicite**, sur le patron `reserves_annuaire_rechercher` : les colonnes retournées sont écrites dans la signature. Une colonne ajoutée plus tard ne peut pas fuiter par inadvertance. |
| **S3** | **Aucun identifiant technique** en réponse publique : ni `entreprise_id`, ni identifiant interne d'annonce, ni chemin de stockage. Seule la `reference_publique` **opaque et non séquentielle** circule. |
| **S4** | Les gardes anti-énumération de l'annuaire Réserves sont **reprises et durcies** : longueur minimale de terme, plafond de résultats, profondeur de pagination bornée, rate-limiting. **Jamais de recherche par SIRET partiel.** |
| **S5** | Le bucket photos public ne contient **que** des photos d'annonces publiées, aux noms opaques, **sans EXIF**. Les pièces de vérification sont dans un bucket privé distinct. |
| **S6** | Aucune donnée Market n'est copiée hors du périmètre RLS — **pas de moteur de recherche externe** en V1. C'est la principale voie de fuite multi-tenant d'une marketplace, et elle est fermée par construction. |

### 7.3 Le sujet double

Market introduit un sujet que les RLS existantes ne connaissent pas : un **utilisateur authentifié
sans organisation**. Les policies Market devront gouverner deux formes de sujet, ce qui double les
cas de test.

**Recommandation** : une **fonction de résolution unique**, `market_sujet_courant()`, retournant le
type de sujet (`particulier` / `membre_organisation` / `plateforme`) et son identifiant. Toutes les
policies s'appuient sur elle. Écrire la règle deux fois dans chaque policy garantit qu'un jour l'une
des deux divergera.

---

## 8. Accès d'assistance

**Règle absolue** : l'administrateur plateforme n'accède à un espace vendeur **que** par le mécanisme
d'assistance existant — justifié, borné, notifié.

| Exigence | Existant |
|---|---|
| Motif obligatoire (≥ 5 caractères) | `plateforme_acces_entreprises.motif` — **livré** |
| Horodatage d'entrée et de sortie | `commence_at` / `termine_at` / `termine_motif` — **livré** |
| Garde de lecture | `est_acces_support_actif()` — **livré** |
| Ouverture / fermeture explicite | `plateforme_entrer_entreprise` / `plateforme_quitter_entreprise` — **livré** |
| Journal des actions | `plateforme_journal_actions` + `plateforme_journaliser()` — **livré** |
| **Notification à l'entreprise** | lot `9fcf128` — **NON FUSIONNÉ** |
| **Assistance stricte par défaut, verrouillée en Production** | lot `9fcf128` — **NON FUSIONNÉ** |

**Market ne réimplémente rien.** Il **dépend** de la fusion de `9fcf128`.

Restrictions propres à Market, en supplément :

- l'assistance **ne donne jamais** accès aux conversations privées (§5) ;
- elle **ne permet jamais** de publier, modifier ou retirer une annonce **au nom** du vendeur — le
  modérateur agit sous **son propre** rôle de modération, visiblement, avec motif ;
- la notification de l'ouverture d'un accès est une **notification de sécurité**, donc **jamais
  désactivable**.

---

## 9. Journal append-only

Sur le motif éprouvé de la maison (Colors, Réserves, notes de frais, paie).

**Événements journalisés** : cycle de vie de l'annonce (chaque transition, avec motif) · toute
publication et dépublication · toute décision de modération et sa contestation · tout signalement ·
toute vérification d'entreprise · toute offre, acceptation, refus · toute réservation et son issue ·
toute remise confirmée · toute révélation de coordonnées · tout accès d'assistance · tout accès à une
conversation par la modération · toute modification d'annonce publiée (avec la version antérieure).

**Propriétés** : insertion seule — ni `update`, ni `delete`, garantis par trigger ; auteur,
horodatage, motif ; **conservation des preuves** pour la durée légale ; **restituable aux deux
parties** en cas de litige, dans la limite de ce qui les concerne.

---

## 10. Suppression, effacement, export

| Objet | Suppression | Motif |
|---|---|---|
| Annonce | `archivee`, **jamais de suppression physique** | doctrine maison ; preuve ; traçabilité |
| Photo d'annonce | retirée du bucket public à l'archivage, après délai | minimisation |
| Conversation | archivée, purgée après délai borné | RGPD |
| Compte particulier | demande différée, sur le patron `tools_demandes_suppression_compte` | délai de rétractation ; litiges en cours |
| Compte vendeur | rattaché à l'entreprise : `demander_suppression_entreprise()` existe | — |
| Journal | **jamais supprimé** ; **pseudonymisé** à l'échéance | conciliation traçabilité / droit à l'effacement — **J-19 à valider** |
| Pièces de vérification | purge automatique à l'échéance légale | données sensibles |

**Export RGPD.** `exporter_donnees_entreprise()` existe et couvre le périmètre **entreprise** — il
devra intégrer les données Market. **Rien n'existe pour un particulier** : c'est un développement à
part entière, et il est **obligatoire** dès qu'un compte particulier existe.

---

## 11. Ce qui manque aujourd'hui — récapitulatif sécurité

| Brique | État | Bloquant pour l'ouverture |
|---|---|:---:|
| Vérification d'entreprise (N1–N3) | **inexistante** — modèle de dossier à construire | **OUI** |
| Source externe de vérification (N2 automatique) | non contractée | **non** — repli par validation manuelle (§2.2) |
| Capacité de traitement manuel des dossiers | à organiser | **OUI** si la voie manuelle est retenue |
| Signalement et file de modération | **inexistants** | **OUI** |
| Contrôle d'image (EXIF, contenu) | **inexistant** | **OUI** (EXIF au minimum) |
| Policies de lecture anonyme gouvernée | **inexistantes** | **OUI** |
| Sujet « particulier sans organisation » | **inexistant** | **OUI** si compte acheteur |
| Export RGPD particulier | **inexistant** | **OUI** si compte acheteur |
| Notification d'accès d'assistance | lot `9fcf128` **non fusionné** | **OUI** |
| Score de confiance | inexistant | non (V1 dégradée possible) |
| Rate-limiting | **livré et réutilisable** | non |
| Journal append-only (motif) | **livré**, à instancier | non |
| Assistance justifiée (mécanisme) | **livré** | non |

---

## 12. Confirmation

Modèle de sécurité et de modération. Aucun code, aucune migration, aucun SQL proposé, aucun objet
Stripe, aucune Production, aucun dépôt tiers modifié.
