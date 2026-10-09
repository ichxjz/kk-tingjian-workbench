"""Create an isolated browser for a worker, using a local login snapshot."""
async def isolated_context(chromium, options, storage_state):
    browser_options = {k: v for k, v in options.items() if k not in ('viewport', 'locale')}
    browser = await chromium.launch(**browser_options)
    try:
        context = await browser.new_context(viewport=options['viewport'], locale=options['locale'], storage_state=storage_state)
        return browser, context
    except BaseException:
        await browser.close()
        raise
