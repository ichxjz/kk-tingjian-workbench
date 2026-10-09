const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog=document.querySelector('#feishu-modal');
let busy=false;
dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
async function request(url,body){const res=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok)throw Error(data.error||'操作未完成，请重试');return data;}
const setupGuide=`<details class="feishu-guide" id="feishu-guide">
 <summary><strong>飞书设置教程</strong><span>第一次使用？按这 5 步完成连接</span></summary>
 <div class="feishu-guide-body">
 <p class="feishu-guide-intro">准备好飞书账号和一个可管理的多维表格。首次设置完成后，下次可直接导出。</p>
 <ol class="feishu-guide-steps">
 <li><h3>创建应用，获取两项凭据</h3><p>打开 <a class="inline-link" href="https://open.feishu.cn/app" target="_blank" rel="noopener noreferrer">飞书开放平台 ↗</a>，登录目标表格所在的企业，创建「企业自建应用」（已有应用也可使用）。在应用的「凭证与基础信息」中找到 <b>App ID</b> 和 <b>App Secret</b>，分别填入下方同名输入框。</p><p class="feishu-guide-hint">App ID 通常以 cli_ 开头。App Secret 是密钥，只填入本机的连接设置，不要放进表格或分享给他人。</p></li>
 <li><h3>开通多维表格权限，并发布应用</h3><p>进入应用的「权限管理」，在应用身份权限中搜索 <code>bitable:app</code>，开通「查看、评论、编辑和管理多维表格」。本工具需要读取数据表、创建数据表、读取记录和新增记录。</p><p>然后进入「版本管理与发布」，创建版本并发布；如需管理员审核，等待通过。以后修改权限，也需要重新发布才能生效。</p></li>
 <li><h3>让应用可以编辑目标表格</h3><p>打开要接收评论的飞书多维表格，在「…」菜单中找到「更多 → 添加文档应用」，搜索刚才的应用名称，授予「可编辑」权限并添加。</p><p class="feishu-guide-hint">需要表格所有者或有管理权限的人操作。应用权限和这张表格的授权都要完成。</p></li>
 <li><h3>复制多维表格链接</h3><p>用浏览器打开目标多维表格，复制地址栏中包含 <code>/base/</code> 的完整链接，粘贴到下方「目标多维表格链接」。不用手动填写表格 ID，也不用预建列。</p><p class="feishu-guide-hint">目前不支持 /wiki/ 知识库链接。如拿到的是知识库链接，请使用原始 /base/ 链接，或新建一个独立多维表格作为导出目标。</p></li>
 <li><h3>检查连接，再导出评论</h3><p>填写 App ID 和 App Secret 后，点击「保存并检查连接」。保存成功后点击底部的「导出」按钮；完成后可直接打开飞书查看新数据表。</p><p class="feishu-guide-hint">连接检查验证凭据和表格读取权限；创建、写入权限会在实际导出时验证。凭据仅保存在本机，已保存的密钥可以留空沿用。</p></li>
 </ol>
 <details class="feishu-guide-faq"><summary>遇到问题？查看处理方法</summary>
 <dl><dt>找不到应用 / 没有「添加文档应用」入口</dt><dd>确认应用已发布且审核通过，账号和表格属于目标企业；请表格所有者检查应用可用范围，并帮助添加文档应用。</dd>
 <dt>提示权限不足、403 或 91403</dt><dd>检查第 2 步的应用权限是否已发布，再按第 3 步给目标表格添加应用并授予可编辑权限。</dd>
 <dt>提示 99991672 / 缺少接口权限</dt><dd>回到「权限管理」补齐报错中列出的权限，重新发布应用后再试。</dd>
 <dt>App ID 或 App Secret 无效</dt><dd>从同一个应用的凭证页面重新复制两项内容，去除多余空格；如果重置过密钥，请填写新密钥并重新保存。</dd>
 <dt>连接成功，但导出失败</dt><dd>读取成功不代表可以写入。检查创建数据表、新增记录权限和表格编辑授权；若表格启用了高级权限，请所有者检查应用对目标资源的访问权限。修正后可重试，相同内容会跳过已写入记录。</dd></dl>
 </details>
 <p class="feishu-guide-sources">官方参考：<a class="inline-link" href="https://www.feishu.cn/content/137710114294" target="_blank" rel="noopener noreferrer">应用权限与发布</a> · <a class="inline-link" href="https://www.feishu.cn/hc/zh-CN/articles/360044508113" target="_blank" rel="noopener noreferrer">添加文档应用</a></p>
 </div></details>`;
