import {PLATFORM_INFO,PLATFORM_NAMES,platformFromUrl} from '../public/platforms.js';
import { createHash } from 'node:crypto';
export const platforms = PLATFORM_INFO.map(p=>p.id);
export const platformNames = PLATFORM_NAMES;
export function text(value) { return String(value ?? '').normalize('NFKC').replace(/\s+/g,' ').trim(); }
export function platform(value,url='') {const v=text(value).toLowerCase();return PLATFORM_INFO.find(p=>[p.id,p.code,p.name.toLowerCase()].includes(v))?.id||platformFromUrl(url)||'unknown';}
export function safeUrl(value) { try { const u=new URL(String(value)); return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''; } catch{return '';} }
export function sourceUrl(value) { const raw=String(value??'').match(/https?:\/\/[^\s<>"，。]+/)?.[0]; const u=new URL(raw||'https://invalid.invalid'); const host=u.hostname.toLowerCase(); if(u.protocol!=='https:'||u.username||u.password||u.port) throw new Error('请粘贴平台的 HTTPS 分享链接'); const p=platformFromUrl(u.href); if(!p)throw new Error('请使用支持平台的作品或主页分享链接'); return {url:u.href,platform:p}; }
export function sourceId(url='',fallback='') { try { const u=new URL(url); return u.pathname.match(/\/(?:video|note|explore|search_result|discovery\/item|short-video|p|answer|zvideo)\/([\w-]+)/)?.[1] || u.searchParams.get('modal_id') || u.pathname.replace(/\/$/,'') || fallback;} catch{return fallback;} }
export function number(v) { const s=text(v).replace(/,/g,''); const n=parseFloat(s); return Number.isFinite(n)?Math.max(0,Math.round(n*(/[万w]/i.test(s)?10000:/千|k/i.test(s)?1000:1))):0; }
export function date(v) { if(v===null||v===undefined||v==='')return ''; if(typeof v==='number' || /^\d{10,13}$/.test(String(v))) { const n=Number(v); const d=new Date(n<1e12?n*1000:n);return Number.isFinite(d.getTime())?d.toISOString():''; } const s=text(v); if(!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s))return ''; const local=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);const input=local?`${local[1]}-${local[2].padStart(2,'0')}-${local[3].padStart(2,'0')}T${(local[4]||'00').padStart(2,'0')}:${local[5]||'00'}:${local[6]||'00'}+08:00`:s;const d=new Date(input);return Number.isFinite(d.getTime())?d.toISOString():''; }
export function words(v) { return [...new Set(String(v||'').split(/[,，、\n;；]+/).map(text).filter(Boolean))].slice(0,100); }
export function normalize(row,defaults={}) {
 const content=text(row.text??row.content??row.comment??'').slice(0,20000); if(!content)return null;
 const url=safeUrl(row.source_url||row.url||defaults.source_url); const p=platform(row.platform||defaults.platform,url);
 const post=text(row.post_id||sourceId(url,defaults.post_id||''));const id=text(row.comment_id||row.id);
 const created=date(row.created_at||row.time); const author=text(row.author||'');
 const fallback=createHash('sha256').update(JSON.stringify([p,post,content,created,author,text(row.parent_id)])).digest('hex');
 const noise=/^(?:[\p{P}\p{S}\s]|哈|啊|哦|嗯)+$/u.test(content)?'无有效文本':/(?:加我|加微|加V|私信我|联系我).{0,12}(?:领取|赚钱|代理|兼职|返利)|(?:刷单|日赚\d|代刷点赞)/i.test(content)?'疑似推广':'';
 return {key:`${p}:${post}:${id||fallback}`,comment_id:id,text:content,platform:p,post_id:post,source_url:url,title:text(row.title||defaults.title),created_at:created,likes:number(row.likes),parent_id:text(row.parent_id),author,noise,identity:id?'平台ID':'内容指纹'};
}
const STOP=new Set('的 了 是 在 有 和 就 都 也 我 你 他 她 它 们 一个 这个 那个 什么 怎么 如何 为什么 还是 但是 可以 不是 没有 真的 感觉 知道 现在 已经 一下 一点 一些 这样 那样 这种 那种 还有 需要 就是 自己 这么 那么 因为 所以 比较 可能 觉得 时候 时候啊 看到 视频 笔记 博主 请问 求 教程 大家 谢谢 哈哈 哈哈哈 不会 不要 有没有 能不能 一直 其实 太 很 好 啊 吧 呢 呀 么 哦 用 做 说 让 想 要 会 能 吗 给 怎么样 多少 这些 那些 这么多 的话 以及 如果 对于 我也 做了 这个是 是的 做个 我是 我的 你的 他的 他们 目前 好的'.split(' '));
const segmenter=new Intl.Segmenter('zh-CN',{granularity:'word'});
const CANON=new Map([['价钱','价格'],['费用','价格'],['收费','价格'],['售价','价格'],['小白','新手'],['入门','新手'],['卡死','卡顿'],['卡住','卡顿'],['好上手','易上手'],['教学','教程']]);
const PHRASES=['企业资质','个人开发者','知识付费','小程序','ai视频','免费版','付费版','提示词','数字艺术','视频生成','字幕识别','语音识别','人工智能'];
export function tokens(content) {
 let clean=content.replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+/g,' ').toLowerCase();const retained=[];
 for(const phrase of PHRASES){const parts=clean.split(phrase);for(let i=1;i<parts.length;i++)retained.push(phrase);if(parts.length>1)clean=parts.join(' ');}
 return [...retained,...[...segmenter.segment(clean)].filter(x=>x.isWordLike).map(x=>CANON.get(x.segment)||x.segment).filter(x=>!STOP.has(x)&&x.length>1&&!/^\d+$/.test(x)&&!/^https?$/.test(x))];
}
export const categories=[
 {name:'求方法',pattern:/怎么|如何|教程|步骤|求教|不会|哪里学|新手|小白|入门|求助/},
 {name:'遇到困难',pattern:/失败|报错|卡顿|闪退|不好用|不支持|太贵|买不起|搞不定|不准确|困难|麻烦|延迟|不清晰|耗时|太慢/},
 {name:'购买咨询',pattern:/怎么买|哪里买|求链接|多少钱|价格|收费|费用|预算|免费|付费|购买|试用|订阅/},
 {name:'对比选择',pattern:/哪个好|怎么选|区别|对比|相比|替代|还是用|推荐|选哪个/},
 {name:'场景需求',pattern:/能不能|可以用|能用|适合|用于|想做|用来|工作|公司|客户|批量|手机|电脑|配置|资质|备案/},
];
export function classify(content) { const clean=content.replace(/没有报错|不会报错|不贵|不难|不麻烦|不卡顿|没有闪退/g,'顺利'); return categories.filter(c=>c.pattern.test(c.name==='遇到困难'?clean:content)).map(c=>c.name); }
export function sentiment(content) { const s=content.replace(/不贵|不差|不卡|没有报错|不会报错|不难|不麻烦/g,'很好'); if(/太贵|不好|差劲|垃圾|失望|失败|卡顿|报错|闪退|不能用|不推荐/.test(s))return '负面';if(/好用|喜欢|推荐|不错|很好|有用|感谢|学会了|解决了/.test(s))return '正面';return '中性／不确定'; }
export function eligible(c,options={}) {
 if(c.noise&&!options.includeNoise)return false;
 if(options.platform&&c.platform!==options.platform)return false;
 if(words(options.exclude).some(w=>c.text.toLowerCase().includes(w.toLowerCase())))return false;
 if(options.since&&(!c.created_at||new Date(c.created_at)<new Date(options.since+'T00:00:00+08:00')))return false;
 if(options.until&&(!c.created_at||new Date(c.created_at)>new Date(options.until+'T23:59:59.999+08:00')))return false;
 return true;
}
export function analyze(rows,options={}) {
 const valid=rows.filter(c=>eligible(c,options));const watch=words(options.watch);const keywordMap=new Map();
 for(const c of valid){ const ts=tokens(c.text);for(const w of watch)if(c.text.toLowerCase().includes(w.toLowerCase())&&!ts.includes(w.toLowerCase()))ts.push(w.toLowerCase());const freq=new Map();for(const t of ts)freq.set(t,(freq.get(t)||0)+1);for(const [word,n] of freq){if(!keywordMap.has(word))keywordMap.set(word,{word,occurrences:0,comments:0,posts:new Set(),ids:[]});const k=keywordMap.get(word);k.occurrences+=n;k.comments++;if(c.post_id)k.posts.add(c.platform+':'+c.post_id);k.ids.push(c.key);}}
 const keywords=[...keywordMap.values()].map(k=>({...k,posts:k.posts.size,share:valid.length?k.comments/valid.length:0})).sort((a,b)=>b.comments-a.comments||b.posts-a.posts||a.word.localeCompare(b.word)).slice(0,60);
 const topics=categories.map(cat=>{const matches=valid.filter(c=>classify(c.text).includes(cat.name));const local=new Map();for(const c of matches)for(const w of new Set(tokens(c.text)))local.set(w,(local.get(w)||0)+1);const top=[...local].sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);return {name:cat.name,count:matches.length,share:valid.length?matches.length/valid.length:0,keywords:top,ids:matches.map(x=>x.key),suggestion:matches.length?({求方法:`围绕「${top[0]||'常见问题'}」做一步一步的实操演示`,遇到困难:`整理「${top[0]||'常见困难'}」的原因与解决办法`,购买咨询:`说明「${top[0]||'产品'}」的费用、限制与适用人群`,对比选择:`用相同场景比较「${top[0]||'不同方案'}」`,场景需求:`展示「${top[0]||'真实场景'}」能做到什么及使用限制`})[cat.name]:''};});
 const byPlatform=[...platforms,'unknown'].map(p=>({platform:p,count:valid.filter(c=>c.platform===p).length}));
 return {total:rows.length,valid:valid.length,filtered:rows.length-valid.length,noise:rows.filter(c=>c.noise).length,unknownDates:rows.filter(c=>!c.created_at).length,posts:new Set(valid.filter(c=>c.post_id).map(c=>c.platform+':'+c.post_id)).size,keywords,topics,byPlatform,watch:watch.map(word=>({word,count:valid.filter(c=>c.text.toLowerCase().includes(word.toLowerCase())).length})),engine:'本地中文分词与规则分类',scope:'当前已获取样本；分类可重叠，选题为规则生成的建议。'};
}
