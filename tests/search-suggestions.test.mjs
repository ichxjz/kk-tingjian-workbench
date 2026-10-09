import test from 'node:test';
import assert from 'node:assert/strict';
import {searchSuggestions} from '../src/lib/search-suggestions.mjs';
test('Search suggestions use platform responses, deduplicate, cache and close owned tabs',async()=>{
 let opened=0,closed=0;
 const browser={context:async()=>({newPage:async()=>{
  opened++;let callback;
  const locator={filter(){return this;},first(){return this;},async fill(){
   await callback({url:()=> 'https://www.xiaohongshu.com/api/search/recommend',json:async()=>({data:{items:[{text:'测试关键词教程'},{text:'测试关键词教程'},{text:'不相关'}]}})});
   await callback({url:()=> 'https://example.org/api/search/suggest',json:async()=>({text:'测试关键词错误来源'})});
  },allTextContents:async()=>[],innerText:async()=>''};
  return {on:(event,fn)=>callback=fn,goto:async()=>{},locator:()=>locator,waitForTimeout:async()=>{},close:async()=>closed++};
 }})};
 const result=await searchSuggestions(browser,'测试关键词');assert.deepEqual(result.suggestions,['测试关键词教程']);assert.equal(closed,2);
 await searchSuggestions(browser,'测试关键词');assert.equal(opened,2);
});
test('Unavailable platform search returns a useful empty response without inventing words',async()=>{
 const browser={context:async()=>{throw Error('Unavailable');}};
 const result=await searchSuggestions(browser,'不可用关键词');assert.deepEqual(result.suggestions,[]);assert.match(result.message,/登录/);
});
