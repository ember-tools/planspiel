"""The board document as the server sees it: checking that it is whole and applying operations.

The browser holds the same rules in `frontend/src/board/validate.ts` and
`frontend/src/board/operations.ts`. Both sides have to agree: the server refuses any batch of
operations after which the board would no longer pass the check, so a client that slipped can never
leave every other client with a board they cannot open.
"""

import copy
import math
import re
from collections.abc import Callable
from typing import Any

MARK_KINDS = ("incident", "fire", "hazard", "staging", "command-post", "water", "casualty-collection")
LINE_STYLES = ("hose", "barrier", "route")
AREA_STYLES = ("danger", "sector", "staging")
FEATURE_KINDS = ("mark", "line", "area", "text")
FORBIDDEN_KEYS = frozenset({"__proto__", "constructor", "prototype"})
TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")


class BoardFormatError(ValueError):
    """Data that is not a whole board; `problem` names the rule, `where` the place."""

    def __init__(self, problem: str, where: str = "") -> None:
        super().__init__(f"{problem} at {where}" if where else problem)
        self.problem = problem
        self.where = where


def _record(value: Any, where: str) -> dict:
    if not isinstance(value, dict):
        raise BoardFormatError("field", where)
    return value


def _text(value: Any, where: str) -> None:
    if not isinstance(value, str):
        raise BoardFormatError("field", where)


def _count(value: Any, where: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise BoardFormatError("field", where)


def _one_of(value: Any, allowed: tuple[str, ...], where: str) -> None:
    if value not in allowed:
        raise BoardFormatError("field", where)


def _lat_lng(value: Any, where: str) -> None:
    valid = (
        isinstance(value, list)
        and len(value) == 2
        and all(not isinstance(number, bool) and isinstance(number, (int, float)) and math.isfinite(number)
                for number in value)
        and abs(value[0]) <= 90
        and abs(value[1]) <= 180
    )
    if not valid:
        raise BoardFormatError("position", where)


def _entries(value: Any, where: str, check: Callable[[dict, str], None]) -> dict:
    checked = _record(value, where)
    for key, entry in checked.items():
        at = f"{where}.{key}"
        item = _record(entry, at)
        if key in FORBIDDEN_KEYS or item.get("id") != key:
            raise BoardFormatError("field", f"{at}.id")
        check(item, at)
    return checked


def _check_vehicle(vehicle: dict, at: str) -> None:
    _text(vehicle.get("type"), f"{at}.type")
    _text(vehicle.get("callsign"), f"{at}.callsign")
    _text(vehicle.get("station"), f"{at}.station")
    _count(vehicle.get("order"), f"{at}.order")

    def check_squad(squad: dict, squad_at: str) -> None:
        _text(squad.get("function"), f"{squad_at}.function")
        _count(squad.get("strength"), f"{squad_at}.strength")
        _count(squad.get("order"), f"{squad_at}.order")

    _entries(vehicle.get("squads"), f"{at}.squads", check_squad)


def _check_feature(feature: dict, at: str) -> None:
    _count(feature.get("order"), f"{at}.order")
    kind = feature.get("kind")
    _one_of(kind, FEATURE_KINDS, f"{at}.kind")
    if kind == "mark":
        _one_of(feature.get("mark"), MARK_KINDS, f"{at}.mark")
    if kind == "line":
        _one_of(feature.get("style"), LINE_STYLES, f"{at}.style")
    if kind == "area":
        _one_of(feature.get("style"), AREA_STYLES, f"{at}.style")


def _check_positions(value: Any, known: set[str], where: str) -> None:
    for key, placed in _record(value, where).items():
        if key not in known:
            raise BoardFormatError("reference", f"{where}.{key}")
        _lat_lng(_record(placed, f"{where}.{key}").get("position"), f"{where}.{key}.position")


def check_board(data: Any) -> dict:
    """Check that data is a whole board and return it; raise `BoardFormatError` otherwise."""
    if not isinstance(data, dict) or data.get("version") != 1:
        raise BoardFormatError("notABoard")
    _text(data.get("title"), "title")
    _text(data.get("region"), "region")
    view = _record(data.get("view"), "view")
    _lat_lng(view.get("center"), "view.center")
    _count(view.get("zoom"), "view.zoom")
    vehicles = _entries(data.get("vehicles"), "vehicles", _check_vehicle)
    features = _entries(data.get("features"), "features", _check_feature)
    squad_list = [squad for vehicle in vehicles.values() for squad in vehicle["squads"]]
    squad_ids = set(squad_list)
    if len(squad_ids) != len(squad_list):
        raise BoardFormatError("field", "squads")
    vehicle_ids, feature_ids = set(vehicles), set(features)

    def check_snapshot(snapshot: dict, at: str) -> None:
        if not isinstance(snapshot.get("time"), str) or not TIME.match(snapshot["time"]):
            raise BoardFormatError("time", f"{at}.time")
        _text(snapshot.get("title"), f"{at}.title")
        _text(snapshot.get("report"), f"{at}.report")
        _check_positions(snapshot.get("vehicles"), vehicle_ids, f"{at}.vehicles")
        _check_positions(snapshot.get("squads"), squad_ids, f"{at}.squads")
        for key, drawn in _record(snapshot.get("features"), f"{at}.features").items():
            where = f"{at}.features.{key}"
            if key not in feature_ids:
                raise BoardFormatError("reference", where)
            item = _record(drawn, where)
            _text(item.get("text"), f"{where}.text")
            points = item.get("points")
            if not isinstance(points, list) or not points:
                raise BoardFormatError("position", f"{where}.points")
            for index, point in enumerate(points):
                _lat_lng(point, f"{where}.points.{index}")

    if not _entries(data.get("snapshots"), "snapshots", check_snapshot):
        raise BoardFormatError("noSnapshot")
    return data


def apply_operation(document: dict, operation: Any) -> bool:
    """Apply one operation in place, as the browser does, and tell whether it changed anything.

    An operation is `{"op": "set", "path": [...], "value": ...}` or `{"op": "delete", "path": [...]}`.
    One whose parent is gone is dropped, and so is one through a key that would reach a prototype in
    the browser. Anything that is not an operation at all raises `BoardFormatError`.
    """
    if not isinstance(operation, dict) or operation.get("op") not in ("set", "delete"):
        raise BoardFormatError("operation")
    path = operation.get("path")
    if not isinstance(path, list) or not path or not all(isinstance(key, str) for key in path):
        raise BoardFormatError("operation")
    if any(key in FORBIDDEN_KEYS for key in path):
        return False
    parent: Any = document
    for key in path[:-1]:
        if not isinstance(parent, dict) or key not in parent:
            return False
        parent = parent[key]
    if not isinstance(parent, dict):
        return False
    last = path[-1]
    if operation["op"] == "delete":
        if last not in parent:
            return False
        del parent[last]
        return True
    if "value" not in operation:
        raise BoardFormatError("operation")
    parent[last] = copy.deepcopy(operation["value"])
    return True


def apply_batch(document: dict, operations: Any) -> tuple[dict, list]:
    """Apply a batch to a copy of a board and return the new board with the operations that changed
    something. The batch is all or nothing: if the result is not a whole board, nothing is changed
    and `BoardFormatError` is raised."""
    if not isinstance(operations, list):
        raise BoardFormatError("operation")
    result = copy.deepcopy(document)
    applied = [operation for operation in operations if apply_operation(result, operation)]
    check_board(result)
    return result, applied
