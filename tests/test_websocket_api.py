"""Tests for administrator panel WebSocket mutations."""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest


def _load_websocket_api_module():
    """Load the WebSocket module with small Home Assistant API stubs."""
    integration_dir = (
        Path(__file__).parents[1] / "custom_components" / "http_requests"
    )
    package_name = "http_requests_websocket_test_package"
    package = ModuleType(package_name)
    package.__path__ = [str(integration_dir)]
    sys.modules[package_name] = package

    voluptuous = ModuleType("voluptuous")
    voluptuous.Required = lambda key: key
    sys.modules["voluptuous"] = voluptuous

    homeassistant = ModuleType("homeassistant")
    components = ModuleType("homeassistant.components")
    websocket_api = ModuleType("homeassistant.components.websocket_api")
    config_entries = ModuleType("homeassistant.config_entries")
    core = ModuleType("homeassistant.core")

    def passthrough(function):
        return function

    websocket_api.require_admin = passthrough
    websocket_api.async_response = passthrough
    websocket_api.websocket_command = lambda _schema: passthrough
    websocket_api.ActiveConnection = object

    class ConfigEntry:
        @classmethod
        def __class_getitem__(cls, _item):
            return cls

    config_entries.ConfigEntry = ConfigEntry
    config_entries.ConfigEntryState = SimpleNamespace(LOADED="loaded")
    config_entries.SOURCE_USER = "user"
    core.HomeAssistant = object
    core.callback = passthrough
    components.websocket_api = websocket_api

    sys.modules["homeassistant"] = homeassistant
    sys.modules["homeassistant.components"] = components
    sys.modules["homeassistant.components.websocket_api"] = websocket_api
    sys.modules["homeassistant.config_entries"] = config_entries
    sys.modules["homeassistant.core"] = core

    for module_name in ("const", "model", "websocket_api"):
        qualified_name = f"{package_name}.{module_name}"
        spec = importlib.util.spec_from_file_location(
            qualified_name, integration_dir / f"{module_name}.py"
        )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        sys.modules[qualified_name] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{package_name}.websocket_api"]


websocket_api = _load_websocket_api_module()


class _Connection:
    def __init__(self) -> None:
        self.result = None
        self.error = None

    def send_result(self, message_id, result) -> None:
        self.result = (message_id, result)

    def send_error(self, message_id, code, message) -> None:
        self.error = (message_id, code, message)


class _FlowManager:
    def __init__(self, entry) -> None:
        self.entry = entry
        self.init = None

    async def async_init(self, domain, *, context, data):
        self.init = (domain, context, data)
        return {"result": self.entry}


class _ConfigEntries:
    def __init__(self, entry=None) -> None:
        self.entry = entry
        self.flow = _FlowManager(SimpleNamespace(entry_id="created"))
        self.update = None
        self.removed = None

    def async_get_entry(self, _entry_id):
        return self.entry

    def async_update_entry(self, entry, **changes) -> None:
        self.update = (entry, changes)

    async def async_reload(self, _entry_id):
        return True

    async def async_remove(self, entry_id):
        self.removed = entry_id
        return {"require_restart": False}


def _config(name="Gate"):
    return {"name": name, "url": "http://example.test/open"}


class WebsocketMutationTest(unittest.TestCase):
    def test_create_uses_config_flow_with_validated_defaults(self) -> None:
        entries = _ConfigEntries()
        connection = _Connection()

        asyncio.run(
            websocket_api.websocket_create_request(
                SimpleNamespace(config_entries=entries),
                connection,
                {"id": 1, "config": _config()},
            )
        )

        domain, context, data = entries.flow.init
        self.assertEqual(domain, "http_requests")
        self.assertEqual(context, {"source": "user"})
        self.assertEqual(data["method"], "GET")
        self.assertEqual(connection.result, (1, {"entry_id": "created"}))

    def test_update_stores_validated_options_and_reloads_entry(self) -> None:
        entry = SimpleNamespace(entry_id="one", domain="http_requests")
        entries = _ConfigEntries(entry)
        connection = _Connection()

        asyncio.run(
            websocket_api.websocket_update_request(
                SimpleNamespace(config_entries=entries),
                connection,
                {"id": 2, "entry_id": "one", "config": _config("Door")},
            )
        )

        updated_entry, changes = entries.update
        self.assertIs(updated_entry, entry)
        self.assertEqual(changes["title"], "Door")
        self.assertEqual(changes["options"]["response_limit"], 4096)
        self.assertEqual(connection.result, (2, {"entry_id": "one"}))

    def test_delete_returns_home_assistant_removal_result(self) -> None:
        entry = SimpleNamespace(entry_id="one", domain="http_requests")
        entries = _ConfigEntries(entry)
        connection = _Connection()

        asyncio.run(
            websocket_api.websocket_delete_request(
                SimpleNamespace(config_entries=entries),
                connection,
                {"id": 3, "entry_id": "one"},
            )
        )

        self.assertEqual(entries.removed, "one")
        self.assertEqual(connection.result, (3, {"require_restart": False}))

    def test_mutations_reject_an_entry_from_another_integration(self) -> None:
        entry = SimpleNamespace(entry_id="one", domain="other")
        entries = _ConfigEntries(entry)
        connection = _Connection()

        asyncio.run(
            websocket_api.websocket_update_request(
                SimpleNamespace(config_entries=entries),
                connection,
                {"id": 4, "entry_id": "one", "config": _config()},
            )
        )

        self.assertEqual(connection.error[:2], (4, "not_found"))
        self.assertIsNone(entries.update)


if __name__ == "__main__":
    unittest.main()
