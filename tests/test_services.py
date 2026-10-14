"""Action contract tests without requiring a Home Assistant installation."""

from __future__ import annotations

import importlib.util
from datetime import datetime, timezone
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import AsyncMock, Mock, patch


def _load():
    root = Path(__file__).parents[1] / 'custom_components/http_requests'
    package = ModuleType('http_requests_services_test')
    package.__path__ = [str(root)]
    modules = {package.__name__: package}
    for name in ('voluptuous', 'homeassistant', 'homeassistant.core',
                 'homeassistant.config_entries', 'homeassistant.exceptions',
                 'homeassistant.helpers', 'homeassistant.helpers.config_validation'):
        modules[name] = ModuleType(name)
    vol = modules['voluptuous']
    vol.Schema = lambda value: value
    vol.Required = lambda value: value
    vol.Optional = lambda value: value
    core = modules['homeassistant.core']
    core.HomeAssistant = core.ServiceCall = core.ServiceResponse = object
    core.callback = lambda fn: fn
    core.SupportsResponse = SimpleNamespace(OPTIONAL='optional')
    modules['homeassistant.config_entries'].ConfigEntryState = SimpleNamespace(LOADED='loaded')

    class HAError(Exception):
        def __init__(self, **kwargs):
            self.translation_key = kwargs['translation_key']
            super().__init__(self.translation_key)

    exceptions = modules['homeassistant.exceptions']
    exceptions.HomeAssistantError = HAError
    exceptions.ServiceValidationError = type('ValidationError', (HAError,), {})
    modules['homeassistant.helpers.config_validation'].string = str
    with patch.dict(sys.modules, modules):
        loaded = {}
        for name in ('const', 'model', 'services'):
            qualified = f'{package.__name__}.{name}'
            spec = importlib.util.spec_from_file_location(qualified, root / f'{name}.py')
            module = importlib.util.module_from_spec(spec)
            sys.modules[qualified] = module
            spec.loader.exec_module(module)
            loaded[name] = module
    return loaded['services'], loaded['model'], HAError


services, model, HAError = _load()


class ActionTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.result = model.RequestResult(
            timestamp=datetime.now(timezone.utc), elapsed_ms=15,
            status=200, body='{"ok": true}', content_type='application/json',
        )
        self.runtime = SimpleNamespace(async_execute=AsyncMock(return_value=self.result))
        self.entry = SimpleNamespace(domain='http_requests', state='loaded', runtime_data=self.runtime)
        self.hass = SimpleNamespace(
            config_entries=SimpleNamespace(async_get_entry=Mock(return_value=self.entry)),
            services=SimpleNamespace(async_register=Mock()),
        )
        services.async_register_services(self.hass)
        self.handler = self.hass.services.async_register.call_args.args[2]

    async def call(self, response=True):
        return await self.handler(SimpleNamespace(
            data={'config_entry_id': 'request-one'}, return_response=response,
        ))

    async def test_registration_supports_optional_response_and_requires_request(self):
        call = self.hass.services.async_register.call_args
        self.assertEqual(call.args[:2], ('http_requests', 'execute'))
        self.assertEqual(call.kwargs['supports_response'], 'optional')
        self.assertEqual(set(call.kwargs['schema']), {'config_entry_id', 'variables'})
        self.hass.config_entries.async_get_entry.assert_not_called()

    async def test_returns_execution_json_and_updates_via_shared_executor(self):
        result = await self.call()
        self.assertEqual(result['content'], {'ok': True})
        self.assertEqual(result['body'], self.result.body)
        self.assertEqual(result['status'], 200)
        self.runtime.async_execute.assert_awaited_once_with({})
        self.hass.config_entries.async_get_entry.assert_called_once_with('request-one')

    async def test_variables_reach_the_request(self):
        await self.handler(SimpleNamespace(
            data={'config_entry_id': 'request-one', 'variables': {'document': 'ee5888'}},
            return_response=True,
        ))
        self.runtime.async_execute.assert_awaited_once_with({'document': 'ee5888'})

    async def test_executes_without_response_variable(self):
        self.assertIsNone(await self.call(False))
        self.runtime.async_execute.assert_awaited_once()

    async def test_unknown_and_foreign_entries_do_not_execute(self):
        for entry in (None, SimpleNamespace(domain='other')):
            self.hass.config_entries.async_get_entry.return_value = entry
            with self.assertRaisesRegex(HAError, 'request_not_found'):
                await self.call()
        self.runtime.async_execute.assert_not_awaited()

    async def test_unloaded_entries_do_not_execute_even_with_stale_runtime(self):
        for state in ('not_loaded', 'setup_error', 'unload_in_progress'):
            self.entry.state = state
            with self.assertRaisesRegex(HAError, 'request_not_loaded'):
                await self.call()
        self.runtime.async_execute.assert_not_awaited()

    async def test_transport_failure_raises_with_or_without_response(self):
        self.runtime.async_execute.return_value = model.RequestResult.failure('timeout', 1000)
        for response in (True, False):
            with self.assertRaisesRegex(HAError, 'request_failed'):
                await self.call(response)

    async def test_http_failure_is_a_response_for_automation_to_handle(self):
        self.runtime.async_execute.return_value = model.RequestResult(
            timestamp=self.result.timestamp, elapsed_ms=5, status=404, body='Not found',
        )
        result = await self.call()
        self.assertEqual(result['status'], 404)
        self.assertEqual(result['content'], 'Not found')

    async def test_response_belongs_to_call_even_if_next_run_updates_runtime(self):
        self.runtime.result = model.RequestResult.failure('another run', 0)
        result = await self.call()
        self.assertEqual(result['status'], 200)


class ResponseTest(unittest.TestCase):
    def test_json_text_and_truncation(self):
        for body, truncated, content in (
            ('[1, 2]', False, [1, 2]),
            ('null', False, None),
            ('plain text', False, 'plain text'),
            ('{"broken":', False, '{"broken":'),
            ('123', True, '123'),
            ('NaN', False, 'NaN'),
        ):
            with self.subTest(body=body, truncated=truncated):
                result = model.RequestResult(
                    timestamp=datetime.now(timezone.utc), elapsed_ms=1,
                    status=200, body=body, truncated=truncated,
                ).as_action_response()
                self.assertEqual(result['content'], content)
                self.assertEqual(result['body'], body)
                self.assertEqual(result['truncated'], truncated)


if __name__ == '__main__':
    unittest.main()
