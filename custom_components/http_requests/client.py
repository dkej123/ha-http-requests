"""Asynchronous HTTP request executor."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timezone
import logging
from time import monotonic
from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout

from .model import RequestConfig, RequestResult

_LOGGER = logging.getLogger(__name__)


class HttpRequestRuntime:
    """Execute one configured request and retain its latest result."""

    def __init__(self, session: ClientSession, config: RequestConfig) -> None:
        self.session = session
        self.config = config
        self.result: RequestResult | None = None
        self._lock = asyncio.Lock()
        self._listeners: set[Callable[[], None]] = set()

    def add_listener(self, listener: Callable[[], None]) -> Callable[[], None]:
        """Subscribe to result updates."""
        self._listeners.add(listener)

        def remove_listener() -> None:
            self._listeners.discard(listener)

        return remove_listener

    async def async_execute(self) -> RequestResult:
        """Execute the request and notify entities with the result."""
        async with self._lock:
            started = monotonic()
            try:
                timeout = ClientTimeout(total=self.config.timeout)
                body = self.config.body if self.config.body else None
                async with self.session.request(
                    self.config.method,
                    self.config.url,
                    headers=self.config.headers,
                    data=body,
                    timeout=timeout,
                    ssl=self.config.verify_ssl,
                    allow_redirects=self.config.follow_redirects,
                ) as response:
                    payload, truncated = await _async_read_limited(
                        response.content, self.config.response_limit
                    )
                    encoding = response.charset or "utf-8"
                    try:
                        response_body = payload.decode(encoding, errors="replace")
                    except LookupError:
                        response_body = payload.decode("utf-8", errors="replace")

                    self.result = RequestResult(
                        timestamp=datetime.now(timezone.utc),
                        elapsed_ms=_elapsed_ms(started),
                        status=response.status,
                        reason=response.reason,
                        content_type=response.headers.get("Content-Type"),
                        body=response_body,
                        truncated=truncated,
                    )
            except asyncio.TimeoutError:
                self.result = RequestResult.failure("timeout", _elapsed_ms(started))
            except ClientError as err:
                _LOGGER.debug(
                    "HTTP request %s failed: %s",
                    self.config.name,
                    type(err).__name__,
                )
                self.result = RequestResult.failure(
                    type(err).__name__, _elapsed_ms(started)
                )
            except Exception as err:  # Defensive boundary for transport failures.
                _LOGGER.debug(
                    "HTTP request %s failed unexpectedly: %s",
                    self.config.name,
                    type(err).__name__,
                )
                self.result = RequestResult.failure(
                    type(err).__name__, _elapsed_ms(started)
                )

            for listener in tuple(self._listeners):
                listener()
            return self.result


async def _async_read_limited(stream: Any, limit: int) -> tuple[bytes, bool]:
    """Read at most limit + 1 bytes without buffering a huge response."""
    payload = bytearray()
    while len(payload) <= limit:
        chunk = await stream.read(limit + 1 - len(payload))
        if not chunk:
            break
        payload.extend(chunk)
    truncated = len(payload) > limit
    return bytes(payload[:limit]), truncated


def _elapsed_ms(started: float) -> int:
    return round((monotonic() - started) * 1000)
