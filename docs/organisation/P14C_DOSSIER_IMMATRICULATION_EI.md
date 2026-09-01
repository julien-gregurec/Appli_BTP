# P14C — Dossier de préparation à l'immatriculation de l'entreprise individuelle ELSATIA

> ⚠️ **Correction de pilotage 2026-09-01.** La **forme juridique confirmée est l'entreprise
> individuelle (EI)**. Le **régime fiscal et social (micro-entrepreneur ou réel) n'est PAS
> arbitré** : il doit faire l'objet d'une décision explicite de Julien, idéalement avec un
> expert-comptable, **avant** toute option d'immatriculation et **avant** l'activation de
> Stripe Live. Ne suivre **aucune** étape de ce document qui reviendrait à sélectionner le
> régime micro-entrepreneur tant que cet arbitrage n'a pas eu lieu (voir § 13, étape 3, et
> `CHECKLIST_LANCEMENT.md` § 3). Ne pas confondre forme EI et régime micro.

**Aucune entreprise n'a été créée par ce dépôt. Aucun choix fiscal ou social n'a été fait à la place de Julien.** Ce document rassemble ce qui est déjà décidé, ce qui reste à trancher, et a préparé le parcours de dépôt sur le Guichet unique.

**Mise à jour statut (21-08-2026)** : Julien a déposé lui-même la formalité sur le Guichet unique (signée et payée, hors de ce dépôt de code — je n'y ai pas participé). Le dossier est **en attente du retour INPI/INSEE** (attribution SIREN/SIRET). **Consigne explicite de Julien : ne pas toucher à la formalité pendant l'attente.** Dès réception du SIRET, reprendre au §15.

## 1. Informations déjà confirmées

| Champ | Valeur |
|---|---|
| Forme juridique | **Entreprise individuelle (EI)** — confirmée |
| Régime fiscal et social | **Non arbitré** (micro-entrepreneur *ou* réel) — décision explicite de Julien requise, idéalement avec un expert-comptable, avant l'immatriculation et avant Stripe Live |
| Exploitant | Julien GREGUREC — à revérifier contre l'avis de situation SIRENE une fois l'immatriculation reçue, avant toute publication juridique définitive |
| Nom commercial | ELSATIA — distinct du nom légal de l'exploitant et du nom du produit « ELSATIA Gestion Pro » |
| Adresse du siège | 9 rue du Maréchal Leclerc, 67860 Rhinau, France |
| Email professionnel | support@elsatia.fr — opérationnelle, configurée en Production |
| Site vitrine | https://elsatia.fr |
| Application | https://app.elsatia.fr |
| Activité envisagée (base de travail, pas une formulation administrative définitive) | « Édition et exploitation de logiciels en mode SaaS et prestations de services numériques associées » |

## 2. Décisions

Mise à jour 21-08-2026 — décisions 1 et 2 tranchées par Julien, décision 3 en attente.

- [x] **Date souhaitée de début d'activité** — **1er octobre 2026**. Cohérent avec le calendrier de commercialisation (lancement prévu courant octobre) ; le dépôt peut être effectué jusqu'à 1 mois avant le début d'activité et au plus tard 15 jours après, donc à partir de début septembre 2026 selon cette date.
- [ ] **Régime de TVA au démarrage** — **hypothèse de travail : franchise en base de TVA** (art. 293 B), sous les seuils 2026 pour les prestations de services (37 500 € HT, seuil majoré 41 250 € — voir §9/§10). **Non arbitré** : dépend du régime fiscal/social retenu lors de l'arbitrage avec un expert-comptable (voir § 2). À revérifier au moment du dépôt effectif ; ce n'est pas un fait administratif définitif tant que l'arbitrage et l'immatriculation ne sont pas faits. La mention correspondante de `mentions-legales.md` est passée en marqueur interne bloquant avant publication.
- [x] **Activité secondaire éventuelle** — aucune retenue pour l'instant.
- [x] **Assurance RC Pro** — recommandée, non bloquante ; décision de souscription (et choix d'assureur) laissée ouverte, à faire au rythme de Julien, sans urgence pour le dépôt lui-même.
- [x] **Compte bancaire dédié** — oui, à ouvrir avant le lot P15 (Stripe Live a besoin d'un IBAN professionnel).
- [ ] **Versement libératoire de l'impôt sur le revenu** — **en attente**. Éligibilité conditionnée par le revenu fiscal de référence (RFR) 2024 par part fiscale du foyer (seuil 2026 autour de 29 315 €/part selon la réglementation en vigueur, à reconfirmer au moment de la décision). **Cette information est personnelle et sensible : je ne la demande pas et ne la stocke pas dans ce dépôt.** Si Julien souhaite trancher ce point avec mon aide, il peut me communiquer directement son éligibilité (oui/non) plutôt que le RFR chiffré lui-même — sinon la décision peut être prise directement avec un expert-comptable ou l'URSSAF.
- **Activité principale exacte à déclarer** — voir §3, formulation à valider par Julien avant saisie (inchangé).
- **Choix fiscal micro-BNC / micro-BIC** — dépend de la classification finale de l'activité (voir §6, inchangé).
- **Numéro de téléphone public ou non** — déjà tranché en P14 : pas de numéro public pour l'instant, contact par formulaires/e-mails uniquement.

## 3. Activité — formulation et classification

Formulation de base validée par Julien comme point de départ :

> Édition et exploitation de logiciels en mode SaaS et prestations de services numériques associées.

**Proposition de reformulation pour le champ administratif du Guichet unique**, sans changer le fond, à valider par Julien avant saisie (le formulaire attend généralement une phrase courte et descriptive) :

> Édition, exploitation et commercialisation d'un logiciel en ligne (SaaS) de gestion d'entreprise, et prestations de services numériques associées.

**Activité principale** : édition/exploitation du logiciel SaaS (ELSATIA Gestion Pro).
**Activité secondaire éventuelle** : aucune retenue à ce stade — à confirmer par Julien si une activité distincte doit être déclarée.

Le Guichet unique attribue le **code APE/NAF automatiquement** selon l'activité déclarée, généralement dans la famille « Édition de logiciels » (58.29) ou « Programmation informatique » (62.01) pour ce type d'activité — **non garanti avant attribution réelle**, ne pas présenter comme acquis.

## 4. Classification fiscale/sociale (BIC/BNC)

Une activité d'édition et d'exploitation de logiciel (vente d'un service SaaS, pas de prestation intellectuelle pure au sens BNC classique) relève généralement des **BIC** (bénéfices industriels et commerciaux, catégorie prestations de services), mais la frontière BIC/BNC dépend de la qualification précise retenue par le Guichet unique et de l'activité réellement exercée. **Ce n'est pas une certitude tranchée ici** — à vérifier avec un expert-comptable ou l'URSSAF avant de cocher une case sur le formulaire, car cela conditionne le régime micro-fiscal applicable (micro-BIC vs micro-BNC, taux d'abattement forfaitaire différents).

## 5. Pièces à préparer pour le dépôt

- [ ] Pièce d'identité en cours de validité (carte d'identité ou passeport).
- [ ] Justificatif de domicile récent (moins de 3 mois généralement) pour l'adresse retenue — 9 rue du Maréchal Leclerc, 67860 Rhinau, France.
- [ ] Déclaration de non-condamnation / attestation sur l'honneur de non-condamnation (généralement demandée pour l'activité commerciale/libérale, à confirmer selon la classification retenue).
- [ ] Coordonnées personnelles complètes (téléphone privé, email personnel — distincts du contact professionnel `support@elsatia.fr`).
- [ ] Adresse de l'entreprise — déjà disponible (§1).
- [ ] Description précise de l'activité — déjà disponible (§3), à ajuster si besoin au moment de la saisie.
- [ ] Date de début d'activité souhaitée — à décider (§2).
- [ ] Nom commercial — déjà disponible (§1, §8).
- [ ] Choix fiscaux/sociaux (régime micro-fiscal, versement libératoire, TVA, ACRE) — à décider avant de cocher quoi que ce soit (§2, §10).
- [ ] Justificatifs complémentaires éventuels — le portail peut en demander selon les réponses données pendant la saisie (dépend du parcours réel au moment du dépôt, non prévisible à l'avance).

## 6. Décisions à confirmer — récapitulatif rapide

Voir §2 pour la liste complète. Décisions structurantes à trancher en priorité, **avec un expert-comptable**, avant tout dépôt :
0. **Régime fiscal et social de l'EI : micro-entrepreneur *ou* réel.** ⛔ Préalable bloquant, non arbitré (voir l'encadré en tête de document et `CHECKLIST_LANCEMENT.md` § 3). Les points 1 et 2 ci-dessous ne s'appliquent que **si** le régime micro est retenu à l'issue de cet arbitrage.
1. **Régime micro-fiscal classique vs versement libératoire de l'impôt sur le revenu.**
2. **Régime de TVA au démarrage** (voir arbre de décision détaillé §10).

## 7. Nom commercial — distinction claire

| Niveau | Nom |
|---|---|
| Identité juridique (exploitant) | Julien GREGUREC |
| Nom commercial (EI) | ELSATIA |
| Produit / application | ELSATIA Gestion Pro |

Cette distinction est déjà reflétée dans les documents juridiques de l'application (`docs/juridique/*.md`) et du site vitrine (`elsatia-site/src/content/legal.ts`), harmonisée en P14/P14B.

## 8. Adresse — où elle devra être reportée après immatriculation

L'adresse **9 rue du Maréchal Leclerc, 67860 Rhinau, France** est déjà reportée (P14) dans :
- `docs/juridique/mentions-legales.md` (application)
- `docs/juridique/README.md` (checklist de préparation)
- `elsatia-site/src/content/legal.ts` (site vitrine, 3 sections)

Une fois le SIRET reçu, aucune nouvelle saisie d'adresse n'est nécessaire ailleurs — seul le SIREN/SIRET lui-même reste à ajouter aux mêmes emplacements (voir §15).

## 9. TVA — contexte chiffré (2026, à vérifier au moment du dépôt)

Pour information, non décisionnel : le seuil de franchise en base de TVA pour les prestations de services est de **37 500 € HT** de chiffre d'affaires annuel en 2026, avec un seuil de tolérance à **41 250 €** (dépassement ponctuel : la franchise reste acquise l'année en cours, bascule à la TVA au 1er janvier suivant en cas de second dépassement). Ces seuils sont stables depuis leur harmonisation au 1er janvier 2025 ; une réforme vers un seuil unique de 25 000 € a été débattue en 2025 mais abandonnée. **À reconfirmer au moment du dépôt réel**, ces règles pouvant évoluer.

## 10. Arbre de décision TVA

**Cas A — Franchise en base de TVA au démarrage** (probable si le chiffre d'affaires prévisionnel reste sous les seuils du §9) :
- Devis/factures : mention obligatoire « TVA non applicable, article 293 B du Code général des impôts » — c'est la mention déjà présente par défaut dans `mentions-legales.md`.
- Aucune TVA collectée ni reversée.
- Stripe : pas de configuration de taxe automatique nécessaire (`STRIPE_AUTOMATIC_TAX_ENABLED` reste à `false`).
- Mentions légales : numéro de TVA intracommunautaire = « Non applicable ».
- Simplicité administrative maximale, adaptée à un démarrage.

**Cas B — Assujettissement à la TVA** (choix dès le départ, ou obligatoire après dépassement des seuils) :
- Devis/factures : TVA à faire apparaître explicitement (taux, montant HT/TTC).
- Numéro de TVA intracommunautaire à demander au SIE (service des impôts des entreprises) et à faire apparaître partout où « Non applicable » figure actuellement.
- Stripe : `STRIPE_AUTOMATIC_TAX_ENABLED` pourrait être activé selon la décision (déjà piloté par variable d'environnement, aucun changement de code nécessaire — voir `PREPARATION_JURIDIQUE.md`).
- Mentions légales, CGV et facturation à mettre à jour en conséquence.
- Charge administrative plus lourde (déclarations de TVA périodiques).

**Cette décision n'est pas prise dans ce document.** Elle dépend du chiffre d'affaires prévisionnel, de la clientèle (B2B principalement, ce qui limite l'impact de la TVA côté client puisqu'elle est récupérable pour eux), et d'un avis d'expert-comptable recommandé.

## 11. Compte bancaire

- Un compte bancaire **dédié à l'activité** est recommandé dès le démarrage. L'obligation légale d'un compte dédié (au-delà de 10 000 € de chiffre d'affaires cumulé sur deux années consécutives) est une règle propre au **régime micro** ; son applicabilité dépendra du régime arbitré (voir `RDV_BANCAIRE_PREPARATION.md` §2).
- Un **IBAN** sera nécessaire pour configurer Stripe (encaissement des abonnements) — préparation à faire dans le lot P15, pas maintenant.
- Le compte doit être au nom du titulaire de l'entreprise individuelle (Julien GREGUREC) ou de son nom commercial selon les offres bancaires professionnelles disponibles.
- **Rendez-vous bancaire préparé pour le 27-08-2026** — voir `RDV_BANCAIRE_PREPARATION.md` (documents à apporter, questions à poser, mise en garde sur les produits annexes).
- **Aucun identifiant bancaire n'est demandé ni ne doit être communiqué dans ce rapport ou ailleurs dans le chat.**

## 12. Assurance RC Pro

Une activité d'édition et d'exploitation de logiciel SaaS n'est **pas légalement soumise à une obligation de RC Pro** (contrairement à des activités réglementées comme le BTP, la santé ou certaines professions libérales). Elle reste néanmoins **recommandée** en pratique pour une activité numérique commercialisée à des professionnels (couverture en cas de litige contractuel, de panne affectant un client, de réclamation liée aux données traitées). **Non présentée comme obligatoire** — décision et choix d'assureur à faire par Julien une fois l'activité précisément déclarée.

## 13. Checklist pas-à-pas — Guichet unique (formalites.entreprises.gouv.fr)

Plateforme officielle unique depuis le 1er janvier 2023, opérée par l'INPI (registre national des entreprises). Démarche gratuite, entièrement en ligne. Ordre logique de la saisie :

1. **Connexion** — se rendre sur `formalites.entreprises.gouv.fr`, se connecter via FranceConnect+ (ou créer un compte si nécessaire).
2. **Création de la formalité** — choisir « Créer une entreprise ».
3. **Forme juridique** — sélectionner « Entrepreneur individuel » (forme confirmée). ⛔ **POINT BLOQUANT** : l'option **régime micro-entrepreneur (micro-fiscal / micro-social)** ne doit **PAS** être sélectionnée « Oui » par défaut. Le choix entre **régime micro** et **régime réel** doit d'abord être arbitré explicitement par Julien, idéalement avec un expert-comptable (voir § 2 et `CHECKLIST_LANCEMENT.md` § 3). Ne renseigner cette option qu'après cet arbitrage écrit.
4. **Activité** — saisir la formulation retenue (§3), après validation finale de Julien.
5. **Établissement** — renseigner l'adresse du siège : 9 rue du Maréchal Leclerc, 67860 Rhinau, France.
6. **Nom commercial** — indiquer ELSATIA comme nom commercial, distinct du nom de l'exploitant.
7. **Adresse** — confirmer l'adresse de correspondance si différente de l'établissement (à décider par Julien, sinon identique).
8. **Options fiscales/sociales** — cocher les choix tranchés au §2/§6/§10 (régime fiscal/social micro *ou* réel, versement libératoire, TVA, ACRE le cas échéant) — **uniquement après l'arbitrage explicite du régime (micro/réel) par Julien avec un expert-comptable**. Tant que cet arbitrage n'a pas eu lieu, cette étape est **bloquée**.
9. **Justificatifs** — téléverser les pièces du §5.
10. **Vérification** — relire l'ensemble du dossier avant validation (le portail affiche généralement un récapitulatif complet).
11. **Signature** — signature électronique du dossier (selon le mécanisme proposé par le portail au moment du dépôt).
12. **Dépôt** — soumission finale du dossier à l'INPI.

**Ce lot ne réalise aucune de ces étapes.** Cette checklist sert de guide pour que Julien les effectue lui-même.

## 14. Après le dépôt — suivi du dossier

- [ ] Accusé de réception du dépôt (généralement immédiat sur le portail).
- [ ] Suivi du dossier depuis l'espace personnel `formalites.entreprises.gouv.fr`.
- [ ] Réponse à une éventuelle demande de pièce complémentaire de l'INPI ou d'un organisme destinataire (URSSAF, INSEE...).
- [ ] Réception du SIREN et du SIRET (délai variable, généralement quelques jours à quelques semaines).
- [ ] Réception du code APE/NAF (attribué automatiquement par l'INSEE selon l'activité déclarée).
- [ ] RCS ou registre national unique selon le régime exact retenu (les micro-entrepreneurs exerçant une activité commerciale sont désormais inscrits via le registre national unique tenu par l'INPI, pas systématiquement un RCS classique au sens traditionnel).
- [ ] Confirmation du régime de TVA effectivement retenu (voir §10).
- [ ] Numéro de TVA intracommunautaire, si l'assujettissement a été choisi ou devient applicable.

## 15. Après réception du SIRET — checklist immédiate (côté produit)

Cette section documente ce qui pourra être fait une fois le SIRET connu — **aucune action à mener maintenant**.

1. Compléter `docs/juridique/mentions-legales.md` (application) et les 3 sections concernées de `elsatia-site/src/content/legal.ts` (site vitrine) avec SIREN/SIRET.
2. Compléter CGV, CGU, confidentialité si des mentions dépendent du SIRET (actuellement, seul `mentions-legales.md` porte le champ SIRET directement).
3. Renseigner RCS (si applicable) et code APE/NAF dans les mêmes documents.
4. Confirmer le régime de TVA définitif retenu et mettre à jour la mention actuelle (« non applicable, article 293 B ») si elle diffère du choix réel fait au dépôt.
5. Faire relire l'ensemble des 8 documents juridiques par un avocat (dossier de synthèse déjà préparé : voir `P14_FINALISATION_JURIDIQUE_EI.md` §« Relecture avocat »).
6. Mettre à jour les informations légales du compte Stripe (prérequis KYC Live).
7. Lancer le KYC Stripe Live (lot P15, pas avant).
8. Préparer les produits et prix Live sur Stripe (lot P15).
9. Configurer le webhook Live (lot P15).
10. Effectuer un test réel contrôlé (lot P15).
11. Décision go/no-go commercial (lot P15).

## 16. Ce que ce document ne fait pas

- Il ne dépose aucun dossier sur le Guichet unique / l'INPI.
- Il ne crée aucune entreprise.
- Il ne signe rien à la place de Julien.
- Il ne choisit aucune option fiscale ou sociale à sa place.
- Il ne lance aucune démarche Stripe Live/KYC.
- Il ne modifie aucun code, aucune configuration Vercel/Supabase/DNS.
- Il n'invente aucun SIREN, SIRET, code APE/NAF ou numéro de TVA.
