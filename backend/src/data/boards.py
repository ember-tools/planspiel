"""Shared boards on disk: one SQLite row per board with its document, revision and two tokens.

Whoever holds the edit token may change the board; whoever holds the read token may only watch.
A token is the only key to a board: there are no accounts, and a board is found by nothing else.
"""

import json
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from data.board_format import check_board


@dataclass
class StoredBoard:
    """A board as it is kept: its id, both tokens, the document and its revision."""

    id: str
    edit_token: str
    read_token: str
    document: dict
    revision: int


@dataclass
class Access:
    """A board reached through a token, and whether that token may only read."""

    board: StoredBoard
    read_only: bool


class BoardStore:
    """The SQLite table of shared boards. Every statement holds one lock, since request handlers and
    the live sync run in worker threads as well as on the event loop."""

    def __init__(self, file: Path) -> None:
        """Open or create the table of boards."""
        file.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(file, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS boards (id TEXT PRIMARY KEY, edit_token TEXT UNIQUE NOT NULL,"
            " read_token TEXT UNIQUE NOT NULL, document TEXT NOT NULL, revision INTEGER NOT NULL,"
            " created REAL NOT NULL, updated REAL NOT NULL)"
        )

    def create(self, document: dict) -> StoredBoard:
        """Store a whole board under fresh tokens and return it."""
        check_board(document)
        board = StoredBoard(secrets.token_urlsafe(12), secrets.token_urlsafe(24), secrets.token_urlsafe(24),
                            document, 0)
        now = time.time()
        with self._lock:
            self._db.execute(
                "INSERT INTO boards VALUES (?, ?, ?, ?, ?, ?, ?)",
                (board.id, board.edit_token, board.read_token, json.dumps(document), 0, now, now),
            )
        return board

    def find(self, token: str) -> Access | None:
        """The board a token opens, or None for a token no board has."""
        with self._lock:
            row = self._db.execute(
                "SELECT id, edit_token, read_token, document, revision FROM boards"
                " WHERE edit_token = ? OR read_token = ?",
                (token, token),
            ).fetchone()
        if row is None:
            return None
        board = StoredBoard(row[0], row[1], row[2], json.loads(row[3]), row[4])
        return Access(board, read_only=secrets.compare_digest(token, board.read_token))

    def save(self, board: StoredBoard) -> None:
        """Write a board's document and revision."""
        with self._lock:
            self._db.execute(
                "UPDATE boards SET document = ?, revision = ?, updated = ? WHERE id = ?",
                (json.dumps(board.document), board.revision, time.time(), board.id),
            )

    def delete(self, board_id: str) -> None:
        """Remove a board for good."""
        with self._lock:
            self._db.execute("DELETE FROM boards WHERE id = ?", (board_id,))

    def count(self) -> int:
        """How many boards are stored."""
        with self._lock:
            return self._db.execute("SELECT COUNT(*) FROM boards").fetchone()[0]

    def close(self) -> None:
        """Close the database."""
        with self._lock:
            self._db.close()
