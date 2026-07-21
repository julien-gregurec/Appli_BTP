#!/usr/bin/env python3
"""Génère le manuel illustré complet de Liria Gestion Pro."""

from __future__ import annotations

from html import escape
from pathlib import Path
from shutil import copy2

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, ListFlowable, ListItem, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle, KeepTogether
)
from reportlab.platypus.tableofcontents import TableOfContents

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output/pdf/Guide_utilisation_detaille_Liria_Gestion_Pro.pdf"
PUBLIC = ROOT / "public/guides/Guide_utilisation_Liria_Gestion_Pro.pdf"
LOGO = ROOT / "public/liria-gestion-pro-logo-v5.png"
AUDIT = ROOT / "output/audit"

NAVY = HexColor("#0D1B2A")
BLUE = HexColor("#1264D8")
GOLD = HexColor("#C9A24A")
PALE_GOLD = HexColor("#FFF8E8")
PALE_BLUE = HexColor("#EDF5FF")
TEXT = HexColor("#172033")
MUTED = HexColor("#667085")
LIGHT = HexColor("#F5F7FA")
GREEN = HexColor("#237A50")
RED = HexColor("#B42318")

FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
if Path(FONT_REG).exists():
    pdfmetrics.registerFont(TTFont("Liria", FONT_REG))
    pdfmetrics.registerFont(TTFont("Liria-Bold", FONT_BOLD))
    BASE_FONT, BOLD_FONT = "Liria", "Liria-Bold"
else:
    BASE_FONT, BOLD_FONT = "Helvetica", "Helvetica-Bold"


class GuideDoc(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(filename, pagesize=A4, rightMargin=1.6*cm, leftMargin=1.6*cm,
                         topMargin=1.7*cm, bottomMargin=1.6*cm,
                         title="Guide détaillé d'utilisation - Liria Gestion Pro",
                         author="Liria Gestion Pro", subject="Manuel complet du logiciel")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="normal")
        self.addPageTemplates(PageTemplate(id="guide", frames=frame, onPage=self.header_footer))
        self._bookmark = 0

    def header_footer(self, canvas, doc):
        if doc.page == 1:
            return
        canvas.saveState()
        canvas.setStrokeColor(HexColor("#E4E7EC"))
        canvas.line(self.leftMargin, A4[1]-1.15*cm, A4[0]-self.rightMargin, A4[1]-1.15*cm)
        canvas.setFont(BASE_FONT, 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(self.leftMargin, A4[1]-0.82*cm, "Liria Gestion Pro - Guide utilisateur détaillé")
        canvas.drawRightString(A4[0]-self.rightMargin, 0.75*cm, f"Page {doc.page}")
        canvas.setStrokeColor(GOLD)
        canvas.line(self.leftMargin, 1.02*cm, A4[0]-self.rightMargin, 1.02*cm)
        canvas.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in ("Chapitre", "Section"):
            level = 0 if flowable.style.name == "Chapitre" else 1
            text = flowable.getPlainText()
            key = getattr(flowable, "_liria_bookmark", None)
            if key is None:
                self._bookmark += 1
                key = f"titre-{self._bookmark}"
                flowable._liria_bookmark = key
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(text, key, level=level, closed=False)
            self.notify("TOCEntry", (level, text, self.page, key))


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Chapitre", parent=styles["Heading1"], fontName=BOLD_FONT,
    fontSize=21, leading=25, textColor=NAVY, spaceBefore=4, spaceAfter=12, keepWithNext=True))
styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontName=BOLD_FONT,
    fontSize=14, leading=18, textColor=BLUE, spaceBefore=12, spaceAfter=7, keepWithNext=True))
styles.add(ParagraphStyle(name="SousSection", parent=styles["Heading3"], fontName=BOLD_FONT,
    fontSize=11.5, leading=15, textColor=NAVY, spaceBefore=9, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name="CorpsLiria", parent=styles["BodyText"], fontName=BASE_FONT,
    fontSize=9.3, leading=13.3, textColor=TEXT, spaceAfter=6))
styles.add(ParagraphStyle(name="Petit", parent=styles["BodyText"], fontName=BASE_FONT,
    fontSize=7.8, leading=10.5, textColor=MUTED))
styles.add(ParagraphStyle(name="Etape", parent=styles["BodyText"], fontName=BASE_FONT,
    fontSize=9.1, leading=13, leftIndent=4, textColor=TEXT))
styles.add(ParagraphStyle(name="Legende", parent=styles["BodyText"], fontName=BASE_FONT,
    fontSize=7.5, leading=10, textColor=MUTED, alignment=TA_CENTER, spaceAfter=8))
styles.add(ParagraphStyle(name="Callout", parent=styles["BodyText"], fontName=BASE_FONT,
    fontSize=8.8, leading=12.5, textColor=TEXT))


def p(text: str, style="CorpsLiria"):
    return Paragraph(escape(text).replace("\n", "<br/>"), styles[style])


def rich(text: str, style="CorpsLiria"):
    return Paragraph(text, styles[style])


def steps(items):
    return ListFlowable(
        [ListItem(p(item, "Etape"), leftIndent=8) for item in items],
        bulletType="1", start="1", leftIndent=22, bulletFontName=BOLD_FONT,
        bulletFontSize=8.5, bulletColor=BLUE, spaceAfter=7,
    )


def bullets(items):
    return ListFlowable(
        [ListItem(p(item, "Etape"), leftIndent=8) for item in items],
        bulletType="bullet", leftIndent=20, bulletFontName=BOLD_FONT,
        bulletFontSize=9, bulletColor=GOLD, spaceAfter=7,
    )


def callout(title, text, kind="info"):
    palette = {
        "info": (PALE_BLUE, BLUE), "attention": (PALE_GOLD, GOLD),
        "ok": (HexColor("#ECFDF3"), GREEN), "danger": (HexColor("#FEF3F2"), RED),
    }
    bg, border = palette[kind]
    table = Table([[rich(f"<b>{escape(title)}</b><br/>{escape(text)}", "Callout")]], colWidths=[17.2*cm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg), ("BOX", (0,0), (-1,-1), 0.8, border),
        ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    return table


def screenshot(name, caption, max_h=9.1*cm):
    path = AUDIT / name
    if not path.exists():
        return []
    reader = ImageReader(str(path))
    w, h = reader.getSize()
    max_w = 17.2*cm
    ratio = min(max_w/w, max_h/h)
    return [Spacer(1, 5), Image(str(path), width=w*ratio, height=h*ratio), p(caption, "Legende")]


def table(data, widths, header=True, font=7.5):
    header_style = ParagraphStyle("TableHeader", parent=styles["Petit"], textColor=colors.white, fontName=BOLD_FONT)
    prepared = [[Paragraph(escape(str(cell)), header_style if header and row_index == 0 else styles["Petit"])
                 for cell in row] for row_index, row in enumerate(data)]
    t = Table(prepared, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0,0), (-1,-1), "TOP"), ("GRID", (0,0), (-1,-1), 0.35, HexColor("#D0D5DD")),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]
    if header:
        commands += [("BACKGROUND", (0,0), (-1,0), NAVY), ("TEXTCOLOR", (0,0), (-1,0), colors.white)]
    for row in range(1 if header else 0, len(data)):
        if row % 2 == 0:
            commands.append(("BACKGROUND", (0,row), (-1,row), LIGHT))
    t.setStyle(TableStyle(commands))
    return t


