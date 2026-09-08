# ELSATIA-MARKET-FUNCTIONAL-SPECIFICATION-V1

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1`
Révision : **R2 — décisions produit fermées** (`ELSATIA-MARKET-R2-FINAL-PRODUCT-DECISIONS`)
Nature : spécification. Aucun code, aucune migration.
Branche : `feat/market-architecture-legal-business-v1` — base `1fc1331` — R1 `281769b`
Document lié : `ELSATIA-MARKET-ARCHITECTURE-AUDIT-REPORT.md`

> **Règle commerciale de référence (décision R2)** — *Abonnement vendeur obligatoire à partir de la
> première annonce publiée. Consultation et achat gratuits. Brouillons possibles avant souscription.*

> **Statut du produit : à venir.** Market n'est ni ouvert, ni disponible, ni annoncé. Aucune date de
> lancement n'est engagée par ce document. Aucun tarif n'y est définitif.

---

## 1. Définition et frontière produit

### 1.1 Ce qu'est Market

ELSATIA Market est une **place de marché de biens professionnels d'occasion, de surplus et de
déstockage**, sur laquelle des **entreprises professionnelles vérifiées** publient des annonces
portant sur des biens **dont elles sont propriétaires**. Les particuliers peuvent consulter et
acheter ces annonces.

### 1.2 Frontière avec la Boutique ELSATIA — à ne jamais confondre

| | **Boutique ELSATIA** | **ELSATIA Market** |
|---|---|---|
| Qui vend | ELSATIA | une entreprise cliente d'ELSATIA |
| Propriétaire du bien | ELSATIA | l'entreprise vendeuse |
| Nature du catalogue | fermé, tenu par ELSATIA | ouvert, alimenté par les vendeurs |
| Objets vendus | cartes NFC, accessoires, licences, formations, matériel ELSATIA | surplus, matériaux, outillage, machines, équipements professionnels |
| Qui facture l'acheteur | ELSATIA | l'entreprise vendeuse |
| Responsabilité produit | ELSATIA (vendeur professionnel) | l'entreprise vendeuse |
| Garantie légale de conformité | due par ELSATIA | due par le vendeur |
| Qui paie ELSATIA | l'acheteur (prix du produit) | le **vendeur** (abonnement de publication) |
| Modèle en base | `boutique_produits`, `boutique_commandes`, `boutique_lignes_commande` | modèle Market **à créer** |
| Existe aujourd'hui | oui (catalogue vide, rubrique désactivée) | **non** |

Cette distinction est **structurelle** : elle gouverne les CGU, les CGV, la facturation, la TVA,
la garantie légale, le droit de rétractation et la responsabilité. Un écran, un e-mail, une facture
ou une page du site qui laisse croire qu'ELSATIA vend un bien publié sur Market crée une
responsabilité de vendeur qu'ELSATIA n'entend pas assumer. **Aucun élément d'interface ne doit
présenter Boutique et Market comme un catalogue unique.**

Règle d'implémentation : les deux ne partagent **aucune** table, **aucun** panier, **aucune** ligne
de commande, **aucun** parcours de paiement.

### 1.3 Ce que Market n'est pas, en V1

- **pas une plateforme de vente entre particuliers (C2C)** — exclu de la V1 par décision, §2.6 ;
- **pas une place de marché de prestations de service** — Market vend des **biens**. La main-d'œuvre,
  la sous-traitance et les prestations sont **hors V1** (§3.2.1) ;
- pas un site d'enchères ;
- pas un séquestre de fonds ni un établissement de paiement ;
- pas un transporteur ni un commissionnaire de transport ;
- pas un expert : ELSATIA ne certifie ni l'état, ni l'authenticité, ni la conformité d'un bien.

---

## 2. Phase 2 — Acteurs et droits

### 2.1 Les acteurs

| # | Acteur | Authentifié | Rattaché à une entreprise | Existe dans le socle actuel |
|---|---|:---:|:---:|---|
| A1 | **Visiteur** | non | non | oui (anonyme) |
| A2 | **Particulier acheteur** | oui | non | **non** — à créer |
| A3 | **Professionnel acheteur** | oui | oui | oui |
| A4 | **Professionnel vendeur** (l'organisation) | — | — | `entreprises` |
| A5 | **Administrateur d'entreprise** | oui | oui | rôle applicatif Market |
| A6 | **Collaborateur publicateur** | oui | oui | rôle applicatif Market |
| A7 | **Collaborateur consultation** | oui | oui | rôle applicatif Market |
| A8 | **Modérateur ELSATIA** | oui | non (plateforme) | `plateforme_admins` + permission |
| A9 | **Support ELSATIA** | oui | non (plateforme) | `plateforme_admins` + assistance |
| A10 | **Propriétaire global (Global Owner)** | oui | non | `est_plateforme_proprietaire()` |
| A11 | **Prestataire de paiement** | système | non | Stripe (hors périmètre V1) |
| A12 | **Transporteur** | système | non | **hors périmètre V1** |

**A11 et A12 ne sont pas des utilisateurs.** Ils sont modélisés comme des systèmes externes, sans
compte ELSATIA, sans accès aux données au-delà de ce qu'un échange contractuel exige.

### 2.2 Rôles applicatifs Market proposés

À seeder dans `roles_applications_elsatia` pour `application_code = 'market'` :

| `role_code` | Nom | Portée |
|---|---|---|
| `market_admin` | Administrateur ELSATIA Market | gouverne l'espace vendeur de l'organisation |
| `market_vendeur` | Vendeur ELSATIA Market | crée, modifie, publie, négocie, conclut |
| `market_redacteur` | Rédacteur d'annonces | crée et modifie, **ne publie pas** |
| `market_consultation` | Consultation ELSATIA Market | lecture seule de l'espace vendeur |

Ces rôles sont **propres à Market**. Conformément à la doctrine de la migration 234, ils ne dérivent
ni d'un poste Gestion Pro, ni d'une permission métier, ni d'un rôle Colors ou Réserves. Un chef de
chantier n'est pas vendeur Market par hérédité.

### 2.3 Matrice des droits

`✔` autorisé · `✖` interdit · `C` sous condition (colonne Conditions) · `—` sans objet

| Action | A1 Visiteur | A2 Particulier | A3 Pro acheteur | A5 Admin entr. | A6 Publicateur | A7 Consultation | A8 Modérateur | A9 Support | A10 Global Owner | Conditions |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|---|
| Consulter les annonces publiées | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Rechercher / filtrer | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — |
| Voir les coordonnées du vendeur | ✖ | C | C | ✔ | ✔ | ✔ | ✔ | C | C | C : compte + demande de contact acceptée (§2.4) |
| Enregistrer un favori | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | compte requis |
| Enregistrer une recherche / alerte | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | compte requis |
| Contacter un vendeur | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | quota anti-spam |
| Proposer un prix (offre) | ✖ | C | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | C : seulement si l'annonce est « négociable » |
| Proposer un échange | ✖ | ✖ | C | C | C | ✖ | ✖ | ✖ | ✖ | **C : entre professionnels VÉRIFIÉS uniquement** (§3.7) |
| Demander une réservation | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | — |
| Acheter | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | hors plateforme en V1 (§ Business Model) |
| Signaler une annonce / un message | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | anonyme : rate-limité |
| Déposer un avis | ✖ | C | C | C | C | ✖ | ✖ | ✖ | ✖ | C : transaction conclue et confirmée — **différé V2** |
| Créer une annonce **en brouillon** | ✖ | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | **autorisé avant souscription** (§2.5.1) |
| Modifier une annonce non publiée | ✖ | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | — |
| Modifier une annonce publiée | ✖ | ✖ | ✖ | C | C | ✖ | ✖ | ✖ | ✖ | C : champs restreints, versionné, journalisé (§3.6) |
| **Publier** une annonce | ✖ | ✖ | ✖ | C | C | ✖ | ✖ | ✖ | ✖ | **C : entreprise VÉRIFIÉE ET abonnement Market ACTIF** (§2.5.1, §2.7.5), plus l'option « validation interne » pour A6 (§2.5) |
| Retirer / suspendre sa propre annonce | ✖ | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | — |
| Accepter une offre | ✖ | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | — |
| Marquer vendu / échangé | ✖ | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | — |
| Gérer l'abonnement Market | ✖ | ✖ | ✖ | ✔ | ✖ | ✖ | ✖ | ✖ | C | C : via assistance justifiée |
| Habiliter un collaborateur | ✖ | ✖ | ✖ | ✔ | ✖ | ✖ | ✖ | ✖ | C | socle multi-app existant |
| **Suspendre** une annonce (plateforme) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ | ✔ | motif obligatoire + notification au vendeur |
| **Refuser** une annonce | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ | ✔ | motif obligatoire + voie de contestation |
| Suspendre un compte vendeur | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | C | ✖ | ✔ | C : gravité définie ; sinon Global Owner |
| Traiter un signalement | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ | ✔ | — |
| Lire une conversation privée | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | C | C | C | **C : uniquement sur signalement portant sur cette conversation** (§ Sécurité) |
| Rembourser / annuler | — | — | — | — | — | — | ✖ | ✖ | ✖ | hors périmètre : ELSATIA n'encaisse pas la vente en V1 |
| Exporter ses données (RGPD) | ✖ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | sur son propre périmètre |
| Entrer dans un espace vendeur (assistance) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | C | C | C : `plateforme_entrer_entreprise`, motif ≥ 5 car., horodaté, notifié, borné |

### 2.4 Exposition des coordonnées du vendeur — règle

L'exposition des coordonnées est le principal vecteur de démarchage abusif et d'hameçonnage sur une
place de marché. Règle retenue :

1. Une annonce publique affiche : **raison sociale, ville, département** du vendeur. Rien d'autre.
2. Elle n'affiche **jamais** : e-mail, téléphone, adresse précise, nom d'une personne physique,
   SIRET complet, identifiant interne.
3. Le contact passe par une **messagerie interne**. L'e-mail réel n'est jamais révélé.
4. Les coordonnées directes ne sont révélées qu'après **acceptation explicite par le vendeur**
   d'une demande de contact, et uniquement à l'auteur de cette demande.
5. Chaque révélation est **journalisée** (qui, quand, quelle annonce) et **compte dans un quota**.
6. L'adresse précise de retrait n'est communiquée qu'après **accord sur une réservation**.

### 2.5 Validation interne avant publication

**Question posée par le lot : une annonce doit-elle être validée par l'administrateur de
l'entreprise avant publication ?**

Réponse spécifiée : **option de l'organisation, désactivée par défaut.**

- `market_vendeur` publie directement.
- `market_redacteur` ne publie jamais : il soumet.
- Un réglage d'organisation `validation_interne_obligatoire` (défaut `false`) force **tout** dépôt,
  y compris de `market_vendeur`, à passer par un état « en attente de validation interne ».
- Seul `market_admin` valide.

Motif : une PME de trois personnes serait paralysée par une validation obligatoire ; une entreprise
de cent personnes en a besoin. L'imposer par défaut ferait fuir la cible principale ; l'interdire
disqualifierait les grands comptes. Le réglage est journalisé à chaque changement.

### 2.5.1 Abonnement vendeur — la condition de publication

**Décision R2, fermée.**

> Abonnement vendeur obligatoire à partir de la première annonce publiée. Consultation et achat
> gratuits. Brouillons possibles avant souscription.

| Acte | Abonnement Market actif requis |
|---|:---:|
| Consulter, rechercher | **non** — et aucun compte n'est requis |
| Acheter, contacter, offrir, réserver | **non** |
| Activer Market pour son entreprise | non |
| Déposer un dossier de vérification | non |
| **Créer et préparer un brouillon** | **non** |
| Prévisualiser un brouillon | non |
| **Soumettre / publier une annonce** | **OUI — bloquant** |
| Maintenir une annonce publiée | **OUI** |
| Répondre à un acheteur sur une annonce publiée | oui (l'annonce l'est déjà) |

**Règles d'implémentation**

| # | Règle |
|---|---|
| **AB1** | La transition `brouillon → soumise/publiée` **échoue** si l'abonnement n'est pas actif. Le contrôle est **serveur**, jamais un simple masquage de bouton. |
| **AB2** | Le blocage est **explicite et actionnable** : il dit ce qui manque et mène à la souscription. Un bouton grisé sans explication fait perdre le vendeur. |
| **AB3** | Aucune annonce n'est détruite par l'absence d'abonnement. Les brouillons restent accessibles **indéfiniment**. |
| **AB4** | À la **suspension** ou la **résiliation** de l'abonnement : les annonces `publiee` passent en `suspendue`, motif `abonnement_inactif` (règle R9, §3.3). Elles sont **restaurées** à la réactivation, dans leur état antérieur. |
| **AB5** | Un abonnement au statut `essai` **est** un abonnement actif : l'essai borné est une souscription, pas un palier gratuit. |
| **AB6** | Le quota d'annonces actives du palier souscrit est vérifié **à la publication**, pas seulement à l'affichage. |
| **AB7** | La publication vérifie l'**autorisation applicative** (`acces_applications_entreprises('market')`), que la couche commerciale alimente — jamais la ligne d'abonnement directement. Voir `BUSINESS-MODEL-V1` §5.2. |

**Ce qui n'est pas proposé ici** : aucun palier, aucun quota chiffré, aucune durée d'essai, aucun
montant. Ces éléments relèvent de l'arbitrage tarifaire **D-10**.

### 2.6 Vente entre particuliers (C2C) — **exclue de la V1**

**Décision R2, fermée : le C2C est exclu de la V1.** Un particulier ne peut ni publier, ni vendre,
ni se déclarer professionnel sans vérification, ni contourner l'abonnement vendeur.

Ce que son ouverture impliquerait, si Julien l'envisageait un jour, est documenté au titre de la Phase 9
(cadre juridique) : obligations d'information renforcées sur le statut du vendeur, distinction
particulier/professionnel devant l'acheteur, seuils de requalification en activité professionnelle,
obligations déclaratives de la plateforme envers l'administration fiscale pour les vendeurs
particuliers, et une exposition à la fraude et au recel sensiblement plus élevée. **C'est une
décision de Julien, appuyée sur un audit juridique dédié.** Décision D-9 — **fermée en R2 : C2C exclu de la V1**.

### 2.7 Vérification professionnelle — architecture

**Décision R2 : la publication nécessite une entreprise vérifiée.** L'exigence ne peut pas être
tenue par une case à cocher. Quatre niveaux cumulatifs :

| Niveau | Contrôle | Automatisable | Bloquant |
|---|---|:---:|---|
| **N1** | SIREN/SIRET **formellement valide** : longueur, composition, clé de Luhn | oui, hors ligne | **oui, avant tout** |
| **N2** | Entreprise **existante et active** au registre, raison sociale et adresse concordantes | oui, **source externe** ; **à défaut, revue manuelle** | **oui** |
| **N3** | **Identité du représentant** ou **justificatif de pouvoir** rattachant la personne à l'entreprise | non — pièce déposée, revue humaine | **oui, avant la première publication** |
| **N4** | Éléments de confiance : assurance RC pro et décennale (déjà portées par `entreprises`), ancienneté, historique | partiel | non — alimente le score |

#### 2.7.1 Le dossier de vérification — champs minimaux

Le lot R2 fixe le contenu minimal. Chaque champ ci-dessous est un élément du **dossier de
vérification**, distinct de la fiche `entreprises` : la fiche porte ce que l'entreprise déclare, le
dossier porte ce que la plateforme a **constaté**.

| Champ | Rôle |
|---|---|
| `siren` / `siret` | identifiant contrôlé |
| `raison_sociale_constatee` | telle que retournée par la source, **pas** telle que saisie |
| `statut_registre` | actif / cessé / radié / inconnu |
| `representant_nom`, `representant_qualite` | identité du représentant |
| `justificatif_pouvoir` | pièce déposée lorsque le demandeur n'est pas le représentant |
| `adresse_constatee`, `code_postal`, `ville` | adresse au registre |
| **`pays`** | **obligatoire** — conditionne le registre interrogeable et le régime applicable |
| `date_verification` | horodatage du constat |
| **`source_verification`** | `registre_officiel`, `prestataire`, `revue_manuelle`, `document_fourni` |
| `reference_source` | identifiant de la réponse obtenue, pour rejouabilité |
| **`resultat`** | `verifiee`, `refusee`, `en_attente`, `expiree`, `revoquee` |
| `motif` | requis pour `refusee` et `revoquee` — la décision doit être contestable |
| **`expire_le`** | une vérification n'est **jamais définitive** (§2.7.3) |
| `revision_demandee_le` | déclenchement d'une revérification |
| `verifie_par` | modérateur, lorsque la décision est humaine |

**Journal d'audit dédié, append-only** : chaque demande, chaque constat, chaque décision, chaque
révision et chaque accès aux pièces est journalisé — auteur, horodatage, motif, source. C'est ce
journal qui rend la décision opposable et le refus contestable.

#### 2.7.2 Aucun prestataire n'est choisi ici

**Décision R2 : ne choisir aucun prestataire payant sans comparaison ultérieure.** Ce document ne
nomme donc aucun fournisseur et n'en compare aucun.

Ce qu'il fixe, c'est **l'indépendance du modèle vis-à-vis de la source** : `source_verification` et
`reference_source` sont des champs, pas des constantes. Changer de source — ou en cumuler deux —
ne doit imposer aucune modification du modèle. C'est la condition pour que la comparaison
ultérieure reste réellement ouverte.

#### 2.7.3 Repli obligatoire : la validation manuelle

**Décision R2 : en l'absence de vérification automatique disponible, prévoir une validation manuelle
par la plateforme.**

Le repli n'est pas un mode dégradé accidentel : c'est un **chemin de premier rang**, spécifié et
outillé.

| | Voie automatique | **Voie manuelle** |
|---|---|---|
| N1 | automatique | automatique (identique) |
| N2 | interrogation d'un registre | **modérateur** : contrôle sur pièce (extrait de registre fourni par le demandeur, de moins de 3 mois) |
| N3 | jamais automatique | modérateur |
| `source_verification` | `registre_officiel` / `prestataire` | `revue_manuelle` / `document_fourni` |
| Délai annoncé au vendeur | immédiat à quelques minutes | **annoncé explicitement**, en jours ouvrés |
| Traçabilité | référence de la réponse | identité du modérateur + pièce conservée |

**Conséquence de planning importante** : la voie manuelle **débloque l'ouverture de Market sans
dépendre d'un contrat externe**. La décision D-4 de la R1 — « contracter une source de vérification
est un prérequis bloquant » — est donc **levée** : elle devient un objectif de montée en charge, non
un préalable. Le prérequis réel est désormais **la capacité de traitement manuel** : un délai
d'examen tenu est une promesse commerciale, et un dossier en attente est un vendeur qui ne paie pas
encore.

#### 2.7.4 Expiration et révision

Une entreprise vérifiée peut cesser d'exister, être radiée, changer de représentant. Une vérification
figée une fois pour toutes deviendrait fausse en silence.

| Règle | |
|---|---|
| V1 | Toute vérification porte une **date d'expiration**. |
| V2 | À l'expiration, l'entreprise passe en `expiree` : **les annonces publiées sont suspendues**, motif `verification_expiree` ; les brouillons restent accessibles. |
| V3 | Un signalement d'usurpation, une incohérence constatée ou un changement de représentant déclenchent une **révision** immédiate. |
| V4 | Une révocation est **motivée, notifiée et contestable**. |
| V5 | Le résultat d'une vérification n'est **jamais** exposé publiquement au-delà du fait binaire « entreprise vérifiée ». Ni SIRET complet, ni pièce, ni source. |

#### 2.7.5 Articulation avec l'abonnement

Deux conditions **cumulatives et indépendantes** gouvernent la publication :

```
publier une annonce  ⟺  entreprise VÉRIFIÉE  ET  abonnement Market ACTIF
```

Elles ne se substituent pas l'une à l'autre. Une entreprise vérifiée sans abonnement ne publie pas ;
une entreprise abonnée non vérifiée ne publie pas davantage. Dans les deux cas, **les brouillons
restent autorisés** — c'est ce qui permet au vendeur d'avancer pendant l'examen de son dossier.

---

## 3. Phase 3 — Catalogue et annonces

### 3.1 Le modèle d'annonce

Trois principes gouvernent ce modèle :

- **P1 — Une annonce n'est pas un article de stock.** Elle est une offre commerciale autonome, qui
  peut naître d'un article de stock ou d'un seau Colors, mais qui vit ensuite sa propre vie.
- **P2 — Ce qui est public et ce qui est privé sont séparés physiquement.** Deux entités distinctes.
- **P3 — Rien de sensible n'est indexé.** Numéro de série, adresse précise, preuve d'achat, identité
  du rédacteur ne quittent jamais la partie privée.

#### 3.1.1 Partie publique — l'annonce

| Champ | Type | Obligatoire | Contrainte / observation |
|---|---|:---:|---|
| `reference_publique` | texte court | oui | identifiant **opaque**, non séquentiel — un compteur trahirait le volume d'activité |
| `titre` | texte ≤ 120 | oui | pas d'URL, pas de téléphone, pas d'e-mail (anti-contournement) |
| `description` | texte ≤ 5 000 | oui | idem ; texte brut, aucun HTML |
| `categorie_code` | référence | oui | nomenclature fermée (§3.2) |
| `sous_categorie_code` | référence | non | — |
| `nature_transaction` | énum | oui | `vente`, `echange`, `vente_ou_echange` (`don` différé) |
| `etat_bien` | énum | oui | `neuf`, `neuf_sans_emballage`, `tres_bon`, `bon`, `usage`, `pour_pieces` |
| `quantite` | numérique > 0 | oui | — |
| `unite` | énum | oui | `u`, `lot`, `m`, `m2`, `m3`, `kg`, `t`, `l`, `palette` |
| `vente_partielle_autorisee` | booléen | oui | défaut `false` |
| `quantite_minimale` | numérique | non | ≤ `quantite`, requis si vente partielle |
| `prix_ht` | numérique ≥ 0 | C | requis si `nature_transaction` inclut `vente` |
| `prix_unite` | énum | C | prix **par unité** ou **pour le lot** — ambiguïté = litige |
| `tva_applicable` | énum | oui | `tva_20`, `tva_10`, `tva_5_5`, `exoneree`, `marge` — voir cadre juridique |
| `prix_negociable` | booléen | oui | défaut `false` ; conditionne la fonction « offre » |
| `departement` | code | oui | granularité **publique maximale** |
| `ville` | texte | oui | — |
| `zone_approximative` | géo arrondie | oui | **jamais** l'adresse exacte (§3.5) |
| `remise_main_propre` | booléen | oui | — |
| `rayon_livraison_km` | entier | non | si le vendeur livre lui-même |
| `expedition_possible` | booléen | oui | — |
| `frais_expedition_indicatifs` | texte court | non | « indicatif » assumé, jamais contractuel |
| `photos` | 1 à 12 | **oui, ≥ 1** | une annonce sans photo n'est pas publiable |
| `video_url` | texte | non | hébergeur externe ; contrôlé contre une liste blanche |
| `marque` | texte ≤ 120 | non | — |
| `modele` | texte ≤ 120 | non | — |
| `reference_fabricant` | texte ≤ 120 | non | — |
| `annee` | entier | non | plage plausible |
| `dimensions_mm` | L×l×h | non | — |
| `poids_kg` | numérique | non | — |
| `matiere`, `couleur`, `finition` | texte | non | alimentés par le pont Colors |
| `couleur_hex`, `ral` | texte | non | pont Colors |
| `attributs` | clé-valeur typée | non | spécifiques à la catégorie (§3.2) |
| `garantie` | énum + texte | oui | `aucune`, `garantie_legale_uniquement`, `garantie_commerciale` (+ durée) |
| `conditions_particulieres` | texte ≤ 2 000 | non | — |
| `mentions_reglementaires` | structuré | C | **obligatoire** pour les catégories réglementées (§ juridique) |
| `disponible_a_partir_du` | date | non | — |
| `publiee_le` | horodatage | auto | — |
| `expire_le` | horodatage | oui | défaut : 60 jours ; relance possible |
| `entreprise_id` | référence | oui | le vendeur — **l'organisation, jamais la personne** |
| `statut` | énum | oui | §3.3 |

#### 3.1.2 Partie privée — le dossier d'annonce

Jamais exposée, jamais indexée, jamais transmise à un acheteur non retenu.

| Champ | Observation |
|---|---|
| `numero_serie` | **protégé**. Sert à la lutte contre le recel et à la preuve de propriété. Jamais affiché. Comparable par un modérateur, jamais restituable. |
| `adresse_retrait_precise` | révélée **après accord** de réservation uniquement |
| `preuve_achat_document` | facultative, mais **fortement pondérée** dans le score de confiance ; obligatoire pour certaines catégories (§ juridique) |
| `prix_achat_ht`, `valeur_comptable` | jamais publics |
| `origine` | `saisie_manuelle`, `import_stock`, `import_colors`, `import_gp` |
| `origine_reference` | identifiant de l'objet source, **dans le tenant du vendeur** |
| `cree_par`, `modifie_par`, `publie_par` | personnes physiques — **jamais publiques** |
| `notes_internes` | libre |
| `motif_derniere_decision_moderation` | — |

### 3.2 Nomenclature des catégories

Une nomenclature **fermée** (pas de catégorie libre) car c'est elle qui porte le contrôle juridique :
chaque catégorie est étiquetée `autorisee`, `sous_conditions` ou `interdite`, et déclenche des champs
et des mentions obligatoires. Le détail juridique figure dans
`ELSATIA-MARKET-LEGAL-COMPLIANCE-FRAMEWORK-V1.md` ; la nomenclature fonctionnelle est :

| Racine | Exemples | Régime |
|---|---|---|
| `materiaux_construction` | bois, plaques, isolants, carrelage, couverture | autorisé |
| `materiaux_isolation` | laines, panneaux | **sous conditions** (mentions, absence d'amiante) |
| `peintures_produits` | peintures, enduits, colles, solvants | **sous conditions** (produits chimiques) |
| `outillage_main` | outillage non électrique | autorisé |
| `outillage_electroportatif` | perceuses, scies, meuleuses | **sous conditions** (sécurité, marquage) |
| `machines_chantier` | bétonnières, compresseurs, échafaudages | **sous conditions** (machines, notice, conformité) |
| `engins_levage` | nacelles, treuils, élingues | **sous conditions** (contrôles réglementaires) |
| `epi` | casques, harnais, protections | **sous conditions** (péremption, traçabilité) |
| `vehicules_remorques` | utilitaires, remorques | **sous conditions** (immatriculation, contrôle technique) |
| `mobilier_professionnel` | mobilier de bureau, rayonnages | autorisé |
| `pieces_detachees` | pièces machines | **sous conditions** (contrefaçon) |
| `consommables` | visserie, abrasifs, fixations | autorisé |
| `lots_destockage` | lots hétérogènes | **sous conditions** (description exhaustive imposée) |
| `equipements_techniques` | CVC, électricité, plomberie | **sous conditions** |

Toute catégorie absente de la nomenclature est, par construction, **impubliable**. C'est une garde
volontaire : on n'ouvre pas une catégorie sans l'avoir instruite.

#### 3.2.1 Ce que Market accepte, et ce qu'il refuse par nature

**Décision R2 — périmètre produit.** Market porte des **biens professionnels** : surplus de stock,
matériaux, fins de chantier, consommables, outillage, machines, matériel professionnel, équipements,
mobilier professionnel, pièces détachées, lots de déstockage, et les autres biens professionnels
autorisés par la nomenclature.

Le vendeur peut publier des biens de nature très différente. Il ne peut **jamais** publier un bien
**interdit, dangereux, volé, contrefait ou non conforme** — ces cinq qualifications sont des gardes
du modèle, pas des règles de modération, et une tentative alimente le score de confiance (§10 du
modèle de sécurité).

**Les prestations de service sont hors V1.** Main-d'œuvre, sous-traitance, location de matériel avec
opérateur, transport, formation : rien de tout cela n'est publiable. Trois raisons :

1. **Nature différente** : une prestation n'a ni état d'usure, ni quantité en stock, ni preuve de
   remise. Tout le modèle d'annonce lui est étranger.
2. **Régime juridique différent** : une place de marché de main-d'œuvre soulève le travail dissimulé,
   le prêt illicite de main-d'œuvre et la responsabilité solidaire du donneur d'ordre — un tout autre
   dossier que la vente de biens.
3. **Périmètre** : Market est une place de marché de **biens**. Une place de marché de prestations
   serait un autre produit, à instruire pour lui-même.

### 3.3 États d'une annonce

```
                       ┌──────────────┐
                       │  brouillon   │  création, modification libre
                       └──────┬───────┘
              (soumission)    │
          ┌───────────────────┴─────────────────────┐
          ▼                                         ▼
  ┌───────────────────────┐            ┌──────────────────────┐
  │ attente_validation    │            │  en_verification     │
  │ _interne (optionnel)  │──valide───▶│  (plateforme)        │
  └───────────────────────┘            └───────┬──────────────┘
                                    refusée ◀──┤
                                               ▼ acceptée
                                       ┌──────────────┐
              ┌────────────────────────│   publiee    │────────────────────┐
              │                        └──┬────┬───┬──┘                    │
     (réservation acceptée)               │    │   │            (retrait par le vendeur)
              ▼                           │    │   │                       ▼
       ┌────────────┐  annulation         │    │   │                ┌────────────┐
       │  reservee  │─────────────────────┘    │   │                │  retiree   │
       └─────┬──────┘                          │   │                └─────┬──────┘
             │ conclusion                      │   │                      │
      ┌──────┴────────┐                        │   │ (échéance)           │
      ▼               ▼                        │   ▼                      │
 ┌─────────┐    ┌───────────┐                  │  ┌──────────┐            │
 │ vendue  │    │ echangee  │                  │  │ expiree  │────────────┤
 └────┬────┘    └─────┬─────┘                  │  └────┬─────┘  (relance) │
      │               │                        │       │                  │
      │               │       (modération)     ▼       │                  │
      │               │                 ┌────────────┐ │                  │
      │               │                 │ suspendue  │ │                  │
      │               │                 └─────┬──────┘ │                  │
      │               │            (levée)    │        │                  │
      │               │                       └────────┴──────────────────┘
      │               │                                │
      └───────────────┴────────────────────────────────┴──▶ ┌───────────┐
                                (délai de conservation)     │ archivee  │
                                                            └───────────┘
                                   refusée ──▶ (contestation) ──▶ en_verification
