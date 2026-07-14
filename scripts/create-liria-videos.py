#!/usr/bin/env python3
"""Create the Liria Gestion Pro tutorial and advertising videos.

The script renders deterministic 1080p interface scenes, produces a French
female voice-over with the macOS speech engine and encodes MP4 files with a
temporary ffmpeg binary. It never uses customer data or the old product name.
"""

from __future__ import annotations

import math
import re
import shutil
import subprocess
import textwrap
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "video"
TMP = OUT / "tmp"
ASSETS = OUT / "assets"
LOGO_PATH = ASSETS / "liria-gestion-pro-logo.png"
PRESENTER_PATH = ASSETS / "presentatrice-liria.png"
FFMPEG = Path("/tmp/liria-video-tools/node_modules/@ffmpeg-installer/darwin-x64/ffmpeg")
VOICE = "Sandy (Français (France))"
FPS = 30
SIZE = (1920, 1080)

NAVY = "#0b1f35"
NAVY_2 = "#142d4a"
BLUE = "#0d67e8"
BLUE_2 = "#4598ff"
PALE = "#f4f7fb"
WHITE = "#ffffff"
TEXT = "#102338"
MUTED = "#64748b"
LINE = "#dce5ef"
GREEN = "#16865b"
AMBER = "#cc7a10"
RED = "#d63c48"

REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


@dataclass(frozen=True)
class Scene:
    key: str
    title: str
    subtitle: str
    bullets: tuple[str, ...]
    voice: str
    kind: str = "standard"


