"""HTTP Requests integration."""

from __future__ import annotations

import voluptuous as vol
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from .client import HttpRequestRuntime
from .const import (
    CONF_BODY,
    CONF_CONTENT_TYPE,
    CONF_FOLLOW_REDIRECTS,
    CONF_HEADERS,
    CONF_METHOD,
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
    DOMAIN,
    MAX_RESPONSE_LIMIT,
    MAX_TIMEOUT,
    MIN_RESPONSE_LIMIT,
    MIN_TIMEOUT,
    SUPPORTED_METHODS,
)
from .model import RequestConfig

PLATFORMS: tuple[Platform, ...] = (Platform.BUTTON, Platform.SENSOR)

HttpRequestsConfigEntry = ConfigEntry[HttpRequestRuntime]

YAML_COMMAND_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_URL): cv.string,
        vol.Optional(CONF_METHOD, default=DEFAULT_METHOD): vol.All(
            cv.string, vol.Upper, vol.In(SUPPORTED_METHODS)
        ),
        vol.Optional(CONF_HEADERS, default={}): vol.Schema(
            {cv.string: cv.string}
        ),
        vol.Optional(CONF_PAYLOAD): cv.string,
        vol.Optional(CONF_BODY): cv.string,
        vol.Optional(CONF_CONTENT_TYPE): cv.string,
        vol.Optional(CONF_TIMEOUT, default=DEFAULT_TIMEOUT): vol.All(
            vol.Coerce(int), vol.Range(min=MIN_TIMEOUT, max=MAX_TIMEOUT)
        ),
        vol.Optional(
            CONF_RESPONSE_LIMIT, default=DEFAULT_RESPONSE_LIMIT
        ): vol.All(
            vol.Coerce(int),
            vol.Range(min=MIN_RESPONSE_LIMIT, max=MAX_RESPONSE_LIMIT),
        ),
        vol.Optional(CONF_VERIFY_SSL, default=DEFAULT_VERIFY_SSL): cv.boolean,
        vol.Optional(
            CONF_FOLLOW_REDIRECTS, default=DEFAULT_FOLLOW_REDIRECTS
        ): cv.boolean,
    }
)

CONFIG_SCHEMA = vol.Schema(
    {DOMAIN: cv.schema_with_slug_keys(YAML_COMMAND_SCHEMA)}, extra=vol.ALLOW_EXTRA
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Import YAML requests into config entries."""
    for yaml_key, command in config.get(DOMAIN, {}).items():
        await hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_IMPORT},
            data={CONF_YAML_KEY: yaml_key, **command},
        )
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: HttpRequestsConfigEntry
) -> bool:
    """Set up one HTTP request command."""
    values = dict(entry.data)
    values.update(entry.options)
    entry.runtime_data = HttpRequestRuntime(
        async_get_clientsession(hass), RequestConfig.from_mapping(values)
    )
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: HttpRequestsConfigEntry
) -> bool:
    """Unload one HTTP request command."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
