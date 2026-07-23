"""Fiches de spécification de chaque module, mises en page par trame.chapitre().

Règle : rien ici n'est inventé. Les statuts, les champs et les droits
proviennent du schéma réel de la base et du catalogue des permissions.
"""

CLIENTS = {
    "titre": "Les clients",
    "chapo": "Le fichier clients est la base de tout le reste : un devis, un chantier et une facture "
             "sont toujours rattachés à un client. Une fiche bien remplie évite de resaisir l'adresse "
             "de facturation et le SIRET à chaque document.",
    "droits": [
        ("acces_clients", "Ouvrir le module et consulter les fiches. Sans ce droit, l'entrée « Clients » n'apparaît pas dans le menu."),
        ("gerer_clients", "Créer, modifier et archiver un client, et gérer ses contacts."),
    ],
    "liste": ("desktop-clients.png",
              "La liste des clients. La recherche porte sur la référence, le nom et la ville ; les filtres restreignent par type et par statut."),
    "intro_liste": "La liste affiche un client par ligne. La recherche et les filtres se combinent : "
                   "vous pouvez par exemple n'afficher que les professionnels actifs d'une ville.",
    "colonnes": [
        ["Référence", "L'identifiant interne, attribué automatiquement à la création. Il sert de repère dans les exports comptables."],
        ["Nom", "Le nom du particulier ou la société. Cliquer dessus ouvre la fiche."],
        ["Type", "Particulier, professionnel, collectivité, syndic ou promoteur."],
        ["Ville", "Utile pour regrouper les clients par secteur."],
        ["Statut", "Prospect, actif ou inactif."],
    ],
    "formulaire": ("desktop-clients-nouveau.png", "Le formulaire de création d'un client."),
    "titre_creer": "Créer un client pas à pas",
    "etapes": [
        ("Choisir le type", "Particulier, professionnel, collectivité, syndic ou promoteur. Le type "
         "conditionne les champs utiles : un particulier n'a pas de SIRET."),
        ("Renseigner l'identité", "Nom et prénom pour un particulier ; société et raison sociale pour "
         "un professionnel. C'est ce qui apparaîtra sur les devis et les factures."),
        ("Saisir l'adresse de facturation", "Elle est reprise automatiquement en en-tête de chaque "
         "document. L'adresse du chantier peut être différente et se renseigne sur le chantier."),
        ("Ajouter les coordonnées", "Téléphone et email. L'email permet d'envoyer devis et factures "
         "directement depuis le logiciel."),
        ("Préciser les conditions de paiement", "Facultatif. Ce texte est repris sur les factures du client."),
        ("Enregistrer", "Le client est créé en « Prospect ». Il passe en « Actif » dès son premier chantier."),
    ],
    "champs": [
        ["Type", "Particulier, professionnel, collectivité, syndic, promoteur.", "Obligatoire. « Particulier » par défaut."],
        ["Nom", "Nom de famille ou nom d'usage.", "Au moins le nom ou la société est nécessaire."],
        ["Prénom", "Pour un particulier.", "Facultatif."],
        ["Société", "Le nom commercial.", "Facultatif pour un particulier."],
        ["Raison sociale", "La dénomination juridique exacte.", "Reprise sur les documents officiels."],
        ["SIRET", "Le numéro à 14 chiffres.", "Utile pour les professionnels et la comptabilité."],
        ["Adresse de facturation", "L'adresse d'envoi des factures.", "Reprise en en-tête des documents."],
        ["Code postal / Ville", "La localisation.", "Sert aux filtres et aux regroupements."],
        ["Téléphone / Email", "Les coordonnées de contact.", "L'email sert à l'envoi des documents."],
        ["Conditions de paiement", "Par exemple « 30 jours fin de mois ».", "Repris sur les factures."],
    ],
    "statuts": [
        ["<b>Prospect</b>", "Un contact, pas encore de chantier signé.", "Aucun effet. Statut par défaut à la création."],
        ["<b>Actif</b>", "Un client avec qui vous travaillez.", "Apparaît en priorité dans les listes de sélection."],
        ["<b>Inactif</b>", "Un client dormant ou perdu.", "Reste consultable et conserve tout son historique."],
    ],
    "fiche": ("desktop-clients-fiche.png", "La fiche client : coordonnées, chantiers, devis et factures rattachés."),
    "mobile": ("mobile-clients.png", "La liste des clients sur téléphone."),
    "mobile_texte": "La liste passe en cartes. Vous pouvez retrouver un client et appeler son numéro "
                    "directement depuis un chantier.",
    "liens": [
        ["Chantiers", "Chaque chantier appartient à un client. Sa fiche liste tous ses chantiers."],
        ["Devis", "Le devis reprend l'adresse de facturation. Un client peut être créé depuis l'éditeur de devis."],
        ["Factures", "La facture reprend la raison sociale, le SIRET et les conditions de paiement."],
        ["Exports", "La référence client est reprise dans l'export comptable."],
    ],
    "erreurs": [
        ["Impossible de supprimer un client", "Il a des chantiers ou des factures rattachés.", "Passez-le en « Inactif » : l'historique comptable doit être conservé."],
        ["Le client n'apparaît pas dans un devis", "La recherche ne porte que sur le nom et la société.", "Tapez les premières lettres du nom exact, ou créez-le depuis l'éditeur."],
        ["Mauvaise adresse sur la facture", "L'adresse de facturation diffère de celle du chantier.", "Corrigez l'adresse de facturation sur la fiche client."],
    ],
}

CHANTIERS = {
    "titre": "Les chantiers",
    "chapo": "Le chantier est le point de rencontre de tout le logiciel : le devis le remplit, le "
             "planning y envoie les équipes, le pointage y accumule les heures, les achats y "
             "imputent les dépenses, et la rentabilité compare le tout au montant vendu.",
    "droits": [
        ("acces_chantiers", "Consulter les chantiers et leurs documents."),
        ("gerer_chantiers", "Créer, modifier un chantier, gérer son équipe, ses tâches et ses pièces jointes."),
    ],
    "note_droits": ("Ce qu'un ouvrier voit d'un chantier",
                    "Un salarié affecté ne voit ni le budget, ni les montants, ni l'état global. Il "
                    "accède aux tâches à réaliser et aux plans qui lui sont destinés, via « Mes travaux »."),
    "liste": ("desktop-chantiers.png", "La liste des chantiers, filtrable par statut et par client."),
    "intro_liste": "Les chantiers sont triés du plus récent au plus ancien. Le filtre par statut permet "
                   "d'isoler d'un clic ceux qui sont en cours.",
    "colonnes": [
        ["Référence", "L'identifiant interne du chantier, attribué automatiquement."],
        ["Nom", "L'intitulé du chantier. Cliquer dessus ouvre sa fiche."],
        ["Client", "Le donneur d'ordre."],
        ["Ville", "Le lieu d'exécution."],
        ["Statut", "L'avancement. Voir le cycle de vie ci-dessous."],
        ["Dates", "Début et fin prévus, puis réels une fois le chantier lancé."],
    ],
    "formulaire": ("desktop-chantiers-nouveau.png", "Le formulaire de création d'un chantier."),
    "titre_creer": "Créer un chantier pas à pas",
    "etapes": [
        ("Choisir le client", "Obligatoire : un chantier appartient toujours à un client. Vous pouvez "
         "le créer à la volée s'il n'existe pas encore."),
        ("Nommer le chantier", "Un intitulé parlant sur le terrain, par exemple « Rénovation salle de "
         "bain — Dupont »."),
        ("Saisir l'adresse", "C'est l'adresse d'exécution, souvent différente de l'adresse de "
         "facturation du client. Elle sert au pointage GPS."),
        ("Fixer les dates prévues", "Début et fin envisagés. Les dates réelles se renseignent ensuite."),
        ("Indiquer le budget prévisionnel", "Facultatif mais recommandé : c'est la référence de la "
         "rentabilité si aucun devis n'est rattaché."),
        ("Désigner un responsable", "Le conducteur de travaux ou le chef de chantier qui pilote."),
    ],
    "champs": [
        ["Client", "Le donneur d'ordre.", "Obligatoire."],
        ["Nom", "L'intitulé du chantier.", "Obligatoire."],
        ["Adresse / Code postal / Ville", "Le lieu d'exécution.", "Sert au pointage GPS et aux trajets."],
        ["Type de chantier", "Neuf, rénovation, dépannage…", "Facultatif. Sert aux analyses."],
        ["Dates prévues", "Début et fin envisagés.", "Alimentent le planning."],
        ["Dates réelles", "Début et fin constatés.", "Se renseignent en cours de chantier."],
        ["Budget prévisionnel", "Le montant attendu.", "Référence de rentabilité en l'absence de devis."],
        ["Responsable", "Le pilote du chantier.", "Choisi parmi les fiches employés."],
    ],
    "statuts": [
        ["<b>Prospect</b>", "Une opportunité, rien n'est chiffré.", "Statut de départ."],
        ["<b>Devis envoyé</b>", "Un devis est parti, on attend la réponse.", "Positionné automatiquement à l'envoi du devis."],
        ["<b>Accepté</b>", "Le client a validé.", "Les tâches issues du devis sont créées, sans les prix."],
        ["<b>À préparer</b>", "Validé, reste à organiser.", "Le chantier peut être planifié."],
        ["<b>En commande matériel</b>", "En attente de fournitures.", "À relier aux commandes fournisseurs."],
        ["<b>En cours</b>", "Les équipes travaillent.", "Le chantier est proposé au pointage."],
        ["<b>En pause</b>", "Interrompu (météo, attente client…).", "Sort des chantiers proposés au pointage."],
        ["<b>Terminé</b>", "Travaux achevés.", "Prêt à être facturé."],
        ["<b>Facturé</b>", "La facture est émise.", "Positionné automatiquement à l'émission."],
        ["<b>Archivé</b>", "Dossier clos.", "Conservé pour l'historique et la rentabilité."],
        ["<b>Annulé</b>", "Abandonné.", "Conservé pour l'historique."],
    ],
    "fiche": ("desktop-chantiers-fiche.png",
              "La fiche chantier : équipe, tâches, heures, factures fournisseurs, plans et documents."),
    "mobile": ("mobile-chantiers.png", "La liste des chantiers sur téléphone."),
    "mobile_texte": "Sur le terrain, la fiche donne l'adresse, l'équipe du jour, les tâches à réaliser "
                    "et les plans autorisés. Les chiffres restent masqués aux ouvriers.",
    "liens": [
        ["Clients", "Le chantier appartient à un client."],
        ["Devis", "Un devis accepté crée les tâches du chantier et fait évoluer son statut."],
        ["Planning", "Les affectations envoient les équipes sur le chantier."],
        ["Pointage", "Les heures pointées sont imputées au chantier."],
        ["Achats", "Les factures fournisseurs se classent par chantier ou en frais généraux."],
        ["Stock", "Les sorties de matériel sont imputées au chantier."],
        ["Rentabilité", "Le chantier confronte le vendu aux heures et achats réels."],
    ],
    "erreurs": [
        ["Le chantier n'apparaît pas au pointage", "Seuls les chantiers actifs et assignés sont proposés.", "Passez-le en « En cours » et vérifiez l'affectation du salarié."],
        ["Les tâches ne sont pas créées", "Le devis n'est pas en « Accepté ».", "Les tâches ne sont générées qu'à l'acceptation du devis."],
        ["La rentabilité semble fausse", "Des heures ou des achats ne sont pas imputés au chantier.", "Vérifiez que les factures fournisseurs sont classées sur le chantier et non en frais généraux."],
    ],
}

