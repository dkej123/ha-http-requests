# HTTP Requests for Home Assistant

A custom Home Assistant integration for creating and running arbitrary HTTP
requests entirely from the Home Assistant UI. Each configured request is
run through the `http_requests.execute` action and exposes an HTTP status
sensor and a response-body sensor.

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

- `http_requests.execute` runs a saved request selected with the request picker
  (`config_entry_id`). It optionally returns this execution’s result through
  `response_variable`. No button entities are created.
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

### Managing requests from actions (0.8.0)

Besides the panel, administrators can manage requests with actions — useful for
scripts or tools that use the Home Assistant API:

| Action | Data | Response |
|---|---|---|
| `http_requests.create` | `name`, `url` and optional `section`, `method`, `headers`, `body`, `timeout`, `response_limit`, `verify_ssl`, `follow_redirects` | `entry_id` |
| `http_requests.update` | `config_entry_id` plus the fields to change | `entry_id` |
| `http_requests.delete` | `config_entry_id` | `entry_id` |
| `http_requests.list` | – | requests with `header_names`, never header values or body |

- Only administrators (and internal calls without a user) may run them;
  validation is the same as in the panel.
- `update` changes only the fields given. `headers` are merged by name and a
  `null` value removes a header, so a request can be edited without knowing a
  secret header value.
- Action data is visible on Home Assistant's event bus: enter secret header
  values in the panel rather than passing them to `create`/`update`.

### Variables (0.7.0)

A saved request's URL, header values and body may contain `{{ name }}`
placeholders. `http_requests.execute` fills them from its optional `variables`
mapping:

```yaml
action: http_requests.execute
data:
  config_entry_id: 01ABC...           # saved request, e.g. URL
                                      # https://sync.example/syncs/progress/{{ document }}
  variables:
    document: "{{ trigger.event.data.document }}"
response_variable: progress
```

- This is plain substitution, not template evaluation: the saved request
  cannot run code. Templates in the action data are rendered by Home Assistant
  before the call, as for any action.
- A value placed in the URL is percent-encoded as one opaque component, so it
  cannot change the host, add path segments or query parameters.
- Header and body values are inserted verbatim; a header value containing a
  line break is rejected.
- A missing or non-text variable fails the execution before anything is sent
  (`missing_variable:<name>` / `invalid_variable:<name>`); values are never
  included in errors or logs.
- Requests without placeholders behave exactly as before, with or without
  `variables`. Executing a templated request from the panel without variables
  fails the same way.

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
action access and sensors as commands added in the UI. A stable ID derived
from the YAML key prevents duplicates. The panel can edit or delete an imported entry,
but the YAML definition remains the source of truth: it can overwrite changes
or recreate the request on a later Home Assistant restart. Remove the YAML
definition when migrating a request permanently to panel management.

Call an imported or UI-created request in an automation with:

```yaml
action: http_requests.execute
data:
  config_entry_id: "<request config entry ID>"
response_variable: response
```

The action response includes `status`, `content` (parsed JSON when complete and
valid, otherwise text), `body` (raw text), `content_type`, `elapsed_ms`,
`timestamp`, and `truncated`. Response bodies keep the configured size limit.
Omit `response_variable` when only execution is needed. HTTP error statuses
(e.g. 404 or 500) are returned for the automation to handle; transport errors
and timeouts raise an action error, as they did with the execution button.
Request settings remain static; action parameters do not override them.

### Migrating from buttons (0.6.0)

The execute button entities have been removed. Replace each `button.press`
call targeting an HTTP Requests button with `http_requests.execute` and the
corresponding `config_entry_id` in `data`, as shown above. In the visual editor,
select **HTTP Requests: Execute request** and choose the saved request.
Update dashboard tap/hold/double-tap actions too: use `perform-action` with
`perform_action: http_requests.execute` and `data.config_entry_id`.
Old button registry entries are removed automatically when each request loads;
existing sensor IDs and request configuration are preserved. Other users must
migrate their automations and dashboards themselves before upgrading.

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
