"""Latest response sensor for HTTP Requests."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import HttpRequestsConfigEntry
from .entity import HttpRequestEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HttpRequestsConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add the latest response sensor."""
    async_add_entities([HttpResponseSensor(entry)])


class HttpResponseSensor(HttpRequestEntity, SensorEntity):
    """Expose the latest request result."""

    _attr_translation_key = "last_response"
    _attr_icon = "mdi:code-json"

    def __init__(self, entry: HttpRequestsConfigEntry) -> None:
        super().__init__(entry, "last_response")

    async def async_added_to_hass(self) -> None:
        """Subscribe to request results."""
        await super().async_added_to_hass()
        self.async_on_remove(self.runtime.add_listener(self._async_result_updated))

    @callback
    def _async_result_updated(self) -> None:
        self.async_write_ha_state()

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
