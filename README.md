# HTTP Requests for Home Assistant

A custom Home Assistant integration for creating and running arbitrary HTTP
requests entirely from the Home Assistant UI. Each configured request is
represented by a button, an HTTP status sensor, and a response-body sensor.

## Features

- YAML is optional.
- Add, edit, run, inspect, and remove requests directly in the dedicated
  **HTTP Requests** sidebar panel.
- Changes are applied by reloading only the config entry; Home Assistant does
  not need to restart.
- GET, POST, PUT, PATCH, and DELETE methods.
- Optional sections for organizing related requests.
- Static headers and request body.
- Configurable timeout, TLS certificate verification, redirects, and response
  size limit.
- Latest HTTP status, response body, content type, duration, and timestamp are
  exposed by sensors on the request's device page.
- Administrator-only **HTTP Requests** panel with a responsive request grid,
  one-click execution, and formatted response/configuration dialogs.
- English and Polish UI translations.

## Installation

### HACS

1. In HACS, open **⋮ → Custom repositories**.
2. Add `https://github.com/dkej123/ha-http-requests` as an **Integration**.
3. Install **HTTP Requests**.
4. Restart Home Assistant once so it discovers the newly installed custom
   integration. Later configuration changes do not require a restart.

### Manual

Copy `custom_components/http_requests` into the `custom_components` directory
of your Home Assistant configuration, then restart Home Assistant once.

## Configuration

Open **HTTP Requests** in the sidebar and select **Add request**. Creating or
editing a request does not execute it, so configuring a POST or DELETE request
has no side effects.

| Field | Description |
| --- | --- |
| Name | Friendly name used for the device and config entry. |
| Section | Optional panel group. Empty values appear as **Unsectioned** / **Bez sekcji**. |
| URL | Absolute `http://` or `https://` URL. Local-network URLs are supported. |
| Method | GET, POST, PUT, PATCH, or DELETE. |
| Headers | Key/value object, for example `Content-Type: application/json`. |
| Body | Optional static text sent as the raw request body. |
| Timeout | Total request timeout in seconds. |
| Response size limit | Maximum number of response bytes retained in HA state. |
| Verify TLS certificate | Disable only for a trusted server with a self-signed certificate. |
| Follow redirects | Whether HTTP redirects should be followed. |

Use the pencil button to edit a request. Saving reloads only that request's
config entry. Use **Delete** in the details or edit dialog to remove it after a
confirmation prompt.

## HTTP Requests panel

After installation, **HTTP Requests** appears in the Home Assistant sidebar for
administrators. Requests are grouped into collapsible sections in first-seen
order. The **All**, **Successful**, **Failed**, and **Not run** filters show
counts for the complete request set and hide groups with no matching requests.
Response previews can be expanded per card or together for the currently
visible cards. Status is successful only for HTTP 2xx; all other HTTP statuses,
timeouts, and transport errors are failed.

Use **Run** to execute a request directly from the panel. **Details** opens a
dialog with the complete bounded response (pretty-printed when it is JSON) and
the request configuration: URL, method, source, timeout, response limit, TLS,
redirects, headers, and body. Adding, editing, and deletion are all available
without leaving the panel.

The panel and its WebSocket API require an administrator account because
headers and request bodies may contain credentials.

## Entities and automations

- `button.<name>_execute` runs the request. It can be pressed from a dashboard
  or through the standard `button.press` action in an automation.
- `sensor.<name>_last_response` has the HTTP status code as its state. Before
  the first run its state is unknown; transport failures use `error`.
- `sensor.<name>_response_body` shows the first 255 characters of the response
  directly on the device page. JSON is automatically pretty-printed. Its entity
  dialog contains a multiline `formatted_response` attribute with status,
  content type, duration, timestamp, error, and formatted body.

The status sensor attributes include `response_body`, `content_type`,
`reason`, `elapsed_ms`, `last_run`, `truncated`, and `error`. The response body
is decoded as text and limited to the configured number of bytes.
Both response sensors force an update after every execution, even when the
server returns exactly the same status and body as before.

> Response sensor states and attributes can be stored by Home Assistant's
> recorder. Avoid retaining sensitive response bodies, or exclude these sensors
> from recorder history when necessary.

## Replacing `rest_command`

YAML configuration is optional. The command mapping follows Home Assistant's
`rest_command` layout; only the top-level integration name changes:

```yaml
http_requests:
  gdrive_run:
    url: "http://100.74.189.47:8080/run"
    method: POST
    section: Backups
    headers:
      Content-Type: application/json
    payload: '{"force": true}'
    timeout: 15
    verify_ssl: true
```

Supported `rest_command` fields are `url`, `method`, `headers`, `payload`,
`content_type`, `timeout`, and `verify_ssl`. This integration additionally
supports `body` as an alias for `payload`, plus `response_limit`,
`follow_redirects`, and `section`. YAML values are static in this release;
Jinja templates and
the `authentication`, `username`, `password`, `insecure_cipher`, and
`skip_url_encoding` options are not yet supported.

YAML commands are imported into config entries at startup and receive the same
button and sensors as commands added in the UI. A stable ID derived from the
YAML key prevents duplicates. The panel can edit or delete an imported entry,
but the YAML definition remains the source of truth: it can overwrite changes
or recreate the request on a later Home Assistant restart. Remove the YAML
definition when migrating a request permanently to panel management.

Call an imported or UI-created request in an automation with:

```yaml
action: button.press
target:
  entity_id: button.gdrive_run_execute
```

## Releases

1. Update `version` in `custom_components/http_requests/manifest.json`.
2. Commit and push `main`.
3. Create and push a matching tag, for example:

   ```bash
   git tag -a v0.1.0 -m v0.1.0
   git push origin main v0.1.0
   ```

The release workflow validates that the tag matches the manifest, runs the
tests, builds `http_requests.zip` with the integration files at the archive
root (as required by HACS), and publishes a GitHub Release.

## License

MIT