CHAPTERS = [
    ("1. Démarrage, installation et connexion", "mobile-mon-espace.png", [
        ("Installer l'application sur téléphone ou ordinateur", [
            "Ouvrez l'adresse sécurisée de Liria Gestion Pro dans Safari, Chrome ou Edge.",
            "Sur iPhone, utilisez Partager puis Sur l'écran d'accueil. Sur Android ou ordinateur, choisissez Installer l'application.",
            "Ouvrez ensuite l'icône Liria Gestion Pro. La session reste connectée jusqu'à déconnexion, révocation ou expiration de sécurité.",
            "N'utilisez jamais un compte partagé hors du compte Dépôt prévu pour la borne de stock.",
        ]),
        ("Créer ou rejoindre une entreprise", [
            "Après inscription, choisissez Créer une entreprise si vous êtes le dirigeant ou Rejoindre une entreprise si un administrateur vous a remis un code.",
            "Pour un salarié préparé à l'avance, utilisez son numéro d'inscription ou le lien d'invitation reçu.",
            "Définissez votre mot de passe personnel. Il ne doit être transmis à personne, y compris à l'administrateur.",
            "L'administrateur active ensuite le compte, affecte le poste et contrôle les permissions.",
        ]),
    ]),
    ("2. Utilisateurs, postes, droits et confidentialité", "desktop-mon-espace.png", [
        ("Créer une fiche salarié et son accès", [
            "Ouvrez Équipe et temps, puis Employés et Nouveau salarié.",
            "Saisissez l'identité, la fonction, la date d'entrée, le coût horaire si vous êtes autorisé, puis le poste.",
            "Préparez la Carte BTP interne, les habilitations et leurs dates d'échéance.",
            "Envoyez l'invitation. La liste des employés indique invitation envoyée, installation, dernière connexion, poste et droits.",
            "Mettez le compte en pause ou fermez-le lors d'un départ. Un compte en pause reste facturable selon l'offre commerciale.",
        ]),
        ("Séparer Consulter et Gérer", [
            "Dans Paramètres, Accès et rôles, sélectionnez un poste.",
            "Accordez Consulter pour lire un module sans pouvoir modifier, supprimer, valider ou commander.",
            "Accordez Gérer uniquement aux postes responsables. Les actions personnelles restent toujours au nom du compte connecté.",
            "Utilisez l'aperçu par poste pour contrôler la vue ordinateur et téléphone avant de remettre l'accès.",
            "Les modules non autorisés sont absents du menu, de l'accueil et des accès directs côté serveur.",
        ]),
    ]),
    ("3. Accueil, menu et widgets", "desktop-dashboard.png", [
        ("Organiser sa page d'accueil", [
            "Depuis le tableau de bord, cliquez sur Modifier les widgets.",
            "Cochez ou décochez Notifications, Raccourcis, Analyses, Indicateurs, Suivis, Alertes, Pointage et Planning.",
            "Dans Mes modules, cliquez sur Personnaliser pour masquer les raccourcis inutiles sur cet appareil.",
            "Les autorisations restent prioritaires : un widget financier ne peut pas rendre visibles des montants interdits.",
        ]),
        ("Utiliser le menu par dossiers", [
            "Dépliez Accueil, Clients et ventes, Chantiers et interventions, Équipe et temps, Achats et stock, Matériel, Pilotage ou Administration.",
            "Le dossier de la page active s'ouvre automatiquement. Sur mobile, ouvrez Menu puis choisissez le dossier.",
            "Utilisez la flèche Retour sur mobile pour revenir au niveau logique précédent sans perdre le contexte.",
        ]),
    ]),
    ("4. Clients et contacts", None, [
        ("Créer un client", [
            "Ouvrez Clients et cliquez sur Nouveau client.",
            "Choisissez particulier ou professionnel, puis renseignez identité, société, SIRET, adresses, téléphone et e-mail.",
            "Enregistrez. La fiche centralise chantiers, devis, factures, paiements et historique.",
            "Avant de créer un doublon, recherchez par nom, société, e-mail ou téléphone.",
        ]),
        ("Créer le client depuis un devis", [
            "Dans Nouveau devis, utilisez Nouveau client si la personne n'existe pas.",
            "Saisissez les coordonnées minimales et validez : la fiche client est créée et sélectionnée.",
            "Créez ensuite le chantier lié sans quitter le devis. Le client et le chantier restent réutilisables partout.",
        ]),
    ]),
    ("5. Chantiers, équipe, documents et tâches", "mobile-chantiers.png", [
        ("Créer et préparer un chantier", [
            "Ouvrez Chantiers puis Nouveau chantier, ou créez-le directement depuis un devis.",
            "Sélectionnez le client, saisissez nom, adresse, dates, description et statut initial.",
            "Affectez ouvriers, chef d'équipe, chef de chantier et conducteur de travaux avec leurs périodes.",
            "Ajoutez plans, photos et documents. Pour chaque fichier, choisissez l'audience autorisée.",
            "Imprimez le QR chantier pour les usages terrain, stock et identification.",
        ]),
        ("Suivre les travaux", [
            "La fiche affiche avancement financier, heures planifiées, heures validées, tâches et équipe.",
            "Lorsqu'un devis est accepté, ses lignes deviennent automatiquement des tâches sans prix pour l'équipe affectée.",
            "Les salariés voient Mes travaux uniquement sur leurs chantiers, avec désignations et descriptions mais aucun prix interdit.",
            "Consultez le détail des jours et heures par salarié pour analyser l'effort réel du chantier.",
        ]),
    ]),
    ("6. Planning des équipes", "desktop-planning.png", [
        ("Planifier une activité", [
            "Ouvrez Planning et choisissez la semaine.",
            "Ajoutez une activité avec salarié, date, nombre d'heures, tâche et type de lieu.",
            "Pour un chantier, sélectionnez le chantier. Pour bureau, dépôt, visite médicale, formation ou autre, utilisez le type correspondant.",
            "Enregistrez puis vérifiez la ligne dans le tableau ouvriers par jours et dans la vue mobile jour par jour.",
            "Partagez le planning hebdomadaire par le moyen autorisé par l'entreprise.",
        ]),
        ("Lire les écarts", [
            "Les heures prévues servent de référence au pointage réel.",
            "Les horaires normaux par jour se règlent dans Paramètres, par exemple 8 h 30 du lundi au jeudi et 5 h le vendredi.",
            "Les écarts, heures supplémentaires et pointages incomplets remontent au responsable pour validation.",
        ]),
    ]),
    ("7. Pointage GPS et validation", "mobile-pointage.png", [
        ("Pointer son arrivée", [
            "Ouvrez Pointage. L'application propose en premier le chantier du jour, puis les chantiers assignés et enfin les autres chantiers actifs autorisés.",
            "Choisissez le chantier et la tâche. Autorisez la localisation GPS lorsque le téléphone la demande.",
            "Attendez l'indication GPS prêt, puis validez l'arrivée. La date et l'heure proviennent du serveur.",
            "Le pointage est enregistré uniquement au nom du salarié connecté.",
        ]),
        ("Pointer le départ et traiter les anomalies", [
            "À la fin, ouvrez la session active, ajoutez si besoin un commentaire et validez le départ avec GPS.",
            "Si une arrivée ou un départ a été oublié, créez un pointage oublié : il est accepté comme demande mais placé en vérification.",
            "Au-delà de 12 heures, le contrôle est renforcé. À partir de 15 heures, une alerte critique est envoyée au responsable.",
            "Le responsable corrige si nécessaire puis valide. Les heures validées alimentent chantier, rentabilité et comparaison planning.",
        ]),
    ]),
    ("8. Prestations, ouvrages, métrés et bibliothèques", None, [
        ("Créer une prestation réutilisable", [
            "Ouvrez Prestations puis Nouvelle prestation.",
            "Saisissez désignation, description, type, unité, prix unitaire HT et TVA.",
            "Activez la prestation. Elle devient disponible dans le sélecteur de lignes du devis.",
            "Désactivez une prestation obsolète plutôt que de supprimer un historique utile.",
        ]),
        ("Utiliser modèles et métrés", [
            "Dans Ouvrages et métrés, créez un modèle chiffré pour un ensemble de travaux récurrents.",
            "Ajoutez les lignes nécessaires avec quantités, unités, achats, main-d'œuvre et TVA.",
            "Créez un métré à partir des longueurs, largeurs, hauteurs, nombres et déductions.",
            "Contrôlez le résultat avant de l'insérer dans le chiffrage. Les données suggérées restent modifiables.",
        ]),
    ]),
    ("9. Devis de A à Z", "mobile-devis-nouveau.png", [
        ("Créer le devis", [
            "Ouvrez Devis puis Nouveau devis.",
            "Sélectionnez ou créez le client, puis sélectionnez ou créez le chantier.",
            "Renseignez date d'émission, validité, référence client et notes.",
            "Insérez une prestation ou ajoutez une ligne manuelle. Vérifiez désignation, description, type, quantité, unité, prix HT, remise et TVA.",
            "Contrôlez les totaux HT, TVA et TTC calculés automatiquement, puis enregistrez le brouillon.",
        ]),
        ("Envoyer, accepter ou refuser", [
            "Ouvrez la fiche du devis et contrôlez l'aperçu PDF.",
            "Utilisez Envoyer. Si l'envoi automatique n'est pas configuré, la messagerie s'ouvre avec un texte correctement encodé ; joignez le PDF si nécessaire.",
            "Passez le statut à Envoyé après l'envoi effectif. Lors de l'accord du client, passez à Accepté.",
            "L'acceptation synchronise le chantier et crée les tâches terrain à partir des lignes, sans exposer les prix aux ouvriers.",
            "Dupliquez un devis pour créer une variante sans modifier l'original.",
        ]),
    ]),
    ("10. Factures, acomptes, avoirs, situations et DGD", None, [
        ("Facturer un devis", [
            "Depuis un devis accepté, choisissez Créer une facture.",
            "Sélectionnez facture finale, acompte ou situation selon le cas.",
            "Pour une situation, saisissez l'avancement, la retenue de garantie et les observations.",
            "Contrôlez l'échéance, les lignes, la TVA et le total avant émission.",
            "Un avoir doit être relié au document d'origine et ne doit jamais effacer la trace de la facture initiale.",
        ]),
        ("Enregistrer un règlement", [
            "Ouvrez la facture et ajoutez le paiement avec date, montant, moyen et référence.",
            "Un paiement partiel place la facture en Partiellement payée ; le solde à encaisser est recalculé.",
            "Quand le cumul atteint le TTC, la facture devient Payée et la trésorerie est mise à jour.",
            "Une personne autorisée peut supprimer un paiement validé par erreur ; l'opération doit rester traçable.",
        ]),
    ]),
    ("11. PDF, e-mail, modèles d'impression", None, [
        ("Configurer les modèles", [
            "Ouvrez Paramètres puis Personnalisation des documents.",
            "Choisissez Classique, Moderne, Élégant, Technique, Compact ou Épuré.",
            "Réglez police, taille, couleur principale, couleur d'accent, largeur et position du logo.",
            "Choisissez d'afficher ou non le logo, les descriptions et la TVA sur chaque ligne.",
            "Ajoutez les textes d'en-tête et de pied de page, puis enregistrez et contrôlez un devis test.",
        ]),
        ("Télécharger et envoyer", [
            "Utilisez Télécharger PDF sur le devis, la facture ou la commande.",
            "Vérifiez le numéro, le client, les dates, les mentions légales, les montants et la lisibilité avant envoi.",
            "Ajoutez les destinataires en copie si nécessaire. L'historique automatique exige un service d'envoi configuré.",
            "Ne marquez jamais un document Envoyé si la messagerie a été fermée sans expédition.",
        ]),
    ]),
    ("12. Fournisseurs, comptes et tarifs négociés", None, [
        ("Ajouter n'importe quel fournisseur", [
            "Ouvrez Administration puis Connecteurs.",
            "Choisissez un fournisseur connu ou la zone Ajouter n'importe quel fournisseur.",
            "Sélectionnez une fiche existante ou saisissez le nom pour la créer automatiquement.",
            "Ajoutez le numéro de compte client, l'adresse HTTPS du portail et le mode d'échange proposé.",
            "N'entrez jamais le mot de passe du portail dans Liria Gestion Pro.",
        ]),
        ("Importer ou synchroniser les prix", [
            "Pour un CSV, Excel ou FAB-DIS, ouvrez Importer un tarif négocié et sélectionnez le fournisseur.",
            "Mappez référence, EAN, désignation, unité, prix public, prix négocié, disponibilité et validité.",
            "Contrôlez l'aperçu puis importez. Les références existantes sont mises à jour sans doublon.",
            "Pour API, EDI, PunchOut ou OAuth, demandez au fournisseur les paramètres officiels. Le statut reste À finaliser tant que l'échange n'est pas activé.",
            "Les tarifs négociés peuvent ensuite alimenter catalogue, stock, achats et préparation des devis selon les droits.",
        ]),
    ]),
    ("13. Commandes et réceptions fournisseurs", None, [
        ("Créer et envoyer une commande", [
            "Ouvrez Achats et stock, Commandes, puis Nouvelle commande.",
            "Sélectionnez fournisseur et chantier, ajoutez les lignes, quantités, prix et date souhaitée.",
            "Contrôlez le PDF, envoyez la commande puis passez le statut à Envoyée uniquement après expédition.",
            "Toute commande créée reste au nom de l'utilisateur connecté ; on ne commande pas au nom d'un collègue.",
        ]),
        ("Réception totale ou partielle", [
            "Ouvrez la commande au moment de la livraison.",
            "Pour chaque ligne, saisissez la quantité reçue. Le reliquat est calculé automatiquement.",
            "Si tout est reçu, validez Reçue. Sinon, validez Reçue partiellement et ajoutez le message sur les manquants.",
            "Les quantités reçues alimentent les entrées de stock lorsque l'article est relié au catalogue.",
            "Conservez le bon de livraison et rattachez la facture fournisseur.",
        ]),
    ]),
    ("14. Factures fournisseurs, dépenses et charges", None, [
        ("Numériser une facture fournisseur", [
            "Ouvrez Factures fournisseurs et créez la dépense.",
            "Importez le PDF ou la photo originale, sans remplacer une facture électronique par une capture d'écran.",
            "Renseignez fournisseur, date, HT, TVA, TTC, chantier, employé, véhicule ou outil concerné.",
            "Enregistrez le paiement seulement lorsqu'il est réellement effectué.",
            "Utilisez les charges récurrentes pour loyers, abonnements, assurances et autres échéances régulières.",
        ]),
    ]),
    ("15. Notes de frais et archivage des justificatifs", "mobile-notes-frais.png", [
        ("Créer sa propre note", [
            "Ouvrez Notes de frais puis Nouvelle dépense.",
            "Photographiez le justificatif entier, net et en couleurs, ou importez PDF, JPG, PNG ou HEIC.",
            "Saisissez fournisseur, catégorie, type de justificatif, date, chantier, moyen de paiement et commentaire.",
            "Saisissez TTC et taux de TVA ou HT et TVA : les montants cohérents sont calculés automatiquement.",
            "Soumettez la note. Le salarié ne peut valider, refuser, exporter ou agir sur la note d'une autre personne.",
        ]),
        ("Contrôler et archiver", [
            "Le responsable vérifie l'original, les montants, le chantier et les alertes de doublon.",
            "Il valide, refuse avec motif ou demande une correction avec message. Le salarié reçoit une notification.",
            "Le comptable ajoute la référence comptable, télécharge l'original et crée l'export autorisé.",
            "Le verrouillage interdit le remplacement silencieux ; une correction ultérieure crée une nouvelle version et une trace d'audit.",
            "En stockage simple, conservez l'original papier jusqu'à confirmation de la politique interne. Ne présentez pas le système comme une valeur probante sans validation juridique.",
        ]),
    ]),
    ("16. Stock, articles, imports et inventaires", None, [
        ("Créer ou importer les articles", [
            "Ouvrez Articles et stock. Créez une référence avec désignation, unité, marque, emplacement, seuil, achat HT, revente HT, EAN et teintes.",
            "Pour un fichier fournisseur ou inventaire, importez Excel, CSV ou PDF puis vérifiez le mapping.",
            "Un import catalogue ne modifie pas les quantités ; un import inventaire ajuste les quantités après validation.",
            "Les nuanciers permettent de sélectionner une teinte précise sur les produits concernés.",
        ]),
        ("Entrées, sorties et inventaire annuel", [
            "Pour chaque mouvement, choisissez article, teinte, quantité, chantier et motif.",
            "Une sortie doit être attribuée au salarié identifié et au chantier destinataire.",
            "Comparez stock théorique et comptage réel dans Inventaires, puis validez les corrections.",
            "Exportez la valorisation et l'historique pour la clôture comptable, avec les justificatifs associés.",
        ]),
    ]),
    ("17. Borne dépôt, QR codes et scanner", "mobile-stock-borne.png", [
        ("Utiliser le compte Dépôt", [
            "Le terminal du dépôt reste connecté avec son compte dédié et n'affiche que Stock, Borne et Dépôt.",
            "Le salarié scanne son QR ou saisit son identifiant, puis son mot de passe stock personnel.",
            "Il scanne article, outil, véhicule, chantier ou camionnette et choisit entrée ou sortie selon ses droits.",
            "Le mouvement est attribué au salarié réellement identifié, jamais au compte partagé.",
            "Après l'opération, la borne revient à l'identification du salarié suivant.",
        ]),
    ]),
    ("18. Outillage", None, [
        ("Affecter et suivre un outil", [
            "Créez l'outil avec marque, modèle, référence, numéro de série, facture et QR code.",
            "Affectez-le à un salarié, un véhicule ou un chantier en conservant l'historique.",
            "Planifiez vérifications et entretiens. Une alerte est envoyée avant échéance.",
            "Au statut Hors service, l'outil n'est plus disponible. Placez-le En réparation ou Au rebut selon la décision.",
            "Un outil mis au rebut reste dans l'historique et l'inventaire des sorties d'actifs.",
        ]),
    ]),
    ("19. Flotte automobile", None, [
        ("Gérer un véhicule", [
            "Créez le véhicule avec immatriculation, marque, modèle, kilométrage, assurances, contrôle technique et QR code.",
            "Affectez-le à un salarié et conservez les dates de début et de fin d'affectation.",
            "Importez chaque facture dans la fiche véhicule et détaillez entretien, panne, pneus ou réparation.",
            "Ajoutez les relevés kilométriques. Les prochaines échéances sont recalculées selon date et kilométrage.",
            "Reliez une dépense au chantier lorsqu'elle a été engagée pour une intervention précise.",
        ]),
    ]),
    ("20. Congés et absences", None, [
        ("Faire une demande", [
            "Ouvrez Congés puis Nouvelle demande.",
            "Choisissez le type, les dates et ajoutez un commentaire ou justificatif si nécessaire.",
            "La demande est envoyée immédiatement, sans brouillon ni seconde soumission.",
            "Le responsable reçoit la notification, accepte ou refuse avec un message.",
            "La décision est notifiée au salarié et doit être prise en compte dans le planning.",
        ]),
    ]),
    ("21. Interventions et contrats d'entretien", None, [
        ("Créer un contrat et un bon de travail", [
            "Créez le contrat avec client, chantier, période, fréquence, montant, TVA et prochaine intervention.",
            "Planifiez l'intervention, affectez le technicien et précisez priorité, objet, durée et consignes.",
            "Le technicien consulte son travail, ajoute photos, compte rendu et temps passé.",
            "Validez l'intervention puis générez le bon de travail ou la facturation prévue.",
            "La récurrence avancée et l'envoi automatique nécessitent une configuration opérationnelle adaptée.",
        ]),
    ]),
    ("22. CRM, tâches, appels et relances", None, [
        ("Suivre la relation client", [
            "Dans CRM et relances, enregistrez appel, e-mail, rendez-vous, objet et compte rendu.",
            "Ajoutez une date de rappel. L'action apparaît dans le journal et les alertes autorisées.",
            "Programmez les relances d'impayés avec niveau, date, canal, destinataire et message.",
            "Tant qu'un service e-mail ou SMS n'est pas configuré, la relance reste préparée et doit être envoyée par l'utilisateur.",
        ]),
    ]),
    ("23. Rentabilité, trésorerie et analyses", None, [
        ("Lire les indicateurs", [
            "La rentabilité compare devis accepté, achats, dépenses, heures valorisées et facturation.",
            "La trésorerie suit facturé, encaissé, reste à encaisser, fournisseurs et échéances.",
            "Filtrez par période, chantier, client ou statut avant de tirer une conclusion.",
            "Seuls les comptes autorisés voient les prix, marges et chiffres globaux.",
            "Contrôlez les pièces sources avant toute décision comptable ou financière.",
        ]),
    ]),
    ("24. Exports comptables et sauvegarde", None, [
        ("Préparer l'expert-comptable", [
            "Ouvrez Exports comptables et choisissez période, salarié, chantier, fournisseur, catégorie et statut.",
            "Générez l'export : tableau récapitulatif, justificatifs originaux, manifeste et empreintes selon le module.",
            "Vérifiez le nombre de documents, les totaux et les anomalies avant transmission.",
            "Marquez comme exporté uniquement après remise effective au comptable.",
            "Les données applicatives sont sauvegardées par l'infrastructure ; l'entreprise doit aussi définir une procédure de restauration et d'export régulier.",
        ]),
    ]),
    ("25. Paramètres de l'entreprise", None, [
        ("Configurer identité et règles", [
            "Renseignez raison sociale, SIRET, adresse, assurances, mentions, logo et pénalités.",
            "Choisissez le format d'identifiant salarié interne ou préfixe et quatre chiffres.",
            "Configurez les horaires normaux de chaque jour et le seuil d'écart de pointage.",
            "Définissez les catégories de frais, conservation documentaire et options de documents selon vos droits.",
            "Testez les changements sur un document brouillon avant usage réel.",
        ]),
    ]),
    ("26. Plateforme, abonnements et comptes", None, [
        ("Administrer les entreprises clientes", [
            "Le propriétaire de la plateforme peut créer une entreprise, consulter son offre, ses comptes facturables et son état d'abonnement.",
            "Le calcul utilise l'abonnement de base et les comptes supplémentaires selon les postes et règles commerciales.",
            "Un impayé déclenche un avertissement et un compte à rebours de dix jours avant suspension automatique.",
            "L'accès exceptionnel à une entreprise exige un motif, reste limité dans le temps et est journalisé.",
            "Le super-administrateur ne doit pas consulter les justificatifs clients par défaut.",
        ]),
    ]),
]


