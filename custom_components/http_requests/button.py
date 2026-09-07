"""Execution button for HTTP Requests."""

from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from . import HttpRequestsConfigEntry
from .entity import HttpRequestEntity


async def async_setup_entry(
    hass: HomeAssistant,
    entry: HttpRequestsConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Add the execution button."""
    async_add_entities([HttpRequestButton(entry)])


class HttpRequestButton(HttpRequestEntity, ButtonEntity):
    """Run the configured HTTP request."""

    _attr_translation_key = "execute"
    _attr_icon = "mdi:web"

    def __init__(self, entry: HttpRequestsConfigEntry) -> None:
        super().__init__(entry, "execute")

    async def async_press(self) -> None:
        """Execute the configured request."""
        result = await self.runtime.async_execute()
        if result.error:
            raise HomeAssistantError(
                translation_domain="http_requests",
                translation_key="request_failed",
                translation_placeholders={"error": result.error},
            )
