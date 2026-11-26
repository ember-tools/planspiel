import json
import logging
import os
from datetime import datetime, timezone
from logging.config import dictConfig


class EcsJsonFormatter(logging.Formatter):
    """Formats each record as one line of JSON using Elastic Common Schema field names."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "@timestamp": datetime.fromtimestamp(record.created, timezone.utc)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "log.level": record.levelname,
            "log.logger": record.name,
            "message": record.getMessage(),
            "process.thread.name": record.threadName,
        }
        if record.exc_info:
            error_type, error, _ = record.exc_info
            entry["error.type"] = error_type.__qualname__ if error_type else None
            entry["error.message"] = str(error)
            entry["error.stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


class NoRequestLines(logging.Filter):
    """Drops the lines uvicorn writes for every WebSocket handshake, which name the client's address
    and the path, and with it the token of a board."""

    def filter(self, record: logging.LogRecord) -> bool:
        return not str(record.msg).startswith('%s - "WebSocket ')


def configure_logging():
    """
    With LOG_FORMAT=json the root logger and uvicorn's own loggers all write ECS JSON to stdout,
    replacing the handlers uvicorn installed before importing the app. Without it nothing changes,
    so a local run keeps uvicorn's usual output.

    Requests are never logged: the links that open a board carry their token in the path, and the
    access log would also keep every client address. The access logger is therefore switched off
    here, whatever uvicorn was started with; the WebSocket handshake lines uvicorn writes to its
    error logger are filtered out; and httpx only reports problems, not every tile fetch.
    """
    if os.getenv("LOG_FORMAT", "").lower() != "json":
        return
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    dictConfig({
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"json": {"()": EcsJsonFormatter}},
        "filters": {"no_requests": {"()": NoRequestLines}},
        "handlers": {
            "stdout": {
                "class": "logging.StreamHandler", "formatter": "json", "stream": "ext://sys.stdout"},
        },
        "loggers": {
            "uvicorn": {"handlers": ["stdout"], "level": level, "propagate": False},
            "uvicorn.error": {"level": level, "filters": ["no_requests"]},
            "uvicorn.access": {"handlers": [], "level": "CRITICAL", "propagate": False},
            "httpx": {"level": "WARNING"},
        },
        "root": {"handlers": ["stdout"], "level": level},
    })
    logging.getLogger("uvicorn.access").disabled = True
