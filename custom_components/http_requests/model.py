"""Pure data and validation helpers for HTTP Requests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from typing import Any
from urllib.parse import urlsplit

from .const import (
    CONF_BODY,
    CONF_CONTENT_TYPE,
    CONF_FOLLOW_REDIRECTS,
    CONF_HEADERS,
    CONF_METHOD,
    CONF_NAME,
    CONF_PAYLOAD,
    CONF_RESPONSE_LIMIT,
    CONF_TIMEOUT,
    CONF_URL,
    CONF_VERIFY_SSL,
    CONF_YAML_KEY,
    DEFAULT_FOLLOW_REDIRECTS,
    DEFAULT_METHOD,
    DEFAULT_RESPONSE_LIMIT,
    DEFAULT_TIMEOUT,
    DEFAULT_VERIFY_SSL,
    MAX_RESPONSE_LIMIT,
    MAX_TIMEOUT,
    MIN_RESPONSE_LIMIT,
    MIN_TIMEOUT,
    SUPPORTED_METHODS,
)


class RequestConfigurationError(ValueError):
    """Raised when request configuration is invalid."""


@dataclass(frozen=True)
class RequestConfig:
    """Validated request configuration."""

    name: str
    url: str
    method: str
    headers: dict[str, str]
    body: str
    timeout: int
    verify_ssl: bool
    follow_redirects: bool
    response_limit: int

    def as_dict(self) -> dict[str, Any]:
        """Serialize validated configuration for storage or the panel."""
        return {
            CONF_NAME: self.name,
            CONF_URL: self.url,
            CONF_METHOD: self.method,
            CONF_HEADERS: self.headers,
            CONF_BODY: self.body,
            CONF_TIMEOUT: self.timeout,
            CONF_RESPONSE_LIMIT: self.response_limit,
            CONF_VERIFY_SSL: self.verify_ssl,
            CONF_FOLLOW_REDIRECTS: self.follow_redirects,
        }

    @classmethod
    def from_mapping(cls, values: dict[str, Any]) -> "RequestConfig":
        """Create a validated request configuration from stored values."""
        name = str(values.get(CONF_NAME, "")).strip()
        if not name:
            raise RequestConfigurationError("name")

        url = str(values.get(CONF_URL, "")).strip()
        validate_url(url)

        method = str(values.get(CONF_METHOD, DEFAULT_METHOD)).upper()
        if method not in SUPPORTED_METHODS:
            raise RequestConfigurationError("method")

        headers = validate_headers(values.get(CONF_HEADERS, {}))
        body = str(values.get(CONF_BODY, ""))

        try:
            timeout = int(values.get(CONF_TIMEOUT, DEFAULT_TIMEOUT))
        except (TypeError, ValueError) as err:
            raise RequestConfigurationError("timeout") from err
        if not MIN_TIMEOUT <= timeout <= MAX_TIMEOUT:
            raise RequestConfigurationError("timeout")

        try:
            response_limit = int(
                values.get(CONF_RESPONSE_LIMIT, DEFAULT_RESPONSE_LIMIT)
            )
        except (TypeError, ValueError) as err:
            raise RequestConfigurationError("response_limit") from err
        if not MIN_RESPONSE_LIMIT <= response_limit <= MAX_RESPONSE_LIMIT:
            raise RequestConfigurationError("response_limit")

        return cls(
            name=name,
            url=url,
            method=method,
            headers=headers,
            body=body,
            timeout=timeout,
            verify_ssl=bool(values.get(CONF_VERIFY_SSL, DEFAULT_VERIFY_SSL)),
            follow_redirects=bool(
                values.get(CONF_FOLLOW_REDIRECTS, DEFAULT_FOLLOW_REDIRECTS)
            ),
            response_limit=response_limit,
        )


@dataclass(frozen=True)
class RequestResult:
    """Result exposed by the response sensor."""

    timestamp: datetime
    elapsed_ms: int
    status: int | None = None
    reason: str | None = None
    content_type: str | None = None
    body: str = ""
    truncated: bool = False
    error: str | None = None

    @property
    def state(self) -> int | str:
        """Return the compact sensor state."""
        return self.status if self.status is not None else "error"

    def formatted_body(self, limit: int | None = None) -> str:
        """Return indented JSON when possible, otherwise unchanged text."""
        formatted = self.body
        try:
            parsed = json.loads(self.body)
        except (json.JSONDecodeError, TypeError):
            pass
        else:
            if isinstance(parsed, (dict, list)):
                formatted = json.dumps(parsed, ensure_ascii=False, indent=2)
        return formatted[:limit] if limit is not None else formatted

    def formatted_response(self, body_limit: int | None = None) -> str:
        """Build human-readable response details for the entity dialog."""
        if self.status is None:
            first_line = "Status: Error"
        else:
            reason = f" {self.reason}" if self.reason else ""
            first_line = f"Status: {self.status}{reason}"

        lines = [
            first_line,
            f"Content-Type: {self.content_type or '-'}",
            f"Duration: {self.elapsed_ms} ms",
            f"Received: {self.timestamp.isoformat()}",
        ]
        if self.error:
            lines.append(f"Error: {self.error}")
        lines.extend(("", "Body:", self.formatted_body(body_limit)))
        if self.truncated:
            lines.append("[response truncated]")
        return "\n".join(lines)

    def as_dict(self) -> dict[str, Any]:
        """Serialize the result for the administrator panel."""
        return {
            "status": self.status,
            "reason": self.reason,
            "content_type": self.content_type,
            "body": self.body,
            "formatted_body": self.formatted_body(),
            "elapsed_ms": self.elapsed_ms,
            "timestamp": self.timestamp.isoformat(),
            "truncated": self.truncated,
            "error": self.error,
        }

    @classmethod
    def failure(cls, error: str, elapsed_ms: int) -> "RequestResult":
        """Build a failed result without exposing exception details."""
        return cls(
            timestamp=datetime.now(timezone.utc),
            elapsed_ms=elapsed_ms,
            error=error,
        )


def validate_url(value: str) -> None:
    """Validate an absolute HTTP(S) URL."""
    try:
        parsed = urlsplit(value)
        _ = parsed.port
    except ValueError as err:
        raise RequestConfigurationError("url") from err
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise RequestConfigurationError("url")


def validate_headers(value: Any) -> dict[str, str]:
    """Validate and normalize HTTP headers from an object selector."""
    if value in (None, ""):
        return {}
    if not isinstance(value, dict):
        raise RequestConfigurationError("headers")

    headers: dict[str, str] = {}
    for raw_name, raw_value in value.items():
        name = str(raw_name).strip()
        if not name or "\n" in name or "\r" in name:
            raise RequestConfigurationError("headers")
        if not isinstance(raw_value, (str, int, float, bool)):
            raise RequestConfigurationError("headers")
        header_value = str(raw_value)
        if "\n" in header_value or "\r" in header_value:
            raise RequestConfigurationError("headers")
        headers[name] = header_value
    return headers


def normalize_yaml_command(yaml_key: str, values: dict[str, Any]) -> dict[str, Any]:
    """Convert rest_command-style YAML fields to the config-entry model."""
    normalized = dict(values)
    normalized[CONF_YAML_KEY] = yaml_key
    normalized[CONF_NAME] = yaml_key.replace("_", " ").strip().title()
    normalized[CONF_BODY] = normalized.pop(CONF_PAYLOAD, normalized.get(CONF_BODY, ""))

    headers = validate_headers(normalized.get(CONF_HEADERS, {}))
    content_type = normalized.pop(CONF_CONTENT_TYPE, None)
    if content_type is not None and not any(
        name.lower() == "content-type" for name in headers
    ):
        headers["Content-Type"] = str(content_type)
    normalized[CONF_HEADERS] = headers
    return normalized
