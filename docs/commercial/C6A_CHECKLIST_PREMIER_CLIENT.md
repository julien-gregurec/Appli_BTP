# C6-A — Checklist opérationnelle premier client ELSATIA

Cette checklist est destinée au premier onboarding réel. Elle doit être utilisée comme une barrière **GO / NO GO**, pas comme une simple aide-mémoire.

Statuts :

- `[ ]` non vérifié ;
- `[x]` vérifié avec preuve ;
- `N/A` non applicable et justifié.

Chaque preuve doit comporter une date, l’environnement, le responsable et un lien ou une référence de test ne contenant aucun secret.

## 1. Barrière avant invitation du client

### Produit

- [ ] Le correctif des privilèges `lignes_devis` est appliqué dans l’environnement cible.
- [ ] Un dirigeant neuf peut créer un devis avec au moins une ligne.
- [ ] Le devis peut être transformé ou repris pour produire une première facture.
- [ ] Le scénario client → devis → facture → chantier est couvert par un test automatique.
- [ ] Le premier administrateur peut pointer ou reçoit une étape explicite pour activer son profil de pointage.
- [ ] Les tests TypeScript, lint, applicatifs et base de données sont réussis sur le commit candidat.

### Essai

- [ ] La date exacte de début de l’essai est définie.
- [ ] La date de fin est fixée automatiquement à 30 jours.
- [ ] Un utilisateur ne peut pas contourner l’échéance en évitant Stripe.
- [ ] Le comportement au jour 30 est testé.
- [ ] Le comportement après activation d’un abonnement est testé.
- [ ] Le discours commercial, l’interface et les CGV décrivent la même règle.

### Environnement

- [ ] Le commit candidat est identifié et approuvé.
- [ ] Toutes les migrations attendues sont présentes dans l’environnement cible.
- [ ] La migration `20260812000200` a été revue puis appliquée si requise.
- [ ] Aucun secret n’est présent dans Git, les captures ou les rapports.
- [ ] La sauvegarde, la restauration et la procédure de retour arrière ont été contrôlées.

**Décision :** si une case de cette section reste non vérifiée, **NO GO CLIENT**.

## 2. Barrière avant paiement

### Offres

- [ ] Mini : 69 € HT/mois ou 690 € HT/an, 3 comptes.
- [ ] Pro : 199 € HT/mois ou 1 990 € HT/an, 15 comptes.
- [ ] Business : 399 € HT/mois ou 3 990 € HT/an, 30 comptes.
- [ ] Entreprise : 599 € HT/mois ou 5 990 € HT/an, 40 salariés + 10 administrateurs inclus.
- [ ] Sur mesure : sur devis, sans prix public ni Checkout automatique.
- [ ] La mention **30 jours d’essai** est identique sur tous les supports.
- [ ] Le paiement annuel est présenté uniquement comme 2 mois offerts.
- [ ] Les fonctions affichées pour chaque offre correspondent à Production.
- [ ] L’IA n’est pas vendue comme disponible tant qu’elle reste désactivée en Production.

### Stripe en mode test

- [ ] Les quatre produits standard sont reliés aux bons prix mensuels.
- [ ] Les quatre produits standard sont reliés aux bons prix annuels.
- [ ] L’offre Sur mesure ne déclenche pas un Checkout autonome non validé.
- [ ] Le Checkout demande la carte et n’effectue aucun débit pendant l’essai.
- [ ] Le webhook reçoit et authentifie les événements attendus.
- [ ] L’entreprise reçoit le bon identifiant client et la bonne souscription.
- [ ] Le passage essai → actif est testé.
- [ ] Un échec de paiement est testé sans perdre les données.
- [ ] La reprise après paiement est testée.
- [ ] Le portail affiche carte, factures et résiliation.
- [ ] La résiliation prend effet selon la règle contractuelle affichée.
- [ ] Une montée d’offre est testée.
- [ ] Une baisse d’offre et sa date d’effet sont testées.
- [ ] Les prix de comptes supplémentaires existent ou la création au-delà du quota est bloquée.
- [ ] Les limites d’administrateurs sont contrôlées.
- [ ] Les e-mails Stripe attendus sont reçus et relus.

### Juridique

- [ ] Les CGV définitives ont été validées par le responsable compétent.
- [ ] Les anciennes offres Essentiel / Premium ne figurent plus dans les documents actifs.
- [ ] Les mentions légales et la politique de confidentialité sont définitives.
- [ ] Les règles d’essai, paiement, renouvellement et résiliation sont cohérentes.
- [ ] Le traitement des données, la conservation et la sortie client sont documentés.

**Décision :** aucune carte réelle et aucun paiement réel avant validation complète de cette section.

## 3. Préparation commerciale du client

