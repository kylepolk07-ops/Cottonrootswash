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
d.rounded_rectangle((-80, -80, W + 80, 1040), radius=150, fill=GREEN)
d.rectangle((0, 3100, W, H), fill=GREEN)
d.rectangle((0, 1010, W, 1040), fill=GOLD)

logo = Image.open(ROOT / "web" / "brand-mark.png").convert("RGBA")
logo.thumbnail((610, 610), Image.Resampling.LANCZOS)
im.alpha_composite(logo, (970, 55)) if im.mode == "RGBA" else im.paste(logo, (970, 55), logo)

def centered(text, y, fnt, fill, spacing=4):
    box = d.multiline_textbbox((0, 0), text, font=fnt, align="center", spacing=spacing)
    x = (W - (box[2] - box[0])) // 2
    d.multiline_text((x, y), text, font=fnt, fill=fill, align="center", spacing=spacing)

centered("COTTON ROOTS & CO.", 610, font(serif_bold, 128), "#f4d58b")
centered("WASH  &  FOLD", 760, font(sans_bold, 49), WHITE)
centered("One little step. Fresh beginnings.", 845, font(sans, 57), WHITE)

centered("YOUR LAUNDRY.\nOUR CARE.", 1090, font(serif_bold, 132), GREEN, spacing=18)
centered("Wash  •  Dry  •  Fold", 1400, font(sans_bold, 61), GOLD)
centered("SCAN TO CREATE YOUR ACCOUNT", 1495, font(sans_bold, 54), INK)

qr = Image.open(OUT / "cotton-roots-app-qr.png").convert("RGB")
qr = qr.resize((930, 930), Image.Resampling.NEAREST)
qx, qy = (W - 930) // 2, 1600
d.rounded_rectangle((qx - 35, qy - 35, qx + 965, qy + 965), radius=48, fill=WHITE, outline=GOLD, width=18)
im.paste(qr, (qx, qy))

centered("DROP OFF OR CHOOSE DELIVERY", 2610, font(sans_bold, 56), GREEN)
centered("Track every step  •  Earn rewards  •  Pick up fresh", 2700, font(sans, 44), INK)
centered("First visit? Create your account, then get your bag at the shop.", 2775, font(sans_bold, 36), INK)

d.rounded_rectangle((190, 2850, W - 190, 3050), radius=52, fill="#efe5c8", outline=GOLD, width=8)
centered("NORMAL HOURS: 9 AM–5 PM", 2880, font(sans_bold, 56), GREEN)
centered("Need access from 5–9 PM? Call 903-426-1543", 2960, font(sans, 42), INK)

centered("ONE LITTLE STEP. FRESH BEGINNINGS.", 3160, font(sans_bold, 36), WHITE)

png = OUT / "cotton-roots-app-flyer.png"
pdf = OUT / "cotton-roots-app-flyer.pdf"
im.save(png, dpi=(300, 300), optimize=True)
im.save(pdf, "PDF", resolution=300.0, quality=95)
print(f"Created {png}")
print(f"Created {pdf}")
