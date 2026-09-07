"""Tests for request configuration and response models."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest


def _load_pure_modules():
    """Load pure modules without requiring a Home Assistant installation."""
    integration_dir = (
        Path(__file__).parents[1] / "custom_components" / "http_requests"
    )
    package_name = "http_requests_test_package"
    package = ModuleType(package_name)
    package.__path__ = [str(integration_dir)]
    sys.modules[package_name] = package

    for module_name in ("const", "model"):
        qualified_name = f"{package_name}.{module_name}"
        spec = importlib.util.spec_from_file_location(
            qualified_name, integration_dir / f"{module_name}.py"
        )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        sys.modules[qualified_name] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{package_name}.model"]


model = _load_pure_modules()
RequestConfig = model.RequestConfig
RequestConfigurationError = model.RequestConfigurationError
RequestResult = model.RequestResult
normalize_yaml_command = model.normalize_yaml_command


class RequestConfigTest(unittest.TestCase):
    def test_minimal_get_uses_safe_defaults(self) -> None:
        config = RequestConfig.from_mapping(
            {"name": " Gate ", "url": "http://192.168.1.2/open"}
        )

        self.assertEqual(config.name, "Gate")
        self.assertEqual(config.method, "GET")
        self.assertEqual(config.headers, {})
        self.assertEqual(config.body, "")
        self.assertEqual(config.timeout, 10)
        self.assertEqual(config.response_limit, 4096)
        self.assertTrue(config.verify_ssl)
        self.assertTrue(config.follow_redirects)

    def test_post_preserves_static_body_and_normalizes_headers(self) -> None:
        config = RequestConfig.from_mapping(
            {
                "name": "Backup",
                "url": "https://example.test/run",
                "method": "post",
                "headers": {"Content-Type": "application/json", "X-Retry": 2},
                "body": '{"run":true}',
            }
        )

        self.assertEqual(config.method, "POST")
        self.assertEqual(config.headers["X-Retry"], "2")
        self.assertEqual(config.body, '{"run":true}')

    def test_rejects_non_http_and_relative_urls(self) -> None:
        for url in ("/run", "ftp://example.test/file", "http://"):
            with self.subTest(url=url), self.assertRaises(RequestConfigurationError):
                RequestConfig.from_mapping({"name": "Test", "url": url})

    def test_rejects_nested_or_injected_headers(self) -> None:
        invalid_headers = (
            {"Authorization": {"token": "secret"}},
            {"Bad\nHeader": "value"},
            {"Header": "bad\r\nvalue"},
        )
        for headers in invalid_headers:
            with self.subTest(headers=headers), self.assertRaises(
                RequestConfigurationError
            ):
                RequestConfig.from_mapping(
                    {"name": "Test", "url": "http://example.test", "headers": headers}
                )

    def test_enforces_timeout_and_response_limits(self) -> None:
        for field, value in (("timeout", 0), ("timeout", 301), ("response_limit", 255), ("response_limit", 65537)):
            with self.subTest(field=field, value=value), self.assertRaises(
                RequestConfigurationError
            ):
                RequestConfig.from_mapping(
                    {"name": "Test", "url": "http://example.test", field: value}
                )


class RequestResultTest(unittest.TestCase):
    def test_http_status_is_sensor_state(self) -> None:
        result = RequestResult(
            timestamp=datetime.now(timezone.utc), elapsed_ms=12, status=204
        )
        self.assertEqual(result.state, 204)

    def test_transport_failure_uses_error_state(self) -> None:
        result = RequestResult.failure("timeout", 1000)
        self.assertEqual(result.state, "error")
        self.assertEqual(result.error, "timeout")

    def test_json_response_is_pretty_printed_for_dialog(self) -> None:
        result = RequestResult(
            timestamp=datetime(2026, 9, 7, tzinfo=timezone.utc),
            elapsed_ms=42,
            status=200,
            reason="OK",
            content_type="application/json",
            body='{"status":"done","items":[1,2]}',
        )

        self.assertEqual(
            result.formatted_body(),
            '{\n  "status": "done",\n  "items": [\n    1,\n    2\n  ]\n}',
        )
        details = result.formatted_response()
        self.assertIn("Status: 200 OK", details)
        self.assertIn("Duration: 42 ms", details)
        self.assertIn('  "status": "done"', details)

    def test_plain_text_response_is_not_changed(self) -> None:
        result = RequestResult(
            timestamp=datetime.now(timezone.utc),
            elapsed_ms=1,
            status=200,
            body="plain response",
        )

        self.assertEqual(result.formatted_body(), "plain response")


class YamlCompatibilityTest(unittest.TestCase):
    def test_rest_command_payload_and_content_type_are_mapped(self) -> None:
        values = normalize_yaml_command(
            "gdrive_run",
            {
                "url": "http://example.test/run",
                "method": "POST",
                "payload": '{"run":true}',
                "content_type": "application/json",
            },
        )
        config = RequestConfig.from_mapping(values)

        self.assertEqual(config.name, "Gdrive Run")
        self.assertEqual(config.body, '{"run":true}')
        self.assertEqual(config.headers["Content-Type"], "application/json")

    def test_explicit_content_type_header_takes_precedence(self) -> None:
        values = normalize_yaml_command(
            "example",
            {
                "url": "http://example.test/run",
                "headers": {"content-type": "text/plain"},
                "content_type": "application/json",
            },
        )

        self.assertEqual(values["headers"], {"content-type": "text/plain"})


if __name__ == "__main__":
    unittest.main()