```

**Règles de transition**

| Règle | Énoncé |
|---|---|
| R1 | `publiee` exige : entreprise **vérifiée**, abonnement **actif**, ≥ 1 photo confirmée, catégorie autorisée, mentions réglementaires complètes. |
| R2 | `en_verification` est **systématique** pour toute catégorie `sous_conditions`, et pour toute première annonce d'une entreprise. Ailleurs, contrôle a posteriori. |
| R3 | `reservee` **n'est pas** une vente : c'est un engagement réciproque, révocable, borné dans le temps (défaut 72 h). |
| R4 | `vendue` et `echangee` sont **terminaux**. Ils ne redeviennent jamais `publiee`. Republier, c'est créer une nouvelle annonce — sinon l'historique de prix et l'antériorité mentent. |
| R5 | `suspendue` par la plateforme est **motivée**, notifiée et **contestable**. La contestation ramène en `en_verification`. |
| R6 | `expiree` est réversible par relance ; la relance conserve la même `reference_publique` mais **réinitialise** `publiee_le`. |
| R7 | `archivee` est terminal et **ne supprime rien** : conformément à la doctrine maison (Colors, Réserves), il n'y a **pas de suppression physique**. |
| R8 | Toute transition est écrite dans un **journal append-only** : état source, état cible, auteur, motif, horodatage. |
| R9 | La suspension d'un **abonnement vendeur** dépublie automatiquement les annonces (`publiee` → `suspendue`, motif `abonnement_inactif`) et les restaure à la réactivation. |

### 3.4 Modes de vente

| Mode | V1 | Observation |
|---|:--:|---|
| Prix fixe à l'unité | ✔ | — |
| Prix fixe pour un lot | ✔ | `prix_unite = 'lot'` |
| Quantité partielle | ✔ | `vente_partielle_autorisee` + `quantite_minimale` |
| Prix négociable / offre | ✔ | file d'offres, contre-offres, expiration |
| Échange entre professionnels | ✔ | **entre professionnels vérifiés uniquement**, avec soulte possible — §3.7 |
| Don / mise à disposition gratuite | **différé** | prix 0 ≠ don : régime fiscal et responsabilité distincts |
| Achat groupé | **différé** | suppose un agrégateur de demande et une gestion de seuil |
| Enchère | **hors périmètre** | régime juridique propre (ventes aux enchères) |
| Réservation + retrait sur place | ✔ | sans paiement plateforme en V1 |
| Prestation de service, main-d'œuvre, sous-traitance | **hors V1** | Market vend des **biens** (§3.2.1) |

### 3.5 Localisation — règle de précision

L'adresse exacte d'un dépôt professionnel est une information sensible : elle expose un stock de
matériel de valeur.

| Contexte | Précision autorisée |
|---|---|
| Page publique d'annonce | ville + département + **zone arrondie** (grille ~2 km, jamais un point exact) |
| Résultats de recherche par distance | distance **arrondie** (« à moins de 15 km ») |
| Après accord de réservation | adresse précise, communiquée **au seul acheteur retenu** |
| Base de données | l'adresse précise est stockée dans la **partie privée**, non indexée |

La zone arrondie est calculée à la publication et figée : recalculer à la volée depuis l'adresse
exacte ferait transiter la donnée précise.

### 3.6 Modification d'une annonce publiée

Modifier librement une annonce publiée permettrait de vider de son sens un accord en cours et
d'échapper à la modération.

| Champ | Modifiable une fois publiée |
|---|---|
| prix (à la baisse), quantité (à la baisse), disponibilité, description **complétée**, photos ajoutées | **oui**, versionné |
| prix à la hausse, quantité à la hausse | **oui, mais** requalifie l'annonce en `en_verification` si une offre ou une réservation est en cours |
| catégorie, nature de transaction, état du bien, marque/modèle/référence | **non** — c'est une autre annonce |
| mentions réglementaires | **oui**, mais repasse en `en_verification` |

Chaque version est conservée. Un acheteur en négociation doit pouvoir prouver ce qui était affiché.

### 3.7 Échanges entre professionnels

**Décision R2 : les échanges sont autorisés entre professionnels vérifiés.**

L'échange est le mode le plus spécifique de Market, et le moins couvert par les usages d'une place de
marché ordinaire. Il mérite un modèle propre.

#### 3.7.1 Périmètre et gardes

| Règle | |
|---|---|
| **E1** | L'échange est **exclusivement B2B** : les deux parties sont des **entreprises vérifiées**. Un particulier ne propose ni ne reçoit d'échange. |
| **E2** | L'entreprise **initiatrice** doit disposer d'un **abonnement Market actif** : elle publie, en pratique, un bien en contrepartie. |
| **E3** | L'annonce cible doit porter `nature_transaction ∈ {echange, vente_ou_echange}`. Une annonce de vente pure ne reçoit pas de proposition d'échange. |
| **E4** | **ELSATIA n'encaisse ni la soulte, ni la valeur de l'échange.** Le règlement de la soulte se fait directement entre les parties. |
| **E5** | Un échange est **deux ventes croisées** sur le plan fiscal et comptable. Chaque partie facture l'autre. La plateforme le **rappelle** sans jamais le calculer (voir J-16 du cadre juridique). |
| **E6** | Le bien proposé en contrepartie obéit **aux mêmes règles que toute annonce** : catégorie autorisée, mentions réglementaires, interdits. Un bien impubliable n'est pas échangeable. |

#### 3.7.2 Le modèle de proposition d'échange

| Champ | Rôle |
|---|---|
| `annonce_cible` | l'annonce convoitée |
| `entreprise_initiatrice`, `entreprise_destinataire` | les deux parties, vérifiées |
| **`bien_propose`** | soit une **annonce publiée** de l'initiateur (recommandé : le bien est déjà décrit, catégorisé et photographié), soit une **description libre** avec photos et catégorie — sans publication |
| `quantite_proposee`, `unite_proposee` | — |
| `quantite_demandee` | sur l'annonce cible |
| **`soulte_montant_ht`**, `soulte_sens` | `initiateur_verse` / `destinataire_verse` / `aucune`. La soulte peut être **nulle**. |
| `soulte_tva` | déclarée par la partie qui la verse |
| `message` | libre |
| `expire_le` | défaut 7 jours |
| `statut` | §3.7.3 |
| `proposition_parente` | chaînage des contre-propositions |

**Pourquoi préférer un bien déjà publié** : il a passé la nomenclature, les mentions réglementaires
et, le cas échéant, la vérification a priori. Une description libre contourne ces contrôles — elle
reste possible pour ne pas obliger un vendeur à publier un bien qu'il ne souhaite pas exposer, mais
elle **déclenche une vérification a priori** si sa catégorie est `sous_conditions`.

#### 3.7.3 États d'une proposition d'échange

```
   proposee ──accepte──▶ acceptee ──remise croisée confirmée──▶ conclue
      │  │  │                 │
      │  │  │                 └──annulation d'un commun accord──▶ annulee
      │  │  └──refuse──▶ refusee
      │  └──contre-proposition──▶ contre_proposee ──▶ (nouvelle proposition chaînée)
      └──échéance──▶ expiree