TUTORIAL = (
    Scene(
        "01-intro",
        "Bienvenue dans Liria Gestion Pro",
        "Gérer. Suivre. Piloter.",
        ("Une seule application pour l'entreprise et le terrain", "Des accès adaptés à chaque poste", "Disponible sur ordinateur et smartphone"),
        "Bonjour et bienvenue dans Liria Gestion Pro. Dans cette présentation, nous allons parcourir l'ensemble du logiciel, depuis la création des accès jusqu'au pilotage de l'entreprise. L'application centralise les clients, les chantiers, les devis, les factures, les équipes, le planning, le pointage, les achats, le stock et le matériel. Chaque collaborateur dispose d'un espace adapté à son poste.",
        "presenter",
    ),
    Scene(
        "02-connexion",
        "Connexion et installation",
        "Un compte personnel, sur ordinateur comme sur téléphone",
        ("Créer une entreprise ou rejoindre avec une invitation", "Installer l'application depuis le navigateur", "Rester connecté jusqu'à déconnexion ou révocation"),
        "Pour commencer, ouvrez l'adresse de Liria Gestion Pro dans Chrome, Safari ou Edge. Un dirigeant peut créer son entreprise. Un collaborateur rejoint l'entreprise avec l'invitation préparée par son administrateur. Sur téléphone, ajoutez ensuite l'application à l'écran d'accueil. Le compte reste normalement connecté. Autorisez la localisation pour le pointage et la caméra pour les scans lorsque le téléphone le demande.",
        "login",
    ),
    Scene(
        "03-tableau-de-bord",
        "Un accueil adapté à chaque rôle",
        "Les informations sensibles restent protégées",
        ("Planning et pointage en priorité pour le terrain", "Alertes limitées aux modules autorisés", "Chiffres visibles uniquement avec le droit financier"),
        "Le tableau de bord s'adapte au compte connecté. Un ouvrier retrouve d'abord son planning et son pointage. Un responsable voit les éléments à contrôler. Les indicateurs financiers, comme le total facturé ou le reste à encaisser, sont réservés aux postes autorisés. Un module non autorisé disparaît du menu et reste également protégé côté serveur.",
        "dashboard",
    ),
    Scene(
        "04-equipe-droits",
        "Employés, invitations et droits",
        "Préparer la fiche avant d'envoyer l'accès",
        ("Créer la fiche et choisir le poste", "Séparer Consulter, Gérer et actions sensibles", "Contrôler l'activation et la dernière connexion"),
        "Dans Employés, l'administrateur crée d'abord la fiche, renseigne la fonction et choisit le poste applicatif. Il règle séparément les droits de consultation, de gestion et les actions sensibles. L'aperçu du poste montre exactement ce que verra le collaborateur sur téléphone et ordinateur. Lorsque tout est prêt, l'invitation personnelle permet au salarié de créer son propre mot de passe et d'activer son compte.",
        "permissions",
    ),
    Scene(
        "05-planning",
        "Planning des équipes",
        "Chantiers et activités hors chantier",
        ("Vue hebdomadaire sur ordinateur", "Lecture jour par jour sur mobile", "Bureau, dépôt, visite médicale, formation ou congé"),
        "Le planning présente les ouvriers par jour sur ordinateur et une lecture simplifiée sur téléphone. Pour ajouter une affectation, choisissez le salarié, la date, le nombre d'heures, puis le chantier ou une activité hors chantier. Vous pouvez donc planifier du temps au bureau, au dépôt, en formation ou en visite médicale. Le planning hebdomadaire peut aussi être partagé par email ou WhatsApp.",
        "planning",
    ),
    Scene(
        "06-pointage",
        "Pointage d'arrivée et de départ",
        "Heure serveur, chantier et position GPS",
        ("Sélectionner le chantier", "Pointer personnellement l'arrivée puis le départ", "Faire valider les heures par une personne autorisée"),
        "Pour pointer, le salarié sélectionne son chantier et autorise la position précise. Le bouton Pointer mon arrivée enregistre l'heure du serveur et le GPS. En fin de journée, Pointer mon départ clôture la session et calcule la durée après la pause. Personne, même un responsable, ne peut pointer à la place d'un autre salarié. Le responsable peut uniquement contrôler, corriger ou valider selon ses droits.",
        "pointage",
    ),
    Scene(
        "07-clients-chantiers",
        "Clients et chantiers",
        "Toutes les informations regroupées sur la bonne fiche",
        ("Créer un client depuis le devis si nécessaire", "Créer immédiatement le chantier associé", "Suivre heures, documents, dépenses et facturation"),
        "Le module Clients regroupe les coordonnées, les conditions de paiement et l'historique commercial. Le chantier rassemble l'adresse, le responsable, les documents, les salariés intervenus et le détail des heures. Depuis un nouveau devis, vous pouvez créer le client puis le chantier sans quitter l'éditeur. Les ouvriers autorisés peuvent consulter leurs prestations sans voir les prix.",
        "clients",
    ),
    Scene(
        "08-devis-factures",
        "Prestations, devis et factures",
        "Créer plus vite et synchroniser les statuts",
        ("Insérer une prestation préenregistrée", "Calcul automatique HT, TVA et TTC", "Transformer un devis accepté en facture"),
        "Dans le catalogue Prestations, mémorisez les désignations, unités, prix et taux de TVA utilisés régulièrement. Lors de la création du devis, choisissez le client et le chantier, puis insérez ces prestations ou ajoutez des lignes libres. Les totaux se recalculent automatiquement. Après acceptation, créez la facture depuis le devis. Les paiements mettent à jour le montant encaissé, le reste dû et le statut.",
        "devis",
    ),
    Scene(
        "09-pdf-email",
        "PDF, email et paiements",
        "Des documents prêts à transmettre",
        ("Télécharger un PDF propre", "Préparer destinataire, copies, objet et message", "Supprimer un paiement erroné avec le droit requis"),
        "Depuis un devis, une facture ou une commande, ouvrez l'aperçu et téléchargez le PDF. Le bouton d'envoi prépare le destinataire, les personnes en copie, l'objet et le message dans votre messagerie. Dans la version actuelle, ajoutez encore manuellement le PDF en pièce jointe avant l'envoi. Si un paiement a été saisi par erreur, une personne autorisée peut le supprimer et les totaux sont recalculés.",
        "document",
    ),
    Scene(
        "10-achats",
        "Fournisseurs et commandes",
        "Suivre aussi les réceptions partielles",
        ("Rattacher une commande à un chantier", "Indiquer reçu, partiel ou non reçu par ligne", "Associer facture, règlement et justificatif"),
        "Le module Fournisseurs conserve les contacts, commandes, dépenses et règlements. Une commande peut être rattachée au chantier concerné puis envoyée en PDF. À la livraison, contrôlez chaque ligne. En cas de réception partielle, saisissez la quantité réellement reçue : Liria Gestion Pro affiche ce qui est reçu et ce qui manque. Ajoutez ensuite la facture fournisseur et son règlement.",
        "orders",
    ),
    Scene(
        "11-notes-frais",
        "Notes de frais et justificatifs",
        "Photographier, soumettre, contrôler et exporter",
        ("Photo ou PDF original, jusqu'à plusieurs pages", "Chantier, catégorie, fournisseur, HT, TVA et TTC", "Workflow de correction, validation et verrouillage"),
        "Chaque salarié peut créer sa propre note de frais, choisir le chantier, saisir les montants puis photographier ou importer le justificatif. Vérifiez que le document est complet, en couleur et lisible. Le responsable peut demander une correction, valider ou refuser avec un motif. Le comptable peut ensuite exporter les dépenses autorisées. Conservez toujours l'original papier jusqu'à confirmation de la procédure de conservation de l'entreprise.",
        "expenses",
    ),
    Scene(
        "12-stock",
        "Stock, dépôt, QR et inventaires",
        "Chaque mouvement reste attribué au bon salarié",
        ("Scanner article, chantier, véhicule ou outil", "Sortie de stock obligatoirement liée à un chantier", "Compte dépôt partagé + identification personnelle"),
        "Chaque article possède une référence, un stock, un seuil d'alerte, un emplacement et un code d'identification. La borne du dépôt reste connectée sur un compte partagé limité au stock. Pour chaque entrée ou sortie, le salarié saisit son identifiant interne et son mot de passe stock personnel. Une sortie est rattachée à un chantier. Les inventaires enregistrent les quantités physiques et les écarts.",
        "stock",
    ),
    Scene(
        "13-rh",
        "Carte BTP, habilitations et congés",
        "Les informations professionnelles dans Mon espace",
        ("Ancienneté calculée depuis la date d'entrée", "Carte BTP numérique clairement identifiée comme copie", "Demande de congé personnelle et validation responsable"),
        "La fiche employé rassemble l'ancienneté, le poste, les affectations et les accès. La copie numérique de la Carte BTP peut être ajoutée avec les habilitations et leurs dates de validité. Elle doit rester marquée comme copie et ne remplace pas la carte officielle. Depuis son compte, le salarié peut également envoyer sa propre demande de congé. Une demande acceptée alimente le planning.",
        "employees",
    ),
    Scene(
        "14-flotte-outillage",
        "Flotte automobile et outillage",
        "Affectations, factures, échéances et maintenance",
        ("Associer véhicule et outils aux salariés", "Importer les factures sur le bon équipement", "Rendre indisponible le matériel hors service"),
        "Dans Flotte, suivez le véhicule, son conducteur, le kilométrage, les échéances et les factures d'entretien avec le détail des travaux. Dans Outillage, enregistrez la référence, la marque, l'état, la localisation et l'affectation. Un outil déclaré hors service devient indisponible et déclenche une alerte. Il peut ensuite être envoyé en réparation, remis en service ou mis au rebut.",
        "assets",
    ),
    Scene(
        "15-pilotage",
        "Pilotage et comptabilité",
        "Des chiffres fiables quand les données sont bien rattachées",
        ("Rentabilité par chantier et par période", "Trésorerie, échéances et reste à encaisser", "Exports CSV et archives de justificatifs"),
        "Les responsables autorisés disposent du suivi de rentabilité et de trésorerie. La qualité des résultats dépend du rattachement des heures, achats, frais et matériels au bon chantier. Les exports comptables permettent de choisir une période et de télécharger les journaux de ventes, règlements et TVA. Les justificatifs de notes de frais peuvent être regroupés dans un export sécurisé avec manifeste et empreintes.",
        "finance",
    ),
    Scene(
        "16-parametres",
        "Paramètres et administration",
        "Adapter l'application à l'organisation de l'entreprise",
        ("Logo, mentions, police et mise en page des documents", "Postes, droits et aperçu des accès", "Imports CSV ou Excel avec contrôle avant validation"),
        "Dans Paramètres, renseignez l'identité de l'entreprise, son logo et les mentions utilisées sur les documents. Vous pouvez choisir la police, la couleur et la mise en page des devis et factures. La section Accès et rôles permet de réduire ou d'élargir les droits de chaque poste. Enfin, l'assistant d'import accepte les listes structurées de clients, chantiers, salariés et prestations depuis un fichier CSV ou Excel.",
        "settings",
    ),
    Scene(
        "17-routine",
        "La journée type sur le terrain",
        "Consulter, pointer, travailler, tracer",
        ("Lire le planning et les consignes", "Pointer arrivée et départ avec le GPS", "Déclarer stock, matériel, frais ou congé en son nom"),
        "Pour résumer la journée d'un salarié : il consulte son planning, sélectionne son chantier et pointe son arrivée. Il ouvre Mes travaux pour lire les prestations et consignes sans les prix. Au dépôt, il s'identifie personnellement pour chaque mouvement. Il peut transmettre une photo de chantier ou une note de frais. Enfin, il pointe son départ. Toutes ces actions restent enregistrées en son nom propre.",
        "routine",
    ),
    Scene(
        "18-fin",
        "Liria Gestion Pro",
        "Toute l'activité BTP, du bureau au chantier",
        ("Gérer", "Suivre", "Piloter"),
        "Vous connaissez maintenant les principaux parcours de Liria Gestion Pro. Commencez par configurer les postes et les droits, puis créez vos équipes, clients et chantiers. Utilisez ensuite le planning, le pointage et les rattachements pour obtenir un suivi fiable. Retrouvez le guide complet directement dans le menu Aide. Liria Gestion Pro : gérer, suivre, piloter.",
        "presenter",
    ),
)


