# coding: utf-8
"""Extract embedded text subtitles; otherwise generate subtitles from local speech."""
import json,re,subprocess,os
from pathlib import Path
from opencc import OpenCC

def extract_subtitles(source,out,transcribe):
    ffmpeg=os.environ.get('KK_FFMPEG',str(Path.home()/'.local/bin/ffmpeg'))
    ffprobe=os.environ.get('KK_FFPROBE',str(Path.home()/'.local/bin/ffprobe'))
    result=subprocess.run([ffprobe,'-v','error','-protocol_whitelist','file,pipe','-select_streams','s','-show_streams','-of','json',source],check=True,capture_output=True,text=True,timeout=60)
    tracks=json.loads(result.stdout).get('streams',[])
    text_codecs={'subrip','ass','ssa','mov_text','webvtt','text','ttml'}
    supported=[t for t in tracks if t.get('codec_name') in text_codecs]
    # Prefer Chinese if present, then retain the source's first text track.
    supported.sort(key=lambda t:0 if t.get('tags',{}).get('language','') in ('chi','zho','zh','zh-CN') else 1)
    srt=out/'subtitles.srt'
    for track in supported:
        r=subprocess.run([ffmpeg,'-y','-v','error','-protocol_whitelist','file,pipe','-i',source,'-map','0:'+str(track['index']),'-c:s','srt',str(srt)],capture_output=True,timeout=120)
        if r.returncode==0 and srt.exists() and srt.stat().st_size:
            content=srt.read_text(encoding='utf-8-sig')
            language=track.get('tags',{}).get('language','und').lower()
            if language in ('chi','zho','zh','zh-cn','zh-tw','zh-hans','zh-hant','und',''):
                content=OpenCC('t2s').convert(content)
                srt.write_text(content,encoding='utf8')
            lines=[]
            for block in re.split(r'\n\s*\n',content.strip()):
                rows=block.splitlines()
                timing=next((i for i,row in enumerate(rows) if '-->' in row),None)
                if timing is not None:lines.extend(re.sub(r'<[^>]+>','',v) for v in rows[timing+1:])
            return '\n'.join(lines),['subtitles.srt'],'已提取视频内嵌字幕，保留原始时间轴'
    # Recognize hard subtitles locally before falling back to speech.
    binary=Path(os.environ.get('KK_TOOL_DIR',str(Path(__file__).resolve().parents[2]/'.runtime')))/'video-subtitle-ocr'
    probe=subprocess.run([ffprobe,'-v','error','-select_streams','v','-show_entries','stream=index','-of','json',source],check=True,capture_output=True,text=True,timeout=60)
    if json.loads(probe.stdout).get('streams'):
        if not binary.exists():raise ValueError('字幕识别组件缺失，请运行 scripts/setup-video.sh 后重试')
        result=subprocess.run([str(binary),source],check=True,capture_output=True,text=True,timeout=1800)
        cues=json.loads(result.stdout or '[]')
        if cues:
            converter=OpenCC('t2s')
            def stamp(sec):
                ms=round(sec*1000)
                return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
            for cue in cues:cue['text']=converter.convert(cue['text'])
            srt.write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(cues)),encoding='utf8')
            return '\n'.join(c['text'] for c in cues),['subtitles.srt'],'已识别视频画面下方字幕（每0.5秒采样）；可能包含水印，请校对文字与时间轴'
    text,files=transcribe(source,out)
    if not text.strip():raise ValueError('未找到可提取的字幕或清晰语音，请更换视频')
    return text,files,'未找到可提取的文本字幕轨，已根据语音生成字幕；请校对文字与时间轴'
