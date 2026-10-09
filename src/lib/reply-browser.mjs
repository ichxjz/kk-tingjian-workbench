import {sourceUrl,sourceId} from './core.mjs';
export function validReplyRequest(url,body,c,greeting){
 let u;try{u=new URL(url);if(!['douyin','xiaohongshu'].includes(c.platform)||sourceUrl(u.href).platform!==c.platform)return false;}catch{return false;}
 let data;try{data=JSON.parse(body||'{}');}catch{data=Object.fromEntries(new URLSearchParams(body||''));}
 data={...Object.fromEntries(u.searchParams),...data};
 const post=String(data.aweme_id??data.note_id??'');
 const target=String(data.target_comment_id??data.reply_id??data.comment_id??(!c.parent_id?data.root_comment_id:'')??'');
 return post===c.post_id&&target===c.comment_id&&String(data.content??data.text??'').trim()===greeting.trim();
}
export async function sendBrowserReply(collector,c,greeting,allowed){
 if(!allowed())throw Error('自动回复已停止');
 if(sourceUrl(c.source_url).platform!==c.platform||sourceId(c.source_url)!==c.post_id)throw Error('作品链接与评论身份不一致，请核对来源');
 const ctx=await collector.context(c.platform),page=await ctx.newPage();let dispatched=false,guardRejected=false,submitting=false;let publishResult;let resolveResponse;
 const responsePromise=new Promise(r=>resolveResponse=r);
 const isPublish=url=>/\/comment\/(?:publish|post|create|reply)(?:\/|\?|$)/i.test(new URL(url).pathname);
 await page.route('**/*',async route=>{const req=route.request();if(submitting&&!['GET','HEAD','OPTIONS'].includes(req.method())&&!isPublish(req.url())){await route.abort();return;}if(req.method()==='POST'&&isPublish(req.url())){
  if(dispatched||!allowed()||!validReplyRequest(req.url(),req.postData(),c,greeting)){guardRejected=true;await route.abort();resolveResponse(null);return;}
  dispatched=true;
 }await route.fallback();});
 page.on('response',async res=>{if(!isPublish(res.url())||res.request().method()!=='POST'||!validReplyRequest(res.url(),res.request().postData(),c,greeting))return;try{const data=await res.json();const id=data.comment?.cid??data.data?.comment?.id??data.data?.id;const ok=res.ok()&&(data.code===0||data.status_code===0||data.success===true);resolveResponse(ok&&id?{confirmed:true}:null);}catch{resolveResponse(null);}});
 try{
 await page.goto(c.source_url,{waitUntil:'domcontentloaded',timeout:30000});
 const id=JSON.stringify(c.comment_id),prefixed=JSON.stringify('comment-'+c.comment_id);
 const row=page.locator(`[data-comment-id=${id}],.comment-item[data-id=${id}],.comment-item[id=${id}],.comment-item[id=${prefixed}],[data-e2e="comment-item"][data-id=${id}]`).filter({visible:true});
 for(let i=0;i<8&&await row.count()===0;i++){if(!allowed())throw Error('自动回复已停止');await page.mouse.wheel(0,600);await page.waitForTimeout(700);}
 if(await row.count()!==1)throw Error('未找到唯一的目标评论。请在数据连接登录，或打开原作品完成验证后重新启用');
 const content=row.locator(c.platform==='douyin'?'[data-e2e="comment-content"]':'.content').first();
 if((await content.textContent()).replace(/\s+/g,' ').trim()!==c.text.replace(/\s+/g,' ').trim())throw Error('评论正文与采集记录不一致，已停止发送');
 const reply=row.getByText('回复',{exact:true}).filter({visible:true});if(await reply.count()!==1)throw Error('未找到目标评论的回复按钮');await reply.click();
 const editor=page.locator(c.platform==='douyin'?'[data-e2e="comment-input"] [contenteditable="true"],textarea[placeholder*="回复"],[contenteditable="true"][data-placeholder*="回复"]':'#content-textarea,[contenteditable="true"][data-placeholder*="回复"],textarea[placeholder*="回复"]').filter({visible:true});
 await editor.first().waitFor({timeout:5000});if(await editor.count()!==1)throw Error('回复输入框不唯一，已停止发送');await editor.fill(greeting);
 let container=editor.locator('..');let send;for(let i=0;i<4;i++){const candidate=container.getByText('发送',{exact:true}).filter({visible:true});if(await candidate.count()===1){send=candidate;break;}container=container.locator('..');}
 if(!send)throw Error('未找到回复发送按钮');if(!allowed())throw Error('自动回复已停止');
 submitting=true;await send.click();let timer;publishResult=await Promise.race([responsePromise,new Promise(r=>timer=setTimeout(()=>r(null),12000))]);clearTimeout(timer);
 if(guardRejected)throw Error('发送目标或内容校验不通过，请在平台核对回复对象');
 if(!publishResult?.confirmed)throw Object.assign(Error(dispatched?'平台未确认发送结果，请核对原评论；不会自动重发':'未检测到有效的评论发送请求，请检查登录或平台页面'),{uncertain:dispatched});return publishResult;
 }catch(e){if(dispatched)e.uncertain=true;throw e;}finally{await page.close().catch(()=>{});}
}
