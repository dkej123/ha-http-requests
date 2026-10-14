"""Administrator-only actions for managing saved requests.

They mirror the panel's WebSocket commands so requests can also be created,
edited and removed from scripts or the Home Assistant API. Action data is
visible on the event bus, so secret header values belong in the panel; `update`
merges headers, which lets a caller change a request without knowing them.
"""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import SOURCE_USER, ConfigEntryState
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
    callback,
)
from homeassistant.exceptions import ServiceValidationError, Unauthorized
from homeassistant.helpers import config_validation as cv

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
from .model import RequestConfig, RequestConfigurationError, request_variables

CONFIG_FIELDS = (
    CONF_NAME,
    CONF_SECTION,
    CONF_URL,
    CONF_METHOD,
    CONF_HEADERS,
    CONF_BODY,
    CONF_TIMEOUT,
    CONF_RESPONSE_LIMIT,
    CONF_VERIFY_SSL,
    CONF_FOLLOW_REDIRECTS,
)
_FIELD_SCHEMA = {vol.Optional(field): object for field in CONFIG_FIELDS}


async def _async_require_admin(hass: HomeAssistant, call: ServiceCall) -> None:
    """Allow internal calls (no user) and administrators, like admin services."""
    user_id = call.context.user_id
    if user_id is None:
        return
    user = await hass.auth.async_get_user(user_id)
    if user is None or not user.is_admin:
        raise Unauthorized(context=call.context)


def _entry(hass: HomeAssistant, entry_id: str):
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        raise ServiceValidationError(
            translation_domain=DOMAIN, translation_key="request_not_found"
        )
    return entry


def _stored_values(entry) -> dict[str, Any]:
    values = dict(entry.data)
    values.update(entry.options)
    return values


def _validated(values: dict[str, Any]) -> dict[str, Any]:
    try:
        return RequestConfig.from_mapping(values).as_dict()
    except RequestConfigurationError as err:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="invalid_request",
            translation_placeholders={"field": str(err)},
        ) from err


def merge_update(current: dict[str, Any], changes: dict[str, Any]) -> dict[str, Any]:
    """Apply a partial update. Headers merge by name; a None value removes one."""
    merged = {field: current.get(field) for field in CONFIG_FIELDS if field in current}
    for field, value in changes.items():
        if field not in CONFIG_FIELDS:
            continue
        if field == CONF_HEADERS:
            headers = dict(merged.get(CONF_HEADERS) or {})
            for name, header_value in (value or {}).items():
                if header_value is None:
                    headers.pop(name, None)
                else:
                    headers[name] = header_value
            merged[CONF_HEADERS] = headers
        else:
            merged[field] = value
    return merged


def summary(entry) -> dict[str, Any]:
    """Describe a request without header values or body (may hold secrets)."""
    values = _stored_values(entry)
    try:
        variables = sorted(request_variables(RequestConfig.from_mapping(values)))
    except RequestConfigurationError:
        variables = []
    return {
        "entry_id": entry.entry_id,
        "name": values.get(CONF_NAME, entry.title),
        "section": values.get(CONF_SECTION, ""),
        "method": values.get(CONF_METHOD, "GET"),
        "url": values.get(CONF_URL, ""),
        "header_names": sorted((values.get(CONF_HEADERS) or {}).keys()),
        "has_body": bool(values.get(CONF_BODY)),
        "variables": variables,
        "source": "yaml" if CONF_YAML_KEY in entry.data else "ui",
        "loaded": entry.state is ConfigEntryState.LOADED,
    }


@callback
def async_register_management_services(hass: HomeAssistant) -> None:
    """Register create/update/delete/list actions (administrators only)."""

    async def async_create(call: ServiceCall) -> ServiceResponse:
        await _async_require_admin(hass, call)
        config = _validated({k: v for k, v in call.data.items() if k in CONFIG_FIELDS})
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": SOURCE_USER}, data=config
        )
        entry = result.get("result")
        if entry is None:
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="create_failed"
            )
        return {"entry_id": entry.entry_id}

    async def async_update(call: ServiceCall) -> ServiceResponse:
        await _async_require_admin(hass, call)
        entry = _entry(hass, call.data["config_entry_id"])
        changes = {k: v for k, v in call.data.items() if k in CONFIG_FIELDS}
        config = _validated(merge_update(_stored_values(entry), changes))
        hass.config_entries.async_update_entry(entry, title=config[CONF_NAME], options=config)
        if not await hass.config_entries.async_reload(entry.entry_id):
            raise ServiceValidationError(
                translation_domain=DOMAIN, translation_key="request_not_loaded"
            )
        return {"entry_id": entry.entry_id}

    async def async_delete(call: ServiceCall) -> ServiceResponse:
        await _async_require_admin(hass, call)
        entry = _entry(hass, call.data["config_entry_id"])
        await hass.config_entries.async_remove(entry.entry_id)
        return {"entry_id": entry.entry_id}

    async def async_list(call: ServiceCall) -> ServiceResponse:
        await _async_require_admin(hass, call)
        return {"requests": [summary(e) for e in hass.config_entries.async_entries(DOMAIN)]}

    entry_id = {vol.Required("config_entry_id"): cv.string}
    hass.services.async_register(
        DOMAIN, "create", async_create,
        schema=vol.Schema(
            {
                vol.Required(CONF_NAME): object,
                vol.Required(CONF_URL): object,
                **{
                    vol.Optional(field): object
                    for field in CONFIG_FIELDS
                    if field not in (CONF_NAME, CONF_URL)
                },
            }
        ),
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN, "update", async_update,
        schema=vol.Schema({**entry_id, **_FIELD_SCHEMA}),
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN, "delete", async_delete,
        schema=vol.Schema(entry_id),
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN, "list", async_list,
        schema=vol.Schema({}),
        supports_response=SupportsResponse.OPTIONAL,
    )
