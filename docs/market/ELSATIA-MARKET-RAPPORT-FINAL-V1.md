# ELSATIA-MARKET — RAPPORT FINAL DU LOT

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1`
Révision : **R2 — décisions produit fermées** (`ELSATIA-MARKET-R2-FINAL-PRODUCT-DECISIONS`),
complétée des **décisions D-5, D-6, D-10 et D-11 arrêtées après acceptation de la R2**.
Branche : `feat/market-architecture-legal-business-v1`
SHA de base : `1fc1331842cdf5980b374169994587813bdee7b6`
SHA R1 : `281769b0d6345914ad93574f8549999862cd2dea`
SHA R2 accepté : `87415d1011bca967f2d8b8065245f7e87d2f688b`
Date : 2026-09-08

---

## 1. Verdict, actualisé

**Market est un produit neuf, dont le périmètre V1 est désormais fermé. Aucun obstacle technique
rédhibitoire. Un seul lot transverse le bloque commercialement : le modèle d'abonnement
multiproduit.**

La R1 posait dix décisions ; la R2 en ferme huit. Ce qui reste ouvert est **tarifaire** ou
**juridique**, non structurel.

Deux constats de l'audit gouvernent la suite :

- **Stripe Connect Standard est câblé** (`entreprises.stripe_account_id`, OAuth avec garde d'état)
  mais **sans `application_fee` ni `transfer_data`**. La décision de ne pas encaisser les ventes rend
  cette absence sans conséquence en V1 : Stripe ne sert qu'à facturer l'abonnement vendeur.
- **L'écosystème possède trois modèles de monétisation incompatibles** — `abonnements_entreprises`
  (par entreprise, `unique`) pour Gestion Pro, `tools_monetization_subscriptions` +
  `entitlements_utilisateurs_elsatia` (par **utilisateur**, multi-fournisseur) pour Tools, et **rien
  du tout** pour Colors et Réserves. Le sujet n'est donc pas de lever une contrainte d'unicité, mais
  d'**unifier trois représentations du fait commercial**.

Une décision R2 change utilement le chemin critique : **la validation manuelle de la vérification
professionnelle est un chemin de premier rang.** Le prérequis « contracter une source externe »,
présenté comme bloquant en R1, ne l'est plus. Le risque se déplace du contractuel vers
l'opérationnel — capacité de traitement, délai tenu, homogénéité des décisions.

---

## 2. Tableau des décisions

| Décision | Statut | Conséquence V1 | Dépendance future |
|---|---|---|---|
| **D-1 — Identité du particulier acheteur** | **FERMÉE** | consultation et recherche **anonymes** ; compte acheteur requis pour contacter, offrir, réserver ; **jamais d'entreprise fantôme** | identité Market autonome à modéliser dès l'ouverture des interactions ; export RGPD particulier obligatoire |
| **D-2 — Séparation des surfaces publique et vendeur** | **FERMÉE** | projection publique dédiée, lecture par fonctions à projection explicite, aucun identifiant technique exposé | aucune |
| **D-3 — ELSATIA encaisse-t-elle la vente ?** | **FERMÉE — NON** | aucune commission, aucun reversement, aucun portefeuille, aucun séquestre, aucun remboursement, aucun litige financier ; Connect non utilisé pour les ventes | réexamen possible en V2 vers un paiement **sans commission** (le vendeur encaisse sur son compte) ; question juridique G-2 |
| **D-4 — Source de vérification d'entreprise** | **REQUALIFIÉE** | **n'est plus bloquante** : validation manuelle sur pièce, tracée et outillée ; aucun prestataire choisi | automatisation de N2 pour la montée en charge ; comparaison de prestataires à conduire |
| **D-5 — Notifications** | **ARBITRÉE** | les notifications reposeront **à terme sur un socle partagé ELSATIA**, avec des **événements Market spécifiques**. **Aucune duplication permanente du modèle Réserves** n'est acceptée. | socle de notifications d'écosystème ; toute implémentation Market provisoire est explicitement transitoire (§2.2) |
| **D-6 — Événements Market vers Colors** | **ARBITRÉE** | Market **émet** des événements. **Colors ne modifie jamais automatiquement son stock** sur une publication ou une réservation. Seule une **transaction confirmée** peut déclencher une **proposition idempotente et traçable**, soumise à l'utilisateur. | consommation par Colors dans un lot Colors ultérieur, sous cette contrainte |
| **D-7 — Prix figé au contrat** | **FERMÉE — intégrée à D-8** | le prix cesse d'être relu dans le code : il est figé sur la ligne d'abonnement produit (règle H2) | traitée par le lot multiproduit **MP** |
| **D-8 — Modèle d'abonnement multiproduit** | **FERMÉE dans son principe** | contrat commercial d'entreprise + une **ligne par produit souscrit** ; `produit_id` stable ; génération, périodicité et prix **par produit** ; un seul `Customer` Stripe, une `Subscription` par produit | **lot MP** : plan de migration en 8 étapes, réconciliation à zéro écart, pgTAP sur base clonée. **Interdit de lever `unique(entreprise_id)` sans ce plan.** |
| **D-9 — Vente entre particuliers (C2C)** | **FERMÉE — EXCLUE** | un particulier ne publie pas, ne vend pas, ne se déclare pas professionnel | audit juridique dédié (G-1) avant toute ouverture |
| **D-10 — Arbitrage tarifaire Market** | **OUVERTE — maintenue ouverte** | aucun palier, aucun quota, aucune durée d'essai, aucun montant n'est proposé | **maintenue ouverte jusqu'à l'étude des coûts** ; lot tarifaire dédié ensuite |
| **D-11 — Facturation multiproduit** | **ORIENTÉE** | **un `Customer` par entreprise et plusieurs souscriptions peuvent être retenus techniquement**, mais **l'expérience plateforme doit présenter une facturation consolidée**. Des factures Stripe multiples ne sont pas une réponse acceptable en l'état. | **forme définitive décidée dans le lot multiproduit du Train V3** |
| **D-12 — Prestations de service** | **FERMÉE — HORS V1** *(nouvelle)* | Market vend des **biens** ; main-d'œuvre, sous-traitance et prestations ne sont pas publiables | produit distinct, à instruire pour lui-même (G-5) |

### 2.1 Décisions désormais fermées — récapitulatif

| # | Énoncé |
|---|---|
| 1 | **Abonnement vendeur obligatoire à partir de la première annonce publiée. Consultation et achat gratuits. Brouillons possibles avant souscription.** Le freemium est écarté. |
| 2 | **ELSATIA n'encaisse pas l'argent de la vente en V1.** Stripe ne sert qu'à facturer l'abonnement vendeur. |
| 3 | **Publication réservée aux professionnels vérifiés.** C2C exclu. |
| 4 | **Échanges autorisés entre professionnels vérifiés**, soulte possible, réglée hors plateforme. |
| 5 | **Vérification professionnelle obligatoire**, automatique **ou manuelle**, avec dossier tracé, expiration et journal d'audit. |
| 6 | **Modèle d'abonnement multiproduit** : un contrat d'entreprise, une ligne par produit. |
| 7 | **Market porte des biens professionnels**, jamais un bien interdit, dangereux, volé, contrefait ou non conforme. **Prestations hors V1.** |
| 8 | **Market fonctionne sans Gestion Pro.** Ponts facultatifs, liens **faibles et nullables**. |

### 2.2 Décisions complémentaires arrêtées après acceptation de la R2

Ces quatre décisions sont consignées ici et **nulle part ailleurs** : elles orientent des lots
ultérieurs, pas la spécification Market.

#### D-5 — Notifications : socle partagé, pas de duplication

> Les notifications reposeront **à terme sur un socle partagé ELSATIA**, avec des **événements Market
> spécifiques**. **Aucune duplication permanente du modèle Réserves.**

Ce que cela change par rapport à la R2 : la recommandation « dupliquer le modèle Réserves » n'était
acceptable que comme raccourci. Elle est **refusée comme état final**.

| Conséquence | |
|---|---|
| Le socle de notifications devient un **lot d'écosystème**, au même titre que le socle multiproduit | il sert Réserves, Market et les produits suivants |
| Le **catalogue d'événements Market** (§6.2 de la spécification) reste valide | il décrit *quoi* notifier, pas *par quel mécanisme* |
| La distinction **service / sécurité / commercial / publicité** est portée par le socle | et non réinventée par produit |
| Si une implémentation Market devait précéder le socle, elle serait **explicitement transitoire** | jamais présentée comme définitive, et dimensionnée pour être reprise |
| Contrainte non négociable, conservée | les notifications **sécurité** ne sont jamais désactivables, l'ouverture d'un accès d'assistance en fait partie |

#### D-6 — Événements Market → Colors : proposition, jamais mutation

> Market **émet** des événements, mais **Colors ne modifie jamais automatiquement son stock** sur une
> publication ou une réservation. Une **transaction confirmée** peut seulement déclencher une
> **proposition idempotente et traçable**.

C'est une contrainte plus forte que celle de la R2, et elle est juste : une publication n'est pas une
sortie, et une réservation n'est pas une vente. Seule une remise confirmée constitue un fait
susceptible d'affecter un stock — et même alors, elle **propose**, elle n'applique pas.

| Règle | |
|---|---|
| **C1** | Ni une publication, ni une réservation, ni une acceptation d'offre ne produisent d'effet sur un stock Colors ou Gestion Pro. |
| **C2** | Seule une **transaction confirmée** (code de retrait validé, ou double code pour un échange) peut donner lieu à une proposition. |
| **C3** | La proposition est **idempotente** : rejouer l'événement, le dupliquer ou le recevoir deux fois ne produit **jamais** un second effet. La clé d'idempotence est portée par l'événement, pas déduite. |
| **C4** | La proposition est **traçable** : origine, événement source, horodatage, quantité, destinataire — et son acceptation comme son rejet sont journalisés. |
| **C5** | La proposition est **soumise à un utilisateur habilité**. Aucune application automatique, même paramétrable, n'est prévue. |
| **C6** | Une proposition non traitée **expire** sans effet. L'absence de décision n'est jamais interprétée comme un accord. |

Cette décision est **cohérente avec le document Bridge** (règle B2 : Market n'écrit jamais dans le
stock ; §5.2 : le décrément reste un mouvement de stock ordinaire saisi par le vendeur). Elle la
**durcit** sur deux points : le déclencheur est restreint à la transaction confirmée, et
l'idempotence devient une exigence explicite du contrat d'événement.

#### D-10 — Tarif Market : ouvert jusqu'à l'étude des coûts

> Le tarif Market est **maintenu ouvert jusqu'à l'étude des coûts**.

L'arbitrage ne dépend donc pas seulement d'une étude de marché mais d'abord d'une **étude de coûts** :
coût de la vérification professionnelle (la voie manuelle est une charge humaine récurrente), coût de
la modération, coût du stockage des photos, coût de la recherche, coût d'acquisition. Aucun palier,
aucune durée d'essai, aucun montant ne sera proposé avant.

#### D-11 — Facturation multiproduit : consolidée à l'expérience

> **Un `Customer` par entreprise et plusieurs souscriptions peuvent être retenus techniquement**,
> mais **l'expérience plateforme doit présenter une facturation consolidée**. La forme définitive sera
> décidée dans le **lot multiproduit du Train V3**.

Le découpage technique recommandé en R2 — une `Subscription` Stripe par produit, imposé par le fait
que les items d'une même souscription partagent le même intervalle de facturation — **reste
recevable**. Ce qui est refusé, c'est d'en laisser la conséquence remonter jusqu'au client : une
entreprise abonnée à trois produits ne doit pas recevoir trois factures sans lien apparent, ni
consulter trois espaces.

| Exigence | |
|---|---|
| Un **espace de facturation unique** par entreprise | déjà porté par le `Customer` unique |
| Une **vue consolidée** de ce qui est souscrit, produit par produit | — |
| Une **facturation présentée comme consolidée** | la forme — document unique, relevé périodique, ou autre — relève du Train V3 |
| `factures_abonnement` existe et sait produire une facture ELSATIA | c'est une des voies possibles, pas la décision |

**Arbitrage renvoyé au lot multiproduit du Train V3.** Il n'est ni tranché, ni préempté ici.

### 2.3 Décisions tarifaires encore ouvertes

Aucun montant n'est proposé dans ce lot. Restent à arbitrer (**D-10**) :

paliers d'abonnement vendeur (volume d'annonces actives) · annonce supplémentaire à l'unité · mise
en avant (**achat ponctuel**, jamais un « /mois ») · page vendeur enrichie · offre multi-sites et
grands comptes (devis) · **période d'essai** — durée, contenu, avec ou sans moyen de paiement ·
**offre de lancement** — taux, durée, éligibilité · confirmation de la règle maison `annuel = 10 ×
mensuel` pour Market. Et, distinctement, **D-11** sur la forme de la facture.

**Rappel D-10** : l'arbitrage est **maintenu ouvert jusqu'à l'étude des coûts** (§2.2).

**Point d'attention commercial.** Le palier gratuit étant écarté, l'amorçage n'est plus subventionné.
Trois leviers compatibles avec la décision restent disponibles et sont recommandés à l'étude :
**période d'essai bornée** (une souscription au statut `essai`, qui **finit** — ce n'est pas du
freemium), **tarif d'entrée bas**, et **amorçage manuel** du catalogue depuis le parc existant. Un
quatrième — inclure Market un temps dans Gestion Pro — est signalé comme **piège** : ce qui a été
inclus est très difficile à facturer ensuite.

---

## 3. Périmètre V1 définitif

**Acheteurs.** Consultation, recherche et filtres **anonymes et gratuits**. Compte gratuit pour
favoris, alertes, messagerie, offres, réservations. Aucun abonnement, jamais — particulier comme
professionnel.

**Vendeurs.** Entreprise **vérifiée** (N1–N3, voie automatique ou manuelle) **et** abonnement Market
**actif** : deux conditions cumulatives et indépendantes. Brouillons libres avant souscription.
Rôles Market propres, habilitation par personne, validation interne optionnelle par organisation.

**Annonces.** Nomenclature **fermée** avec catégories réglementées, mentions bloquantes, photos
obligatoires, partie publique et partie privée séparées, localisation **approchée**, modification
encadrée et versionnée, cycle de vie complet avec journal append-only.

**Interactions.** Messagerie interne à quotas, sans lien externe, sans pièce jointe · offres et
contre-offres · **échanges entre professionnels vérifiés, avec soulte, contre-propositions,
expiration, annulation, historique exportable et double code de retrait** · réservation avec code de
retrait · signalement ouvert aux anonymes · modération motivée et contestable.

**Recherche.** Projection publique dédiée, plein texte insensible aux accents, distance approchée,
pagination par curseur, gardes anti-énumération.

**Commercial.** Abonnement vendeur facturé par ELSATIA via Stripe, sur le modèle multiproduit.
**Aucun flux financier de vente ne transite par ELSATIA.**

---

## 4. Fonctionnalités différées

| Fonction | Motif |
|---|---|
| Paiement de la vente sur la plateforme | décision D-3 |
| Commission sur transaction | décision D-3 ; aucune brique n'existe |
| **Vente entre particuliers (C2C)** | **exclue par décision D-9** ; audit juridique dédié requis |
| **Prestations de service, main-d'œuvre, sous-traitance** | **exclues par décision D-12** |
| **Palier gratuit permanent autorisant la publication** | **écarté par décision** |
| Avis et réputation | sans transaction observée, un avis n'est pas vérifiable — donc manipulable |
| Don / mise à disposition gratuite | régime fiscal et responsabilité distincts du prix zéro |
| Achat groupé | suppose un agrégateur de demande et une gestion de seuil |
| Transport intégré | responsabilité de commissionnaire de transport |
| API publique | multiplie la surface d'aspiration avant d'avoir mesuré l'usage |
| Application mobile dédiée | le web responsive suffit à valider le marché |
| Score de confiance influençant le classement public | transparence DSA/P2B ; données insuffisantes en V1 |
| Paiement en ligne **sans commission** (V2 possible) | la brique Connect Standard existe ; à réexaminer si le besoin est démontré (G-2) |

---

## 5. Risques juridiques — inchangés dans leur nature

Trois régimes se superposent : **DSA**, **P2B**, **Code de la consommation**, plus éventuellement
**DAC7**.

> **Avertissement central, à ne jamais omettre** : le fait qu'ELSATIA n'encaisse pas la vente
> **ne la dispense pas** du DSA, du P2B, du Code de la consommation ni de DAC7. Cette décision
> supprime les obligations liées à la **détention de fonds pour compte de tiers** — statut de
> paiement, KYC financier, séquestre, chargebacks. **Elle n'en supprime aucune autre.**

Une **checklist destinée à un avocat** est livrée (§12 du cadre juridique) : contexte produit en dix
lignes, cinq questions dimensionnantes (A-1 à A-5), puis les questions de statut, de données, de
vente, de catégories, de fraude et d'évolutions futures — 40 points au total, avec ce qui est demandé
en retour.

Les deux questions qui commandent le dimensionnement restent **A-1** (Market permet-il de conclure un
contrat à distance, alors que la vente se conclut hors plateforme ?) et **A-2** (DAC7 s'applique-t-elle
sans intermédiation du paiement ?). **Position d'ingénierie recommandée sur les deux : construire
comme si la réponse était oui.**

**Catégories interdites** : amiante et matériaux en contenant (aucune exception, pas même « pour
dépose ») · déchets destinés à l'élimination · produits REACH restreints ou hors emballage d'origine ·
phytosanitaires · EPI d'occasion des catégories interdites · équipements de travail non conformes ·
contrefaçons · biens non possédés (**recel**) · armes, munitions, explosifs · gaz consignés et
extincteurs non contrôlés · matériels de concessionnaire de réseau · **fichiers clients** ·
**prestations de service** · véhicules gagés · **toute catégorie absente de la nomenclature**.

---

## 6. Dépendances

| Dépendance | Nature | Bloquant |
|---|---|:---:|
| **Lot MP — modèle d'abonnement multiproduit** | interne, transverse | **OUI pour M8** (donc pour l'ouverture commerciale) |
| **Capacité de traitement manuel des vérifications** | organisationnel | **OUI** si la voie manuelle est retenue |
| Extensions PostgreSQL `unaccent`, `pg_trgm`, `earthdistance`/`cube` | infrastructure, **non installées** | **OUI pour M3** |
| Cadrage juridique par un avocat (checklist §12) | **externe** | **OUI** |
| Fusion du lot assistance + communications `9fcf128` | interne, non fusionné | **OUI** |
| Modération d'images (EXIF au minimum) | externe ou interne | **OUI** |
| Géocodage d'adresses | **externe** | oui (distance) |
| Source automatique de vérification | **externe** | **non** — repli manuel |
| Réconciliation du ledger de migrations | interne | oui |
| Lot **ELSATIA-UI-V2** | interne, non démarré | **oui — toute UI produite avant serait à refaire** |
| Marque ELSATIA — jalon du 21/10/2026 | juridique | oui (communication) |

---

## 7. Estimation de réalisation par lots

| Lot | Contenu | Charge | Bloqué par |
|---|---|---|---|
| **M0** | Arbitrages D-10, D-11 ; cadrage juridique (checklist §12) | — | — |
| **M1** | Socle : catalogue, rôles, **dossier de vérification** (N1–N3, voies auto et manuelle, expiration, journal), espace vendeur | **lourd** | — |
| **M2** | Annonces : modèle, états, nomenclature, mentions réglementaires, photos, bucket public, modération de base | **lourd** | M1 |
| **M3** | Recherche : projection, extensions, index, distance, filtres, curseur | **moyen à lourd** | extensions PostgreSQL |
| **M4** | Vitrine publique : pages anonymes, référencement, mentions | **moyen** | M2, M3 |
| **M5** | Interactions : messagerie, offres, **échanges avec soulte et double code de retrait**, réservations | **moyen à lourd** | M2 |
| **M6** | Modération et sécurité : signalements, file, suspensions, contestations, score | **moyen** | M2 |
| **M7** | Notifications | **moyen** | M5 |
| **M8** | **Commercial** : offre Market, abonnement, blocage de publication, facturation | **moyen** | **MP** |
| **M9** | Ponts Stock et Colors (liens faibles nullables) | **léger à moyen** | M2 |
| **M10** | Site public « À venir » (**dépôt `elsatia-site`, hors de ce lot**) | **léger** | — |
| **M11** | Recette, sécurité, RGPD, charge | **moyen** | tous |
| **MP** | **Modèle d'abonnement multiproduit ELSATIA** — lot d'écosystème : catalogue produit, contrat, lignes produit, modules et options génériques, migration en 8 étapes, réconciliation, pgTAP | **lourd** | — |

**Chemin critique.** M1 → M2 → {M3, M5, M6, M9} → M4 → M7 → M11. **M8 est parallèle mais bloqué par
MP** — et comme aucune annonce n'est publiable sans abonnement actif, **MP conditionne l'ouverture
commerciale**, pas la construction du produit. MP peut donc être conduit en parallèle de M1–M7, ce
qui est recommandé : c'est un lot d'écosystème qui bénéficie à tous les produits et corrige une dette
existante.

**Aucune UI ne doit être produite avant ELSATIA-UI-V2.**

---

## 8. Documents révisés

| Fichier | Révision R2 |
|---|---|
| `ELSATIA-MARKET-ARCHITECTURE-AUDIT-REPORT.md` | §4 (issues des cinq questions), §6 (verdict actualisé, trois modèles de monétisation) |
| `ELSATIA-MARKET-FUNCTIONAL-SPECIFICATION-V1.md` | **§2.5.1 abonnement obligatoire** (règles AB1–AB7), §2.6 C2C exclu, **§2.7 architecture de vérification** (dossier, sources, repli manuel, expiration), §3.2.1 périmètre produit et prestations hors V1, **§3.7 échanges entre professionnels** (soulte, états, double code de retrait, historique), §5.1 parcours vendeur, §9 périmètre V1, matrice des droits |
| `ELSATIA-MARKET-BUSINESS-MODEL-V1.md` | **réécrit** : cadre fermé, freemium écarté, §3 amorçage sans palier gratuit, **§5 modèle d'abonnement multiproduit** (trois modèles incompatibles, modèle cible, Stripe, protection des contrats historiques, plan de migration en 8 étapes) |
| `ELSATIA-MARKET-LEGAL-COMPLIANCE-FRAMEWORK-V1.md` | **§0.2 « sans encaissement » ne dispense de rien**, §11 recommandations actualisées, **§12 checklist avocat** (40 points) |
| `ELSATIA-MARKET-GP-COLORS-STOCK-BRIDGE-V1.md` | règle B3 (lien **faible et nullable**), §1 vérification d'autonomie sans Gestion Pro |
| `ELSATIA-MARKET-SECURITY-MODERATION-MODEL-V1.md` | §2 validation manuelle comme chemin de premier rang, conséquences opérationnelles, récapitulatif des manques actualisé |
| `ELSATIA-MARKET-WIREFRAMES-V1.md` | **W-08 bis publication bloquée**, **W-14 bis proposition d'échange avec soulte**, W-08 vérification gratuite et antérieure, W-12 double condition |
| `ELSATIA-MARKET-RAPPORT-FINAL-V1.md` | ce document |

---

## 9. Confirmation de non-modification

| Vérification | Résultat |
|---|---|
| Code métier modifié | **aucun** — 0 fichier de `src/`, `apps/`, `packages/` |
| Migration créée ou modifiée | **aucune** — 272 migrations, inchangées |
| Numéro de ledger réservé | **aucun** |
| SQL proposé créé | **aucun** |
| Gestion Pro, Réserves, Colors, Tools modifiés | **non** |
| Site public modifié | **non** — dépôt distinct, non touché |
| Objet Stripe Test ou Live créé, lu par API ou modifié | **aucun** |
| Déploiement | **aucun** |
| Fusion | **aucune** |
| Branche poussée | `feat/market-architecture-legal-business-v1` **uniquement** |
| Worktrees d'autres conversations touchés | **aucun** |

**Market n'est présenté nulle part comme ouvert ou disponible. Aucun tarif définitif n'est formulé.
Aucune marketplace existante n'a été imitée. Aucune recommandation « freemium vendeur » ne subsiste.**

---

## 10. Clôture du lot Market

**La conversation Market est close.** La R2 est acceptée au SHA `87415d1`, et les décisions
complémentaires D-5, D-6, D-10 et D-11 sont consignées au §2.2.

> **Règle d'ordonnancement, opposable aux lots suivants : aucun lot de développement Market ne
> commence avant le socle multiproduit.**

Elle est cohérente avec le chemin critique établi au §7 — aucune annonce n'étant publiable sans
abonnement actif, le socle multiproduit conditionne l'ouverture commerciale — et elle l'étend :
elle suspend aussi les lots M1 à M7 et M9, qui étaient techniquement parallélisables.

Ce qui reste à faire avant qu'un lot Market puisse s'ouvrir :

| Préalable | Nature |
|---|---|
| **Socle multiproduit (lot MP, Train V3)** | interne — **condition d'ordonnancement** |
| Cadrage juridique par un avocat (checklist §12 du cadre juridique) | externe |
| Étude des coûts, puis arbitrage tarifaire (D-10) | interne |
| Socle de notifications partagé (D-5) | interne, lot d'écosystème |
| Extensions PostgreSQL `unaccent`, `pg_trgm`, `earthdistance`/`cube` | infrastructure |
| Fusion du lot assistance et communications `9fcf128` | interne |
| Lot ELSATIA-UI-V2 | interne — **aucune UI Market avant** |

Les huit documents de `docs/market/` constituent la référence du produit. Ils sont figés en l'état
jusqu'à la reprise du sujet.
