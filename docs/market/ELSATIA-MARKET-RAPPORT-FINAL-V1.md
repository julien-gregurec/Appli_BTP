# ELSATIA-MARKET — RAPPORT FINAL DU LOT

Lot : `ELSATIA-MARKET-BUSINESS-LEGAL-TECHNICAL-ARCHITECTURE-V1`
Branche : `feat/market-architecture-legal-business-v1`
SHA de base : `1fc1331` (`integration/elsatia-ecosystem-train-v2-reserves-gp-v1`)
Date : 2026-09-08

---

## 1. Verdict

**Market est un produit entièrement neuf, posé sur un socle sain mais partiel. Aucun obstacle
technique rédhibitoire. Trois décisions non techniques déterminent l'essentiel de la charge.**

L'audit établit un fait net : **zéro ligne de Market** existe aujourd'hui — ni table, ni fonction, ni
écran, ni contrat, dans aucune des 272 migrations ni dans aucun des dépôts applicatifs.

Ce qui est acquis est solide : le socle multi-application (migration 234) est générique et
correctement conçu ; l'isolation multi-tenant est mature (168 activations RLS) ; l'anti-abus est
réutilisable tel quel ; le mécanisme d'assistance justifiée existe ; la structure du contrat
tarifaire canonique est un bon modèle ; et l'annuaire Réserves fournit le seul précédent maison de
publication cross-tenant — avec des gardes anti-énumération dont la prudence doit être reprise sans
être diluée.

Ce qui manque n'est pas accessoire. **Cinq briques structurantes sont absentes de tout
l'écosystème** : l'identité d'un particulier sans organisation, la vérification qu'un vendeur est
réellement un professionnel, la lecture publique anonyme gouvernée, la recherche textuelle et
géographique, et la modération. Aucune ne se dérive d'un existant.

Deux découvertes d'audit changent le dimensionnement :

