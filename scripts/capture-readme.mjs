import assert from 'node:assert/strict';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright-core';
import {createApp} from '../src/server.mjs';
// Isolated demo database and empty Feishu config: never read personal task data.
const temp=await mkdtemp(path.join(os.tmpdir(),'tingjian-docs-'));
const app=await createApp({dbPath:':memory:',feishuConfigPath:path.join(temp,'feishu.json')});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+app.server.address().port;
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 await mkdir('docs/screenshots',{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100},colorScheme:'dark',reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const snap=async name=>{await page.mouse.move(0,0);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`docs/screenshots/${name}.jpg`,type:'jpeg',quality:88,animations:'disabled'});};
 const demo=await(await fetch(base+'/api/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
 await page.goto(base+'/?task='+demo.task.id);
 await page.locator('.bar-row').first().waitFor();await page.waitForTimeout(500);
 await snap('insights-dark');
 await page.emulateMedia({colorScheme:'light'});await snap('insights-light');
 await page.emulateMedia({colorScheme:'dark'});
 await page.locator('#export-type').selectOption('feishu');await page.getByRole('button',{name:'↓ 导出',exact:true}).click();
 await page.locator('#feishu-modal[open]').waitFor();
 assert.equal(await page.locator('[name=appSecret]').inputValue(),'');
 await snap('feishu-export');await page.locator('#feishu-close').click();
 await page.locator('[data-nav=connections]').first().click();await page.locator('.connection-card').first().waitFor();await snap('connections');
 await page.locator('nav [data-nav=videos]').click();await page.locator('#video-form').waitFor();await snap('video-subtitles');
 assert.deepEqual(errors,[]);console.log('Captured 5 screenshots using isolated demo data; no page errors.');
} finally {await browser.close();await app.close();await rm(temp,{recursive:true,force:true});}
