import sys,tempfile,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src/bridge'))
from video_subtitles import extract_subtitles
with tempfile.TemporaryDirectory() as d:
    root=Path(d);srt=root/'input.srt';srt.write_text('1\n00:00:00,100 --> 00:00:01,500\n測試字幕保留時間軸\n',encoding='utf8')
    video=root/'video.mkv'
    subprocess.run([str(Path.home()/'.local/bin/ffmpeg'),'-v','error','-y','-f','lavfi','-i','color=size=320x240:duration=2','-i',str(srt),'-c:v','libx264','-c:s','srt',str(video)],check=True)
    out=root/'result';out.mkdir()
    def forbidden(*a):raise AssertionError('Text track must not invoke ASR')
    text,files,message=extract_subtitles(str(video),out,forbidden)
    assert '测试字幕保留时间轴' in text and files==['subtitles.srt']
    assert '00:00:00,100 --> 00:00:01,500' in (out/'subtitles.srt').read_text()
    silent=root/'silent.mp4'
    subprocess.run([str(Path.home()/'.local/bin/ffmpeg'),'-v','error','-y','-i',str(video),'-an','-sn',str(silent)],check=True)
    calls=[]
    def fallback(source,directory):calls.append(source);return '语音结果',['subtitles.srt']
    result=extract_subtitles(str(silent),out,fallback)
    assert calls==[str(silent)] and '根据语音' in result[2]
    print('PASS actual embedded subtitle extraction, timestamps and ASR fallback dispatch')

# Actual burned-in text: no subtitle track and no audio can provide the answer.
with tempfile.TemporaryDirectory() as d:
    from PIL import Image,ImageDraw,ImageFont
    root=Path(d);out=root/'out';out.mkdir()
    image=Image.new('RGB',(960,540),'black')
    ImageDraw.Draw(image).text((180,410),'這是燒錄字幕測試',font=ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',48),fill='white')
    image.save(root/'frame.png')
    subprocess.run([str(Path.home()/'.local/bin/ffmpeg'),'-v','error','-y','-loop','1','-i',str(root/'frame.png'),'-t','2','-pix_fmt','yuv420p',str(root/'burned.mp4')],check=True)
    text,files,message=extract_subtitles(str(root/'burned.mp4'),out,forbidden)
    assert '这是烧录字幕测试' in text,text
    content=(out/'subtitles.srt').read_text()
    assert content.count('-->')==1 and '00:00:02,000' in content,content
    assert '画面' in message
    print('PASS burned-in Chinese OCR, simplified output and repeated-frame deduplication')
