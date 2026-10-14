"""Requirements for the administrator-only request management actions.

- Only administrators (or internal calls without a user) may create, update,
  delete or list requests; other users are refused before anything changes.
- create validates the request like the panel and returns its entry id;
  an invalid request creates nothing.
- update changes only the given fields; headers are merged by name, a null
  value removes one, and headers not mentioned (e.g. a secret key) are kept.
- list never reveals header values or bodies.
- delete removes exactly the chosen request.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch


def _load():
    root = Path(__file__).parents[1] / "custom_components/http_requests"
    package = ModuleType("http_requests_management_test")
    package.__path__ = [str(root)]
    names = ("voluptuous", "homeassistant", "homeassistant.core", "homeassistant.config_entries",
             "homeassistant.exceptions", "homeassistant.helpers", "homeassistant.helpers.config_validation")
    modules = {package.__name__: package, **{n: ModuleType(n) for n in names}}
    vol = modules["voluptuous"]
    vol.Schema = lambda value: value
    vol.Required = vol.Optional = lambda value: value
    core = modules["homeassistant.core"]
    core.HomeAssistant = core.ServiceCall = core.ServiceResponse = object
    core.callback = lambda fn: fn
    core.SupportsResponse = SimpleNamespace(OPTIONAL="optional", ONLY="only")
    ce = modules["homeassistant.config_entries"]
    ce.SOURCE_USER = "user"
    ce.ConfigEntryState = SimpleNamespace(LOADED="loaded")

    class HAError(Exception):
        def __init__(self, **kwargs):
            self.translation_key = kwargs.get("translation_key", "")
            super().__init__(self.translation_key)

    exc = modules["homeassistant.exceptions"]
    exc.ServiceValidationError = type("ServiceValidationError", (HAError,), {})
    exc.Unauthorized = type("Unauthorized", (HAError,), {})
    modules["homeassistant.helpers.config_validation"].string = str
    with patch.dict(sys.modules, modules):
        for name in ("const", "model", "management"):
            qualified = f"{package.__name__}.{name}"
            spec = importlib.util.spec_from_file_location(qualified, root / f"{name}.py")
            module = importlib.util.module_from_spec(spec)
            sys.modules[qualified] = module
            spec.loader.exec_module(module)
        return sys.modules[f"{package.__name__}.management"], exc


management, exc = _load()

KOSYNC = {
    "name": "kosync progress",
    "section": "",
    "url": "https://kosync.example/syncs/progress/{{ document }}",
    "method": "GET",
    "headers": {"Accept": "application/vnd.koreader.v1+json", "x-auth-key": "SECRET-MD5"},
    "body": "",
    "timeout": 10,
    "response_limit": 4096,
    "verify_ssl": True,
    "follow_redirects": True,
}


class Entry(SimpleNamespace):
    pass


class ManagementTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.entry = Entry(entry_id="req1", domain="http_requests", title="kosync progress",
                           data={"command_id": "c1", **KOSYNC}, options={}, state="loaded")
        self.other = Entry(entry_id="req2", domain="http_requests", title="brama",
                           data={"command_id": "c2", **KOSYNC, "name": "brama", "url": "http://192.0.2.1/gate",
                                 "headers": {}}, options={}, state="loaded")
        created = Entry(entry_id="new1")
        self.users = {"admin": SimpleNamespace(is_admin=True), "kid": SimpleNamespace(is_admin=False)}
        entries = {"req1": self.entry, "req2": self.other}
        self.hass = SimpleNamespace(
            auth=SimpleNamespace(async_get_user=AsyncMock(side_effect=lambda uid: self.users.get(uid))),
            config_entries=SimpleNamespace(
                async_get_entry=Mock(side_effect=lambda eid: entries.get(eid)),
                async_entries=Mock(return_value=[self.entry, self.other]),
                async_update_entry=Mock(side_effect=self._update),
                async_reload=AsyncMock(return_value=True),
                async_remove=AsyncMock(return_value={"require_restart": False}),
                flow=SimpleNamespace(async_init=AsyncMock(return_value={"result": created})),
            ),
            services=SimpleNamespace(async_register=Mock()),
        )
        management.async_register_management_services(self.hass)
        self.handlers = {c.args[1]: c.args[2] for c in self.hass.services.async_register.call_args_list}

    def _update(self, entry, title, options):
        entry.title = title
        entry.options = options

    async def call(self, action, data=None, user="admin"):
        return await self.handlers[action](SimpleNamespace(data=data or {}, context=SimpleNamespace(user_id=user)))

    # --- who may manage requests -------------------------------------------
    async def test_non_admin_is_refused_for_every_action(self):
        for action, data in (("create", {"name": "x", "url": "http://a.b"}), ("update", {"config_entry_id": "req1"}),
                             ("delete", {"config_entry_id": "req1"}), ("list", {})):
            with self.subTest(action=action), self.assertRaises(exc.Unauthorized):
                await self.call(action, data, user="kid")
        self.hass.config_entries.flow.async_init.assert_not_awaited()
        self.hass.config_entries.async_remove.assert_not_awaited()
        self.hass.config_entries.async_update_entry.assert_not_called()

    async def test_unknown_user_is_refused(self):
        with self.assertRaises(exc.Unauthorized):
            await self.call("list", user="ghost")

    async def test_internal_calls_without_user_are_allowed(self):
        result = await self.call("list", user=None)
        self.assertEqual(len(result["requests"]), 2)

    # --- create ---------------------------------------------------------------
    async def test_create_returns_new_entry_id(self):
        result = await self.call("create", {"name": "kosync", "url": "https://k.example/p/{{ document }}",
                                            "headers": {"Accept": "x"}})
        self.assertEqual(result, {"entry_id": "new1"})
        data = self.hass.config_entries.flow.async_init.call_args.kwargs["data"]
        self.assertEqual(data["url"], "https://k.example/p/{{ document }}")
        self.assertEqual(data["method"], "GET")

    async def test_invalid_request_creates_nothing(self):
        for bad in ({"name": "x", "url": "ftp://a"}, {"name": "", "url": "http://a.b"},
                    {"name": "x", "url": "http://a.b", "method": "TRACE"}):
            with self.subTest(bad=bad), self.assertRaises(exc.ServiceValidationError):
                await self.call("create", bad)
        self.hass.config_entries.flow.async_init.assert_not_awaited()

    # --- update ---------------------------------------------------------------
    async def test_update_changes_only_given_fields_and_keeps_secret_header(self):
        await self.call("update", {"config_entry_id": "req1", "url": "https://kosync.example/v2/{{ document }}"})
        opts = self.entry.options
        self.assertEqual(opts["url"], "https://kosync.example/v2/{{ document }}")
        self.assertEqual(opts["headers"]["x-auth-key"], "SECRET-MD5")
        self.assertEqual(opts["name"], "kosync progress")
        self.hass.config_entries.async_reload.assert_awaited_once_with("req1")

    async def test_update_merges_headers_and_null_removes(self):
        await self.call("update", {"config_entry_id": "req1", "headers": {"X-New": "1", "Accept": None}})
        headers = self.entry.options["headers"]
        self.assertEqual(headers, {"x-auth-key": "SECRET-MD5", "X-New": "1"})

    async def test_update_of_unknown_or_foreign_entry_is_refused(self):
        with self.assertRaises(exc.ServiceValidationError):
            await self.call("update", {"config_entry_id": "nope", "url": "http://a.b"})

    async def test_invalid_update_changes_nothing(self):
        with self.assertRaises(exc.ServiceValidationError):
            await self.call("update", {"config_entry_id": "req1", "url": "not a url"})
        self.hass.config_entries.async_update_entry.assert_not_called()

    # --- list / delete ------------------------------------------------------------
    async def test_list_never_reveals_header_values_or_body(self):
        result = await self.call("list")
        text = repr(result)
        self.assertNotIn("SECRET-MD5", text)
        kosync = next(r for r in result["requests"] if r["entry_id"] == "req1")
        self.assertEqual(kosync["header_names"], ["Accept", "x-auth-key"])
        self.assertEqual(kosync["variables"], ["document"])

    async def test_delete_removes_only_the_chosen_request(self):
        await self.call("delete", {"config_entry_id": "req2"})
        self.hass.config_entries.async_remove.assert_awaited_once_with("req2")


if __name__ == "__main__":
    unittest.main()