FACTURES = {
    "titre": "Les factures",
    "chapo": "La facture matérialise ce que vous encaissez. Le logiciel gère les factures simples, les "
             "acomptes, les situations, la facture finale et les avoirs, avec le suivi des règlements "
             "et du reste à payer.",
    "droits": [
        ("acces_factures", "Consulter les factures et leur état de règlement."),
        ("gerer_factures", "Créer, envoyer une facture et enregistrer les paiements."),
    ],
    "liste": ("desktop-factures.png",
              "Les factures clients. L'onglet « Factures fournisseurs » regroupe séparément les achats."),
    "intro_liste": "L'écran sépare clairement les <b>factures clients</b> (ce que vous encaissez) des "
                   "<b>factures fournisseurs</b> (ce que vous payez). L'onglet fournisseurs n'est visible "
                   "qu'avec le droit d'accès aux achats.",
    "colonnes": [
        ["Numéro", "L'identifiant légal de la facture. Il est séquentiel et ne peut jamais être réutilisé ni modifié."],
        ["Client", "Le débiteur."],
        ["Type", "Simple, acompte, situation, finale ou avoir."],
        ["Date d'émission", "Le point de départ du délai de paiement."],
        ["Échéance", "La date limite de règlement."],
        ["Montant TTC", "Le total dû."],
        ["Reste à payer", "Le solde après les règlements enregistrés."],
        ["Statut", "L'état du règlement. Voir le cycle de vie."],
    ],
    "titre_creer": "Créer une facture",
    "etapes": [
        ("Partir d'un devis accepté", "Le plus simple : la conversion reprend le client, le chantier "
         "et toutes les lignes. C'est la voie recommandée."),
        ("Ou créer une facture directe", "Pour une intervention sans devis, saisissez les lignes "
         "comme dans un devis."),
        ("Choisir le type", "Acompte au démarrage, situations en cours de chantier, facture finale "
         "au solde. L'avoir sert à annuler ou corriger."),
        ("Vérifier l'échéance", "Elle découle des conditions de paiement du client."),
        ("Émettre la facture", "Le numéro définitif est attribué. La facture n'est alors plus modifiable."),
        ("Enregistrer les règlements", "Chaque paiement met à jour le reste à payer et le statut."),
    ],
    "statuts": [
        ["<b>Brouillon</b>", "En préparation, pas encore de numéro définitif.", "Modifiable librement."],
        ["<b>Envoyée</b>", "Transmise au client, en attente de règlement.", "Le chantier passe en « Facturé »."],
        ["<b>Payée partiel</b>", "Un acompte a été encaissé.", "Le reste à payer est recalculé."],
        ["<b>Payée</b>", "Soldée.", "Alimente la trésorerie encaissée."],
        ["<b>En retard</b>", "L'échéance est dépassée sans règlement complet.", "Apparaît dans les relances."],
        ["<b>Annulée</b>", "Sans effet.", "Conservée : une facture n'est jamais supprimée."],
        ["<b>Avoir émis</b>", "Corrigée par un avoir.", "L'avoir vient en déduction du chiffre d'affaires."],
    ],
    "note": ("Une facture émise ne se supprime pas",
             "La numérotation des factures est séquentielle et sans trou, comme l'exige la loi. Pour "
             "corriger une facture déjà émise, on émet un <b>avoir</b> : la facture d'origine reste "
             "en base, l'avoir vient en déduction. C'est volontaire, et c'est ce que votre comptable attend."),
    "fiche": ("desktop-factures-fiche.png", "La fiche facture : lignes, totaux, règlements et reste à payer."),
    "impression": ("desktop-impression-facture.png",
                   "La facture imprimée : en-tête, destinataire, lignes, TVA, total TTC et mentions légales."),
    "impression_texte": "Le document reprend votre logo, vos coordonnées, votre SIRET et vos mentions "
                        "légales obligatoires, y compris les pénalités de retard. La présentation se "
                        "règle dans Paramètres.",
    "mobile": ("mobile-factures.png", "La liste des factures sur téléphone."),
    "mobile_texte": "Vous pouvez consulter l'état des règlements et relancer un client depuis le terrain.",
    "liens": [
        ["Devis", "Un devis accepté se convertit en facture en gardant ses lignes."],
        ["Chantiers", "L'émission fait passer le chantier en « Facturé »."],
        ["Clients", "La facture reprend la raison sociale, le SIRET et les conditions de paiement."],
        ["Trésorerie", "Les règlements alimentent les encaissements."],
        ["Exports", "L'export comptable reprend factures, avoirs et règlements."],
    ],
    "erreurs": [
        ["Impossible de modifier une facture", "Elle est émise : son numéro est légalement figé.", "Émettez un avoir, puis une nouvelle facture."],
        ["Le reste à payer est faux", "Un règlement n'a pas été enregistré.", "Ouvrez la fiche et vérifiez la liste des paiements."],
        ["La facture reste « En retard » après paiement", "Le règlement n'est pas saisi.", "Enregistrez le paiement : le statut se met à jour seul."],
    ],
}

PLANNING = {
    "titre": "Le planning des équipes",
    "chapo": "Le planning répond à une seule question : qui est où, quel jour. Il se lit en tableau — "
             "les salariés en lignes, les jours en colonnes — et alimente directement le pointage.",
    "droits": [
        ("acces_planning", "Consulter le planning. Ce droit fait partie du socle : tout salarié voit son planning."),
        ("gerer_planning", "Créer et modifier les affectations de toute l'équipe."),
    ],
    "liste": ("desktop-planning.png", "Le planning : une ligne par salarié, une colonne par jour."),
    "intro_liste": "Chaque case indique le chantier affecté et les heures prévues. Les cases vides "
                   "signalent une disponibilité, les congés validés apparaissent automatiquement.",
    "colonnes": [
        ["Salarié", "Une ligne par fiche employé active."],
        ["Jour", "Une colonne par jour de la semaine affichée."],
        ["Case", "Le chantier affecté et les heures prévues. Vide = disponible."],
        ["Congés", "Les demandes validées créent automatiquement leur affectation."],
    ],
    "titre_creer": "Affecter un salarié",
    "etapes": [
        ("Choisir la semaine", "La navigation se fait semaine par semaine."),
        ("Cliquer sur une case", "À l'intersection du salarié et du jour voulus."),
        ("Choisir le chantier", "Seuls les chantiers actifs sont proposés."),
        ("Indiquer les heures prévues", "Elles servent de référence face aux heures réellement pointées."),
        ("Enregistrer", "Le salarié voit son affectation immédiatement, et le chantier lui est proposé au pointage."),
    ],
    "note": ("Le planning prépare le pointage",
             "Un salarié affecté à un chantier le retrouve en tête de liste au moment de pointer. "
             "Les heures prévues sont ensuite comparées aux heures validées : l'écart est signalé."),
    "mobile": ("mobile-planning.png", "Le planning sur téléphone, en cartes par jour."),
    "mobile_texte": "Sur téléphone, le tableau devient une suite de cartes par jour : chaque salarié "
                    "voit où il travaille sans avoir à faire défiler un tableau.",
    "liens": [
        ["Chantiers", "L'affectation envoie l'équipe sur un chantier actif."],
        ["Pointage", "Le chantier affecté est proposé en priorité au salarié."],
        ["Congés", "Un congé validé crée son affectation et bloque la disponibilité."],
        ["Employés", "Seules les fiches actives apparaissent en ligne."],
        ["Rentabilité", "Les heures prévues servent de référence face aux heures réelles."],
    ],
    "erreurs": [
        ["Un salarié n'apparaît pas", "Sa fiche est en « Sorti » ou « Suspendu ».", "Seules les fiches actives sont planifiables."],
        ["Le chantier n'est pas proposé", "Il n'est pas en « En cours » ou « À préparer ».", "Faites évoluer son statut."],
        ["Une case est bloquée", "Un congé validé occupe la journée.", "Le congé doit être annulé avant de réaffecter."],
    ],
}

POINTAGE = {
    "titre": "Le pointage des heures",
    "chapo": "Le pointage transforme le temps passé en données exploitables : coût de main-d'œuvre par "
             "chantier, rentabilité réelle, heures supplémentaires. Chaque salarié pointe pour "
             "lui-même — jamais pour un collègue.",
    "droits": [
        ("acces_pointage", "Consulter le module. Fait partie du socle : tout salarié y accède."),
        ("saisir_son_pointage", "Pointer ses propres heures. Socle également."),
        ("gerer_pointage", "Consulter, corriger et valider les pointages de l'équipe."),
        ("valider_preuve_pointage", "Valider les preuves de présence (GPS, date et heure serveur)."),
    ],
    "note_droits": ("Personne ne peut pointer au nom d'un autre",
                    "Même avec le droit « gerer_pointage », un responsable ne peut pas créer un "
                    "pointage à la place d'un salarié : il peut seulement consulter, corriger et "
                    "valider. L'arrivée doit provenir du compte du salarié lui-même. Cette règle est "
                    "vérifiée côté serveur et ne peut pas être contournée."),
    "liste": ("desktop-pointage.png", "L'écran de pointage : saisie du jour et historique."),
    "intro_liste": "Le chantier du jour est proposé en premier, puis les chantiers assignés, puis les "
                   "autres chantiers actifs. La liste ne révèle aucune donnée client ni financière.",
    "colonnes": [
        ["Date", "Le jour travaillé."],
        ["Chantier", "Le chantier sur lequel les heures sont imputées."],
        ["Heures normales", "Le temps de travail standard."],
        ["Heures supplémentaires", "Les heures au-delà de l'horaire contractuel."],
        ["Pause", "En minutes, déduite du temps de présence."],
        ["Tâche", "Ce qui a été fait. Facultatif mais utile au suivi."],
        ["Statut", "En attente de validation, validé ou refusé."],
    ],
    "titre_creer": "Pointer une journée",
    "etapes": [
        ("Ouvrir le pointage", "Depuis le téléphone, sur le chantier."),
        ("Vérifier le chantier proposé", "Celui du planning du jour est présélectionné."),
        ("Saisir les heures", "Heures normales, heures supplémentaires et pause."),
        ("Décrire la tâche", "Facultatif, mais précieux pour comprendre un écart plus tard."),
        ("Valider", "La position GPS et l'heure serveur sont enregistrées comme preuve."),
        ("Attendre la validation", "Le responsable contrôle puis valide. Les heures validées "
         "alimentent la rentabilité."),
    ],
    "note": ("La preuve de présence est obligatoire",
             "La position GPS ainsi que la date et l'heure du serveur — jamais celles du téléphone, "
             "qui se règlent — sont enregistrées à chaque pointage. Un pointage oublié reste "
             "soumis à vérification par le responsable."),
    "mobile": ("mobile-pointage.png", "Le pointage sur téléphone : l'usage principal du module."),
    "mobile_texte": "C'est l'écran le plus utilisé sur le terrain. Il est conçu pour se remplir en "
                    "quelques secondes, avec des gants, en fin de journée.",
    "liens": [
        ["Planning", "L'affectation du jour présélectionne le chantier."],
        ["Chantiers", "Les heures sont imputées au chantier."],
        ["Employés", "Le coût horaire de la fiche valorise les heures."],
        ["Rentabilité", "Les heures validées deviennent du coût de main-d'œuvre."],
        ["Congés", "Une journée de congé validée ne se pointe pas."],
    ],
    "erreurs": [
        ["Le chantier n'est pas dans la liste", "Il n'est pas actif, ou le salarié n'y est pas affecté.", "Vérifiez le statut du chantier et le planning."],
        ["Le pointage est refusé", "L'écart avec l'horaire contractuel dépasse le seuil d'alerte.", "Le responsable demande une correction : justifiez l'écart dans le commentaire."],
        ["Impossible de pointer pour un collègue", "C'est interdit par conception.", "Chaque salarié pointe depuis son propre compte."],
        ["Les heures n'apparaissent pas en rentabilité", "Elles ne sont pas encore validées.", "Seules les heures validées sont valorisées."],
    ],
}

