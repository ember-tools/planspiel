"""The OpenStreetMap tile proxy: tiles fetched on demand, kept only while they are being read.

The OpenStreetMap tile servers ask that clients identify themselves, keep tiles for at least seven
days, never bulk-download and send no more requests than needed. This proxy is that client: every
tile is fetched with the application's own User-Agent and Referer, so the browser never connects
to OpenStreetMap. A tile is fresh for as long as the server's `Cache-Control` or `Expires` says,
but never less than seven days. A stale tile is served at once while it is revalidated in the
background with `If-None-Match`. Requests for the same tile that arrive while it is being fetched
wait for that one fetch. Only zoom levels 10 to 18 inside a box around Germany are fetched;
everything else is refused without asking upstream. At most four tiles are fetched upstream at
once, and cache misses are limited per client and for everyone, so a request loop over the box
gets 429 instead of turning the server into a bulk downloader.

Tiles are not kept for good. Every tile is listed in an index with the time it was last read, and
`TileCache.evict` deletes the tiles nobody has read for the retention period and, beyond the size
limit, the ones read longest ago.
"""

import asyncio
import contextlib
import email.utils
import logging
import math
import re
import sqlite3
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

UPSTREAM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
MIN_ZOOM = 10
MAX_ZOOM = 18
GERMANY = (5.8, 47.2, 15.1, 55.1)
MIN_FRESHNESS = 7 * 24 * 3600
BROWSER_CACHE = "public, max-age=86400"
WAIT_AFTER_FAILURE = 300.0
HOME = "https://planspiel.emberbox.app"
MAX_CONCURRENT_FETCHES = 4
GLOBAL_MISS_BURST = 120
GLOBAL_MISSES_PER_SECOND = 0.5
CLIENT_MISS_BURST = 60
CLIENT_MISSES_PER_SECOND = 0.25
TOUCH_INTERVAL = 3600.0
EVICTION_BATCH = 500
logger = logging.getLogger(__name__)

router = APIRouter()


class TileNotAllowed(Exception):
    """A tile outside the zoom levels or the box this proxy serves."""


class TileUnavailable(Exception):
    """A tile neither the cache nor the tile server can provide."""


class TileRateLimited(Exception):
    """A tile that would have to be fetched while the miss budget is used up."""


class MissBudget:
    """Token buckets that limit how many tiles may be fetched upstream.

    Every cache miss takes a token from the bucket shared by everyone and one from the bucket of
    the requesting client. Buckets refill continuously up to their burst size. Maps panning around
    a few districts stay well inside the budget; a loop walking the whole box does not.
    """

    def __init__(self, clock: Callable[[], float] = time.time) -> None:
        """Start with full buckets."""
        self.clock = clock
        self._buckets: dict[str, tuple[float, float]] = {}

    def take(self, client: str) -> bool:
        """Take a token for `client` and for everyone, or neither when either bucket is empty."""
        now = self.clock()
        everyone = self._level("*", GLOBAL_MISS_BURST, GLOBAL_MISSES_PER_SECOND, now)
        own = self._level(f"client:{client}", CLIENT_MISS_BURST, CLIENT_MISSES_PER_SECOND, now)
        if everyone < 1 or own < 1:
            return False
        self._buckets["*"] = (everyone - 1, now)
        self._buckets[f"client:{client}"] = (own - 1, now)
        if len(self._buckets) > 10_000:
            self._buckets = {key: value for key, value in self._buckets.items() if now - value[1] < 3600}
        return True

    def _level(self, key: str, burst: float, rate: float, now: float) -> float:
        """Return how many tokens a bucket holds right now."""
        level, since = self._buckets.get(key, (burst, now))
        return min(burst, level + (now - since) * rate)


@dataclass
class Tile:
    """A tile's image and how it was fetched."""

    image: bytes
    etag: str | None
    fresh_until: float


@dataclass
class IndexEntry:
    """What the index knows about a stored tile."""

    etag: str | None
    fresh_until: float
    last_read: float


def column(longitude: float, z: int) -> int:
    """Return the tile column holding a longitude."""
    return int((longitude + 180) / 360 * 2**z)


def row(latitude: float, z: int) -> int:
    """Return the tile row holding a latitude."""
    radians = math.radians(latitude)
    return int((1 - math.asinh(math.tan(radians)) / math.pi) / 2 * 2**z)


def tile_range(z: int) -> tuple[int, int, int, int]:
    """Return the tile numbers (x from, x to, y from, y to) of the served box at a zoom level."""
    west, south, east, north = GERMANY
    return (*sorted((column(west, z), column(east, z))), *sorted((row(north, z), row(south, z))))


