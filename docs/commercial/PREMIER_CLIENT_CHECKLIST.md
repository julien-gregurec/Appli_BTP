# Checklist premier client réel — ELSATIA

Parcours complet du prospect au premier usage réel, jusqu'au passage payant. Document opérationnel — à cocher pour chaque client réel, pas un plan théorique.

## Parcours cible (vue d'ensemble)

| Étape | Contenu | Référence |
|---|---|---|
| A. Prospect | Formulaire site, recommandation, email, téléphone, réseau | `KIT_PROSPECTION_ELSATIA.md` |
| B. Qualification | Questions sur taille, métier, outils actuels, douleur principale, décideur | `KIT_PROSPECTION_ELSATIA.md` §2 |
| C. Démo | 10–15 minutes maximum | `SCRIPT_DEMO_ELSATIA.md` |
| D. Offre | Mini / Pro / Business / Entreprise | `SCRIPT_DEMO_ELSATIA.md` §mapping offres |
| E. Essai | 30 jours, carte enregistrée, aucun débit pendant l'essai | Section « Inscription » ci-dessous |
| F. Onboarding | Configuration entreprise | Section « Onboarding » ci-dessous |
| G. Activation | Premier usage réel | Section « Premier succès » ci-dessous |
| H. Suivi | J+2 / J+7 / J+30 | Section « Suivi » ci-dessous |

## Avant démo

- [ ] Qualification effectuée (script `KIT_PROSPECTION_ELSATIA.md` §2).
- [ ] ICP identifié (voir `KIT_PROSPECTION_ELSATIA.md` §1) → offre probable anticipée.
- [ ] Créneau démo confirmé (10–15 min).
- [ ] Compte démo vérifié disponible et propre (voir `docs/organisation/DEMO_COMMERCIALE.md`).

## Après démo

- [ ] Email récap envoyé (modèle `KIT_PROSPECTION_ELSATIA.md` §3 « Après démo »).
- [ ] Offre probable confirmée avec le prospect.
- [ ] Prochaine étape claire fixée (essai, ou nouveau rendez-vous si décision différée).
- [ ] Statut pipeline mis à jour (« Démo faite »).

## Inscription

