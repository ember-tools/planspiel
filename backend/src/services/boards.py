"""Sharing boards: creating one from a local board, opening it by token, and editing it together.

Every client of a board keeps a live WebSocket. A client sends its edits as batches of operations;
the server applies each batch to its copy, refuses it when the board would no longer be whole, and
otherwise hands it with a new revision to every client, the sender included. The server's order is
the truth: a client applies what it is sent in that order and ends up where everyone else is. When
two people change the same thing at once, the change that reaches the server last wins.

Whoever opened the board with the read token receives everything and may send nothing but a request
for the full state. Editors also say which snapshot they show, and readers can follow that.

Every accepted batch is written to the store before anyone hears of it, and a reconnecting client
receives the whole board rather than the changes it missed; boards are small enough for both.
"""

import asyncio
import contextlib
import json
import logging
import secrets
import time
from collections import deque
from dataclasses import dataclass, field

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from data.board_format import BoardFormatError, apply_batch, check_board
from data.boards import BoardStore, StoredBoard

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/boards", tags=["boards"])

MESSAGES_PER_SECOND = 20.0
MESSAGE_BURST = 60.0
SYNC_INTERVAL = 2.0
SEND_QUEUE = 64
SEND_TIMEOUT = 10.0
MISSING = 4404
CLOSE = ""
_closing: set[asyncio.Task[None]] = set()


class CreationLimit:
    """How many boards one client may create per hour, so the table cannot be flooded."""

    def __init__(self, per_hour: int) -> None:
        """Allow `per_hour` creations per client within any hour."""
        self.per_hour = per_hour
        self._created: dict[str, deque[float]] = {}

    def allow(self, client: str, now: float | None = None) -> bool:
        """Count a creation for a client, or refuse it when the client is at the limit."""
        now = time.time() if now is None else now
        recent = self._created.setdefault(client, deque())
        while recent and now - recent[0] > 3600:
            recent.popleft()
        if len(recent) >= self.per_hour:
            return False
        recent.append(now)
        if len(self._created) > 10_000:
            self._created = {key: value for key, value in self._created.items() if value}
        return True


@dataclass(eq=False)
class Client:
    """One live connection to a board, with its own queue of messages to send.

    Messages go out through the queue, drained by a task of its own, so a client that reads slowly
    or not at all never holds up the room. One whose queue overflows or that does not take a message
    within `SEND_TIMEOUT` is disconnected.
    """

    socket: WebSocket
    id: str
    read_only: bool
    allowance: float = MESSAGE_BURST
    checked: float = field(default_factory=time.monotonic)
    last_sync: float = 0.0
    queue: asyncio.Queue[str] = field(default_factory=lambda: asyncio.Queue(SEND_QUEUE))
    writer: asyncio.Task[None] | None = None

    def may_send(self) -> bool:
        """Take a message from this client's budget, refilled continuously."""
        now = time.monotonic()
        self.allowance = min(MESSAGE_BURST, self.allowance + (now - self.checked) * MESSAGES_PER_SECOND)
        self.checked = now
        if self.allowance < 1:
            return False
        self.allowance -= 1
        return True

    def may_sync(self) -> bool:
        """Allow a request for the whole board at most once per `SYNC_INTERVAL`."""
        now = time.monotonic()
        if now - self.last_sync < SYNC_INTERVAL:
            return False
        self.last_sync = now
        return True

    def start(self) -> None:
        """Start the task that sends the queued messages."""
        self.writer = asyncio.create_task(self._write())

    def post(self, text: str) -> None:
        """Queue a message, disconnecting the client when it has fallen too far behind."""
        try:
            self.queue.put_nowait(text)
        except asyncio.QueueFull:
            logger.info("Client %s too slow, disconnected", self.id)
            self.stop()

    def finish(self) -> None:
        """Send what is queued, then close the connection."""
        with contextlib.suppress(asyncio.QueueFull):
            self.queue.put_nowait(CLOSE)

    def stop(self) -> None:
        """Stop sending at once and close the connection."""
        if self.writer:
            self.writer.cancel()
        closing = asyncio.create_task(_close(self.socket))
        _closing.add(closing)
        closing.add_done_callback(_closing.discard)

    async def _write(self) -> None:
        while True:
            text = await self.queue.get()
            if text == CLOSE:
                await _close(self.socket)
                return
            try:
                await asyncio.wait_for(self.socket.send_text(text), SEND_TIMEOUT)
            except Exception:
                logger.debug("Sending to client %s failed", self.id, exc_info=True)
                await _close(self.socket)
                return


