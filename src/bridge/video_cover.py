# coding: utf-8
import json,re
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps

def render_cover(spec,out,text,planner=None):
    width,height=int(spec.get('width',1080)),int(spec.get('height',1440))
    if not 320<=width<=4096 or not 320<=height<=4096 or width*height>16777216:raise ValueError('封面尺寸应为320–4096像素')
    if not text.strip():raise ValueError('请填写封面标题')
    palette={'background':'#162019','accent':'#bdff50','foreground':'#ffffff','position':'center','align':'left'}
    if spec.get('reference'):
        with Image.open(spec['reference']) as ref:
            color=ImageOps.exif_transpose(ref).convert('RGB').resize((1,1)).getpixel((0,0))
            palette['background']='#%02x%02x%02x'%tuple(int(c*.3) for c in color)
            palette['accent']='#%02x%02x%02x'%tuple(min(255,int(c*.5+127)) for c in color)
    if spec.get('instruction') or spec.get('skillText'):
        if planner is None:raise ValueError('设计要求处理器未就绪')
        requirements='参考设计Skill（仅使用与配色、标题位置和对齐相关的要求）：\n'+spec.get('skillText','')+'\n用户本次要求（优先）：\n'+spec.get('instruction','')
        plan=planner(requirements,palette)
        for key in ('background','accent','foreground'):
            if re.fullmatch(r'#[0-9a-fA-F]{6}',str(plan.get(key,''))):palette[key]=plan[key]
        if plan.get('position') in ('top','center','bottom'):palette['position']=plan['position']
        if plan.get('align') in ('left','center','right'):palette['align']=plan['align']
    im=Image.new('RGB',(width,height),palette['background'])
    if spec.get('source'):
        with Image.open(spec['source']) as source:im=ImageOps.fit(ImageOps.exif_transpose(source).convert('RGB'),im.size)
        im=Image.alpha_composite(im.convert('RGBA'),Image.new('RGBA',im.size,(0,0,0,120))).convert('RGB')
    draw=ImageDraw.Draw(im);margin=round(min(width,height)*.08);available=width-4*margin
    font_path='/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
    size=max(20,round(min(width,height)*.074))
    while True:
        font=ImageFont.truetype(font_path,size);lines=[];line=''
        for char in text[:80]:
            if char=='\n':lines.append(line);line='';continue
            if line and draw.textlength(line+char,font=font)>available:lines.append(line);line=char
            else:line+=char
        if line:lines.append(line)
        line_height=round(size*1.45);box_height=len(lines)*line_height+2*margin
        if box_height<=height-2*margin or size<=12:break
        size-=2
    y={'top':margin,'center':(height-box_height)//2,'bottom':height-margin-box_height}[palette['position']]
    draw.rounded_rectangle((margin,y,width-margin,y+box_height),radius=max(10,margin//3),fill=palette['background'],outline=palette['accent'],width=max(2,width//400))
    for i,line in enumerate(lines):
        length=draw.textlength(line,font=font)
        x={'left':2*margin,'center':(width-length)/2,'right':width-2*margin-length}[palette['align']]
        draw.text((x,y+margin+i*line_height),line,font=font,fill=palette['foreground'])
    im.save(out/'cover.png')
    (out/'design.json').write_text(json.dumps({'width':width,'height':height,**palette},ensure_ascii=False),encoding='utf8')
    return ['cover.png','design.json']