```

| Règle | |
|---|---|
| **X1** | `acceptee` **bloque** la quantité engagée des **deux** côtés (§5 du document Bridge) : sur l'annonce cible, et sur le bien proposé s'il est lui-même une annonce publiée. |
| **X2** | Une contre-proposition **ferme** la proposition précédente et en ouvre une nouvelle, **chaînée**. L'historique complet de la négociation est conservé et restituable aux deux parties. |
| **X3** | `expiree` libère les engagements. Aucune reconduction tacite. |
| **X4** | `conclue` exige la **confirmation de la remise par les deux parties** — c'est la différence avec une vente, où une seule remise a lieu. |
| **X5** | `annulee` après acceptation est possible **d'un commun accord**, ou unilatéralement avant toute remise ; elle est motivée et journalisée. |
| **X6** | Une annulation après remise partielle (un bien remis, l'autre non) **n'est pas** traitée par la plateforme : elle bascule en **litige**, avec restitution de la trace aux deux parties. |

#### 3.7.4 Preuve de remise croisée

Un échange comporte **deux remises**. Le mécanisme de code de retrait (§5.3) est donc **dédoublé** :

```
acceptation
   ├─ code de retrait A  →  remis par l'entreprise destinataire à l'initiatrice
   └─ code de retrait B  →  remis par l'entreprise initiatrice à la destinataire

