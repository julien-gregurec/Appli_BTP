"""Contenu rédactionnel du manuel.

Trame imposée à chaque chapitre de module :
  1. À quoi ça sert   2. Qui y a accès   3. L'écran principal
  4. Créer pas à pas  5. La fiche        6. Statuts et cycle de vie
  7. Sur mobile       8. Liens avec les autres modules   9. Erreurs fréquentes

Règle : rien n'est écrit qui ne soit vérifiable dans le logiciel. Les champs et
les statuts listés ici proviennent du schéma réel de la base.
"""
import json
from pathlib import Path

from reportlab.lib.units import cm
from reportlab.platypus import KeepTogether, PageBreak, Spacer
from generer_manuel import saut_de_chapitre

from generer_manuel import Titre, capture, encadre, etapes, p, section, tableau
from trame import chapitre
import modules

RACINE = Path(__file__).resolve().parents[2]


def _droits():
    fichier = RACINE / "output/guide/droits.json"
    return json.loads(fichier.read_text()) if fichier.exists() else []


# ═══════════════════════════════════════════════════════════════════
def introduction():
    return [
        Titre("Bienvenue dans Liria Gestion Pro", 1),
        p("Liria Gestion Pro réunit dans un seul logiciel tout ce qu'une entreprise du bâtiment "
          "manipule au quotidien : les clients, les chantiers, les devis, les factures, le planning "
          "des équipes, les heures pointées, les achats, le stock, le matériel et la rentabilité. "
          "Chaque information n'est saisie qu'une fois : un devis accepté crée les tâches du chantier, "
          "les heures pointées alimentent la rentabilité, une facture réglée met à jour la trésorerie.", "chapo"),

        Titre("Comment lire ce manuel", 2),
        p("Chaque module a son chapitre, toujours construit de la même façon : à quoi il sert, qui y a "
          "accès, l'écran principal détaillé, la création pas à pas, la fiche, les statuts, la version "
          "mobile, les liens avec les autres modules et les erreurs fréquentes. Vous pouvez donc lire "
          "le manuel en entier ou n'ouvrir que le chapitre qui vous concerne."),
        *encadre("Toutes les captures sont réelles",
                 "Les images de ce manuel sont des captures du logiciel, prises sur une entreprise de "
                 "démonstration appelée « Entreprise Test ». Les noms, adresses et montants qui y "
                 "figurent sont fictifs. Vos écrans peuvent différer légèrement : le menu n'affiche que "
                 "les modules auxquels votre poste donne droit."),

        Titre("Le vocabulaire", 2),
        *tableau(["Terme", "Ce que ça veut dire"], [
            ["Entreprise", "Votre société dans le logiciel. Chaque entreprise est étanche : personne ne voit les données d'une autre."],
            ["Poste", "Le rôle d'un salarié (Administrateur, Chef de chantier, Ouvrier…). C'est le poste qui décide des droits."],
            ["Droit", "Une autorisation précise, par exemple « Gérer les devis ». Un poste est une collection de droits."],
            ["Fiche employé", "La fiche RH d'un salarié. Elle existe même si le salarié n'a pas encore de compte pour se connecter."],
            ["Compte", "L'accès personnel d'un salarié (email + mot de passe). Il est rattaché à sa fiche employé."],
        ], [4 * cm, 12.4 * cm]),
        saut_de_chapitre(),
    ]


