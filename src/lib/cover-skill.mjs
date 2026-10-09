import https from 'node:https';
import {lookup} from 'node:dns/promises';
export function validateSkill(text){text=String(text||'').trim();if(!text||Buffer.byteLength(text)>65536)throw Error('Skill 内容应为1–64 KB的 Markdown 或纯文本');if(/\x00|<html\b|<!doctype html/i.test(text))throw Error('请提供 Markdown 或纯文本文件，不是网页页面');return text;}
export function publicAddress(ip){const p=ip.split('.').map(Number);return p.length===4&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=255)&&![0,10,127].includes(p[0])&&p[0]<224&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&p[1]===168)&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&!(p[0]===198&&[18,19].includes(p[1]));}
export async function fetchSkill(link,depth=0){
 if(depth>3)throw Error('链接跳转过多，请使用文件直链');let u;try{u=new URL(link);}catch{throw Error('请输入有效HTTPS链接');}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('请使用公开HTTPS文件链接');
 if(u.hostname==='github.com'&&u.pathname.includes('/blob/')){u.hostname='raw.githubusercontent.com';u.pathname=u.pathname.replace('/blob/','/');}
 const {address}=await lookup(u.hostname,{family:4});if(!publicAddress(address))throw Error('不支持本机或内网地址');
 const result=await new Promise((resolve,reject)=>{const req=https.get(u,{lookup:(_h,options,cb)=>options.all?cb(null,[{address,family:4}]):cb(null,address,4),headers:{Accept:'text/plain, text/markdown','User-Agent':'CoverSkillImporter/1.0'}},res=>{if([301,302,303,307,308].includes(res.statusCode)){res.resume();resolve({redirect:res.headers.location});return;}if(res.statusCode!==200){res.resume();reject(Error('链接读取失败，请使用可公开访问的文件直链'));return;}let size=0,chunks=[];res.on('data',c=>{size+=c.length;if(size>65536){req.destroy(Error('Skill 文件不能超过64 KB'));return;}chunks.push(c);});res.on('end',()=>resolve({text:Buffer.concat(chunks).toString('utf8')}));res.on('error',reject);});const timer=setTimeout(()=>req.destroy(Error('链接读取超时，请下载文件后上传')),15000);req.on('close',()=>clearTimeout(timer));req.on('error',reject);});
 if(result.redirect)return fetchSkill(new URL(result.redirect,u).href,depth+1);
 return {text:validateSkill(result.text),name:decodeURIComponent(u.pathname.split('/').pop()||'在线Skill')};
}
