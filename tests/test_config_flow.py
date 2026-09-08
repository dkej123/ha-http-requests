"""Tests for config-flow storage behavior."""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest


def _load_config_flow_module():
    """Load the config flow with small Home Assistant API stubs."""
    integration_dir = (
        Path(__file__).parents[1] / "custom_components" / "http_requests"
    )
    package_name = "http_requests_config_flow_test_package"
    package = ModuleType(package_name)
    package.__path__ = [str(integration_dir)]
    sys.modules[package_name] = package

    voluptuous = ModuleType("voluptuous")
    voluptuous.Schema = object
    sys.modules["voluptuous"] = voluptuous

    homeassistant = ModuleType("homeassistant")
    config_entries = ModuleType("homeassistant.config_entries")
    core = ModuleType("homeassistant.core")
    helpers = ModuleType("homeassistant.helpers")
    selector = ModuleType("homeassistant.helpers.selector")

    class ConfigEntry:
        @classmethod
        def __class_getitem__(cls, _item):
            return cls

    class ConfigFlow:
        def __init_subclass__(cls, **_kwargs):
            return super().__init_subclass__()

    config_entries.ConfigEntry = ConfigEntry
    config_entries.ConfigFlow = ConfigFlow
    config_entries.ConfigFlowResult = dict
    config_entries.OptionsFlowWithReload = type("OptionsFlowWithReload", (), {})
    core.callback = lambda function: function
    helpers.selector = selector

    sys.modules["homeassistant"] = homeassistant
    sys.modules["homeassistant.config_entries"] = config_entries
    sys.modules["homeassistant.core"] = core
    sys.modules["homeassistant.helpers"] = helpers
    sys.modules["homeassistant.helpers.selector"] = selector

    for module_name in ("const", "model", "config_flow"):
        qualified_name = f"{package_name}.{module_name}"
        spec = importlib.util.spec_from_file_location(
            qualified_name, integration_dir / f"{module_name}.py"
        )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        sys.modules[qualified_name] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{package_name}.config_flow"]


config_flow = _load_config_flow_module()


class _AbortFlow(Exception):
    """Stand in for Home Assistant aborting an existing import flow."""


class _FakeConfigEntries:
    def __init__(self) -> None:
        self.update = None

    def async_update_entry(self, entry, **changes) -> None:
        self.update = (entry, changes)


class YamlImportTest(unittest.TestCase):
    def test_reimport_clears_panel_or_options_flow_overrides(self) -> None:
        flow = config_flow.HttpRequestsConfigFlow()
        existing_entry = SimpleNamespace(options={"url": "http://panel.test"})
        config_entries = _FakeConfigEntries()
        flow.hass = SimpleNamespace(config_entries=config_entries)
        aborted_with = None

        async def async_set_unique_id(_command_id):
            return existing_entry

        def abort_if_configured(*, updates):
            nonlocal aborted_with
            aborted_with = updates
            raise _AbortFlow

        flow.async_set_unique_id = async_set_unique_id
        flow._abort_if_unique_id_configured = abort_if_configured

        with self.assertRaises(_AbortFlow):
            asyncio.run(
                flow.async_step_import(
                    {
                        "yaml_key": "gate",
                        "url": "http://yaml.test/open",
                    }
                )
            )

        self.assertIsNotNone(config_entries.update)
        entry, changes = config_entries.update
        self.assertIs(entry, existing_entry)
        self.assertEqual(changes["title"], "Gate")
        self.assertEqual(changes["options"], {})
        self.assertEqual(aborted_with["url"], "http://yaml.test/open")
        self.assertEqual(aborted_with["yaml_key"], "gate")
        self.assertEqual(aborted_with["section"], "")


if __name__ == "__main__":
    unittest.main()