# ═══════════════════════════════════════════════════════════════════
def chapitre_devis():
    return [
        Titre("Les devis, de A à Z", 1),
        p("Le devis est le point de départ de presque tout : il porte le chiffrage, il engage le client, "
          "et une fois accepté il alimente le chantier et la facture. Ce chapitre couvre la création "
          "complète d'un devis, son envoi, son suivi et sa transformation en facture.", "chapo"),

        Titre("Qui y a accès", 2),
        p("Deux droits distincts gouvernent ce module. Un salarié peut consulter les devis sans pouvoir "
          "les modifier : c'est le cas typique d'un chef de chantier qui doit connaître le contenu "
          "vendu sans toucher aux prix."),
        *tableau(["Droit", "Ce qu'il permet"], [
            ["<b>acces_devis</b>", "Ouvrir le module et consulter les devis. Sans ce droit, l'entrée « Devis » n'apparaît même pas dans le menu."],
            ["<b>gerer_devis</b>", "Créer, modifier, envoyer, accepter ou refuser un devis, et gérer le catalogue de prestations."],
        ], [4.5 * cm, 11.9 * cm]),
        *encadre("Les ouvriers ne voient jamais les prix",
                 "Un salarié affecté à un chantier consulte les tâches à réaliser dans « Mes travaux », "
                 "expurgées de tout montant. Le contenu du devis lui est utile, pas son chiffrage.",
                 ),

        Titre("L'écran principal", 2),
        p("La liste des devis affiche l'essentiel en une ligne par devis. Elle est triée du plus récent "
          "au plus ancien."),
        *capture("desktop-devis.png", "La liste des devis. Le champ de recherche filtre sur le numéro et le client ; les statuts se filtrent d'un clic."),
        *tableau(["Colonne", "Ce qu'elle contient"], [
            ["Numéro", "L'identifiant unique du devis, attribué automatiquement. Il ne peut pas être réutilisé."],
            ["Client", "Le client destinataire. Cliquer dessus ouvre sa fiche."],
            ["Chantier", "Le chantier rattaché, s'il y en a un. Un devis peut être créé avant que le chantier n'existe."],
            ["Date d'émission", "La date du devis, reprise sur le document imprimé."],
            ["Validité", "La date au-delà de laquelle l'offre n'engage plus. Le devis passe alors en « Expiré »."],
            ["Montant", "Le total, hors taxes et toutes taxes comprises."],
            ["Statut", "Où en est le devis. Voir le cycle de vie plus bas."],
        ], [3.4 * cm, 13 * cm]),

        *section("Créer un devis pas à pas", 2,
                 capture("desktop-devis-nouveau.png",
                         "L'éditeur de devis : en-tête, lignes de prestation et totaux calculés en direct.")),
        *etapes([
            ("Choisir le client", "Commencez à taper son nom : la liste se filtre. Si le client n'existe pas encore, "
             "vous pouvez le créer sans quitter l'écran — inutile d'aller dans le module Clients."),
            ("Rattacher un chantier", "Facultatif à ce stade. Vous pouvez sélectionner un chantier existant ou en "
             "créer un à la volée. Rattacher le devis permettra de suivre la rentabilité du chantier."),
            ("Fixer les dates", "La date d'émission est celle du jour par défaut. La date de validité définit la "
             "durée d'engagement de votre offre."),
            ("Ajouter les lignes", "Une ligne par prestation. Vous pouvez piocher dans votre catalogue de "
             "prestations pour éviter de resaisir les intitulés et les prix."),
            ("Vérifier les totaux", "Le total HT, la TVA et le TTC se recalculent à chaque frappe. Une remise "
             "globale peut s'appliquer sur l'ensemble."),
            ("Enregistrer", "Le devis est créé en « Brouillon ». Il reste modifiable tant qu'il n'est pas envoyé."),
        ]),

        Titre("Le détail d'une ligne", 3),
        p("Chaque ligne du devis porte les champs suivants. Seule la désignation est obligatoire."),
        *tableau(["Champ", "Rôle", "Remarque"], [
            ["Désignation", "L'intitulé vu par le client.", "Obligatoire. Apparaît en gras sur le document."],
            ["Description", "Le détail de la prestation.", "Facultatif. S'affiche en petit sous la désignation."],
            ["Type", "Main d'œuvre, fourniture, sous-traitance, déplacement ou forfait.", "Sert aux analyses de rentabilité."],
            ["Quantité", "Le nombre d'unités.", "Accepte les décimales."],
            ["Unité", "h, m², ml, u, forfait…", "Libre."],
            ["Prix unitaire HT", "Le prix d'une unité, hors taxes.", "Le total de la ligne se calcule seul."],
            ["Remise ligne", "Une remise en pourcentage sur cette ligne.", "Facultatif, s'ajoute à la remise globale."],
            ["Taux TVA", "Le taux applicable.", "20 % par défaut. Pensez aux taux réduits en rénovation."],
        ], [3 * cm, 7.4 * cm, 6 * cm]),

        Titre("Le cycle de vie d'un devis", 2),
        p("Un devis passe par des statuts qui déclenchent chacun des effets ailleurs dans le logiciel."),
        *tableau(["Statut", "Ce que ça signifie", "Ce que ça déclenche"], [
            ["<b>Brouillon</b>", "En cours de rédaction, jamais vu par le client.", "Rien. Modifiable librement."],
            ["<b>Envoyé</b>", "Transmis au client, en attente de sa réponse.", "Le chantier lié passe en « Devis envoyé »."],
            ["<b>Accepté</b>", "Le client a validé l'offre.", "Les tâches du chantier sont créées automatiquement, sans les prix. Le devis peut être facturé."],
            ["<b>Refusé</b>", "Le client a décliné.", "Le devis est conservé pour l'historique."],
            ["<b>Expiré</b>", "La date de validité est dépassée.", "L'offre n'engage plus. Un nouveau devis est nécessaire."],
            ["<b>Annulé</b>", "Abandonné de votre côté.", "Conservé pour l'historique."],
        ], [2.6 * cm, 6.4 * cm, 7.4 * cm]),
        *encadre("Un devis accepté crée le travail sur le chantier",
                 "Dès l'acceptation, chaque ligne devient une tâche visible par l'équipe affectée, sans "
                 "aucun montant. Vos ouvriers savent quoi faire, vos prix restent confidentiels."),

        *section("La fiche d'un devis", 2,
                 capture("desktop-devis-fiche.png",
                         "La fiche d'un devis : contenu, totaux, statut et actions disponibles.")),

        Titre("Le document imprimé", 2),
        p("Le bouton « Télécharger PDF » produit le devis tel que le client le recevra : votre logo, vos "
          "coordonnées, le détail des lignes, les totaux et vos mentions légales. La présentation se "
          "règle dans Paramètres (modèle, couleurs, police, position du logo)."),
        *capture("desktop-impression-devis.png",
                 "Le devis imprimé, généré par le logiciel. En-tête d'entreprise, destinataire, lignes détaillées, TVA et total TTC.",
                 hauteur_max=9.5 * cm, rogner=True),

        KeepTogether([
            Titre("Sur mobile", 2),
            p("Le module est utilisable au téléphone. La liste passe en cartes et l'éditeur s'empile "
              "verticalement : un devis peut être rédigé et envoyé depuis un chantier."),
            *capture("mobile-devis.png", "La liste des devis sur téléphone.", hauteur_max=8.5 * cm),
        ]),

        Titre("Liens avec les autres modules", 2),
        *tableau(["Module", "Ce qui circule"], [
            ["Clients", "Le devis reprend l'adresse de facturation du client. Un client peut être créé depuis l'éditeur."],
            ["Chantiers", "Le statut du devis pilote celui du chantier. Un devis accepté crée les tâches."],
            ["Factures", "Un devis accepté se transforme en facture en conservant ses lignes."],
            ["Prestations", "Le catalogue évite de resaisir intitulés et prix."],
            ["Rentabilité", "Le montant vendu sert de référence face aux heures et achats réels."],
        ], [3.4 * cm, 13 * cm]),

        Titre("Erreurs fréquentes", 2),
        *tableau(["Symptôme", "Cause probable", "Solution"], [
            ["« Devis » n'apparaît pas dans le menu", "Votre poste n'a pas le droit acces_devis.", "Demandez à votre administrateur d'ouvrir ce module pour votre poste."],
            ["Impossible de modifier un devis", "Il n'est plus en brouillon, ou vous n'avez que le droit de consulter.", "Repassez-le en brouillon si le client n'a pas répondu, ou demandez le droit gerer_devis."],
            ["Le total ne correspond pas", "Une remise de ligne ou une remise globale s'applique.", "Vérifiez la colonne remise et la remise globale sous les totaux."],
            ["Le chantier ne montre pas les tâches", "Le devis n'est pas passé en « Accepté ».", "Les tâches ne sont créées qu'à l'acceptation."],
        ], [4 * cm, 5.6 * cm, 6.8 * cm]),
        saut_de_chapitre(),
    ]


