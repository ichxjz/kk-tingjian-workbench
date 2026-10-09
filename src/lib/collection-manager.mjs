import {Collector} from './collector.mjs';
import {MediaCollector} from './mediacrawler.mjs';
export class CollectionManager {
 constructor(store,root,{workerFactory,maxConcurrent=3}={}){this.store=store;this.root=root;this.browser=new Collector(store,root);this.media=new MediaCollector(store,root,this.browser.connectionState);this.workers=new Map();this.maxConcurrent=maxConcurrent;this.workerFactory=workerFactory;this.closing=false;}
 get activeTaskIds(){return [...this.workers.keys()];}
 get active(){return this.activeTaskIds[0]||null;}
 get connectionState(){return this.browser.connectionState;}
 get engineStatus(){return this.media.status();}
 assertAvailable(id){if(this.closing)throw Error('采集服务正在关闭，请稍后重试');if(this.workers.has(id))throw Error('该任务已在采集，请勿重复启动');if(this.workers.size>=this.maxConcurrent)throw Error(`已有 ${this.maxConcurrent} 个任务同时采集，请暂停其中一个或等待完成`);}
 createWorker(task){
  const stateFor=async p=>(await this.browser.context(p)).storageState();
  if(task.options.engine==='mediacrawler')return new MediaCollector(this.store,this.root,this.connectionState,{stateFor});
  const worker=new Collector(this.store,this.root);worker.connectionState=this.connectionState;
  // Separate tabs share the canonical login context; task cleanup owns only its tabs.
  worker.context=p=>this.browser.context(p);
  worker.close=async()=>{worker.stop=true;await Promise.allSettled([...worker.workPages.values()].map(p=>p.close()));await worker.job;};
  return worker;
 }
 async run(id,{continueAnalysis=false}={}){
  this.assertAvailable(id);const task=this.store.get(id);
  if(!task||!['links','search','creator'].includes(task.mode))throw Error('该任务没有平台采集来源，无法继续采集');
  if(task.options.engine==='mediacrawler'&&!this.engineStatus.ready)throw Error('增强采集尚未就绪，请检查数据连接');
  const entry={worker:null,starting:true};this.workers.set(id,entry);let snapshot;
  try{if(continueAnalysis)snapshot=this.store.prepareContinuation(id);entry.worker=this.workerFactory?this.workerFactory(task):this.createWorker(task);await entry.worker.run(id);entry.starting=false;
   const job=entry.worker.job;if(job)Promise.resolve(job).catch(()=>{}).finally(async()=>{await entry.worker.close().catch(()=>{});this.workers.delete(id);});
   return this.store.get(id);
  }catch(e){this.workers.delete(id);if(snapshot)this.store.restoreContinuation(snapshot);throw e;}
 }
 pause(id){const entry=this.workers.get(id);if(!entry)throw Error('该任务当前没有在采集');if(entry.starting)throw Error('任务正在启动，请稍后暂停');return entry.worker.pause(id);}
 async connect(p){return this.browser.connect(p);}
 async close(){this.closing=true;await Promise.allSettled([...this.workers.values()].map(e=>e.worker?.close()));this.workers.clear();await this.browser.close();}
}