- [ ] Offre choisie confirmée.
- [ ] Essai de 30 jours démarré (`/abonnement` — carte enregistrée, aucun débit pendant l'essai).
- [ ] Statut pipeline mis à jour (« Essai »).

## Onboarding — checklist détaillée

### Informations entreprise
- [ ] Raison sociale
- [ ] Nom commercial
- [ ] Adresse
- [ ] SIRET
- [ ] Régime de TVA
- [ ] Logo
- [ ] Email professionnel
- [ ] Téléphone
- [ ] Coordonnées bancaires, si utilisées dans les documents commerciaux du client
- [ ] Mentions particulières (assurance décennale, etc., selon l'activité du client)

### Utilisateurs
- [ ] Compte administrateur créé
- [ ] Salariés invités
- [ ] Rôles/postes attribués
- [ ] Emails vérifiés
- [ ] Droits par poste vérifiés (chaque salarié voit ce qu'il doit voir, pas plus)

### Organisation
- [ ] Premiers clients créés
- [ ] Premiers chantiers créés
- [ ] Fournisseurs principaux ajoutés, si utilisés
- [ ] Stock initial, si utilisé
- [ ] Véhicules, si utilisés
- [ ] Matériel/outillage, si utilisé

### Documents
- [ ] Numérotation des devis configurée
- [ ] Numérotation des factures configurée
- [ ] Régime de TVA appliqué aux documents
- [ ] Conditions de règlement renseignées
- [ ] Pied de page des documents configuré
- [ ] Logo intégré aux PDF

### Planning / pointage
- [ ] Horaires de référence configurés
- [ ] Salariés affectés au planning
- [ ] Droits terrain vérifiés (qui peut pointer, qui peut valider)
- [ ] Pointage personnel activé ou non, selon le choix du client

## Niveaux d'onboarding

Trois niveaux selon le temps disponible du client — ne jamais promettre un import automatisé qui n'existe pas.

### Express
Entreprise + administrateur + 1 client + 1 chantier + 1 devis. Objectif : que le client voie l'outil fonctionner sur un cas réel en quelques minutes.

### Standard
Entreprise + équipe + clients principaux + chantiers en cours + fournisseurs + paramètres de base. Objectif : un démarrage complet sans reprise exhaustive de l'historique.

### Accompagné
Reprise plus large des données existantes, paramétrage complet, session d'accompagnement dédiée. Un assistant d'import CSV/Excel existe réellement (`/parametres/import`), avec reconnaissance des exports courants (Batigest, Batappli, EBP Bâtiment) et une entreprise pilote isolée pour vérifier l'import avant de l'appliquer — s'appuyer dessus plutôt que sur une ressaisie manuelle complète quand le client vient d'un de ces logiciels. Pour tout autre logiciel source, ne pas promettre une reconnaissance automatique non vérifiée : tester d'abord sur l'entreprise pilote.

## Premier succès client

Le premier succès est atteint quand :
- [ ] Compte créé.
- [ ] Entreprise configurée.
- [ ] Premier client créé.
- [ ] Premier chantier créé.
- [ ] Premier devis généré.
- [ ] Premier planning réalisé.
- [ ] Premier pointage ou première note de frais enregistré, selon l'usage réel du client.

Objectif : que le client atteigne ce premier succès le plus rapidement possible après l'inscription — idéalement dès le premier jour avec un onboarding express.

## Suivi

### J+2 — premier contact de suivi
Message court et humain, pas un email automatique impersonnel.

- [ ] Connexion réussie ?
- [ ] Équipe ajoutée ?
- [ ] Premier chantier créé ?
- [ ] Premier devis fait ?
- [ ] Question bloquante ?
- [ ] Bug rencontré ?
- [ ] Besoin de formation complémentaire ?

### J+7 — vérification d'usage
- [ ] Usage réel constaté (connexions, actions effectuées).
- [ ] Fonctionnalités effectivement utilisées.
- [ ] Points de friction identifiés.
- [ ] Utilisateurs actifs (combien sur l'équipe totale).
- [ ] Questions en attente.
- [ ] Offre choisie toujours adaptée à l'usage réel constaté ?

### J+30 — bilan avant fin d'essai
- [ ] Bilan d'usage global.
- [ ] Fonctionnalités effectivement utilisées vs celles présentées en démo.
- [ ] Bénéfice qualitatif perçu par le client (gain de temps, meilleure visibilité...).
- [ ] Objections restantes à lever.
- [ ] Offre finale confirmée.
- [ ] Passage payant proposé.

**Aucune pression commerciale agressive à ce stade** — poser la question du passage payant simplement, avec les éléments concrets constatés pendant l'essai.

## Passage payant

- [ ] Offre finale confirmée avec le client.
- [ ] Passage payant effectif (fin de l'essai, premier prélèvement).
- [ ] Statut pipeline mis à jour (« Client »).

## Support pendant l'onboarding

Voir `SUPPORT_PREMIERS_CLIENTS.md` pour la procédure complète (catégories de priorité, informations à demander, modèle de ticket).

## Première facture ELSATIA (préparation — rien n'est actif tant que Stripe Live n'est pas activé)

Parcours prévu une fois Stripe Live activé (lot P15, pas avant retour INPI et rendez-vous bancaire) :
1. Abonnement choisi par le client.
2. Paiement traité par Stripe.
3. Facture/reçu généré par Stripe, transmis au client.
4. Statut de l'abonnement mis à jour côté application.
5. Onboarding démarré (voir sections ci-dessus).

**Rien de ce parcours n'est activé en Live à ce stade.**