PROMO = (
    Scene("p01", "Votre entreprise avance.", "Vos informations aussi.", ("Bureau", "Chantiers", "Équipes"), "Entre le bureau, les chantiers et les équipes, les informations se dispersent vite.", "presenter"),
    Scene("p02", "Tout réunir.", "Dans une seule application.", ("Clients et chantiers", "Devis et factures", "Planning et pointage GPS"), "Avec Liria Gestion Pro, centralisez clients, chantiers, devis, factures, planning et pointage GPS.", "dashboard"),
    Scene("p03", "Chaque poste voit l'essentiel.", "Sans exposer les données sensibles.", ("Ouvrier", "Chef d'équipe", "Administratif", "Direction"), "Chaque collaborateur voit uniquement les modules et les actions autorisés pour son poste.", "permissions"),
    Scene("p04", "Du devis à l'encaissement.", "Des statuts qui suivent vos actions.", ("Prestations préenregistrées", "PDF prêt à envoyer", "Paiements synchronisés"), "Créez vos devis plus vite, transformez-les en factures et suivez les encaissements sans ressaisie.", "devis"),
    Scene("p05", "Le terrain reste connecté.", "Planning mobile, GPS et consignes.", ("Arrivée et départ", "Heures par chantier", "Travaux sans affichage des prix"), "Sur le terrain, chacun consulte son planning, ses consignes et pointe personnellement son arrivée et son départ.", "pointage"),
    Scene("p06", "Stock et matériel sous contrôle.", "QR, scans, affectations et alertes.", ("Borne dépôt", "Véhicules et outils", "Inventaires"), "Au dépôt, les QR, les scans et l'identification personnelle sécurisent les mouvements de stock et le matériel.", "stock"),
    Scene("p07", "Décidez avec une vision claire.", "Rentabilité, trésorerie et exports.", ("Suivi par chantier", "Alertes opérationnelles", "Exports comptables"), "Et les personnes autorisées pilotent la rentabilité, la trésorerie et les exports comptables depuis un seul espace.", "finance"),
    Scene("p08", "Liria Gestion Pro", "Gérer. Suivre. Piloter.", ("Simple au bureau", "Pratique sur le terrain", "Conçu pour le BTP"), "Liria Gestion Pro. Toute votre activité BTP, du bureau au chantier. Gérer, suivre, piloter.", "presenter"),
)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(BOLD if bold else REGULAR, size)


def rounded(draw: ImageDraw.ImageDraw, box, radius=18, fill=WHITE, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def fit_logo() -> Image.Image:
    img = Image.open(LOGO_PATH).convert("RGBA")
    rgb = np.asarray(img.convert("RGB"))
    mask = np.any(rgb < 242, axis=2)
    ys, xs = np.where(mask)
    if len(xs):
        pad = 25
        box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(img.width, xs.max() + pad), min(img.height, ys.max() + pad))
        img = img.crop(box)
    return img


LOGO = None
LOGO_MARK = None


def paste_logo(canvas: Image.Image, x: int, y: int, width: int):
    global LOGO
    if LOGO is None:
        LOGO = fit_logo()
    ratio = width / LOGO.width
    logo = LOGO.resize((width, int(LOGO.height * ratio)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, (x, y))


def paste_mark(canvas: Image.Image, x: int, y: int, height: int):
    global LOGO_MARK
    if LOGO_MARK is None:
        full = fit_logo()
        # The supplied square artwork places the LG mark above the wordmark.
        LOGO_MARK = full.crop((0, 0, full.width, int(full.height * 0.67)))
    ratio = height / LOGO_MARK.height
    mark = LOGO_MARK.resize((int(LOGO_MARK.width * ratio), height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, (x, y))


def text_wrap(draw, text, xy, max_width, fnt, fill=TEXT, spacing=10, max_lines=None):
    words = text.split()
    lines = []
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textbbox((0, 0), candidate, font=fnt)[2] <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" .") + "..."
    x, y = xy
    h = int(fnt.size * 1.28)
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += h + spacing
    return y


def header(canvas, title, subtitle, compact=False):
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, 1920, 92), fill=NAVY)
    paste_mark(canvas, 48, 8, 76)
    draw.text((255, 28), "LIRIA GESTION PRO", font=font(30, True), fill=WHITE)
    draw.text((1518, 34), "GÉRER  •  SUIVRE  •  PILOTER", font=font(18), fill="#b9d7ff")
    if not compact:
        draw.text((92, 136), title, font=font(54, True), fill=TEXT)
        draw.text((94, 205), subtitle, font=font(26), fill=MUTED)


