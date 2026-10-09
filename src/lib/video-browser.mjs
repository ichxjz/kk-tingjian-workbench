import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
import {writeFile,stat,rename,rm,chmod} from 'node:fs/promises';
import path from 'node:path';
export function mediaCandidates(value){const found=[];const seen=new WeakSet();let count=0;function walk(v,key='',depth=0){if(depth>18||++count>40000||!v)return;if(typeof v==='string'){if(/^https:\/\//.test(v)&&(/play_addr|playAddr|masterUrl|backupUrl|videoUrl|playUrl|download_addr/.test(key)))found.push(v);return;}if(typeof v!=='object'||seen.has(v))return;seen.add(v);if(Array.isArray(v)){v.forEach(x=>walk(x,key,depth+1));return;}for(const[k,x]of Object.entries(v))walk(x,key+'/'+k,depth+1);}walk(value);return [...new Set(found)];}
export function matchingMedia(value,id){const matches=[];const seen=new WeakSet();function walk(v,depth=0){if(!v||typeof v!=='object'||depth>18||seen.has(v))return;seen.add(v);if(String(v.aweme_id||v.note_id||v.noteId||'')===id){const urls=mediaCandidates(v.video||v);if(urls.length)matches.push({urls,title:v.desc||v.title||''});return;}for(const x of Object.values(v))walk(x,depth+1);}if(id)walk(value);return matches;}
export async function collectBrowserVideo(browser,url,folder,{signal,onProgress=()=>{}}={}){
 const platform=/douyin\.com/.test(new URL(url).hostname)?'douyin':'xiaohongshu';const context=await browser.context(platform);const page=await context.newPage();const candidates=new Set();const pending=new Set();let title='',expectedId=new URL(url).pathname.match(/\/(?:video|explore|note)\/([a-zA-Z0-9]+)/)?.[1]||'';
 const abort=()=>void page.close().catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
 const onResponse=response=>{const job=(async()=>{const type=response.headers()['content-type']||'';const u=response.url();if(type.includes('json')&&/aweme|detail|feed|note/.test(u)){try{for(const match of matchingMedia(await response.json(),expectedId)){for(const item of match.urls)candidates.add(item);title=match.title||title;}}catch{}}})();pending.add(job);job.finally(()=>pending.delete(job));};page.on('response',onResponse);
 try{onProgress('正在使用已登录浏览器读取作品…');let target=url;if(new URL(url).hostname==='v.douyin.com'){try{const {stdout}=await exec('/usr/bin/curl',['-sI','--max-time','20',url],{timeout:22000,maxBuffer:65536});const redirect=stdout.match(/^location:\s*(.+)$/im)?.[1]?.trim();const id=redirect?.match(/\/(?:video|note)\/(\d+)/)?.[1];if(id){expectedId=id;target='https://www.douyin.com/video/'+id;}}catch{}}
 try{await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});}catch(e){if(signal?.aborted)throw Error('已暂停');if(/ERR_NETWORK_CHANGED/.test(e.message)){await page.waitForTimeout(1000);await page.goto(target,{waitUntil:'domcontentloaded',timeout:45000});}else throw Error('作品页面连接失败，请检查网络或在数据连接中打开平台后重试');}
 for(let n=0;n<18;n++){if(signal?.aborted)throw Error('已暂停');if(!expectedId)expectedId=new URL(page.url()).pathname.match(/\/(?:video|explore|note)\/([a-zA-Z0-9]+)/)?.[1]||'';
 const state=await page.evaluate(()=>{const values=[window.__INITIAL_STATE__,window._ROUTER_DATA];const encoded=document.querySelector('#RENDER_DATA')?.textContent;if(encoded){try{values.push(JSON.parse(decodeURIComponent(encoded)));}catch{}}return JSON.stringify(values);}).catch(()=>'[]');try{for(const match of matchingMedia(JSON.parse(state),expectedId)){for(const item of match.urls)candidates.add(item);title=match.title||title;}}catch{}

 if(candidates.size)break;await page.waitForTimeout(1000);}
 await Promise.allSettled([...pending]);if(!candidates.size){const text=await page.locator('body').innerText().catch(()=>'');if(/验证码|安全验证|扫码登录|登录后/.test(text))throw Error('平台要求登录或验证，请在「数据连接」完成后重试');throw Error('页面没有返回可读取视频；请确认链接是视频作品且可正常播放');}
 onProgress('已获取视频地址，正在保存到本机…');let downloaded=false;
 for(const mediaUrl of [...candidates].slice(0,8)){
  if(signal?.aborted)throw Error('已暂停');
  try{await streamVideo(mediaUrl,path.join(folder,'media.mp4'),{referer:page.url(),cookies:await context.cookies(mediaUrl),signal});downloaded=true;break;}
  catch(e){if(signal?.aborted||e.message.includes('5 GB'))throw e;}
 }

 if(!downloaded)throw Error('视频地址已找到，但下载未完成；请检查网络后重试');const result={text:title,files:['media.mp4'],message:'已通过本机浏览器采集视频',sourceUrl:url};await writeFile(path.join(folder,'browser-source.json'),JSON.stringify(result));return result;
 }finally{signal?.removeEventListener('abort',abort);page.off('response',onResponse);await page.close().catch(()=>{});}
}

// Send credentials through stdin, never command-line arguments or logs.
export async function streamVideo(url,destination,{referer='',cookies=[],signal}={}){
 const partial=destination+'.part';
 const quote=value=>'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/[\r\n]/g,'')+'"';
 const config=['url = '+quote(url),'referer = '+quote(referer),'cookie = '+quote(cookies.map(c=>c.name+'='+c.value).join('; '))].join('\n');
 try{
  const type=await new Promise((resolve,reject)=>{
   const child=spawn('/usr/bin/curl',['--config','-','--silent','--fail','--location','--proto','=https','--proto-redir','=https','--connect-timeout','30','--max-time','14400','--max-filesize',String(5*1024*1024*1024),'--output',partial,'--write-out','%{content_type}'],{stdio:['pipe','pipe','ignore'],signal});
   let output='';child.stdout.on('data',v=>{output+=v.toString();});child.on('error',reject);child.stdin.on('error',()=>{});
   child.on('close',code=>code===0?resolve(output):reject(Error(code===63?'视频超过5 GB，请分段处理':'视频下载失败，请重试')));child.stdin.end(config);
  });
  const size=(await stat(partial)).size;
  if(size>5*1024*1024*1024)throw Error('视频超过5 GB，请分段处理');
  if(size<1024||!/video|octet-stream/i.test(type))throw Error('未返回有效视频');
  await chmod(partial,0o600);await rename(partial,destination);
 }finally{await rm(partial,{force:true});}
}
