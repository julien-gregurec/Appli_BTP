#!/usr/bin/env python3
"""Manuel utilisateur Liria Gestion Pro.

Chaque chapitre de module suit la même trame : à quoi ça sert, qui y a accès,
l'écran principal, la création pas à pas, la fiche, les statuts, le mobile,
les liens avec les autres modules, les erreurs fréquentes.

Les illustrations sont de VRAIES captures produites par scripts/capturer-guide.mjs
sur l'entreprise de démonstration (données fictives). Aucune maquette dessinée.

    python3 scripts/guide/generer_manuel.py
"""
import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, CondPageBreak, Frame, Image, KeepTogether,
                                NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle)

RACINE = Path(__file__).resolve().parents[2]
CAPTURES = RACINE / "output/audit"
SORTIE = RACINE / "output/guide/Manuel_Liria_Gestion_Pro.pdf"
LOGO = RACINE / "public/liria-gestion-pro-logo-v3.png"

MARINE = colors.HexColor("#0d1b2a")
OR = colors.HexColor("#c9a24a")
GRIS = colors.HexColor("#5b6472")
GRIS_CLAIR = colors.HexColor("#eef1f5")

pdfmetrics.registerFont(TTFont("L", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("L-B", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("L-I", "/System/Library/Fonts/Supplemental/Arial Italic.ttf"))

S = getSampleStyleSheet()
ST = {
    "corps": ParagraphStyle("corps", fontName="L", fontSize=9.5, leading=14.5,
                            alignment=TA_JUSTIFY, spaceAfter=6, textColor=colors.HexColor("#1a1a1a")),
    # Pas de keepWithNext ici : à l'intérieur d'un bloc section(), il réclamerait
    # d'être soudé à CE QUI SUIT le bloc, et repousserait des pages entières.
    # C'est section() qui garantit qu'un titre reste avec son contenu.
    "h1": ParagraphStyle("h1", fontName="L-B", fontSize=22, leading=26, textColor=MARINE, spaceAfter=4),
    "h2": ParagraphStyle("h2", fontName="L-B", fontSize=13, leading=17, textColor=MARINE,
                         spaceBefore=12, spaceAfter=5),
    "h3": ParagraphStyle("h3", fontName="L-B", fontSize=10.5, leading=14, textColor=colors.HexColor("#243b53"),
                         spaceBefore=8, spaceAfter=3),
    "legende": ParagraphStyle("legende", fontName="L-I", fontSize=7.8, leading=10, textColor=GRIS,
                              spaceBefore=3, spaceAfter=10),
    "petit": ParagraphStyle("petit", fontName="L", fontSize=8, leading=11.5),
    "petit_b": ParagraphStyle("petit_b", fontName="L-B", fontSize=8, leading=11.5),
    "toc1": ParagraphStyle("toc1", fontName="L-B", fontSize=9.5, leading=16, textColor=MARINE),
    "toc2": ParagraphStyle("toc2", fontName="L", fontSize=9, leading=14, leftIndent=12, textColor=GRIS),
    "chapo": ParagraphStyle("chapo", fontName="L", fontSize=10.5, leading=15.5, textColor=GRIS,
                            alignment=TA_JUSTIFY, spaceAfter=10),
}

SOMMAIRE = []  # (niveau, titre, page)


def p(texte, style="corps"):
    return Paragraph(texte, ST[style])


class Titre(Paragraph):
    """Titre qui s'enregistre dans le sommaire au moment du rendu."""

    def __init__(self, texte, niveau=1):
        super().__init__(texte, ST["h1" if niveau == 1 else "h2"])
        self.texte_brut = texte
        self.niveau = niveau

    def draw(self):
        SOMMAIRE.append((self.niveau, self.texte_brut, self.canv.getPageNumber()))
        self.canv.bookmarkPage(f"b{len(SOMMAIRE)}")
        self.canv.addOutlineEntry(self.texte_brut[:80], f"b{len(SOMMAIRE)}", level=self.niveau - 1)
        super().draw()


def capture(nom, legende, hauteur_max=8 * cm, rogner=False):
    """Insère une vraie capture d'écran. Ignorée proprement si absente.

    Une capture très haute (page longue) deviendrait un ruban vertical illisible
    une fois réduite à la largeur d'une page. Au-delà d'un rapport hauteur/largeur
    de 2,5, on n'affiche donc que le haut de l'image — ce que l'utilisateur voit à
    l'écran — plutôt que de l'écraser entière.

    `rogner` retire les marges blanches : indispensable pour les pages
    d'impression, où le document flotte au milieu d'un grand fond vide.
    """
    chemin = CAPTURES / nom
    if not chemin.exists():
        return []

    if rogner:
        from PIL import Image as PILImage, ImageChops
        PILImage.MAX_IMAGE_PIXELS = None
        rognee = CAPTURES / f"_rogne_{nom}"
        with PILImage.open(chemin) as src:
            rgb = src.convert("RGB")
            fond = PILImage.new("RGB", rgb.size, (255, 255, 255))
            boite = ImageChops.difference(rgb, fond).getbbox()
            if boite:
                m, (x0, y0, x1, y1) = 12, boite
                rgb.crop((max(0, x0 - m), max(0, y0 - m),
                          min(rgb.width, x1 + m), min(rgb.height, y1 + m))).save(rognee)
                chemin = rognee

    lecteur = ImageReader(str(chemin))
    largeur, hauteur = lecteur.getSize()

    # 2,5 laisse passer une capture de téléphone entière (rapport ~2,2) et ne
    # recadre que les images réellement anormales.
    RAPPORT_MAX = 2.5
    if hauteur / largeur > RAPPORT_MAX:
        from PIL import Image as PILImage
        PILImage.MAX_IMAGE_PIXELS = None
        recadree = CAPTURES / f"_cadre_{nom}"
        with PILImage.open(chemin) as src:
            src.crop((0, 0, largeur, int(largeur * RAPPORT_MAX))).save(recadree)
        chemin, hauteur = recadree, int(largeur * RAPPORT_MAX)
        legende += " (haut de l'écran)"

    largeur_max = 16.4 * cm
    ratio = min(largeur_max / largeur, hauteur_max / hauteur)
    img = Image(str(chemin), width=largeur * ratio, height=hauteur * ratio)
    img.hAlign = "CENTER"
    img.drawHeight = hauteur * ratio
    # Pas de KeepTogether : après un tableau scindé, reportlab refuse d'y poser
    # un bloc pourtant plus petit que la place restante, et vide la page.
    # CondPageBreak réserve la hauteur nécessaire à l'image ET à sa légende.
    return [CondPageBreak(hauteur * ratio + 28), Spacer(1, 4), img, p(legende, "legende")]


# Seuil du saut de chapitre : « la page est-elle déjà vierge ? »
#
# On ne peut pas comparer à la hauteur exacte du cadre. Le dernier tableau d'un
# chapitre laisse un Spacer de 8 pt qui déborde parfois seul en haut de la page
# suivante : il ne reste alors que 714,83 pt sur 722,83, et un seuil trop strict
# déclenchait un saut sur une page pourtant vide — c'était la cause des pages
# blanches. Une marge de 25 pt absorbe ces résidus : une page qui n'a reçu que
# quelques points d'espacement compte comme vierge.
HAUTEUR_CADRE = A4[1] - 4.2 * cm - 25


def saut_de_chapitre():
    """Passe à une page neuve, sauf si l'on s'y trouve déjà.

    PageBreak() saute toujours : quand un chapitre se termine pile en bas de
    page, il fabrique une page blanche. CondPageBreak ne saute que s'il reste
    moins que la hauteur du cadre, c'est-à-dire si la page est entamée.
    """
    return CondPageBreak(HAUTEUR_CADRE)


def titre(texte, niveau, reserve=110):
    """Titre précédé d'une réserve de place.

    Le garde-fou doit être posé AVANT le titre : placé après, il ferait sauter
    la page en laissant justement le titre orphelin. 110 pt couvrent le titre,
    l'en-tête d'un tableau et ses deux premières lignes.
    """
    return [CondPageBreak(reserve), Titre(texte, niveau)]


def section(texte, niveau, blocs):
    """Titre + son contenu, garantis sur la même page.

    On n'utilise pas KeepTogether : après un tableau scindé, reportlab refuse
    d'y poser un bloc pourtant deux fois plus petit que la place restante, ce
    qui vide des pages entières. CondPageBreak est l'outil prévu : il ne
    change de page que si la hauteur demandée manque réellement.
    """
    besoin = 40  # le titre et son espacement
    for b in blocs:
        besoin += getattr(b, "drawHeight", 0) or 0
    besoin += 30  # légende
    # Les CondPageBreak internes deviennent inutiles : le titre a déjà réservé
    # la place du bloc entier. Les garder provoquerait un second saut de page.
    blocs = [b for b in blocs if not isinstance(b, CondPageBreak)]
    return [CondPageBreak(besoin), Titre(texte, niveau), *blocs]


def tableau(entetes, lignes, largeurs):
    data = [[Paragraph(f"<b>{h}</b>", ST["petit_b"]) for h in entetes]]
    data += [[Paragraph(str(c), ST["petit"]) for c in ligne] for ligne in lignes]
    t = Table(data, colWidths=largeurs, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), MARINE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d6dbe3")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, GRIS_CLAIR]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    # Ne jamais appeler t.wrap() ici : mesurer un tableau avant qu'il soit placé
    # corrompt son état de découpe et produit des pages blanches. La place se
    # réserve en amont, via titre() / section().
    return [t, Spacer(1, 8)]


def encadre(titre, texte, couleur=OR):
    inner = [Paragraph(f"<b>{titre}</b>", ST["petit_b"]), Spacer(1, 2), Paragraph(texte, ST["petit"])]
    t = Table([[inner]], colWidths=[16.4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fbf7ee")),
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, couleur),
        ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [t, Spacer(1, 8)]


def etapes(liste):
    """Procédure numérotée : chaque étape est une action concrète."""
    out = []
    for i, (action, detail) in enumerate(liste, 1):
        num = Table([[Paragraph(f"<b>{i}</b>", ParagraphStyle("n", fontName="L-B", fontSize=9,
                     textColor=colors.white, alignment=1))]], colWidths=[0.55 * cm], rowHeights=[0.55 * cm])
        num.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), MARINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        texte = Paragraph(f"<b>{action}</b><br/>{detail}", ST["petit"])
        ligne = Table([[num, texte]], colWidths=[0.9 * cm, 15.5 * cm])
        ligne.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
        out.append(ligne)
    return out


# ─────────────────────────── habillage des pages ───────────────────────────
def page_courante(canvas, doc):
    canvas.saveState()
    canvas.setFont("L", 7.5)
    canvas.setFillColor(GRIS)
    canvas.drawString(2 * cm, 1.4 * cm, "Liria Gestion Pro — Manuel d'utilisation")
    canvas.drawRightString(19 * cm, 1.4 * cm, str(canvas.getPageNumber()))
    canvas.setStrokeColor(colors.HexColor("#e3e7ee"))
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, 1.8 * cm, 19 * cm, 1.8 * cm)
    canvas.restoreState()


def page_couverture(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(MARINE)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(OR)
    canvas.rect(0, A4[1] - 0.5 * cm, A4[0], 0.5 * cm, fill=1, stroke=0)
    if LOGO.exists():
        canvas.drawImage(str(LOGO), 2 * cm, A4[1] - 6 * cm, width=4.5 * cm, height=4.5 * cm,
                         mask="auto", preserveAspectRatio=True, anchor="sw")
    canvas.setFillColor(colors.white)
    canvas.setFont("L-B", 34)
    canvas.drawString(2 * cm, A4[1] - 10 * cm, "Manuel d'utilisation")
    canvas.setFont("L", 15)
    canvas.setFillColor(OR)
    canvas.drawString(2 * cm, A4[1] - 11.2 * cm, "Liria Gestion Pro")
    canvas.setFillColor(colors.HexColor("#b9c2ce"))
    canvas.setFont("L", 10)
    canvas.drawString(2 * cm, 3.2 * cm, "Logiciel de gestion pour les entreprises du bâtiment")
    canvas.drawString(2 * cm, 2.6 * cm, "Captures réalisées sur une entreprise de démonstration — données fictives")
    canvas.restoreState()


def _document():
    doc = BaseDocTemplate(str(SORTIE), pagesize=A4, title="Manuel d'utilisation — Liria Gestion Pro",
                          author="Liria Gestion Pro", leftMargin=2 * cm, rightMargin=2 * cm,
                          topMargin=2 * cm, bottomMargin=2.2 * cm)
    # Marges intérieures annulées : sinon la hauteur utile réelle (710 pt) ne
    # correspond plus à HAUTEUR_CADRE et le saut de chapitre se déclencherait
    # même en haut d'une page vierge.
    cadre = Frame(2 * cm, 2.2 * cm, 17 * cm, A4[1] - 4.2 * cm, id="c",
                  leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    doc.addPageTemplates([
        PageTemplate(id="couverture", frames=[cadre], onPage=page_couverture),
        PageTemplate(id="courante", frames=[cadre], onPage=page_courante),
    ])
    return doc


def _sommaire_imprime(entrees, decalage):
    """Construit la table des matières à partir des titres relevés."""
    if not entrees:
        return []
    lignes = []
    for niveau, titre, page in entrees:
        style = "toc1" if niveau == 1 else "toc2"
        points = '<font color="#c9d0d9"> ' + "." * 60 + "</font>"
        lignes.append(Table(
            [[Paragraph(f"{titre}{points}", ST[style]), Paragraph(str(page + decalage), ST[style])]],
            colWidths=[15.4 * cm, 1 * cm],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                              ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                              ("TOPPADDING", (0, 0), (-1, -1), 1)])))
    return [Paragraph("Sommaire", ST["h1"]), Spacer(1, 10), *lignes, PageBreak()]


def construire():
    from contenu import chapitres  # noqa: E402

    corps = []
    for bloc in chapitres():
        corps.extend(bloc)

    # Passe 1 : rendu à blanc pour relever la page de chaque titre.
    SOMMAIRE.clear()
    _document().build([NextPageTemplate("courante"), PageBreak(), *corps])
    releve = list(SOMMAIRE)

    # Passe 2 : on insère le sommaire, ce qui décale la pagination d'autant de pages.
    pages_sommaire = max(1, (len(releve) * 17) // 700 + 1)
    SOMMAIRE.clear()
    corps2 = []
    for bloc in chapitres():
        corps2.extend(bloc)
    _document().build([NextPageTemplate("courante"), PageBreak(),
                       *_sommaire_imprime(releve, pages_sommaire), *corps2])
    print(f"Sommaire : {len(releve)} entrées sur {pages_sommaire} page(s)")


if __name__ == "__main__":
    raise SystemExit("Lancez scripts/guide/build.py (voir la docstring de build.py).")
