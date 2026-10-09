import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/lib/store.mjs';
import {normalize} from '../src/lib/core.mjs';
import {createApp} from '../src/server.mjs';
import {LANGUAGES} from '../src/public/languages.js';
import {translateText} from '../src/lib/translation.mjs';
test('Read totals include duplicates and skipped reads without changing saved comments',()=>{
 const store=new Store(':memory:');try{const task=store.create({name:'test',mode:'links'}),row=normalize({platform:'douyin',text:'请问怎么使用',comment_id:'a',post_id:'1'});store.insert(task.id,[row,row]);store.recordReads(task.id,3);assert.equal(store.get(task.id).received,5);assert.equal(store.get(task.id).count,1);assert.equal(store.get(task.id).received_legacy,0);}finally{store.close();}
});
test('Metric filters distinguish all, valid, identifiable works and needs',async()=>{
 const app=await createApp({dbPath:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{
  const task=app.store.create({name:'filter test',mode:'links',options:{exclude:'屏蔽'}});
  app.store.insert(task.id,[normalize({platform:'douyin',text:'请问怎么使用',comment_id:'1',post_id:'1'}),normalize({platform:'douyin',text:'屏蔽这条内容',comment_id:'2',post_id:'1'}),normalize({platform:'douyin',text:'风景优美很好看',comment_id:'3'})]);
  const base='http://127.0.0.1:'+app.server.address().port+'/api/tasks/'+task.id;
  const counts={};for(const scope of ['all','valid','posts','needs'])counts[scope]=(await(await fetch(base+'?scope='+scope)).json()).matched;
  assert.deepEqual(counts,{all:3,valid:2,posts:1,needs:1});
 }finally{await app.close();}
});
test('Translation offers 100 unique languages and validates before networking',async()=>{assert.equal(LANGUAGES.length,100);assert.equal(new Set(LANGUAGES.map(x=>x[0])).size,100);await assert.rejects(()=>translateText({text:'hello',source:'invalid',target:'en'}));assert.deepEqual(await translateText({text:'hello',source:'en',target:'en'}),{text:'hello'});});
