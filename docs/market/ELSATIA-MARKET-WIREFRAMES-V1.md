# ELSATIA-MARKET-WIREFRAMES-V1

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1` — livrable 7
Révision : **R2 — décisions produit fermées** (`ELSATIA-MARKET-R2-FINAL-PRODUCT-DECISIONS`)
Nature : wireframes **fonctionnels**. Structure et contenu, pas de design.
Branche : `feat/market-architecture-legal-business-v1` — base `1fc1331` — R1 `281769b`

---

## 0. Cadre et avertissements

**Ces wireframes ne copient aucune place de marché existante** — ni sa structure, ni ses parcours,
ni ses textes, ni son identité graphique. Ils sont dérivés des seules contraintes établies dans ce
lot : distinction Boutique/Market, protection des coordonnées et de la localisation, catégories
réglementées, absence de paiement plateforme, obligations d'information du DSA et du P2B.

Trois traits les distinguent structurellement d'une place de marché grand public :

1. **Le vendeur est une entreprise vérifiée**, et cette vérification est affichée comme une
   information de premier plan, pas comme un badge décoratif.
2. **Il n'y a pas de bouton « Acheter ».** Le parcours mène à une mise en relation ou à une
   réservation, jamais à un paiement.
3. **Le formulaire de dépôt est piloté par la catégorie** : les mentions réglementaires ne sont pas
   une case à cocher en bas de page, elles sont un bloc bloquant au milieu du parcours.

**Aucun écran ne doit être produit avant le lot ELSATIA-UI-V2** (refonte visuelle préalable à la
commercialisation) : une UI réalisée maintenant serait à refaire.

Légende : `[ ]` bouton · `( )` option · `[x]` case cochée · `▼` liste déroulante · `···` texte libre

---

## 1. Vitrine publique

### W-01 — Accueil Market (visiteur anonyme)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ELSATIA Market                          [Rechercher] [Vendre] [Se connecter]│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Surplus, matériaux et matériel professionnels                              │
│   Publiés par des entreprises vérifiées.                                     │
│                                                                              │
│   ┌────────────────────────────────────────────────────┬──────────────────┐  │
│   │ Que cherchez-vous ?                            ··· │ Code postal  ··· │  │
│   └────────────────────────────────────────────────────┴──────────────────┘  │
│                                                          [ Rechercher ]      │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  PARCOURIR PAR CATÉGORIE                                                     │
│                                                                              │
│   Matériaux de construction        Outillage à main                          │
│   Matériaux d'isolation            Outillage électroportatif                 │
│   Peintures et produits            Machines de chantier                      │
│   Consommables                     Engins de levage                          │
│   Équipements techniques           Équipements de protection                 │
│   Mobilier professionnel           Véhicules et remorques                    │
│   Pièces détachées                 Lots de déstockage                        │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ANNONCES RÉCENTES                                        Trier par ▼ Date   │
│  ┌────────────┬────────────┬────────────┬────────────┐                       │
│  │  [photo]   │  [photo]   │  [photo]   │  [photo]   │                       │
│  │ Titre      │ Titre      │ Titre      │ Titre      │                       │
│  │ 000 € HT   │ 000 € HT   │ 000 € HT   │ 000 € HT   │                       │
│  │ Bon état   │ Neuf       │ Usagé      │ Bon état   │                       │
│  │ Ville (00) │ Ville (00) │ Ville (00) │ Ville (00) │                       │
│  └────────────┴────────────┴────────────┴────────────┘                       │
│                                                       [ Voir plus ]          │
├──────────────────────────────────────────────────────────────────────────────┤
│  ⓘ  ELSATIA n'est pas vendeur des biens publiés ici. Chaque bien appartient   │
│     à l'entreprise qui le publie. ELSATIA n'encaisse pas le prix des biens.   │
│                                                                              │
│     Vous cherchez les produits ELSATIA (cartes, accessoires, licences,        │
│     formations) ? → Boutique ELSATIA                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  Mentions légales · CGU Market · Modération · Critères de classement ·        │
│  Confidentialité · Signaler un contenu · Contact                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Décisions portées par cet écran**

- Le bandeau ⓘ est **permanent et non fermable**. C'est la matérialisation de la distinction
  Boutique/Market, qui gouverne toute la responsabilité juridique.
- Le lien vers la Boutique est explicite : ne pas la mentionner créerait la confusion qu'on cherche
  à éviter.
- « Critères de classement » figure dans le pied de page dès la V1 (DSA + P2B).
- « Signaler un contenu » est accessible **sans compte**.
- Aucun compte à rebours, aucune fausse rareté, aucun « plus que 2 restants » : les interfaces
  trompeuses sont proscrites par le DSA.

---

### W-02 — Résultats de recherche

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ELSATIA Market   [ carrelage extérieur          ] [ 67000 ] [ Rechercher ]  │
├───────────────────────┬──────────────────────────────────────────────────────┤
│  FILTRES              │  128 annonces · « carrelage extérieur »               │
│                       │  autour de 67000                    Trier par ▼      │
│  Catégorie            │                                     · Pertinence     │
│   ▼ Matériaux (86)    │  ┌─────────────────────────────────────────────────┐ │
│     Isolation (12)    │  │ [photo]  Titre de l'annonce                     │ │
│     Consommables (30) │  │          000,00 € HT  ·  pour le lot            │ │
│                       │  │          Bon état · 45 m² · Lot                 │ │
│  Prix HT              │  │          Ville (00) · à moins de 15 km          │ │
│   [min ]  [max ]      │  │          ✔ Entreprise vérifiée                  │ │
│                       │  │          Retrait sur place · Expédition possible│ │
│  État                 │  └─────────────────────────────────────────────────┘ │
│   [x] Neuf            │  ┌─────────────────────────────────────────────────┐ │
│   [x] Très bon        │  │ [photo]  Titre de l'annonce                     │ │
│   [ ] Bon             │  │          000,00 € TTC ·  à l'unité              │ │
│   [ ] Usagé           │  │          ⚑ Mise en avant                        │ │
│   [ ] Pour pièces     │  │          Neuf · 120 u · disponible              │ │
│                       │  │          Ville (00) · à moins de 30 km          │ │
│  Distance             │  │          ✔ Entreprise vérifiée                  │ │
│   ▼ 50 km             │  │          Retrait sur place                      │ │
│                       │  └─────────────────────────────────────────────────┘ │
│  Remise / livraison   │                                                      │
│   [ ] Retrait place   │                       [ Afficher plus de résultats ] │
│   [ ] Expédition      │                                                      │
│                       │  ⓘ Comment ces résultats sont-ils classés ?          │
│  Quantité min.        │                                                      │
│   [      ]            │                                                      │
│                       │                                                      │
│  Nature               │                                                      │
│   (•) Toutes          │                                                      │
│   ( ) Vente           │                                                      │
│   ( ) Échange         │                                                      │
│                       │                                                      │
│  Vendeur              │                                                      │
│   [ ] Vérifié N3      │                                                      │
└───────────────────────┴──────────────────────────────────────────────────────┘
```