conclusion  ⟺  code A confirmé  ET  code B confirmé
```

Tant qu'une seule remise est confirmée, l'échange reste `acceptee` et **la trace de l'asymétrie est
conservée** — c'est précisément ce qui a de la valeur en cas de litige. Une échéance de remise est
fixée à l'acceptation ; son dépassement notifie les deux parties.

**Ce qu'ELSATIA atteste** : que deux codes ont été confirmés dans son système, à telle date, par
telles entreprises. **Rien d'autre** : ni la conformité des biens, ni le versement de la soulte, ni
la valeur de l'échange.

#### 3.7.5 Historique

Chaque proposition, contre-proposition, acceptation, refus, expiration, annulation et confirmation
de remise est écrite au **journal append-only**, avec auteur, horodatage et motif. Les deux parties
peuvent consulter et **exporter** l'historique complet de leur négociation — c'est ce qui remplace,
en l'absence de flux financier, la preuve qu'aurait constituée un paiement.

---

## 4. Phase 5 — Parcours acheteur

### 4.1 Le parcours

```
 1. Arrivée (moteur de recherche, site ELSATIA, lien partagé)      → anonyme
 2. Recherche : mot-clé, catégorie, localisation                   → anonyme
 3. Filtres : prix, état, distance, livraison, quantité, vendeur   → anonyme
 4. Résultats : liste, tri, pagination                             → anonyme
 5. Fiche annonce : photos, description, ville, vendeur (raison    → anonyme
    sociale + ville), garantie, mentions réglementaires
 6. Favori / alerte                                                → COMPTE REQUIS
 7. Contact vendeur (messagerie interne)                           → COMPTE REQUIS
 8. Proposition de prix                                            → COMPTE REQUIS + annonce négociable
 9. Proposition d'échange                                          → COMPTE PRO REQUIS
