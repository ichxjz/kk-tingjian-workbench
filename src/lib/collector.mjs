import {browserNetwork} from './browser-network.mjs';
import {PLATFORM_INFO} from '../public/platforms.js';
import { chromium } from 'playwright-core';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import { normalize, sourceUrl, sourceId } from './core.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export function decodeComments(body,p,source){const rows=[];const root=body?.data??body;const items=root?.comments??body?.comments??[];if(!Array.isArray(items))return rows;
 function visit(c,parent=''){if(!c||typeof c!=='object')return;const row=normalize({text:c.text??c.content,comment_id:c.cid??c.id,created_at:c.create_time??c.createTime,likes:c.digg_count??c.like_count??c.likeCount,author:c.user?.nickname??c.user_info?.nickname??'',...source,parent_id:parent||c.root_comment_id||c.target_comment?.id||c.reply_id||source.parent_id,platform:p});if(row){if(row.parent_id==='0')row.parent_id='';rows.push(row);}for(const reply of c.sub_comments??c.reply_comment??[])visit(reply,String(c.cid??c.id??''));}
 for(const c of items)visit(c);return rows;}
export function decodeDiscovery(body,p) {
 const records=p==='douyin'?(Array.isArray(body?.data)?body.data:body?.data?.data??[]):body?.data?.items??[];
 if(!Array.isArray(records))return [];
 const links=[];
 for(const record of records){
  if(p==='douyin'){const video=record.aweme_info??record;const id=String(video.aweme_id??'');if(/^\d{5,}$/.test(id))links.push('https://www.douyin.com/video/'+id);}
  else {const id=String(record.id??'');if((record.model_type==='note'||record.note_card)&&/^[a-f\d]{20,32}$/i.test(id)){const u=new URL('https://www.xiaohongshu.com/explore/'+id);if(record.xsec_token){u.searchParams.set('xsec_token',record.xsec_token);u.searchParams.set('xsec_source','pc_search');}links.push(u.href);}}
 }
 return links;
}
export class Collector {
 constructor(store,root){this.store=store;this.root=root;this.contexts=new Map();this.workPages=new Map();this.opening=new Map();this.active=null;this.job=null;this.stop=false;this.searchErrors={};this.connectionState=Object.fromEntries(PLATFORM_INFO.map(p=>[p.id,{state:'unverified',message:'点击连接，在独立浏览器内完成登录'}]));}
 async context(p){if(this.contexts.has(p))return this.contexts.get(p);if(this.opening.has(p))return this.opening.get(p);const promise=(async()=>{const profile=path.join(this.root,'.runtime','profiles',p);const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';const mac=existsSync(systemChrome)?systemChrome:path.join(process.env.HOME||'','Applications/Google Chrome.app/Contents/MacOS/Google Chrome');if(process.env.KK_DESKTOP_INSTANCE&&!process.env.BROWSER_EXECUTABLE&&!existsSync(mac))throw Error('采集需要 Google Chrome，请从 google.com/chrome 安装后重新点击连接；分析、翻译和封面仍可使用');const ctx=await chromium.launchPersistentContext(profile,{headless:false,...browserNetwork(),...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:existsSync(mac)?{executablePath:mac}:{channel:'chrome'}),viewport:{width:1280,height:900},locale:'zh-CN',acceptDownloads:false});ctx.setDefaultTimeout(6000);ctx.on('close',()=>{this.contexts.delete(p);this.workPages.delete(p);this.connectionState[p]={state:'closed',message:'浏览器已关闭，点击重新连接'};});this.contexts.set(p,ctx);return ctx;})();this.opening.set(p,promise);try{return await promise;}finally{this.opening.delete(p);}}
 async connect(p){if(!PLATFORM_INFO.some(x=>x.id===p))throw new Error('不支持的平台');if(this.active)throw new Error('请先暂停正在运行的采集任务');const ctx=await this.context(p);let page=ctx.pages()[0]||await ctx.newPage();await page.goto(PLATFORM_INFO.find(x=>x.id===p).home,{waitUntil:'commit',timeout:30000});await page.bringToFront();this.connectionState[p]={state:'opened',message:'浏览器已打开；请完成登录。登录状态由下一次采集验证。'};return this.connectionState[p];}
 pause(id){if(this.active===id){this.stop=true;this.store.update(id,{status:'stopping',message:'正在停止采集，已获取评论已保存'});return;}throw new Error('该任务当前没有在采集，无需暂停');}
 async run(id){if(this.active)throw new Error('已有采集任务在运行，请先暂停或等待结束');const task=this.store.get(id);if(!task)throw new Error('任务不存在');if(!['links','search'].includes(task.mode))throw new Error('此任务无需采集');this.active=id;this.stop=false;this.store.update(id,{status:'running',message:'正在打开采集浏览器…'});this.job=this.execute(task).catch(e=>{this.store.update(id,{status:this.stop?'paused':'blocked',message:this.stop?'采集已暂停':`采集未完成：${e.message.slice(0,250)}。已获取数据已保留，可继续或导入文件。`});}).finally(()=>{this.active=null;this.stop=false;this.job=null;});return this.store.get(id);}
 async execute(task){let links=task.options.links||[];let searchIncomplete=false;
 this.searchErrors={};
 if(task.mode==='search') {links=this.store.sources(task.id).map(s=>({url:s.url,platform:s.platform}));for(const p of task.options.platforms){if(this.stop)break;this.store.update(task.id,{message:`正在搜索${p==='douyin'?'抖音':'小红书'}的相关作品…`});let found=[];try{found=await this.discover(p,task.options.query,Math.max(1,Math.ceil(task.options.maxPosts/task.options.platforms.length)));}catch(e){this.searchErrors[p]=(p==='douyin'?'抖音':'小红书')+'搜索未完成：'+e.message.slice(0,120);this.connectionState[p]={state:'attention',message:this.searchErrors[p]};}if(!found.length)searchIncomplete=true;for(const url of found)if(!links.some(l=>sourceId(l.url)===sourceId(url)&&l.platform===p))links.push({url,platform:p});}}
 if(!links.length){this.store.update(task.id,{status:this.stop?'paused':'blocked',message:this.stop?'已暂停':(Object.values(this.searchErrors).filter(Boolean).join('；')||'没有获得可访问的作品。请确认平台搜索正常，或粘贴具体作品链接；也可导入评论文件。')});return;}
 const remaining=links.slice(0,task.options.maxPosts);
 const existing=this.store.sources(task.id);for(const l of remaining){const sid=l.platform+':'+sourceId(l.url,l.url);if(!existing.some(s=>s.id===sid))this.store.source(task.id,sid,l.url,l.platform);}
 for(const l of remaining){if(this.stop)break;const sid=l.platform+':'+sourceId(l.url,l.url);const old=this.store.sources(task.id).find(s=>s.id===sid);if(['complete','limit'].includes(old?.status))continue;try{await this.collect(task,l,sid);}catch(e){this.store.source(task.id,sid,l.url,l.platform,'blocked',e.message.slice(0,200),this.store.sources(task.id).find(s=>s.id===sid)?.count||0);}}
 const sources=this.store.sources(task.id);const counts=this.store.get(task.id).count;const unfinished=sources.some(s=>['blocked','partial','pending','running'].includes(s.status))||searchIncomplete;const status=this.stop?'paused':unfinished?(counts?'partial':'blocked'):'completed';this.store.update(task.id,{status,message:this.stop?'已暂停，点击继续可从未完成作品续采':unfinished?(['部分来源未完成，已保存当前评论，可点击继续采集。',...Object.values(this.searchErrors)].join(' ')):`本次采集结束，共 ${counts} 条去重评论。范围仅为本次可读取样本。`});}
 async page(p){const ctx=await this.context(p);let page=this.workPages.get(p);if(!page||page.isClosed()){page=await ctx.newPage();this.workPages.set(p,page);}return page;}
 async discover(p,query,max){
 const page=await this.page(p),links=new Map(),pending=new Set();
 const listener=response=>{let host;try{host=new URL(response.url()).hostname;}catch{return;}if(!/(^|\.)(douyin\.com|xiaohongshu\.com)$/.test(host)||!/search/i.test(response.url())||response.status()!==200)return;const work=response.json().then(body=>{for(const href of decodeDiscovery(body,p))links.set(sourceId(href),href);}).catch(()=>{});pending.add(work);work.finally(()=>pending.delete(work));};
 page.on('response',listener);
 try {
 await page.goto(p==='douyin'?`https://www.douyin.com/search/${encodeURIComponent(query)}?type=video`:`https://www.xiaohongshu.com/search_result/?keyword=${encodeURIComponent(query)}&source=web_explore_feed`,{waitUntil:'commit',timeout:30000});
 for(let i=0;i<6&&!this.stop;i++){
  await delay(1800);await Promise.allSettled([...pending]);
  let hrefs;try{hrefs=await page.locator('a[href]').evaluateAll(as=>as.map(a=>a.href));}catch(e){if(/context was destroyed|navigation/i.test(e.message)){await page.waitForLoadState('domcontentloaded').catch(()=>{});continue;}throw e;}
  for(const href of hrefs){try{const parsed=sourceUrl(href.replace(/^http:/,'https:'));if(parsed.platform!==p)continue;if(/\/(video|explore|search_result|discovery\/item)\/[\w-]+/.test(new URL(href).pathname)||new URL(href).searchParams.has('modal_id'))links.set(sourceId(href),parsed.url);}catch{}}
  if(links.size>=max)break;await page.mouse.wheel(0,850);
 }
 if(!links.size){
  await mkdir(path.join(this.root,'output/verification'),{recursive:true});
  const diagnostic={platform:p,title:await page.title().catch(()=>''),url:page.url().split('?')[0],text:(await page.locator('body').innerText().catch(()=>'')).slice(0,3500),anchorCount:await page.locator('a').count()};
  const label=p==='douyin'?'抖音':'小红书';const reason=/验证|captcha/i.test(diagnostic.title+' '+diagnostic.text)?label+'要求完成搜索验证码，请在采集浏览器处理后继续':label+'搜索未返回作品，请先确认平台搜索正常，或改用具体作品分享链接';
  this.searchErrors[p]=reason;this.connectionState[p]={state:'attention',message:reason};
  await page.screenshot({path:path.join(this.root,'output/verification',p+'-search-state.png')}).catch(()=>{});
  await writeFile(path.join(this.root,'output/verification',p+'-search-diagnostic.json'),JSON.stringify(diagnostic,null,2));
 }else delete this.searchErrors[p];
 return [...links.values()].slice(0,max);
 }finally{page.off('response',listener);await Promise.allSettled([...pending]);}
 }

 async collect(task,link,sid){const page=await this.page(link.platform);let seen=new Set(this.store.comments(task.id).filter(c=>c.platform===link.platform&&c.post_id===sourceId(link.url)).map(c=>c.key));const pending=new Set();let exhausted=false,networkSeen=false,unreadReplies=false,domRows=[],domSaved=false;const replyTotals=new Map();const cap=task.options.maxComments??Infinity;const expectedPost=sourceId(link.url);const exactTarget=/^[a-f\d]{20,32}$/i.test(expectedPost)||/^\d{10,}$/.test(expectedPost);
 this.store.source(task.id,sid,link.url,link.platform,'running','正在打开评论区',seen.size);this.store.update(task.id,{message:`正在读取第 ${this.store.sources(task.id).filter(s=>['complete','limit'].includes(s.status)).length+1} 个作品的评论…`});
 const save=rows=>{const posts=new Set(rows.map(c=>c.post_id));for(const c of this.store.comments(task.id))if(c.platform===link.platform&&posts.has(c.post_id))seen.add(c.key);const accepted=[];for(const c of rows){if(seen.size>=cap&&!seen.has(c.key))break;if(!seen.has(c.key)){accepted.push(c);seen.add(c.key);}}this.store.recordReads(task.id,rows.length-accepted.length);if(accepted.length)this.store.insert(task.id,accepted);this.store.source(task.id,sid,link.url,link.platform,'running','评论已保存，正在读取后续内容',seen.size);};
 const listener=response=>{const u=response.url();if(!/comment/i.test(u)||response.status()!==200)return;let host;try{host=new URL(u).hostname;}catch{return;}if(!/(^|\.)(douyin\.com|xiaohongshu\.com)$/.test(host))return;const work=(async()=>{try{const requestPost=new URL(u).searchParams.get('note_id')||new URL(u).searchParams.get('aweme_id');if(requestPost&&requestPost!==sourceId(page.url()))return;if(exactTarget&&sourceId(page.url())!==expectedPost)return;const b=await response.json();if(b.success===false||(b.code!==undefined&&Number(b.code)!==0)||(b.status_code!==undefined&&Number(b.status_code)!==0))return;const parentId=/(sub|reply)/i.test(u)?(new URL(u).searchParams.get('root_comment_id')||new URL(u).searchParams.get('comment_id')||''):'';const rows=decodeComments(b,link.platform,{parent_id:parentId,source_url:page.url(),post_id:sourceId(page.url(),sourceId(link.url)),title:(await page.title().catch(()=>task.name)).slice(0,300)});if(rows.length){networkSeen=true;save(rows);}const r=b?.data??b;for(const c of r?.comments??[]){const total=Number(c.sub_comment_count??c.reply_comment_total??0);if(total>0)replyTotals.set(String(c.id??c.cid),total);}if(Array.isArray(r?.comments)&&!/(sub|reply)/i.test(u)){if(r.has_more===false||r.has_more===0)exhausted=true;}}catch{}})();pending.add(work);work.finally(()=>pending.delete(work));};
 page.on('response',listener);let idle=0;let previous=seen.size;
 try{await page.goto(link.url,{waitUntil:'commit',timeout:30000});await page.waitForLoadState('domcontentloaded',{timeout:8000}).catch(()=>{});await delay(2300);const final=sourceUrl(page.url().replace(/^http:/,'https:'));if(final.platform!==link.platform)throw new Error('作品跳转到了其他平台，请使用原始作品链接');const actual=sourceId(page.url(),sourceId(link.url));for(const c of this.store.comments(task.id))if(c.platform===link.platform&&c.post_id===actual)seen.add(c.key);
 if(link.platform==='douyin'){const buttons=page.locator('[data-e2e="feed-comment-icon"], [data-e2e="video-comment-icon"]');if(await buttons.count())await buttons.first().click({timeout:3000}).catch(()=>{});}
 for(let step=0;(cap===Infinity||step<25)&&!this.stop&&seen.size<cap;step++){
 await delay(1400);await Promise.allSettled([...pending]);if(exactTarget&&sourceId(page.url())!==expectedPost){if(seen.size)break;throw new Error('页面已离开目标作品，请使用可正常打开的完整分享链接');}
 if(!networkSeen){let rows;try{rows=await page.evaluate(p=>{const containers=[...document.querySelectorAll(p==='douyin'?'[data-e2e="comment-item"]':'.comment-item')];return containers.map(el=>({text:el.querySelector(p==='douyin'?'[data-e2e="comment-content"]':'.content')?.textContent||'',comment_id:el.getAttribute('data-comment-id')||'',author:el.querySelector(p==='douyin'?'[data-e2e="comment-user-name"]':'.name')?.textContent||'',likes:el.querySelector(p==='douyin'?'[data-e2e="comment-like-count"]':'.like-wrapper .count')?.textContent||''}));},link.platform);}catch(e){if(/context was destroyed|navigation/i.test(e.message)){await page.waitForLoadState('domcontentloaded',{timeout:5000}).catch(()=>{});continue;}throw e;}domRows=[...new Map([...domRows,...rows.map(r=>normalize({...r,platform:link.platform,post_id:actual,source_url:page.url(),title:task.name})).filter(Boolean)].map(r=>[r.key,r])).values()];}
 if(seen.size===previous)idle++;else idle=0;previous=seen.size;const reply=page.getByText(/^(展开|查看).{0,12}(条回复|回复)/).filter({visible:true}).first();const expandable=await reply.isVisible().catch(()=>false);const stored=this.store.comments(task.id);unreadReplies=[...replyTotals].some(([id,total])=>stored.filter(c=>c.platform===link.platform&&c.post_id===actual&&c.parent_id===id).length<total);if((exhausted&&!expandable&&!unreadReplies)||idle>=(seen.size?6:18))break;
 if(expandable)await reply.click({timeout:1500}).catch(()=>{});
 const target=page.locator(link.platform==='douyin'?'[data-e2e="comment-list"]':'.comments-container').first();if(await target.count())await target.hover().catch(()=>{});await page.mouse.wheel(0,650);
 // Only click the platform's visible expansion control; no synthetic API requests.

 }
 await Promise.allSettled([...pending]);if(!networkSeen){save(domRows);domSaved=true;}const body=(await page.locator('body').innerText()).slice(0,12000);const blocked=/安全验证|访问频繁|请完成验证|扫码登录后|登录后查看|登录后搜索|网络异常|内容暂时无法查看|笔记不存在|视频不存在/.test(body);
 unreadReplies=unreadReplies||await page.getByText(/^(展开|查看).{0,12}(条回复|回复)/).filter({visible:true}).first().isVisible().catch(()=>false);
 const status=this.stop?'partial':seen.size>=cap?'limit':exhausted&&!unreadReplies?'complete':seen.size?'partial':'blocked';const message=this.stop?'已暂停，保留已获取评论':status==='limit'?`达到每作品 ${cap} 条上限` :status==='complete'?'页面评论分页已结束；回复以实际展开为准':blocked?'平台要求登录、验证或内容不可访问，请在浏览器处理后继续':seen.size?'已保存当前加载评论，未确认全部读取完毕':'尚未读取到评论。请登录并确认作品评论区可见后继续';
 if(!seen.size){await mkdir(path.join(this.root,'output/verification'),{recursive:true});await writeFile(path.join(this.root,'output/verification',link.platform+'-comment-diagnostic.json'),JSON.stringify({title:await page.title(),url:page.url().split('?')[0],text:body.slice(0,5000)},null,2));await page.screenshot({path:path.join(this.root,'output/verification',link.platform+'-comment-state.png')}).catch(()=>{});}this.store.source(task.id,sid,link.url,link.platform,status,message,seen.size);this.connectionState[link.platform]={state:seen.size||exhausted?'verified':'attention',message:seen.size?'已在本次任务读取评论':exhausted?'评论分页已返回，当前作品暂无评论':'需在采集浏览器确认登录与评论可见性'};
 }finally{page.off('response',listener);await Promise.allSettled([...pending]);if(!networkSeen&&!domSaved&&domRows.length)save(domRows);}}
 async close(){this.stop=true;await Promise.allSettled([...this.contexts.values()].map(c=>c.close()));await this.job;}
}