SYNC_ROWS = [
    ["Déclencheur", "Synchronisation automatique", "Contrôle humain attendu"],
    ["Devis accepté", "Chantier mis à jour et tâches créées depuis les lignes, sans prix pour le terrain.", "Vérifier équipe, planning, quantités et documents."],
    ["Facture créée", "Rattachement client/chantier/devis, échéance et montants disponibles dans facturation et pilotage.", "Contrôler mentions, TVA et PDF avant émission."],
    ["Paiement enregistré", "Montant payé, solde, statut facture et trésorerie recalculés.", "Vérifier banque, date, référence et montant."],
    ["Affectation planning", "Activité visible sur planning personnel et tableau d'équipe.", "Confirmer salarié, lieu, date, tâche et durée."],
    ["Pointage validé", "Heures réalisées vers chantier, comparaison planning et rentabilité.", "Responsable valide écarts et anomalies GPS/durée."],
    ["Congé demandé", "Notification au responsable, puis décision visible par le salarié et à prendre en compte au planning.", "Accepter/refuser et vérifier les conflits."],
    ["Note de frais soumise", "Notification, workflow, audit et export après validation.", "Contrôler original, montants, doublons et chantier."],
    ["Réception commande", "Reliquat recalculé et entrée stock possible pour les articles reliés.", "Saisir exactement reçu/manquant et conserver le bon."],
    ["Dépense fournisseur", "Rattachement chantier/salarié/véhicule/outil et pilotage si autorisé.", "Contrôler facture, imputation et paiement."],
    ["Outil hors service", "Indisponible pour une nouvelle affectation et alerte gestionnaire.", "Décider réparation ou rebut."],
    ["Tarif fournisseur importé", "Catalogue négocié actualisé sans doublon de référence.", "Vérifier validité, unité, TVA et conditions."],
    ["Droits modifiés", "Menu, widgets, pages et actions recalculés selon le poste.", "Tester avec Aperçu du poste puis un compte réel."],
]

