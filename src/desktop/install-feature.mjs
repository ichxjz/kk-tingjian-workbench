import {spawn} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';import path from 'node:path';
const resources=process.env.KK_RESOURCES,data=process.env.KK_APP_DATA_DIR,feature=process.argv[2];
if(!resources||!data||!['speech','design','collector'].includes(feature))throw Error('请在 KK-听见控制窗口选择安装项目');
const workspace=path.join(data,'workspace'),runtime=path.join(data,'runtime'),python=path.join(workspace,'.runtime/video-env/bin/python');
const {browserNetwork}=await import(path.join(workspace,'src/lib/browser-network.mjs'));const proxy=browserNetwork().proxy?.server;
const env={...process.env,PATH:path.join(runtime,'bin')+':/usr/bin:/bin:/usr/sbin:/sbin',UV_PYTHON_DOWNLOADS:'never',UV_PYTHON:path.join(runtime,'python/bin/python3.12'),UV_CACHE_DIR:path.join(data,'cache/uv'),HF_HOME:path.join(data,'models'),HF_HUB_CACHE:path.join(data,'models/hub'),PYTHONNOUSERSITE:'1',...(proxy?{HTTPS_PROXY:proxy,HTTP_PROXY:proxy}:{} )};delete env.HF_HUB_OFFLINE;delete env.TRANSFORMERS_OFFLINE;delete env.PYTHONPATH;delete env.PYTHONHOME;
let child;process.on('SIGTERM',()=>{child?.kill('SIGTERM');process.exit(1);});
const run=(command,args)=>new Promise((resolve,reject)=>{child=spawn(command,args,{cwd:workspace,env,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('安装未完成，请检查网络后重试（退出码 '+code+'）')));});
try{if(feature==='collector'){console.log('正在下载增强采集组件（非商业学习用途）…');await run(process.execPath,[path.join(workspace,'scripts/setup-mediacrawler.mjs')]);}else{
 await mkdir(path.dirname(path.dirname(python)),{recursive:true});
 const {existsSync}=await import('node:fs');if(!existsSync(python))await run(path.join(runtime,'bin/uv'),['venv','--system-site-packages','--python',env.UV_PYTHON,path.dirname(path.dirname(python))]);
 const spec=feature==='speech'?['mlx-whisper==0.4.3','mlx-community/whisper-base-mlx']:['mlx-lm==0.32.0','mlx-community/Qwen3.5-9B-OptiQ-4bit'];
 console.log('正在安装本机模型运行组件…');await run(path.join(runtime,'bin/uv'),['pip','install','--python',python,spec[0]]);
 console.log('正在下载模型，可稍后重试并继续下载…');await run(python,['-c','from huggingface_hub import snapshot_download; import sys; snapshot_download(sys.argv[1])',spec[1]]);
 const module=feature==='speech'?'mlx_whisper':'mlx_lm';await run(python,['-c',`import ${module}; print('模型组件加载正常')`]);
 }
 await writeFile(path.join(data,feature+'-ready.json'),JSON.stringify({installedAt:new Date().toISOString()}));console.log('安装完成，可返回工作台使用。');
}catch(e){console.error(e.message);process.exitCode=1;}
