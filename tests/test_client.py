"""Tests for bounded response reading."""

from __future__ import annotations

import asyncio
import importlib.util
from pathlib import Path
import sys
from types import ModuleType
import unittest


def _load_client_module():
    integration_dir = (
        Path(__file__).parents[1] / "custom_components" / "http_requests"
    )
    package_name = "http_requests_client_test_package"
    package = ModuleType(package_name)
    package.__path__ = [str(integration_dir)]
    sys.modules[package_name] = package

    aiohttp = ModuleType("aiohttp")
    aiohttp.ClientError = type("ClientError", (Exception,), {})
    aiohttp.ClientSession = type("ClientSession", (), {})
    aiohttp.ClientTimeout = type("ClientTimeout", (), {})
    sys.modules["aiohttp"] = aiohttp

    for module_name in ("const", "model", "client"):
        qualified_name = f"{package_name}.{module_name}"
        spec = importlib.util.spec_from_file_location(
            qualified_name, integration_dir / f"{module_name}.py"
        )
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        sys.modules[qualified_name] = module
        spec.loader.exec_module(module)
    return sys.modules[f"{package_name}.client"]


client = _load_client_module()


class FakeStream:
    def __init__(self, payload: bytes, chunk_size: int) -> None:
        self.payload = payload
        self.chunk_size = chunk_size
        self.offset = 0
        self.bytes_returned = 0

    async def read(self, maximum: int) -> bytes:
        size = min(maximum, self.chunk_size)
        chunk = self.payload[self.offset : self.offset + size]
        self.offset += len(chunk)
        self.bytes_returned += len(chunk)
        return chunk


class BoundedReadTest(unittest.TestCase):
    def test_short_fragmented_response_is_complete(self) -> None:
        stream = FakeStream(b"hello", chunk_size=2)
        payload, truncated = asyncio.run(client._async_read_limited(stream, 10))

        self.assertEqual(payload, b"hello")
        self.assertFalse(truncated)

    def test_large_response_reads_only_one_byte_past_limit(self) -> None:
        stream = FakeStream(b"a" * 1000, chunk_size=3)
        payload, truncated = asyncio.run(client._async_read_limited(stream, 10))

        self.assertEqual(payload, b"a" * 10)
        self.assertTrue(truncated)
        self.assertEqual(stream.bytes_returned, 11)


if __name__ == "__main__":
    unittest.main()