ROLE_ROWS = [
    ["Profil", "Routine recommandée", "Actions interdites sans droit"],
    ["Ouvrier", "Consulter planning et travaux, pointer, photos, frais et congés personnels.", "Prix, chiffres globaux, pointage/commande au nom d'autrui."],
    ["Chef d'équipe", "Planning équipe autorisée, suivi terrain, validation selon délégation.", "Actions hors périmètre ou documents financiers non autorisés."],
    ["Conducteur", "Préparer chantiers, équipes, planning, achats et contrôles.", "Comptabilité ou administration sans permission explicite."],
    ["Comptable", "Factures, paiements, dépenses, frais validés, exports et références.", "Pointage personnel d'autrui ou gestion terrain non attribuée."],
    ["Administrateur", "Identité, postes, droits, utilisateurs, paramètres et pilotage.", "Usurper une action personnelle ou contourner l'audit."],
    ["Compte dépôt", "Entrées/sorties après identification du salarié.", "Navigation hors Stock/Borne/Dépôt."],
]

OPERATION_CARDS = [
    ("Préparer et inviter un salarié", "Administrateur ou gestionnaire des employés", "Identité du salarié, poste créé, e-mail ou numéro d'inscription disponible", [
        "Créer la fiche dans Employés avec fonction, date d'entrée et poste.", "Ajouter la photo, les habilitations, la Carte BTP et leurs échéances.",
        "Contrôler le poste dans Accès et rôles, puis utiliser Aperçu du poste.", "Envoyer l'invitation ou remettre le numéro d'inscription par un canal sûr.",
        "Après la première connexion, vérifier installation, dernière connexion et compte actif dans la liste.",
    ], "Le compte rejoint l'entreprise, reçoit uniquement les modules de son poste et reste relié à sa fiche salarié.", "Ne jamais envoyer un mot de passe ; mettre en pause ou fermer le compte lors d'un départ."),
    ("Modifier les droits d'un poste", "Administrateur entreprise", "Liste des responsabilités validée par la direction", [
        "Ouvrir Paramètres, Accès et rôles et sélectionner le poste.", "Distinguer chaque droit Consulter, Gérer, Valider et Personnel.",
        "Retirer tout droit non indispensable, surtout chiffres, paiements, exports et administration.", "Enregistrer puis ouvrir l'aperçu ordinateur et mobile.",
        "Tester avec un vrai compte du poste avant généralisation.",
    ], "Le menu, les widgets, les pages et les actions sont recalculés après actualisation.", "Un droit de gestion ne permet jamais de pointer, commander ou déposer un frais au nom d'autrui."),
    ("Créer client et chantier depuis un devis", "Commercial ou administrateur autorisé", "Coordonnées client et informations minimales du chantier", [
        "Ouvrir Nouveau devis et cliquer Nouveau client.", "Saisir identité, société, e-mail, téléphone et adresse puis enregistrer.",
        "Ouvrir Nouveau chantier dans le même écran, saisir nom, adresse et description.", "Vérifier que client et chantier nouvellement créés sont sélectionnés.",
        "Continuer le devis et contrôler les fiches créées après enregistrement.",
    ], "Le client et le chantier deviennent disponibles dans les listes et pour les futurs documents.", "Rechercher avant création afin d'éviter les doublons de clients ou de chantiers."),
    ("Accepter un devis et préparer le terrain", "Commercial, conducteur ou administrateur autorisé", "Devis réellement accepté par le client et chantier rattaché", [
        "Ouvrir le devis envoyé et vérifier le document accepté.", "Passer au statut Accepté avec la date ou la preuve prévue par l'entreprise.",
        "Ouvrir le chantier et contrôler l'état, les tâches créées et les quantités.", "Affecter l'équipe permanente et préparer le planning.",
        "Rendre visibles les plans et documents aux bonnes audiences seulement.",
    ], "Chaque ligne du devis devient une tâche chantier sans prix pour les comptes terrain.", "Ne pas accepter un brouillon ou un devis non transmis ; ne jamais exposer les prix à un poste non autorisé."),
    ("Créer une facture et enregistrer le paiement", "Facturation ou comptabilité", "Devis accepté ou base de facturation validée", [
        "Créer la facture finale, l'acompte ou la situation appropriée.", "Vérifier client, chantier, dates, lignes, TVA, retenue et échéance.",
        "Émettre et envoyer le PDF, puis marquer Envoyée après l'expédition réelle.", "À réception bancaire, ajouter le paiement avec montant, date, moyen et référence.",
        "Contrôler le statut, le solde et la trésorerie recalculés.",
    ], "Le paiement met à jour montant payé, statut, reste à encaisser et indicateurs autorisés.", "Ne jamais anticiper un encaissement ; corriger un paiement erroné uniquement avec une personne autorisée."),
    ("Planifier et pointer une journée chantier", "Responsable planning puis salarié concerné", "Salarié actif, chantier actif, GPS autorisé", [
        "Le responsable crée l'affectation avec date, heures et tâche.", "Le salarié consulte son planning puis choisit le chantier proposé dans Pointage.",
        "Il attend GPS prêt et valide l'arrivée.", "À la fin, il ouvre sa session active, ajoute si besoin un commentaire et pointe le départ.",
        "Le responsable vérifie ensuite durée, écart et localisation avant validation.",
    ], "La validation alimente heures chantier, comparaison planning et rentabilité.", "Ne jamais sélectionner un collègue ; signaler les oublis au lieu de créer une fausse position ou une fausse heure."),
    ("Valider un pointage anormal", "Responsable ayant le droit de validation", "Pointage soumis, planning et explication disponibles", [
        "Filtrer les pointages En attente ou En vérification.", "Comparer arrivée, départ, GPS, chantier, planning et horaires normaux.",
        "Demander une explication lorsque l'écart dépasse le seuil.", "Corriger uniquement les champs autorisés en conservant la trace.",
        "Valider ou rejeter avec motif puis contrôler la notification au salarié.",
    ], "Seules les heures validées entrent dans les cumuls chantier et le pilotage.", "Au-delà de 12 h, renforcer le contrôle ; à partir de 15 h, traiter l'alerte critique avant validation."),
    ("Créer et faire valider une note de frais", "Salarié puis responsable/comptable", "Justificatif original lisible et dépense professionnelle", [
        "Photographier ou importer le fichier original complet.", "Renseigner fournisseur, date, catégorie, chantier, moyen de paiement et commentaire.",
        "Saisir les montants et contrôler HT + TVA = TTC.", "Soumettre ; le responsable valide, refuse ou demande une correction.",
        "Après validation, le comptable référence, exporte puis verrouille selon la procédure.",
    ], "Notifications, audit, statut d'export et conservation sont mis à jour sans modifier l'original.", "Un reçu de carte seul est insuffisant ; joindre aussi facture ou ticket. Conserver le papier selon la politique interne."),
    ("Numériser une facture fournisseur", "Achats ou comptabilité", "Facture originale et fournisseur existant ou à créer", [
        "Créer la dépense fournisseur et importer le PDF ou l'image originale.", "Saisir numéro, date, échéance, HT, TVA, TTC et moyen de paiement.",
        "Rattacher chantier, salarié, véhicule ou outil si la dépense les concerne.", "Ajouter la pièce à la bonne fiche d'actif lorsque nécessaire.",
        "Après paiement réel, enregistrer le règlement et contrôler le statut.",
    ], "La dépense devient consultable depuis achats et depuis les actifs rattachés selon les permissions.", "Ne pas mélanger note personnelle et facture fournisseur ; ne pas supprimer une pièce déjà nécessaire à l'audit."),
    ("Créer une commande et réceptionner partiellement", "Acheteur ou responsable stock", "Fournisseur, chantier et besoins validés", [
        "Créer la commande et ajouter toutes les lignes avec quantités et prix.", "Générer le PDF, l'envoyer et marquer Envoyée après confirmation.",
        "À la livraison, saisir la quantité reçue sur chaque ligne.", "Valider Reçue partiellement et écrire précisément reçus, manquants et reliquat.",
        "À la livraison finale, compléter les quantités puis passer à Reçue.",
    ], "Les reliquats et, si reliés, les entrées de stock reflètent les quantités réellement reçues.", "Ne jamais valider la totalité par défaut ; conserver bon de livraison et éventuelles réserves."),
    ("Ajouter un fournisseur libre et ses tarifs", "Gestionnaire achats ou administrateur", "Compte professionnel ouvert chez le fournisseur", [
        "Ouvrir Connecteurs et la zone Ajouter n'importe quel fournisseur.", "Sélectionner la fiche existante ou saisir le nom pour la créer.",
        "Renseigner numéro client, portail HTTPS et mode d'échange.", "Importer le fichier de tarifs ou remettre les paramètres officiels à l'intégrateur.",
        "Contrôler prix public, prix négocié, unité, validité et disponibilité après import.",
    ], "Les tarifs négociés sont centralisés et actualisables sans doublon par référence fournisseur.", "Le portail et le numéro client ne suffisent pas à une synchro automatique ; ne jamais enregistrer le mot de passe."),
    ("Faire une sortie sur la borne dépôt", "Tout salarié autorisé à sortir du stock", "Compte dépôt connecté, mot de passe stock personnel créé", [
        "Ouvrir Borne stock et scanner le QR salarié ou saisir l'identifiant.", "Saisir le mot de passe stock personnel.",
        "Scanner l'article puis vérifier référence et teinte.", "Choisir Sortie, quantité et chantier obligatoire, puis valider.",
        "Lire la confirmation et vérifier le stock restant avant de quitter la borne.",
    ], "Le mouvement est attribué au salarié identifié et au chantier sélectionné.", "Le compte Dépôt ne doit jamais quitter son périmètre ; chaque salarié doit s'identifier pour chaque opération."),
    ("Réaliser un inventaire", "Responsable stock", "Périmètre et date d'inventaire définis", [
        "Créer l'inventaire et figer la liste de comptage selon la procédure interne.", "Compter physiquement chaque article, teinte, lot ou emplacement.",
        "Saisir les quantités sans masquer les écarts.", "Faire contrôler les écarts importants et documenter leur motif.",
        "Valider les ajustements puis exporter valorisation et journal des corrections.",
    ], "Le stock théorique est ajusté avec un historique exploitable pour la clôture.", "Éviter les mouvements pendant le comptage ou les consigner précisément."),
    ("Mettre un outil hors service", "Gestionnaire outillage", "Anomalie constatée et outil identifié", [
        "Ouvrir la fiche de l'outil et ajouter le constat, la photo et la date.", "Passer Hors service : l'outil devient immédiatement indisponible.",
        "Créer l'action de réparation et rattacher devis ou facture.", "Après diagnostic, remettre Disponible ou valider Mise au rebut.",
        "Contrôler l'affectation et informer le salarié concerné.",
    ], "La disponibilité, les alertes et l'historique d'entretien sont mis à jour.", "Ne pas remettre disponible un matériel non contrôlé ; ne pas supprimer l'actif mis au rebut."),
    ("Affecter un véhicule et enregistrer une réparation", "Gestionnaire flotte", "Véhicule et salarié actifs", [
        "Ouvrir le véhicule et créer l'affectation avec date de début.", "Ajouter le relevé kilométrique initial.",
        "Importer la facture de réparation dans la fiche véhicule.", "Détailler les travaux, date, kilométrage, fournisseur et prochaine échéance.",
        "Contrôler les alertes entretien, assurance et contrôle technique.",
    ], "La fiche véhicule consolide conducteur, factures, travaux et échéances.", "Clôturer l'ancienne affectation avant d'en créer une nouvelle si le véhicule change de salarié."),
    ("Faire et traiter une demande de congé", "Salarié puis responsable congés", "Dates et motif connus", [
        "Créer la demande avec type, dates et commentaire.", "Valider : la demande part immédiatement au responsable.",
        "Le responsable vérifie conflits de planning et solde selon la procédure RH.", "Il accepte ou refuse avec un message explicite.",
        "Le salarié contrôle sa notification et le planning est adapté par la personne responsable.",
    ], "La décision est historisée et communiquée au salarié.", "Ne pas créer de brouillon puis oublier de soumettre : la création est déjà l'envoi."),
    ("Exporter les justificatifs au comptable", "Comptable ou administrateur habilité", "Période clôturée et dépenses validées", [
        "Choisir période, salarié, chantier, fournisseur, catégorie et statut.", "Générer le ZIP et attendre la confirmation complète.",
        "Vérifier CSV/XLSX, originaux, manifeste, empreintes et historique.", "Comparer nombre de lignes, nombre de fichiers et totaux.",
        "Transmettre par le canal convenu puis marquer Exporté.",
    ], "Les pièces sélectionnées reçoivent leur statut d'export sans être supprimées.", "Ne pas exporter des brouillons, documents refusés ou fichiers dont l'intégrité est en anomalie."),
    ("Changer le modèle de devis et facture", "Administrateur des paramètres", "Logo et charte graphique validés", [
        "Ouvrir Paramètres, Personnalisation des documents.", "Choisir un des six modèles puis régler police, tailles et deux couleurs.",
        "Positionner ou masquer le logo, puis choisir descriptions et TVA par ligne.", "Enregistrer et ouvrir l'impression d'un devis brouillon varié.",
        "Contrôler aussi une facture longue avant mise en production.",
    ], "Tous les nouveaux rendus utilisent les réglages d'entreprise, sans modifier les montants ni données sources.", "Toujours tester les retours à la ligne, un grand logo, plusieurs TVA et plusieurs pages."),
    ("Traiter un impayé d'abonnement", "Propriétaire de la plateforme", "Échéance et absence de règlement vérifiées", [
        "Ouvrir Plateforme et l'entreprise concernée.", "Signaler l'impayé : un avertissement et le délai de dix jours démarrent.",
        "Suivre le compte à rebours et les échanges sans accéder aux documents clients.", "Si le règlement arrive, utiliser Règlement reçu pour annuler la suspension.",
        "À défaut, contrôler la suspension automatique à l'échéance.",
    ], "L'état d'abonnement contrôle l'accès de l'entreprise sans supprimer ses données.", "Vérifier l'identité du client et le règlement avant toute suspension ou réactivation."),
]


