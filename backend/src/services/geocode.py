"""Address search for the map, through Photon by Komoot.

Browsers never ask Photon themselves: they ask this server, which asks Photon, so Photon sees the
server's address and not the user's. The search text travels in the body of a POST, so no proxy in
front of the server writes it into an access log, and the server keeps no record of it; identical
searches are answered from a short-lived cache held in memory, and identical searches running at
the same time share one request. A token budget keeps the load on Photon's free service fair, and
only places inside the box around Germany are asked for.
"""

import asyncio
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from services.budget import TokenBudget
from services.tiles import GERMANY, HOME

PHOTON = "https://photon.komoot.io/api"
MIN_QUERY = 3
MAX_QUERY = 120
MAX_RESULTS = 8
CACHE_SECONDS = 600
CACHE_ENTRIES = 500
SEARCHES_EVERYONE = (60.0, 1.0)
SEARCHES_PER_CLIENT = (20.0, 0.5)

router = APIRouter()
logger = logging.getLogger(__name__)


class SearchUnavailable(Exception):
    """Photon could not be asked or gave no usable answer."""


class SearchRateLimited(Exception):
    """The search budget of the client or of everyone is used up."""


@dataclass(frozen=True)
class Place:
    """A found place: what to show and where it is."""

    label: str
    latitude: float
    longitude: float


def label(properties: dict) -> str:
    """Return a one-line German label of a Photon result, from its most specific part to the town.

    Without a postcode, places of the same name would look alike, so the county or the state is
    added to tell them apart.
    """
    street = " ".join(part for part in (properties.get("street"), properties.get("housenumber")) if part)
    name = properties.get("name")
    first = name if name and name != street else ""
    postcode = properties.get("postcode")
    city = properties.get("city") or properties.get("town")
    town = " ".join(part for part in (postcode, city if city != first else None) if part)
    district = properties.get("district")
    if district:
        town = f"{town} ({district})" if town else district
    region = None if postcode else properties.get("county") or properties.get("state")
    return ", ".join(part for part in (first, street, town, region) if part)


def place(feature: object) -> Place | None:
    """Return the place of one Photon feature, or None when it lacks a point or a label."""
    if not isinstance(feature, dict):
        return None
    geometry = feature.get("geometry")
    properties = feature.get("properties")
    coordinates = geometry.get("coordinates") if isinstance(geometry, dict) else None
    if not isinstance(coordinates, list) or len(coordinates) != 2 or not isinstance(properties, dict):
        return None
    try:
        longitude, latitude = float(coordinates[0]), float(coordinates[1])
    except (TypeError, ValueError):
        return None
    text = label(properties)
    return Place(text, latitude, longitude) if text else None


def places(answer: object) -> list[Place]:
    """Return the usable places of a Photon answer, at most eight."""
    features = answer.get("features") if isinstance(answer, dict) else None
    found = [found for found in map(place, features if isinstance(features, list) else []) if found]
    return found[:MAX_RESULTS]


class AddressSearch:
    """Asks Photon for places, within a budget and with a short cache of identical searches."""

    def __init__(self, client: httpx.AsyncClient, clock: Callable[[], float] = time.time) -> None:
        """Search with `client`, which carries the server's User-Agent."""
        self.client = client
        self.clock = clock
        self._budget = TokenBudget(SEARCHES_EVERYONE, SEARCHES_PER_CLIENT, clock)
        self._cache: dict[str, tuple[float, list[Place]]] = {}
        self._running: dict[str, asyncio.Task[list[Place]]] = {}

    async def search(self, query: str, client: str) -> list[Place]:
        """Return up to eight places matching `query`, asking Photon when the cache has none."""
        key = " ".join(query.lower().split())
        cached = self._cache.get(key)
        if cached and cached[0] > self.clock():
            return cached[1]
        running = self._running.get(key)
        if running is None:
            if not self._budget.take(client):
                raise SearchRateLimited
            running = asyncio.create_task(self._ask(key))
            self._running[key] = running
            running.add_done_callback(lambda _: self._running.pop(key, None))
        return await asyncio.shield(running)

    async def _ask(self, key: str) -> list[Place]:
        """Ask Photon and keep the answer for a while."""
        west, south, east, north = GERMANY
        params = {"q": key, "lang": "de", "limit": MAX_RESULTS, "bbox": f"{west},{south},{east},{north}"}
        try:
            response = await self.client.get(PHOTON, params=params)
            response.raise_for_status()
            found = places(response.json())
        except (httpx.HTTPError, ValueError) as error:
            logger.warning("Address search failed: %s", type(error).__name__)
            raise SearchUnavailable from error
        self._remember(key, found)
        return found

    def _remember(self, key: str, found: list[Place]) -> None:
        """Cache an answer, keeping the cache at most `CACHE_ENTRIES` long."""
        now = self.clock()
        if len(self._cache) >= CACHE_ENTRIES:
            self._cache = {cached: entry for cached, entry in self._cache.items() if entry[0] > now}
            while len(self._cache) >= CACHE_ENTRIES:
                self._cache.pop(next(iter(self._cache)))
        self._cache[key] = (now + CACHE_SECONDS, found)


def search_client() -> httpx.AsyncClient:
    """Return the client Photon is asked with, naming the application as fair use asks."""
    return httpx.AsyncClient(timeout=5.0, headers={"User-Agent": f"planspiel (+{HOME})"})


class SearchRequest(BaseModel):
    """What the browser searches for; surrounding spaces do not count towards the length."""

    model_config = ConfigDict(str_strip_whitespace=True)

    q: str = Field(min_length=MIN_QUERY, max_length=MAX_QUERY)


@router.post("/api/geocode")
async def geocode(body: SearchRequest, request: Request) -> list[dict]:
    """Return places matching a search text, found by Photon through this server."""
    search: AddressSearch = request.app.state.address_search
    try:
        found = await search.search(body.q, request.client.host if request.client else "")
    except SearchRateLimited as error:
        raise HTTPException(status_code=429, detail="Zu viele Suchen.", headers={"Retry-After": "10"}) from error
    except SearchUnavailable as error:
        raise HTTPException(status_code=502, detail="Die Suche ist gerade nicht verfügbar.") from error
    return [{"label": place.label, "lat": place.latitude, "lon": place.longitude} for place in found]
