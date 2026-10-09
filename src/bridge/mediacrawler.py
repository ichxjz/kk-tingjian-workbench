# -*- coding: utf-8 -*-
"""Adapter for MediaCrawler; upstream code and license remain in the vendor directory."""
import asyncio
import importlib
import json
import logging
import os
from pathlib import Path
import signal
import sys
import types
import traceback
from workbench_browser import isolated_context
from workbench_limits import CommentLimit, bounded_listing, bounded_comments

OUT = sys.stdout

def emit(kind, **data):
    OUT.write(json.dumps({'event': kind, **data}, ensure_ascii=False) + '\n')
    OUT.flush()

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT / '.runtime/vendor/MediaCrawler'
sys.path.insert(0, str(REPO))
os.chdir(REPO)
# Upstream stdout may include account/session data. Only structured adapter events are retained.
sys.stdout = open(os.devnull, 'w')
sys.stderr = open(os.devnull, 'w')

PLATFORMS = {
 'douyin': ('dy', 'douyin', 'DouYinCrawler', 'DY_SPECIFIED_ID_LIST', 'DY_CREATOR_ID_LIST'),
 'xiaohongshu': ('xhs', 'xhs', 'XiaoHongShuCrawler', 'XHS_SPECIFIED_NOTE_URL_LIST', 'XHS_CREATOR_ID_LIST'),
 'kuaishou': ('ks', 'kuaishou', 'KuaishouCrawler', 'KS_SPECIFIED_ID_LIST', 'KS_CREATOR_ID_LIST'),
 'bilibili': ('bili', 'bilibili', 'BilibiliCrawler', 'BILI_SPECIFIED_ID_LIST', 'BILI_CREATOR_ID_LIST'),
 'weibo': ('wb', 'weibo', 'WeiboCrawler', 'WEIBO_SPECIFIED_ID_LIST', 'WEIBO_CREATOR_ID_LIST'),
 'tieba': ('tieba', 'tieba', 'TieBaCrawler', 'TIEBA_SPECIFIED_ID_LIST', 'TIEBA_CREATOR_URL_LIST'),
 'zhihu': ('zhihu', 'zhihu', 'ZhihuCrawler', 'ZHIHU_SPECIFIED_ID_LIST', 'ZHIHU_CREATOR_URL_LIST'),
}

def load():
    import config
    from main import CrawlerFactory
    return config, CrawlerFactory