def allowed(z: int, x: int, y: int) -> bool:
    """Tell whether a tile lies within the zoom levels and the served box."""
    if not MIN_ZOOM <= z <= MAX_ZOOM:
        return False
    x_from, x_to, y_from, y_to = tile_range(z)
    return x_from <= x <= x_to and y_from <= y <= y_to


def fresh_until(headers: httpx.Headers, now: float) -> float:
    """Return until when a tile stays fresh: as the server says, but at least seven days."""
    valid = now
    match = re.search(r"max-age=(\d+)", headers.get("cache-control", ""))
    if match:
        valid = now + int(match.group(1))
    elif headers.get("expires"):
        with contextlib.suppress(TypeError, ValueError):
            valid = email.utils.parsedate_to_datetime(headers["expires"]).timestamp()
    return max(valid, now + MIN_FRESHNESS)


def replace(file: Path, content: bytes) -> None:
    """Write a file through a temporary file beside it, so it is never seen half written."""
    temporary = file.with_name(file.name + ".tmp")
    temporary.write_bytes(content)
    temporary.replace(file)


class TileIndex:
    """The SQLite list of stored tiles with their validators, size and last read time.

    A tile counts as stored only while it has a row here. The row is written before the image and
    removed after it, so a crash leaves at worst a row without an image, which reads as missing
    and is dropped. Images without a row, left by a lost index or a crash during a write, are
    removed by `TileCache.reconcile` at start.

    The eviction sweep runs in a worker thread while requests read on the event loop, so every
    statement holds one lock.
    """

    def __init__(self, file: Path) -> None:
        """Open or create the index."""
        file.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(file, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS tiles (z INTEGER, x INTEGER, y INTEGER, etag TEXT,"
            " fresh_until REAL NOT NULL, last_read REAL NOT NULL, size INTEGER NOT NULL,"
            " PRIMARY KEY (z, x, y))"
        )
        self._db.execute("CREATE INDEX IF NOT EXISTS tiles_last_read ON tiles (last_read)")

    def get(self, z: int, x: int, y: int) -> IndexEntry | None:
        """Return the entry of a tile, or None when it is not stored."""
        found = self._rows(
            "SELECT etag, fresh_until, last_read FROM tiles WHERE z = ? AND x = ? AND y = ?", (z, x, y)
        )
        return IndexEntry(*found[0]) if found else None

    def put(self, z: int, x: int, y: int, etag: str | None, fresh: float, now: float, size: int) -> None:
        """Record a tile as stored and read just now."""
        self._rows("INSERT OR REPLACE INTO tiles VALUES (?, ?, ?, ?, ?, ?, ?)", (z, x, y, etag, fresh, now, size))

    def touch(self, z: int, x: int, y: int, now: float) -> None:
        """Record that a tile was read."""
        self._rows("UPDATE tiles SET last_read = ? WHERE z = ? AND x = ? AND y = ?", (now, z, x, y))

    def remove(self, keys: list[tuple[int, int, int]]) -> None:
        """Forget tiles."""
        with self._lock:
            self._db.execute("BEGIN")
            try:
                self._db.executemany("DELETE FROM tiles WHERE z = ? AND x = ? AND y = ?", keys)
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
            self._db.execute("COMMIT")

    def contains(self, z: int, x: int, y: int) -> bool:
        """Tell whether a tile is stored."""
        return bool(self._rows("SELECT 1 FROM tiles WHERE z = ? AND x = ? AND y = ?", (z, x, y)))

    def unread_since(self, before: float, limit: int) -> list[tuple[int, int, int]]:
        """Return up to `limit` tiles last read before a point in time."""
        return self._rows("SELECT z, x, y FROM tiles WHERE last_read < ? LIMIT ?", (before, limit))

    def least_recently_read(self, limit: int) -> list[tuple[int, int, int, int]]:
        """Return up to `limit` tiles with their size, the one read longest ago first."""
        return self._rows("SELECT z, x, y, size FROM tiles ORDER BY last_read LIMIT ?", (limit,))

    def total_size(self) -> int:
        """Return the size of all stored tiles in bytes."""
        return self._rows("SELECT COALESCE(SUM(size), 0) FROM tiles")[0][0]

    def count(self) -> int:
        """Return how many tiles are stored."""
        return self._rows("SELECT COUNT(*) FROM tiles")[0][0]

    def close(self) -> None:
        """Close the database."""
        with self._lock:
            self._db.close()

    def _rows(self, statement: str, parameters: tuple = ()) -> list[tuple]:
        """Run one statement under the lock and return all its rows."""
        with self._lock:
            return self._db.execute(statement, parameters).fetchall()


class TileCache:
    """Tiles on disk, fetched from OpenStreetMap when missing, revalidated when stale, and
    evicted when unread.

    A tile the tile server could not provide is not asked for again for `WAIT_AFTER_FAILURE`
    seconds: a stale copy is kept that long before the next revalidation, and a missing tile is
    refused that long without asking. A read is recorded in the index at most once per
    `TOUCH_INTERVAL`, which is precise enough for a retention measured in days.
    """

    def __init__(
        self,
        directory: Path,
        client: httpx.AsyncClient,
        retention: float,
        max_bytes: int,
        clock: Callable[[], float] = time.time,
    ) -> None:
        """Keep tiles below a folder for `retention` seconds after their last read, at most
        `max_bytes` in all, fetching them with the given client."""
        self.directory = directory
        self.client = client
        self.retention = retention
        self.max_bytes = max_bytes
        self.clock = clock
        self.index = TileIndex(directory / "index.sqlite")
        self._running: dict[tuple[int, int, int], asyncio.Task[Tile]] = {}
        self._background: set[asyncio.Task[None]] = set()
        self._failed_until: dict[tuple[int, int, int], float] = {}
        self._budget = MissBudget(clock)
        self._fetching = asyncio.Semaphore(MAX_CONCURRENT_FETCHES)
        self._closing = False
        self._sweeping = threading.Lock()

    async def get(self, z: int, x: int, y: int, client: str = "") -> bytes:
        """Return a tile's image from the cache, fetching or revalidating it as needed.

        A miss is refused with `TileRateLimited` once the miss budget of `client` or of everyone
        is used up; a tile already being fetched is waited for without taking from the budget.
        """
        if not allowed(z, x, y):
            raise TileNotAllowed
        cached = self._read(z, x, y)
        if cached is None:
            if self._failed_until.get((z, x, y), 0) > self.clock():
                raise TileUnavailable
            if (z, x, y) not in self._running and not self._budget.take(client):
                raise TileRateLimited
            return (await asyncio.shield(self._fetch_once(z, x, y, None))).image
        if cached.fresh_until < self.clock():
            task = asyncio.ensure_future(self._revalidate(z, x, y, cached))
            self._background.add(task)
            task.add_done_callback(self._background.discard)
        return cached.image

    def evict(self) -> int:
        """Delete the tiles unread for longer than the retention, then the ones read longest ago
        until the rest fits the size limit. Return how many were deleted."""
        with self._sweeping:
            deleted = 0
            cutoff = self.clock() - self.retention
            while not self._closing and (batch := self.index.unread_since(cutoff, EVICTION_BATCH)):
                self._delete(batch)
                deleted += len(batch)
            excess = 0 if self._closing else self.index.total_size() - self.max_bytes
            while excess > 0 and not self._closing:
                chosen = []
                for z, x, y, size in self.index.least_recently_read(EVICTION_BATCH):
                    if excess <= 0:
                        break
                    chosen.append((z, x, y))
                    excess -= size
                if not chosen:
                    break
                self._delete(chosen)
                deleted += len(chosen)
            return deleted

    def reconcile(self) -> int:
        """Delete images without an index row and leftover temporary files. Return how many.

        Meant for start-up, before tiles are served: a temporary file is only ever half written
        while a fetch is running."""
        with self._sweeping:
            deleted = 0
            for file in self.directory.glob("*/*/*"):
                if self._closing:
                    break
                if file.name.endswith(".tmp") or (file.suffix == ".png" and not self._indexed(file)):
                    file.unlink(missing_ok=True)
                    deleted += 1
            return deleted

    async def close(self) -> None:
        """Stop every running fetch, before the client they use is closed, then wait for a
        running sweep to finish its batch and close the index."""
        self._closing = True
        tasks = [*self._running.values(), *self._background]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await asyncio.to_thread(self._close_index)

    def _close_index(self) -> None:
        """Close the index once no sweep holds it."""
        with self._sweeping:
            self.index.close()

    async def _revalidate(self, z: int, x: int, y: int, old: Tile) -> None:
        """Revalidate a stale tile in the background, logging rather than raising what fails."""
        try:
            await self._fetch_once(z, x, y, old)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Tile %s/%s/%s not revalidated", z, x, y)

    def _fetch_once(self, z: int, x: int, y: int, old: Tile | None) -> asyncio.Task[Tile]:
        """Return the fetch of a tile, starting it unless one is already running."""
        key = (z, x, y)
        running = self._running.get(key)
        if running is not None:
            return running
        task = asyncio.ensure_future(self._fetch(z, x, y, old))
        self._running[key] = task
        task.add_done_callback(lambda _: self._running.pop(key, None))
        return task

    async def _fetch(self, z: int, x: int, y: int, old: Tile | None) -> Tile:
        """Fetch a tile upstream, or confirm the stale copy, and store the result."""
        headers = {"If-None-Match": old.etag} if old and old.etag else {}
        try:
            async with self._fetching:
                response = await self.client.get(UPSTREAM.format(z=z, x=x, y=y), headers=headers)
        except httpx.HTTPError:
            return self._failed(z, x, y, old)
        now = self.clock()
        if response.status_code == 304 and old is not None:
            tile = Tile(old.image, old.etag, fresh_until(response.headers, now))
        elif response.status_code == 200:
            tile = Tile(response.content, response.headers.get("etag"), fresh_until(response.headers, now))
        else:
            return self._failed(z, x, y, old)
        self._failed_until.pop((z, x, y), None)
        self._write(z, x, y, tile)
        return tile

    def _failed(self, z: int, x: int, y: int, old: Tile | None) -> Tile:
        """Keep a stale copy for a while after a failed fetch, or refuse a missing tile for one."""
        until = self.clock() + WAIT_AFTER_FAILURE
        if old is None:
            now = self.clock()
            self._failed_until = {key: value for key, value in self._failed_until.items() if value > now}
            self._failed_until[(z, x, y)] = until
            raise TileUnavailable
        tile = Tile(old.image, old.etag, until)
        self._write(z, x, y, tile)
        return tile

    def _indexed(self, image: Path) -> bool:
        """Tell whether an image file below the cache folder belongs to a stored tile."""
        try:
            z, x, y = int(image.parent.parent.name), int(image.parent.name), int(image.stem)
        except ValueError:
            return False
        return self.index.contains(z, x, y)

    def _path(self, z: int, x: int, y: int) -> Path:
        """Return where a tile's image is kept."""
        return self.directory / str(z) / str(x) / f"{y}.png"

    def _read(self, z: int, x: int, y: int) -> Tile | None:
        """Read a tile and record the read; a tile missing from index or disk counts as not there."""
        entry = self.index.get(z, x, y)
        if entry is None:
            return None
        try:
            image = self._path(z, x, y).read_bytes()
        except OSError:
            self.index.remove([(z, x, y)])
            return None
        now = self.clock()
        if now - entry.last_read >= TOUCH_INTERVAL:
            self.index.touch(z, x, y, now)
        return Tile(image, entry.etag, entry.fresh_until)

    def _write(self, z: int, x: int, y: int, tile: Tile) -> None:
        """Record a tile in the index, then write its image through a temporary file."""
        image = self._path(z, x, y)
        image.parent.mkdir(parents=True, exist_ok=True)
        self.index.put(z, x, y, tile.etag, tile.fresh_until, self.clock(), len(tile.image))
        replace(image, tile.image)

    def _delete(self, keys: list[tuple[int, int, int]]) -> None:
        """Delete tiles' images, then forget them in the index."""
        for z, x, y in keys:
            self._path(z, x, y).unlink(missing_ok=True)
        self.index.remove(keys)


def tile_client() -> httpx.AsyncClient:
    """Return the client tiles are fetched with, named as the tile usage policy asks."""
    return httpx.AsyncClient(
        timeout=10.0,
        headers={"User-Agent": f"planspiel (+{HOME})", "Referer": f"{HOME}/"},
    )


@router.get("/tiles/{z}/{x}/{y}.png")
async def tile(z: int, x: int, y: int, request: Request) -> Response:
    """Return a map tile from the cache, fetching it from OpenStreetMap when needed."""
    cache: TileCache = request.app.state.tile_cache
    try:
        image = await cache.get(z, x, y, request.client.host if request.client else "")
    except TileNotAllowed as error:
        raise HTTPException(status_code=404, detail="Diese Kachel gibt es hier nicht.") from error
    except TileUnavailable as error:
        raise HTTPException(status_code=502, detail="Die Kachel ist gerade nicht ladbar.") from error
    except TileRateLimited as error:
        raise HTTPException(
            status_code=429, detail="Zu viele neue Kacheln auf einmal.", headers={"Retry-After": "10"}
        ) from error
    return Response(content=image, media_type="image/png", headers={"Cache-Control": BROWSER_CACHE})