10. Demande de réservation                                         → COMPTE REQUIS
11. Accord du vendeur → révélation de l'adresse de retrait         → au seul acheteur retenu
12. Remise en main propre OU expédition (hors plateforme en V1)    → entre les parties
13. Confirmation de réception                                      → COMPTE REQUIS
14. Litige : signalement, échange tracé, médiation                 → COMPTE REQUIS
15. Avis                                                           → différé V2
```

### 4.2 Ce qui exige un compte, et pourquoi

| Action | Compte | Motif |
|---|:---:|---|
| Consulter, rechercher, filtrer | non | référencement, découverte, aucune donnée personnelle en jeu |
| Signaler une annonce | **non** | un signalement ne doit jamais être découragé ; rate-limité par IP hachée |
| Favori, alerte | oui | données personnelles persistantes |
| Contacter, offrir, réserver | oui | traçabilité, anti-spam, opposabilité |
| Confirmer réception, ouvrir un litige | oui | preuve |

Le choix de laisser la consultation **entièrement anonyme** est délibéré : il maximise l'audience
d'une place de marché naissante, et il minimise la collecte de données personnelles — donc la
surface RGPD.

### 4.3 Lutte contre le spam, l'hameçonnage et la fraude — parcours acheteur

| Menace | Contre-mesure |
|---|---|
| Aspiration massive des annonces (scraping) | rate-limiting sur `rate_limits_applicatifs` (existant), pagination bornée, pas d'API publique, coordonnées absentes des pages |
| Collecte d'e-mails de vendeurs | e-mail **jamais** affiché ; contact par messagerie interne |
| Faux acheteur cherchant à sortir de la plateforme | détection des motifs de contact (téléphone, e-mail, messagerie externe) dans les messages ; avertissement affiché ; signalement facilité |
| Hameçonnage par faux lien de paiement | **aucun paiement dans la messagerie en V1** ; bandeau permanent : ELSATIA n'encaisse jamais le prix d'un bien |
| Faux transporteur / arnaque au transport | avertissement explicite au moment où l'expédition est évoquée ; aucun transporteur recommandé en V1 |
| Usurpation d'entreprise | vérification N1–N3 (§2.7) ; signalement dédié « ce vendeur usurpe mon entreprise » traité en priorité |
| Prix manifestement anormal | détection statistique par catégorie ; mise en file de vérification, jamais un blocage automatique |
| Spam de messages | quota par compte et par jour, croissant avec l'ancienneté ; blocage entre comptes |

---

## 5. Phase 6 — Parcours vendeur

### 5.1 Le parcours

```
 1. L'entreprise a déjà un compte ELSATIA (ou le crée)
 2. Activation de Market : acces_applications_entreprises('market')
 3. VÉRIFICATION PROFESSIONNELLE (N1 → N3)          gratuite, sans abonnement
     · voie automatique, ou VALIDATION MANUELLE (§2.7.3)
 4. Habilitation des collaborateurs (rôles Market)
 5. (option) Activation de la validation interne
 6. Création d'une annonce : formulaire piloté par la catégorie   ← SANS ABONNEMENT
 7. Photos : dépôt, ordre, photo principale, contrôle             ← SANS ABONNEMENT
 8. Prix, TVA, négociabilité, quantité, unité                     ← SANS ABONNEMENT
 9. Mentions réglementaires si la catégorie l'exige   ← BLOQUANT (contenu)