async def run(spec):
    config, factory = load()
    from playwright.async_api import Page, TimeoutError as BrowserTimeout
    original_goto = Page.goto
    async def goto_visible(page, url, **kwargs):
        explicit = 'wait_until' in kwargs
        if not explicit:
            kwargs['wait_until'] = 'commit'
        response = await original_goto(page, url, **kwargs)
        if not explicit:
            try:
                await page.wait_for_load_state('domcontentloaded', timeout=8000)
            except BrowserTimeout:
                pass
        return response
    Page.goto = goto_visible
    platform = spec['platform']
    code, module, _, detail_key, creator_key = PLATFORMS[platform]
    max_posts, max_comments = spec['maxPosts'], spec['maxComments']
    if max_comments is None:
        max_comments = float('inf')
    config.PLATFORM = code
    config.CRAWLER_TYPE = {'links': 'detail', 'search': 'search', 'creator': 'creator'}[spec['mode']]
    config.KEYWORDS = spec.get('query', '')
    config.LOGIN_TYPE = 'qrcode'
    config.COOKIES = ''
    config.ENABLE_IP_PROXY = False
    config.ENABLE_CDP_MODE = False
    config.CDP_CONNECT_EXISTING = False
    config.HEADLESS = False
    config.SAVE_LOGIN_STATE = True
    config.SAVE_DATA_OPTION = 'workbench'
    config.MAX_CONCURRENCY_NUM = 1
    config.CRAWLER_MAX_NOTES_COUNT = max_posts
    config.CRAWLER_MAX_COMMENTS_COUNT_SINGLENOTES = max_comments
    config.ENABLE_GET_COMMENTS = True
    config.ENABLE_GET_SUB_COMMENTS = spec.get('includeReplies', True)
    config.ENABLE_GET_MEDIA = False
    config.ENABLE_GET_WORDCLOUD = False
    config.ENABLE_WEIBO_FULL_TEXT = False
    config.CREATOR_MODE = True  # Bilibili: creator videos, not follower/following profiles.
    config.CRAWLER_MAX_SLEEP_SEC = max(2, int(spec.get('interval', 3)))
    config.START_PAGE = 1
    setattr(config, detail_key, spec.get('links', []))
    setattr(config, creator_key, spec.get('creators', []))
    posts, counts, seen = {}, {}, set()
    warned = False
    class Logs(logging.Handler):
        def emit(self, record):
            nonlocal warned
            if record.levelno >= logging.ERROR:
                warned = True
                text = record.getMessage().lower()
                reason = '平台部分请求未成功，请检查作品是否可访问'
                if any(w in text for w in ['timeout','timed out','connect','network']):
                    reason = '平台连接超时，请检查网络后继续'
                elif any(w in text for w in ['login','登录','cookie']):
                    reason = '平台登录状态未通过，请在数据连接中重新登录'
                elif any(w in text for w in ['captcha','验证','blocked','risk','风控']):
                    reason = '平台要求验证或限制访问，请在采集浏览器中处理后继续'
                emit('warning', message=reason)
    from tools import utils
    utils.logger.handlers = [Logs()]
    utils.logger.propagate = False
    logging.getLogger().handlers = [logging.NullHandler()]
    def post_id(row):
        return str(row.get('note_id') or row.get('aweme_id') or row.get('video_id') or row.get('content_id') or '')
    class Sink:
        async def store_content(self, content_item):
            row = dict(content_item)
            ident = post_id(row)
            if not ident or (ident not in posts and len(posts) >= max_posts):
                return
            posts[ident] = row
            emit('post', data={k: row[k] for k in ['note_id','aweme_id','video_id','content_id','content_type','title','desc','note_url','video_url','content_url'] if k in row})
        async def store_comment(self, comment_item):
            row = dict(comment_item)
            ident = post_id(row)
            if not ident:
                return
            if ident not in posts:
                if len(posts) >= max_posts:
                    return
                posts[ident] = {}
            key = (ident, str(row.get('comment_id') or ''), str(row.get('content') or ''))
            if key in seen or counts.get(ident, 0) >= max_comments:
                return
            if not config.ENABLE_GET_SUB_COMMENTS and str(row.get('parent_comment_id') or '') not in ('','0'):
                return
            seen.add(key)
            counts[ident] = counts.get(ident, 0) + 1
            allowed = ['note_id','aweme_id','video_id','content_id','content_type','comment_id','parent_comment_id','content','create_time','publish_time','like_count','comment_like_count','nickname','user_nickname','note_url']
            emit('comment', data={k: row[k] for k in allowed if k in row})
            if counts[ident] >= max_comments:
                raise CommentLimit()
        async def store_creator(self, creator):
            pass
    sink = Sink()
    store_module = importlib.import_module('store.' + module)
    factories = [v for k,v in vars(store_module).items() if isinstance(v,type) and k.lower().endswith('storefactory')]
    if len(factories) != 1:
        raise RuntimeError('Unsupported upstream store contract')
    factories[0].create_store = staticmethod(lambda: sink)
    crawler = factory.create_crawler(code)
    def permitted(params):
        ident = str(params.get('note_id') or params.get('aweme_id') or params.get('video_id') or params.get('content_id') or '')
        return not ident or ident in posts or len(posts) < max_posts
    for name in dir(crawler):
        if name.startswith('create_') and name.endswith('_client'):
            original = getattr(crawler, name)
            async def create_client(*args, _original=original, **kwargs):
                client = await _original(*args, **kwargs)
                for method in dir(client):
                    fn = getattr(client, method)
                    if not callable(fn):
                        continue
                    if method.startswith('get_all_') and 'creator' in method:
                        setattr(client, method, bounded_listing(fn, lambda: max_posts-len(posts), config.CRAWLER_MAX_SLEEP_SEC))
                    if method in ('get_note_all_comments','get_aweme_all_comments','get_video_all_comments'):
                        setattr(client, method, bounded_comments(fn, permitted))
                return client
            setattr(crawler, name, create_client)
    if platform == 'bilibili':
        async def creator_videos(self, creator_id):
            page = 1
            while len(posts) < max_posts:
                response = await self.bili_client.get_creator_videos(creator_id, page, 30)
                videos = response.get('list', {}).get('vlist', [])
                ids = [v['bvid'] for v in videos if v.get('bvid')][:max_posts-len(posts)]
                if not ids:
                    break
                await self.get_specified_videos(ids)
                if page*30 >= int(response.get('page', {}).get('count', 0)):
                    break
                page += 1
                await asyncio.sleep(config.CRAWLER_MAX_SLEEP_SEC)
        crawler.get_creator_videos = types.MethodType(creator_videos, crawler)
    async def launch(self, chromium, playwright_proxy=None, user_agent=None, headless=False):
        options = dict(headless=False, viewport={'width':1280,'height':900}, locale='zh-CN')
        executable = os.environ.get('BROWSER_EXECUTABLE') or '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        if Path(executable).exists():
            options['executable_path'] = executable
        else:
            options['channel'] = 'chrome'
        if 'storageState' in spec:
            self.workbench_browser, context = await isolated_context(chromium, options, spec['storageState'])
        else:
            context = await chromium.launch_persistent_context(str(ROOT / '.runtime/profiles' / platform), **options)
        agent_page = context.pages[0] if context.pages else await context.new_page()
        self.user_agent = await agent_page.evaluate('navigator.userAgent')
        context.set_default_timeout(15000)
        context.set_default_navigation_timeout(30000)
        async def capture_state():
            await asyncio.sleep(15)
            folder = ROOT / 'output/verification' / ('task-' + ''.join(c for c in str(spec.get('taskId', 'standalone')) if c.isalnum() or c == '-'))
            folder.mkdir(parents=True, exist_ok=True)
            page = getattr(self, 'context_page', None)
            if page:
                try:
                    await page.screenshot(path=str(folder / ('mediacrawler-' + platform + '-state.png')), timeout=5000)
                    state = {'title': await page.title(), 'url': page.url.split('?')[0]}
                    page_text = await page.locator('body').inner_text(timeout=3000)
                    if '电脑设备登录超限' in page_text:
                        emit('attention', message='平台提示电脑设备登录超限，请在采集浏览器重新扫码登录')
                    elif '扫码登录' in page_text or '手机号登录' in page_text:
                        emit('attention', message='请在采集浏览器扫码登录，已采集的数据会自动保留')
                    (folder / 'mediacrawler-page.json').write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')
                except Exception:
                    pass
            stacks = []
            for task in asyncio.all_tasks():
                coro = task.get_coro()
                chain = []
                while coro is not None:
                    code = getattr(coro, 'cr_code', None)
                    if code:
                        chain.append(code.co_name)
                    coro = getattr(coro, 'cr_await', None)
                stacks.append(chain)
            (folder / 'mediacrawler-stacks.json').write_text(json.dumps(stacks), encoding='utf-8')
        asyncio.create_task(capture_state())
        emit('status', message='采集浏览器已打开，正在读取平台；如有登录或验证，请在浏览器中完成')
        return context
    crawler.launch_browser = types.MethodType(launch, crawler)
    if platform == 'douyin':
        from media_platform.douyin.login import DouYinLogin
        async def manual_slider(self, *args, **kwargs):
            if await self.context_page.locator('#captcha-verify-image').is_visible():
                emit('attention', message='抖音需要完成验证，请在采集浏览器中手动处理')
                await self.context_page.locator('#captcha-verify-image').wait_for(state='hidden', timeout=120000)
        DouYinLogin.check_page_display_slider = manual_slider
    from var import crawler_type_var, source_keyword_var
    crawler_type_var.set(config.CRAWLER_TYPE)
    source_keyword_var.set(spec.get('query', ''))
    main_task = asyncio.current_task()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, main_task.cancel)
    emit('status', message='MediaCrawler 正在启动，首次登录请在打开的浏览器中扫码')
    try:
        await asyncio.wait_for(crawler.start(), timeout=900)
        emit('done', posts=len(posts), comments=sum(counts.values()), partial=warned)
    except Exception as error:
        diagnostic = {'type': type(error).__name__, 'frames': [{'function': f.name, 'line': f.lineno, 'file': Path(f.filename).name} for f in traceback.extract_tb(error.__traceback__)[-10:]]}
        folder = ROOT / 'output/verification' / ('task-' + ''.join(c for c in str(spec.get('taskId', 'standalone')) if c.isalnum() or c == '-'))
        folder.mkdir(parents=True, exist_ok=True)
        page = getattr(crawler, 'context_page', None)
        if page:
            try:
                diagnostic['title'] = await page.title()
                diagnostic['url'] = page.url.split('?')[0]
                await page.screenshot(path=str(folder / ('mediacrawler-' + platform + '-state.png')))
            except Exception:
                pass
        (folder / 'mediacrawler-error.json').write_text(json.dumps(diagnostic, ensure_ascii=False), encoding='utf-8')
        raise
    finally:
        context = getattr(crawler, 'browser_context', None)
        if context:
            try:
                await context.close()
            except Exception:
                pass

try:
    if '--check' in sys.argv:
        config, factory = load()
        for platform, values in PLATFORMS.items():
            assert values[0] in factory.CRAWLERS
            store = importlib.import_module('store.' + values[1])
            assert any(k.lower().endswith('storefactory') for k in vars(store))
        emit('ready', platforms=list(PLATFORMS))
    else:
        asyncio.run(run(json.load(sys.stdin)))
except (KeyboardInterrupt, asyncio.CancelledError):
    emit('paused')
except BaseException as error:
    # Exception text can contain cookies or signed URLs. Return only a stable class name.
    emit('error', code=type(error).__name__, message='增强采集未完成，请检查平台登录、验证或网络后重试；已读取评论已保存')
    sys.exit(1)
