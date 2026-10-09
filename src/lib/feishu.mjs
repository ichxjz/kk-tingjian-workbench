import {PLATFORM_NAMES} from '../public/platforms.js';
import {readFile,writeFile,mkdir,rename,chmod} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const API='https://open.feishu.cn/open-apis';
const columns=[['key','导出标识',1],['text','评论内容',1],['platform','平台',1],['likes','点赞数',2],['created_at','评论时间',1],['title','作品标题',1],['source_url','来源链接',1],['comment_id','评论ID',1],['post_id','作品ID',1],['author','作者昵称',1],['parent_id','父评论ID',1],['parent_text','上级评论正文',1],['category','需求分类',1],['sentiment','情绪参考',1],['favorite','已收藏',7]];
export function parseBase(value){
 let u;try{u=new URL(String(value).trim());}catch{throw Error('请粘贴飞书多维表格的完整链接');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='feishu.cn'||u.hostname.endsWith('.feishu.cn')))throw Error('请使用 https://…feishu.cn/base/… 的多维表格链接');
 const token=u.pathname.match(/^\/base\/([a-zA-Z0-9]+)\/?$/)?.[1];
 if(!token)throw Error('请从多维表格复制 /base/ 链接；知识库 /wiki/ 链接请先打开原始多维表格');
 return {token,url:u.origin+'/base/'+token};
}
export function recordFields(row,task){const fields={};for(const [key,name,type] of columns){let value=row[key];if(key==='platform')value=PLATFORM_NAMES[value]||value;if(key==='created_at'&&value)value=new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});fields[name]=type===2?Number(value||0):type===7?!!value:String(value??'');}fields['分析任务']=task.name;fields['样本范围']=task.mode==='demo'?'人工演示数据':'仅当前已获取且符合筛选的评论，不代表全量';return {fields};}
export class Feishu {
 constructor(store,configFile,{fetchImpl=fetch}={}){this.store=store;this.configFile=configFile;this.fetch=fetchImpl;this.busy=false;this.progress=null;store.db.exec('CREATE TABLE IF NOT EXISTS feishu_exports(id TEXT PRIMARY KEY,payload TEXT NOT NULL)');}
 async config(){try{return JSON.parse(await readFile(this.configFile,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('飞书配置读取失败，请检查本机配置文件');}}
 async status(){const c=await this.config();return {appId:c.appId||'',baseUrl:c.baseUrl||'',configured:!!(c.appId&&c.appSecret&&c.baseUrl),hasSecret:!!c.appSecret,progress:this.progress};}
 async save(input){if(this.busy)throw Error('正在连接或导出，请完成后再修改飞书连接');this.busy=true;try{const old=await this.config();const appId=String(input.appId||'').trim();const appSecret=String(input.appSecret||'').trim()||(old.appId===appId?old.appSecret:'');const target=parseBase(input.baseUrl);if(!/^cli_[a-zA-Z0-9]+$/.test(appId)||!appSecret)throw Error('请填写飞书自建应用的 App ID 和 App Secret');
 const c={appId,appSecret,baseUrl:target.url};const token=await this.auth(c);await this.list('/bitable/v1/apps/'+target.token+'/tables',token);await mkdir(path.dirname(this.configFile),{recursive:true});const temp=this.configFile+'.tmp';await writeFile(temp,JSON.stringify(c),{mode:0o600});await chmod(temp,0o600);await rename(temp,this.configFile);return await this.status();}finally{this.busy=false;}}
 async request(endpoint,{token,method='GET',body}={}){let r,b;try{r=await this.fetch(API+endpoint,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});b=await r.json();}catch{throw Error('飞书连接超时或网络异常。已确认写入的进度已保留，可重新点击导出继续');}
 if(!r.ok||b.code!==0){const code=Number(b.code)||r.status;const hint=[99991661,99991663,99991664,99991668,99991672,99991679,99991680].includes(code)?'请检查 App ID、App Secret，以及应用是否已发布':r.status===403||[1254302,1254303,91403,99991671].includes(code)?'请开通多维表格权限，并将应用添加为目标多维表格的可编辑协作者':r.status===429?'请求过于频繁，请稍后继续导出':'请检查应用权限、表格协作者权限及目标链接';throw Error(`飞书返回错误（${code}）：${hint}`);}return b;}
 async auth(c){const b=await this.request('/auth/v3/tenant_access_token/internal',{method:'POST',body:{app_id:c.appId,app_secret:c.appSecret}});if(!b.tenant_access_token)throw Error('飞书未返回有效访问凭证，请检查应用配置');return b.tenant_access_token;}
 saveJob(job){this.store.db.prepare('INSERT INTO feishu_exports VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(job.id,JSON.stringify(job));}
 async list(endpoint,token){const items=[];let page='';const visited=new Set();do{const b=await this.request(endpoint+'?page_size=100'+(page?'&page_token='+encodeURIComponent(page):''),{token});items.push(...(b.data?.items||[]));if(!b.data?.has_more)break;page=b.data.page_token;if(!page||visited.has(page))throw Error('飞书分页返回异常，请稍后继续');visited.add(page);}while(page);return items;}
 async export(task,rows){if(this.busy)throw Error('已有飞书导出正在进行，请稍后重试');if(!rows.length)throw Error('当前筛选没有评论，请调整条件后再导出');this.busy=true;this.progress={done:0,total:rows.length};try{
 const c=await this.config();if(!c.appId||!c.appSecret||!c.baseUrl)throw Error('请先配置飞书连接');const target=parseBase(c.baseUrl),records=rows.map(r=>recordFields(r,task));const id=createHash('sha256').update(JSON.stringify([c.appId,target.token,task.id,records])).digest('hex');
 const saved=this.store.db.prepare('SELECT payload FROM feishu_exports WHERE id=?').get(id);const job=saved?JSON.parse(saved.payload):{id,name:('评论-'+task.name).replace(/[\r\n]/g,' ').slice(0,35)+'-'+id.slice(0,10),tableId:'',done:0,total:records.length,pending:null};
 const token=await this.auth(c),endpoint='/bitable/v1/apps/'+target.token;
 // Reconcile an uncertain create response by the persisted unique table name before writing again.
 const tables=await this.list(endpoint+'/tables',token);const existing=tables.find(t=>job.tableId?t.table_id===job.tableId:t.name===job.name);
 if(job.tableId&&!existing)throw Error('上次导出的数据表已不存在，请检查目标表格后再导出');
 if(existing)job.tableId=existing.table_id;
 if(!job.tableId){this.saveJob(job);const b=await this.request(endpoint+'/tables',{token,method:'POST',body:{table:{name:job.name,default_view_name:'评论明细',fields:[...columns.map(([,field_name,type])=>({field_name,type})),{field_name:'分析任务',type:1},{field_name:'样本范围',type:1}]}}});job.tableId=b.data?.table_id;if(!/^tbl[a-zA-Z0-9]+$/.test(job.tableId||''))throw Error('飞书未返回有效数据表，请重新导出以检查创建结果');this.saveJob(job);}
 const table=endpoint+'/tables/'+job.tableId;
 // Read stable keys before each attempt: handles restart and a lost successful batch response.
 const remote=await this.list(table+'/records',token);const keys=new Set(remote.map(r=>{const v=r.fields?.['导出标识'];return Array.isArray(v)?v.map(x=>x.text||'').join(''):String(v??'');}));
 const remaining=records.filter(r=>!keys.has(r.fields['导出标识']));job.done=records.length-remaining.length;this.progress.done=job.done;
 for(let i=0;i<remaining.length;i+=200){const batch=remaining.slice(i,i+200);const signature=createHash('sha256').update(JSON.stringify(batch)).digest('hex');if(job.pending?.signature!==signature)job.pending={signature,token:randomUUID()};this.saveJob(job);const b=await this.request(table+'/records/batch_create?client_token='+job.pending.token,{token,method:'POST',body:{records:batch}});if(b.data?.records?.length!==batch.length)throw Error('飞书返回的写入数量未能核实，请重新导出以核对已有记录');job.done+=batch.length;job.pending=null;this.saveJob(job);this.progress.done=job.done;}
 this.saveJob(job);return {url:target.url+'?table='+job.tableId,total:records.length,added:remaining.length,skipped:records.length-remaining.length,tableName:job.name};
 }finally{this.busy=false;this.progress=null;}}
}
