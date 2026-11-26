from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import FileResponse

from web.app import router
from web.logformat import configure_logging
from web.settings import settings

configure_logging()

app = FastAPI(title="Planspielplatte")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials="*" not in settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


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
    """Everything that is not an API route, see `static_response`; unknown API paths are 404."""
    if path == "api" or path.startswith("api/"):
        raise HTTPException(status_code=404)
    return static_response(path)


if _static.is_dir():
    app.mount("/assets", StaticFiles(directory=_static / "assets"), name="assets")
    app.get("/{path:path}")(spa)