export async function openFeishu({taskId,taskName,count,query}){
 const status=await request('/api/feishu');
 dialog.innerHTML=`<div class="modal-head"><div><small>EXPORT TO FEISHU</small><h2 id="feishu-title">导出到飞书多维表格</h2></div><button class="icon-button" id="feishu-close" aria-label="关闭飞书导出">×</button></div><form id="feishu-form"><div class="modal-content"><p><strong>${esc(taskName)}</strong></p><p class="help">将导出当前筛选下的 <b>${count}</b> 条评论（包含其他页）。在目标多维表格内自动新建数据表；相同内容重复导出会跳过已写入记录。</p>${setupGuide}<label class="field">目标多维表格链接<input name="baseUrl" type="url" required value="${esc(status.baseUrl)}" placeholder="https://你的空间.feishu.cn/base/…"></label><details ${status.configured?'':'open'}><summary>飞书连接设置${status.configured?' · 已配置':''}</summary><p class="help">首次连接需使用飞书自建应用。凭据仅保存在本机，密钥不会回传到页面。</p><label class="field">App ID<input name="appId" required value="${esc(status.appId)}" placeholder="cli_…" autocomplete="off"></label><label class="field">App Secret<input name="appSecret" type="password" autocomplete="new-password" placeholder="${status.hasSecret?'已保存；留空沿用原密钥':'在飞书开放平台的应用凭证页获取'}" ${status.hasSecret?'':'required'}></label><button type="button" class="button small" id="feishu-test">保存并检查连接</button></details><div id="feishu-message" role="status" aria-live="polite" class="form-error"></div><div id="feishu-result"></div></div><div class="modal-footer"><span class="help">评论将上传至你指定的飞书空间</span><button class="button primary" type="submit" id="feishu-submit" ${count?'':'disabled'}>导出 ${count} 条评论 →</button></div></form>`;
 dialog.showModal();
 const form=dialog.querySelector('form'),message=dialog.querySelector('#feishu-message');
 const setBusy=value=>{busy=value;for(const b of dialog.querySelectorAll('button'))b.disabled=value||(b.id==='feishu-submit'&&!count);};
 dialog.querySelector('#feishu-close').onclick=()=>dialog.close();
 let saved=status;
 async function save(force=false){const data=new FormData(form);const input={appId:data.get('appId'),appSecret:data.get('appSecret'),baseUrl:data.get('baseUrl')};if(force||!saved.configured||input.appId!==saved.appId||input.baseUrl!==saved.baseUrl||input.appSecret){saved=await request('/api/feishu',input);form.elements.appSecret.value='';form.elements.appSecret.required=false;form.elements.appSecret.placeholder='已保存；留空沿用原密钥';form.elements.baseUrl.value=saved.baseUrl;}}
 dialog.querySelector('#feishu-test').onclick=async()=>{if(!form.reportValidity())return;setBusy(true);message.textContent='正在检查应用凭据与目标表格…';try{await save(true);message.textContent='连接配置已保存，可以开始导出。';}catch(e){message.textContent=e.message;}finally{setBusy(false);}};
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;setBusy(true);dialog.querySelector('#feishu-result').innerHTML='';message.textContent='正在连接飞书并准备导出…';let timer;try{await save();timer=setInterval(async()=>{try{const s=await request('/api/feishu');if(busy&&s.progress)message.textContent=`正在写入飞书：${s.progress.done} / ${s.progress.total} 条，请保持页面打开…`;}catch{}},2000);const result=await request(`/api/tasks/${encodeURIComponent(taskId)}/feishu?${query}`,{});message.textContent='';dialog.querySelector('#feishu-result').innerHTML=`<div class="notice">导出完成：共 ${result.total} 条，新增 ${result.added} 条，已存在 ${result.skipped} 条。</div><a class="button primary" target="_blank" rel="noopener noreferrer" href="${esc(result.url)}">打开飞书多维表格 ↗</a>`;}catch(e){message.textContent=e.message;}finally{clearInterval(timer);setBusy(false);}};
}
