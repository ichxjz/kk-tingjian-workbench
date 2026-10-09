# coding: utf-8
"""Local media and writing workers. Model inference never calls DouSnap."""
import json, sys, os, subprocess, shutil, re
from pathlib import Path
from video_subtitles import extract_subtitles
from opencc import OpenCC
ROOT = Path(__file__).resolve().parents[2]

def model(name):
    folder = Path(os.environ.get('HF_HUB_CACHE',str(Path.home()/'.cache/huggingface/hub')))/('models--'+name.replace('/', '--'))/'snapshots'
    choices = sorted((p for p in folder.glob('*') if p.is_dir() and (p/'config.json').exists()), key=lambda p:p.stat().st_mtime, reverse=True)
    if not choices:
        raise ValueError(('语音字幕模型尚未安装，请在 KK-听见控制窗口点击「安装语音字幕组件与模型」' if 'whisper' in name else '智能排版模型尚未安装，请在 KK-听见控制窗口点击「安装封面智能排版模型」') if os.environ.get('KK_DESKTOP_INSTANCE') else '本机缺少模型：'+name)
    return str(choices[0])

def command(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=900)

def transcribe(source, out):
    speech_model=model('mlx-community/whisper-base-mlx')
    import mlx_whisper
    wave = out/'audio.wav'
    command([os.environ.get('KK_FFMPEG',str(Path.home()/'.local/bin/ffmpeg')),'-y','-protocol_whitelist','file,pipe','-i',source,'-vn','-ac','1','-ar','16000',str(wave)])
    r=mlx_whisper.transcribe(str(wave), path_or_hf_repo=speech_model, verbose=False)
    text=r.get('text','').strip()
    if r.get('language')=='zh':
        converter=OpenCC('t2s');text=converter.convert(text)
        for segment in r.get('segments',[]):segment['text']=converter.convert(segment['text'])
    def stamp(sec):
        ms=int(sec*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    (out/'subtitles.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(s['start'])} --> {stamp(s['end'])}\n{s['text'].strip()}" for i,s in enumerate(r.get('segments',[]))),encoding='utf8')
    return text,['audio.wav','subtitles.srt']

def run(spec):
    out=Path(spec['output']);kind=spec['kind'];text=spec.get('text') or (spec.get('sourceText') if not spec.get('url') else '') or '';files=[];message='已在本机完成处理'
    inherited=[]
    if spec.get('url') and kind!='download':
        run({**spec,'kind':'download'})
        acquired=json.loads((out/'result.json').read_text(encoding='utf8'))
        inherited=acquired['files']
        image=next((f for f in inherited if Path(f).suffix in ['.jpg','.jpeg','.png','.webp']),None)
        media=next((f for f in inherited if Path(f).suffix in ['.mp4','.mov','.webm','.mkv','.mp3','.wav','.m4a']),None)
        if not media and not (image and kind in ['ocr','cover']):raise ValueError('源链接未提取到可处理的媒体')
        spec['source']=str(out/(media or image))
        if kind in ['ocr','cover']:
            image=next((f for f in inherited if Path(f).suffix in ['.jpg','.jpeg','.png','.webp']),None)
            if not image:
                command([os.environ.get('KK_FFMPEG',str(Path.home()/'.local/bin/ffmpeg')),'-y','-i',spec['source'],'-frames:v','1',str(out/'source-frame.png')])
                image='source-frame.png';inherited.append(image)
            spec['source']=str(out/image)
            if kind=='cover' and not text:text=acquired.get('text','').split('\n')[0][:80] or '视频封面'
        elif kind not in ['transcribe','subtitles']:
            transcript,extra=transcribe(spec['source'],out);inherited+=extra
            (out/'source-transcript.txt').write_text(transcript,encoding='utf8');inherited.append('source-transcript.txt')
            if kind=='clone':
                spec['voice']=str(out/'reference.wav')
                command([os.environ.get('KK_FFMPEG',str(Path.home()/'.local/bin/ffmpeg')),'-y','-i',str(out/'audio.wav'),'-t','20',spec['voice']])
                if not spec.get('referenceText'):
                    reference_dir=out/'reference';reference_dir.mkdir(exist_ok=True)
                    spec['referenceText']=transcribe(spec['voice'],reference_dir)[0]
                inherited.append('reference.wav')
            if not text:text=transcript
    if kind in ['summary','hooks','script','translate','chat','tts','clone'] and not text:raise ValueError('没有提取到文字，请核对源视频是否有清晰语音或手动填写正文')
    limits={'clone':500,'cover':80,'translate':3000,'tts':6000}
    if kind in limits and len(text)>limits[kind]:raise ValueError('提取成功，但文字超过本次处理上限，请缩短视频或使用已保存素材分段处理')
    if kind=='download' and spec.get('browserSource'):
        r=spec['browserSource'];text=r.get('text','');files=r['files'];message=r.get('message','视频已保存')
    elif kind=='download':
        import yt_dlp
        class Quiet:
            def debug(self,*a):pass
            def warning(self,*a):pass
            def error(self,*a):pass
        opts={'outtmpl':str(out/'media.%(ext)s'),'noplaylist':True,'max_filesize':5*1024*1024*1024,'format':'best[ext=mp4]/best','socket_timeout':25,'retries':1,'quiet':True,'logger':Quiet(),'ffmpeg_location':os.environ.get('KK_FFMPEG',str(Path.home()/'.local/bin/ffmpeg')),'restrictfilenames':True,'writethumbnail':True}
        try:
            with yt_dlp.YoutubeDL(opts) as y:
                from http.cookiejar import Cookie
                for c in spec.get('cookies',[]):
                    domain=c.get('domain','');expires=c.get('expires',-1)
                    y.cookiejar.set_cookie(Cookie(0,c['name'],c['value'],None,False,domain,True,domain.startswith('.'),c.get('path','/'),True,c.get('secure',False),int(expires) if expires>0 else None,expires<=0,None,None,{},False))
                info=y.extract_info(spec['url'],download=True)
                media=Path(y.prepare_filename(info))
        except Exception as error:
            reason=str(error).lower()
            if 'drm' in reason:raise ValueError('该视频受DRM保护，无法解析下载；请使用平台官方离线功能或更换公开非加密视频')
            if 'geo' in reason or 'country' in reason:raise ValueError('该视频在当前地区不可用，请更换当前地区可播放的视频')
            if 'vip' in reason or 'premium' in reason or 'payment' in reason:raise ValueError('该视频需要平台付费权限，当前无法提取；请更换公开可播放的视频')
            if 'ssl' in reason or 'timed out' in reason or 'connection' in reason:raise ValueError('平台连接失败，请检查网络；抖音/小红书可在数据连接中登录后重试')
            if 'unsupported url' in reason:raise ValueError('该链接暂不支持，请使用作品详情链接')
            if 'cookie' in reason or 'login' in reason or 'sign in' in reason:
                from urllib.parse import urlparse
                domain=urlparse(spec['url']).hostname or ''
                if domain in ('x.com','www.x.com','twitter.com','www.twitter.com','mobile.twitter.com'):raise ValueError('X（Twitter）要求登录才能读取此视频；当前支持公开可访问帖子，可更换链接')
                raise ValueError('平台需要登录，请先完成数据连接后重试')
            raise ValueError('平台未返回可下载媒体，请确认链接可正常播放后重试')
        if not media.exists():raise ValueError('未获得完整视频文件，平台可能限制访问或文件超过5 GB')
        files=[p.name for p in out.iterdir() if p.is_file() and p.suffix not in ('.part','.json')]
        text='标题：'+str(info.get('title',''))+'\n\n'+str(info.get('description',''))
        (out/'metadata.json').write_text(json.dumps({k:info.get(k) for k in ['id','title','description','uploader','duration','webpage_url']},ensure_ascii=False),encoding='utf8');files.append('metadata.json')
        message='视频已下载，可点击「提取字幕」识别原字幕、画面字幕或语音'
    elif kind=='subtitles':
        text,files,message=extract_subtitles(spec['source'],out,transcribe)
    elif kind=='transcribe':
        text,files=transcribe(spec['source'],out)
    elif kind=='ocr':
        result=subprocess.run([str(Path(os.environ.get('KK_TOOL_DIR',str(ROOT/'.runtime')))/'video-ocr'),spec['source']],check=True,capture_output=True,text=True,timeout=120)
        text=result.stdout.strip()
        if not text:message='识别完成，图片中未检测到可识别文字'
    elif kind in ['summary','hooks','script','translate','chat']:
        from mlx_lm import load,generate
        instructions={'summary':'用中文提炼核心观点、事实与行动建议。不添加原文没有的信息。','hooks':'依据素材写5个不同的短视频开头，避免虚构事实，每个不超过50字。','script':'基于素材改写一份可拍摄的短视频脚本，分为开场、正文、结尾，列出口播和画面建议，不编造事实。','translate':'将素材完整翻译为'+spec.get('language','中文')+'，只输出译文。','chat':'根据给定素材回答用户问题；资料没有的信息明确说明。'}
        m,t=load(model('mlx-community/Qwen3.5-9B-OptiQ-4bit'))
        prompt=t.apply_chat_template([{'role':'system','content':instructions[kind]},{'role':'user','content':'素材：\n'+text+('\n\n补充要求：'+spec['instruction'] if spec.get('instruction') else '')}],tokenize=False,add_generation_prompt=True,enable_thinking=False)
        text=generate(m,t,prompt=prompt,max_tokens=6000 if kind=='translate' else 1600,verbose=False)
        text=re.sub(r'<think>.*?</think>','',text,flags=re.S).strip()
    elif kind=='tts':
        (out/'speech.txt').write_text(text,encoding='utf8')
        voice={'中文':'Tingting','英语':'Samantha','日语':'Kyoko','韩语':'Yuna'}.get(spec.get('language'),'Tingting')
        command(['/usr/bin/say','-v',voice,'-f',str(out/'speech.txt'),'-o',str(out/'speech.aiff')])
        command([os.environ.get('KK_FFMPEG',str(Path.home()/'.local/bin/ffmpeg')),'-y','-i',str(out/'speech.aiff'),str(out/'speech.wav')]);files=['speech.wav'];message='系统本地配音已生成'
    elif kind=='clone':
        import numpy as np
        from scipy.io.wavfile import write as write_wav
        from mlx_audio.tts.utils import load_model
        from mlx_audio.utils import load_audio
        m=load_model(model('mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16'))
        audio=load_audio(spec['voice'],sample_rate=24000)
        chunks=[];rate=24000
        for r in m.generate(text=text,ref_audio=audio,ref_text=spec['referenceText'],lang_code={'中文':'Chinese','英语':'English','日语':'Japanese','韩语':'Korean'}.get(spec.get('language'),'Chinese'),max_tokens=2048):
            chunks.append(np.array(r.audio));rate=r.sample_rate
        if not chunks:raise ValueError('没有生成声音，请检查参考音频')
        write_wav(str(out/'voice.wav'),rate,np.concatenate(chunks).astype(np.float32));files=['voice.wav'];message='本地音色复刻配音已生成'
    elif kind=='cover':
        from video_cover import render_cover
        if spec.get('source') and Path(spec['source']).suffix.lower() in ['.mp4','.mov','.webm','.mkv']:
            command([os.environ.get('KK_FFMPEG',str(Path.home()/'.local/bin/ffmpeg')),'-y','-i',spec['source'],'-frames:v','1',str(out/'source-frame.png')])
            spec['source']=str(out/'source-frame.png');inherited.append('source-frame.png')
        def plan_design(instruction,palette):
            design_model=model('mlx-community/Qwen3.5-9B-OptiQ-4bit')
            from mlx_lm import load,generate
            m,t=load(design_model)
            system='将用户封面设计要求转为JSON，仅输出对象。可用字段background/accent/foreground为#RRGGBB颜色，position为top/center/bottom，align为left/center/right。不要生成其他字段。基础配色：'+json.dumps(palette)
            prompt=t.apply_chat_template([{'role':'system','content':system},{'role':'user','content':instruction}],tokenize=False,add_generation_prompt=True,enable_thinking=False)
            answer=generate(m,t,prompt=prompt,max_tokens=400,verbose=False)
            answer=re.sub(r'<think>.*?</think>','',answer,flags=re.S)
            match=re.search(r'\{[^{}]*\}',answer)
            if not match:raise ValueError('未能理解设计要求，请用配色、标题位置和对齐方式描述后重试')
            return json.loads(match.group())
        files=render_cover(spec,out,text,plan_design);message='封面已生成，可预览并下载PNG；参考图用于配色，设计要求用于文字排版'
    files=list(dict.fromkeys(inherited+files+['text.txt']));(out/'text.txt').write_text(text,encoding='utf8')
    (out/'result.json').write_text(json.dumps({'text':text,'files':files,'message':message},ensure_ascii=False),encoding='utf8')

spec=json.load(sys.stdin)
try:run(spec)
except Exception as e:
    message=str(e) if isinstance(e,ValueError) else '本地处理失败：'+type(e).__name__+'，请检查素材格式或本地模型环境'
    (Path(spec['output'])/'error.json').write_text(json.dumps({'message':message},ensure_ascii=False),encoding='utf8')
    raise