EMPLOYES = {
    "titre": "Les employés",
    "chapo": "La fiche employé regroupe l'identité, le contrat, le coût horaire, les habilitations et "
             "la carte BTP. Elle existe indépendamment du compte de connexion : vous pouvez préparer "
             "une fiche avant même que le salarié n'ait un accès.",
    "droits": [
        ("acces_employes", "Consulter l'annuaire des salariés."),
        ("gerer_employes", "Créer et modifier les fiches, inviter les salariés, gérer les habilitations."),
    ],
    "liste": ("desktop-employes.png", "L'annuaire des salariés : contrat, ancienneté, coût, état du compte et autorisations."),
    "intro_liste": "Chaque ligne résume une fiche : le poste détermine les droits, la colonne "
                   "« Application » indique où en est son accès personnel.",
    "colonnes": [
        ["Référence", "Le numéro interne de la fiche."],
        ["Nom", "Le salarié. Cliquer ouvre sa fiche complète."],
        ["Fonction", "Le poste occupé : c'est lui qui porte les droits."],
        ["Contrat", "CDI, CDD, intérim, apprenti, stage, freelance ou autre."],
        ["Ancienneté", "Calculée depuis la date d'entrée."],
        ["Coût", "Le coût horaire chargé, utilisé par la rentabilité."],
        ["Statut", "Actif, en congé, suspendu ou sorti."],
        ["Application", "Où en est son compte : à inviter, invité, actif, en pause ou fermé."],
        ["Autorisations", "Le résumé des droits accordés par son poste."],
    ],
    "titre_creer": "Créer une fiche employé",
    "etapes": [
        ("Saisir l'identité", "Prénom et nom suffisent pour créer la fiche."),
        ("Choisir le poste", "C'est l'étape décisive : le poste détermine tout ce que le salarié "
         "pourra voir et faire."),
        ("Renseigner le contrat", "Type et date d'entrée. L'ancienneté se calcule seule."),
        ("Indiquer le coût horaire", "Le coût chargé, pas le salaire brut : c'est lui qui valorise "
         "les heures en rentabilité."),
        ("Ajouter les habilitations", "SST, CACES, travail en hauteur, habilitation électrique, "
         "amiante. Leurs échéances sont suivies."),
        ("Inviter le salarié", "Un numéro d'inscription personnel est généré : il lui permet "
         "d'activer son compte lui-même."),
    ],
    "champs": [
        ["Prénom / Nom", "L'identité du salarié.", "Obligatoires."],
        ["Poste", "Le rôle qui porte les droits.", "Détermine ce que le salarié voit."],
        ["Type de contrat", "CDI, CDD, intérim, apprenti, stage, freelance, autre.", "CDI par défaut."],
        ["Date d'entrée", "Le début du contrat.", "Sert au calcul de l'ancienneté."],
        ["Taux horaire", "Le taux de facturation.", "Facultatif."],
        ["Coût horaire", "Le coût chargé pour l'entreprise.", "Indispensable à une rentabilité juste."],
        ["Email / Téléphone", "Les coordonnées.", "L'email sert à l'invitation."],
        ["Numéro d'inscription", "Le code personnel d'activation.", "Généré automatiquement."],
    ],
    "statuts": [
        ["<b>Actif</b>", "En poste.", "Planifiable, peut pointer."],
        ["<b>En congé</b>", "Absent temporairement.", "Non planifiable sur la période."],
        ["<b>Suspendu</b>", "Accès coupé, contrat maintenu.", "Ne peut plus se connecter."],
        ["<b>Sorti</b>", "A quitté l'entreprise.", "Fiche conservée pour l'historique et la rentabilité passée."],
    ],
    "fiche": ("desktop-employes-fiche.png", "La fiche employé : contrat, habilitations, carte BTP, matériel et accès."),
    "mobile": ("mobile-employes.png", "L'annuaire sur téléphone."),
    "mobile_texte": "Utile pour retrouver le numéro d'un collègue depuis un chantier.",
    "liens": [
        ["Paramètres · Accès", "Le poste de la fiche porte les droits."],
        ["Planning", "Seules les fiches actives sont planifiables."],
        ["Pointage", "Le coût horaire valorise les heures."],
        ["Outillage / Flotte", "Le matériel s'affecte à une fiche employé."],
        ["Rentabilité", "Le coût horaire alimente le coût de main-d'œuvre."],
    ],
    "erreurs": [
        ["Le salarié ne peut pas activer son compte", "Le numéro d'inscription est erroné, ou l'email ne correspond pas.", "Vérifiez le numéro sur sa fiche et l'adresse enregistrée."],
        ["La rentabilité est fausse", "Le coût horaire n'est pas renseigné.", "Sans coût horaire, les heures ne sont pas valorisées."],
        ["Impossible de supprimer une fiche", "Elle porte des pointages et de l'historique.", "Passez-la en « Sorti » : les données passées doivent être conservées."],
    ],
}

CONGES = {
    "titre": "Les congés et absences",
    "chapo": "Chaque salarié fait ses demandes depuis son compte. Une fois validée, l'absence apparaît "
             "au planning et bloque la disponibilité — plus besoin de la reporter à la main.",
    "droits": [
        ("demander_ses_conges", "Faire ses propres demandes. Fait partie du socle : tout salarié en dispose."),
        ("gerer_conges", "Valider, refuser ou corriger les demandes de l'équipe."),
    ],
    "liste": ("desktop-conges.png", "Les demandes de congés et leur état."),
    "intro_liste": "Un salarié ne voit que ses propres demandes. Un responsable voit celles de l'équipe.",
    "colonnes": [
        ["Salarié", "Le demandeur."],
        ["Type", "Congés payés, RTT, sans solde, maladie, événement familial, récupération ou autre."],
        ["Du / Au", "La période demandée, à la demi-journée près."],
        ["Statut", "Brouillon, envoyée, validée ou refusée."],
    ],
    "titre_creer": "Demander un congé",
    "etapes": [
        ("Choisir le type", "Congés payés, RTT, maladie, événement familial…"),
        ("Indiquer la période", "Avec la précision de la demi-journée : matin, après-midi ou journée entière."),
        ("Justifier si besoin", "Un commentaire aide le responsable à décider."),
        ("Envoyer", "La demande part immédiatement au responsable."),
        ("Attendre la réponse", "Une fois validée, l'absence apparaît au planning."),
    ],
    "note": ("Un congé validé bloque le planning",
             "La validation crée automatiquement l'affectation correspondante en semaine : le salarié "
             "n'est plus proposé comme disponible, et la journée ne peut pas être pointée."),
    "mobile": ("mobile-conges.png", "Les congés sur téléphone."),
    "mobile_texte": "La demande se fait en quelques secondes depuis le téléphone.",
    "liens": [
        ["Planning", "Une absence validée crée son affectation et bloque la disponibilité."],
        ["Pointage", "Une journée de congé ne se pointe pas."],
        ["Employés", "Le statut de la fiche passe en « En congé » sur la période."],
    ],
    "erreurs": [
        ["La demande n'apparaît pas au responsable", "Elle est restée en brouillon.", "Envoyez-la explicitement."],
        ["Le planning ne montre pas l'absence", "La demande n'est pas validée.", "Seules les demandes validées créent l'affectation."],
    ],
}

NOTES_FRAIS = {
    "titre": "Les notes de frais et justificatifs",
    "chapo": "Un salarié photographie son ticket, la note part au comptable. Le justificatif est "
             "archivé dans un coffre privé, avec empreinte, horodatage serveur et journal d'audit — "
             "l'original n'est jamais recompressé.",
    "droits": [
        ("saisir_ses_notes_frais", "Déclarer ses propres frais. Socle : tout salarié en dispose."),
        ("gerer_notes_frais", "Contrôler, valider ou refuser les notes de l'équipe."),
        ("acces_notes_frais", "Consulter le module et ses exports."),
    ],
    "liste": ("desktop-notes-frais.png", "Les notes de frais et leur état de traitement."),
    "colonnes": [
        ["Salarié", "L'auteur de la dépense."],
        ["Date", "La date de la dépense, pas celle de la saisie."],
        ["Catégorie", "Carburant, repas, péage, fournitures…"],
        ["Montant", "HT, TVA et TTC, calculés automatiquement."],
        ["Justificatif", "La photo ou le PDF d'origine, conservé intact."],
        ["Statut", "Soumise, validée, remboursée ou refusée."],
    ],
    "titre_creer": "Déclarer une note de frais",
    "etapes": [
        ("Photographier le justificatif", "Depuis le téléphone, au moment de l'achat."),
        ("Saisir le montant", "Le HT, la TVA et le TTC se déduisent l'un de l'autre."),
        ("Choisir la catégorie", "Elle oriente l'imputation comptable."),
        ("Rattacher un chantier", "Facultatif. Sans chantier, la dépense part en frais généraux."),
        ("Envoyer", "La note part au responsable puis au comptable."),
    ],
    "statuts": [
        ["<b>Soumise</b>", "En attente de contrôle.", "Visible par le responsable."],
        ["<b>Validée</b>", "Acceptée, en attente de remboursement.", "Passe au comptable."],
        ["<b>Remboursée</b>", "Payée au salarié.", "Clôturée."],
        ["<b>Refusée</b>", "Rejetée, avec motif.", "Le salarié peut corriger et resoumettre."],
    ],
    "note": ("Pourquoi l'original n'est jamais retouché",
             "Le fichier déposé est conservé tel quel, avec son empreinte SHA-256, un horodatage "
             "serveur et un journal d'audit chaîné. Toute modification serait détectable. Ne "
             "remplacez jamais une facture électronique par une capture d'écran : l'original a "
             "seul valeur probante."),
    "mobile": ("mobile-notes-frais.png", "La déclaration depuis le téléphone."),
    "mobile_texte": "L'usage normal : photographier le ticket immédiatement, avant de le perdre.",
    "liens": [
        ["Chantiers", "Une note rattachée impute la dépense au chantier."],
        ["Rentabilité", "Les frais imputés pèsent sur la marge du chantier."],
        ["Exports", "Les notes et leurs justificatifs s'exportent pour le comptable."],
    ],
    "erreurs": [
        ["Le justificatif est refusé", "Le format n'est pas reconnu, ou le fichier est corrompu.", "Déposez le PDF ou la photo d'origine, sans la retoucher."],
        ["Impossible de modifier une note validée", "Elle est passée au comptable.", "Demandez au responsable de la refuser pour pouvoir la corriger."],
    ],
}

STOCK = {
    "titre": "Le stock",
    "chapo": "Le stock suit ce que vous avez en dépôt, ce qui part sur les chantiers et ce qu'il faut "
             "racheter. Il accepte les imports de catalogues fournisseurs, gère les nuanciers de "
             "teintes et fonctionne au scan.",
    "droits": [
        ("acces_stock", "Consulter le catalogue et les mouvements."),
        ("gerer_stock", "Créer des articles, importer un catalogue, ajuster les quantités."),
        ("effectuer_entree_stock", "Enregistrer une entrée (réception fournisseur, retour de chantier)."),
        ("effectuer_sortie_stock", "Enregistrer une sortie vers un chantier."),
        ("utiliser_borne_stock", "Utiliser la borne de dépôt. Fait partie du socle."),
    ],
    "liste": ("desktop-stock.png", "Le stock : articles actifs, alertes de réapprovisionnement et valeur d'achat."),
    "intro_liste": "Trois compteurs résument la situation : le nombre d'articles, les alertes de "
                   "réapprovisionnement et la valeur d'achat immobilisée. Les lignes en alerte sont surlignées.",
    "colonnes": [
        ["Référence", "Le code de l'article, avec son code-barres s'il existe."],
        ["Article", "La désignation et l'emplacement en dépôt."],
        ["Marque", "Le fabricant."],
        ["Nuancier", "Les teintes disponibles, en pastilles de couleur."],
        ["Stock", "La quantité disponible, dans son unité."],
        ["Seuil", "En dessous, l'article passe en alerte."],
        ["Prix d'achat", "Sert au calcul de la valeur du stock."],
    ],
    "titre_creer": "Alimenter le stock",
    "etapes": [
        ("Importer un catalogue", "Déposez le fichier XLSX, CSV ou PDF du fournisseur. L'import est "
         "atomique : si une ligne est invalide, aucune n'est enregistrée."),
        ("Ou créer un article à la main", "Référence, désignation, unité, seuil et prix d'achat."),
        ("Enregistrer les entrées", "À la réception d'une commande."),
        ("Sortir vers un chantier", "Le chantier est obligatoire à la sortie : c'est ce qui permet "
         "d'imputer le coût au bon endroit."),
        ("Surveiller les alertes", "Les articles sous leur seuil remontent en tête."),
    ],
    "note": ("L'import est tout ou rien",
             "Un import partiel créerait un stock faux, plus dangereux qu'un import raté. Si une "
             "ligne du fichier est invalide, l'import entier est annulé et rien n'est modifié."),
    "mobile": ("mobile-stock.png", "Le stock sur téléphone."),
    "mobile_texte": "Consultation des quantités depuis le chantier, avant de repasser au dépôt.",
    "liens": [
        ["Chantiers", "Une sortie impute le matériel au chantier."],
        ["Borne dépôt", "Les mouvements du dépôt passent par la borne, au nom du salarié."],
        ["Commandes", "Une réception alimente le stock."],
        ["Rentabilité", "Le matériel sorti pèse sur la marge du chantier."],
    ],
    "erreurs": [
        ["L'import échoue", "Une ligne est invalide : prix non numérique, référence vide…", "Le message indique la ligne fautive. Corrigez le fichier et relancez."],
        ["Impossible de sortir du stock", "Le chantier n'est pas renseigné.", "Le chantier est obligatoire à la sortie."],
        ["Le stock ne baisse pas", "L'import était de type « catalogue », qui ne touche pas aux quantités.", "Utilisez le type « inventaire » pour ajuster les quantités."],
    ],
}