10. Prévisualisation « telle que la verra un visiteur »           ← SANS ABONNEMENT
    ─────────────────────────────────────────────────────────────────────────
11. SOUSCRIPTION DE L'ABONNEMENT MARKET              ← BLOQUANT (AB1)
    ─────────────────────────────────────────────────────────────────────────
12. Soumission → (validation interne) → (vérification plateforme) → publiée
13. Réception des demandes : messages, offres, propositions d'échange,
    réservations
14. Négociation : contre-offre, contre-proposition d'échange, refus, acceptation
15. Acceptation → réservation → révélation de l'adresse (ou codes croisés, §3.7.4)
16. Remise ou expédition, preuve de remise
17. Facturation : par le vendeur, avec ses propres outils
18. Clôture : vendue / échangée
19. Suivi : tableau de bord, statistiques, historique
20. Archivage

**La souscription arrive délibérément tard.** Le vendeur a préparé son annonce, vu à quoi elle
ressemblera et mesuré le travail que la plateforme lui épargne : c'est le moment où l'abonnement
s'explique de lui-même. Le lui demander à l'étape 2, avant qu'il n'ait rien vu, ferait abandonner
la majorité des vendeurs — et il faut le dire, puisque le palier gratuit qui absorbait cette
friction est écarté.
```

### 5.2 Intervention de plusieurs collaborateurs

Le socle multi-app le permet nativement : `habilitations_applications_utilisateurs` porte un rôle
par utilisateur et par application, avec fenêtre de validité. Une annonce appartient à
l'**organisation**, jamais à la personne. Le départ d'un salarié ne fait pas disparaître ses annonces ;
la révocation de son habilitation suffit à lui en retirer la main.

Chaque action porte l'identité de son auteur dans la partie **privée** et dans le journal
append-only. La partie publique n'expose jamais une personne physique.

### 5.3 Preuve de remise

Sans encaissement par la plateforme, la preuve de remise est le seul élément opposable en cas de
contestation. Spécifié :

- un **code de retrait** à 6 caractères, généré à l'acceptation de la réservation, communiqué à
  l'acheteur ;
- le vendeur saisit ce code au moment de la remise → horodatage, auteur, annonce, quantité ;
- optionnellement une **photo de la remise** et une **signature** — le patron
  `signatures_documents` existe déjà côté Gestion Pro et est réutilisable ;
- l'ensemble est écrit au journal append-only et reste consultable par les deux parties.

ELSATIA **atteste de la traçabilité de l'échange dans son système**, jamais de la conformité du bien.

---

## 6. Phase 11 — Notifications

### 6.1 Typologie — quatre familles à ne pas mélanger

| Famille | Base légale | Désactivable | Canal |
|---|---|:---:|---|
| **Service** — indispensable à l'exécution | exécution du contrat | **non** | in-app + e-mail |
| **Sécurité** — atteinte au compte ou aux données | intérêt légitime / obligation | **non** | e-mail + in-app |
| **Commercial** — offres, mise en avant, relances d'abonnement | consentement (prospection) | **oui** | e-mail |
| **Publicité** — promotion de tiers | consentement explicite | **oui** | **hors périmètre V1** |

Mélanger une relance commerciale dans un e-mail de service est une pratique à la fois juridiquement
risquée et destructrice de confiance. Séparation stricte : **un e-mail, une famille**.

### 6.2 Catalogue des événements

| Code | Destinataire | Famille | Canal |
|---|---|---|---|
| `demande_contact_recue` | vendeur | service | in-app + e-mail |
| `message_recu` | l'autre partie | service | in-app + e-mail (groupé) |
| `offre_recue` | vendeur | service | in-app + e-mail |
| `contre_offre_recue` | acheteur | service | in-app + e-mail |
| `offre_acceptee` / `offre_refusee` | acheteur | service | in-app + e-mail |
| `offre_expiree` | les deux | service | in-app |
| `echange_propose` | vendeur | service | in-app + e-mail |
| `reservation_demandee` | vendeur | service | in-app + e-mail |
| `reservation_acceptee` (+ adresse de retrait) | acheteur | service | in-app + e-mail |
| `reservation_refusee` / `reservation_annulee` | l'autre partie | service | in-app + e-mail |
| `reservation_expire_bientot` | les deux | service | in-app + e-mail |
| `remise_confirmee` | les deux | service | in-app + e-mail |
| `expedition_declaree` | acheteur | service | in-app + e-mail |
| `reception_confirmee` | vendeur | service | in-app |
| `litige_ouvert` | l'autre partie + support | service | e-mail |
| `signalement_recu` | modération | service | file interne |
| `annonce_en_verification` | vendeur | service | in-app + e-mail |
| `annonce_publiee` | vendeur | service | in-app |
| `annonce_refusee` (motif + voie de contestation) | vendeur | service | **e-mail obligatoire** |
| `annonce_suspendue` (motif + voie de contestation) | vendeur | service | **e-mail obligatoire** |
| `annonce_expire_bientot` (J-7) | vendeur | service | in-app + e-mail |
| `annonce_expiree` | vendeur | service | in-app |
| `compte_vendeur_suspendu` | admin entreprise | sécurité | e-mail |
| `verification_pro_validee` / `_refusee` | admin entreprise | service | e-mail |
| `acces_assistance_ouvert` | admin entreprise | **sécurité** | e-mail — **jamais désactivable** |
| `abonnement_market_*` | admin entreprise | service | e-mail |
| `alerte_recherche` (nouvelle annonce correspondante) | acheteur | **commercial** | e-mail — opt-in |
| `mise_en_avant_proposee` | vendeur | **commercial** | e-mail — opt-in |

### 6.3 Modèle technique

Le modèle de Réserves (`reserves_notifications_types` / `_envois` / `_lectures` /
`reserves_preferences_notifications` / `reserves_evenements_notifications`) est le bon patron : il
gère une typologie, des préférences par type, une file d'envoi avec statut, et des accusés de
lecture. Il est **spécifique à Réserves** et ce lot interdit de modifier Réserves. Deux voies —
dupliquer pour Market, ou généraliser — relèvent de la décision D-5.

Contrainte non négociable dans les deux cas : les notifications **sécurité** ne sont **jamais**
désactivables, et l'ouverture d'un accès d'assistance en fait partie.

---

## 7. Phase 12 — Recherche et performances

### 7.1 Fonctions de recherche

| Fonction | V1 | Observation |
|---|:--:|---|
| Recherche textuelle (titre, description, marque, modèle) | ✔ | insensible à la casse **et aux accents** |
| Navigation par catégorie | ✔ | nomenclature fermée |
| Filtre prix (min/max) | ✔ | — |
| Filtre état du bien | ✔ | — |
| Filtre quantité minimale | ✔ | — |
| Filtre nature (vente / échange) | ✔ | — |
| Filtre livraison / expédition / retrait | ✔ | — |
| Filtre distance | ✔ | à partir d'un code postal ou d'une position **approximative** |
| Filtre vendeur | ✔ | via la page publique du vendeur |
| Filtre disponibilité | ✔ | — |
| Tri : pertinence, prix, date, distance | ✔ | pertinence par défaut |
| Pagination | ✔ | **par curseur**, pas par `offset` (§7.3) |
| Favoris | ✔ | — |
| Recherches enregistrées | ✔ | — |
| Alertes sur recherche enregistrée | ✔ | quotidiennes, opt-in |

### 7.2 Architecture de recherche

L'audit a établi qu'aucune infrastructure de recherche transverse n'existe : pas de `pg_trgm`, pas
d'`unaccent`, pas de PostGIS, pas d'index géospatial.

Décision d'architecture recommandée : **rester dans PostgreSQL en V1**, sur une projection
matérialisée dédiée.

```
annonce (privée, tenant)  ──projection──▶  index_recherche_annonces (publique, dénormalisée)
                                              · uniquement les annonces PUBLIÉES
                                              · uniquement des champs PUBLICS
                                              · vecteur de recherche pondéré
                                                (titre > marque/modèle > description)
                                              · zone arrondie (lat/lng grille ~2 km)
                                              · département, catégorie, prix, état, dates