- [ ] Nom légal de l’entreprise confirmé.
- [ ] Contact décideur confirmé.
- [ ] Administrateur principal confirmé.
- [ ] Offre et périodicité confirmées.
- [ ] Nombre de comptes et d’administrateurs attendu.
- [ ] Objectifs de l’essai formulés en trois résultats observables maximum.
- [ ] Modules prioritaires définis.
- [ ] Données à reprendre listées.
- [ ] Formats de fichiers reçus et analysés.
- [ ] Données hors périmètre d’import identifiées.
- [ ] Responsable ELSATIA de l’onboarding désigné.
- [ ] Canal et horaires de support communiqués.
- [ ] Rendez-vous de lancement planifié.
- [ ] Point de suivi intermédiaire planifié.
- [ ] Bilan de fin d’essai planifié avant le jour 30.

## 4. Création du compte et de l’entreprise

- [ ] E-mail professionnel du dirigeant confirmé.
- [ ] Inscription réalisée par le client ou avec son accord explicite.
- [ ] Confirmation d’e-mail reçue.
- [ ] Connexion réussie.
- [ ] Entreprise créée dans le bon environnement.
- [ ] Aucun doublon d’entreprise n’a été créé.
- [ ] Rôle dirigeant / gérant attribué.
- [ ] Adhésion active vérifiée.
- [ ] Entreprise active vérifiée.
- [ ] Statut d’essai et date de fin vérifiés.
- [ ] Offre sélectionnée vérifiée.
- [ ] Tableau de bord accessible.
- [ ] Isolation contrôlée avec un test non destructif : aucune autre entreprise visible.

## 5. Paramètres légaux et documentaires

- [ ] Nom commercial.
- [ ] Raison sociale.
- [ ] Forme juridique.
- [ ] SIRET.
- [ ] Adresse complète.
- [ ] Code postal et ville.
- [ ] Numéro de TVA ou régime applicable.
- [ ] Téléphone professionnel.
- [ ] E-mail professionnel affiché sur les documents.
- [ ] Coordonnées bancaires si nécessaires.
- [ ] Assurances et mentions propres au métier.
- [ ] Conditions de règlement.
- [ ] Taux de pénalités et indemnité applicable.
- [ ] Règles d’acompte.
- [ ] Séquences de numérotation devis / factures.
- [ ] Logo validé.
- [ ] En-tête et pied de page validés.
- [ ] Modèle de devis relu.
- [ ] Modèle de facture relu.
- [ ] Document test exporté en PDF et relu avant envoi externe.

## 6. Équipe et permissions

- [ ] Liste des collaborateurs validée.
- [ ] Une adresse individuelle est utilisée par personne.
- [ ] Les postes nécessaires sont créés.
- [ ] Les permissions de chaque poste sont revues selon le moindre privilège.
- [ ] Les administrateurs restent dans la limite de l’offre.
- [ ] Le nombre total de comptes reste dans la limite ou le supplément est validé.
- [ ] Chaque fiche salarié contient le bon e-mail.
- [ ] Les numéros individuels d’inscription sont transmis de manière sûre.
- [ ] Les invitations manuelles sont suivies jusqu’à activation.
- [ ] Un salarié test peut se connecter.
- [ ] Le salarié ne voit que les modules autorisés.
- [ ] Le salarié ne voit aucune donnée d’une autre entreprise.
- [ ] La suspension d’un compte test est comprise par l’administrateur.
- [ ] La procédure de départ d’un salarié est expliquée.
- [ ] L’historique est conservé après suspension / fermeture.

## 7. Import et reprise des données

### Cadrage

- [ ] Source de chaque fichier notée.
- [ ] Copie de sauvegarde conservée par le client.
- [ ] Colonnes personnelles inutiles supprimées.
- [ ] Encodage, séparateurs et dates contrôlés.
- [ ] Doublons identifiés.
- [ ] Références entre clients, chantiers et salariés contrôlées.
- [ ] Import test réalisé sur un petit échantillon.
- [ ] Résultat relu par le client avant import complet.

### Types natifs

- [ ] Clients importés ou créés manuellement.
- [ ] Chantiers importés ou créés manuellement.
- [ ] Salariés importés ou créés manuellement.
- [ ] Catalogue / prestations importés si nécessaire.
- [ ] Stocks importés si nécessaire.
- [ ] Tarifs fournisseurs importés si nécessaire.
- [ ] Écritures comptables importées si nécessaire.

### Hors import natif identifié

- [ ] Traitement des devis historiques décidé.
- [ ] Traitement des factures historiques décidé.
- [ ] Traitement du planning historique décidé.
- [ ] Traitement des pointages historiques décidé.
- [ ] Traitement des notes de frais historiques décidé.
- [ ] Traitement des documents et pièces jointes décidé.
- [ ] Toute reprise manuelle est décrite, chiffrée et acceptée avant exécution.

