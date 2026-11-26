import asyncio
import json
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path

import httpx
import uvicorn

from fastapi import FastAPI
from fastapi.testclient import TestClient
from websockets.exceptions import ConnectionClosed
from websockets.sync.client import connect

from data.board_format import BoardFormatError, apply_batch, apply_operation, check_board
from data.boards import BoardStore
from services.boards import BoardHub, CreationLimit
from web.app import router


def sample_board() -> dict:
    """A small whole board: one vehicle on scene with one squad dismounted, one fire mark."""
    return {
        "version": 1,
        "title": "Probe",
        "region": "BE",
        "view": {"center": [52.52, 13.405], "zoom": 15},
        "vehicles": {"v1": {"id": "v1", "type": "be:LHF", "callsign": "LHF 1100/1", "station": "", "order": 0,
                            "squads": {"s1": {"id": "s1", "function": "attack", "strength": 2, "order": 0}}}},
        "features": {"f1": {"id": "f1", "order": 0, "kind": "mark", "mark": "fire"}},
        "snapshots": {"t1": {"id": "t1", "time": "2026-11-26T10:12", "title": "", "report": "",
                             "vehicles": {"v1": {"position": [52.5, 13.4]}},
                             "squads": {"s1": {"position": [52.5001, 13.4001]}},
                             "features": {"f1": {"points": [[52.5, 13.41]], "text": ""}}}},
    }


class BoardFormatTest(unittest.TestCase):
    def test_a_whole_board_passes(self):
        self.assertEqual(sample_board(), check_board(sample_board()))

    def test_broken_boards_are_refused(self):
        cases = {
            "notABoard": lambda board: board.update(version=2),
            "field": lambda board: board["vehicles"]["v1"].update(callsign=5),
            "position": lambda board: board["snapshots"]["t1"]["vehicles"]["v1"].update(position=[95, 1]),
            "time": lambda board: board["snapshots"]["t1"].update(time="gestern"),
            "reference": lambda board: board["snapshots"]["t1"]["vehicles"].update(ghost={"position": [1, 1]}),
        }
        for problem, change in cases.items():
            board = sample_board()
            change(board)
            with self.assertRaises(BoardFormatError) as raised:
                check_board(board)
            self.assertEqual(problem, raised.exception.problem)

    def test_a_vehicle_may_carry_a_heading_from_0_up_to_360(self):
        for heading in (0, 90.5, 359.9):
            board = sample_board()
            board["snapshots"]["t1"]["vehicles"]["v1"]["heading"] = heading
            self.assertEqual(heading, check_board(board)["snapshots"]["t1"]["vehicles"]["v1"]["heading"])
        for heading in (360, -1, "90", True, None, float("nan")):
            board = sample_board()
            board["snapshots"]["t1"]["vehicles"]["v1"]["heading"] = heading
            with self.assertRaises(BoardFormatError, msg=repr(heading)):
                check_board(board)

    def test_ids_must_match_keys_and_never_reach_a_prototype(self):
        board = sample_board()
        board["features"]["__proto__"] = {"id": "__proto__", "order": 1, "kind": "text"}
        with self.assertRaises(BoardFormatError):
            check_board(board)

    def test_operations_follow_the_browser(self):
        document = {"a": {}}
        self.assertTrue(apply_operation(document, {"op": "set", "path": ["a", "b"], "value": [1]}))
        self.assertFalse(apply_operation(document, {"op": "set", "path": ["gone", "b"], "value": 1}))
        self.assertFalse(apply_operation(document, {"op": "set", "path": ["a", "__proto__"], "value": 1}))
        self.assertTrue(apply_operation(document, {"op": "delete", "path": ["a", "b"]}))
        self.assertEqual({"a": {}}, document)
        for broken in (None, {"op": "move", "path": ["a"]}, {"op": "set", "path": []}, {"op": "set", "path": ["a"]}):
            with self.assertRaises(BoardFormatError):
                apply_operation(document, broken)

    def test_a_batch_is_all_or_nothing(self):
        board = sample_board()
        with self.assertRaises(BoardFormatError):
            apply_batch(board, [
                {"op": "set", "path": ["title"], "value": "Neu"},
                {"op": "delete", "path": ["vehicles", "v1"]},
            ])
        self.assertEqual(sample_board(), board)
        result, applied = apply_batch(board, [
            {"op": "set", "path": ["title"], "value": "Neu"},
            {"op": "set", "path": ["snapshots", "gone", "title"], "value": "x"},
        ])
        self.assertEqual("Neu", result["title"])
        self.assertEqual(1, len(applied))


