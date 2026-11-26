import io
import logging
import os
import unittest
from unittest import mock

from web.logformat import configure_logging


class LogFormatTest(unittest.TestCase):
    def setUp(self):
        with mock.patch.dict(os.environ, {"LOG_FORMAT": "json"}):
            configure_logging()
        self.output = io.StringIO()
        self.previous = []
        for name in ("uvicorn", ""):
            for handler in logging.getLogger(name).handlers:
                self.previous.append((handler, handler.setStream(self.output)))

    def tearDown(self):
        for handler, stream in self.previous:
            handler.setStream(stream)

    def test_requests_are_never_logged(self):
        logging.getLogger("uvicorn.access").info('%s - "%s %s HTTP/%s" %d', "203.0.113.7:1", "GET", "/p/token", "1.1", 200)
        self.assertEqual("", self.output.getvalue())

    def test_websocket_handshakes_are_never_logged(self):
        error = logging.getLogger("uvicorn.error")
        error.info('%s - "WebSocket %s" [accepted]', "203.0.113.7:1", "/api/boards/token/live")
        error.info('%s - "WebSocket %s" %d', "203.0.113.7:1", "/api/boards/token/live", 403)
        self.assertEqual("", self.output.getvalue())

    def test_other_server_lines_still_appear(self):
        logging.getLogger("uvicorn.error").info("Application startup complete.")
        self.assertIn("Application startup complete.", self.output.getvalue())

    def test_tile_fetches_are_not_logged(self):
        self.assertFalse(logging.getLogger("httpx").isEnabledFor(logging.INFO))


if __name__ == "__main__":
    unittest.main()
