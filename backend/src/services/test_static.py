import asyncio
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException

import main


class StaticResponseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        root = Path(cls.folder.name)
        (root / "pages" / "hilfe").mkdir(parents=True)
        (root / "pages" / "index.html").write_text("landing page")
        (root / "pages" / "hilfe" / "index.html").write_text("help page")
        (root / "index.html").write_text("shell")
        (root / "build.json").write_text("{}")
        (root / "robots.txt").write_text("robots")
        cls.previous = main._static
        main._static = root

    @classmethod
    def tearDownClass(cls):
        main._static = cls.previous
        cls.folder.cleanup()

    def assert_shell(self, path: str):
        response = main.static_response(path)
        self.assertTrue(str(response.path).endswith("/index.html"), path)
        self.assertNotIn("pages", str(response.path), path)
        self.assertEqual("noindex, nofollow", response.headers["x-robots-tag"], path)

    def test_landing_page(self):
        for path in ("", "/"):
            response = main.static_response(path)
            self.assertTrue(str(response.path).endswith("pages/index.html"), path)
            self.assertNotIn("x-robots-tag", response.headers)

    def test_prerendered_page(self):
        for path in ("hilfe", "hilfe/"):
            response = main.static_response(path)
            self.assertTrue(str(response.path).endswith("pages/hilfe/index.html"))
            self.assertNotIn("x-robots-tag", response.headers)

    def test_app_routes_get_the_noindex_shell(self):
        for path in ("p/abc", "index.html", "pages/index.html", "pages/hilfe/index.html", "./index.html",
                     "pages/../index.html", "./pages/hilfe/index.html", "hilfe/../index.html",
                     "hilfe/..", "./", "p/..", "a\x00b"):
            self.assert_shell(path)

    def test_unknown_api_paths_are_404_not_the_shell(self):
        for path in ("api", "api/", "api/boards/x"):
            with self.assertRaises(HTTPException) as raised:
                asyncio.run(main.spa(path))
            self.assertEqual(404, raised.exception.status_code)
        self.assertTrue(str(asyncio.run(main.spa("apis")).path).endswith("index.html"))

    def test_build_info_is_not_cached(self):
        self.assertEqual("no-store", main.static_response("build.json").headers["cache-control"])

    def test_built_files_are_served(self):
        self.assertTrue(str(main.static_response("robots.txt").path).endswith("robots.txt"))

    def test_paths_outside_the_build_fall_back_to_the_shell(self):
        self.assert_shell("../main.py")


if __name__ == "__main__":
    unittest.main()
