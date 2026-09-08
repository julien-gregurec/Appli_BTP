# ELSATIA-MARKET-FUNCTIONAL-SPECIFICATION-V1

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1`
Nature : spécification. Aucun code, aucune migration.
Branche : `feat/market-architecture-legal-business-v1` — base `1fc1331`
Document lié : `ELSATIA-MARKET-ARCHITECTURE-AUDIT-REPORT.md`

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

- pas une plateforme de vente entre particuliers (C2C) — voir §2.6 ;
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
| Proposer un échange | ✖ | ✖ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | **B2B uniquement** |
| Demander une réservation | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | — |
| Acheter | ✖ | ✔ | ✔ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | hors plateforme en V1 (§ Business Model) |
| Signaler une annonce / un message | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — | anonyme : rate-limité |
| Déposer un avis | ✖ | C | C | C | C | ✖ | ✖ | ✖ | ✖ | C : transaction conclue et confirmée — **différé V2** |
| Créer une annonce | ✖ | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | entreprise vérifiée + abonnement actif |
| Modifier une annonce non publiée | ✖ | ✖ | ✖ | ✔ | ✔ | ✖ | ✖ | ✖ | ✖ | — |
| Modifier une annonce publiée | ✖ | ✖ | ✖ | C | C | ✖ | ✖ | ✖ | ✖ | C : champs restreints, versionné, journalisé (§3.6) |
| **Publier** une annonce | ✖ | ✖ | ✖ | ✔ | C | ✖ | ✖ | ✖ | ✖ | C : selon l'option « validation interne » (§2.5) |
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

### 2.6 Vente entre particuliers (C2C) — non ouverte

Le lot est explicite : **ne pas ouvrir automatiquement la vente entre particuliers**. Cette
spécification ne l'ouvre pas.

Ce que cela impliquerait, si Julien l'envisageait un jour, est documenté au titre de la Phase 9
(cadre juridique) : obligations d'information renforcées sur le statut du vendeur, distinction
particulier/professionnel devant l'acheteur, seuils de requalification en activité professionnelle,
obligations déclaratives de la plateforme envers l'administration fiscale pour les vendeurs
particuliers, et une exposition à la fraude et au recel sensiblement plus élevée. **C'est une
décision de Julien, appuyée sur un audit juridique dédié.** Décision D-9.

### 2.7 Empêcher qu'un particulier se déclare professionnel

Exigence du lot. Elle ne peut pas être tenue par une case à cocher. Le dispositif spécifié comporte
quatre niveaux cumulatifs :

| Niveau | Contrôle | Automatisable | Bloquant en V1 |
|---|---|:---:|:---:|
| N1 | SIRET **formellement valide** : 14 chiffres, clé de Luhn | oui, hors ligne | **oui** |
| N2 | SIRET **existant et actif** dans un registre officiel, raison sociale concordante | oui, source externe | **oui** |
| N3 | Preuve de **rattachement** de la personne à l'entreprise | non — pièce déposée, revue humaine | oui, à la première publication |
| N4 | Éléments de confiance complémentaires : assurance RC pro / décennale (déjà collectées sur `entreprises`), ancienneté du compte, historique | partiel | non — alimente le score |

N1 est immédiat. **N2 dépend d'une source externe non contractée à ce jour** (décision D-4). N3
suppose un dépôt de pièce, sa conservation, une durée de rétention et une revue par un modérateur.

Tant que N2 n'est pas disponible, **Market ne doit pas ouvrir la publication** : une place de marché
professionnelle qui accepte n'importe quel SIRET saisi n'a pas de barrière à l'entrée, et la
première conséquence est le recel.

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
| Échange B2B | ✔ | **entre professionnels uniquement** |
| Don / mise à disposition gratuite | **différé** | prix 0 ≠ don : régime fiscal et responsabilité distincts |
| Achat groupé | **différé** | suppose un agrégateur de demande et une gestion de seuil |
| Enchère | **hors périmètre** | régime juridique propre (ventes aux enchères) |
| Réservation + retrait sur place | ✔ | sans paiement plateforme en V1 |

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
 3. VÉRIFICATION PROFESSIONNELLE (N1 → N3)                     ← BLOQUANT
 4. Choix de l'offre Market (§ Business Model)                 ← BLOQUANT
 5. Habilitation des collaborateurs (rôles Market)
 6. (option) Activation de la validation interne
 7. Création d'une annonce : formulaire piloté par la catégorie
 8. Photos : dépôt, ordre, photo principale, contrôle
 9. Prix, TVA, négociabilité, quantité, unité
10. Mentions réglementaires si la catégorie l'exige            ← BLOQUANT
11. Prévisualisation « telle que la verra un visiteur »
12. Soumission → (validation interne) → (vérification plateforme) → publiée
13. Réception des demandes : messages, offres, réservations
14. Négociation : contre-offre, refus, acceptation
15. Acceptation → réservation → révélation de l'adresse
16. Remise ou expédition, preuve de remise
17. Facturation : par le vendeur, avec ses propres outils
18. Clôture : vendue / échangée
19. Suivi : tableau de bord, statistiques, historique
20. Archivage
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

Vérification professionnelle (N1–N3) · annonces avec photos · nomenclature fermée avec catégories
réglementées · recherche textuelle, par catégorie et par distance · favoris, recherches enregistrées,
alertes · messagerie interne avec quotas · offres et contre-offres · échange B2B · réservation avec
code de retrait · signalement et modération · journal append-only · notifications de service et de
sécurité · abonnement vendeur · **mise en relation sans encaissement de la vente**.

### 9.2 Différé — et pourquoi

| Fonction | Motif du report |
|---|---|
| Paiement de la vente sur la plateforme | change la nature juridique et fiscale ; impose KYC, litiges, chargebacks (§ Business Model / Juridique) |
| Commission sur transaction | idem, et suppose de mesurer la valeur avant de la tarifer |
| Avis et réputation | sans transaction observée par la plateforme, un avis n'est pas vérifiable — donc manipulable |
| Don / gratuité | régime fiscal et responsabilité distincts du prix zéro |
| Achat groupé | suppose un agrégateur de demande et une gestion de seuil |
| Vente entre particuliers | **audit juridique dédié requis** — décision de Julien (D-9) |
| Transport intégré | responsabilité de commissionnaire de transport |
| API publique | multiplie la surface d'aspiration avant d'avoir mesuré l'usage |
| Application mobile dédiée | le web responsive suffit à valider le marché |

---

## 10. Confirmation

Document de spécification. Aucun code métier, aucune migration, aucun objet Stripe, aucune
Production, aucun dépôt tiers n'ont été modifiés.
