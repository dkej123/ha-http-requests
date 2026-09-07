"""Register the administrator-only HTTP Requests frontend panel."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.components.frontend import async_panel_exists
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

PANEL_URL_PATH = "http-requests"
STATIC_URL = "/http_requests_static"


async def async_register_panel(hass: HomeAssistant) -> None:
    """Serve and register the bundled frontend panel."""
    if async_panel_exists(hass, PANEL_URL_PATH):
        return
    frontend_path = Path(__file__).parent / "frontend"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(frontend_path), False)]
    )
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="http-requests-panel",
        frontend_url_path=PANEL_URL_PATH,
        module_url=f"{STATIC_URL}/panel.js",
        sidebar_title="HTTP Requests",
        sidebar_icon="mdi:web",
        require_admin=True,
        config={},
    )
