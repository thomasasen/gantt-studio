#!/usr/bin/env python3
"""DOM-basierte Markierungen und externe Legenden, ohne die Oberfläche nachzubauen."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, math, argparse
def font(n, bold=False):
    name='/usr/share/fonts/truetype/dejavu/DejaVuSans'+('-Bold.ttf' if bold else '.ttf')
    try: return ImageFont.truetype(name,n)
    except OSError: return ImageFont.load_default()
ACCENT='#176a82'; INK='#20374e'; PAPER='#f2f6f8'; WHITE='#ffffff'
def create(entry, src):
    im=Image.open(src/(entry['name']+'.png')).convert('RGB')
    if entry.get('exported'):
        if im.width>3400: im=im.resize((3400,round(im.height*3400/im.width)),Image.Resampling.LANCZOS)
        return im
    marks=entry['marks']
    if not marks:return im
    w,h=im.size
    footer=70+math.ceil(len(marks)/2)*70
    final=Image.new('RGB',(w,h+footer),WHITE);final.paste(im)
    d=ImageDraw.Draw(final)
    d.rectangle((0,h,w,h+footer),fill=PAPER)
    d.line((0,h,w,h),fill='#bacbd5',width=2)
    d.text((31,h+18),'IM BILD MARKIERT',font=font(19,True),fill=INK)
    for i,m in enumerate(marks):
        num=str(i+1); x,y=int(m['x']),int(m['y'])
        d.line((max(15,x-24),min(h-15,y+24),x,y),fill=WHITE,width=6)
        d.line((max(15,x-24),min(h-15,y+24),x,y),fill=ACCENT,width=3)
        d.ellipse((x-19,y-19,x+19,y+19),fill=ACCENT,outline=WHITE,width=3)
        box=d.textbbox((0,0),num,font=font(20,True))
        d.text((x-(box[2]-box[0])/2,y-(box[3]-box[1])/2-4),num,fill=WHITE,font=font(20,True))
        col,row=i%2,i//2; lx,ly=34+col*(w//2),h+63+row*70
        d.ellipse((lx,ly,lx+31,ly+31),fill=ACCENT)
        d.text((lx+(10 if i<9 else 5),ly+5),num,fill=WHITE,font=font(17,True))
        label=m['label']
        while d.textlength(label,font=font(18))>w//2-105:label=label[:-1]
        if label!=m['label']:label=label[:-1]+'…'
        d.text((lx+45,ly+6),label,fill=INK,font=font(18))
    return final
def main():
    p=argparse.ArgumentParser();p.add_argument('--source',default='/tmp/gantt-readme-capture');p.add_argument('--output',default='docs/images/readme')
    a=p.parse_args();src=Path(a.source);dst=Path(a.output);dst.mkdir(parents=True,exist_ok=True)
    manifest=json.loads((src/'manifest.json').read_text())
    assert len(manifest['files'])==16 and not manifest['errors'],manifest['errors']
    items=[]
    for entry in manifest['files']:
        img=create(entry,src);out=dst/(entry['name']+'.webp')
        img.save(out,'WEBP',quality=88,method=6)
        with Image.open(out) as saved: assert saved.size==img.size
        items.append((entry,img))
        print(out,'dim=',img.size,'size=',out.stat().st_size)
    columns=4;cw,ch=452,302;rows=math.ceil(len(items)/columns)
    canvas=Image.new('RGB',(1850,85+rows*ch),WHITE);d=ImageDraw.Draw(canvas)
    d.text((20,12),'Gantt Studio · Bildübersicht der README',fill=INK,font=font(29,True))
    d.text((21,54),'15 echte Chromium-Aufnahmen und 1 echter PNG-Export',fill=ACCENT,font=font(16))
    for i,(entry,img) in enumerate(items):
        x=20+i%columns*458;y=86+i//columns*ch
        t=img.copy();t.thumbnail((438,246),Image.Resampling.LANCZOS)
        canvas.paste(t,(x+(438-t.width)//2,y+(246-t.height)//2))
        d.rectangle((x,y,x+438,y+246),outline='#bacbd5',width=1)
        d.text((x+3,y+251),entry['name'].replace('-',' '),fill=INK,font=font(15,True))
    canvas.save(dst/'00-kontaktuebersicht.webp','WEBP',quality=87,method=6)
    print('OK:',len(items),'Dokumentationsbilder + Kontaktübersicht')
if __name__=='__main__':main()
