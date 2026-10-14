"""Requirements for execute-time variables ({{ name }} placeholders).

- Requests without placeholders behave exactly as before.
- A placeholder in the URL is filled with the variable as one opaque value: it
  can never change the host, add path segments or query parameters.
- Header and body placeholders are filled verbatim, but a header value can
  never smuggle in another header line.
- A missing or non-scalar variable stops the request before anything is sent,
  and the error names the variable without revealing any values.
"""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest
from unittest.mock import MagicMock
from urllib.parse import urlsplit


def _load():
    root = Path(__file__).parents[1] / "custom_components" / "http_requests"
    package_name = "http_requests_variables_test"
    package = ModuleType(package_name)
    package.__path__ = [str(root)]
    sys.modules[package_name] = package
    aiohttp = ModuleType("aiohttp")
    aiohttp.ClientError = type("ClientError", (Exception,), {})
    aiohttp.ClientSession = type("ClientSession", (), {})
    aiohttp.ClientTimeout = lambda total: total
    sys.modules["aiohttp"] = aiohttp
    for name in ("const", "model", "client"):
        qualified = f"{package_name}.{name}"
        spec = importlib.util.spec_from_file_location(qualified, root / f"{name}.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[qualified] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{package_name}.model"], sys.modules[f"{package_name}.client"]


model, client = _load()

KOSYNC = {
    "name": "kosync progress",
    "url": "https://kosync.example/syncs/progress/{{ document }}",
    "headers": {"Accept": "application/vnd.koreader.v1+json", "x-auth-user": "{{user}}"},
    "body": '{"doc": "{{ document }}"}',
}


def config(**overrides):
    values = dict(KOSYNC)
    values.update(overrides)
    return model.RequestConfig.from_mapping(values)


class RenderTest(unittest.TestCase):
    def test_request_without_placeholders_is_unchanged(self):
        plain = config(url="https://example.com/a?b=1", headers={"X": "y"}, body="raw {x}")
        for variables in (None, {}, {"document": "abc"}):
            self.assertEqual(model.render_request(plain, variables), plain)

    def test_placeholders_are_filled_in_url_headers_and_body(self):
        rendered = model.render_request(config(), {"document": "ee5888", "user": "damian"})
        self.assertEqual(rendered.url, "https://kosync.example/syncs/progress/ee5888")
        self.assertEqual(rendered.headers["x-auth-user"], "damian")
        self.assertEqual(rendered.body, '{"doc": "ee5888"}')

    def test_url_value_cannot_escape_its_position(self):
        for evil in ("../../admin", "a?admin=1", "a#frag", "x@evil.host/", "a/b c"):
            with self.subTest(value=evil):
                url = model.render_request(config(), {"document": evil, "user": "u"}).url
                parts = urlsplit(url)
                self.assertEqual(parts.hostname, "kosync.example")
                self.assertEqual(parts.query, "")
                self.assertEqual(parts.fragment, "")
                self.assertEqual(parts.path.count("/"), 3)

    def test_header_value_cannot_inject_another_header(self):
        with self.assertRaises(model.RequestVariablesError):
            model.render_request(config(), {"document": "d", "user": "a\r\nX-Evil: 1"})

    def test_missing_variable_is_reported_by_name_only(self):
        with self.assertRaises(model.RequestVariablesError) as ctx:
            model.render_request(config(), {"document": "secret-doc"})
        self.assertIn("user", str(ctx.exception))
        self.assertNotIn("secret-doc", str(ctx.exception))

    def test_non_scalar_variable_is_rejected(self):
        with self.assertRaises(model.RequestVariablesError):
            model.render_request(config(), {"document": {"nested": 1}, "user": "u"})

    def test_lists_placeholders_a_request_needs(self):
        self.assertEqual(model.request_variables(config()), {"document", "user"})


class FakeResponse:
    status = 200
    reason = "OK"
    charset = "utf-8"
    headers = {"Content-Type": "application/json"}

    def __init__(self):
        self.content = MagicMock()
        self.content.read = self._read
        self._sent = False

    async def _read(self, _n):
        if self._sent:
            return b""
        self._sent = True
        return b'{"percentage": 0.42}'

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class ExecuteTest(unittest.TestCase):
    def setUp(self):
        self.session = MagicMock()
        self.session.request = MagicMock(return_value=FakeResponse())
        self.runtime = client.HttpRequestRuntime(self.session, config())
        self.notified = 0
        self.runtime.add_listener(self._listener)

    def _listener(self):
        self.notified += 1

    def test_sends_the_rendered_request(self):
        result = asyncio.run(self.runtime.async_execute({"document": "ee5888", "user": "damian"}))
        self.assertEqual(result.status, 200)
        args, kwargs = self.session.request.call_args
        self.assertEqual(args[1], "https://kosync.example/syncs/progress/ee5888")
        self.assertEqual(kwargs["headers"]["x-auth-user"], "damian")
        self.assertEqual(kwargs["data"], '{"doc": "ee5888"}')

    def test_saved_template_is_not_modified_by_an_execution(self):
        asyncio.run(self.runtime.async_execute({"document": "ee5888", "user": "damian"}))
        self.assertIn("{{ document }}", self.runtime.config.url)

    def test_missing_variable_fails_without_sending(self):
        result = asyncio.run(self.runtime.async_execute({"document": "ee5888"}))
        self.session.request.assert_not_called()
        self.assertIsNotNone(result.error)
        self.assertIn("user", result.error)
        self.assertEqual(self.notified, 1)


if __name__ == "__main__":
    unittest.main()