BORNE = {
    "titre": "La borne dépôt",
    "chapo": "La borne est un poste partagé, installé au dépôt. Chaque salarié s'y identifie "
             "personnellement pour prendre ou rendre du matériel : le mouvement est enregistré à son "
             "nom, jamais à celui de la borne.",
    "droits": [
        ("utiliser_borne_stock", "Utiliser la borne. Socle : tout salarié en dispose."),
        ("mode_compte_depot", "Verrouille un compte sur le stock et la borne. Réservé au poste partagé « Compte dépôt »."),
    ],
    "note_droits": ("N'accordez jamais « mode_compte_depot » à un poste de direction",
                    "Ce droit n'est pas une permission ordinaire : il verrouille l'interface sur le "
                    "stock et la borne, et masque tous les autres modules. Il est destiné au seul "
                    "compte partagé du dépôt."),
    "liste": ("desktop-stock-borne.png", "La borne : identification personnelle, article, mouvement et chantier."),
    "intro_liste": "L'écran se lit de haut en bas : qui, quel article, quel mouvement, quel chantier.",
    "titre_creer": "Enregistrer un mouvement",
    "etapes": [
        ("S'identifier", "Identifiant du salarié — ou scan de son QR personnel — puis son mot de passe "
         "stock. Le QR seul ne suffit jamais."),
        ("Scanner l'article", "QR, code-barres, douchette ou saisie de la référence."),
        ("Choisir le mouvement", "Sortie vers chantier, entrée ou retour."),
        ("Indiquer le chantier", "Obligatoire pour une sortie. Scannable par QR."),
        ("Valider", "Le mouvement est enregistré au nom du salarié identifié."),
    ],
    "note": ("Pourquoi un mot de passe en plus du QR",
             "Un QR code peut être photographié ou recopié. Le mot de passe stock personnel garantit "
             "que le mouvement est bien attribué à la bonne personne. Il est haché en base : personne, "
             "pas même l'administrateur, ne peut le lire. Les tentatives échouées sont journalisées "
             "et l'accès est limité après plusieurs erreurs."),
    "mobile": ("mobile-stock-borne.png", "La borne sur tablette ou téléphone."),
    "mobile_texte": "La borne est conçue pour une tablette fixée au mur du dépôt, mais fonctionne "
                    "aussi au téléphone. Le scanner exige une connexion HTTPS ; la saisie manuelle et "
                    "la douchette restent toujours possibles.",
    "liens": [
        ["Stock", "Chaque mouvement met à jour les quantités."],
        ["Chantiers", "La sortie impute le matériel au chantier."],
        ["Employés", "Le mouvement est attribué au salarié identifié."],
    ],
    "erreurs": [
        ["Le scanner ne s'ouvre pas", "La caméra exige une connexion sécurisée HTTPS.", "Utilisez l'adresse en https, ou saisissez la référence à la main."],
        ["Identification refusée", "Mot de passe stock erroné, ou droits insuffisants.", "Le salarié le retrouve dans « Mon espace ». Après plusieurs erreurs, l'accès est temporairement bloqué."],
        ["Impossible d'utiliser un autre compte", "Le compte dépôt reste connecté en priorité.", "Déconnectez explicitement le compte dépôt."],
    ],
}

OUTILLAGE = {
    "titre": "L'outillage",
    "chapo": "Chaque outil est suivi individuellement : qui l'a, dans quel état, quand il a été "
             "vérifié. Un outil hors service devient indisponible, ce qui évite qu'il reparte sur un "
             "chantier.",
    "droits": [
        ("acces_outillage", "Consulter le parc d'outils."),
        ("gerer_outillage", "Créer, affecter, mettre en réparation ou réformer un outil."),
    ],
    "liste": ("desktop-outillage.png", "Le parc d'outillage : état, affectation et vérifications."),
    "colonnes": [
        ["Référence", "Le code interne, avec son QR."],
        ["Désignation", "L'outil."],
        ["Catégorie", "Électroportatif, manuel, mesure, sécurité, levage ou autre."],
        ["Marque / Modèle", "L'identification du matériel."],
        ["Statut", "Disponible, affecté, en maintenance, hors service ou perdu."],
        ["État", "Neuf, bon, usagé, abîmé ou hors service."],
        ["Affecté à", "Le salarié ou le chantier détenteur."],
        ["Prochaine vérification", "Pour le matériel à contrôle périodique."],
    ],
    "statuts": [
        ["<b>Disponible</b>", "Au dépôt, prêt à partir.", "Peut être affecté."],
        ["<b>Affecté</b>", "Détenu par un salarié ou sur un chantier.", "Indisponible pour un autre."],
        ["<b>En maintenance</b>", "En réparation.", "Sort du parc disponible, une alerte est levée."],
        ["<b>Hors service</b>", "Inutilisable.", "Ne peut plus être affecté."],
        ["<b>Perdu</b>", "Introuvable.", "Sort du parc, conservé pour l'historique."],
    ],
    "fiche": ("desktop-outillage-fiche.png", "La fiche outil : historique des affectations, état et QR."),
    "mobile": ("mobile-outillage.png", "L'outillage sur téléphone."),
    "mobile_texte": "Retrouver qui détient un outil, ou scanner son QR pour l'identifier.",
    "liens": [
        ["Employés", "Un outil s'affecte à une fiche employé."],
        ["Chantiers", "Un outil peut être affecté à un chantier plutôt qu'à une personne."],
        ["Dépenses", "Une facture de réparation se rattache à l'outil."],
    ],
    "erreurs": [
        ["Impossible d'affecter un outil", "Il est hors service ou en maintenance.", "Remettez-le en service, ou réformez-le définitivement."],
        ["Un outil réformé réapparaît", "La mise au rebut n'a pas été confirmée.", "La réforme définitive est une action auditée, distincte de la mise hors service."],
    ],
}

FLOTTE = {
    "titre": "La flotte de véhicules",
    "chapo": "La flotte suit les véhicules, leur kilométrage, leurs échéances de contrôle technique et "
             "d'assurance, et qui les conduit. Les échéances sont surveillées pour éviter la mauvaise "
             "surprise au bord de la route.",
    "droits": [
        ("acces_flotte", "Consulter les véhicules."),
        ("gerer_flotte", "Créer, affecter un véhicule et suivre son entretien."),
    ],
    "liste": ("desktop-flotte.png", "La flotte : véhicules, affectations et échéances."),
    "colonnes": [
        ["Immatriculation", "L'identification du véhicule."],
        ["Marque / Modèle", "Le matériel."],
        ["Type", "Utilitaire, voiture, poids lourd ou autre."],
        ["Kilométrage", "Le compteur, mis à jour à chaque entretien."],
        ["Contrôle technique", "L'échéance. Une alerte est levée à l'approche."],
        ["Assurance", "L'échéance du contrat."],
        ["Conducteur", "Le salarié affecté."],
        ["Statut", "Actif, en maintenance, hors service ou vendu."],
    ],
    "statuts": [
        ["<b>Actif</b>", "En service.", "Affectable."],
        ["<b>En maintenance</b>", "Au garage.", "Non affectable."],
        ["<b>Hors service</b>", "Immobilisé.", "Sort de la flotte utilisable."],
        ["<b>Vendu</b>", "Cédé.", "Conservé pour l'historique et la comptabilité."],
    ],
    "mobile": ("mobile-flotte.png", "La flotte sur téléphone."),
    "mobile_texte": "Retrouver le véhicule affecté à un salarié, ou consulter ses échéances.",
    "liens": [
        ["Employés", "Le véhicule s'affecte à un conducteur."],
        ["Dépenses", "Les factures d'entretien et de carburant se rattachent au véhicule, avec le détail des travaux."],
        ["Rentabilité", "Les coûts de véhicule pèsent sur les frais généraux."],
    ],
    "erreurs": [
        ["Une échéance n'alerte pas", "La date n'est pas renseignée.", "Complétez les échéances de contrôle technique et d'assurance."],
        ["Deux salariés sur un même véhicule", "Une affectation précédente n'a pas été clôturée.", "Terminez l'affectation en cours avant d'en créer une nouvelle."],
    ],
}

COMMANDES = {
    "titre": "Les commandes fournisseurs",
    "chapo": "La commande formalise ce que vous demandez à un fournisseur, et sert de référence à la "
             "réception : on sait ce qui a été commandé, ce qui est arrivé et ce qui manque.",
    "droits": [
        ("acces_achats", "Consulter commandes, fournisseurs et dépenses."),
        ("gerer_achats", "Créer des commandes, saisir les factures fournisseurs et les classer par chantier."),
    ],
    "liste": ("desktop-commandes.png", "Les commandes fournisseurs et leur état de réception."),
    "colonnes": [
        ["Numéro", "L'identifiant de la commande."],
        ["Fournisseur", "Le destinataire."],
        ["Chantier", "L'imputation, si la commande concerne un chantier précis."],
        ["Date", "L'émission, et la livraison souhaitée."],
        ["Montant", "HT et TTC."],
        ["Statut", "Où en est la commande."],
    ],
    "statuts": [
        ["<b>Brouillon</b>", "En préparation.", "Modifiable."],
        ["<b>Envoyée</b>", "Transmise au fournisseur.", "En attente de confirmation."],
        ["<b>Confirmée</b>", "Le fournisseur a accepté.", "Livraison attendue."],
        ["<b>Reçue partiel</b>", "Une partie est arrivée.", "Le reliquat reste attendu."],
        ["<b>Reçue</b>", "Tout est arrivé.", "Alimente le stock, prête à être rapprochée de la facture."],
        ["<b>Annulée</b>", "Abandonnée.", "Conservée pour l'historique."],
    ],
    "impression_texte": "Le bon de commande reprend vos coordonnées, celles du fournisseur, les lignes "
                        "et la date de livraison souhaitée. Il s'envoie par email depuis la fiche.",
    "liens": [
        ["Fournisseurs", "La commande est adressée à un fournisseur du carnet."],
        ["Stock", "La réception alimente les quantités."],
        ["Chantiers", "Une commande peut être imputée à un chantier."],
        ["Dépenses", "La facture du fournisseur se rapproche de la commande."],
    ],
    "erreurs": [
        ["Le fournisseur n'est pas proposé", "Il n'existe pas encore dans le carnet.", "Créez-le depuis le module Fournisseurs."],
        ["La réception n'alimente pas le stock", "Les articles de la commande ne sont pas liés au catalogue.", "Rattachez les lignes à des articles du stock."],
    ],
}

RENTABILITE = {
    "titre": "La rentabilité des chantiers",
    "chapo": "C'est l'écran qui répond à la question qui compte : est-ce que je gagne de l'argent sur "
             "ce chantier ? Il confronte ce que vous avez facturé aux heures réellement pointées et "
             "aux achats réellement imputés.",
    "droits": [("acces_rentabilite", "Consulter la rentabilité. Réservé aux postes de direction : ce sont vos marges.")],
    "liste": ("desktop-rentabilite.png", "La rentabilité chantier par chantier : facturé, heures, coûts et marge."),
    "intro_liste": "Une ligne par chantier. Le taux de marge est calculé sur le facturé HT.",
    "colonnes": [
        ["Chantier", "Le chantier analysé."],
        ["Client", "Le donneur d'ordre."],
        ["Facturé HT", "Ce que vous avez émis en factures."],
        ["Heures", "Les heures pointées et validées."],
        ["Coût MO", "Les heures valorisées au coût horaire des fiches employés."],
        ["Achats", "Les factures fournisseurs et frais imputés au chantier."],
        ["Marge", "Facturé moins coût de main-d'œuvre moins achats."],
        ["Taux", "La marge rapportée au facturé."],
    ],
    "note": ("Une rentabilité juste dépend de trois saisies",
             "Le coût horaire sur la fiche employé, la validation des pointages, et le classement des "
             "factures fournisseurs sur le bon chantier. Si l'une manque, le calcul est faux — pas le "
             "logiciel."),
    "liens": [
        ["Factures", "Le facturé HT vient des factures émises."],
        ["Pointage", "Seules les heures validées sont valorisées."],
        ["Employés", "Le coût horaire de la fiche valorise les heures."],
        ["Dépenses", "Les factures classées sur le chantier pèsent sur la marge."],
        ["Notes de frais", "Les frais rattachés au chantier s'y ajoutent."],
    ],
    "erreurs": [
        ["Le coût de main-d'œuvre est à zéro", "Les fiches employés n'ont pas de coût horaire.", "Renseignez le coût horaire chargé sur chaque fiche."],
        ["Les achats n'apparaissent pas", "Les factures fournisseurs sont restées en frais généraux.", "Classez-les sur le chantier depuis la facture ou la fiche chantier."],
        ["La marge semble trop belle", "Des heures ne sont pas validées.", "Les heures en attente ne sont pas comptées."],
    ],
}

TRESORERIE = {
    "titre": "La trésorerie",
    "chapo": "La trésorerie montre ce qui rentre et ce qui sort : les factures encaissées, celles qui "
             "traînent, et les charges à payer. C'est la vision court terme, complémentaire de la "
             "rentabilité.",
    "droits": [("acces_tresorerie", "Consulter la trésorerie. Réservé à la direction.")],
    "liste": ("desktop-tresorerie.png", "La trésorerie : encaissements, impayés et charges."),
    "liens": [
        ["Factures", "Les règlements alimentent les encaissements ; les impayés remontent ici."],
        ["Dépenses", "Les factures fournisseurs constituent les décaissements."],
        ["Charges", "Les charges récurrentes sont anticipées."],
    ],
    "erreurs": [
        ["Un encaissement manque", "Le règlement n'est pas enregistré sur la facture.", "Saisissez le paiement depuis la fiche facture."],
    ],
}

