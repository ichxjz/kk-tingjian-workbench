import {LANGUAGES} from './languages.js';
export function setupAutoTranslation(host){
 const panel=document.createElement('section');panel.id='translation-panel';panel.hidden=true;
 panel.innerHTML=`<div class="translation-picker-row"><div class="language-picker"><button class="button" data-language-picker="source">中文 ▾</button></div><button class="button small" id="translation-swap" aria-label="对调语言">⇄ 对调</button><div class="language-picker"><button class="button" data-language-picker="target">英语 ▾</button></div></div><div class="translation-grid"><section class="panel translation-card"><div class="section-head"><h2>原文</h2><span class="help" id="translation-length">0 / 3000</span></div><textarea id="translation-input" maxlength="3000" aria-label="翻译原文" placeholder="输入文字，译文将自动出现"></textarea></section><section class="panel translation-card"><div class="section-head"><h2>译文</h2><button class="button small" id="translation-copy" disabled>复制译文</button></div><div id="translation-result" class="translation-result" aria-live="polite"></div></section></div><p id="translation-status" class="help translation-status" role="status">输入后自动联网翻译 · 文本将发送至 Google 或 MyMemory 翻译</p><button type="button" class="button small" id="translation-retry" hidden>重新翻译</button>`;
 host.append(panel);
 let source='zh-CN',target='en',timer,controller,version=0,composing=false;
 const input=panel.querySelector('#translation-input'),result=panel.querySelector('#translation-result'),status=panel.querySelector('#translation-status'),copy=panel.querySelector('#translation-copy');
 const updateLabels=()=>{for(const [side,code] of [['source',source],['target',target]])panel.querySelector(`[data-language-picker=${side}]`).textContent=LANGUAGES.find(x=>x[0]===code)[1]+' ▾';};
 const retry=panel.querySelector('#translation-retry');
 const schedule=()=>{
  retry.hidden=true;
  clearTimeout(timer);controller?.abort();const current=++version;copy.disabled=true;result.textContent='';panel.querySelector('#translation-length').textContent=input.value.length+' / 3000';
  if(!input.value.trim()){status.textContent='输入后自动联网翻译 · 文本将发送至 Google 或 MyMemory 翻译';return;}
  status.textContent='等待输入完成…';if(composing)return;
  timer=setTimeout(async()=>{
   controller=new AbortController();status.textContent='正在翻译…';
   try{const response=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:input.value,source,target}),signal:controller.signal});const data=await response.json();if(current!==version)return;if(!response.ok)throw Error(data.error||'翻译失败');result.textContent=data.text;copy.disabled=!data.text;status.textContent='翻译完成 · '+(data.provider||'联网翻译');}
   catch(e){if(e.name!=='AbortError'&&current===version){status.textContent=e.message==='Failed to fetch'?'连接已中断，请点击重新翻译':e.message;retry.hidden=false;}}
  },650);
 };
 retry.onclick=schedule;
 input.addEventListener('input',schedule);input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(timer);controller?.abort();version++;});input.addEventListener('compositionend',()=>{composing=false;schedule();});
 panel.querySelector('#translation-swap').onclick=()=>{[source,target]=[target,source];if(result.textContent)input.value=result.textContent;updateLabels();schedule();};
 copy.onclick=async()=>{try{await navigator.clipboard.writeText(result.textContent);status.textContent='译文已复制';}catch{status.textContent='请选中译文手动复制';}};
 panel.querySelectorAll('[data-language-picker]').forEach(button=>button.onclick=()=>{
  const old=button.parentElement.querySelector('.language-popover');panel.querySelectorAll('.language-popover').forEach(x=>x.remove());if(old)return;
  const picker=document.createElement('div');picker.className='language-popover';picker.innerHTML='<input class="language-search" aria-label="搜索语言" placeholder="搜索100种语言"><div class="language-grid" role="listbox"></div>';button.parentElement.append(picker);
  const draw=()=>{const q=picker.querySelector('input').value.toLowerCase();picker.querySelector('.language-grid').innerHTML=LANGUAGES.filter(([code,name])=>(code+' '+name).toLowerCase().includes(q)).map(([code,name])=>`<button role="option" data-code="${code}" aria-selected="${code===(button.dataset.languagePicker==='source'?source:target)}">${name}</button>`).join('');};
  draw();picker.querySelector('input').oninput=draw;picker.onclick=e=>{const option=e.target.closest('[data-code]');if(!option)return;if(button.dataset.languagePicker==='source')source=option.dataset.code;else target=option.dataset.code;picker.remove();updateLabels();schedule();};picker.querySelector('input').focus();
 });
 document.addEventListener('click',e=>{if(!e.target.closest('.language-picker'))panel.querySelectorAll('.language-popover').forEach(x=>x.remove());});panel.addEventListener('keydown',e=>{if(e.key==='Escape')panel.querySelectorAll('.language-popover').forEach(x=>x.remove());});
}
