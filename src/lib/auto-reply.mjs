import {categories,classify,eligible,sourceId,sourceUrl} from './core.mjs';
const defaults={enabled:false,greeting:'',platforms:['douyin','xiaohongshu'],categories:categories.map(c=>c.name)};
export class AutoReply {
 constructor(store,sender,{intervalMs=60000,pollMs=3000}={}){this.store=store;this.db=store.db;this.sender=sender;this.intervalMs=intervalMs;this.busy=false;this.closed=false;this.nextAt=0;
 this.db.exec(`CREATE TABLE IF NOT EXISTS reply_queue(id INTEGER PRIMARY KEY,comment_key TEXT UNIQUE,task_id TEXT,payload TEXT,greeting TEXT,status TEXT,message TEXT DEFAULT '',created_at TEXT,updated_at TEXT);`);
 this.db.prepare("UPDATE reply_queue SET status='unknown',message='服务中断，发送结果不明；请在平台核对，不会自动重发' WHERE status='sending'").run();
 const last=this.db.prepare("SELECT MAX(updated_at) at FROM reply_queue WHERE status IN ('sent','unknown','blocked')").get()?.at;this.nextAt=last?Date.parse(last)+this.intervalMs:0;
 if(this.db.prepare("SELECT id FROM reply_queue WHERE status IN ('unknown','blocked') LIMIT 1").get())this.pause();
 this.timer=setInterval(()=>{this.job=this.tick().catch(()=>this.pause());},pollMs);this.timer.unref();
 }
 config(){const raw=this.db.prepare("SELECT value FROM app_settings WHERE key='auto_reply'").get()?.value;return raw?{...defaults,...JSON.parse(raw)}:{...defaults};}
 set(key,value){this.db.prepare('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));}
 status(){return {...this.config(),intervalSeconds:this.intervalMs/1000,records:this.db.prepare('SELECT id,task_id,payload,status,message,created_at,updated_at FROM reply_queue ORDER BY id DESC LIMIT 30').all().map(({payload,...r})=>({...r,comment:JSON.parse(payload)})),counts:Object.fromEntries(this.db.prepare('SELECT status,COUNT(*) n FROM reply_queue GROUP BY status').all().map(r=>[r.status,r.n]))};}
 save(input){if(!input||typeof input.enabled!=='boolean'||typeof input.greeting!=='string'||input.greeting.length>500)throw Error('请填写最多500字的用语并选择启用状态');const greeting=input.greeting.trim();if(input.enabled&&!greeting)throw Error('启用前请填写打招呼用语');if(!Array.isArray(input.platforms)||!input.platforms.length||input.platforms.some(p=>!defaults.platforms.includes(p)))throw Error('请选择抖音或小红书');if(!Array.isArray(input.categories)||!input.categories.length||input.categories.some(c=>!defaults.categories.includes(c)))throw Error('请至少选择一种需求');
 if(this.busy)throw Error('正在处理一条回复，请稍后保存；可先点击停止自动回复');
 const value={enabled:input.enabled,greeting,platforms:[...new Set(input.platforms)],categories:[...new Set(input.categories)]};
 this.db.exec('BEGIN');try{this.set('auto_reply',value);this.set('auto_reply_cursor',this.db.prepare('SELECT MAX(rowid) n FROM task_comments').get().n||0);this.db.prepare("UPDATE reply_queue SET status='cancelled',message='设置已更新，旧待发送记录已取消' WHERE status='pending'").run();this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}return this.status();
 }
 pause(){const value=this.config();this.set('auto_reply',{...value,enabled:false});}
 async tick(){if(this.busy||this.closed||!this.config().enabled)return;this.busy=true;try{const config=this.config();const cursor=JSON.parse(this.db.prepare("SELECT value FROM app_settings WHERE key='auto_reply_cursor'").get()?.value||'0');
 const rows=this.db.prepare('SELECT t.rowid seq,t.task_id,COALESCE(t.payload,c.payload) payload FROM task_comments t JOIN comments c ON c.key=t.comment_key WHERE t.rowid>? ORDER BY t.rowid LIMIT 200').all(cursor);
 this.db.exec('BEGIN');try{for(const r of rows){const c=JSON.parse(r.payload),task=this.store.get(r.task_id);if(!task||!['links','search','creator'].includes(task.mode)||!config.platforms.includes(c.platform)||!c.comment_id||!c.post_id||!c.source_url||c.text===config.greeting||!eligible(c,task.options)||!classify(c.text).some(v=>config.categories.includes(v)))continue;try{if(sourceUrl(c.source_url).platform!==c.platform||sourceId(c.source_url)!==c.post_id)continue;}catch{continue;}
 const now=new Date().toISOString();this.db.prepare("INSERT OR IGNORE INTO reply_queue(comment_key,task_id,payload,greeting,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)").run(c.key,r.task_id,JSON.stringify(c),config.greeting,now,now);}
 if(rows.length)this.set('auto_reply_cursor',rows.at(-1).seq);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
 if(Date.now()<this.nextAt||!this.config().enabled||this.closed)return;
 const row=this.db.prepare("SELECT * FROM reply_queue WHERE status='pending' ORDER BY id LIMIT 1").get();if(!row)return;
 this.db.prepare("UPDATE reply_queue SET status='sending',updated_at=? WHERE id=?").run(new Date().toISOString(),row.id);
 try{const result=await this.sender(JSON.parse(row.payload),row.greeting,()=>!this.closed&&this.config().enabled);if(!result?.confirmed)throw Object.assign(Error('没有收到平台确认，需人工核对'),{uncertain:true});this.finish(row.id,'sent','平台已确认发送成功');}
 catch(e){this.finish(row.id,e.uncertain?'unknown':'blocked',e.message.slice(0,250));this.pause();}
 this.nextAt=Date.now()+this.intervalMs;
 }finally{this.busy=false;}}
 finish(id,status,message){this.db.prepare('UPDATE reply_queue SET status=?,message=?,updated_at=? WHERE id=?').run(status,message,new Date().toISOString(),id);}
 async close(){this.closed=true;clearInterval(this.timer);while(this.busy)await new Promise(r=>setTimeout(r,50));}
}