**Décisions portées par cet écran**

- **« à moins de 15 km »**, jamais « 12,4 km » : la distance est arrondie, conformément à la règle de
  précision de localisation. Une distance exacte depuis plusieurs points permet de trianguler
  l'adresse du dépôt.
- **HT ou TTC est affiché sur chaque ligne**, jamais sous-entendu.
- **⚑ Mise en avant** est un marqueur **visible** : une place payante non signalée est une pratique
  trompeuse et un manquement au P2B.
- **« Comment ces résultats sont-ils classés ? »** est un lien permanent, pas une mention en pied de
  page.
- Le bouton est « Afficher plus de résultats », pas une pagination numérotée : la pagination par
  curseur est une exigence de tenue en charge **et** une garde anti-aspiration.

---

### W-03 — Fiche d'annonce (visiteur anonyme)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Market ›  Matériaux de construction ›  Carrelage                            │
├──────────────────────────────────┬───────────────────────────────────────────┤
│                                  │  Titre de l'annonce                       │
│      ┌────────────────────┐      │                                           │
│      │                    │      │  000,00 € HT   ·   pour le lot            │
│      │      [ photo ]     │      │  soit 000,00 € TTC                        │
│      │                    │      │  ○ Prix négociable                        │
│      └────────────────────┘      │                                           │
│      [▪][▫][▫][▫][▫]  1/5        │  Quantité      45 m²                      │
│                                  │  État          Bon état                   │
│  ─────────────────────────────   │  Nature        Vente                      │
│  DESCRIPTION                     │  Disponible    immédiatement              │
│  ···························     │  Annonce       publiée le 00/00/0000      │
│  ···························     │                expire le 00/00/0000       │
│  ···························     │  Référence     MK-XXXXXXXX                │
│                                  │                                           │
│  ─────────────────────────────   │  ┌─────────────────────────────────────┐  │
│  CARACTÉRISTIQUES                │  │  VENDEUR                            │  │
│  Marque         ·····            │  │  Raison sociale                     │  │
│  Modèle         ·····            │  │  ✔ Entreprise professionnelle       │  │
│  Référence      ·····            │  │    vérifiée                         │  │
│  Dimensions     ·····            │  │  Ville (00) · Bas-Rhin              │  │
│  Poids          ·····            │  │  Membre depuis 00/0000              │  │
│  Couleur        ·····            │  │  00 annonces en ligne               │  │
│                                  │  │                                     │  │
│  ─────────────────────────────   │  │  [ Contacter le vendeur ]           │  │
│  REMISE ET LIVRAISON             │  │  [ Faire une proposition de prix ]  │  │
│  ✔ Retrait sur place             │  │  [ Demander une réservation ]       │  │
│  ✔ Expédition possible           │  │                                     │  │
│    frais indicatifs : ·····      │  │  ⓘ Ces actions nécessitent un       │  │
│  Secteur : Ville (00)            │  │    compte ELSATIA (gratuit).        │  │
│  [ carte — zone approximative ]  │  └─────────────────────────────────────┘  │
│                                  │                                           │
│  ─────────────────────────────   │  ⓘ ELSATIA n'est pas vendeur de ce bien.  │
│  GARANTIE                        │    La vente se conclut directement entre  │
│  Garantie légale applicable      │    vous et l'entreprise vendeuse.         │
│  (vendeur professionnel)         │    ELSATIA n'encaisse pas le prix.        │
│                                  │                                           │
│  ─────────────────────────────   │  [ ⚑ Signaler cette annonce ]             │
│  CONDITIONS PARTICULIÈRES        │                                           │
│  ···························     │                                           │
└──────────────────────────────────┴───────────────────────────────────────────┘
```

**Décisions portées par cet écran**

- **Aucun bouton « Acheter ».** Trois actions seulement : contacter, proposer un prix, demander une
  réservation. Le parcours ne peut pas laisser croire à un achat en ligne.
- **HT et TTC affichés ensemble** : le visiteur ne sait pas encore s'il est professionnel.
- Le vendeur est identifié par sa **raison sociale et sa ville**. Ni e-mail, ni téléphone, ni
  adresse, ni nom de personne physique.
- **La carte montre une zone, pas un point.** Elle est calculée à la publication et figée.
- **`MK-XXXXXXXX` est opaque et non séquentiel** : un compteur trahirait le volume d'activité de la
  plateforme.
- « Signaler » est accessible **sans compte**.
- La mention de garantie est **déduite du statut du vendeur**, pas laissée au hasard d'une saisie.

---

### W-04 — Variante : annonce en catégorie réglementée

```
│  ─────────────────────────────────────────────────────────────────────────   │
│  ⚠  INFORMATIONS RÉGLEMENTAIRES                                              │
│                                                                              │
│  Catégorie : Machines de chantier                                            │
│                                                                              │
│  Année de fabrication          ·····                                         │
│  Marquage CE                   déclaré présent par le vendeur                │
│  Notice d'utilisation          disponible en français                        │
│  Dispositifs de sécurité       déclarés présents et fonctionnels             │
│  Certificat de conformité      fourni par le vendeur                         │
│  Dernier entretien             00/0000                                       │
│                                                                              │
│  Ces informations sont déclarées par le vendeur, sous sa responsabilité.      │
│  ELSATIA ne les vérifie pas et ne certifie ni l'état, ni la conformité,       │
│  ni la sécurité du matériel.                                                 │
│  ─────────────────────────────────────────────────────────────────────────   │
```

Bloc **non repliable**, **au-dessus** des boutons d'action. Une information de sécurité qu'il faut
déplier n'a pas été communiquée.

---

## 2. Parcours acheteur

### W-05 — Contact du vendeur (compte requis)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Contacter le vendeur — Titre de l'annonce                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Vous écrivez à : Raison sociale · Ville (00)                                 │
│                                                                              │
│  Votre message                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ······································································ │  │
│  │ ······································································ │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ⚠  Pour votre sécurité                                                      │
│     · ELSATIA n'encaisse jamais le prix d'un bien. Aucun paiement ne vous     │
│       sera demandé sur cette plateforme.                                      │
│     · Ne communiquez ni coordonnées bancaires, ni pièce d'identité.           │
│     · Méfiez-vous de toute demande de paiement d'avance, en particulier       │
│       via un transporteur proposé dans la conversation.                       │
│     · Restez sur la messagerie ELSATIA : vos échanges y sont conservés et      │
│       peuvent servir de preuve en cas de litige.                              │
│                                                                              │
│                                            [ Annuler ]  [ Envoyer ]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

L'avertissement est **au-dessus** du bouton d'envoi et **avant** le premier message, pas après.
C'est le moment où l'acheteur est le plus attentif et le moins engagé.

---

### W-06 — Proposition de prix

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Proposition de prix — Titre de l'annonce                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Prix demandé          000,00 € HT   pour le lot (45 m²)                     │
│                                                                              │
│  Votre proposition     [        ] € HT                                       │
│  Quantité souhaitée    [   45   ] m²      (lot entier — vente partielle      │
│                                            non proposée par le vendeur)       │
│  Message (facultatif)  ······················                                │
│                                                                              │
│  Votre proposition est valable 7 jours. Le vendeur peut l'accepter,          │
│  la refuser ou faire une contre-proposition.                                 │
│                                                                              │
│  Une proposition acceptée n'est pas un paiement : elle engage les deux       │
│  parties à conclure la vente directement entre elles.                        │
│                                                                              │
│                                            [ Annuler ]  [ Proposer ]         │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### W-07 — Réservation acceptée : révélation des informations de retrait

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ✔  Votre réservation a été acceptée                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│  Annonce      Titre de l'annonce                                             │
│  Quantité     45 m²                                                          │
│  Prix convenu 000,00 € HT                                                    │
│  Réservation  valable jusqu'au 00/00/0000 à 00h00                            │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  INFORMATIONS DE RETRAIT                                               │  │
│  │  Raison sociale                                                        │  │
│  │  Adresse complète du lieu de retrait                                   │  │
│  │  Code postal · Ville                                                   │  │
│  │  Contact : téléphone communiqué par le vendeur                         │  │
│  │  Horaires : ······                                                     │  │
│  │                                                                        │  │
│  │  VOTRE CODE DE RETRAIT :   [  A B 3 K 9 M  ]                          │  │
│  │  Communiquez ce code au vendeur au moment de la remise.               │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ⓘ Le règlement s'effectue directement avec le vendeur, selon les modalités   │
│    convenues entre vous. ELSATIA n'intervient pas dans le paiement.           │
│                                                                              │
│  Le vendeur doit vous remettre une facture.                                   │
│                                                                              │
│                        [ Annuler ma réservation ]  [ Ouvrir la conversation ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

C'est **le seul écran** où l'adresse précise et un téléphone apparaissent, et seulement pour
l'acheteur retenu, après accord explicite du vendeur. Le code de retrait est l'unique preuve de
remise que la plateforme produira.

---

## 3. Espace vendeur

### W-08 — Activation de Market : vérification professionnelle

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Activer ELSATIA Market — vérification de votre entreprise                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Market est réservé aux entreprises. Avant votre première annonce, nous       │
│  vérifions que votre entreprise existe et que vous y êtes rattaché.           │
│                                                                              │
│  ÉTAPE 1 — Identité de l'entreprise                    ✔ Vérifiée            │
│    SIRET             000 000 000 00000                                       │
│    Raison sociale    ·············                                           │
│    Adresse           ·············                                           │
│    Statut au registre  actif                                                 │
│                                                                              │
│  ÉTAPE 2 — Votre rattachement à l'entreprise           ⏳ En cours d'examen   │
│    Justificatif déposé le 00/00/0000                                         │
│    Examiné par ELSATIA · délai indicatif : 2 jours ouvrés                     │
│    [ Remplacer le justificatif ]                                             │
│                                                                              │
│  ÉTAPE 3 — Éléments de confiance (facultatif)                                │
│    [ ] Assurance responsabilité civile professionnelle   → déjà renseignée   │
│    [ ] Assurance décennale                               → déjà renseignée   │
│    Ces éléments ne sont pas publiés. Ils renforcent votre dossier.            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│  La vérification est gratuite et ne nécessite aucun abonnement.               │
│  Tant qu'elle n'est pas complète, vous pouvez préparer vos annonces en        │
│  brouillon, sans les publier.                                                 │
│                                                                              │
│                                     [ Préparer une annonce ]  (publication ⛔) │
└──────────────────────────────────────────────────────────────────────────────┘
```

