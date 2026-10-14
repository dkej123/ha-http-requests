"""Actions for executing saved HTTP requests."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN


@callback
def async_register_services(hass: HomeAssistant) -> None:
    """Register independently of whether any request entries are loaded."""

    async def async_execute(call: ServiceCall) -> ServiceResponse:
        entry = hass.config_entries.async_get_entry(call.data["config_entry_id"])
        if entry is None or entry.domain != DOMAIN:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="request_not_found"
            )
        if entry.state is not ConfigEntryState.LOADED:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="request_not_loaded"
            )

        result = await entry.runtime_data.async_execute(call.data.get("variables") or {})
        if result.error:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="request_failed",
                translation_placeholders={"error": result.error},
            )
        if call.return_response:
            return result.as_action_response()
        return None

    hass.services.async_register(
        DOMAIN,
        "execute",
        async_execute,
        schema=vol.Schema(
            {
                vol.Required("config_entry_id"): cv.string,
                # Values for {{ name }} placeholders in the saved request.
                vol.Optional("variables"): dict,
            }
        ),
        supports_response=SupportsResponse.OPTIONAL,
    )
