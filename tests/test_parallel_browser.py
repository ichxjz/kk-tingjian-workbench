import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src/bridge'))
from workbench_browser import isolated_context
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        options = dict(headless=True, executable_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', viewport={'width':800,'height':600}, locale='zh-CN')
        state = {'cookies':[{'name':'fixture_login','value':'test-only','domain':'example.com','path':'/','expires':-1,'httpOnly':True,'secure':True,'sameSite':'Lax'}], 'origins':[]}
        workers = await asyncio.gather(isolated_context(p.chromium, options, state), isolated_context(p.chromium, options, state))
        try:
            for browser, context in workers:
                assert (await context.cookies())[0]['value'] == 'test-only'
                await context.new_page()
            await workers[0][1].clear_cookies()
            assert len(await workers[1][1].cookies()) == 1
            await workers[0][0].close()
            assert await workers[1][1].pages[0].evaluate('1+1') == 2
            print('PASS Python concurrent browser sessions preserve login snapshot and independent cleanup')
        finally:
            for browser, _ in workers:
                await browser.close()
asyncio.run(main())