PARAMETRES = {
    "titre": "Les paramètres de l'entreprise",
    "chapo": "C'est ici que se règle tout ce qui apparaît sur vos documents : identité, logo, mentions "
             "légales, assurances et présentation des devis et factures.",
    "droits": [
        ("acces_parametres", "Ouvrir les paramètres."),
        ("gerer_parametres", "Modifier l'identité, le logo et la personnalisation des documents."),
    ],
    "liste": ("desktop-parametres.png", "Les paramètres : identité, logo, mentions légales et personnalisation."),
    "intro_liste": "Les informations saisies ici sont reprises automatiquement en en-tête et en pied de "
                   "tous vos documents. Une erreur ici se propage sur toutes vos factures.",
    "titre_creer": "Ce qu'il faut renseigner en premier",
    "etapes": [
        ("L'identité", "Raison sociale, SIRET, adresse, TVA intracommunautaire. C'est le minimum légal."),
        ("Le logo", "PNG, JPG ou WebP, 5 Mo maximum. Il apparaît immédiatement dans le logiciel et sur les documents."),
        ("Les assurances", "Décennale et responsabilité civile : obligatoires sur vos devis en bâtiment."),
        ("Les mentions légales", "Pénalités de retard, indemnité de recouvrement, conditions."),
        ("La présentation", "Six modèles disponibles, deux couleurs, police, taille, position et largeur du logo."),
    ],
    "liens": [
        ["Devis / Factures", "L'en-tête, le pied de page et les mentions viennent d'ici."],
        ["Accès et rôles", "La gestion des postes et des droits se fait dans un écran dédié."],
        ["Import", "La reprise de données depuis un autre logiciel est accessible depuis cet écran."],
    ],
    "erreurs": [
        ["Le logo n'apparaît pas", "Format non accepté ou fichier trop lourd.", "PNG, JPG ou WebP, 5 Mo maximum."],
        ["Les mentions manquent sur les devis", "Les mentions légales ne sont pas renseignées.", "Complétez-les : elles sont obligatoires en bâtiment."],
    ],
}

ACCES = {
    "titre": "Les accès et les rôles",
    "chapo": "C'est l'écran le plus important du logiciel pour un dirigeant. Un poste est une "
             "collection de droits ; chaque salarié occupe un poste. Changer un droit sur un poste le "
             "change pour tous les salariés qui l'occupent.",
    "droits": [
        ("gerer_utilisateurs", "Créer des postes, régler leurs droits et gérer les accès des salariés."),
        ("acces_parametres", "Accéder à l'écran depuis les paramètres."),
    ],
    "liste": ("desktop-parametres-acces.png", "Les postes et leurs droits, module par module."),
    "intro_liste": "Chaque colonne est un poste, chaque ligne un droit. L'aperçu permet de voir "
                   "exactement ce qu'un salarié verra avec ce poste, avant de le lui attribuer.",
    "titre_creer": "Configurer un poste",
    "etapes": [
        ("Créer le poste", "Par exemple « Chef d'équipe ». Un jeu de postes de départ existe déjà."),
        ("Ouvrir les modules", "Les droits « acces_… » décident de ce qui apparaît dans le menu. Un "
         "module non autorisé est purement absent."),
        ("Accorder les actions", "Les droits « gerer_… » autorisent la modification. On peut consulter "
         "sans pouvoir modifier."),
        ("Vérifier avec l'aperçu", "L'aperçu reproduit l'interface telle que le salarié la verra."),
        ("Affecter le poste", "Sur la fiche employé. Le changement est immédiat."),
    ],
    "note": ("Le socle de droits personnels est toujours accordé",
             "Tout poste, présent ou futur, dispose obligatoirement de : consulter son planning, "
             "saisir son pointage, déclarer ses notes de frais, demander ses congés et utiliser la "
             "borne stock. Ces droits personnels ne peuvent pas être retirés — un salarié doit "
             "toujours pouvoir pointer ses heures."),
    "liens": [
        ["Employés", "Le poste de la fiche détermine les droits du salarié."],
        ["Tous les modules", "Chaque module vérifie ses droits côté serveur, pas seulement dans le menu."],
    ],
    "erreurs": [
        ["Un salarié ne voit pas un module", "Son poste n'a pas le droit « acces_… » correspondant.", "Ouvrez le module pour son poste."],
        ["Un salarié voit trop de choses", "Son poste est trop permissif.", "Utilisez l'aperçu pour contrôler avant d'attribuer."],
        ["Le patron ne voit que le stock", "Son poste a reçu « mode_compte_depot ».", "Retirez ce droit : il est réservé au compte dépôt partagé."],
    ],
}

IMPORT = {
    "titre": "Reprendre ses données d'un autre logiciel",
    "chapo": "Vous venez de Batappli, EBP, Codial ou d'un tableur ? L'import reprend vos clients, vos "
             "chantiers, vos salariés, votre catalogue et vos tarifs fournisseurs sans ressaisie.",
    "droits": [("gerer_utilisateurs", "L'import est réservé à l'administrateur : il crée des données en masse.")],
    "liste": ("desktop-parametres-import.png", "L'assistant d'import : type de données, fichier et correspondance des colonnes."),
    "titre_creer": "Importer en trois étapes",
    "etapes": [
        ("Exporter depuis l'ancien logiciel", "Utilisez « Exporter » ou « Enregistrer sous » au format "
         "Excel (.xlsx) ou CSV. La première ligne doit contenir les intitulés de colonnes."),
        ("Déposer le fichier", "Choisissez le type de données, puis le fichier. Le séparateur CSV "
         "(point-virgule ou virgule) est détecté automatiquement."),
        ("Vérifier la correspondance", "Le logiciel devine les colonnes. Ajustez chaque champ dans son "
         "menu déroulant : un aperçu des premières lignes confirme le résultat."),
        ("Importer", "Le compte rendu indique les lignes importées, ignorées et en erreur."),
    ],
    "champs": [
        ["Clients", "Nom, prénom, société, SIRET, adresse, contact.", "Le nom ou la société est obligatoire."],
        ["Chantiers", "Nom, client, adresse, statut, budget.", "Le client est rattaché par son nom, et créé s'il n'existe pas."],
        ["Employés", "Prénom, nom, poste, contrat, taux horaire.", "Prénom et nom obligatoires."],
        ["Catalogue", "Désignation, description, unité, prix, TVA.", "La désignation est obligatoire."],
        ["Tarifs fournisseurs", "Fournisseur, référence, EAN, prix négocié, validité.", "Les références existantes sont mises à jour sans doublon."],
    ],
    "note": ("Nombres et dates au format français",
             "Les montants à virgule (12,50) et les dates au format JJ/MM/AAAA comme AAAA-MM-JJ sont "
             "reconnus. Le fichier est limité à 5000 lignes et 8 Mo."),
    "liens": [
        ["Clients / Chantiers / Employés", "L'import alimente directement ces modules."],
        ["Stock", "Les catalogues fournisseurs s'importent depuis le module Stock."],
    ],
    "erreurs": [
        ["Aucune ligne détectée", "La première ligne ne contient pas les intitulés de colonnes.", "Ajoutez une ligne d'en-tête au fichier."],
        ["Des lignes sont ignorées", "Un champ obligatoire est vide.", "Le compte rendu précise combien. Complétez le fichier et relancez."],
        ["Les accents sont abîmés", "Le CSV n'est pas encodé en UTF-8.", "Réexportez en UTF-8, ou utilisez le format Excel."],
    ],
}

AIDE = {
    "titre": "L'aide et le support",
    "chapo": "Un bouton « Aide » est présent en permanence, en bas à droite de chaque écran. Il ouvre "
             "une discussion directe avec l'équipe Liria Gestion Pro.",
    "liste": ("desktop-aide.png", "L'écran d'aide : guide, vidéos et discussion avec le support."),
    "titre_creer": "Obtenir de l'aide",
    "etapes": [
        ("Consulter le guide", "Ce manuel est téléchargeable directement depuis l'écran."),
        ("Décrire le problème", "Indiquez la page, l'heure, ce que vous faisiez et le message affiché."),
        ("Envoyer", "L'équipe reçoit le message et répond dans la même discussion."),
    ],
    "note": ("Ne transmettez jamais de mot de passe",
             "Aucun membre du support ne vous demandera votre mot de passe. Si vous joignez une "
             "capture, vérifiez qu'elle ne contient ni identifiant ni donnée bancaire complète."),
    "mobile": ("mobile-aide.png", "L'aide sur téléphone."),
    "mobile_texte": "Le bouton « Aide » suit sur téléphone : un problème peut être signalé depuis le chantier.",
    "liens": [["Tous les modules", "Le bouton d'aide est présent sur chaque écran de l'application."]],
}

DEMARRAGE = {
    "titre": "Démarrer avec Liria Gestion Pro",
    "chapo": "Ce chapitre couvre les toutes premières minutes : installer l'application sur son "
             "téléphone, créer son accès, rejoindre son entreprise. C'est le seul chapitre à lire "
             "avant tous les autres.",
    "liste": ("desktop-mon-espace.png", "« Mon espace » : votre identité, vos identifiants et vos accès."),
    "intro_liste": "Le logiciel s'utilise depuis un ordinateur comme depuis un téléphone, avec le même "
                   "compte. Installée sur le téléphone, l'application se lance comme n'importe quelle "
                   "autre, sans passer par le navigateur.",
    "titre_creer": "Vos premiers pas",
    "etapes": [
        ("Installer l'application", "Ouvrez l'adresse du logiciel sur votre téléphone, puis « Ajouter "
         "à l'écran d'accueil ». Une icône apparaît : l'application se lance ensuite directement."),
        ("Créer son compte personnel", "Prénom, nom, email et mot de passe. Ce compte est le vôtre : "
         "il ne se partage pas."),
        ("Activer sa fiche employé", "Saisissez le numéro d'inscription (BTP-…) que votre employeur "
         "vous a communiqué. Votre poste et vos droits sont déjà préparés."),
        ("Ou créer son entreprise", "Si vous êtes le dirigeant, créez l'entreprise : vous en devenez "
         "administrateur avec tous les droits."),
        ("Vérifier « Mon espace »", "Vous y retrouvez votre identifiant, votre poste et votre mot de "
         "passe stock personnel."),
    ],
    "note": ("Un compte par personne, jamais de compte partagé",
             "Les heures pointées, les mouvements de stock et les notes de frais engagent la personne "
             "qui les saisit. Un compte partagé rendrait toute traçabilité impossible. La seule "
             "exception assumée est le compte dépôt, où chaque salarié s'identifie à chaque mouvement."),
    "mobile": ("mobile-mon-espace.png", "« Mon espace » sur téléphone."),
    "mobile_texte": "C'est l'écran à connaître : il contient votre identifiant salarié et votre QR "
                    "personnel, nécessaires à la borne du dépôt.",
    "liens": [
        ["Employés", "Votre fiche est préparée par votre employeur avant votre arrivée."],
        ["Accès et rôles", "Votre poste détermine ce que vous voyez."],
        ["Borne dépôt", "Votre identifiant et votre mot de passe stock viennent d'ici."],
    ],
    "erreurs": [
        ["Le numéro d'inscription est refusé", "Il est mal saisi, ou l'email ne correspond pas à celui enregistré.", "Utilisez l'adresse email enregistrée par votre employeur, et vérifiez le numéro sur sa fiche."],
        ["Je n'ai pas d'icône sur mon téléphone", "L'application n'est pas installée.", "Ouvrez l'adresse dans le navigateur, puis « Ajouter à l'écran d'accueil »."],
        ["Je suis bloqué sur « en attente »", "Votre administrateur ne vous a pas encore attribué un poste.", "Sans poste, aucun droit. Contactez-le."],
    ],
}

