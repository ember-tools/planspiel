import unittest
import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

import asyncio

from services.geocode import (
    CACHE_ENTRIES,
    CACHE_SECONDS,
    AddressSearch,
    SearchRateLimited,
    SearchUnavailable,
    label,
    places,
)
from services.geocode import router as geocode_router

BRANDENBURGER_TOR = {
    "type": "FeatureCollection",
    "features": [
        {
            "geometry": {"type": "Point", "coordinates": [13.3777, 52.5163]},
            "properties": {"name": "Brandenburger Tor", "street": "Pariser Platz", "postcode": "10117", "city": "Berlin"},
        },
        {"geometry": {"type": "Point", "coordinates": []}, "properties": {"name": "ohne Punkt"}},
    ],
}


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class Photon:
    """A stand-in for Photon that records what it is asked and answers as told."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.status = 200
        self.answer: dict = BRANDENBURGER_TOR

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return httpx.Response(self.status, json=self.answer)


class LabelTest(unittest.TestCase):
    def test_label_runs_from_the_place_to_the_town(self):
        self.assertEqual("Brandenburger Tor, Pariser Platz, 10117 Berlin", label(BRANDENBURGER_TOR["features"][0]["properties"]))

    def test_street_name_is_not_repeated(self):
        self.assertEqual(
            "Hauptstraße 5, 12345 Dorf (Mitte)",
            label({"name": "Hauptstraße 5", "street": "Hauptstraße", "housenumber": "5", "postcode": "12345", "town": "Dorf", "district": "Mitte"}),
        )

    def test_results_without_a_point_are_left_out(self):
        self.assertEqual(1, len(places(BRANDENBURGER_TOR)))

    def test_places_of_the_same_name_carry_their_county(self):
        self.assertEqual("Neustadt, Landkreis Marburg-Biedenkopf", label({"name": "Neustadt", "county": "Landkreis Marburg-Biedenkopf", "state": "Hessen"}))

    def test_odd_answers_give_no_places_instead_of_failing(self):
        self.assertEqual([], places([]))
        self.assertEqual([], places({"features": "none"}))
        self.assertEqual([], places({"features": [None, {"geometry": {"coordinates": [None, 1]}, "properties": {"name": "x"}}]}))


class AddressSearchTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.photon = Photon()
        self.client = httpx.AsyncClient(transport=httpx.MockTransport(self.photon))
        self.clock = Clock()
        self.search = AddressSearch(self.client, self.clock)

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_asks_photon_in_german_within_germany(self):
        found = await self.search.search("Pariser Platz", "1.2.3.4")
        self.assertEqual(52.5163, found[0].latitude)
        params = self.photon.requests[0].url.params
        self.assertEqual("de", params["lang"])
        self.assertEqual("5.8,47.2,15.1,55.1", params["bbox"])
        self.assertNotIn("1.2.3.4", str(self.photon.requests[0].url))

    async def test_answers_the_same_search_from_the_cache_for_a_while(self):
        await self.search.search("Pariser Platz", "a")
        await self.search.search("  pariser   platz ", "b")
        self.assertEqual(1, len(self.photon.requests))
        self.clock.now += CACHE_SECONDS + 1
        await self.search.search("Pariser Platz", "a")
        self.assertEqual(2, len(self.photon.requests))

    async def test_refuses_a_client_that_searches_too_often(self):
        with self.assertRaises(SearchRateLimited):
            for number in range(100):
                await self.search.search(f"Straße {number}", "greedy")

    async def test_keeps_the_cache_bounded(self):
        for number in range(CACHE_ENTRIES + 5):
            self.search._remember(f"query {number}", [])
        self.assertEqual(CACHE_ENTRIES, len(self.search._cache))

    async def test_identical_searches_at_the_same_time_ask_once(self):
        await asyncio.gather(*(self.search.search("Pariser Platz", f"client-{n}") for n in range(5)))
        self.assertEqual(1, len(self.photon.requests))

    async def test_reports_photon_failing(self):
        self.photon.status = 503
        with self.assertRaises(SearchUnavailable):
            await self.search.search("Pariser Platz", "a")


class RouteTest(unittest.TestCase):
    def setUp(self):
        self.photon = Photon()
        app = FastAPI()
        app.include_router(geocode_router)
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self.photon))
        app.state.address_search = AddressSearch(self.http)
        self.client = TestClient(app)

    def test_returns_label_and_coordinates(self):
        response = self.client.post("/api/geocode", json={"q": "Pariser Platz"})
        self.assertEqual(200, response.status_code)
        self.assertEqual([{"label": "Brandenburger Tor, Pariser Platz, 10117 Berlin", "lat": 52.5163, "lon": 13.3777}], response.json())

    def test_short_searches_are_refused_without_asking(self):
        self.assertEqual(422, self.client.post("/api/geocode", json={"q": "ab"}).status_code)
        self.assertEqual(422, self.client.post("/api/geocode", json={"q": "     "}).status_code)
        self.assertEqual([], self.photon.requests)

    def test_too_many_searches_are_429_with_a_wait(self):
        responses = [self.client.post("/api/geocode", json={"q": f"Straße {n}"}) for n in range(30)]
        self.assertEqual(429, responses[-1].status_code)
        self.assertEqual("10", responses[-1].headers["retry-after"])

    def test_photon_failing_is_502(self):
        self.photon.status = 500
        self.assertEqual(502, self.client.post("/api/geocode", json={"q": "Pariser Platz"}).status_code)