# ═══════════════════════════════════════════════════════════════════
def annexe_droits():
    droits = _droits()
    if not droits:
        return []
    lignes = [[f"<b>{d['cle']}</b>", d["module"], d["description"]] for d in droits]
    return [
        Titre("Annexe — le catalogue des droits", 1),
        p(f"Le logiciel compte {len(droits)} droits. Un poste est une combinaison de ces droits. "
          "Cette annexe sert de référence à l'administrateur qui configure les postes dans "
          "Paramètres puis « Accès et rôles ».", "chapo"),
        *encadre("Le droit mode_compte_depot n'est pas un droit comme les autres",
                 "Il transforme le compte en borne de dépôt verrouillée sur le stock, sans accès aux "
                 "autres modules. Ne l'attribuez qu'au poste « Compte dépôt » partagé, jamais à un "
                 "poste de direction."),
        *tableau(["Droit", "Module", "Ce qu'il autorise"], lignes, [4.6 * cm, 3.4 * cm, 8.4 * cm]),
    ]


def chapitres():
    return [
        introduction(),
        chapitre(modules.CLIENTS),
        chapitre(modules.CHANTIERS),
        chapitre_devis(),
        chapitre(modules.FACTURES),
        chapitre(modules.PLANNING),
        chapitre(modules.POINTAGE),
        chapitre(modules.EMPLOYES),
        chapitre(modules.CONGES),
        chapitre(modules.NOTES_FRAIS),
        chapitre(modules.STOCK),
        chapitre(modules.BORNE),
        chapitre(modules.OUTILLAGE),
        chapitre(modules.FLOTTE),
        chapitre(modules.COMMANDES),
        chapitre(modules.RENTABILITE),
        chapitre(modules.TRESORERIE),
        chapitre(modules.PARAMETRES),
        chapitre(modules.ACCES),
        chapitre(modules.IMPORT),
        chapitre(modules.AIDE),
        parcours_par_role(),
        securite(),
        depannage(),
        annexe_droits(),
    ]