- **Stripe Connect Standard est déjà câblé** (`entreprises.stripe_account_id`, OAuth avec garde
  d'état, contrôle de permission) — **mais sans aucun `application_fee` ni `transfer_data`**. La
  brique d'un paiement vendeur existe ; celle d'une commission n'existe pas du tout.
- **`abonnements_entreprises.entreprise_id` est `unique`** : une entreprise, un abonnement. Une
  entreprise abonnée à Gestion Pro **et** à Market ne rentre pas dans le modèle actuel. C'est le
  principal obstacle technique du volet commercial, et il est indépendant du modèle retenu.

---

## 2. Périmètre V1 recommandé

Vérification professionnelle (N1–N3) · annonces avec photos · nomenclature fermée avec catégories
réglementées · recherche textuelle, par catégorie et par distance · favoris, recherches enregistrées,
alertes · messagerie interne avec quotas · offres et contre-offres · échange entre professionnels ·
réservation avec code de retrait · signalement et modération avec recours · journal append-only ·
notifications de service et de sécurité · abonnement vendeur · **mise en relation sans encaissement
de la vente**.

**Consultation entièrement anonyme.** Compte requis seulement pour interagir. Ce choix maximise
l'audience d'une place de marché naissante tout en minimisant la collecte de données personnelles.

---

## 3. Fonctions différées

| Fonction | Motif |
|---|---|
| Paiement de la vente sur la plateforme | change la nature juridique et fiscale ; impose KYC, litiges, chargebacks |
| Commission sur transaction | idem, et suppose de mesurer la valeur avant de la tarifer |
| Avis et réputation | sans transaction observée, un avis n'est pas vérifiable — donc manipulable |
| Don / gratuité | régime fiscal et responsabilité distincts du prix zéro |
| Achat groupé | suppose un agrégateur de demande et une gestion de seuil |
| **Vente entre particuliers (C2C)** | **audit juridique dédié requis — décision de Julien (D-9)** |
| Transport intégré | responsabilité de commissionnaire de transport |
| API publique | multiplie la surface d'aspiration avant d'avoir mesuré l'usage |
| Application mobile dédiée | le web responsive suffit à valider le marché |
| Score de confiance influençant le classement public | transparence DSA/P2B ; données insuffisantes en V1 |

---

## 4. Modèle économique recommandé

**Modèle 3 — abonnement de base avec palier gratuit et options de visibilité — pour le lancement,
avec une trajectoire explicite vers le Modèle 1 (abonnement vendeur pur).**

Trois modèles ont été étudiés (abonnement pur ; abonnement + commission ; freemium encadré).

- **La commission est prématurée, pas mauvaise.** Elle exige d'intermédier des paiements entre tiers
  — KYC, litiges, chargebacks, TVA sur biens d'occasion — alors qu'aucune de ces briques n'existe.
  Et elle repose sur un pari défavorable : que les parties paieront sur la plateforme plutôt que de
  sortir après la mise en relation, sur des biens souvent retirés sur place et réglés par virement.
- **L'abonnement pur est le bon régime de croisière, un mauvais point de départ** : facturer la
  publication dans un catalogue vide, c'est vendre une audience qui n'existe pas.
- **Le freemium encadré est l'abonnement pur avec une rampe d'accès.** Même simplicité juridique,
  même coût opérationnel modéré, et il résout l'amorçage. Les deux convergent naturellement.

**À éviter absolument : lancer avec une commission.** Charge maximale au moment où le produit a le
moins de valeur démontrée, et très difficile à retirer une fois annoncée.

**Paiement : S1 + S5 + S6** — contact direct, paiement au retrait, facturation par le vendeur.
ELSATIA ne touche jamais le prix d'un bien. Trajectoire V2 si le besoin est démontré : **Connect
Standard sans commission**, la brique existant déjà.

**Aucun tarif n'est proposé.** Les montants relèvent d'un lot tarifaire dédié et d'une décision de
Julien, comme cela a été fait pour Gestion Pro.

---

## 5. Risques juridiques principaux

| # | Risque | Gravité |
|---|---|:---:|
| R1 | Qualification en plateforme de contrats à distance non anticipée (DSA) — **question juridique n° 1** | **majeure** |
| R2 | Publication d'un bien interdit (amiante, EPI, machine non conforme) | **majeure** |
| R3 | **Recel** | **majeure** |
| R4 | Perte du bénéfice du régime d'hébergeur | **majeure** |
| R5 | Obligations déclaratives **DAC7** non tenues | haute |
| R6 | Confusion Boutique / Market dans l'esprit de l'acheteur | haute |
| R8 | Fuite multi-tenant par l'index de recherche | haute |
| R11 | Market utilisé comme canal d'hameçonnage | haute |
| R12 | C2C ouvert sans audit | **majeure** (nulle si non ouvert) |

Trois régimes se superposent : **DSA** (règlement UE 2022/2065, dont la traçabilité des
professionnels), **P2B** (règlement UE 2019/1150, transparence du classement, motivation des
restrictions), et le **Code de la consommation**. Dix-neuf points sont listés comme devant être
validés par un avocat (J-1 à J-19), dont deux sont dimensionnants : **J-1** (Market permet-il de
conclure un contrat à distance, alors que la vente se conclut hors plateforme ?) et **J-8** (DAC7
s'applique-t-elle sans intermédiation du paiement ?).

**Position d'ingénierie recommandée sur les deux : appliquer comme si la réponse était oui.** Le coût
de la prévoyance est modéré ; celui de la correction rétroactive est élevé.

---

## 6. Catégories interdites

Publication **techniquement impossible**, et non simple règle de modération :

**Amiante et tout matériau en contenant** (interdiction générale de mise sur le marché, décret
n° 96-1133 du 24 décembre 1996 — aucune exception, aucun « à débarrasser », aucun « pour dépose ») ·
déchets destinés à l'élimination · produits chimiques interdits ou restreints par REACH, hors
emballage d'origine ou sans étiquetage · produits phytosanitaires · EPI d'occasion des catégories
interdites · équipements de travail non conformes · contrefaçons et biens à marque retirée ou
altérée · biens dont le vendeur n'est pas propriétaire (**recel**) · armes, munitions, explosifs,
artifices · bouteilles de gaz consignées et extincteurs non contrôlés · matériels appartenant à un
concessionnaire de réseau · **données et fichiers clients** · prestations de service et
main-d'œuvre · véhicules gagés ou sans certificat d'immatriculation · **toute catégorie absente de
la nomenclature**.

Principe directeur : **dans le doute, ne pas ouvrir la catégorie.** Une catégorie fermée fait perdre
du chiffre d'affaires ; une catégorie ouverte à tort peut faire perdre l'entreprise.

---

## 7. Dépendances

| Dépendance | Nature | Bloquant |
|---|---|:---:|
| **Source de vérification d'entreprise** (registre officiel) | **externe, contractuelle** | **OUI** |
| Extensions PostgreSQL `unaccent`, `pg_trgm`, `earthdistance`/`cube` | infrastructure, **non installées** | **OUI** (recherche) |
| Fusion du lot assistance + communications `9fcf128` | interne, branche non fusionnée | **OUI** |
| Cadrage juridique par un avocat (J-1 à J-19) | **externe** | **OUI** |
| Géocodage d'adresses | **externe** | oui (distance) |
| Modération d'images | **externe ou humaine** | oui |
| Réconciliation du ledger de migrations | interne | oui |
| Prix figé au contrat (dette du moteur commercial) | interne | oui (volet commercial) |
| Lot **ELSATIA-UI-V2** (refonte visuelle) | interne, non démarré | **oui — toute UI produite avant serait à refaire** |
| Marque ELSATIA — jalon de commercialisation 21/10/2026 | juridique | oui (communication) |

---

## 8. Décisions demandées à Julien

| # | Décision | Recommandation d'audit | Criticité |
|---|---|---|:---:|
| **D-1** | Comment existe un particulier acheteur ? (entreprise fantôme / identité Market autonome / achat sans compte) | **achat sans compte en V1**, identité Market autonome dès l'ouverture de la messagerie. **Jamais l'entreprise fantôme** : elle pollue le registre et ment sur la nature de l'acteur. | **haute** |
| **D-2** | Séparation physique des surfaces publique et vendeur | **oui** : chemins, policies et projections distincts ; lecture publique par fonctions à projection explicite | haute |
| **D-3** | **ELSATIA touche-t-elle l'argent de la vente ?** | **non en V1.** C'est la décision dont dépendent le modèle économique, le juridique, le KYC, la TVA, les litiges et l'essentiel de la charge. | **maximale** |
| **D-4** | Contracter une source de vérification d'entreprise | **oui, prérequis à l'ouverture.** Sans elle, l'exigence « un particulier ne doit pas pouvoir se déclarer professionnel » n'est pas tenue et le recel devient probable. | **maximale** |
| **D-5** | Notifications : dupliquer le modèle Réserves ou le généraliser ? | **dupliquer en V1** (généraliser imposerait de modifier Réserves) ; factoriser plus tard | moyenne |
| **D-6** | Émettre dès la V1 l'événement « publié sur Market » destiné à Colors, sans consommateur ? | **oui.** L'émettre coûte peu ; le rétro-installer sur un historique constitué coûte beaucoup. | moyenne |
| **D-7** | Traiter la dette « prix non figé au contrat » **avant** de créer une offre Market | **oui**, sinon le défaut se reproduit sur un deuxième produit | haute |
| **D-8** | Lever `unique(entreprise_id)` sur `abonnements_entreprises`, ou modèle d'abonnement par application ? | **abonnement par application** — plus coûteux, mais Market doit pouvoir être souscrit **sans** Gestion Pro | **haute** |
| **D-9** | **Ouvrir la vente entre particuliers ?** | **non**, et pas sans un audit juridique dédié | **haute** |
| **D-10** | Arbitrage tarifaire Market (paliers, gratuit, mise en avant, essai) | **lot tarifaire dédié**, après étude de marché. Aucun montant n'est proposé ici. | moyenne |

---

## 9. Estimation de réalisation par lots

| Lot | Contenu | Charge |
|---|---|---|
| **M0** | Décisions D-1 à D-10 + cadrage juridique (J-1 à J-19) | — |
| **M1** | Socle : catalogue, rôles, vérification pro N1–N3, espace vendeur | **lourd** |
| **M2** | Annonces : modèle, états, nomenclature, photos, bucket public, modération de base | **lourd** |
| **M3** | Recherche : projection, extensions, index, distance, filtres, curseur | **moyen à lourd** |
| **M4** | Vitrine publique : pages anonymes, référencement, mentions | **moyen** |
| **M5** | Interactions : messagerie, offres, réservations, code de retrait, quotas | **moyen à lourd** |
| **M6** | Modération et sécurité : signalements, file, suspensions, contestations, score | **moyen** |
| **M7** | Notifications | **moyen** |
| **M8** | Commercial : offre Market, abonnement (**dépend de D-8**), facturation | **moyen** |
| **M9** | Ponts Stock et Colors | **léger à moyen** |
| **M10** | Site public « À venir » (**dépôt `elsatia-site`, hors de ce lot**) | **léger** |
| **M11** | Recette, sécurité, RGPD, charge | **moyen** |

**M1 ne peut pas démarrer avant D-4** (source de vérification). **M3 ne peut pas démarrer avant
l'installation des extensions PostgreSQL.** **Aucune UI ne doit être produite avant
ELSATIA-UI-V2.**

---

## 10. Livrables

| Fichier | Objet |
|---|---|
| `docs/market/ELSATIA-MARKET-ARCHITECTURE-AUDIT-REPORT.md` | Phase 1 — audit et matrice de réutilisation (36 besoins) |
| `docs/market/ELSATIA-MARKET-FUNCTIONAL-SPECIFICATION-V1.md` | Phases 2, 3, 5, 6, 11, 12, 13 |
| `docs/market/ELSATIA-MARKET-BUSINESS-MODEL-V1.md` | Phases 7 et 8 |
| `docs/market/ELSATIA-MARKET-LEGAL-COMPLIANCE-FRAMEWORK-V1.md` | Phase 9 |
| `docs/market/ELSATIA-MARKET-GP-COLORS-STOCK-BRIDGE-V1.md` | Phase 4 |
| `docs/market/ELSATIA-MARKET-SECURITY-MODERATION-MODEL-V1.md` | Phase 10 |
| `docs/market/ELSATIA-MARKET-WIREFRAMES-V1.md` | Wireframes fonctionnels originaux |
| `docs/market/ELSATIA-MARKET-RAPPORT-FINAL-V1.md` | Ce document |

**Aucun SQL proposé n'a été créé.** L'exception prévue par le lot (absence de modèle rendant une
décision impossible) n'a pas eu à être invoquée : les manques de modèle sont documentés comme des
besoins (D-1, D-4, D-8) sans qu'aucun SQL ne soit écrit ni aucun numéro de ledger réservé.

---

## 11. Confirmation de non-modification

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
| Emplacement du worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/market-architecture-v1` (volume externe) |

**Market n'est présenté nulle part comme ouvert ou disponible. Aucun tarif définitif n'est
formulé. Aucune marketplace existante n'a été imitée.**
