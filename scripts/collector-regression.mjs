import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {Store} from '../src/lib/store.mjs';
import {Collector} from '../src/lib/collector.mjs';
import {normalize} from '../src/lib/core.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const store=new Store(':memory:');const collector=new Collector(store,process.cwd());
const id='6a9f60fb0000000011036d44',url='https://www.xiaohongshu.com/explore/'+id;
try{
 const context=await browser.newContext();let replies=0;
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname==='/short'){await route.fulfill({contentType:'text/html; charset=utf-8',body:`<script>location.replace('${url}')</script>`});return;}if(u.pathname.includes('/comment/')){if(u.pathname.includes('/sub/')){replies++;await route.fulfill({json:{data:{comments:[{id:'2',content:'独立回复'}],has_more:false}}});}else await route.fulfill({json:{data:{comments:[{id:'1',content:'主评论内容',sub_comment_count:1}],has_more:false}}});return;}await route.fulfill({contentType:'text/html; charset=utf-8',body:`<html><head><title>回归测试</title></head><body><button style="display:none">展开0条回复</button><div class="comments-container"><div class="comment-item"><span class="content">主评论内容</span></div><button onclick="this.remove();fetch('/api/comment/sub/page?note_id=${id}&root_comment_id=1')">展开1条回复</button></div><script>setTimeout(()=>fetch('/api/comment/page?note_id=${id}'),4200)</script></body></html>`});});
 const page=await context.newPage();collector.page=async()=>page;
 const link={platform:'xiaohongshu',url:'https://xhslink.com/short'};
 const task=store.create({name:'短链接与延迟响应',mode:'links',options:{links:[link],maxPosts:1,maxComments:10}});
 // A prior attempt saved one comment under the resolved post ID.
 store.insert(task.id,[normalize({text:'主评论内容',platform:'xiaohongshu',post_id:id,source_url:url,comment_id:'1'})]);
 await collector.execute(task);
 const rows=store.comments(task.id);if(rows.length!==2)console.log({task:store.get(task.id),sources:store.sources(task.id),replies,rows});assert.equal(rows.length,2);assert.equal(rows.find(c=>c.comment_id==='2').parent_id,'1');assert.ok(rows.every(c=>c.comment_id));assert.equal(store.sources(task.id)[0].count,2);assert.equal(store.sources(task.id)[0].status,'complete');assert.equal(replies,1);
 console.log('PASS 短链接续采 + 延迟响应与页面去重 + 主评论结束后展开回复 + 独立回复上下文');
 await context.close();
}finally{await browser.close();store.close();}