```

Trois raisons de préférer cette voie à un moteur externe :

1. **Sécurité** — la projection ne contient **que** du public. Une fuite d'index ne peut pas révéler
   une adresse, un numéro de série ou une identité. Un moteur externe recevrait une copie des
   données hors du périmètre RLS : c'est la principale voie de fuite multi-tenant d'une place de
   marché, et elle est ici fermée par construction.
2. **Coût et exploitation** — pas de service supplémentaire à héberger, sécuriser, sauvegarder.
3. **Suffisance** — à 100 000 annonces, PostgreSQL avec un index de recherche plein texte et un
   index sur la zone tient largement la charge.

Extensions nécessaires : `unaccent` (indispensable en français), `pg_trgm` (tolérance aux fautes,
recherche par similarité). Pour la distance, `earthdistance`+`cube` suffisent en V1 ; PostGIS n'est
justifié que si des zones de chalandise complexes apparaissent.

**Aucune de ces extensions n'est installée aujourd'hui.** C'est un prérequis d'infrastructure, à
instruire avec la Production.

### 7.3 Cibles de charge et dimensionnement

| Palier | Entreprises | Annonces | Photos | Tenue |
|---|---:|---:|---:|---|
| P1 — amorçage | 500 | 5 000 | 30 000 | trivial |
| P2 — croissance | 5 000 | 100 000 | 600 000 | tenu par la projection + index |
| P3 — cible | 5 000+ | 100 000+ | plusieurs millions | tenu si §7.4 respecté |

Règles de tenue :

- **pagination par curseur** obligatoire — un `offset` profond sur 100 000 lignes s'effondre et
  permet en outre d'énumérer le catalogue ;
- **résultats bornés** : au plus 20 par page, au plus N pages avant obligation de préciser la
  recherche (garde anti-aspiration) ;
- **photos servies par CDN**, jamais par l'application ; vignettes générées à l'envoi, jamais à la
  volée ;
- **compteurs agrégés** (nombre d'annonces par catégorie, par département) **matérialisés**, jamais
  recalculés à chaque affichage.

### 7.4 Indexation sans fuite multi-tenant

C'est le point de sécurité central de la recherche. Quatre règles :

1. La projection ne contient **que** des annonces `publiee` et **que** des champs publics. Le reste
   n'y entre jamais — non pas filtré à la lecture, mais **absent**.
2. La recherche publique passe par une **fonction à projection explicite**, sur le patron de
   `reserves_annuaire_rechercher` : la liste des colonnes retournées est écrite dans la signature,
   ce qui rend impossible la fuite d'une colonne ajoutée plus tard.
3. Aucun identifiant technique (`entreprise_id`, `annonce_id` interne, chemin de stockage) n'apparaît
   dans une réponse publique : seule la `reference_publique` opaque circule.
4. Les gardes anti-énumération de l'annuaire Réserves sont **reprises** : longueur minimale de terme,
   plafond de résultats, rate-limiting, et **aucune recherche par SIRET partiel**.

---

## 8. Phase 13 — Éléments destinés au site public, rubrique « À venir »

> Fourni comme **contenu**, à intégrer par le lot du dépôt `elsatia-site`. **Ce lot ne modifie pas le
> dépôt du site.** Rappel : le canon du site est `feat/site-upcoming-navigation-v1` @ `c14e45f`, avec
> un catalogue central `produits.ts` et une rubrique `/a-venir`.

### 8.1 Présentation en deux phrases

> **ELSATIA Market** est une place de marché réservée aux professionnels, pour vendre leurs surplus
> de chantier, matériaux, outillage et équipements plutôt que de les laisser dormir ou les jeter.
> Les entreprises publient, les particuliers comme les professionnels achètent.

### 8.2 Distinction avec la Boutique, à afficher

> À ne pas confondre avec la **Boutique ELSATIA**, où ELSATIA vend ses propres produits et services.
> Sur Market, les biens appartiennent aux entreprises qui les publient : ELSATIA met en relation,
> elle ne vend pas ces biens.

### 8.3 Contraintes d'affichage — impératives

| Règle | |
|---|---|
| Stade public | **« À venir »**, au sens du catalogue `produits.ts`. Jamais « bientôt disponible », jamais de date. |
| Bouton d'achat | **aucun** |
| Bouton d'inscription ou de liste d'attente | **aucun** en V1 (collecterait des données personnelles sans finalité arrêtée) |
| Tarif affiché | **aucun** — aucune offre Market n'est arbitrée |
| Capture d'écran | **aucune** — le produit n'existe pas ; une capture serait une fausse capture |
| Promesse de lancement | **aucune** |
| Mention de marque | « marque déposée », jamais « ® » (calendrier INPI) |
| Jalon de commercialisation | rien ne doit laisser entendre une commercialisation avant le jalon du 21/10/2026 |

### 8.4 Position dans le catalogue du site

Market prend place dans `/a-venir` aux côtés des autres produits non commercialisés. Il ne figure
**pas** au menu principal, **pas** dans la grille tarifaire, **pas** dans la Boutique.

---

## 9. Périmètre V1 recommandé et fonctions différées

### 9.1 V1

Vérification professionnelle (N1–N3), **voie automatique ou manuelle** · annonces avec photos ·
nomenclature fermée avec catégories réglementées · recherche textuelle, par catégorie et par
distance · favoris, recherches enregistrées, alertes · messagerie interne avec quotas · offres et
contre-offres · **échanges entre professionnels vérifiés, avec soulte** · réservation avec code de
retrait · signalement et modération avec recours · journal append-only · notifications de service et
de sécurité · **abonnement vendeur obligatoire à partir de la première annonce publiée, brouillons
libres avant souscription** · **mise en relation sans encaissement de la vente**.

### 9.2 Différé — et pourquoi

| Fonction | Motif du report |
|---|---|
| Paiement de la vente sur la plateforme | change la nature juridique et fiscale ; impose KYC, litiges, chargebacks (§ Business Model / Juridique) |
| Commission sur transaction | idem, et suppose de mesurer la valeur avant de la tarifer |
| Avis et réputation | sans transaction observée par la plateforme, un avis n'est pas vérifiable — donc manipulable |
| Don / gratuité | régime fiscal et responsabilité distincts du prix zéro |
| Achat groupé | suppose un agrégateur de demande et une gestion de seuil |
| Vente entre particuliers (C2C) | **exclue de la V1 par décision R2** ; toute ouverture ultérieure suppose un audit juridique dédié |
| Prestations de service, main-d'œuvre, sous-traitance | **hors V1 par décision R2** (§3.2.1) |
| Palier gratuit permanent autorisant la publication | **écarté par décision R2** — voir `BUSINESS-MODEL-V1` §2.3 |
| Transport intégré | responsabilité de commissionnaire de transport |
| API publique | multiplie la surface d'aspiration avant d'avoir mesuré l'usage |
| Application mobile dédiée | le web responsive suffit à valider le marché |

---

## 10. Confirmation

Document de spécification. Aucun code métier, aucune migration, aucun objet Stripe, aucune
Production, aucun dépôt tiers n'ont été modifiés.
