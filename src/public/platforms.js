export const PLATFORM_INFO=[
 {id:'douyin',code:'dy',name:'抖音',home:'https://www.douyin.com/'},
 {id:'xiaohongshu',code:'xhs',name:'小红书',home:'https://www.xiaohongshu.com/explore'},
 {id:'kuaishou',code:'ks',name:'快手',home:'https://www.kuaishou.com/'},
 {id:'bilibili',code:'bili',name:'B站',home:'https://www.bilibili.com/'},
 {id:'weibo',code:'wb',name:'微博',home:'https://weibo.com/'},
 {id:'tieba',code:'tieba',name:'贴吧',home:'https://tieba.baidu.com/'},
 {id:'zhihu',code:'zhihu',name:'知乎',home:'https://www.zhihu.com/'},
];
export const PLATFORM_NAMES=Object.fromEntries([...PLATFORM_INFO.map(p=>[p.id,p.name]),['unknown','未标注']]);
export function platformFromUrl(value){try{const h=new URL(value).hostname.toLowerCase(),is=d=>h===d||h.endsWith('.'+d);return is('douyin.com')?'douyin':is('xiaohongshu.com')||h==='xhslink.com'?'xiaohongshu':is('kuaishou.com')||h==='v.kuaishou.com'?'kuaishou':is('bilibili.com')||h==='b23.tv'?'bilibili':is('weibo.com')||is('weibo.cn')?'weibo':h==='tieba.baidu.com'?'tieba':is('zhihu.com')?'zhihu':null;}catch{return null;}}
