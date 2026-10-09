import inspect

class CommentLimit(Exception):
    pass

class ListingLimit(Exception):
    pass

def bounded_listing(fn, available, interval):
    async def wrapped(*args, **kwargs):
        budget = available()
        if budget <= 0:
            return []
        params = inspect.signature(fn).bind(*args, **kwargs)
        params.apply_defaults()
        callback = params.arguments.get('callback')
        if 'crawl_interval' in params.arguments:
            params.arguments['crawl_interval'] = max(interval, params.arguments['crawl_interval'] or 0)
        found = []
        async def receive(*values, **named):
            items = next((v for v in values if isinstance(v, list)), None)
            if items is None:
                if callback:
                    await callback(*values, **named)
                return
            selected = items[:max(0, budget-len(found))]
            found.extend(selected)
            if callback and selected:
                await callback(*(selected if v is items else v for v in values), **named)
            if len(found) >= budget:
                raise ListingLimit()
        if 'callback' not in params.arguments:
            raise RuntimeError('Creator listing requires a bounded callback')
        params.arguments['callback'] = receive
        try:
            result = await fn(*params.args, **params.kwargs)
            return result[:budget]
        except ListingLimit:
            return found
    return wrapped

def bounded_comments(fn, permitted):
    async def wrapped(*args, **kwargs):
        params = inspect.signature(fn).bind(*args, **kwargs)
        if not permitted(params.arguments):
            return []
        try:
            return await fn(*args, **kwargs)
        except CommentLimit:
            return []
    return wrapped
