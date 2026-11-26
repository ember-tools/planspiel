import asyncio
import tempfile
import unittest
from pathlib import Path

import httpx

from fastapi import FastAPI
from fastapi.testclient import TestClient

from services import tiles
from services.tiles import (
    CLIENT_MISS_BURST,
    GLOBAL_MISS_BURST,
    MIN_FRESHNESS,
    TOUCH_INTERVAL,
    WAIT_AFTER_FAILURE,
    MissBudget,
    TileCache,
    TileNotAllowed,
    TileRateLimited,
    TileUnavailable,
    allowed,
    column,
    fresh_until,
    row,
)

CENTRE = (14, column(13.4, 14), row(52.52, 14))
MUNICH = (14, column(11.58, 14), row(48.14, 14))
RETENTION = 30 * 24 * 3600.0
MAX_BYTES = 1_000_000


class Clock:
    """A clock the test moves by hand."""

    def __init__(self) -> None:
        self.now = 1_000_000.0

    def __call__(self) -> float:
        return self.now


class Upstream:
    """A stand-in for the tile server that counts what it is asked and answers as told."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.status = 200
        self.headers = {"etag": '"v1"', "cache-control": "max-age=60"}
        self.content = b"PNG1"

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self.status, headers=self.headers, content=self.content)


class TileTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.upstream = Upstream()
        self.clock = Clock()
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(self.upstream))
        self.cache = TileCache(Path(self.folder.name), self.client, RETENTION, MAX_BYTES, self.clock)

    async def asyncTearDown(self):
        await self.cache.close()
        await self.client.aclose()
        self.folder.cleanup()

    async def test_fetches_once_and_serves_from_disk(self):
        first = await self.cache.get(*CENTRE)
        second = await self.cache.get(*CENTRE)
        self.assertEqual(b"PNG1", first)
        self.assertEqual(b"PNG1", second)
        self.assertEqual(1, len(self.upstream.requests))

    async def test_concurrent_requests_share_one_fetch(self):
        results = await asyncio.gather(*(self.cache.get(*CENTRE) for _ in range(5)))
        self.assertEqual([b"PNG1"] * 5, results)
        self.assertEqual(1, len(self.upstream.requests))

    async def test_stale_tile_is_served_and_revalidated_with_etag(self):
        await self.cache.get(*CENTRE)
        self.clock.now += MIN_FRESHNESS + 1
        self.upstream.status = 304
        self.assertEqual(b"PNG1", await self.cache.get(*CENTRE))
        await asyncio.gather(*self.cache._background)
        self.assertEqual('"v1"', self.upstream.requests[-1].headers["if-none-match"])

    async def test_outside_the_box_is_refused_without_asking(self):
        with self.assertRaises(TileNotAllowed):
            await self.cache.get(14, 0, 0)
        with self.assertRaises(TileNotAllowed):
            await self.cache.get(5, 17, 10)
        self.assertEqual([], self.upstream.requests)

    async def test_failed_tile_is_not_asked_again_for_a_while(self):
        self.upstream.status = 500
        with self.assertRaises(TileUnavailable):
            await self.cache.get(*CENTRE)
        with self.assertRaises(TileUnavailable):
            await self.cache.get(*CENTRE)
        self.assertEqual(1, len(self.upstream.requests))
        self.clock.now += WAIT_AFTER_FAILURE + 1
        self.upstream.status = 200
        self.assertEqual(b"PNG1", await self.cache.get(*CENTRE))

    async def test_failed_revalidation_keeps_the_stale_copy_and_backs_off(self):
        await self.cache.get(*CENTRE)
        self.clock.now += MIN_FRESHNESS + 1
        self.upstream.status = 500
        self.assertEqual(b"PNG1", await self.cache.get(*CENTRE))
        await asyncio.gather(*self.cache._background)
        asked = len(self.upstream.requests)
        self.assertEqual(b"PNG1", await self.cache.get(*CENTRE))
        await asyncio.gather(*self.cache._background)
        self.assertEqual(asked, len(self.upstream.requests))

    async def test_zooming_through_several_levels_fits_the_budget(self):
        z, x, y = CENTRE
        for level in range(5):
            for column in range(7):
                for line in range(5):
                    await self.cache.get(z + level - 2, (x >> 2 << level) + column, (y >> 2 << level) + line, "1.2.3.4")

    async def test_misses_beyond_the_client_budget_are_refused_without_asking(self):
        z, x, y = CENTRE
        for offset in range(CLIENT_MISS_BURST):
            await self.cache.get(z, x + offset % 20, y + offset // 20, "1.2.3.4")
        asked = len(self.upstream.requests)
        with self.assertRaises(TileRateLimited):
            await self.cache.get(z, x, y + 25, "1.2.3.4")
        self.assertEqual(asked, len(self.upstream.requests))
        self.assertEqual(b"PNG1", await self.cache.get(z, x, y + 25, "5.6.7.8"))
        self.assertEqual(b"PNG1", await self.cache.get(z, x, y, "1.2.3.4"))


    async def test_tiles_across_germany_are_served(self):
        self.assertEqual(b"PNG1", await self.cache.get(*MUNICH))

    async def test_unread_tile_is_evicted_after_the_retention(self):
        await self.cache.get(*CENTRE)
        self.clock.now += RETENTION - 1
        self.assertEqual(0, self.cache.evict())
        self.clock.now += 2
        self.assertEqual(1, self.cache.evict())
        self.assertEqual(0, self.cache.index.count())
        self.assertEqual([], list(Path(self.folder.name).rglob("*.png")))

    async def test_reading_postpones_eviction(self):
        await self.cache.get(*CENTRE)
        self.clock.now += RETENTION - TOUCH_INTERVAL
        await self.cache.get(*CENTRE)
        self.clock.now += TOUCH_INTERVAL + 1
        self.assertEqual(0, self.cache.evict())
        self.assertEqual(1, self.cache.index.count())

    async def test_evicted_tile_is_fetched_again_on_demand(self):
        await self.cache.get(*CENTRE)
        self.clock.now += RETENTION + 1
        self.cache.evict()
        self.assertEqual(b"PNG1", await self.cache.get(*CENTRE))
        self.assertEqual(2, len(self.upstream.requests))

    async def test_size_limit_evicts_the_least_recently_read_first(self):
        self.upstream.content = b"x" * 400_000
        z, x, y = CENTRE
        for offset in range(3):
            await self.cache.get(z, x + offset, y)
            self.clock.now += TOUCH_INTERVAL
        await self.cache.get(z, x, y)
        self.assertEqual(1, self.cache.evict())
        self.assertIsNone(self.cache.index.get(z, x + 1, y))
        self.assertFalse(self.cache._path(z, x + 1, y).exists())
        self.assertTrue(self.cache._path(z, x, y).exists())
        self.assertIsNotNone(self.cache.index.get(z, x, y))
        self.assertIsNotNone(self.cache.index.get(z, x + 2, y))

    async def test_read_within_the_touch_interval_does_not_write(self):
        await self.cache.get(*CENTRE)
        written = self.cache.index.get(*CENTRE).last_read
        self.clock.now += TOUCH_INTERVAL - 1
        await self.cache.get(*CENTRE)
        self.assertEqual(written, self.cache.index.get(*CENTRE).last_read)
        self.clock.now += 1
        await self.cache.get(*CENTRE)
        self.assertEqual(self.clock.now, self.cache.index.get(*CENTRE).last_read)

    async def test_reconcile_removes_images_without_a_row_and_temporary_files(self):
        await self.cache.get(*CENTRE)
        z, x, y = CENTRE
        orphan = self.cache._path(z, x, y + 1)
        orphan.write_bytes(b"PNG")
        leftover = self.cache._path(z, x, y).with_name("9.png.tmp")
        leftover.write_bytes(b"PN")
        self.assertEqual(2, self.cache.reconcile())
        self.assertFalse(orphan.exists())
        self.assertFalse(leftover.exists())
        self.assertTrue(self.cache._path(z, x, y).exists())

    async def test_eviction_stops_once_closing(self):
        await self.cache.get(*CENTRE)
        self.clock.now += RETENTION + 1
        self.cache._closing = True
        self.assertEqual(0, self.cache.evict())
        self.cache._closing = False

    async def test_index_entry_without_image_reads_as_missing(self):
        await self.cache.get(*CENTRE)
        for image in Path(self.folder.name).rglob("*.png"):
            image.unlink()
        self.assertEqual(b"PNG1", await self.cache.get(*CENTRE))
        self.assertEqual(2, len(self.upstream.requests))


class BudgetTest(unittest.TestCase):
    def test_everyone_shares_one_budget(self):
        clock = Clock()
        budget = MissBudget(clock)
        taken = sum(budget.take(f"client-{n}") for n in range(GLOBAL_MISS_BURST + 10))
        self.assertEqual(GLOBAL_MISS_BURST, taken)

    def test_budget_refills_over_time(self):
        clock = Clock()
        budget = MissBudget(clock)
        while budget.take("one"):
            pass
        clock.now += 60
        self.assertTrue(budget.take("one"))


class RouteTest(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.upstream = Upstream()
        app = FastAPI()
        app.include_router(tiles.router)
        self.cache = app.state.tile_cache = TileCache(
            Path(self.folder.name), httpx.AsyncClient(transport=httpx.MockTransport(self.upstream)), RETENTION, MAX_BYTES,
            Clock(),
        )
        self.client = TestClient(app)

    def tearDown(self):
        self.cache.index.close()
        asyncio.run(self.cache.client.aclose())
        self.folder.cleanup()

    def test_tile_is_served_with_browser_cache(self):
        response = self.client.get("/tiles/%s/%s/%s.png" % CENTRE)
        self.assertEqual(200, response.status_code)
        self.assertEqual("image/png", response.headers["content-type"])
        self.assertEqual(tiles.BROWSER_CACHE, response.headers["cache-control"])

    def test_outside_the_box_is_404(self):
        self.assertEqual(404, self.client.get("/tiles/14/0/0.png").status_code)

    def test_unavailable_tile_is_502(self):
        self.upstream.status = 500
        self.assertEqual(502, self.client.get("/tiles/%s/%s/%s.png" % CENTRE).status_code)

    def test_exhausted_budget_is_429(self):
        z, x, y = CENTRE
        codes = [self.client.get(f"/tiles/{z}/{x + n % 20}/{y + n // 20}.png").status_code
                 for n in range(CLIENT_MISS_BURST + 1)]
        self.assertEqual(429, codes[-1])
        response = self.client.get(f"/tiles/{z}/{x}/{y + 25}.png")
        self.assertEqual("10", response.headers["retry-after"])


class FreshnessTest(unittest.TestCase):
    def test_at_least_seven_days(self):
        self.assertEqual(100 + MIN_FRESHNESS, fresh_until(httpx.Headers({"cache-control": "max-age=60"}), 100))

    def test_longer_max_age_wins(self):
        long = MIN_FRESHNESS * 2
        self.assertEqual(100 + long, fresh_until(httpx.Headers({"cache-control": f"max-age={long}"}), 100))

    def test_box(self):
        self.assertTrue(allowed(*CENTRE))
        self.assertFalse(allowed(19, *CENTRE[1:]))
        self.assertTrue(allowed(*MUNICH))
        self.assertFalse(allowed(14, column(2.35, 14), row(48.86, 14)))


if __name__ == "__main__":
    unittest.main()
