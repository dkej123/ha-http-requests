"""Administrator-only WebSocket API for the HTTP Requests panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback

from .const import (
    CONF_BODY,
    CONF_FOLLOW_REDIRECTS,
    CONF_HEADERS,
    CONF_METHOD,
    CONF_NAME,
    CONF_RESPONSE_LIMIT,
    CONF_TIMEOUT,
    CONF_URL,
    CONF_VERIFY_SSL,
    CONF_YAML_KEY,
    DOMAIN,
)


@callback
def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Register panel API commands once during integration setup."""
    websocket_api.async_register_command(hass, websocket_list_requests)
    websocket_api.async_register_command(hass, websocket_run_request)


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
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if entry is None or entry.domain != DOMAIN:
        connection.send_error(msg["id"], "not_found", "Request not found")
        return
    if entry.state is not ConfigEntryState.LOADED:
        connection.send_error(msg["id"], "not_loaded", "Request is not loaded")
        return

    result = await entry.runtime_data.async_execute()
    connection.send_result(msg["id"], result.as_dict())
