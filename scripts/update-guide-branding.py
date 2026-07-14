#!/usr/bin/env python3
"""Replace the legacy guide cover with the Liria Gestion Pro identity."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output/pdf/Guide_utilisation_Liria_Gestion_Pro.pdf"
PUBLIC = ROOT / "public/guides/Guide_utilisation_Liria_Gestion_Pro.pdf"
LOGO = ROOT / "public/liria-gestion-pro-logo.png"

NAVY = HexColor("#0b1f35")
BLUE = HexColor("#0d67e8")
MUTED = HexColor("#64748b")
GOLD_PALE = HexColor("#fff8e8")
GOLD_LINE = HexColor("#d5a536")

pdfmetrics.registerFont(TTFont("Arial", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))


def cropped_logo() -> Image.Image:
    img = Image.open(LOGO).convert("RGB")
    px = img.load()
    points = [(x, y) for y in range(img.height) for x in range(img.width) if min(px[x, y]) < 242]
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    pad = 25
    return img.crop((max(0, min(xs) - pad), max(0, min(ys) - pad), min(img.width, max(xs) + pad), min(img.height, max(ys) + pad)))


def cover_pdf() -> BytesIO:
    stream = BytesIO()
    c = canvas.Canvas(stream, pagesize=A4)
    width, height = A4
    logo = cropped_logo()
    logo_buffer = BytesIO()
    logo.save(logo_buffer, format="PNG")
    logo_buffer.seek(0)
    ratio = logo.height / logo.width
    logo_width = 230
    c.drawImage(ImageReader(logo_buffer), (width - logo_width) / 2, 575, width=logo_width, height=logo_width * ratio, preserveAspectRatio=True, mask="auto")

    c.setFillColor(NAVY)
    c.setFont("Arial-Bold", 24)
    c.drawCentredString(width / 2, 510, "Liria Gestion Pro")
    c.setFont("Arial-Bold", 23)
    c.drawCentredString(width / 2, 455, "Guide complet d'utilisation")
    c.setFillColor(MUTED)
    c.setFont("Arial", 13)
    c.drawCentredString(width / 2, 413, "Administrateurs, responsables, comptables et équipes terrain")

    left, right, top, row_h = 99, 496, 370, 27
    labels = ["Version du guide", "Application", "Logiciel"]
    values = ["1.0 - 14 juillet 2026", "https://liria-concept-gestion-btp.vercel.app", "Liria Gestion Pro"]
    for i, (label, value) in enumerate(zip(labels, values)):
        y = top - (i + 1) * row_h
        c.setFillColor(NAVY)
        c.rect(left, y, 136, row_h, fill=1, stroke=0)
        c.setStrokeColor(HexColor("#dce5ef"))
        c.setFillColor(white)
        c.setFont("Arial-Bold", 8.5)
        c.drawString(left + 11, y + 9, label)
        c.setFillColor(white)
        c.rect(left + 136, y, right - left - 136, row_h, fill=1, stroke=1)
        c.setFillColor(NAVY)
        c.setFont("Arial", 8)
        c.drawString(left + 147, y + 9, value)

    c.setFillColor(GOLD_PALE)
    c.setStrokeColor(GOLD_LINE)
    c.rect(56, 188, width - 112, 54, fill=1, stroke=1)
    c.setFillColor(NAVY)
    c.setFont("Arial-Bold", 10)
    c.drawString(68, 223, "À retenir")
    c.setFont("Arial", 8.5)
    c.drawString(68, 207, "Chaque utilisateur ne voit que les modules et actions autorisés par son poste.")
    c.drawString(68, 194, "Les écrans peuvent donc être absents ou en lecture seule selon les droits définis par l'administrateur.")
    c.showPage()
    c.save()
    stream.seek(0)
    return stream


def copy_outline(reader: PdfReader, writer: PdfWriter):
    def walk(items, parent=None):
        last = None
        for item in items:
            if isinstance(item, list):
                walk(item, last or parent)
                continue
            try:
                page = reader.get_destination_page_number(item)
                last = writer.add_outline_item(item.title, page, parent=parent)
            except Exception:
                last = parent
    try:
        walk(reader.outline)
    except Exception:
        pass


def main():
    original = PdfReader(str(SOURCE))
    cover = PdfReader(cover_pdf())
    writer = PdfWriter()
    writer.add_page(cover.pages[0])
    for page in original.pages[1:]:
        writer.add_page(page)
    writer.add_metadata({
        "/Title": "Guide complet d'utilisation - Liria Gestion Pro",
        "/Author": "Liria Gestion Pro",
        "/Subject": "Utilisation du logiciel Liria Gestion Pro",
    })
    copy_outline(original, writer)
    with SOURCE.open("wb") as handle:
        writer.write(handle)
    PUBLIC.write_bytes(SOURCE.read_bytes())
    print(SOURCE)


if __name__ == "__main__":
    main()
