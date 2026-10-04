"""Registry migration from execution buttons to actions."""

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN


@callback
def async_remove_legacy_buttons(hass: HomeAssistant, entry_id: str) -> None:
    """Remove only this request's obsolete button entities, preserving sensors."""
    registry = er.async_get(hass)
    for entity in er.async_entries_for_config_entry(registry, entry_id):
        if entity.platform == DOMAIN and entity.domain == "button":
            registry.async_remove(entity.entity_id)