TABLEAU_BORD = {
    "titre": "Le tableau de bord",
    "chapo": "C'est l'écran d'accueil, et le plus consulté de tous. Il résume ce qui demande votre "
             "attention aujourd'hui — et son contenu dépend entièrement de votre poste.",
    "droits": [("acces_tableau_bord", "Voir l'accueil. Accordé à tous les postes.")],
    "liste": ("desktop-dashboard.png", "Le tableau de bord : indicateurs, alertes et raccourcis. Le menu à gauche n'affiche que les modules autorisés."),
    "intro_liste": "Un dirigeant y voit des chiffres et des marges ; un ouvrier y voit son planning et "
                   "son pointage. Ce n'est pas le même écran, et c'est voulu : personne ne voit ce qui "
                   "ne le concerne pas.",
    "titre_creer": "Personnaliser son accueil",
    "etapes": [
        ("Ouvrir « Modifier les widgets »", "Depuis le tableau de bord."),
        ("Choisir ce qu'on affiche", "Notifications, raccourcis, analyses, indicateurs, suivis, "
         "alertes, pointage, planning."),
        ("Régler ses raccourcis", "Les modules que vous ouvrez le plus souvent."),
    ],
    "note": ("Les droits l'emportent toujours sur la personnalisation",
             "Vous ne pouvez afficher que des widgets portant sur des modules auxquels votre poste "
             "donne accès. Personnaliser son accueil ne permet jamais de contourner une restriction."),
    "mobile": ("mobile-dashboard.png", "L'accueil sur téléphone, en icônes."),
    "mobile_texte": "Sur téléphone, l'accueil devient une grille d'icônes limitée aux modules "
                    "autorisés : deux appuis suffisent pour pointer.",
    "liens": [["Tous les modules", "Chaque indicateur renvoie vers son module d'origine."],
              ["Accès et rôles", "Le poste détermine les widgets disponibles."]],
    "erreurs": [
        ["Mon accueil est vide", "Votre poste n'ouvre presque aucun module.", "Demandez à votre administrateur d'élargir vos droits."],
        ["Un widget a disparu", "Il a été masqué, ou le droit correspondant a été retiré.", "Vérifiez « Modifier les widgets », puis vos droits."],
    ],
}

MES_TRAVAUX = {
    "titre": "Mes travaux",
    "chapo": "C'est l'écran de l'ouvrier : ce qu'il y a à faire aujourd'hui, sur quel chantier, avec "
             "quels plans. Tout y est expurgé de la moindre valeur monétaire.",
    "droits": [("acces_terrain", "Voir ses chantiers et ses tâches. Accordé aux postes de terrain.")],
    "liste": ("desktop-mes-travaux.png", "« Mes travaux » : les tâches issues du devis accepté, sans aucun prix."),
    "intro_liste": "Les tâches proviennent des lignes du devis accepté, recopiées automatiquement sans "
                   "les montants. Le salarié sait quoi faire ; le chiffrage reste confidentiel.",
    "note": ("Comment les prix sont réellement masqués",
             "Ce n'est pas l'affichage qui cache les prix : le serveur ne les envoie jamais. Une "
             "fonction dédiée ne renvoie que les tâches utiles à l'équipe affectée. Même en "
             "inspectant la page, aucun montant n'est accessible."),
    "mobile": ("mobile-mes-travaux.png", "« Mes travaux » sur téléphone."),
    "mobile_texte": "L'écran est fait pour le chantier : les tâches du jour, l'adresse, les plans.",
    "liens": [
        ["Devis", "Les tâches naissent des lignes du devis accepté."],
        ["Chantiers", "Seuls les chantiers actifs où vous êtes affecté apparaissent."],
        ["Planning", "L'affectation détermine ce que vous voyez."],
    ],
    "erreurs": [
        ["Aucune tâche affichée", "Le devis n'est pas accepté, ou vous n'êtes pas affecté au chantier.", "Les tâches ne sont créées qu'à l'acceptation du devis."],
    ],
}

PRESTATIONS = {
    "titre": "Le catalogue de prestations",
    "chapo": "Le catalogue évite de resaisir les mêmes lignes à chaque devis. Vous y enregistrez vos "
             "prestations habituelles avec leur prix, et vous les insérez d'un clic.",
    "droits": [("gerer_devis", "Gérer le catalogue : il fait partie du module Devis.")],
    "liste": ("desktop-prestations.png", "Le catalogue de prestations : désignation, type, unité, prix et TVA."),
    "champs": [
        ["Désignation", "L'intitulé vu par le client.", "Obligatoire."],
        ["Description", "Le détail de la prestation.", "Facultatif."],
        ["Type", "Main d'œuvre, fourniture, sous-traitance, déplacement, forfait.", "Sert aux analyses de rentabilité."],
        ["Unité", "h, m², ml, u, forfait…", "« h » par défaut."],
        ["Prix unitaire HT", "Votre tarif habituel.", "Modifiable ligne par ligne dans un devis."],
        ["Taux TVA", "Le taux applicable.", "20 % par défaut."],
        ["Actif", "Une prestation inactive n'est plus proposée.", "Préférez désactiver plutôt que supprimer."],
    ],
    "liens": [
        ["Devis", "Les prestations s'insèrent dans un devis en un clic."],
        ["Import", "Le catalogue s'importe depuis un autre logiciel."],
        ["Rentabilité", "Le type de prestation alimente les analyses."],
    ],
    "erreurs": [
        ["Le prix du devis ne suit pas le catalogue", "Le prix a été modifié dans le devis.", "C'est voulu : le catalogue propose, le devis dispose."],
    ],
}

FOURNISSEURS = {
    "titre": "Les fournisseurs",
    "chapo": "Le carnet de fournisseurs alimente les commandes et les factures d'achat. Chaque "
             "fournisseur peut porter ses coordonnées, son numéro de compte client et son portail.",
    "droits": [
        ("acces_achats", "Consulter le carnet."),
        ("gerer_achats", "Créer et modifier un fournisseur."),
    ],
    "liste": ("desktop-fournisseurs.png", "Le carnet de fournisseurs."),
    "liens": [
        ["Commandes", "La commande est adressée à un fournisseur du carnet."],
        ["Dépenses", "La facture d'achat est rattachée au fournisseur."],
        ["Connecteurs", "Un fournisseur peut être relié à son portail ou à son catalogue."],
        ["Stock", "Les tarifs négociés s'importent par fournisseur."],
    ],
    "erreurs": [
        ["Un doublon de fournisseur", "Il a été créé deux fois sous des noms proches.", "L'import reprend le fournisseur existant s'il porte le même nom exact."],
    ],
}

CONNECTEURS = {
    "titre": "Les connecteurs fournisseurs",
    "chapo": "Un connecteur relie un fournisseur à son portail ou à son catalogue, pour éviter de "
             "ressaisir les références et les tarifs. Aucun mot de passe fournisseur n'est jamais "
             "demandé ni stocké.",
    "droits": [("gerer_connecteurs", "Configurer les connecteurs. Réservé à l'administrateur.")],
    "liste": ("desktop-connecteurs.png", "Les connecteurs : fournisseur, numéro de compte, portail et mode d'échange."),
    "intro_liste": "N'importe quel fournisseur peut être ajouté. Les grands distributeurs du bâtiment "
                   "sont proposés avec leurs capacités réelles ; les autres restent en mode portail ou "
                   "import de catalogue.",
    "champs": [
        ["Fournisseur", "Repris du carnet, ou créé.", "Obligatoire."],
        ["Numéro de compte client", "Votre identifiant chez ce fournisseur.", "Non secret. Aucun mot de passe n'est demandé."],
        ["Portail", "L'adresse HTTPS du site fournisseur.", "Ouvrable depuis la fiche."],
        ["Mode", "Portail, CSV, Excel, FAB-DIS, API, EDI, PunchOut ou OAuth.", "Décrit la façon réelle d'échanger."],
    ],
    "note": ("Pourquoi aucun mot de passe fournisseur n'est stocké",
             "Un mot de passe conservé est un mot de passe qui finira par fuir. Une synchronisation "
             "automatique n'est possible que si le fournisseur fournit une interface officielle "
             "(API, EDI, PunchOut). Sans cela, le connecteur reste honnêtement en mode portail ou "
             "import : le logiciel ne prétendra jamais être connecté s'il ne l'est pas."),
    "liens": [
        ["Fournisseurs", "Le connecteur prolonge une fiche fournisseur."],
        ["Import", "Les tarifs négociés s'importent en CSV ou Excel."],
        ["Stock", "Les catalogues alimentent les articles."],
    ],
    "erreurs": [
        ["La synchronisation ne se fait pas", "Le fournisseur ne fournit pas d'interface officielle.", "Utilisez l'import de son catalogue en CSV ou Excel."],
    ],
}

DEPENSES = {
    "titre": "Les dépenses et factures fournisseurs",
    "chapo": "Toute facture d'achat se classe ici : sur un chantier, ou en frais généraux. Ce "
             "classement décide directement de la justesse de vos marges.",
    "droits": [
        ("acces_achats", "Consulter les dépenses."),
        ("gerer_achats", "Saisir une facture fournisseur et la classer sur un chantier."),
    ],
    "liste": ("desktop-depenses.png", "Les factures fournisseurs : chantier, catégorie, statut et reste à payer."),
    "titre_creer": "Saisir une facture fournisseur",
    "etapes": [
        ("Choisir le fournisseur", "Depuis le carnet."),
        ("Saisir les montants", "HT, TVA et TTC."),
        ("Classer la dépense", "Sur un chantier si elle le concerne, sinon en frais généraux. "
         "C'est l'étape décisive."),
        ("Joindre le justificatif", "Le PDF ou la photo d'origine, jamais une capture d'écran."),
        ("Enregistrer les règlements", "Le reste à payer se met à jour."),
    ],
    "note": ("Le classement décide de la vérité de vos marges",
             "Une facture laissée en frais généraux n'apparaît pas dans la rentabilité du chantier "
             "concerné : la marge affichée sera trop belle. Vous pouvez rattacher une facture à un "
             "chantier après coup, depuis la facture ou depuis la fiche chantier."),
    "liens": [
        ["Fournisseurs", "La facture est rattachée à un fournisseur."],
        ["Chantiers", "Le classement impute le coût au chantier."],
        ["Commandes", "La facture se rapproche de la commande."],
        ["Rentabilité", "Les achats imputés pèsent sur la marge."],
        ["Trésorerie", "Les règlements constituent les décaissements."],
    ],
    "erreurs": [
        ["La marge du chantier est trop belle", "Les factures sont restées en frais généraux.", "Classez-les sur le chantier."],
        ["Le justificatif est refusé", "Format non reconnu.", "Déposez le PDF ou la photo d'origine."],
    ],
}

CHARGES = {
    "titre": "Les charges récurrentes",
    "chapo": "Loyer, assurances, abonnements, crédits : les charges qui tombent chaque mois, "
             "indépendamment des chantiers. Les enregistrer permet d'anticiper la trésorerie.",
    "droits": [
        ("acces_achats", "Consulter les charges."),
        ("gerer_achats", "Créer et modifier une charge récurrente."),
    ],
    "liste": ("desktop-charges.png", "Les charges récurrentes et leur échéancier."),
    "liens": [
        ["Trésorerie", "Les charges sont anticipées dans les décaissements."],
        ["Rentabilité", "Elles relèvent des frais généraux, pas d'un chantier."],
    ],
    "erreurs": [
        ["Une charge n'apparaît pas en trésorerie", "Sa périodicité ou sa date de début manque.", "Complétez l'échéancier."],
    ],
}

EXPORTS = {
    "titre": "Les exports comptables",
    "chapo": "L'export livre à votre comptable ce qu'il attend : factures, avoirs, règlements et "
             "justificatifs, sur la période choisie, dans un format qu'il peut reprendre.",
    "droits": [("acces_comptabilite", "Produire les exports. Réservé à la direction et au comptable.")],
    "liste": ("desktop-exports.png", "Les exports : période, contenu et format."),
    "titre_creer": "Produire un export",
    "etapes": [
        ("Choisir la période", "Le mois ou le trimestre à transmettre."),
        ("Choisir le contenu", "Factures et avoirs, règlements, ou notes de frais avec justificatifs."),
        ("Télécharger", "Un fichier CSV, ou une archive complète pour les justificatifs."),
    ],
    "note": ("L'export des justificatifs est traçable",
             "L'archive contient les originaux, un manifeste et les empreintes de chaque fichier. "
             "Votre comptable peut vérifier qu'aucune pièce n'a été altérée depuis son dépôt."),
    "liens": [
        ["Factures", "Factures, avoirs et règlements alimentent l'export."],
        ["Notes de frais", "Les justificatifs s'exportent avec leur manifeste."],
        ["Clients", "La référence client est reprise dans l'export."],
    ],
    "erreurs": [
        ["L'export est vide", "Aucune facture sur la période choisie.", "Vérifiez les dates."],
        ["Le comptable ne peut pas lire le fichier", "Le séparateur ou l'encodage attendu diffère.", "Le CSV est produit en UTF-8 : précisez-le à l'ouverture dans son logiciel."],
    ],
}

# ═══════════════════════════════════════════════════════════════════════════════
# Modules ajoutés après la première édition du manuel (juillet 2026)
# ═══════════════════════════════════════════════════════════════════════════════

