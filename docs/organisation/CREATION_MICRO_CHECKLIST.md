# Checklist de création de la micro-entreprise ELSATIA

**Document purement administratif. Aucun dossier n'a été déposé. Rien n'a été décidé à la place de Julien.** Cette checklist liste ce qu'il faudra rassembler/décider, pas comment le faire à sa place.

## Activité déclarée (validée comme base P14 — 21-08-2026, pas une formulation administrative définitive)

> Édition et exploitation de logiciels en mode SaaS et prestations de services numériques associées.

Validée par Julien comme base de travail pour les préparatifs et checklists. **Ne pas la présenter comme la formulation administrative définitive tant que l'immatriculation n'a pas été déposée et que le code APE/NAF n'a pas été attribué** — le Guichet unique peut la reformuler ou l'ajuster.

Points à trancher par Julien avant le dépôt, pas par ce document :
- Le code APE/NAF pertinent (probablement dans la famille édition de logiciels / programmation informatique — à confirmer sur le Guichet unique, qui l'attribue généralement automatiquement selon l'activité déclarée).
- **Ne pas mélanger avec une éventuelle activité BTP personnelle** sauf décision explicite contraire de Julien — les deux activités relèvent de régimes et de risques différents, et une micro-entreprise a un plafond de chiffre d'affaires unique partagé entre toutes ses activités déclarées.

## Éléments à rassembler avant le dépôt

- [ ] **Nom/prénom exploitant** — état civil exact tel qu'il apparaîtra sur le SIRET.
- [ ] **Nom commercial** — confirmer si « ELSATIA » est utilisé comme nom commercial de la micro-entreprise (distinct du nom légal de l'exploitant, voir `docs/juridique/mentions-legales.md`).
- [ ] **Adresse du siège** — peut être l'adresse personnelle de Julien (domiciliation par défaut d'une micro-entreprise) ou une autre adresse de domiciliation.
- [ ] **Justificatif de domicile** — généralement demandé pour l'immatriculation.
- [ ] **Pièce d'identité** — généralement demandée pour l'immatriculation.
- [ ] **Choix fiscaux à vérifier avec un professionnel ou l'URSSAF avant de cocher quoi que ce soit sur le formulaire** :
  - régime micro-fiscal classique vs versement libératoire de l'impôt sur le revenu ;
  - franchise en base de TVA (probable au démarrage, seuils à vérifier) vs option pour la TVA dès le départ ;
  - ACRE (exonération de charges sociales la première année) si éligible.
- [ ] **Compte bancaire** — un compte dédié à l'activité est recommandé dès le départ, même s'il n'est obligatoire qu'au-delà d'un certain seuil de chiffre d'affaires en micro-entreprise (seuil à vérifier au moment venu, il évolue).
- [ ] **Assurances éventuelles** — la RC Pro n'est pas obligatoire pour l'édition de logiciels au sens strict (contrairement au BTP), mais reste recommandée ; à évaluer avec un assureur une fois l'activité précisément déclarée.

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