def sidebar(draw, active):
    draw.rounded_rectangle((50, 275, 390, 1015), radius=20, fill=NAVY)
    items = ["Tableau de bord", "Planning", "Clients", "Chantiers", "Devis", "Factures", "Stock", "Employés", "Flotte", "Paramètres"]
    for i, item in enumerate(items):
        y = 310 + i * 66
        if item == active:
            draw.rounded_rectangle((72, y - 7, 368, y + 43), radius=11, fill=BLUE)
            color = WHITE
        else:
            color = "#d4e0ee"
        draw.ellipse((92, y + 6, 106, y + 20), fill=BLUE_2 if item != active else WHITE)
        draw.text((125, y), item, font=font(20, item == active), fill=color)


def bullets_panel(draw, bullets, x=1380, y=305, w=475):
    rounded(draw, (x, y, x + w, y + 500), 22, WHITE, LINE, 2)
    draw.text((x + 34, y + 30), "À RETENIR", font=font(18, True), fill=BLUE)
    yy = y + 87
    for bullet in bullets:
        draw.ellipse((x + 34, yy + 8, x + 50, yy + 24), fill=BLUE)
        yy = text_wrap(draw, bullet, (x + 70, yy), w - 105, font(22, True), TEXT, 3, 3) + 24


def card(draw, box, title, value, accent=BLUE, detail=""):
    rounded(draw, box, 18, WHITE, LINE, 2)
    x1, y1, x2, y2 = box
    draw.rounded_rectangle((x1, y1, x1 + 9, y2), radius=5, fill=accent)
    draw.text((x1 + 28, y1 + 23), title, font=font(19, True), fill=MUTED)
    draw.text((x1 + 28, y1 + 62), value, font=font(35, True), fill=TEXT)
    if detail:
        draw.text((x1 + 28, y2 - 35), detail, font=font(16), fill=MUTED)


