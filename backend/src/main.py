import asyncio
import contextlib
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import FileResponse

from data.boards import BoardStore
from services.boards import BoardHub, CreationLimit
from services.tiles import TileCache, tile_client
from services.tiles import router as tile_router
from web.app import router
from web.logformat import configure_logging
from web.settings import settings

configure_logging()
logger = logging.getLogger(__name__)


async def _evict_tiles(cache: TileCache) -> None:
    """Evicts unread tiles once per sweep interval; a failed pass is logged and retried next time."""
    while True:
        try:
            deleted = await asyncio.to_thread(cache.evict)
            if deleted:
                logger.info("Evicted %s map tiles", deleted)
        except Exception:
            logger.exception("Evicting map tiles failed")
        await asyncio.sleep(settings.tile_sweep_seconds)


@contextlib.asynccontextmanager
async def lifespan(application: FastAPI):
    client = tile_client()
    cache = TileCache(settings.tile_dir, client, settings.tile_retention_days * 86400.0, settings.tile_max_bytes)
    application.state.tile_cache = cache
    boards = BoardStore(settings.board_file)
    application.state.board_hub = BoardHub(boards, settings.board_max_bytes)
    application.state.creation_limit = CreationLimit(settings.board_creations_per_hour)
    orphans = await asyncio.to_thread(cache.reconcile)
    if orphans:
        logger.info("Removed %s map tile files without an index entry", orphans)
    sweeper = asyncio.create_task(_evict_tiles(cache))
    yield
    sweeper.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await sweeper
    await application.state.board_hub.close_all()
    await cache.close()
    await client.aclose()
    boards.close()


app = FastAPI(title="Planspielplatte", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials="*" not in settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(tile_router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "boards": app.state.board_hub.store.count()}


_static = Path(__file__).resolve().parent.parent / "static"


def static_response(path: str) -> FileResponse:
    """
    Resolves a request outside the API to a file of the built frontend: a prerendered public page
    under `pages/` (the landing page for the empty path), else a built file inside the root, else
    the empty shell of the single page app with `noindex`, since its content is a shared board and
    only the prerendered pages are meant for search engines. `build.json` is never cached, so open
    pages notice a new build.
    """
    root = _static.resolve()
    if "\x00" in path:
        return _shell(root)
    pages = root / "pages"
    stripped = path.strip("/")
    page = (pages / stripped / "index.html").resolve()
    is_landing = page == pages / "index.html"
    if page.is_relative_to(pages) and page.is_file() and (not is_landing or stripped == ""):
        return FileResponse(page)
    candidate = (root / stripped).resolve()
    if candidate.is_relative_to(root) and candidate != root and candidate.is_file():
        relative = candidate.relative_to(root)
        if relative != Path("index.html") and relative.parts[0] != "pages":
            headers = {"Cache-Control": "no-store"} if relative == Path("build.json") else None
            return FileResponse(candidate, headers=headers)
    return _shell(root)


def _shell(root: Path) -> FileResponse:
    """The empty shell of the single page app, never indexed."""
    return FileResponse(root / "index.html", headers={"X-Robots-Tag": "noindex, nofollow"})


async def spa(path: str) -> FileResponse:
    """Everything outside the API and the tiles, see `static_response`; unknown paths below either
    are 404 rather than the shell."""
    if path.split("/", 1)[0] in ("api", "tiles"):
        raise HTTPException(status_code=404)
    return static_response(path)


if _static.is_dir():
    app.mount("/assets", StaticFiles(directory=_static / "assets"), name="assets")
    app.get("/{path:path}")(spa)