async def _close(socket: WebSocket, code: int = 1000) -> None:
    """Close a connection, whatever state it is in."""
    with contextlib.suppress(RuntimeError, WebSocketDisconnect):
        await socket.close(code=code)


@dataclass(eq=False)
class Room:
    """A board with live clients: the server's copy of it, who is connected, and the snapshot the
    editors last showed."""

    board: StoredBoard
    clients: set[Client] = field(default_factory=set)
    focus: str | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class BoardHub:
    """The rooms of all boards with live clients.

    A room holds the newest state of its board while it has clients. It is only closed when it has
    no clients and no batch is being written, so a client that opens the board again always starts
    from what was last saved.
    """

    def __init__(self, store: BoardStore, max_bytes: int) -> None:
        """Serve boards from a store, refusing any board larger than `max_bytes` as JSON."""
        self.store = store
        self.max_bytes = max_bytes
        self.rooms: dict[str, Room] = {}

    def current(self, board: StoredBoard) -> StoredBoard:
        """The newest state of a board: the live room's copy when there is one."""
        room = self.rooms.get(board.id)
        return room.board if room else board

    def enter(self, token: str, socket: WebSocket) -> tuple[Room, Client] | None:
        """Add a connection to the room of the board its token opens, opening the room from the
        store when it is the first; None when no board has the token. Nothing here waits, so no
        batch can be saved between reading the board and opening its room."""
        access = self.store.find(token)
        if access is None:
            return None
        room = self.rooms.get(access.board.id)
        if room is None:
            room = self.rooms[access.board.id] = Room(access.board)
        client = Client(socket, secrets.token_urlsafe(8), access.read_only)
        room.clients.add(client)
        client.start()
        self.send_state(room, client)
        self.broadcast_presence(room)
        return room, client

    def leave(self, room: Room, client: Client) -> None:
        """Remove a connection; the room closes once it is empty and idle."""
        room.clients.discard(client)
        client.stop()
        if room.clients:
            self.broadcast_presence(room)
        self._close_if_idle(room)

    def _close_if_idle(self, room: Room) -> None:
        if not room.clients and not room.lock.locked() and self.rooms.get(room.board.id) is room:
            del self.rooms[room.board.id]

    def send_state(self, room: Room, client: Client) -> None:
        """Send a client the whole board, which also tells it who it is."""
        message = {
            "type": "state",
            "you": client.id,
            "readOnly": client.read_only,
            "board": room.board.document,
            "revision": room.board.revision,
            "focus": room.focus,
        }
        if not client.read_only:
            message["readToken"] = room.board.read_token
        client.post(json.dumps(message))

    async def receive(self, room: Room, client: Client, raw: str) -> None:
        """Handle one message of a client."""
        if len(raw) > self.max_bytes:
            self._send(client, {"type": "reject", "problem": "tooLarge"})
            return
        try:
            message = json.loads(raw)
        except ValueError:
            self._send(client, {"type": "reject", "problem": "invalid"})
            return
        kind = message.get("type") if isinstance(message, dict) else None
        if kind == "sync":
            if client.may_sync():
                self.send_state(room, client)
            else:
                self._send(client, {"type": "reject", "problem": "tooSoon"})
        elif kind == "ops" and not client.read_only:
            await self._apply(room, client, message)
        elif kind == "focus" and not client.read_only and isinstance(message.get("snapshot"), str):
            room.focus = message["snapshot"]
            self._broadcast(room, {"type": "focus", "snapshot": room.focus}, skip=client)
        else:
            batch = message.get("batch") if isinstance(message, dict) else None
            self._send(client, {"type": "reject", "problem": "notAllowed", "batch": batch})

    async def _apply(self, room: Room, client: Client, message: dict) -> None:
        """Apply a batch of a client and hand it to everyone, or refuse it to the sender alone. The
        work on the board runs in a worker thread, so a large board does not hold up other rooms."""
        batch = message.get("batch") if isinstance(message.get("batch"), str) else None
        operations = message.get("operations")
        async with room.lock:
            try:
                board, applied, size = await asyncio.to_thread(self._applied, room.board.document, operations)
            except BoardFormatError as error:
                self._send(client, {"type": "reject", "batch": batch, "problem": error.problem})
                return
            if size > self.max_bytes:
                self._send(client, {"type": "reject", "batch": batch, "problem": "tooLarge"})
                return
            room.board.document = board
            room.board.revision += 1
            await asyncio.to_thread(self.store.save, room.board)
            self._broadcast(room, {
                "type": "ops",
                "revision": room.board.revision,
                "operations": applied,
                "batch": batch,
                "client": client.id,
                "complete": len(applied) == len(operations),
            })
        self._close_if_idle(room)

    @staticmethod
    def _applied(document: dict, operations: object) -> tuple[dict, list, int]:
        board, applied = apply_batch(document, operations)
        return board, applied, len(json.dumps(board))

    async def close_board(self, board_id: str) -> None:
        """Tell every client of a deleted board and drop its room."""
        room = self.rooms.pop(board_id, None)
        if room:
            self._broadcast(room, {"type": "deleted"})
            for client in list(room.clients):
                client.finish()

    async def close_all(self) -> None:
        """Close every room once its running batch is written, as the server shuts down."""
        for room in list(self.rooms.values()):
            async with room.lock:
                for client in list(room.clients):
                    client.stop()
        self.rooms.clear()

    def broadcast_presence(self, room: Room) -> None:
        """Tell everyone how many people have the board open, editing and watching."""
        editors = sum(1 for client in room.clients if not client.read_only)
        self._broadcast(room, {"type": "presence", "editors": editors, "readers": len(room.clients) - editors})

    def _broadcast(self, room: Room, message: dict, skip: Client | None = None) -> None:
        text = json.dumps(message)
        for client in list(room.clients):
            if client is not skip:
                client.post(text)

    @staticmethod
    def _send(client: Client, message: dict) -> None:
        client.post(json.dumps(message))


