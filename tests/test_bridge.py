import asyncio
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src/bridge'))
from workbench_limits import bounded_listing, bounded_comments, CommentLimit
class Limits(unittest.IsolatedAsyncioTestCase):
    async def test_creator_stops_after_page_budget_and_returns_items(self):
        calls, saved = [], []
        async def listing(callback=None, crawl_interval=0):
            for page in range(10):
                calls.append(page)
                await callback([page*3+i for i in range(3)])
            return []
        async def save(items):
            saved.extend(items)
        result = await bounded_listing(listing, lambda: 4, 3)(callback=save)
        self.assertEqual(result, [0,1,2,3])
        self.assertEqual(saved, result)
        self.assertEqual(calls, [0,1])
    async def test_comment_limit_exits_without_continuing_network_loop(self):
        calls=[]
        async def comments(note_id):
            calls.append(note_id)
            raise CommentLimit()
        fn=bounded_comments(comments, lambda p:p['note_id']=='allowed')
        self.assertEqual(await fn('blocked'), [])
        self.assertEqual(await fn('allowed'), [])
        self.assertEqual(calls,['allowed'])
if __name__=='__main__':
    unittest.main()
