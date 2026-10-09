import {mkdir,cp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';import {pathToFileURL} from 'node:url';
const resources=process.env.KK_RESOURCES,data=process.env.KK_APP_DATA_DIR,instance=process.env.KK_DESKTOP_INSTANCE;
if(!resources||!data||!instance)throw Error('请从 KK-听见.app 启动');
const workspace=path.join(data,'workspace'),runtime=path.join(data,'runtime');
await mkdir(data,{recursive:true,mode:0o700});await mkdir(workspace,{recursive:true,mode:0o700});
const manifest=JSON.parse(await readFile(path.join(resources,'release.json'),'utf8'));let current='';try{current=await readFile(path.join(workspace,'.release'),'utf8');}catch{}
if(current!==manifest.build){
 const staging=path.join(data,'update-'+instance);await cp(path.join(resources,'payload'),staging,{recursive:true,verbatimSymlinks:true});
 for(const name of ['src','scripts','node_modules','package.json','package-lock.json']){await rm(path.join(workspace,name),{recursive:true,force:true});await rename(path.join(staging,name),path.join(workspace,name));}
 await rm(staging,{recursive:true,force:true});await cp(path.join(resources,'runtime'),runtime,{recursive:true,verbatimSymlinks:true});await writeFile(path.join(workspace,'.release'),manifest.build);
}
process.env.KK_BASE_PYTHON=path.join(runtime,'python/bin/python3.12');process.env.KK_TOOL_DIR=path.join(runtime,'bin');process.env.KK_FFMPEG=path.join(runtime,'bin/ffmpeg');process.env.KK_FFPROBE=path.join(runtime,'bin/ffprobe');process.env.HF_HUB_CACHE=path.join(data,'models/hub');process.env.HF_HOME=path.join(data,'models');process.env.PYTHONNOUSERSITE='1';delete process.env.PYTHONPATH;delete process.env.PYTHONHOME;delete process.env.DATA_PATH;
process.env.PATH=path.join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin';
process.chdir(workspace);const {createApp}=await import(pathToFileURL(path.join(workspace,'src/server.mjs')));const app=await createApp();
let bound=false;for(let port=Number(process.env.KK_TEST_PORT||5189);port<Number(process.env.KK_TEST_PORT||5189)+30;port++){try{await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',()=>{app.server.removeListener('error',reject);resolve();});});bound=true;break;}catch(e){if(e.code!=='EADDRINUSE')throw e;}}
if(!bound)throw Error('本机端口繁忙，请关闭重复运行的程序后重试');
const url=`http://127.0.0.1:${app.server.address().port}/?desktop=1`;
await writeFile(path.join(data,'session.json'),JSON.stringify({instance,url,pid:process.pid}),{mode:0o600});console.log('工作台已启动：'+url);
let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{if(stopping)return;stopping=true;try{await app.close();}finally{await rm(path.join(data,'session.json'),{force:true});process.exit(0);}});
