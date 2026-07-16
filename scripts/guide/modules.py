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
