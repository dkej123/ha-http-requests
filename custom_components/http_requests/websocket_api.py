"""Administrator-only WebSocket API for the HTTP Requests panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry, ConfigEntryState, SOURCE_USER
from homeassistant.core import HomeAssistant, callback

from .const import (
    CONF_BODY,
    CONF_FOLLOW_REDIRECTS,
    CONF_HEADERS,
    CONF_METHOD,
    CONF_NAME,
    CONF_RESPONSE_LIMIT,
    CONF_SECTION,
    CONF_TIMEOUT,
    CONF_URL,
    CONF_VERIFY_SSL,
    CONF_YAML_KEY,
    DOMAIN,
)
from .model import RequestConfig, RequestConfigurationError


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register panel API commands once during integration setup."""
    websocket_api.async_register_command(hass, websocket_list_requests)
    websocket_api.async_register_command(hass, websocket_run_request)
    websocket_api.async_register_command(hass, websocket_create_request)
    websocket_api.async_register_command(hass, websocket_update_request)
    websocket_api.async_register_command(hass, websocket_delete_request)


def _get_entry(hass: HomeAssistant, entry_id: str) -> ConfigEntry[Any] | None:
    """Return an HTTP Requests config entry, if it exists."""
    entry = hass.config_entries.async_get_entry(entry_id)
    return entry if entry is not None and entry.domain == DOMAIN else None


def _validated_config(
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> dict[str, Any] | None:
    """Validate panel form data and report a field-specific error."""
    try:
        return RequestConfig.from_mapping(msg["config"]).as_dict()
    except RequestConfigurationError as err:
        connection.send_error(
            msg["id"], "invalid_config", f"Invalid field: {err}"
        )
        return None


@websocket_api.require_admin
@websocket_api.websocket_command(
    {vol.Required("type"): "http_requests/list"}
)
@callback
def websocket_list_requests(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return all configured requests and their latest in-memory result."""
    requests = []
    for entry in hass.config_entries.async_entries(DOMAIN):
        values = dict(entry.data)
        values.update(entry.options)
        runtime = getattr(entry, "runtime_data", None)
        result = runtime.result.as_dict() if runtime and runtime.result else None
        requests.append(
            {
                "entry_id": entry.entry_id,
                "loaded": entry.state is ConfigEntryState.LOADED,
                "source": "yaml" if CONF_YAML_KEY in entry.data else "ui",
                "config": {
                    CONF_NAME: values.get(CONF_NAME, entry.title),
                    CONF_SECTION: values.get(CONF_SECTION, ""),
                    CONF_URL: values.get(CONF_URL, ""),
                    CONF_METHOD: values.get(CONF_METHOD, "GET"),
                    CONF_HEADERS: values.get(CONF_HEADERS, {}),
                    CONF_BODY: values.get(CONF_BODY, ""),
                    CONF_TIMEOUT: values.get(CONF_TIMEOUT),
                    CONF_RESPONSE_LIMIT: values.get(CONF_RESPONSE_LIMIT),
                    CONF_VERIFY_SSL: values.get(CONF_VERIFY_SSL),
                    CONF_FOLLOW_REDIRECTS: values.get(CONF_FOLLOW_REDIRECTS),
                },
                "result": result,
            }
        )
    connection.send_result(msg["id"], {"requests": requests})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "http_requests/run",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def websocket_run_request(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Execute one loaded request and return its complete bounded result."""
    entry = _get_entry(hass, msg["entry_id"])
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Request not found")
        return
    if entry.state is not ConfigEntryState.LOADED:
        connection.send_error(msg["id"], "not_loaded", "Request is not loaded")
        return

    result = await entry.runtime_data.async_execute()
    connection.send_result(msg["id"], result.as_dict())


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "http_requests/create",
        vol.Required("config"): dict,
    }
)
@websocket_api.async_response
async def websocket_create_request(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create and set up a request through its normal config flow."""
    if (config := _validated_config(connection, msg)) is None:
        return
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": SOURCE_USER},
        data=config,
    )
    entry = result.get("result")
    if entry is None:
        connection.send_error(msg["id"], "create_failed", "Could not create request")
        return
    connection.send_result(msg["id"], {"entry_id": entry.entry_id})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "http_requests/update",
        vol.Required("entry_id"): str,
        vol.Required("config"): dict,
    }
)
@websocket_api.async_response
async def websocket_update_request(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Update a request and reload only its config entry."""
    entry = _get_entry(hass, msg["entry_id"])
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Request not found")
        return
    if (config := _validated_config(connection, msg)) is None:
        return
    hass.config_entries.async_update_entry(
        entry,
        title=config[CONF_NAME],
        options=config,
    )
    loaded = await hass.config_entries.async_reload(entry.entry_id)
    if not loaded:
        connection.send_error(msg["id"], "reload_failed", "Request reload failed")
        return
    connection.send_result(msg["id"], {"entry_id": entry.entry_id})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): "http_requests/delete",
        vol.Required("entry_id"): str,
    }
)
@websocket_api.async_response
async def websocket_delete_request(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Unload and remove a request config entry."""
    entry = _get_entry(hass, msg["entry_id"])
    if entry is None:
        connection.send_error(msg["id"], "not_found", "Request not found")
        return
    result = await hass.config_entries.async_remove(entry.entry_id)
    connection.send_result(msg["id"], result)
