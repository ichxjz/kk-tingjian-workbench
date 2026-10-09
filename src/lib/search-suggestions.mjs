// Read the platforms' normal search dropdown in an isolated tab of the login context.
const cache=new Map();let pending=null;
export async function searchSuggestions(browser,query){
 const q=String(query||'').trim().slice(0,60);if(q.length<2)return {suggestions:[]};
 const old=cache.get(q);if(old&&Date.now()-old.time<60000)return old.result;
 if(pending)return {suggestions:[],message:'平台正在查询上一组推荐，请稍后再输入'};
 pending=(async()=>{
  const results=await Promise.allSettled(['xiaohongshu','douyin'].map(async platform=>{
   const context=await browser.context(platform),page=await context.newPage();const words=new Set();
   try{
    page.on('response',async response=>{try{const url=new URL(response.url());if(!/(^|\.)(douyin\.com|xiaohongshu\.com)$/.test(url.hostname)||!/suggest|recommend|complete/i.test(url.pathname))return;const body=await response.json();const visit=(value,depth=0)=>{if(depth>8||!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(['word','query','keyword','text'].includes(key)&&typeof item==='string'&&item.length<=80&&item.toLowerCase().includes(q.toLowerCase()))words.add(item);else if(typeof item==='object')visit(item,depth+1);}};visit(body);}catch{}});
    await page.goto(platform==='douyin'?'https://www.douyin.com/':'https://www.xiaohongshu.com/explore',{waitUntil:'commit',timeout:18000});
    const input=page.locator('input[placeholder*="搜索"],input#search-input,input[data-e2e="searchbar-input"]').filter({visible:true}).first();
    await input.fill(q,{timeout:7000});await page.waitForTimeout(1300);
    const visible=await page.locator('[role="option"],.sug-item,[class*="suggest"] li,[class*="suggest"] [class*="item"],[class*="sug"] [class*="item"],[class*="search"] [class*="recommend"] [class*="item"]').allTextContents();
    for(const value of visible){const word=value.trim().replace(/\s+/g,' ');if(word.length<=80&&word.toLowerCase().includes(q.toLowerCase()))words.add(word);}
    if(!words.size){const text=await page.locator('body').innerText({timeout:3000});if(/验证|登录|风险/.test(text))throw Error(platform==='douyin'?'抖音需要登录或验证':'小红书需要登录或验证');}return [...words].slice(0,10);
   }catch{throw Error(platform==='douyin'?'抖音搜索框暂不可用，请在数据连接中检查页面':'小红书搜索框暂不可用，请在数据连接中检查页面');}finally{await page.close().catch(()=>{});}
  }));
  const suggestions=[...new Set(results.flatMap(r=>r.status==='fulfilled'?r.value:[]))].slice(0,15);
  const failures=results.filter(r=>r.status==='rejected').map(r=>String(r.reason?.message||'').split('\n')[0].slice(0,80));
  const result={suggestions,message:suggestions.length?'来自抖音 / 小红书搜索推荐':'平台暂未返回推荐词；可直接输入任务名称，或在数据连接中完成登录后重试'+(failures.length?'（'+failures.join('；')+'）':'')};cache.set(q,{time:Date.now(),result});return result;
 })();try{return await pending;}finally{pending=null;}
}
