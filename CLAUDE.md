# HTTP Requests project guide

Custom Home Assistant integration that lets users configure arbitrary HTTP
requests through config entries. The project is a standalone git repository;
run git commands from this directory. Its remote is
`git@github.com:dkej123/ha-http-requests.git` and the default branch is `main`.

## Architecture

Each request is a separate config entry. Initial setup stores a stable random
`command_id` in `entry.data`; editable values are stored in `entry.options`.
`OptionsFlowWithReload` applies changes without restarting Home Assistant.

`HttpRequestRuntime` serializes executions per entry and keeps the latest
bounded response in memory. Never log configured URLs, headers, bodies, or
response bodies because they may contain credentials. Adding/editing a config
entry must not execute its request.

Each entry exposes one execute button, one latest-status sensor, and one
response-body sensor. An administrator-only custom panel uses WebSocket
commands to create, list, update, execute, and delete requests; never make these
commands available to non-admin users because request headers and bodies can
contain credentials.
Entity unique IDs are based on `command_id`, so renaming a command must not
replace entities. The response size limit must be enforced while streaming;
never read an unbounded response into memory.

Keep `translations/en.json` and `translations/pl.json` in sync. Custom
integrations load the English text from `translations/en.json`; do not add a
core-only `strings.json` file.

## Validation

```bash
python3 -m compileall -q custom_components tests scripts
python3 -m unittest discover -s tests -v
node --check custom_components/http_requests/frontend/panel.js
for file in hacs.json custom_components/http_requests/*.json \
  custom_components/http_requests/translations/*.json; do
  python3 -m json.tool "$file" >/dev/null
done
git diff --check
```

## Release process

For every release, bump the semantic version in
`custom_components/http_requests/manifest.json`, commit and push `main`, then
push an annotated matching tag (`vX.Y.Z`). The release workflow validates the
tag, runs tests, builds `http_requests.zip`, and publishes the GitHub Release.