## 8. Recette des premières opérations

Utiliser uniquement des données de test clairement identifiées avant les premières données réelles.

- [ ] Premier client créé et relu.
- [ ] Première prestation ou ligne de catalogue créée.
- [ ] Premier devis avec lignes créé.
- [ ] Calcul HT, TVA et TTC contrôlé.
- [ ] PDF du devis contrôlé.
- [ ] Statut du devis modifié selon le parcours prévu.
- [ ] Premier chantier créé et relié au bon client.
- [ ] Budget du chantier saisi et contrôlé.
- [ ] Premier salarié affecté au chantier.
- [ ] Première entrée de planning créée.
- [ ] Planning contrôlé sur ordinateur.
- [ ] Planning contrôlé sur mobile.
- [ ] Premier pointage créé.
- [ ] Circuit de validation du pointage testé.
- [ ] Première note de frais créée avec justificatif fictif.
- [ ] Circuit de validation de la note de frais testé.
- [ ] Premier compte rendu créé si inclus dans l’offre.
- [ ] Première facture créée.
- [ ] Numérotation, mentions et montants de la facture contrôlés.
- [ ] Aucun document de test n’a été envoyé à un destinataire réel par erreur.

## 9. Support et communication

- [ ] Adresse de support dédiée configurée.
- [ ] Adresse de support visible dans l’application ou le kit client.
- [ ] Fil de support intégré testé.
- [ ] Message de bienvenue reçu.
- [ ] Message de démarrage d’essai reçu.
- [ ] Message de rappel avant fin d’essai planifié et testé.
- [ ] Message d’échec de paiement planifié et testé.
- [ ] Procédure d’incident sécurité disponible.
- [ ] Niveaux d’urgence et délais cibles communiqués.
- [ ] Guide dirigeant ELSATIA transmis.
- [ ] Guide salarié ELSATIA transmis.
- [ ] Les anciens noms Liria ont été retirés des guides clients actifs.

## 10. Contrôle mi-essai

- [ ] Administrateur principal actif.
- [ ] Collaborateurs attendus activés.
- [ ] Données principales importées.
- [ ] Au moins un parcours métier complet réalisé.
- [ ] Blocages recueillis et classés.
- [ ] Droits d’accès réajustés si nécessaire.
- [ ] Consommation des quotas contrôlée.
- [ ] Usage des modules prioritaires évalué sans inventer de gain chiffré.
- [ ] Prochain point confirmé.

## 11. Contrôle avant fin d’essai

- [ ] Date de fin confirmée avec le client.
- [ ] Offre finale et périodicité confirmées.
- [ ] Nombre de comptes confirmé.
- [ ] Prix exact confirmé par écrit.
- [ ] Moyen de paiement valide.
- [ ] Facturation et adresse de facturation confirmées.
- [ ] Résiliation et date d’effet expliquées.
- [ ] Export ou sortie des données expliqué.
- [ ] Décision client enregistrée : poursuite, changement d’offre ou arrêt.
- [ ] Aucune promesse commerciale non démontrée n’a été ajoutée.

## 12. Procès-verbal GO / NO GO

| Champ | Valeur |
|---|---|
| Client | ______________________________ |
| Entreprise | __________________________ |
| Environnement | _______________________ |
| Commit / version | ____________________ |
| Offre | _______________________________ |
| Début d’essai | _______________________ |
| Fin d’essai | _________________________ |

### Contrôles obligatoires

- [ ] Aucun blocant premier client ouvert.
- [ ] Aucun point important avant paiement ouvert.
- [ ] Parcours métier complet réussi.
- [ ] Paiement Stripe test complet réussi.
- [ ] Documents juridiques validés.
- [ ] Support opérationnel.
- [ ] Accord interne de lancement obtenu.

| Validation | Valeur |
|---|---|
| Décision | `GO` / `NO GO` |
| Motif | ________________________________________________________________ |
| Responsable ELSATIA | __________________ |
| Date | __________________ |
| Validation | __________________ |

## 13. Règles non négociables

- Ne jamais tester avec une entreprise réelle dans un environnement de démonstration.
- Ne jamais afficher ou consigner une clé, un token ou un identifiant sensible.
- Ne jamais déclencher un paiement réel pendant la recette.
- Ne jamais importer un fichier sans sauvegarde et validation du client.
- Ne jamais promettre une fonction désactivée en Production.
- Ne jamais annoncer une durée d’onboarding ou un gain chiffré sans mesure réelle.
- Ne jamais envoyer un devis ou une facture avant validation des mentions légales.
- Ne jamais ouvrir le premier compte client si les blocants B1 et B2 de l’audit C6-A restent ouverts.