def render_presenter(scene: Scene) -> Image.Image:
    src = Image.open(PRESENTER_PATH).convert("RGB")
    src_ratio, target_ratio = src.width / src.height, 16 / 9
    if src_ratio > target_ratio:
        new_w = int(src.height * target_ratio)
        left = (src.width - new_w) // 2
        src = src.crop((left, 0, left + new_w, src.height))
    else:
        new_h = int(src.width / target_ratio)
        top = (src.height - new_h) // 2
        src = src.crop((0, top, src.width, top + new_h))
    canvas = src.resize(SIZE, Image.Resampling.LANCZOS).convert("RGBA")
    overlay = Image.new("RGBA", SIZE, (255, 255, 255, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle((0, 0, 1110, 1080), fill=(255, 255, 255, 238))
    od.rectangle((1070, 0, 1190, 1080), fill=(255, 255, 255, 120))
    canvas = Image.alpha_composite(canvas, overlay)
    paste_logo(canvas, 90, 80, 460)
    draw = ImageDraw.Draw(canvas)
    draw.text((92, 440), scene.title, font=font(62, True), fill=TEXT)
    text_wrap(draw, scene.subtitle, (95, 525), 850, font(33), BLUE, 8, 2)
    yy = 660
    for b in scene.bullets:
        draw.ellipse((97, yy + 7, 117, yy + 27), fill=BLUE)
        draw.text((140, yy), b, font=font(25, True), fill=TEXT)
        yy += 68
    draw.text((96, 1000), "Présentation officielle • Version juillet 2026", font=font(17), fill=MUTED)
    return canvas


def render_scene(scene: Scene) -> Image.Image:
    if scene.kind == "presenter":
        return render_presenter(scene)
    canvas = Image.new("RGBA", SIZE, PALE)
    draw = ImageDraw.Draw(canvas)
    header(canvas, scene.title, scene.subtitle)
    sidebar(draw, {
        "login": "Tableau de bord", "dashboard": "Tableau de bord", "permissions": "Employés",
        "planning": "Planning", "pointage": "Planning", "clients": "Chantiers", "devis": "Devis",
        "document": "Factures", "orders": "Chantiers", "expenses": "Tableau de bord", "stock": "Stock",
        "employees": "Employés", "assets": "Flotte", "finance": "Tableau de bord", "settings": "Paramètres",
        "routine": "Planning",
    }.get(scene.kind, "Tableau de bord"))
    x0, y0, x1, y1 = 430, 275, 1350, 1015
    rounded(draw, (x0, y0, x1, y1), 22, WHITE, LINE, 2)
    bullets_panel(draw, scene.bullets)

    if scene.kind == "login":
        draw.text((515, 340), "Bienvenue", font=font(42, True), fill=TEXT)
        draw.text((518, 402), "Connectez-vous à votre espace", font=font(22), fill=MUTED)
        for yy, label, value in [(500, "Adresse email", "prenom@entreprise.fr"), (620, "Mot de passe", "••••••••••••")]:
            draw.text((520, yy), label, font=font(18, True), fill=TEXT)
            rounded(draw, (520, yy + 36, 1205, yy + 102), 12, PALE, LINE, 2)
            draw.text((545, yy + 56), value, font=font(22), fill=MUTED)
        rounded(draw, (520, 785, 1205, 860), 12, BLUE)
        draw.text((780, 805), "SE CONNECTER", font=font(24, True), fill=WHITE)
        draw.text((555, 915), "Créer une entreprise     •     Rejoindre avec une invitation", font=font(20), fill=BLUE)
    elif scene.kind == "dashboard":
        card(draw, (470, 320, 730, 470), "FACTURÉ", "128 450 €", BLUE, "+ 12 % ce mois")
        card(draw, (755, 320, 1015, 470), "ENCAISSÉ", "103 200 €", GREEN, "80 % réglé")
        card(draw, (1040, 320, 1305, 470), "À ENCAISSER", "25 250 €", AMBER, "6 échéances")
        draw.text((475, 520), "Planning du jour", font=font(25, True), fill=TEXT)
        rows = [("08:00", "Équipe Martin", "Rénovation bureaux", GREEN), ("08:30", "Équipe Robert", "Cloisons - niveau 2", BLUE), ("13:30", "Camille Durand", "Visite médicale", AMBER)]
        for i, (time, emp, task, color) in enumerate(rows):
            yy = 570 + i * 112
            rounded(draw, (470, yy, 1305, yy + 88), 13, PALE)
            draw.rounded_rectangle((470, yy, 480, yy + 88), radius=5, fill=color)
            draw.text((505, yy + 18), time, font=font(22, True), fill=TEXT)
            draw.text((635, yy + 13), emp, font=font(21, True), fill=TEXT)
            draw.text((635, yy + 48), task, font=font(18), fill=MUTED)
    elif scene.kind == "permissions":
        draw.text((470, 320), "Poste : Chef d'équipe", font=font(30, True), fill=TEXT)
        draw.text((470, 365), "Aperçu des autorisations", font=font(20), fill=MUTED)
        cols = ["Module", "Consulter", "Gérer", "Action sensible"]
        xs = [475, 790, 970, 1120]
        for x, c in zip(xs, cols): draw.text((x, 430), c, font=font(18, True), fill=MUTED)
        modules = [("Planning", 1, 1, 0), ("Pointage", 1, 0, 1), ("Chantiers", 1, 1, 0), ("Devis", 1, 0, 0), ("Indicateurs financiers", 0, 0, 0)]
        for i, row in enumerate(modules):
            yy = 485 + i * 90
            draw.line((470, yy - 18, 1300, yy - 18), fill=LINE, width=2)
            draw.text((475, yy), row[0], font=font(21, True), fill=TEXT)
            for j, val in enumerate(row[1:]):
                cx = [835, 1015, 1215][j]
                draw.rounded_rectangle((cx - 18, yy, cx + 18, yy + 36), radius=8, fill=BLUE if val else WHITE, outline=LINE, width=2)
                if val: draw.text((cx - 11, yy - 1), "✓", font=font(28, True), fill=WHITE)
    elif scene.kind == "planning":
        days = ["LUN 13", "MAR 14", "MER 15", "JEU 16", "VEN 17"]
        emps = ["A. Martin", "C. Durand", "N. Robert", "T. Bernard"]
        colw = 142
        draw.text((470, 315), "Semaine du 13 au 17 juillet", font=font(27, True), fill=TEXT)
        for j, day in enumerate(days): draw.text((650 + j * colw, 390), day, font=font(17, True), fill=MUTED)
        colors = ["#dbeafe", "#dcfce7", "#fef3c7", "#ede9fe"]
        tasks = ["Bureaux\n7,5 h", "Cloisons\n8 h", "Dépôt\n4 h", "Formation\n7 h"]
        for i, emp in enumerate(emps):
            yy = 455 + i * 125
            draw.text((475, yy + 25), emp, font=font(20, True), fill=TEXT)
            for j in range(5):
                xx = 635 + j * colw
                rounded(draw, (xx, yy, xx + 126, yy + 98), 11, colors[(i + j) % 4])
                lines = tasks[(i + j) % 4].split("\n")
                draw.text((xx + 12, yy + 18), lines[0], font=font(16, True), fill=TEXT)
                draw.text((xx + 12, yy + 55), lines[1], font=font(15), fill=MUTED)
    elif scene.kind == "pointage":
        rounded(draw, (585, 315, 1195, 965), 42, NAVY)
        rounded(draw, (620, 355, 1160, 925), 28, WHITE)
        draw.text((665, 405), "Bonjour Camille", font=font(30, True), fill=TEXT)
        draw.text((665, 455), "Mardi 14 juillet • 07:58", font=font(19), fill=MUTED)
        rounded(draw, (665, 520, 1115, 640), 16, PALE, LINE, 2)
        draw.text((695, 545), "CHANTIER", font=font(16, True), fill=BLUE)
        draw.text((695, 580), "Rénovation bureaux", font=font(25, True), fill=TEXT)
        draw.text((695, 618), "12 rue des Artisans, Lyon", font=font(17), fill=MUTED)
        rounded(draw, (665, 690, 1115, 780), 18, GREEN)
        draw.text((775, 716), "POINTER MON ARRIVÉE", font=font(22, True), fill=WHITE)
        draw.ellipse((705, 825, 735, 855), fill=GREEN)
        draw.text((755, 826), "GPS précis • prêt", font=font(20, True), fill=GREEN)
    elif scene.kind == "clients":
        draw.text((470, 320), "Chantier : Rénovation bureaux", font=font(29, True), fill=TEXT)
        draw.text((470, 365), "Client : Société Démo • Lyon", font=font(20), fill=MUTED)
        card(draw, (470, 430, 720, 570), "HEURES VALIDÉES", "286 h", BLUE)
        card(draw, (740, 430, 990, 570), "ÉQUIPE", "8 pers.", GREEN)
        card(draw, (1010, 430, 1305, 570), "AVANCEMENT", "72 %", AMBER)
        tabs = ["Documents", "Employés", "Devis", "Factures", "Dépenses"]
        for i, t in enumerate(tabs):
            xx = 470 + i * 166
            rounded(draw, (xx, 620, xx + 148, 670), 10, BLUE if i == 1 else PALE)
            draw.text((xx + 15, 635), t, font=font(16, True), fill=WHITE if i == 1 else TEXT)
        workers = [("Alex Martin", "78 h"), ("Camille Durand", "64 h"), ("Nicolas Robert", "58 h")]
        for i, (name, hours) in enumerate(workers):
            yy = 725 + i * 72
            draw.ellipse((485, yy, 535, yy + 50), fill="#dbeafe")
            draw.text((560, yy + 10), name, font=font(20, True), fill=TEXT)
            draw.text((1190, yy + 10), hours, font=font(20, True), fill=BLUE)
    elif scene.kind == "devis":
        draw.text((470, 315), "DEV-2026-0042 • Nouveau devis", font=font(27, True), fill=TEXT)
        rounded(draw, (470, 375, 1305, 450), 12, PALE, LINE, 2)
        draw.text((495, 400), "Insérer une prestation préenregistrée", font=font(20), fill=MUTED)
        rounded(draw, (1075, 387, 1280, 438), 10, BLUE)
        draw.text((1123, 401), "+ AJOUTER", font=font(18, True), fill=WHITE)
        headers = ["Désignation", "Qté", "Unité", "PU HT", "TVA", "Total"]
        xs = [485, 895, 980, 1070, 1165, 1240]
        for x, h in zip(xs, headers): draw.text((x, 495), h, font=font(16, True), fill=MUTED)
        rows = [("Pose cloisons amovibles", "24", "h", "52,00 €", "20 %", "1 248 €"), ("Panneaux et profilés", "12", "u", "119,00 €", "20 %", "1 428 €"), ("Protection du chantier", "1", "forfait", "350,00 €", "20 %", "350 €")]
        for i, row in enumerate(rows):
            yy = 545 + i * 92
            draw.line((480, yy - 14, 1295, yy - 14), fill=LINE, width=2)
            for x, val in zip(xs, row): draw.text((x, yy), val, font=font(17, i == 0), fill=TEXT)
        draw.line((850, 855, 1295, 855), fill=NAVY, width=3)
        draw.text((950, 885), "TOTAL TTC", font=font(22, True), fill=TEXT)
        draw.text((1170, 881), "3 631,20 €", font=font(28, True), fill=BLUE)
    elif scene.kind == "document":
        rounded(draw, (490, 315, 960, 965), 12, WHITE, LINE, 2)
        draw.text((535, 355), "LIRIA GESTION PRO", font=font(24, True), fill=NAVY)
        draw.text((760, 410), "FACTURE", font=font(31, True), fill=BLUE)
        draw.line((535, 465, 915, 465), fill=BLUE, width=4)
        for i in range(5):
            yy = 520 + i * 62
            draw.line((535, yy, 915, yy), fill=LINE, width=2)
        draw.text((695, 850), "Total TTC  3 631,20 €", font=font(22, True), fill=TEXT)
        rounded(draw, (1010, 355, 1305, 430), 12, BLUE)
        draw.text((1060, 378), "TÉLÉCHARGER PDF", font=font(18, True), fill=WHITE)
        rounded(draw, (1010, 465, 1305, 540), 12, GREEN)
        draw.text((1060, 488), "ENVOYER PAR EMAIL", font=font(18, True), fill=WHITE)
        draw.text((1010, 610), "À : client@exemple.fr", font=font(18, True), fill=TEXT)
        draw.text((1010, 655), "Cc : compta@exemple.fr", font=font(18), fill=MUTED)
        text_wrap(draw, "Objet : Votre facture FAC-2026-0042", (1010, 715), 285, font(18), TEXT, 5, 3)
        rounded(draw, (1010, 820, 1305, 910), 12, "#fff7ed", "#fed7aa", 2)
        text_wrap(draw, "Pensez à joindre le PDF avant l'envoi.", (1035, 840), 245, font(17, True), AMBER, 4, 3)
    elif scene.kind == "orders":
        draw.text((470, 315), "CMD-2026-0031 • Réception", font=font(27, True), fill=TEXT)
        rows = [("Panneaux décoratifs", "10", "10", "Reçu", GREEN), ("Profilés aluminium", "20", "12", "Partiel", AMBER), ("Fixations", "50", "0", "Non reçu", RED)]
        headers = ["Article", "Commandé", "Reçu", "État"]
        for x, h in zip([480, 880, 1020, 1150], headers): draw.text((x, 405), h, font=font(18, True), fill=MUTED)
        for i, (name, ordered, received, status, color) in enumerate(rows):
            yy = 475 + i * 125
            rounded(draw, (470, yy, 1305, yy + 98), 13, PALE)
            draw.text((495, yy + 32), name, font=font(21, True), fill=TEXT)
            draw.text((920, yy + 32), ordered, font=font(21), fill=TEXT)
            draw.text((1050, yy + 32), received, font=font(21, True), fill=TEXT)
            rounded(draw, (1140, yy + 23, 1275, yy + 70), 20, color)
            draw.text((1163, yy + 35), status, font=font(16, True), fill=WHITE)
        rounded(draw, (470, 865, 1305, 940), 12, "#fff7ed", "#fed7aa", 2)
        draw.text((500, 890), "8 profilés restent à recevoir avant de clôturer la commande.", font=font(20, True), fill=AMBER)
    elif scene.kind == "expenses":
        rounded(draw, (495, 320, 810, 950), 42, NAVY)
        rounded(draw, (520, 355, 785, 915), 26, WHITE)
        draw.text((560, 395), "JUSTIFICATIF", font=font(18, True), fill=BLUE)
        rounded(draw, (555, 455, 750, 710), 8, "#fffdf4", "#d7caa0", 2)
        draw.text((590, 490), "TICKET", font=font(26, True), fill=TEXT)
        for i in range(6): draw.line((585, 555 + i * 28, 720, 555 + i * 28), fill="#c9c2a9", width=2)
        draw.text((595, 745), "Total 48,90 €", font=font(22, True), fill=TEXT)
        rounded(draw, (555, 810, 750, 870), 14, BLUE)
        draw.text((597, 828), "PHOTOGRAPHIER", font=font(16, True), fill=WHITE)
        steps = [("Brouillon", BLUE), ("Soumis", AMBER), ("Validé", GREEN), ("Exporté", NAVY)]
        draw.line((930, 470, 930, 815), fill=LINE, width=7)
        for i, (label, color) in enumerate(steps):
            yy = 455 + i * 120
            draw.ellipse((906, yy, 954, yy + 48), fill=color)
            draw.text((990, yy + 8), label, font=font(24, True), fill=TEXT)
        rounded(draw, (880, 865, 1285, 935), 12, "#eff6ff", "#bfdbfe", 2)
        draw.text((910, 887), "Original papier à conserver", font=font(20, True), fill=BLUE)
    elif scene.kind == "stock":
        draw.text((470, 315), "Borne dépôt • Mouvement personnel", font=font(27, True), fill=TEXT)
        rounded(draw, (475, 390, 795, 765), 18, NAVY)
        draw.text((525, 435), "SCAN", font=font(20, True), fill="#b9d7ff")
        for i in range(11):
            w = 4 if i % 3 else 8
            draw.rectangle((525 + i * 18, 500, 525 + i * 18 + w, 650), fill=WHITE)
        draw.text((525, 690), "JUJU-STK-018", font=font(20, True), fill=WHITE)
        form = [("Identifiant salarié", "LGP-0007"), ("Article", "Panneau mélaminé"), ("Quantité", "4 unités"), ("Chantier", "Rénovation bureaux")]
        for i, (label, value) in enumerate(form):
            yy = 390 + i * 120
            draw.text((855, yy), label, font=font(17, True), fill=MUTED)
            rounded(draw, (850, yy + 31, 1295, yy + 91), 10, PALE, LINE, 2)
            draw.text((875, yy + 48), value, font=font(20, True), fill=TEXT)
        rounded(draw, (850, 885, 1295, 950), 12, BLUE)
        draw.text((985, 903), "ENREGISTRER LA SORTIE", font=font(18, True), fill=WHITE)
    elif scene.kind == "employees":
        rounded(draw, (475, 325, 850, 955), 22, NAVY)
        draw.ellipse((585, 380, 740, 535), fill="#dbeafe")
        draw.text((608, 425), "CD", font=font(52, True), fill=BLUE)
        draw.text((540, 570), "Camille Durand", font=font(28, True), fill=WHITE)
        draw.text((570, 615), "Cheffe d'équipe", font=font(20), fill="#b9d7ff")
        draw.text((540, 680), "Identifiant : LGP-0007", font=font(18), fill=WHITE)
        rounded(draw, (530, 745, 795, 805), 14, GREEN)
        draw.text((582, 764), "CARTE BTP VALIDE", font=font(17, True), fill=WHITE)
        draw.text((515, 850), "Copie numérique - ne remplace", font=font(16, True), fill="#fbd38d")
        draw.text((570, 878), "pas l'original", font=font(16, True), fill="#fbd38d")
        draw.text((915, 350), "Habilitations", font=font(25, True), fill=TEXT)
        items = [("SST", "12/2027", GREEN), ("Travail en hauteur", "06/2027", GREEN), ("CACES", "À renouveler", AMBER)]
        for i, (name, date, color) in enumerate(items):
            yy = 420 + i * 105
            rounded(draw, (900, yy, 1285, yy + 80), 12, PALE)
            draw.ellipse((925, yy + 24, 955, yy + 54), fill=color)
            draw.text((980, yy + 17), name, font=font(20, True), fill=TEXT)
            draw.text((980, yy + 48), date, font=font(16), fill=MUTED)
        rounded(draw, (900, 780, 1285, 880), 15, "#eff6ff", "#bfdbfe", 2)
        draw.text((930, 802), "Demande de congé", font=font(20, True), fill=BLUE)
        draw.text((930, 840), "22 au 26 juillet • Soumise", font=font(17), fill=MUTED)
    elif scene.kind == "assets":
        cards = [("VÉHICULE", "Renault Trafic", "Camille Durand", "CT : 08/2026", GREEN), ("OUTIL", "Perforateur SDS", "Alex Martin", "En réparation", AMBER)]
        for i, (typ, name, person, state, color) in enumerate(cards):
            yy = 340 + i * 295
            rounded(draw, (475, yy, 1300, yy + 245), 20, WHITE, LINE, 2)
            draw.rounded_rectangle((475, yy, 500, yy + 245), radius=10, fill=color)
            draw.text((535, yy + 30), typ, font=font(17, True), fill=BLUE)
            draw.text((535, yy + 70), name, font=font(31, True), fill=TEXT)
            draw.text((535, yy + 125), f"Affecté à : {person}", font=font(20), fill=MUTED)
            rounded(draw, (980, yy + 55, 1245, yy + 110), 18, color)
            draw.text((1025, yy + 72), state, font=font(17, True), fill=WHITE)
            draw.text((980, yy + 160), "Factures • historique • QR", font=font(18, True), fill=TEXT)
    elif scene.kind == "finance":
        card(draw, (470, 320, 735, 465), "CA FACTURÉ", "128 450 €", BLUE)
        card(draw, (755, 320, 1020, 465), "MARGE", "31,6 %", GREEN)
        card(draw, (1040, 320, 1305, 465), "TRÉSORERIE", "42 800 €", NAVY)
        draw.text((475, 520), "Rentabilité par chantier", font=font(24, True), fill=TEXT)
        vals = [("Bureaux Part-Dieu", 0.82, GREEN), ("Cabines sanitaires", 0.63, BLUE), ("Accueil showroom", 0.47, AMBER), ("Cloisons niveau 2", 0.71, BLUE)]
        for i, (name, val, color) in enumerate(vals):
            yy = 585 + i * 85
            draw.text((475, yy), name, font=font(18, True), fill=TEXT)
            draw.rounded_rectangle((760, yy + 4, 1260, yy + 34), radius=15, fill="#e9eff6")
            draw.rounded_rectangle((760, yy + 4, 760 + int(500 * val), yy + 34), radius=15, fill=color)
            draw.text((1270, yy + 2), f"{int(val*100)} %", font=font(17, True), fill=TEXT)
    elif scene.kind == "settings":
        sections = [("Identité et logo", "Coordonnées, SIRET, assurances"), ("Documents", "Police, couleur, mise en page"), ("Accès et rôles", "Consulter, gérer, aperçu du poste"), ("Imports", "Clients, chantiers, employés, prestations")]
        for i, (name, detail) in enumerate(sections):
            row, col = divmod(i, 2)
            xx = 480 + col * 410
            yy = 340 + row * 255
            rounded(draw, (xx, yy, xx + 380, yy + 215), 18, WHITE, LINE, 2)
            draw.ellipse((xx + 35, yy + 35, xx + 90, yy + 90), fill=BLUE)
            draw.text((xx + 115, yy + 42), name, font=font(23, True), fill=TEXT)
            text_wrap(draw, detail, (xx + 35, yy + 120), 310, font(18), MUTED, 4, 3)
            draw.text((xx + 35, yy + 175), "Configurer  →", font=font(18, True), fill=BLUE)
        rounded(draw, (480, 880, 1270, 950), 12, NAVY)
        draw.text((690, 902), "APERÇU DU POSTE : TÉLÉPHONE + ORDINATEUR", font=font(19, True), fill=WHITE)
    elif scene.kind == "routine":
        steps = [("1", "PLANNING", "Consulter chantier et consignes"), ("2", "ARRIVÉE", "Pointer personnellement avec GPS"), ("3", "TRAVAIL", "Mes travaux, photos et stock"), ("4", "DÉPART", "Clôturer la session du chantier")]
        for i, (num, name, detail) in enumerate(steps):
            yy = 340 + i * 150
            draw.ellipse((490, yy, 570, yy + 80), fill=BLUE)
            draw.text((515, yy + 17), num, font=font(34, True), fill=WHITE)
            if i < len(steps) - 1: draw.line((530, yy + 80, 530, yy + 145), fill=BLUE_2, width=8)
            draw.text((620, yy + 7), name, font=font(22, True), fill=BLUE)
            draw.text((620, yy + 44), detail, font=font(23, True), fill=TEXT)
    else:
        draw.text((500, 400), scene.title, font=font(45, True), fill=TEXT)
    return canvas


def run(cmd, *, check=True):
    return subprocess.run([str(x) for x in cmd], check=check, text=True, capture_output=True)


def audio_duration(path: Path) -> float:
    probe = run([FFMPEG, "-i", path], check=False)
    match = re.search(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)", probe.stderr)
    if not match:
        raise RuntimeError(f"Unable to read duration for {path}: {probe.stderr[-500:]}")
    h, m, s = match.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def format_srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def music_bed(path: Path, duration: float, promo: bool):
    sr = 44100
    n = int(duration * sr)
    t = np.arange(n, dtype=np.float64) / sr
    chords = [(130.81, 164.81, 196.00), (146.83, 174.61, 220.00), (110.00, 146.83, 174.61), (98.00, 130.81, 164.81)]
    signal = np.zeros(n, dtype=np.float64)
    section = 4.0 if promo else 8.0
    for idx, start in enumerate(np.arange(0, duration, section)):
        end = min(duration, start + section)
        mask = (t >= start) & (t < end)
        local = t[mask] - start
        chord = chords[idx % len(chords)]
        pad = sum(np.sin(2 * math.pi * f * local) + 0.28 * np.sin(4 * math.pi * f * local) for f in chord) / 3.84
        env = np.minimum(1, local / 0.7) * np.minimum(1, (end - start - local) / 0.8)
        signal[mask] += pad * np.clip(env, 0, 1)
        if promo:
            pulse = (np.sin(2 * math.pi * 2 * local) > 0.83).astype(float)
            signal[mask] += 0.16 * pulse * np.sin(2 * math.pi * 65.4 * local)
    fade = min(n // 2, sr * 2)
    signal[:fade] *= np.linspace(0, 1, fade)
    signal[-fade:] *= np.linspace(1, 0, fade)
    signal = np.clip(signal * (0.38 if promo else 0.22), -0.95, 0.95)
    pcm = (signal * 32767).astype("<i2")
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(pcm.tobytes())


def create_video(name: str, scenes: tuple[Scene, ...], promo=False):
    work = TMP / name
    work.mkdir(parents=True, exist_ok=True)
    segments = []
    durations = []
    subtitles = []
    cursor = 0.0
    rate = "165" if promo else "160"
    for idx, scene in enumerate(scenes, 1):
        png = work / f"{idx:02}-{scene.key}.png"
        txt = work / f"{idx:02}-{scene.key}.txt"
        aiff = work / f"{idx:02}-{scene.key}.aiff"
        segment = work / f"{idx:02}-{scene.key}.mp4"
        render_scene(scene).convert("RGB").save(png, quality=95)
        txt.write_text(scene.voice, encoding="utf-8")
        run(["/usr/bin/say", "-v", VOICE, "-r", rate, "-f", txt, "-o", aiff])
        voice_duration = audio_duration(aiff)
        duration = voice_duration + (0.55 if promo else 0.9)
        durations.append(duration)
        fade_out = max(0.1, duration - 0.35)
        vf = f"scale=1920:1080,fade=t=in:st=0:d=0.25:color=white,fade=t=out:st={fade_out:.3f}:d=0.35:color=white,format=yuv420p"
        run([
            FFMPEG, "-y", "-loop", "1", "-framerate", str(FPS), "-i", png, "-i", aiff,
            "-vf", vf, "-af", f"apad,afade=t=in:st=0:d=0.12,afade=t=out:st={max(0.1, duration-0.3):.3f}:d=0.3",
            "-t", f"{duration:.3f}", "-r", str(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", "-movflags", "+faststart", segment,
        ])
        segments.append(segment)
        subtitles.append((cursor, cursor + duration, scene.voice))
        cursor += duration

    concat_file = work / "concat.txt"
    concat_file.write_text("\n".join(f"file '{p.name}'" for p in segments), encoding="utf-8")
    raw = work / f"{name}-raw.mp4"
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", concat_file, "-c", "copy", raw])
    music = work / "music.wav"
    music_bed(music, cursor + 1, promo)
    final = OUT / ("Liria_Gestion_Pro_Publicite_60s.mp4" if promo else "Liria_Gestion_Pro_Guide_Video_Complet.mp4")
    volume = "0.11" if promo else "0.035"
    run([
        FFMPEG, "-y", "-i", raw, "-i", music,
        "-filter_complex", f"[0:a]volume=1.0[voice];[1:a]volume={volume}[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=2[a]",
        "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final,
    ])
    srt = final.with_suffix(".srt")
    entries = []
    for i, (start, end, content) in enumerate(subtitles, 1):
        wrapped = "\n".join(textwrap.wrap(content, 78))
        entries.append(f"{i}\n{format_srt_time(start)} --> {format_srt_time(end)}\n{wrapped}\n")
    srt.write_text("\n".join(entries), encoding="utf-8")
    return final, cursor


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    if not LOGO_PATH.exists() or not PRESENTER_PATH.exists():
        raise SystemExit("Missing video assets")
    if not FFMPEG.exists():
        raise SystemExit(f"Missing ffmpeg: {FFMPEG}")
    tutorial, tutorial_duration = create_video("tutoriel", TUTORIAL, promo=False)
    promo, promo_duration = create_video("publicite", PROMO, promo=True)
    print(f"TUTORIAL={tutorial} DURATION={tutorial_duration:.1f}s")
    print(f"PROMO={promo} DURATION={promo_duration:.1f}s")


if __name__ == "__main__":
    main()
