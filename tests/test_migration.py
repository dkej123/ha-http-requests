"""Registry cleanup must preserve sensors and unrelated buttons."""
import importlib.util
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch


class MigrationTest(unittest.TestCase):
    def test_only_own_entry_buttons_are_removed_and_repeat_is_safe(self):
        root = Path(__file__).parents[1] / 'custom_components/http_requests'
        package = ModuleType('http_requests_migration_test')
        package.__path__ = [str(root)]
        core = ModuleType('homeassistant.core')
        core.HomeAssistant = object
        core.callback = lambda fn: fn
        helpers = ModuleType('homeassistant.helpers')
        registry = Mock()
        entities = [
            SimpleNamespace(platform='http_requests', domain='button', entity_id='button.old'),
            SimpleNamespace(platform='http_requests', domain='sensor', entity_id='sensor.response'),
            SimpleNamespace(platform='other', domain='button', entity_id='button.other'),
        ]
        helpers.entity_registry = SimpleNamespace(
            async_get=Mock(return_value=registry),
            async_entries_for_config_entry=Mock(return_value=entities),
        )
        with patch.dict(sys.modules, {
            package.__name__: package, 'homeassistant': ModuleType('homeassistant'),
            'homeassistant.core': core, 'homeassistant.helpers': helpers,
        }):
            spec = importlib.util.spec_from_file_location(package.__name__ + '.migration', root / 'migration.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.async_remove_legacy_buttons(object(), 'request-one')
            helpers.entity_registry.async_entries_for_config_entry.assert_called_once_with(registry, 'request-one')
            registry.async_remove.assert_called_once_with('button.old')
            registry.async_remove.reset_mock()
            helpers.entity_registry.async_entries_for_config_entry.return_value = entities[1:]
            module.async_remove_legacy_buttons(object(), 'request-one')
            registry.async_remove.assert_not_called()
