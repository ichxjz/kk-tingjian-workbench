import {readdir}from'node:fs/promises';import{spawnSync}from'node:child_process';
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else if(/\.(mjs|js)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status){console.error(r.stderr);process.exitCode=1;}}}}
await walk('src');await walk('scripts');await walk('tests');if(!process.exitCode)console.log('JavaScript syntax checks passed.');