MESSAGERIE = {
    "titre": "La messagerie interne",
    "chapo": "La messagerie conserve les échanges professionnels dans l’entreprise : discussion privée "
             "avec un collaborateur ou fil partagé avec l’équipe d’un chantier. Elle évite que les "
             "consignes importantes restent dispersées dans des messageries personnelles.",
    "droits": [("acces_messagerie", "Lire et écrire dans les conversations auxquelles le compte participe.")],
    "titre_creer": "Créer une conversation",
    "etapes": [
        ("Choisir le type", "« Personne ou direction » crée un échange privé ; « Chantier » crée un fil "
         "visible par l’équipe autorisée sur ce chantier."),
        ("Rechercher le destinataire", "Tapez quelques lettres du nom, du poste ou du chantier. La liste "
         "se réduit automatiquement, sans tenir compte des accents."),
        ("Écrire le premier message", "Expliquez le contexte et l’action attendue. Ne transmettez jamais "
         "de mot de passe, de numéro de carte bancaire complet ou de secret technique."),
        ("Envoyer", "La conversation apparaît dans la colonne de gauche. Les réponses sont datées et "
         "attribuées à leur auteur."),
    ],
    "note": ("Des comptes individuels sont obligatoires",
             "Une conversation doit toujours avoir un auteur identifiable. La messagerie est donc "
             "désactivée en mode prototype et ne doit pas être utilisée depuis le compte partagé du dépôt."),
    "liens": [
        ["Employés", "Le carnet des destinataires provient des fiches employé disposant d’un compte."],
        ["Chantiers", "Un fil chantier suit les droits et l’équipe affectée au chantier."],
        ["IA", "Si l’option est active et autorisée, l’assistant peut proposer une réponse ; l’utilisateur reste responsable de l’envoi."],
    ],
    "erreurs": [
        ["Aucun destinataire n’est proposé", "La fiche n’a pas de compte actif ou votre périmètre ne permet pas cet échange.", "Vérifiez la fiche employé et les droits."],
        ["Impossible de publier sur un chantier", "Vous ne voyez pas ce chantier.", "Demandez une affectation ou un droit de consultation plus large."],
    ],
}

FACTURATION_AVANCEE = {
    "titre": "Situations, acomptes, avoirs, solde et DGD",
    "chapo": "La facturation avancée couvre les chantiers facturés progressivement. Elle calcule une "
             "situation à partir de l’avancement cumulé, prépare les acomptes et factures finales, "
             "gère les avoirs, la retenue de garantie et le décompte général définitif.",
    "droits": [
        ("acces_facturation_avancee", "Consulter les situations, documents avancés et remises en banque."),
        ("gerer_facturation_avancee", "Calculer une situation et créer un acompte, un avoir, un solde ou un DGD."),
    ],
    "titre_creer": "Créer une situation de travaux",
    "etapes": [
        ("Vérifier le devis", "Le devis doit être accepté et rattaché à un chantier. Sinon il ne peut pas "
         "servir de marché de référence."),
        ("Choisir le devis accepté", "La liste affiche le numéro, le client, le chantier et le montant HT."),
        ("Saisir l’avancement cumulé", "Indiquez le pourcentage total atteint depuis le début, et non le "
         "pourcentage de la seule période."),
        ("Saisir la retenue de garantie", "Si le marché en prévoit une, indiquez son taux. Vérifiez le contrat "
         "avant d’utiliser cette retenue."),
        ("Calculer", "Le logiciel déduit les situations antérieures et affiche le montant de la période."),
        ("Créer la facture", "Contrôlez les montants, puis générez la facture liée à la situation."),
    ],
    "statuts": [
        ["<b>Brouillon</b>", "Calcul en préparation.", "Modifiable avant émission."],
        ["<b>Émise</b>", "Situation communiquée au client.", "Peut être transformée en facture selon le circuit."],
        ["<b>Facturée</b>", "Une facture a été créée.", "Le lien vers la facture devient disponible."],
    ],
    "note": ("Pourquoi la liste peut être vide",
             "La liste ne contient que les devis acceptés. Pour une situation, le devis doit en plus être "
             "rattaché à un chantier. Acceptez d’abord le devis et vérifiez sa liaison au chantier."),
    "liens": [
        ["Devis", "Le montant du marché et les lignes viennent du devis accepté."],
        ["Chantiers", "Chaque situation est rattachée au chantier du devis."],
        ["Factures", "Une situation, un acompte, un avoir ou un solde produit un document de facturation."],
        ["Trésorerie", "Les échéances et règlements des factures alimentent les prévisions."],
    ],
    "erreurs": [
        ["La liste des devis est vide", "Aucun devis accepté ne correspond au type de document.", "Acceptez le devis et rattachez-le à un chantier."],
        ["Le montant de période semble trop élevé", "Un avancement de période a été saisi à la place du cumul.", "Saisissez le pourcentage total atteint depuis le début."],
    ],
}

CRM = {
    "titre": "Le CRM, les communications et les relances",
    "chapo": "Le CRM mémorise les appels, e-mails, SMS, courriers et rendez-vous. Il programme les rappels "
             "et conserve l’historique des relances d’impayés afin qu’aucune action commerciale ne soit oubliée.",
    "droits": [
        ("acces_crm", "Consulter les communications et relances autorisées."),
        ("gerer_crm", "Journaliser une communication, programmer un rappel et traiter une relance."),
    ],
    "titre_creer": "Journaliser une communication",
    "etapes": [
        ("Choisir le client", "Sélectionnez le client concerné ou laissez « Contact général » si l’échange "
         "n’est pas encore rattachable."),
        ("Choisir le canal et le sens", "Appel, e-mail, SMS, courrier ou rendez-vous ; entrant ou sortant."),
        ("Renseigner l’objet", "Un objet court facilite la recherche ultérieure."),
        ("Écrire le compte rendu", "Notez la décision, l’engagement pris et la prochaine action."),
        ("Programmer un rappel", "Ajoutez une date et une heure si une relance est nécessaire."),
    ],
    "note": ("Une relance doit rester traçable",
             "Préparez l’envoi depuis la facture impayée, vérifiez le destinataire puis conservez son état "
             "dans l’historique. Une relance n’efface jamais le solde : seul un règlement confirmé le fait."),
    "liens": [
        ["Clients", "Chaque communication complète l’historique de la relation client."],
        ["Factures", "Les impayés fournissent le montant, l’échéance et le chantier aux relances."],
        ["Tableau de bord", "Les rappels et retards autorisés peuvent alimenter le centre d’alertes."],
    ],
    "erreurs": [
        ["Impossible de préparer l’e-mail", "Le client n’a pas d’adresse e-mail.", "Complétez la fiche client."],
        ["La facture n’est pas proposée", "Elle est soldée ou hors de votre périmètre.", "Vérifiez son reste dû et vos droits."],
    ],
}

APPELS_OFFRES = {
    "titre": "Les appels d’offres",
    "chapo": "Ce module suit une consultation depuis sa détection jusqu’à la décision : référence, client, "
             "chantier, échéance de dépôt, montant estimé, source et notes de préparation.",
    "droits": [
        ("acces_appels_offres", "Consulter le portefeuille des appels d’offres."),
        ("gerer_appels_offres", "Créer une consultation et faire évoluer son statut."),
    ],
    "titre_creer": "Ajouter une consultation",
    "etapes": [
        ("Saisir le marché", "Donnez un intitulé explicite ; la référence peut être générée automatiquement."),
        ("Rattacher le contexte", "Associez le client et le chantier s’ils existent déjà."),
        ("Fixer la date limite", "Saisissez la date et l’heure exactes de dépôt, puis anticipez votre délai interne."),
        ("Ajouter la source", "Conservez le lien vers la plateforme acheteur et les pièces attendues."),
        ("Suivre le statut", "Faites évoluer la consultation à chaque étape jusqu’au résultat."),
    ],
    "note": ("Droit recommandé",
             "Ce module est destiné à la direction, au commercial et aux profils qui préparent réellement "
             "les réponses. Il n’est généralement pas utile à un chef d’équipe ou à un ouvrier."),
    "liens": [
        ["Clients", "Le donneur d’ordre peut être rattaché à la consultation."],
        ["Chantiers", "Un projet déjà qualifié peut être rattaché au futur chantier."],
        ["Devis", "Après attribution, le chiffrage détaillé est réalisé dans le module Devis."],
    ],
    "erreurs": [
        ["La consultation n’est pas visible", "Votre poste ne possède pas le droit d’accès.", "Demandez à l’administrateur uniquement si votre fonction l’exige."],
        ["L’échéance est dépassée sans alerte", "La date limite n’a pas été saisie.", "Complétez la date et l’heure de dépôt."],
    ],
}

OUVRAGES = {
    "titre": "Les ouvrages, modèles et métrés",
    "chapo": "La bibliothèque d’ouvrages enregistre des ensembles chiffrés réutilisables. Le métré assisté "
             "calcule surfaces, longueurs, volumes ou quantités et conserve la formule utilisée.",
    "droits": [
        ("acces_ouvrages", "Consulter les modèles et métrés."),
        ("gerer_ouvrages", "Créer des modèles chiffrés et enregistrer des métrés."),
    ],
    "titre_creer": "Créer un métré",
    "etapes": [
        ("Nommer le relevé", "Utilisez un nom qui précise la zone : étage, pièce ou lot."),
        ("Rattacher chantier et devis", "Facultatif mais recommandé pour retrouver le calcul depuis le dossier."),
        ("Saisir les dimensions", "Longueur, largeur, hauteur, nombre et éventuelle déduction."),
        ("Choisir l’unité", "m², mètre linéaire, m³ ou unité."),
        ("Contrôler la formule", "Le résultat et la formule sont conservés afin de pouvoir justifier le calcul."),
    ],
    "note": ("Le métré reste un calcul à vérifier",
             "Contrôlez les unités, les ouvertures déduites et les hypothèses de pose. Le logiciel assiste "
             "le calcul mais ne remplace ni le relevé terrain ni les règles professionnelles."),
    "liens": [
        ["Prestations", "Une ligne d’ouvrage peut reprendre les types, unités, prix et TVA de votre bibliothèque."],
        ["Devis", "Les modèles accélèrent le chiffrage ; le métré peut être rattaché au devis."],
        ["Chantiers", "Le relevé reste consultable dans le contexte du chantier."],
    ],
    "erreurs": [
        ["Le résultat est à zéro", "Une dimension obligatoire ou le nombre manque.", "Vérifiez les valeurs et l’unité."],
        ["Le calcul est incohérent", "Une déduction dépasse la quantité brute.", "Corrigez les dimensions ou la déduction."],
    ],
}

INTERVENTIONS = {
    "titre": "Les interventions et bons de travail",
    "chapo": "Les interventions couvrent le dépannage, la maintenance et les bons de travail. Elles "
             "centralisent le client, le site, l’équipe, les horaires, le compte rendu et les pièces utilisées.",
    "droits": [
        ("acces_interventions", "Consulter les interventions de son périmètre."),
        ("gerer_interventions", "Créer, planifier, affecter et clôturer une intervention."),
    ],
    "titre_creer": "Préparer une intervention",
    "etapes": [
        ("Choisir le client et le site", "Vérifiez l’adresse et le contact présent sur place."),
        ("Décrire la demande", "Notez le symptôme, la priorité et les consignes d’accès."),
        ("Planifier et affecter", "Choisissez la date, la durée prévue et les intervenants."),
        ("Réaliser le bon", "Sur place, renseignez le temps, les travaux, les pièces et les photos."),
        ("Faire valider", "Recueillez la validation ou la signature prévue par votre procédure."),
        ("Clôturer", "Une intervention terminée reste dans l’historique et peut alimenter la facturation."),
    ],
    "liens": [
        ["Clients", "Le contact, le site et l’historique sont rattachés au client."],
        ["Planning", "Les intervenants et la durée occupent le planning."],
        ["Stock", "Les pièces réellement utilisées peuvent être sorties du stock."],
        ["Factures", "Les éléments validés servent à préparer la facturation."],
    ],
    "erreurs": [
        ["L’intervention n’apparaît pas au technicien", "Il n’est pas affecté ou n’a pas le droit d’accès.", "Vérifiez l’affectation et son poste."],
        ["Impossible de clôturer", "Le compte rendu ou une validation obligatoire manque.", "Complétez les champs signalés."],
    ],
}

