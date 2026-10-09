import {execFile} from 'node:child_process';
import {browserNetwork} from './browser-network.mjs';
import {LANGUAGES} from '../public/languages.js';
const codes=new Set(LANGUAGES.map(([code])=>code));
let active=0,googleRetryAt=0;const cache=new Map();
function request(url,params){return new Promise((resolve,reject)=>{const proxy=browserNetwork().proxy?.server;const args=['-fsS','--max-time','12',...(proxy?['--proxy',proxy]:[]),'-G',url];for(const [key,value] of Object.entries(params))if(key!=='q')args.push('--data-urlencode',key+'='+value);args.push('--data-urlencode','q@-');const child=execFile('curl',args,{timeout:14000,maxBuffer:1024*1024},(error,out)=>{if(error)return reject(Error('翻译服务连接失败'));try{resolve(JSON.parse(out));}catch{reject(Error('翻译服务暂时拒绝请求'));}});child.stdin.on('error',()=>{});child.stdin.end(params.q);});}
// MyMemory accepts at most 500 UTF-8 bytes, not 500 characters.
export function splitTranslationText(text){const parts=[];let part='',size=0;for(const char of text){const bytes=Buffer.byteLength(char);if(size+bytes>480){parts.push(part);part='';size=0;}part+=char;size+=bytes;if(/[。！？\n]/u.test(char)){parts.push(part);part='';size=0;}}if(part)parts.push(part);return parts;}
export async function translateText({text,source='zh-CN',target='en'}){
 if(typeof text!=='string'||!text.trim()||text.length>3000)throw Error('请输入1–3000字原文');
 if(!codes.has(source)||!codes.has(target))throw Error('请选择支持的语言');
 if(source===target)return {text};
 const key=JSON.stringify([source,target,text]);if(cache.has(key))return cache.get(key);
 if(active>=6)throw Error('翻译请求较多，请稍后点击重试');active++;
 try{let result;
 if(Date.now()>=googleRetryAt)try{const data=await request('https://translate.googleapis.com/translate_a/single',{client:'gtx',sl:source,tl:target,dt:'t',q:text});const translated=data?.[0]?.map(p=>p?.[0]||'').join('');if(!translated)throw Error('无译文');result={text:translated,provider:'Google 翻译'};}catch{googleRetryAt=Date.now()+300000;}
 if(!result){const parts=[];for(const part of splitTranslationText(text)){if(!part.trim()){parts.push(part);continue;}const data=await request('https://api.mymemory.translated.net/get',{langpair:source+'|'+target,q:part});if(Number(data.responseStatus)!==200||data.quotaFinished||!data.responseData?.translatedText)throw Error(data.quotaFinished?'备用翻译今日额度已用完，请稍后重试':'当前语言翻译服务暂时不可用，请稍后重试');parts.push(data.responseData.translatedText+(part.endsWith('\n')?'\n':''));}result={text:parts.join(''),provider:'MyMemory 备用翻译'};}
 cache.set(key,result);if(cache.size>100)cache.delete(cache.keys().next().value);return result;
 }finally{active--;}
}
