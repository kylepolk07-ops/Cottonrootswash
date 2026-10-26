from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "marketing"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 2550, 3300
GREEN = "#123e31"
GREEN_2 = "#1f654c"
GOLD = "#c89b3c"
CREAM = "#fbf5e8"
INK = "#17352b"
WHITE = "#ffffff"

sans = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
sans_bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
serif_bold = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

def font(path, size):
    return ImageFont.truetype(path, size)

im = Image.new("RGB", (W, H), CREAM)
d = ImageDraw.Draw(im)

# Deep green header and soft gold footer.
d.rounded_rectangle((-80, -80, W + 80, 820), radius=150, fill=GREEN)
d.rectangle((0, 3100, W, H), fill=GREEN)
d.rectangle((0, 790, W, 820), fill=GOLD)

logo = Image.open(ROOT / "web" / "brand-mark.png").convert("RGBA")
logo.thumbnail((450, 450), Image.Resampling.LANCZOS)
im.alpha_composite(logo, (1050, 25)) if im.mode == "RGBA" else im.paste(logo, (1050, 25), logo)

def centered(text, y, fnt, fill, spacing=4):
    box = d.multiline_textbbox((0, 0), text, font=fnt, align="center", spacing=spacing)
    x = (W - (box[2] - box[0])) // 2
    d.multiline_text((x, y), text, font=fnt, fill=fill, align="center", spacing=spacing)

centered("COTTON ROOTS & CO.", 445, font(serif_bold, 120), "#f4d58b")
centered("WASH  •  DRY  •  FOLD", 590, font(sans_bold, 54), WHITE)
centered("One little step. Fresh beginnings.", 685, font(sans, 48), WHITE)

centered("WE DO THE LAUNDRY.\nYOU GET YOUR TIME BACK.", 880, font(serif_bold, 92), GREEN, spacing=12)

# Simple, readable pricing for a small handout.
d.rounded_rectangle((170, 1135, 1230, 1470), radius=60, fill="#efe5c8", outline=GOLD, width=10)
d.rounded_rectangle((1320, 1135, 2380, 1470), radius=60, fill="#efe5c8", outline=GOLD, width=10)
centered_left = lambda text, x, y, fnt, fill: d.multiline_text((x, y), text, font=fnt, fill=fill, align="center", spacing=8)
centered_left("DROP-OFF\n$2.50 / LB", 455, 1190, font(sans_bold, 66), GREEN)
centered_left("PICKUP + RETURN\n$3.00 / LB", 1515, 1190, font(sans_bold, 66), GREEN)
centered("First 5 round-trip miles free  •  Rush service +$1.00/lb", 1505, font(sans_bold, 40), INK)
centered("SCAN TO CREATE YOUR ACCOUNT", 1585, font(sans_bold, 53), GREEN)

qr = Image.open(OUT / "cotton-roots-app-qr.png").convert("RGB")
qr = qr.resize((1050, 1050), Image.Resampling.NEAREST)
qx, qy = (W - 1050) // 2, 1670
d.rounded_rectangle((qx - 35, qy - 35, qx + 1085, qy + 1085), radius=48, fill=WHITE, outline=GOLD, width=18)
im.paste(qr, (qx, qy))

centered("Drop off or choose delivery  •  Track every step  •  Earn rewards", 2775, font(sans_bold, 38), INK)

d.rounded_rectangle((190, 2870, W - 190, 3050), radius=52, fill="#efe5c8", outline=GOLD, width=8)
centered("OPEN 8 AM–9 PM", 2895, font(sans_bold, 62), GREEN)
centered("Questions? Call 903-426-1543", 2980, font(sans, 40), INK)

centered("ONE LITTLE STEP. FRESH BEGINNINGS.", 3160, font(sans_bold, 36), WHITE)

png = OUT / "cotton-roots-app-flyer.png"
pdf = OUT / "cotton-roots-app-flyer.pdf"
im.save(png, dpi=(300, 300), optimize=True)
im.save(pdf, "PDF", resolution=300.0, quality=95)
print(f"Created {png}")
print(f"Created {pdf}")