SOUS_TRAITANTS = {
    "titre": "Les sous-traitants",
    "chapo": "La fiche sous-traitant centralise l’identité de l’entreprise, les documents administratifs, "
             "les coordonnées bancaires, les chantiers confiés, les coûts et les règlements.",
    "droits": [
        ("acces_sous_traitants", "Consulter les sous-traitants autorisés."),
        ("gerer_sous_traitants", "Créer les fiches, contrôler les pièces et les rattacher aux chantiers."),
    ],
    "titre_creer": "Créer et qualifier un sous-traitant",
    "etapes": [
        ("Identifier l’entreprise", "Raison sociale, SIRET, contacts et spécialité."),
        ("Contrôler les documents", "Ajoutez les attestations, assurances et dates de validité requises."),
        ("Enregistrer le RIB", "Le RIB est chiffré et doit être vérifié avant toute préparation de virement."),
        ("Rattacher les chantiers", "Indiquez le périmètre confié et le coût prévu."),
        ("Enregistrer les factures", "Classez chaque facture sur le chantier concerné pour une marge exacte."),
    ],
    "note": ("Un sous-traitant n’est pas un salarié",
             "Ses heures et coûts doivent être classés en sous-traitance. Vérifiez les obligations "
             "contractuelles et sociales avec votre conseil avant le démarrage."),
    "liens": [
        ["Chantiers", "Les prestations et coûts pèsent sur la rentabilité du chantier."],
        ["Factures fournisseurs", "Les factures du sous-traitant se traitent comme des sorties d’argent."],
        ["Banque & paie", "Un RIB vérifié permet de préparer son règlement dans un lot bancaire."],
    ],
    "erreurs": [
        ["Le règlement ne peut pas être préparé", "Le RIB n’est pas vérifié ou la facture n’est pas validée.", "Contrôlez le coffre RIB et la source."],
        ["Le coût n’apparaît pas au chantier", "La facture n’est pas classée sur ce chantier.", "Rattachez-la depuis la facture ou la fiche chantier."],
    ],
}

GRANDS_DEPLACEMENTS = {
    "titre": "Les grands déplacements",
    "chapo": "Le module regroupe les frais et indemnités liés aux missions éloignées : période, chantier, "
             "salarié, hébergement, repas, transport et justificatifs. Il prépare le contrôle avant la paie.",
    "droits": [
        ("saisir_ses_notes_frais", "Déclarer ses propres éléments de déplacement."),
        ("gerer_notes_frais", "Contrôler et valider les déplacements de l’équipe."),
    ],
    "titre_creer": "Déclarer un grand déplacement",
    "etapes": [
        ("Choisir la période", "Indiquez les dates réelles de départ et de retour."),
        ("Rattacher le chantier", "Le chantier explique l’origine du déplacement et permet son imputation."),
        ("Renseigner les postes", "Hébergement, repas, transport et autres frais selon la politique de l’entreprise."),
        ("Ajouter les justificatifs", "Conservez les originaux et joignez les fichiers lisibles."),
        ("Soumettre", "Le responsable contrôle avant transmission aux éléments variables de paie."),
    ],
    "note": ("Les règles sociales doivent être paramétrées",
             "Les plafonds, exonérations et justificatifs dépendent de la situation et de la réglementation. "
             "Faites valider votre politique par le cabinet de paie ou l’expert-comptable."),
    "liens": [
        ["Chantiers", "Le déplacement est imputé au chantier concerné."],
        ["Notes de frais", "Les justificatifs et remboursements restent traçables."],
        ["Paie", "Les éléments validés peuvent préparer les variables du mois."],
    ],
    "erreurs": [
        ["La mission n’apparaît pas en paie", "Elle n’est pas validée ou n’est pas dans la période.", "Vérifiez le statut et les dates."],
        ["Le montant n’est pas remboursable", "Un justificatif obligatoire manque.", "Ajoutez la pièce ou demandez la règle à l’administrateur."],
    ],
}

PAIE = {
    "titre": "La préparation de la paie",
    "chapo": "Liria prépare les variables à transmettre au cabinet de paie : heures validées, absences, "
             "congés, déplacements et remboursements. Il ne remplace pas le logiciel légal de paie de l’expert-comptable.",
    "droits": [
        ("consulter_sa_paie", "Consulter ses propres documents disponibles."),
        ("saisir_variables_paie", "Préparer les variables autorisées."),
        ("controler_variables_paie", "Contrôler les données avant clôture."),
        ("gerer_paie", "Gérer les périodes et documents de paie."),
        ("exporter_paie", "Produire l’export transmis au cabinet."),
        ("parametrer_paie", "Configurer les règles et profils."),
        ("voir_paie_confidentielle", "Consulter les informations confidentielles de paie."),
    ],
    "titre_creer": "Préparer une période",
    "etapes": [
        ("Ouvrir le mois", "Créez ou sélectionnez la période de paie."),
        ("Contrôler les profils", "Vérifiez contrat, horaire, coût et coordonnées du salarié."),
        ("Importer les données terrain", "Heures validées, absences, congés et déplacements alimentent la préparation."),
        ("Corriger avec justification", "Toute correction doit être motivée et conservée dans l’historique."),
        ("Contrôler puis verrouiller", "Un second contrôle réduit les erreurs avant transmission."),
        ("Exporter au cabinet", "Transmettez le fichier et les pièces par le canal convenu avec l’expert-comptable."),
        ("Importer les bulletins", "Conservez les PDF privés reçus du cabinet et rendez chaque bulletin au seul salarié concerné."),
    ],
    "note": ("La paie légale reste produite par le prestataire",
             "Liria consolide et transmet des variables. Le bulletin officiel, les cotisations et la DSN "
             "restent produits et contrôlés par le cabinet ou le logiciel de paie agréé."),
    "liens": [
        ["Pointage", "Seules les heures validées doivent alimenter les variables."],
        ["Congés", "Les absences validées sont reprises dans la période."],
        ["Grands déplacements", "Les éléments contrôlés complètent les variables."],
        ["Banque & paie", "Les bulletins contrôlés peuvent préparer un lot de salaires, jamais un débit automatique."],
    ],
    "erreurs": [
        ["Une heure manque", "Le pointage n’est pas validé ou se trouve hors période.", "Contrôlez la date et le statut."],
        ["Un salarié voit un autre bulletin", "Anomalie d’autorisation critique.", "Coupez l’accès et contactez immédiatement le support."],
    ],
}

PAIEMENTS_BANCAIRES = {
    "titre": "Banque, RIB et virements",
    "chapo": "Le coffre bancaire protège les RIB des employés, fournisseurs et sous-traitants. Les lots "
             "séparent préparation, validation, transmission au prestataire bancaire et confirmation finale.",
    "droits": [
        ("acces_paiements_bancaires", "Consulter le module bancaire autorisé."),
        ("gerer_coordonnees_bancaires", "Enregistrer et vérifier les RIB."),
        ("gerer_paie", "Préparer les sources liées aux salaires."),
        ("preparer_virements", "Créer un lot sans envoyer d’argent."),
        ("valider_virements", "Valider le lot préparé."),
        ("executer_virements", "Transmettre au prestataire et ouvrir l’authentification bancaire."),
    ],
    "titre_creer": "Préparer un lot de virements",
    "etapes": [
        ("Vérifier les bénéficiaires", "Chaque RIB est validé, chiffré et affiché uniquement par ses quatre derniers caractères."),
        ("Choisir la source", "Bulletins contrôlés, notes de frais validées ou factures fournisseurs à payer."),
        ("Créer le lot", "Vérifiez la date d’exécution, le montant et le libellé de chaque ordre."),
        ("Faire valider", "La personne ayant préparé ne doit pas être la seule à autoriser l’envoi."),
        ("Transmettre", "Le prestataire bancaire ouvre une authentification forte ; Liria ne connaît pas vos identifiants bancaires."),
        ("Rapprocher", "Actualisez le statut jusqu’à confirmation ou rejet. La source n’est marquée payée qu’après confirmation."),
    ],
    "note": ("Aucun virement réel sans prestataire réglementé",
             "Sans contrat, clés et consentement bancaire valides, Liria prépare seulement le lot. "
             "Ne marquez jamais une facture ou un salaire payé avant la confirmation de la banque."),
    "liens": [
        ["Employés", "Le RIB salarié sert aux salaires et remboursements de notes de frais."],
        ["Fournisseurs / Sous-traitants", "Le RIB vérifié sert au règlement de leurs factures."],
        ["Paie", "Un bulletin contrôlé fournit la source du virement de salaire."],
        ["Notes de frais", "Une note validée fournit la source du remboursement."],
    ],
    "erreurs": [
        ["Une source est grisée", "RIB non vérifié ou document non validé.", "Contrôlez le bénéficiaire et le statut de la source."],
        ["La banque ne s’ouvre pas", "Le prestataire n’est pas configuré ou le consentement a expiré.", "Vérifiez le connecteur et recommencez la transmission."],
    ],
}

ABONNEMENT = {
    "titre": "L’abonnement, le stockage et l’option IA",
    "chapo": "L’administrateur de l’entreprise consulte son offre, son coût estimé, ses comptes facturables, "
             "son stockage, sa consommation IA, ses factures et son moyen de paiement.",
    "droits": [
        ("acces_parametres", "Consulter les informations d’abonnement autorisées."),
        ("gerer_parametres", "Souscrire, gérer le portail de paiement et paramétrer l’option IA."),
    ],
    "titre_creer": "Gérer l’abonnement",
    "etapes": [
        ("Contrôler le coût actuel", "Vérifiez l’offre, les comptes actifs ou en pause, les options et les éventuels dépassements."),
        ("Surveiller le stockage", "Plans, photos, factures et justificatifs consomment le quota affiché."),
        ("Choisir la politique IA", "Blocage au quota, demande de pack ou dépassement facturé, avec plafond de sécurité."),
        ("Ouvrir le portail sécurisé", "Stripe permet de changer de carte, récupérer les factures et gérer la résiliation."),
        ("Traiter un avertissement", "Un compte utilisant plus de deux appareils pendant le mois peut produire le supplément annoncé dans l’abonnement."),
    ],
    "note": ("Les deux premiers appareils sont inclus par compte",
             "L’avertissement apparaît dans la rubrique Abonnement, pas dans le tableau de bord opérationnel. "
             "Révoquez les appareils inutilisés depuis la fiche employé avant un nouveau mois."),
    "liens": [
        ["Employés", "Les comptes actifs et en pause restent facturables selon l’offre."],
        ["Stockage", "Les fichiers privés de l’entreprise alimentent le compteur."],
        ["IA", "Le palier, le quota et la politique de dépassement sont gérés ici."],
        ["Stripe Billing", "Le portail externe sécurisé gère carte, prélèvements et factures d’abonnement."],
    ],
    "erreurs": [
        ["Le montant semble trop élevé", "Compte en pause, option ou appareil supplémentaire.", "Ouvrez le détail du coût puis la fiche du compte concerné."],
        ["Le portail ne s’ouvre pas", "L’abonnement Stripe n’est pas encore rattaché ou la configuration externe manque.", "Contactez le support plateforme."],
    ],
}

IA_NOTIFICATIONS = {
    "titre": "L’assistant IA et les notifications",
    "chapo": "L’assistant aide à rédiger, résumer et retrouver des informations. Il ne voit que les données "
             "que l’utilisateur peut lui-même consulter. Les notifications signalent les actions autorisées "
             "qui nécessitent une attention.",
    "droits": [
        ("option IA active", "Permet d’utiliser l’assistant dans les écrans qui le proposent, dans la limite du quota."),
        ("droits du poste", "Limitent strictement les documents et données utilisables par l’assistant."),
    ],
    "titre_creer": "Utiliser l’assistant sans risque",
    "etapes": [
        ("Ouvrir l’assistant depuis l’écran concerné", "Le contexte utile est limité à la page et aux droits du compte."),
        ("Formuler une demande précise", "Indiquez l’objectif, le destinataire et les contraintes."),
        ("Relire la proposition", "Vérifiez les montants, dates, noms, références et obligations juridiques."),
        ("Corriger avant d’agir", "Une proposition IA n’envoie pas automatiquement un document et ne remplace pas une validation humaine."),
        ("Respecter le quota", "L’administrateur suit la consommation et choisit la politique appliquée au plafond."),
    ],
    "note": ("L’IA ne décide jamais à votre place",
             "Ne lui confiez pas de secret, mot de passe ou donnée bancaire complète. Contrôlez toute réponse "
             "avant envoi, paiement, signature, décision RH ou engagement contractuel."),
    "liens": [
        ["Abonnement", "Le palier, la consommation et la politique de quota sont configurés par l’administrateur."],
        ["Messagerie", "L’assistant peut proposer une réponse sans l’envoyer seul."],
        ["Notifications", "Planning, pointage, validations et échéances peuvent générer des alertes selon les droits."],
    ],
    "erreurs": [
        ["L’assistant refuse une question", "Le module n’est pas autorisé ou le quota est atteint.", "Vérifiez vos droits et l’écran Abonnement."],
        ["Une réponse contient une erreur", "L’IA produit une suggestion, pas une preuve.", "Revenez au document source et corrigez avant utilisation."],
    ],
}