def build_story():
    story = []
    story += [Spacer(1, 1.0*cm)]
    if LOGO.exists():
        story.append(Image(str(LOGO), width=6.8*cm, height=6.8*cm))
    story += [Spacer(1, 0.6*cm), Paragraph("GUIDE UTILISATEUR DÉTAILLÉ", ParagraphStyle(
        "CoverTitle", fontName=BOLD_FONT, fontSize=25, leading=30, textColor=NAVY, alignment=TA_CENTER)),
        Spacer(1, 0.35*cm), Paragraph("Liria Gestion Pro", ParagraphStyle(
        "CoverBrand", fontName=BOLD_FONT, fontSize=28, leading=32, textColor=BLUE, alignment=TA_CENTER)),
        Spacer(1, 0.35*cm), Paragraph("Gérer - Suivre - Piloter", ParagraphStyle(
        "CoverTag", fontName=BASE_FONT, fontSize=12, leading=16, textColor=GOLD, alignment=TA_CENTER)),
        Spacer(1, 1.0*cm), callout("Manuel complet", "Procédures pas à pas, captures ordinateur et mobile, droits par profil, synchronisations entre modules, contrôles et résolution des problèmes.", "info"),
        Spacer(1, 0.45*cm), p("Version du 15 juillet 2026. Les écrans affichés peuvent légèrement évoluer avec les mises à jour. Les permissions de votre poste déterminent toujours les modules et informations réellement visibles.", "Legende"),
        PageBreak()]

    story += [Paragraph("Comment utiliser ce guide", styles["Chapitre"]),
        p("Chaque chapitre décrit le chemin de menu, les étapes, le résultat attendu et les synchronisations déclenchées. Réalisez d'abord les opérations sur un brouillon ou une donnée de test lorsque l'action possède un effet financier, comptable ou terrain."),
        callout("Règle fondamentale", "Chaque salarié agit en son nom propre. Même avec des droits de gestion, il ne peut pas pointer, commander ou déposer un justificatif personnel au nom d'une autre personne.", "attention"),
        Spacer(1, 8), table(ROLE_ROWS, [2.6*cm, 8.3*cm, 6.3*cm]), PageBreak(),
        Paragraph("Sommaire", styles["Chapitre"])]
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle(name="TOC0", fontName=BOLD_FONT, fontSize=10, leading=14, leftIndent=0, textColor=NAVY, spaceBefore=4),
        ParagraphStyle(name="TOC1", fontName=BASE_FONT, fontSize=8, leading=11, leftIndent=16, textColor=MUTED),
    ]
    story += [toc, PageBreak()]

    for title, image_name, sections in CHAPTERS:
        story.append(Paragraph(title, styles["Chapitre"]))
        story.append(p("Chemin de menu et boutons disponibles selon les autorisations du poste. Les libellés peuvent être absents lorsqu'un administrateur a retiré l'accès au module."))
        if image_name:
            story.extend(screenshot(image_name, f"Exemple réel dans Liria Gestion Pro - {title.split('. ',1)[-1]}"))
        for section_title, section_steps in sections:
            story.append(Paragraph(section_title, styles["Section"]))
            story.append(steps(section_steps))
        story.append(callout("Contrôle avant de quitter", "Vérifiez le message de confirmation, le statut obtenu, les rattachements et les éventuelles notifications. Une page fermée avant validation n'enregistre pas forcément l'action.", "ok"))
        story.append(PageBreak())

    story.append(Paragraph("27. Fiches opérationnelles détaillées", styles["Chapitre"]))
    story.append(p("Ces fiches complètent les chapitres par un contrôle de bout en bout : responsable, prérequis, exécution, synchronisation obtenue et point de vigilance."))
    story.append(PageBreak())
    for title, role, prerequis, procedure, resultat, vigilance in OPERATION_CARDS:
        story += [Paragraph(title, styles["Section"]),
            table([["Responsable", role], ["Prérequis", prerequis]], [3.2*cm, 14*cm], header=False),
            Spacer(1, 7), Paragraph("Procédure complète", styles["SousSection"]), steps(procedure),
            callout("Résultat et synchronisation", resultat, "ok"), Spacer(1, 6),
            callout("Point de vigilance", vigilance, "attention"), PageBreak()]

    story += [Paragraph("28. Carte complète des synchronisations", styles["Chapitre"]),
        p("Une synchronisation signifie qu'une action validée dans un module met à jour un autre module. Elle ne remplace jamais le contrôle métier, la réception réelle d'un e-mail, la vérification bancaire ou la validation comptable."),
        table(SYNC_ROWS, [3.2*cm, 7.8*cm, 6.2*cm]), PageBreak(),
        Paragraph("29. Parcours quotidiens recommandés", styles["Chapitre"]),
        Paragraph("Ouvrier ou technicien", styles["Section"]), steps([
            "Consulter notifications, planning du jour et Mes travaux.", "Pointer l'arrivée avec GPS sur le bon chantier.",
            "Consulter tâches et documents autorisés, ajouter les photos nécessaires.", "Effectuer les mouvements de stock via la borne en s'identifiant personnellement.",
            "Pointer le départ, puis déposer frais ou congé uniquement pour soi.",
        ]),
        Paragraph("Chef d'équipe ou conducteur", styles["Section"]), steps([
            "Contrôler alertes, absences, planning et équipe affectée.", "Vérifier documents chantier, besoins, commandes et réceptions.",
            "Examiner pointages incomplets, écarts et durées anormales.", "Mettre à jour tâches, avancement et photos sans exposer les prix aux comptes terrain.",
            "Préparer le lendemain et partager le planning autorisé.",
        ]),
        Paragraph("Administration et comptabilité", styles["Section"]), steps([
            "Contrôler factures à émettre, règlements, impayés et échéances fournisseurs.", "Traiter notes de frais et justificatifs selon le workflow.",
            "Vérifier marges et trésorerie uniquement après rapprochement des sources.", "Créer les exports comptables, contrôler le manifeste et transmettre selon la procédure interne.",
            "Revoir comptes, postes, permissions, échéances et sauvegardes.",
        ]), PageBreak(),
        Paragraph("30. Dépannage et bonnes pratiques", styles["Chapitre"]),
        Paragraph("Si un bouton ou un module n'apparaît pas", styles["Section"]), bullets([
            "Vérifiez que vous êtes dans la bonne entreprise et avec le bon compte.", "Demandez à l'administrateur de contrôler le poste, Consulter/Gérer et les permissions personnelles.",
            "Fermez puis rouvrez le menu après modification des droits.", "N'essayez pas de contourner l'accès par une adresse directe : le serveur applique la même autorisation.",
        ]),
        Paragraph("Si le GPS, QR ou scanner ne fonctionne pas", styles["Section"]), bullets([
            "Autorisez caméra et localisation pour le site sécurisé.", "Nettoyez l'objectif, augmentez la lumière et placez le code entier dans le cadre.",
            "Utilisez la saisie manuelle autorisée si le code est abîmé.", "Pour un pointage, attendez GPS prêt et évitez les zones sans réception ; ne fabriquez jamais une position.",
        ]),
        Paragraph("Si un total est incohérent", styles["Section"]), bullets([
            "Vérifiez virgule/point, quantité, unité, remise et taux de TVA.", "Pour les frais, contrôlez que HT + TVA = TTC.",
            "Pour une facture, comparez devis, situations, acomptes, avoirs et paiements.", "N'altérez pas un document verrouillé : créez la correction ou la nouvelle version prévue.",
        ]),
        callout("Assistance", "Avant de contacter le support, notez la page, l'heure, le compte, l'action, le message affiché et joignez une capture ne contenant aucun mot de passe ni donnée bancaire complète.", "info"), PageBreak(),
        Paragraph("31. Limites, sécurité et conformité", styles["Chapitre"]),
        bullets([
            "Les mots de passe, secrets fournisseur, numéros complets de carte et cryptogrammes ne doivent jamais être saisis dans les commentaires ou pièces jointes.",
            "Une connexion fournisseur automatique n'est active qu'avec un accord et une interface officielle API, EDI, PunchOut ou OAuth. Un portail référencé n'est pas une synchronisation automatique.",
            "L'ouverture de la messagerie ne prouve pas l'envoi. L'envoi automatisé, la pièce jointe et l'historique nécessitent un service e-mail configuré.",
            "Le stockage renforcé des justificatifs ne doit pas être présenté comme une valeur probante ou un archivage fiscal conforme sans validation juridique, comptable et technique.",
            "La carte BTP affichée dans l'application est une copie numérique interne et ne remplace pas la Carte d'identification professionnelle délivrée par CIBTP France.",
            "Les décisions comptables, sociales, juridiques, fiscales et de sécurité chantier restent sous la responsabilité de professionnels habilités.",
        ]),
        callout("Fin du guide", "Conservez ce manuel avec la procédure interne de votre entreprise. Révisez-le lors d'un changement de droits, de workflow, de prestataire externe ou de règle comptable.", "ok")]
    return story


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    doc = GuideDoc(str(OUT))
    doc.multiBuild(build_story())
    copy2(OUT, PUBLIC)
    print(OUT)
    print(PUBLIC)


if __name__ == "__main__":
    main()