# ═══════════════════════════════════════════════════════════════════
def parcours_par_role():
    return [
        Titre("Le logiciel selon votre métier", 1),
        p("Deux personnes n'utilisent pas Liria Gestion Pro de la même façon. Cette partie décrit le "
          "quotidien de chaque rôle : ce que vous ouvrez le matin, ce que vous faites, ce que vous ne "
          "voyez pas.", "chapo"),

        Titre("Le dirigeant", 2),
        p("Vous voyez tout : les marges, la trésorerie, les devis en attente. Votre écran d'accueil "
          "concentre les chiffres et les alertes."),
        *tableau(["Quand", "Ce que vous faites", "Où"], [
            ["Le matin", "Vérifier les alertes, les devis à relancer et les factures en retard.", "Tableau de bord"],
            ["Dans la journée", "Chiffrer, envoyer les devis, convertir les acceptés en factures.", "Devis, Factures"],
            ["Chaque semaine", "Valider les pointages, suivre la marge des chantiers en cours.", "Pointage, Rentabilité"],
            ["Chaque mois", "Exporter pour le comptable, suivre les impayés.", "Exports, Trésorerie"],
        ], [2.8 * cm, 9.6 * cm, 4 * cm]),

        Titre("Le conducteur de travaux", 2),
        p("Vous organisez : le planning, les équipes, les commandes. Vous voyez les chantiers et les "
          "coûts, mais la trésorerie de l'entreprise ne vous concerne pas."),
        *tableau(["Quand", "Ce que vous faites", "Où"], [
            ["Le matin", "Vérifier qui est où, ajuster les affectations.", "Planning"],
            ["Dans la journée", "Suivre l'avancement, commander le matériel manquant.", "Chantiers, Commandes"],
            ["En fin de semaine", "Contrôler et valider les heures de l'équipe.", "Pointage"],
        ], [2.8 * cm, 9.6 * cm, 4 * cm]),

        Titre("Le chef de chantier", 2),
        p("Vous êtes sur le terrain avec votre téléphone. Vous voyez votre chantier, vos tâches, votre "
          "équipe — pas les prix."),
        *tableau(["Quand", "Ce que vous faites", "Où"], [
            ["En arrivant", "Consulter les tâches du jour et les plans.", "Mes travaux"],
            ["Pendant le chantier", "Photographier l'avancement, signaler un problème.", "Chantiers, Aide"],
            ["En repartant", "Pointer ses heures.", "Pointage"],
        ], [2.8 * cm, 9.6 * cm, 4 * cm]),

        Titre("L'ouvrier", 2),
        p("Votre usage tient en trois écrans : votre planning, votre pointage, vos notes de frais. "
          "Aucun montant ne vous est affiché — ni prix de vente, ni marge, ni coût."),
        *tableau(["Quand", "Ce que vous faites", "Où"], [
            ["Le matin", "Voir où je travaille aujourd'hui.", "Planning, Mon espace"],
            ["Au dépôt", "Prendre du matériel avec mon identifiant.", "Borne dépôt"],
            ["Le soir", "Pointer mes heures.", "Pointage"],
            ["Au besoin", "Photographier un ticket, demander un congé.", "Notes de frais, Congés"],
        ], [2.8 * cm, 9.6 * cm, 4 * cm]),

        Titre("Le comptable", 2),
        p("Vous traitez les justificatifs et les exports. Vous ne modifiez ni les devis ni les chantiers."),
        *tableau(["Quand", "Ce que vous faites", "Où"], [
            ["Au fil de l'eau", "Contrôler et rembourser les notes de frais.", "Notes de frais"],
            ["Chaque mois", "Exporter les factures, avoirs, règlements et justificatifs.", "Exports"],
        ], [2.8 * cm, 9.6 * cm, 4 * cm]),
        saut_de_chapitre(),
    ]


