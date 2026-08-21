# Checklist de création de la micro-entreprise ELSATIA

**Document purement administratif. Aucun dossier n'a été déposé. Rien n'a été décidé à la place de Julien.** Cette checklist liste ce qu'il faudra rassembler/décider, pas comment le faire à sa place.

Mise à jour P14C (21-08-2026) : voir le dossier détaillé
[`P14C_DOSSIER_IMMATRICULATION_MICRO.md`](P14C_DOSSIER_IMMATRICULATION_MICRO.md)
pour la checklist pas-à-pas du Guichet unique, l'arbre de décision TVA et
les checklists après-dépôt/après-SIRET. Ce document-ci reste la synthèse
rapide.

Mise à jour décisions (21-08-2026) : date de début d'activité et régime de
TVA au démarrage tranchés par Julien (voir §2 du dossier P14C). Seul le
versement libératoire de l'impôt sur le revenu reste ouvert, en attente
d'une décision de Julien avec un professionnel (dépend de données
personnelles — revenu fiscal de référence — non demandées ni stockées ici).

## Activité déclarée (validée comme base P14 — 21-08-2026, pas une formulation administrative définitive)

> Édition et exploitation de logiciels en mode SaaS et prestations de services numériques associées.

Validée par Julien comme base de travail pour les préparatifs et checklists. **Ne pas la présenter comme la formulation administrative définitive tant que l'immatriculation n'a pas été déposée et que le code APE/NAF n'a pas été attribué** — le Guichet unique peut la reformuler ou l'ajuster.

Points à trancher par Julien avant le dépôt, pas par ce document :
- Le code APE/NAF pertinent (probablement dans la famille édition de logiciels / programmation informatique — à confirmer sur le Guichet unique, qui l'attribue généralement automatiquement selon l'activité déclarée).
- **Ne pas mélanger avec une éventuelle activité BTP personnelle** sauf décision explicite contraire de Julien — les deux activités relèvent de régimes et de risques différents, et une micro-entreprise a un plafond de chiffre d'affaires unique partagé entre toutes ses activités déclarées.

## Éléments à rassembler avant le dépôt

- [x] **Nom/prénom exploitant** — Julien GREGUREC (décidé P14, à revérifier contre l'avis SIRENE une fois reçu).
- [x] **Nom commercial** — ELSATIA (décidé P14), distinct du nom légal de l'exploitant et du nom du produit « ELSATIA Gestion Pro ».
- [x] **Adresse du siège** — 9 rue du Maréchal Leclerc, 67860 Rhinau, France (décidée P14).
- [ ] **Justificatif de domicile** — généralement demandé pour l'immatriculation.
- [ ] **Pièce d'identité** — généralement demandée pour l'immatriculation.
- [x] **Date de début d'activité** — 1er octobre 2026 (décidée 21-08-2026, voir dossier P14C §2). Dépôt possible à partir de début septembre 2026 (jusqu'à 1 mois avant, au plus tard 15 jours après).
- [x] **Franchise en base de TVA au démarrage** — retenue (décidée 21-08-2026, seuils 2026 : 37 500 € HT / tolérance 41 250 € — voir arbre de décision dans `P14C_DOSSIER_IMMATRICULATION_MICRO.md`).
- [ ] **Versement libératoire de l'impôt sur le revenu** — en attente. Éligibilité conditionnée par le revenu fiscal de référence 2024 par part fiscale du foyer ; à trancher directement par Julien, avec un professionnel si besoin (donnée personnelle non demandée ni stockée dans ce dépôt).
- [ ] **ACRE** (exonération de charges sociales la première année) — à vérifier si éligible.
- [x] **Compte bancaire** — dédié à ouvrir avant Stripe Live (décidé 21-08-2026).
- [x] **Assurance RC Pro** — recommandée, non bloquante pour le dépôt (décidé 21-08-2026) ; souscription à faire au rythme de Julien.

## Après réception du SIRET — actions techniques (côté produit, pas administratif)

Cette section documente ce que je pourrai faire une fois le SIRET connu — ce n'est pas une action à mener maintenant.

1. Compléter les 8 documents juridiques (`docs/juridique/*.md`) avec les informations réelles : nom, adresse, SIRET, régime de TVA, email professionnel.
2. Compléter les informations légales du compte Stripe (prérequis du KYC Live, voir `STRIPE_LIVE_CHECKLIST.md`).
3. Dater chaque document juridique et les faire relire par un avocat (déjà budgété dans `docs/juridique/README.md`).
4. Publier les documents mis à jour.
5. Démarrer la checklist `STRIPE_LIVE_CHECKLIST.md`.

## Ce que ce document ne fait pas

- Il ne dépose aucun dossier sur le Guichet unique / l'INPI.
- Il n'ouvre aucun compte bancaire.
- Il ne contacte aucun assureur.
- Il ne décide pas des choix fiscaux à la place de Julien — il les liste pour que la décision soit prise en connaissance de cause, si possible avec un expert-comptable ou l'URSSAF.
