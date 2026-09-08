"""Config flow for HTTP Requests."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlowWithReload,
)
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_BODY,
    CONF_COMMAND_ID,
    CONF_FOLLOW_REDIRECTS,
    CONF_HEADERS,
    CONF_METHOD,
    CONF_NAME,
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
from .model import (
    RequestConfig,
    RequestConfigurationError,
    normalize_yaml_command,
)


def _schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    """Build a form schema, preserving submitted or stored values."""
    values = defaults or {}
    return vol.Schema(
        {
            vol.Required(
                CONF_NAME, default=values.get(CONF_NAME, "")
            ): selector.TextSelector(),
            vol.Required(
                CONF_URL, default=values.get(CONF_URL, "http://")
            ): selector.TextSelector(
                selector.TextSelectorConfig(type=selector.TextSelectorType.URL)
            ),
            vol.Required(
                CONF_METHOD, default=values.get(CONF_METHOD, DEFAULT_METHOD)
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=list(SUPPORTED_METHODS),
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Optional(
                CONF_HEADERS, default=values.get(CONF_HEADERS, {})
            ): selector.ObjectSelector(),
            vol.Optional(
                CONF_BODY, default=values.get(CONF_BODY, "")
            ): selector.TextSelector(
                selector.TextSelectorConfig(multiline=True)
            ),
            vol.Required(
                CONF_TIMEOUT, default=values.get(CONF_TIMEOUT, DEFAULT_TIMEOUT)
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=MIN_TIMEOUT,
                    max=MAX_TIMEOUT,
                    step=1,
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
            vol.Required(
                CONF_RESPONSE_LIMIT,
                default=values.get(CONF_RESPONSE_LIMIT, DEFAULT_RESPONSE_LIMIT),
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=MIN_RESPONSE_LIMIT,
                    max=MAX_RESPONSE_LIMIT,
                    step=256,
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
            vol.Required(
                CONF_VERIFY_SSL,
                default=values.get(CONF_VERIFY_SSL, DEFAULT_VERIFY_SSL),
            ): selector.BooleanSelector(),
            vol.Required(
                CONF_FOLLOW_REDIRECTS,
                default=values.get(
                    CONF_FOLLOW_REDIRECTS, DEFAULT_FOLLOW_REDIRECTS
                ),
            ): selector.BooleanSelector(),
        }
    )


def _validated(user_input: dict[str, Any]) -> dict[str, Any]:
    """Normalize values before storing them."""
    return RequestConfig.from_mapping(user_input).as_dict()


class HttpRequestsConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create HTTP request commands from the Home Assistant UI."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Create one independently configurable request."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                data = _validated(user_input)
            except RequestConfigurationError as err:
                errors["base"] = f"invalid_{err}"
            else:
                command_id = uuid4().hex
                await self.async_set_unique_id(command_id)
                data[CONF_COMMAND_ID] = command_id
                return self.async_create_entry(title=data[CONF_NAME], data=data)

        return self.async_show_form(
            step_id="user", data_schema=_schema(user_input), errors=errors
        )

    async def async_step_import(
        self, import_data: dict[str, Any]
    ) -> ConfigFlowResult:
        """Import one rest_command-style YAML definition."""
        yaml_key = import_data[CONF_YAML_KEY]
        data = _validated(normalize_yaml_command(yaml_key, import_data))
        command_id = f"yaml:{yaml_key}"
        data[CONF_COMMAND_ID] = command_id
        data[CONF_YAML_KEY] = yaml_key

        existing_entry = await self.async_set_unique_id(command_id)
        if existing_entry is not None:
            # YAML remains authoritative after a restart. Clear edits stored by
            # either the options flow or the panel before applying the import.
            self.hass.config_entries.async_update_entry(
                existing_entry,
                title=data[CONF_NAME],
                options={},
            )
        self._abort_if_unique_id_configured(updates=data)
        return self.async_create_entry(title=data[CONF_NAME], data=data)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlowWithReload:
        """Return the editable request options flow."""
        return HttpRequestsOptionsFlow()


class HttpRequestsOptionsFlow(OptionsFlowWithReload):
    """Edit a request and reload it without restarting Home Assistant."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Edit all request settings."""
        errors: dict[str, str] = {}
        current = dict(self.config_entry.data)
        current.update(self.config_entry.options)

        if user_input is not None:
            try:
                data = _validated(user_input)
            except RequestConfigurationError as err:
                errors["base"] = f"invalid_{err}"
            else:
                self.hass.config_entries.async_update_entry(
                    self.config_entry, title=data[CONF_NAME]
                )
                return self.async_create_entry(title="", data=data)

        return self.async_show_form(
            step_id="init",
            data_schema=_schema(user_input or current),
            errors=errors,
        )