def _hub(request: Request | WebSocket) -> BoardHub:
    return request.app.state.board_hub


def _current(request: Request, token: str) -> tuple[StoredBoard, bool]:
    access = _hub(request).store.find(token)
    if access is None:
        raise HTTPException(status_code=404, detail="Diese Platte gibt es nicht.")
    return _hub(request).current(access.board), access.read_only


async def _limited_body(request: Request, limit: int) -> bytes:
    """The request body, refused with 413 as soon as it is known to exceed `limit` bytes."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise HTTPException(status_code=413, detail="Die Platte ist zu groß.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > limit:
            raise HTTPException(status_code=413, detail="Die Platte ist zu groß.")
    return bytes(body)


@router.post("")
async def create_board(request: Request) -> JSONResponse:
    """Share a board: store the board in the body and return the tokens to edit and to read it."""
    client = request.client.host if request.client else ""
    body = await _limited_body(request, _hub(request).max_bytes)
    try:
        document = check_board(json.loads(body))
    except (ValueError, BoardFormatError) as error:
        raise HTTPException(status_code=422, detail="Das ist keine vollständige Planspielplatte.") from error
    if not request.app.state.creation_limit.allow(client):
        raise HTTPException(status_code=429, detail="Zu viele neue Platten auf einmal.", headers={"Retry-After": "3600"})
    board = await asyncio.to_thread(_hub(request).store.create, document)
    return JSONResponse({"editToken": board.edit_token, "readToken": board.read_token}, status_code=201)


@router.get("/{token}")
def read_board(token: str, request: Request) -> dict:
    """The board a token opens, with its revision and whether the token may only read."""
    board, read_only = _current(request, token)
    answer = {"board": board.document, "revision": board.revision, "readOnly": read_only}
    if not read_only:
        answer["readToken"] = board.read_token
    return answer


@router.delete("/{token}", status_code=204)
async def delete_board(token: str, request: Request) -> None:
    """Delete a board for good; only its edit token may."""
    board, read_only = _current(request, token)
    if read_only:
        raise HTTPException(status_code=403, detail="Dieser Link darf nur lesen.")
    await asyncio.to_thread(_hub(request).store.delete, board.id)
    await _hub(request).close_board(board.id)


@router.websocket("/{token}/live")
async def live(socket: WebSocket, token: str) -> None:
    """The live connection of one client to a board. An unknown token is closed with 4404 after
    the handshake, since a browser never sees the code of a refused handshake."""
    await socket.accept()
    hub = _hub(socket)
    entered = hub.enter(token, socket)
    if entered is None:
        await _close(socket, MISSING)
        return
    room, client = entered
    try:
        while True:
            raw = await socket.receive_text()
            if not client.may_send():
                await _close(socket, 1008)
                break
            await hub.receive(room, client, raw)
    except (WebSocketDisconnect, RuntimeError):
        logger.debug("Client %s disconnected", client.id)
    finally:
        hub.leave(room, client)