def securite():
    return [
        Titre("Sécurité et confidentialité", 1),
        p("Ce chapitre explique ce que le logiciel protège, comment, et ce qui reste de votre "
          "responsabilité.", "chapo"),

        Titre("Chaque entreprise est étanche", 2),
        p("Les données d'une entreprise ne sont jamais visibles par une autre. Cette séparation est "
          "appliquée par la base de données elle-même, à chaque requête, et non par l'interface. Même "
          "en cas de faille dans l'application, les données d'une autre entreprise restent inaccessibles."),

        Titre("Les droits sont vérifiés côté serveur", 2),
        p("Masquer un bouton ne protège rien. Chaque action est revérifiée sur le serveur : un salarié "
          "qui devinerait l'adresse d'une page interdite obtiendrait quand même un refus."),

        Titre("Ce que le logiciel ne fait jamais", 2),
        *tableau(["Règle", "Pourquoi"], [
            ["Aucun mot de passe fournisseur n'est demandé ni stocké.", "Un mot de passe stocké est un mot de passe qui fuira un jour."],
            ["Le mot de passe stock est haché.", "Ni l'administrateur ni l'éditeur ne peuvent le lire."],
            ["Une facture émise n'est jamais supprimée.", "La numérotation légale doit rester continue. On émet un avoir."],
            ["Un justificatif n'est jamais recompressé.", "Seul l'original a valeur probante."],
            ["Personne ne pointe pour un autre.", "Les heures engagent la personne qui les déclare."],
        ], [7 * cm, 9.4 * cm]),

        Titre("Ce qui reste de votre responsabilité", 2),
        *tableau(["À faire", "Conséquence si négligé"], [
            ["Attribuer les postes avec discernement.", "Un poste trop permissif expose vos marges à toute l'équipe."],
            ["Retirer les accès des salariés sortis.", "Un ancien salarié conserverait son accès."],
            ["Ne jamais accorder « mode_compte_depot » à un poste de direction.", "Le compte serait verrouillé sur la borne."],
            ["Vérifier les mentions légales de vos documents.", "Un devis sans assurance décennale n'est pas conforme."],
        ], [7 * cm, 9.4 * cm]),
        saut_de_chapitre(),
    ]


def depannage():
    return [
        Titre("Dépannage", 1),
        p("Les situations les plus fréquentes, et quoi faire.", "chapo"),
        *tableau(["Symptôme", "Cause la plus probable", "Solution"], [
            ["Je ne peux pas me connecter", "Mot de passe oublié.", "Utilisez « Mot de passe oublié » depuis l'écran de connexion."],
            ["Un module a disparu de mon menu", "Votre poste n'a plus le droit d'accès correspondant.", "Demandez à votre administrateur d'ouvrir ce module pour votre poste."],
            ["Je ne vois que le stock et la borne", "Votre poste a reçu le droit « mode_compte_depot ».", "Ce droit est réservé au compte dépôt partagé. L'administrateur doit le retirer."],
            ["Je n'arrive pas à pointer", "Le chantier n'est pas actif, ou vous n'y êtes pas affecté.", "Vérifiez le planning et le statut du chantier."],
            ["Mes heures n'apparaissent pas en rentabilité", "Elles ne sont pas validées.", "Seules les heures validées par un responsable sont valorisées."],
            ["Le scanner ne s'ouvre pas", "La caméra exige une connexion HTTPS.", "Utilisez l'adresse en https, ou saisissez la référence à la main."],
            ["La marge d'un chantier est fausse", "Coût horaire manquant, ou achats en frais généraux.", "Renseignez les coûts horaires et classez les factures sur le chantier."],
            ["Les accents sont abîmés après un import", "Le fichier CSV n'est pas en UTF-8.", "Réexportez en UTF-8 ou utilisez le format Excel."],
            ["Une facture est fausse et déjà envoyée", "Une facture émise est figée par la loi.", "Émettez un avoir, puis une nouvelle facture."],
        ], [4.4 * cm, 5.4 * cm, 6.6 * cm]),
        *encadre("Avant de contacter le support",
                 "Notez la page, l'heure, le compte utilisé, ce que vous faisiez et le message affiché. "
                 "Joignez une capture d'écran ne contenant ni mot de passe ni donnée bancaire complète. "
                 "Le bouton « Aide » est en bas à droite de chaque écran."),
        saut_de_chapitre(),
    ]