La vérification est **le premier écran**, pas une formalité intercalée après la souscription. Elle
est aussi le point où le refus doit rester compréhensible et contestable.

**Elle est gratuite et antérieure à l'abonnement** : demander de payer avant d'avoir dit si
l'entreprise est acceptée serait à la fois commercialement absurde et juridiquement inconfortable.

L'ÉTAPE 1 est vérifiée automatiquement quand la source le permet, **et par examen sur pièce
sinon** — dans ce cas l'écran demande un extrait de registre de moins de trois mois et annonce le
délai. Le vendeur n'a pas à savoir laquelle des deux voies a été empruntée ; il doit seulement savoir
**où en est son dossier** et **quand il aura une réponse**.

---

### W-08 bis — Publication bloquée : souscription requise

Écran atteint depuis la prévisualisation (W-12), quand le vendeur clique « Soumettre à publication »
sans abonnement actif.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Publier « Titre de l'annonce »                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Votre annonce est prête. Il vous manque un abonnement Market pour la        │
│  publier.                                                                    │
│                                                                              │
│   ✔ Entreprise vérifiée                                                      │
│   ✔ Annonce complète — 4 photos, informations réglementaires renseignées      │
│   ⛔ Abonnement Market — aucun abonnement actif                               │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│  L'abonnement Market est nécessaire pour publier. Consulter les annonces      │
│  et acheter restent gratuits, pour vous comme pour vos acheteurs.             │
│                                                                              │
│  Votre brouillon est conservé. Vous le retrouverez tel quel.                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  [ choix de l'offre — paliers, périodicité, options ]                  │  │
│  │  (contenu et montants : non arbitrés — décision D-10)                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│                       [ Revenir au brouillon ]  [ Choisir un abonnement ]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Décisions portées par cet écran**

- Le blocage est **explicite et actionnable** (règle AB2) : il dit exactement ce qui manque, confirme
  ce qui est déjà acquis, et mène à la souscription. Un bouton grisé sans explication ferait perdre
  le vendeur au moment précis où il est le plus engagé.
- **« Votre brouillon est conservé »** est écrit, pas sous-entendu (règle AB3). C'est ce qui rend le
  refus supportable.
- Le rappel que la consultation et l'achat restent gratuits **pour ses acheteurs** est un argument
  commercial, pas une formalité : le vendeur paie pour être vu par une audience qui, elle, ne paie
  rien.
- Ce même écran sert au cas d'un abonnement **suspendu** ou **résilié**, et au cas d'un **quota de
  palier atteint** (règle AB6) — seule la ligne ⛔ change.
- **Aucun montant ne figure dans ce wireframe.** Les paliers relèvent de D-10.

---

### W-09 — Dépôt d'annonce, étape 1 : catégorie

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Nouvelle annonce                              Étape 1 sur 5 — Catégorie     │
├──────────────────────────────────────────────────────────────────────────────┤
│  Que souhaitez-vous publier ?                                                │
│                                                                              │
│  ┌──────────────────────┬──────────────────────┬──────────────────────┐      │
│  │ Matériaux            │ Outillage            │ Machines             │      │
│  │ de construction      │ à main               │ de chantier      ⚠   │      │
│  └──────────────────────┴──────────────────────┴──────────────────────┘      │
│  ┌──────────────────────┬──────────────────────┬──────────────────────┐      │
│  │ Peintures        ⚠   │ Isolation        ⚠   │ Engins de levage ⚠   │      │
│  │ et produits          │                      │                      │      │
│  └──────────────────────┴──────────────────────┴──────────────────────┘      │
│  ┌──────────────────────┬──────────────────────┬──────────────────────┐      │
│  │ Consommables         │ Mobilier             │ Véhicules        ⚠   │      │
│  │                      │ professionnel        │ et remorques         │      │
│  └──────────────────────┴──────────────────────┴──────────────────────┘      │
│                                                                              │
│  ⚠  Ces catégories demandent des informations réglementaires                 │
│     supplémentaires et sont vérifiées avant publication.                     │
│                                                                              │
│  Vous ne trouvez pas votre catégorie ? Certains biens ne peuvent pas être     │
│  publiés sur Market. → Voir la liste des biens non acceptés                   │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│  Ou partez d'un élément existant :                                            │
│  [ Depuis mon stock ]   [ Depuis Colors ]   [ Depuis mon outillage ]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

**La catégorie est choisie en premier** parce que c'est elle qui détermine tout le reste : les
champs, les mentions, la vérification a priori. Un formulaire générique suivi d'un « ah, mais pour
cette catégorie il faut aussi… » ferait abandonner le vendeur au pire moment.

Il n'y a **aucun champ « autre catégorie »** : une catégorie non instruite est non publiable.

---

### W-10 — Import depuis Colors

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Publier depuis ELSATIA Colors                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  Sélectionnez un seau                             [ Rechercher ···       ]   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (•) [photo] Marque · Produit · Teinte                                  │  │
│  │             Réf. ······  ·  RAL 0000 (approximatif)                    │  │
│  │             12,5 L restants sur 15 L  ·  Ouvert le 00/00/0000          │  │
│  ├────────────────────────────────────────────────────────────────────────┤  │
│  │ ( ) [photo] Marque · Produit · Teinte                                  │  │
│  │             40 % restants  ·  Fermé                                    │  │
│  │             ⚠ Quantité en pourcentage : vous devrez saisir un volume   │  │
│  │               ou un poids réel pour publier.                            │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  CE QUI SERA REPRIS                    CE QUI RESTE À SAISIR                  │
│   ✔ Marque, produit, référence          · Prix de vente                      │
│   ✔ Teinte, RAL, couleur                · Description commerciale            │
│   ✔ Quantité restante et unité          · Informations réglementaires        │
│   ✔ Photo principale (copiée)             (produit chimique)                 │
│   ✔ État d'ouverture                     · Conditions de retrait             │
│                                                                              │
│  ⓘ Votre seau n'est pas modifié et votre stock Colors n'est pas décrémenté.   │
│    L'annonce devient indépendante après création.                             │
│                                                                              │
│                                        [ Annuler ]  [ Reprendre ces éléments ]│
└──────────────────────────────────────────────────────────────────────────────┘
```

L'écran dit **explicitement** ce qui est repris, ce qui reste à faire, et ce qui **n'est pas**
modifié. C'est la traduction directe des règles B2 et B4 du document Bridge : le vendeur doit
comprendre que le pont est une commodité de saisie, pas une synchronisation.

Le cas « quantité en pourcentage » est signalé **avant** la sélection, pas après.

---

### W-11 — Dépôt d'annonce, étape 3 : mentions réglementaires (catégorie sous conditions)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Nouvelle annonce                Étape 3 sur 5 — Informations réglementaires │
│  Catégorie : Peintures et produits                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│  ⚠  Cette catégorie est soumise à des règles particulières. Ces informations │
│     sont obligatoires et engagent votre responsabilité de vendeur.            │
│                                                                              │
│  Le produit est-il dans son emballage d'origine, étiqueté ?                   │
│    (•) Oui        ( ) Non                                                    │
│    ⛔ Un produit chimique reconditionné ne peut pas être publié.              │
│                                                                              │
│  Étiquetage de danger présent et lisible                                     │
│    [x] Oui                                                                   │
│                                                                              │
│  Fiche de données de sécurité disponible pour l'acheteur                      │
│    (•) Oui        ( ) Sans objet — produit non dangereux                     │
│                                                                              │
│  Date limite d'utilisation      [ 00/0000 ]                                  │
│  Conditions de conservation     ·······················                      │
│                                                                              │
│  Modalités de remise                                                         │
│    [x] Retrait sur place                                                     │
│    [ ] Expédition   ⛔ L'expédition n'est pas disponible pour cette          │
│                        catégorie de produits.                                │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│  [ ] Je déclare que ce produit n'est pas interdit à la vente et que          │
│      j'en suis propriétaire.                                                 │
│                                                                              │
│  Ces déclarations sont conservées et horodatées.                             │
│                                                                              │
│                                          [ Précédent ]  [ Continuer ]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

Un `⛔` **bloque** le parcours et explique pourquoi. On ne laisse pas le vendeur remplir cinq écrans
avant de lui dire que sa publication est impossible.

---

### W-12 — Prévisualisation avant publication

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Nouvelle annonce                            Étape 5 sur 5 — Vérification    │
├──────────────────────────────────────────────────────────────────────────────┤
│  VOICI CE QUE VERRA UN VISITEUR                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                     [ aperçu fidèle de la fiche publique ]              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  CE QUI RESTE PRIVÉ                                                          │
│   · Adresse exacte du lieu de retrait — communiquée après accord             │
│   · Numéro de série — conservé, jamais affiché                               │
│   · Preuve d'achat — jamais affichée                                         │
│   · Votre nom — l'annonce est publiée au nom de l'entreprise                 │
│                                                                              │
│  AVANT DE PUBLIER                                                            │
│   ✔ Entreprise vérifiée                                                      │
│   ✔ Abonnement Market actif — 12 annonces sur 20                             │
│     (les deux conditions sont requises, et indépendantes)                     │
│   ✔ 4 photos                                                                 │
│   ✔ Informations réglementaires complètes                                    │
│   ⏳ Cette annonce sera vérifiée avant sa mise en ligne (catégorie soumise    │
│      à conditions). Délai indicatif : 1 jour ouvré.                           │
│                                                                              │
│                    [ Enregistrer en brouillon ]  [ Soumettre à publication ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Le bloc **« ce qui reste privé »** est un choix délibéré : il rassure le vendeur sur la protection de
ses données de dépôt, et il documente la règle au moment où elle s'applique.

---

### W-13 — Tableau de bord vendeur

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ELSATIA Market — Espace vendeur                    Raison sociale ▼         │
├──────────────────────────────────────────────────────────────────────────────┤
│  ✔ Entreprise vérifiée      Abonnement : Standard · 12/20 annonces actives   │
├──────────────────────────────────────────────────────────────────────────────┤
│  À TRAITER                                                                   │
│   ● 3 demandes de contact                                        [ Voir ]    │
│   ● 1 proposition de prix reçue                                  [ Voir ]    │
│   ● 1 réservation à confirmer                                    [ Voir ]    │
│   ⚠ 2 annonces expirent dans 7 jours                             [ Voir ]    │
│   ⚠ 1 annonce suspendue — motif communiqué                       [ Voir ]    │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  MES ANNONCES                        [ Toutes ▼ ]        [ + Nouvelle ]      │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ [img] Titre                     Publiée      45 m²   000 € HT        │    │
│  │       MK-XXXXXXXX               00 vues · 2 contacts · 1 proposition │    │
│  │       expire le 00/00/0000                    [ Modifier ] [ ··· ]   │    │
│  ├──────────────────────────────────────────────────────────────────────┤    │
│  │ [img] Titre                     Réservée     12 u    000 € HT        │    │
│  │       MK-XXXXXXXX               retrait attendu avant le 00/00       │    │
│  │       code attendu : ● ● ● ● ● ●              [ Confirmer la remise ] │    │
│  ├──────────────────────────────────────────────────────────────────────┤    │
│  │ [img] Titre                     Suspendue    ⚠                       │    │
│  │       MK-XXXXXXXX               Motif : informations réglementaires  │    │
│  │                                 incomplètes                          │    │
│  │                                 [ Corriger ]  [ Contester ]          │    │
│  ├──────────────────────────────────────────────────────────────────────┤    │
│  │ [img] Titre                     Brouillon                            │    │
│  │                                               [ Reprendre ] [ ··· ]  │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Une annonce suspendue affiche **son motif** et **deux voies** : corriger, ou contester. C'est
l'exigence DSA de recours, rendue concrète — pas un e-mail sans suite.

---

### W-14 — Confirmation de remise

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Confirmer la remise — Titre de l'annonce                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Acheteur     Prénom N.  (compte particulier)                                │
│  Quantité     12 u                                                           │
│  Prix convenu 000,00 € TTC                                                   │
│                                                                              │
│  Saisissez le code de retrait communiqué par l'acheteur :                     │
│                        [  _  _  _  _  _  _  ]                                │
│                                                                              │
│  Facultatif                                                                  │
│    [ ] Ajouter une photo de la remise                                        │
│    [ ] Recueillir la signature de l'acheteur                                 │
│                                                                              │
│  ⓘ La confirmation est définitive. Elle atteste, dans ELSATIA Market, que      │
│    la remise a eu lieu. Elle ne vaut ni preuve de paiement, ni attestation    │
│    de conformité du bien.                                                     │
│                                                                              │
│  N'oubliez pas :                                                             │
│    · d'établir votre facture ;                                               │
│    · d'enregistrer la sortie de stock correspondante dans Gestion Pro.        │
│                                                                              │
│                                        [ Annuler ]  [ Confirmer la remise ]  │
└──────────────────────────────────────────────────────────────────────────────┘
```

La formule **« ne vaut ni preuve de paiement, ni attestation de conformité »** est la limite exacte de
ce qu'ELSATIA atteste. Elle doit figurer à l'écran, pas seulement dans les CGU.

Le rappel de la sortie de stock est la matérialisation de la règle B2 : Market ne décrémente rien, il
rappelle.

---

### W-14 bis — Proposition d'échange entre professionnels

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Proposer un échange — Titre de l'annonce convoitée                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  Vous proposez à : Raison sociale · Ville (00)  ✔ Entreprise vérifiée        │
│                                                                              │
│  CE QUE VOUS DEMANDEZ                                                        │
│   Annonce      Titre · MK-XXXXXXXX                                           │
│   Quantité     [   45   ] m²        (disponible : 45 m²)                     │
│   Valeur affichée par le vendeur     000,00 € HT                             │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│  CE QUE VOUS PROPOSEZ EN ÉCHANGE                                             │
│   (•) Une de mes annonces publiées                                           │
│       ┌──────────────────────────────────────────────────────────────────┐   │
│       │ (•) [img] Titre · MK-XXXXXXXX · 12 u · 000 € HT                  │   │
│       │ ( ) [img] Titre · MK-XXXXXXXX · 3 u  · 000 € HT                  │   │
│       └──────────────────────────────────────────────────────────────────┘   │
│       Quantité proposée  [   12   ] u                                        │
│                                                                              │
│   ( ) Un bien non publié — à décrire                                         │
│       ⚠ Un bien non publié doit être décrit, catégorisé et photographié.     │
│         S'il relève d'une catégorie soumise à conditions, votre proposition   │
│         sera vérifiée avant d'être transmise.                                │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│  SOULTE (différence de valeur)                                               │
│   (•) Aucune soulte                                                          │
│   ( ) Je verse une soulte de      [        ] € HT   TVA ▼                    │
│   ( ) Je reçois une soulte de     [        ] € HT   TVA ▼                    │
│                                                                              │
│  Message (facultatif)   ······························                       │
│  Votre proposition est valable 7 jours.                                      │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│  ⓘ Un échange vaut deux ventes : chacun facture l'autre, chacun déclare sa    │
│    TVA. ELSATIA n'encaisse ni la soulte, ni la valeur de l'échange, et ne     │
│    calcule aucune de ces valeurs.                                             │
│                                                                              │
│    Si votre proposition est acceptée, deux codes de retrait seront émis :     │
│    un pour chaque remise. L'échange n'est conclu que lorsque les deux ont     │
│    été confirmés.                                                             │
│                                                                              │
│                                    [ Annuler ]  [ Proposer l'échange ]       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Décisions portées par cet écran**

- **Réservé aux professionnels vérifiés** : la qualité de l'interlocuteur est affichée en tête, et un
  particulier n'atteint jamais cet écran.
- **Proposer une annonce déjà publiée est le choix par défaut** : le bien a déjà passé la
  nomenclature, les mentions réglementaires et, le cas échéant, la vérification a priori. Le bien non
  publié reste possible — un vendeur peut ne pas vouloir exposer ce qu'il cède — mais l'écran
  annonce **immédiatement** qu'il déclenchera une vérification.
- **La soulte a trois états explicites**, dont « aucune ». Un champ montant laissé vide serait
  ambigu ; ici le sens du versement est déclaré.
- **« Un échange vaut deux ventes »** figure à l'écran, pas seulement dans les CGU. C'est le
  contresens le plus fréquent en matière d'échange professionnel, et il a des conséquences fiscales
  réelles.
- **Les deux codes de retrait sont annoncés avant l'engagement**, pas découverts après : c'est ce qui
  distingue un échange d'une vente dans le parcours, et le vendeur doit le savoir en proposant.
- ELSATIA n'encaisse ni la soulte ni la valeur de l'échange, **et ne calcule aucune de ces valeurs** —
  la seconde moitié de la phrase est aussi importante que la première.

---

## 4. Modération

### W-15 — File de modération

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Market — Modération                                        Modérateur ▼     │
├──────────────────────────────────────────────────────────────────────────────┤
│  P0  2   ·   P1  7   ·   P2  14   ·   P3  31   ·   P4  échantillon           │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ P0  USURPATION D'ENTREPRISE                        signalé il y a 12m│    │
│  │     MK-XXXXXXXX · Raison sociale · SIRET 000...                      │    │
│  │     « Cette entreprise n'a pas publié cette annonce »                │    │
│  │     Vendeur : vérifié N2 · compte créé il y a 3 jours · score 12/100 │    │
│  │                                             [ Examiner ]             │    │
│  ├──────────────────────────────────────────────────────────────────────┤    │
│  │ P0  BIEN POTENTIELLEMENT INTERDIT                  signalé il y a 40m│    │
│  │     MK-XXXXXXXX · Matériaux d'isolation                              │    │
│  │     « Plaques susceptibles de contenir de l'amiante »                │    │
│  │                                             [ Examiner ]             │    │
│  ├──────────────────────────────────────────────────────────────────────┤    │
│  │ P2  VÉRIFICATION A PRIORI                          en file depuis 4h │    │
│  │     MK-XXXXXXXX · Engins de levage · première annonce de l'entreprise│    │
│  │     ⚠ Rapport de vérification périodique : non fourni                │    │
│  │                                             [ Examiner ]             │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

### W-16 — Examen et décision

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Examen — MK-XXXXXXXX                                          P0 Usurpation │
├───────────────────────────────────┬──────────────────────────────────────────┤
│  ANNONCE                          │  DÉCISION                                │
│  [ aperçu de la fiche publique ]  │                                          │
│                                   │  ( ) Accepter — signalement non fondé    │
│  PARTIE PRIVÉE                    │  ( ) Demander une correction             │
│   Numéro de série  ·············  │  (•) Suspendre l'annonce                 │
│   Preuve d'achat   non fournie    │  ( ) Refuser définitivement              │
│   Origine          saisie manuelle│  ( ) Suspendre le compte vendeur         │
│   Créée par        (identité)     │  ( ) Escalader vers le propriétaire      │
│                                   │  ( ) Signaler aux autorités              │
│  VENDEUR                          │                                          │
│   Vérification     N2             │  Motif communiqué au vendeur (requis)    │
│   Rattachement N3  non fourni     │  ┌────────────────────────────────────┐  │
│   Compte créé      il y a 3 jours │  │ ·································· │  │
│   Score            12/100         │  └────────────────────────────────────┘  │
│   Signalements     1 (en cours)   │                                          │
│   Annonces         4 publiées     │  Note interne (non communiquée)          │
│                                   │  ┌────────────────────────────────────┐  │
│  SIGNALEMENT                      │  │ ·································· │  │
│   Catégorie  usurpation           │  └────────────────────────────────────┘  │
│   Auteur     identité protégée    │                                          │
│   Message    ···················  │  ⓘ Cette décision sera notifiée au       │
│                                   │    vendeur avec son motif, et pourra     │
│  CONVERSATIONS                    │    être contestée.                       │
│   🔒 Non accessibles              │    Elle est journalisée à votre nom.     │
│      Le signalement ne porte pas  │                                          │
│      sur une conversation.        │           [ Enregistrer la décision ]    │
└───────────────────────────────────┴──────────────────────────────────────────┘
```

**Le verrou 🔒 sur les conversations est le point le plus important de cet écran.** Le modérateur voit
explicitement qu'il n'y a pas accès, et pourquoi. Un accès systématique « pour instruire » serait un
passif RGPD majeur ; le rendre visuellement impossible est ce qui fait tenir la règle dans le temps.

---

## 5. Site public — rubrique « À venir »

### W-17 — Bloc Market dans `/a-venir`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ELSATIA Market                                              [ À VENIR ]     │
│                                                                              │
│  Une place de marché réservée aux professionnels, pour vendre leurs           │
│  surplus de chantier, matériaux, outillage et équipements plutôt que de       │
│  les laisser dormir ou les jeter. Les entreprises publient, les               │
│  particuliers comme les professionnels achètent.                              │
│                                                                              │
│  À ne pas confondre avec la Boutique ELSATIA, où ELSATIA vend ses propres     │
│  produits et services. Sur Market, les biens appartiennent aux entreprises    │
│  qui les publient : ELSATIA met en relation, elle ne vend pas ces biens.      │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────   │
│  (aucun bouton · aucun tarif · aucune capture · aucune date)                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Ce bloc est fourni comme contenu.** Son intégration relève du dépôt `elsatia-site`, que ce lot ne
modifie pas.

---

## 6. Ce que ces wireframes établissent

| # | Principe | Où il se voit |
|---|---|---|
| 1 | ELSATIA n'est pas vendeur | W-01, W-03, W-07, W-14 — bandeau permanent |
| 2 | Boutique ≠ Market | W-01, W-17 — lien explicite, jamais un catalogue commun |
| 3 | Aucun paiement plateforme | W-03 (pas de bouton « Acheter »), W-05, W-07, W-14 |
| 4 | Coordonnées protégées | W-03 (raison sociale + ville), W-07 (révélation après accord) |
| 5 | Localisation approchée | W-02 (« à moins de 15 km »), W-03 (zone, pas point) |
| 6 | Catégorie d'abord | W-09 — elle pilote tout le formulaire |
| 7 | Réglementaire bloquant et non repliable | W-04, W-11 |
| 8 | Vérification avant publication | W-08, W-12 |
| 9 | Décisions motivées et contestables | W-13, W-16 |
| 10 | Transparence du classement et de la mise en avant | W-01, W-02 |
| 11 | Conversations privées inaccessibles par défaut | W-16 — le verrou est visible |
| 12 | Le pont ne synchronise pas | W-10, W-14 — dit à l'écran |
| 13 | **Abonnement obligatoire pour publier, brouillons libres avant** | W-08 bis, W-12 |
| 14 | **Vérification gratuite et antérieure à l'abonnement** | W-08 |
| 15 | **Échange = deux ventes, deux codes de retrait, aucune valeur calculée** | W-14 bis |

---

## 7. Confirmation

Wireframes fonctionnels originaux, dérivés des seules contraintes de ce lot. Aucun code, aucune
migration, aucun objet Stripe, aucune Production, aucun dépôt tiers modifié. Aucune UI ne doit être
réalisée avant le lot ELSATIA-UI-V2.
