"""Latest response sensor for HTTP Requests."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import HttpRequestsConfigEntry
from .const import RESPONSE_PREVIEW_LENGTH
from .entity import HttpRequestEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HttpRequestsConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add status and response-body sensors."""
    async_add_entities(
        [HttpResponseStatusSensor(entry), HttpResponseBodySensor(entry)]
    )


class HttpResultSensor(HttpRequestEntity, SensorEntity):
    """Base sensor updated after each request."""

    _attr_force_update = True

    async def async_added_to_hass(self) -> None:
        """Subscribe to request results."""
        await super().async_added_to_hass()
        self.async_on_remove(self.runtime.add_listener(self._async_result_updated))

    @callback
    def _async_result_updated(self) -> None:
        self.async_write_ha_state()


class HttpResponseStatusSensor(HttpResultSensor):
    """Expose the latest HTTP status and response details."""

    _attr_translation_key = "last_response"
    _attr_icon = "mdi:web-check"

    def __init__(self, entry: HttpRequestsConfigEntry) -> None:
        super().__init__(entry, "last_response")

    @property
    def native_value(self) -> int | str | None:
        """Return the latest HTTP status or error marker."""
        result = self.runtime.result
        return result.state if result else None

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Return details and the bounded response body."""
        result = self.runtime.result
        if result is None:
            return {}
        return {
            "response_body": result.body,
            "content_type": result.content_type,
            "reason": result.reason,
            "elapsed_ms": result.elapsed_ms,
            "last_run": result.timestamp.isoformat(),
            "truncated": result.truncated,
            "error": result.error,
        }


class HttpResponseBodySensor(HttpResultSensor):
    """Show a short response-body preview on the device page."""

    _attr_translation_key = "response_body"
    _attr_icon = "mdi:text-box-outline"

    def __init__(self, entry: HttpRequestsConfigEntry) -> None:
        super().__init__(entry, "response_body")

    @property
    def native_value(self) -> str | None:
        """Return a preview that fits in a Home Assistant state."""
        result = self.runtime.result
        if result is None:
            return None
        return result.formatted_body(RESPONSE_PREVIEW_LENGTH)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        """Indicate whether the visible preview or response was truncated."""
        result = self.runtime.result
        if result is None:
            return {}
        return {
            "formatted_response": result.formatted_response(
                self.runtime.config.response_limit
            ),
            "preview_truncated": (
                len(result.formatted_body()) > RESPONSE_PREVIEW_LENGTH
            ),
            "response_truncated": result.truncated,
            "last_run": result.timestamp.isoformat(),
        }
