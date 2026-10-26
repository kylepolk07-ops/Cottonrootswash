from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "marketing" / "cotton-roots-app-flyer.png"
OUTPUT = ROOT / "assets" / "marketing" / "cotton-roots-customer-flyers-4-per-page.pdf"

page_w, page_h = letter
margin = 14.4  # 0.2 inch
gutter = 7.2   # 0.1 inch
card_w = (page_w - 2 * margin - gutter) / 2
card_h = (page_h - 2 * margin - gutter) / 2

pdf = canvas.Canvas(str(OUTPUT), pagesize=letter)
pdf.setTitle("Cotton Roots Customer Flyers — 4 Per Page")

for row in range(2):
    for col in range(2):
        x = margin + col * (card_w + gutter)
        y = page_h - margin - (row + 1) * card_h - row * gutter
        pdf.drawImage(str(SOURCE), x, y, width=card_w, height=card_h, preserveAspectRatio=True, anchor="c")

# Light cut guides through the center gutters.
pdf.setStrokeColorRGB(0.62, 0.62, 0.62)
pdf.setLineWidth(0.5)
pdf.setDash(3, 3)
pdf.line(page_w / 2, 4, page_w / 2, page_h - 4)
pdf.line(4, page_h / 2, page_w - 4, page_h / 2)

pdf.showPage()
pdf.save()
print(f"Created {OUTPUT}")
