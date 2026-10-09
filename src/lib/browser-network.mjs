import {execFileSync} from 'node:child_process';
// Honor the existing macOS proxy explicitly, including Playwright's download requests.
export function browserNetwork(){if(process.platform!=='darwin')return {};try{const state=execFileSync('/usr/sbin/scutil',['--proxy'],{encoding:'utf8',timeout:2000});const read=k=>state.match(new RegExp('\\b'+k+' : ([^\\n]+)'))?.[1]?.trim();const host=read('HTTPSProxy'),port=read('HTTPSPort');if(read('HTTPSEnable')==='1'&&host&&/^\d+$/.test(port))return {proxy:{server:`http://${host}:${port}`,bypass:'127.0.0.1,localhost'}};}catch{}return {};}
