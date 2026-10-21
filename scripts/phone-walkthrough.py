"""Lay out captured real-app screens in a phone-readable visual walkthrough."""
import json,sys
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from PIL import Image
pdfmetrics.registerFont(TTFont('DejaVu','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuBold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
captures=json.load(open(sys.argv[1]));output=sys.argv[2]
w,h=390,844
c=canvas.Canvas(output,pagesize=(w,h));c.setTitle('Cotton Roots & Co. — Phone Visual Walkthrough');c.setAuthor('Cotton Roots development team')
cream=HexColor('#f7f4ee');sage=HexColor('#2d4a3d');ink=HexColor('#233229')
def text(value,x,y,size=13,font='DejaVu',color=ink):
 c.setFillColor(color);c.setFont(font,size);c.drawString(x,y,value)
def wrap(value,x,y,width=342,size=13,font='DejaVu',leading=20):
 words=value.split();line=''
 for word in words:
  trial=(line+' '+word).strip()
  if pdfmetrics.stringWidth(trial,font,size)>width:
   text(line,x,y,size,font);y-=leading;line=word
  else:line=trial
 if line:text(line,x,y,size,font);y-=leading
 return y
def base(n):
 c.setFillColor(cream);c.rect(0,0,w,h,fill=1,stroke=0)
 c.setFillColor(sage);c.rect(0,h-64,w,64,fill=1,stroke=0)
 text('COTTON ROOTS & CO.',24,h-36,13,'DejaVuBold',HexColor('#ffffff'))
 text('Visual preview only • synthetic data',24,24,10)
 text(f'{n} / {len(captures)+1}',330,24,10)
base(1)
y=735
y=wrap('Try the look and follow the steps',24,y,size=26,font='DejaVuBold',leading=36)
y-=20
y=wrap('A phone-friendly walkthrough of the actual Customer, Contractor and Management screens.',24,y,size=16,leading=25)
y-=22
y=wrap('This PDF is not interactive. It shows real screens captured from the locally tested staging apps. A hosted test link is still pending.',24,y,size=14,leading=23)
y-=22
y=wrap('What was exercised',24,y,size=17,font='DejaVuBold',leading=26)
for item in ['Customer bag claim, booking and drop-off.', 'Rejected wrong-bag scan with recovery.', 'Contractor acceptance, weighing and separate shop return.', '12.1 lb rounded to 12.5 lb.', 'Pending payment and earnings, with pickup blocked.', 'Owner Management access; customer and contractor denied.']:
 y=wrap('• '+item,24,y,size=13,leading=21);y-=8
y-=12
wrap('No real payments, identity documents, public registration or real-phone camera checks are included.',24,y,size=12,leading=19)
c.showPage()
for n,item in enumerate(captures,2):
 base(n)
 y=wrap(item['title'],24,751,size=19,font='DejaVuBold',leading=26)
 y=wrap(item['caption'],24,y-9,size=12,leading=18)
 top=y-12;maxheight=top-56
 im=Image.open(item['path']);iw,ih=im.size;scale=min(342/iw,maxheight/ih);dw,dh=iw*scale,ih*scale
 c.drawImage(ImageReader(im),(w-dw)/2,top-dh,dw,dh,mask='auto')
 c.showPage()
c.save()
from pypdf import PdfReader
r=PdfReader(output)
assert len(r.pages)==len(captures)+1
assert 'not interactive' in '\n'.join(p.extract_text() for p in r.pages)
print(f'PDF verified: {len(r.pages)} pages, real-app images and explicit preview limits. Output: {output}')
