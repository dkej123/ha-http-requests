"""Shared HTTP Requests entity."""

from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity import Entity

from . import HttpRequestsConfigEntry
from .const import CONF_COMMAND_ID, DOMAIN


class HttpRequestEntity(Entity):
    """Base entity for a configured HTTP request."""

    _attr_has_entity_name = True

    def __init__(self, entry: HttpRequestsConfigEntry, suffix: str) -> None:
        runtime = entry.runtime_data
        command_id = entry.data[CONF_COMMAND_ID]
        self.runtime = runtime
        self._attr_unique_id = f"{command_id}_{suffix}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, command_id)},
            name=runtime.config.name,
            manufacturer="HTTP Requests",
            model=f"{runtime.config.method} request",
            configuration_url=runtime.config.url,
        )