class BoardServerTest(unittest.TestCase):
    """A board server on a temporary database, for the API and the live tests."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = BoardStore(Path(self.folder.name) / "boards.sqlite")
        app = FastAPI()
        app.include_router(router)
        app.state.board_hub = BoardHub(self.store, 200_000)
        app.state.creation_limit = CreationLimit(3)
        self.client = TestClient(app)

    def tearDown(self):
        self.store.close()
        self.folder.cleanup()

    def create(self) -> dict:
        response = self.client.post("/api/boards", content=json.dumps(sample_board()))
        self.assertEqual(201, response.status_code)
        return response.json()


class BoardApiTest(BoardServerTest):
    def test_create_and_open_with_either_token(self):
        tokens = self.create()
        as_editor = self.client.get(f"/api/boards/{tokens['editToken']}").json()
        self.assertFalse(as_editor["readOnly"])
        self.assertEqual(tokens["readToken"], as_editor["readToken"])
        self.assertEqual(sample_board(), as_editor["board"])
        as_reader = self.client.get(f"/api/boards/{tokens['readToken']}").json()
        self.assertTrue(as_reader["readOnly"])
        self.assertNotIn("readToken", as_reader)
        self.assertNotIn("editToken", json.dumps(as_reader))
        self.assertEqual(404, self.client.get("/api/boards/unknown").status_code)

    def test_only_whole_boards_of_bounded_size_are_stored(self):
        broken = sample_board()
        broken["vehicles"]["v1"]["callsign"] = 5
        self.assertEqual(422, self.client.post("/api/boards", content=json.dumps(broken)).status_code)
        self.assertEqual(422, self.client.post("/api/boards", content="kein json").status_code)
        huge = sample_board()
        huge["title"] = "x" * 300_000
        self.assertEqual(413, self.client.post("/api/boards", content=json.dumps(huge)).status_code)
        self.assertEqual(0, self.store.count())

    def test_an_oversized_body_is_refused_while_streaming(self):
        def chunks():
            for _ in range(50):
                yield b"x" * 10_000

        self.assertEqual(413, self.client.post("/api/boards", content=chunks()).status_code)
        headers = {"Content-Length": "999999999"}
        self.assertEqual(413, self.client.post("/api/boards", content=b"{}", headers=headers).status_code)

    def test_creations_are_limited_per_client(self):
        for _ in range(3):
            self.create()
        response = self.client.post("/api/boards", content=json.dumps(sample_board()))
        self.assertEqual(429, response.status_code)
        self.assertIn("retry-after", response.headers)

    def test_only_the_edit_token_deletes(self):
        tokens = self.create()
        self.assertEqual(403, self.client.delete(f"/api/boards/{tokens['readToken']}").status_code)
        self.assertEqual(204, self.client.delete(f"/api/boards/{tokens['editToken']}").status_code)
        self.assertEqual(404, self.client.get(f"/api/boards/{tokens['editToken']}").status_code)


class LiveSyncTest(unittest.TestCase):
    """The live sync against a real server on a free port, since every client of a board has to
    share one event loop, as they do in production."""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = BoardStore(Path(self.folder.name) / "boards.sqlite")
        app = FastAPI()
        app.include_router(router)
        app.state.board_hub = BoardHub(self.store, 200_000)
        app.state.creation_limit = CreationLimit(10)
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            self.port = probe.getsockname()[1]
        self.server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=self.port, log_level="warning"))
        self.thread = threading.Thread(target=self.server.run, daemon=True)
        self.thread.start()
        for _ in range(100):
            if self.server.started:
                break
            time.sleep(0.05)
        self.http = httpx.Client(base_url=f"http://127.0.0.1:{self.port}")

    def tearDown(self):
        self.http.close()
        self.server.should_exit = True
        self.thread.join(timeout=5)
        self.store.close()
        self.folder.cleanup()

    def create(self) -> dict:
        response = self.http.post("/api/boards", content=json.dumps(sample_board()))
        self.assertEqual(201, response.status_code)
        return response.json()

    def connect(self, token: str):
        return connect(f"ws://127.0.0.1:{self.port}/api/boards/{token}/live", open_timeout=5)

    def receive_until(self, client, kind: str) -> dict:
        for _ in range(20):
            message = json.loads(client.recv(timeout=5))
            if message["type"] == kind:
                return message
        self.fail(f"no {kind} message")

    def send(self, client, message: dict) -> None:
        client.send(json.dumps(message))

    def test_editors_and_readers_see_every_accepted_batch_in_order(self):
        tokens = self.create()
        with self.connect(tokens["editToken"]) as first, self.connect(tokens["editToken"]) as second, \
                self.connect(tokens["readToken"]) as reader:
            first_state = self.receive_until(first, "state")
            self.assertEqual(tokens["readToken"], first_state["readToken"])
            reader_state = self.receive_until(reader, "state")
            self.assertTrue(reader_state["readOnly"])
            self.assertNotIn("readToken", reader_state)
            self.receive_until(second, "state")
            move = {"op": "set", "path": ["snapshots", "t1", "vehicles", "v1"], "value": {"position": [52.6, 13.5]}}
            self.send(first, {"type": "ops", "batch": "b1", "operations": [move]})
            for client in (first, second, reader):
                message = self.receive_until(client, "ops")
                self.assertEqual(1, message["revision"])
                self.assertEqual("b1", message["batch"])
                self.assertEqual(first_state["you"], message["client"])
                self.assertTrue(message["complete"])
            title = {"op": "set", "path": ["title"], "value": "Zweiter"}
            self.send(second, {"type": "ops", "batch": "b2", "operations": [title]})
            self.assertEqual(2, self.receive_until(first, "ops")["revision"])
        stored = self.http.get(f"/api/boards/{tokens['editToken']}").json()
        self.assertEqual(2, stored["revision"])
        self.assertEqual("Zweiter", stored["board"]["title"])
        self.assertEqual([52.6, 13.5], stored["board"]["snapshots"]["t1"]["vehicles"]["v1"]["position"])

    def test_readers_cannot_edit_and_broken_batches_reach_nobody(self):
        tokens = self.create()
        with self.connect(tokens["editToken"]) as editor, self.connect(tokens["readToken"]) as reader:
            self.receive_until(editor, "state")
            self.receive_until(reader, "state")
            self.send(reader, {"type": "ops", "batch": "r1", "operations": [{"op": "set", "path": ["title"], "value": "x"}]})
            self.assertEqual("notAllowed", self.receive_until(reader, "reject")["problem"])
            self.send(editor, {"type": "ops", "batch": "e1", "operations": [{"op": "delete", "path": ["vehicles", "v1"]}]})
            rejected = self.receive_until(editor, "reject")
            self.assertEqual(("e1", "reference"), (rejected["batch"], rejected["problem"]))
            self.send(editor, {"type": "sync"})
            self.assertEqual(0, self.receive_until(editor, "state")["revision"])
        self.assertEqual(sample_board(), self.http.get(f"/api/boards/{tokens['readToken']}").json()["board"])

    def test_focus_and_presence_reach_the_others(self):
        tokens = self.create()
        with self.connect(tokens["editToken"]) as editor:
            self.receive_until(editor, "state")
            with self.connect(tokens["readToken"]) as reader:
                self.receive_until(reader, "state")
                presence = self.receive_until(editor, "presence")
                while presence["readers"] == 0:
                    presence = self.receive_until(editor, "presence")
                self.assertEqual((1, 1), (presence["editors"], presence["readers"]))
                self.send(editor, {"type": "focus", "snapshot": "t1"})
                self.assertEqual("t1", self.receive_until(reader, "focus")["snapshot"])
                self.send(reader, {"type": "focus", "snapshot": "t1"})
                self.assertEqual("notAllowed", self.receive_until(reader, "reject")["problem"])
            with self.connect(tokens["readToken"]) as late:
                self.assertEqual("t1", self.receive_until(late, "state")["focus"])

    def test_deleting_tells_everyone_and_closes(self):
        tokens = self.create()
        with self.connect(tokens["readToken"]) as reader:
            self.receive_until(reader, "state")
            self.assertEqual(204, self.http.delete(f"/api/boards/{tokens['editToken']}").status_code)
            self.receive_until(reader, "deleted")

    def test_unknown_token_is_closed_with_4404(self):
        with self.connect("unknown") as client:
            with self.assertRaises(ConnectionClosed) as closed:
                client.recv(timeout=5)
        self.assertEqual(4404, closed.exception.rcvd.code)

    def test_a_room_opened_after_the_last_client_left_starts_from_the_saved_board(self):
        tokens = self.create()
        with self.connect(tokens["editToken"]) as first:
            self.receive_until(first, "state")
            self.send(first, {"type": "ops", "batch": "b1", "operations": [
                {"op": "set", "path": ["title"], "value": "Gespeichert"}]})
        with self.connect(tokens["readToken"]) as second:
            state = self.receive_until(second, "state")
        self.assertEqual("Gespeichert", state["board"]["title"])
        self.assertEqual(1, state["revision"])

    def test_whole_board_requests_are_spaced(self):
        tokens = self.create()
        with self.connect(tokens["readToken"]) as reader:
            self.receive_until(reader, "state")
            self.send(reader, {"type": "sync"})
            self.receive_until(reader, "state")
            self.send(reader, {"type": "sync"})
            self.assertEqual("tooSoon", self.receive_until(reader, "reject")["problem"])


if __name__ == "__main__":
    unittest.main()


class RoomLifecycleTest(unittest.IsolatedAsyncioTestCase):
    """The room of a board is never closed while a batch is still being written."""

    async def asyncSetUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.store = BoardStore(Path(self.folder.name) / "boards.sqlite")
        self.tokens = self.store.create(sample_board())
        self.hub = BoardHub(self.store, 200_000)

    async def asyncTearDown(self):
        self.store.close()
        self.folder.cleanup()

    async def test_leaving_during_a_save_keeps_the_room_until_it_is_written(self):
        written = asyncio.Event()
        save = self.store.save

        def slow_save(board):
            time.sleep(0.2)
            save(board)
            written.set()

        self.store.save = slow_save
        first = FakeSocket()
        room, client = self.hub.enter(self.tokens.edit_token, first)
        applying = asyncio.create_task(self.hub.receive(room, client, json.dumps(
            {"type": "ops", "batch": "b1", "operations": [{"op": "set", "path": ["title"], "value": "Neu"}]})))
        await asyncio.sleep(0.05)
        self.hub.leave(room, client)
        second = FakeSocket()
        late_room, _ = self.hub.enter(self.tokens.read_token, second)
        self.assertIs(room, late_room)
        await applying
        await written.wait()
        self.assertEqual("Neu", self.store.find(self.tokens.read_token).board.document["title"])
        await asyncio.sleep(0.05)
        self.assertIn('"Neu"', second.sent[-1])


class FakeSocket:
    """A connection that records what it is sent."""

    def __init__(self):
        self.sent: list[str] = []

    async def send_text(self, text: str) -> None:
        self.sent.append(text)

    async def close(self, code: int = 1000) -> None:
        return None
