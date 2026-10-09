import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/lib/store.mjs';
import {CollectionManager} from '../src/lib/collection-manager.mjs';
import {normalize} from '../src/lib/core.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
test('Parallel tasks have independent pause, duplicate guard, capacity and released slots',async()=>{
 const store=new Store(':memory:');const controls=new Map();
 const manager=new CollectionManager(store,process.cwd(),{workerFactory:()=>({
  async run(id){this.id=id;store.update(id,{status:'running'});this.job=new Promise(resolve=>controls.set(id,resolve));},
  pause(id){assert.equal(id,this.id);store.update(id,{status:'paused'});controls.get(id)();},
  async close(){controls.get(this.id)?.();await this.job;}
 })});
 try{const tasks=Array.from({length:4},(_,i)=>store.create({name:'keyword'+i,mode:'search',options:{query:'keyword'+i,maxComments:10}}));
 await Promise.all(tasks.slice(0,3).map(t=>manager.run(t.id)));
 assert.equal(manager.activeTaskIds.length,3);
 await assert.rejects(()=>manager.run(tasks[0].id,{continueAnalysis:true}),/重复/);
 await assert.rejects(()=>manager.run(tasks[3].id),/3 个任务/);
 const comment=normalize({platform:'douyin',post_id:'12345678900',comment_id:'1',text:'怎么使用',source_url:'https://www.douyin.com/video/12345678900'});
 store.insert(tasks[0].id,[comment]);assert.equal(store.get(tasks[1].id).count,0);
 manager.pause(tasks[0].id);await tick();assert.equal(manager.activeTaskIds.length,2);assert.equal(store.get(tasks[1].id).status,'running');
 await manager.run(tasks[3].id);assert.equal(manager.activeTaskIds.length,3);
 }finally{await manager.close();store.close();}
});
test('Browser worker cleanup closes its own pages, retaining shared login and other tasks',async()=>{
 const store=new Store(':memory:');const manager=new CollectionManager(store,process.cwd());let sharedClosed=false,pageClosed=false;
 manager.browser.context=async()=>({close:async()=>{sharedClosed=true;}});
 const worker=manager.createWorker({options:{engine:'browser'}});worker.workPages.set('douyin',{close:async()=>{pageClosed=true;}});
 await worker.context('douyin');await worker.close();assert.equal(pageClosed,true);assert.equal(sharedClosed,false);store.close();
});
