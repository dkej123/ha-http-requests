const COPY = {
  en: {
    title: "HTTP Requests",
    subtitle: "Run requests and inspect their configuration and latest response.",
    refresh: "Refresh",
    run: "Run",
    running: "Running…",
    details: "Details",
    add: "Add request",
    edit: "Edit",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    delete: "Delete",
    deleting: "Deleting…",
    addTitle: "Add HTTP request",
    editTitle: "Edit HTTP request",
    deleteTitle: "Delete request?",
    deleteConfirm: "This removes the request, its device, and its entities from Home Assistant.",
    yamlWarning: "This request was imported from YAML. It will return after a Home Assistant restart while it remains in configuration.yaml.",
    name: "Name",
    url: "URL",
    method: "Method",
    headersHelp: "JSON object, for example {\"Authorization\": \"Bearer …\"}",
    invalidHeaders: "Headers must be a valid JSON object.",
    noRequests: "No HTTP requests configured yet.",
    noResponse: "No response yet",
    response: "Response",
    configuration: "Configuration",
    headers: "Headers",
    body: "Request body",
    close: "Close",
    source: "Source",
    timeout: "Timeout",
    responseLimit: "Response limit",
    verifySsl: "Verify TLS",
    redirects: "Follow redirects",
    yes: "Yes",
    no: "No",
    error: "Request failed",
    empty: "Empty response",
    openResponse: "Open full response",
  },
  pl: {
    title: "Żądania HTTP",
    subtitle: "Uruchamiaj żądania oraz sprawdzaj ich konfigurację i ostatnią odpowiedź.",
    refresh: "Odśwież",
    run: "Uruchom",
    running: "Wysyłanie…",
    details: "Szczegóły",
    add: "Dodaj request",
    edit: "Edytuj",
    save: "Zapisz",
    saving: "Zapisywanie…",
    cancel: "Anuluj",
    delete: "Usuń",
    deleting: "Usuwanie…",
    addTitle: "Dodaj request HTTP",
    editTitle: "Edytuj request HTTP",
    deleteTitle: "Usunąć request?",
    deleteConfirm: "Request, jego urządzenie i encje zostaną usunięte z Home Assistanta.",
    yamlWarning: "Ten request został zaimportowany z YAML. Po restarcie Home Assistanta wróci, jeśli nadal znajduje się w configuration.yaml.",
    name: "Nazwa",
    url: "URL",
    method: "Metoda",
    headersHelp: "Obiekt JSON, np. {\"Authorization\": \"Bearer …\"}",
    invalidHeaders: "Nagłówki muszą być poprawnym obiektem JSON.",
    noRequests: "Nie skonfigurowano jeszcze żadnych żądań HTTP.",
    noResponse: "Brak odpowiedzi",
    response: "Odpowiedź",
    configuration: "Konfiguracja",
    headers: "Nagłówki",
    body: "Treść żądania",
    close: "Zamknij",
    source: "Źródło",
    timeout: "Limit czasu",
    responseLimit: "Limit odpowiedzi",
    verifySsl: "Weryfikacja TLS",
    redirects: "Przekierowania",
    yes: "Tak",
    no: "Nie",
    error: "Żądanie nie powiodło się",
    empty: "Pusta odpowiedź",
    openResponse: "Otwórz pełną odpowiedź",
  },
};

class HttpRequestsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._requests = [];
    this._running = new Set();
    this._selected = null;
    this._editor = null;
    this._deleteCandidate = null;
    this._saving = false;
    this._deleting = false;
    this._loading = true;
    this._error = null;
    this.shadowRoot.addEventListener("click", (event) => this._handleClick(event));
    this.shadowRoot.addEventListener("keydown", (event) => this._handleKeydown(event));
    this.shadowRoot.addEventListener("submit", (event) => this._handleSubmit(event));
  }

  set hass(value) {
    const firstConnection = !this._hass;
    this._hass = value;
    if (firstConnection) this._load();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._render();
  }

  get _t() {
    const language = (this._hass?.language || "en").toLowerCase();
    return language.startsWith("pl") ? COPY.pl : COPY.en;
  }

  async _load() {
    if (!this._hass) return;
    this._loading = true;
    this._error = null;
    this._render();
    try {
      const response = await this._hass.callWS({ type: "http_requests/list" });
      this._requests = response.requests || [];
    } catch (error) {
      this._error = this._errorText(error);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  async _run(entryId) {
    if (this._running.has(entryId)) return;
    this._running.add(entryId);
    this._error = null;
    this._render();
    try {
      const result = await this._hass.callWS({
        type: "http_requests/run",
        entry_id: entryId,
      });
      const request = this._requests.find((item) => item.entry_id === entryId);
      if (request) request.result = result;
      if (this._selected?.entry_id === entryId) this._selected = request;
    } catch (error) {
      this._error = this._errorText(error);
    } finally {
      this._running.delete(entryId);
      this._render();
    }
  }

  _openEditor(request = null) {
    this._selected = null;
    this._error = null;
    this._editor = request
      ? { entry_id: request.entry_id, source: request.source, config: { ...request.config } }
      : {
          entry_id: null,
          source: "ui",
          config: {
            name: "",
            url: "http://",
            method: "GET",
            headers: {},
            body: "",
            timeout: 10,
            response_limit: 4096,
            verify_ssl: true,
            follow_redirects: true,
          },
        };
    this._render();
  }

  async _handleSubmit(event) {
    if (event.target.id !== "request-editor") return;
    event.preventDefault();
    if (this._saving) return;
    const form = new FormData(event.target);
    let headers;
    try {
      headers = JSON.parse(String(form.get("headers") || "{}"));
      if (!headers || Array.isArray(headers) || typeof headers !== "object") throw new Error();
    } catch (_error) {
      const input = event.target.elements.headers;
      input.setCustomValidity(this._t.invalidHeaders);
      input.reportValidity();
      input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
      return;
    }
    const config = {
      name: String(form.get("name") || ""),
      url: String(form.get("url") || ""),
      method: String(form.get("method") || "GET"),
      headers,
      body: String(form.get("body") || ""),
      timeout: Number(form.get("timeout")),
      response_limit: Number(form.get("response_limit")),
      verify_ssl: form.has("verify_ssl"),
      follow_redirects: form.has("follow_redirects"),
    };
    const editor = { ...this._editor, config };
    this._editor = editor;
    this._saving = true;
    this._error = null;
    this._render();
    try {
      await this._hass.callWS({
        type: editor.entry_id ? "http_requests/update" : "http_requests/create",
        ...(editor.entry_id ? { entry_id: editor.entry_id } : {}),
        config,
      });
      this._editor = null;
      await this._load();
    } catch (error) {
      this._error = this._errorText(error);
    } finally {
      this._saving = false;
      this._render();
    }
  }

  async _deleteRequest(request) {
    if (this._deleting) return;
    this._deleting = true;
    this._error = null;
    this._render();
    try {
      await this._hass.callWS({ type: "http_requests/delete", entry_id: request.entry_id });
      this._deleteCandidate = null;
      this._selected = null;
      await this._load();
    } catch (error) {
      this._error = this._errorText(error);
    } finally {
      this._deleting = false;
      this._render();
    }
  }

  _handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (target.classList.contains("overlay") && event.target !== target) return;
    const action = target.dataset.action;
    const entryId = target.dataset.entryId;
    const request = this._requests.find((item) => item.entry_id === entryId);
    if (action === "refresh") this._load();
    if (action === "add") this._openEditor();
    if (action === "run") this._run(entryId);
    if (action === "details") {
      this._selected = request;
      this._render();
    }
    if (action === "close-details") {
      this._selected = null;
      this._render();
    }
    if (action === "edit") this._openEditor(request || this._selected);
    if (action === "close-editor" && !this._saving) {
      this._editor = null;
      this._error = null;
      this._render();
    }
    if (action === "delete") {
      this._selected = null;
      this._deleteCandidate = request || this._editor;
      this._editor = null;
      this._render();
    }
    if (action === "cancel-delete" && !this._deleting) {
      this._deleteCandidate = null;
      this._render();
    }
    if (action === "confirm-delete") this._deleteRequest(this._deleteCandidate);
  }

  _handleKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target.closest('[role="button"][data-action]');
    if (!target) return;
    event.preventDefault();
    target.click();
  }

  _errorText(error) {
    return error?.message || error?.code || String(error);
  }

  _render() {
    if (!this.shadowRoot) return;
    const t = this._t;
    const cards = this._requests.map((request) => this._card(request)).join("");
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <main>
        <header>
          <div>
            <h1>${t.title}</h1>
            <p>${t.subtitle}</p>
          </div>
          <div class="toolbar">
            <button class="secondary compact" data-action="refresh" ${this._loading ? "disabled" : ""}>
              <ha-icon icon="mdi:refresh"></ha-icon>${t.refresh}
            </button>
            <button class="primary compact" data-action="add">
              <ha-icon icon="mdi:plus"></ha-icon>${t.add}
            </button>
          </div>
        </header>
        ${this._error ? `<div class="alert"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${escapeHtml(this._error)}</div>` : ""}
        ${this._loading ? `<div class="loading"><ha-circular-progress active></ha-circular-progress></div>` : ""}
        ${!this._loading && !cards ? `<div class="empty"><ha-icon icon="mdi:web-off"></ha-icon><p>${t.noRequests}</p></div>` : ""}
        <section class="grid">${cards}</section>
      </main>
      ${this._selected ? this._dialog(this._selected) : ""}
      ${this._editor ? this._editorDialog(this._editor) : ""}
      ${this._deleteCandidate ? this._deleteDialog(this._deleteCandidate) : ""}
    `;
  }

  _card(request) {
    const t = this._t;
    const config = request.config;
    const result = request.result;
    const running = this._running.has(request.entry_id);
    const statusClass = !result ? "idle" : result.error ? "failure" : result.status >= 400 ? "warning" : "success";
    const status = !result ? t.noResponse : result.error ? t.error : `${result.status}${result.reason ? ` ${escapeHtml(result.reason)}` : ""}`;
    const response = result?.formatted_body || result?.body || "";
    return `
      <article class="card">
        <div class="card-top">
          <span class="method">${escapeHtml(config.method)}</span>
          <span class="status ${statusClass}"><i></i>${status}</span>
        </div>
        <h2>${escapeHtml(config.name)}</h2>
        <code class="url" title="${escapeHtml(config.url)}">${escapeHtml(config.url)}</code>
        <div class="response-preview ${response ? "" : "muted"}" data-action="details" data-entry-id="${request.entry_id}" role="button" tabindex="0" aria-label="${escapeHtml(t.openResponse)}">
          <span>${t.response}<ha-icon icon="mdi:open-in-new"></ha-icon></span>
          <pre>${response ? escapeHtml(response) : t.noResponse}</pre>
        </div>
        ${result ? `<div class="meta"><span>${formatDate(result.timestamp)}</span><span>${result.elapsed_ms} ms</span></div>` : ""}
        <div class="actions">
          <button class="primary" data-action="run" data-entry-id="${request.entry_id}" ${running || !request.loaded ? "disabled" : ""}>
            <ha-icon icon="${running ? "mdi:loading" : "mdi:play"}" class="${running ? "spin" : ""}"></ha-icon>
            ${running ? t.running : t.run}
          </button>
          <button class="secondary" data-action="details" data-entry-id="${request.entry_id}">
            <ha-icon icon="mdi:text-box-search-outline"></ha-icon>${t.details}
          </button>
          <button class="icon-button secondary" data-action="edit" data-entry-id="${request.entry_id}" aria-label="${escapeHtml(t.edit)}">
            <ha-icon icon="mdi:pencil-outline"></ha-icon>
          </button>
        </div>
      </article>`;
  }

  _dialog(request) {
    const t = this._t;
    const config = request.config;
    const result = request.result;
    const headers = Object.keys(config.headers || {}).length
      ? JSON.stringify(config.headers, null, 2)
      : "—";
    const response = result ? this._formattedResponse(result) : t.noResponse;
    return `
      <div class="overlay" data-action="close-details">
        <section class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(config.name)}">
          <div class="dialog-header">
            <div><span class="method">${escapeHtml(config.method)}</span><h2>${escapeHtml(config.name)}</h2></div>
            <button class="icon-button" data-action="close-details" aria-label="${t.close}"><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-content">
            <section>
              <h3>${t.configuration}</h3>
              <dl>
                <dt>URL</dt><dd><code>${escapeHtml(config.url)}</code></dd>
                <dt>${t.source}</dt><dd>${escapeHtml(request.source.toUpperCase())}</dd>
                <dt>${t.timeout}</dt><dd>${config.timeout} s</dd>
                <dt>${t.responseLimit}</dt><dd>${config.response_limit} B</dd>
                <dt>${t.verifySsl}</dt><dd>${config.verify_ssl ? t.yes : t.no}</dd>
                <dt>${t.redirects}</dt><dd>${config.follow_redirects ? t.yes : t.no}</dd>
              </dl>
              <label>${t.headers}</label><pre class="code-block">${escapeHtml(headers)}</pre>
              <label>${t.body}</label><pre class="code-block">${escapeHtml(config.body || "—")}</pre>
            </section>
            <section>
              <h3>${t.response}</h3>
              <pre class="response-full">${escapeHtml(response)}</pre>
            </section>
          </div>
          <div class="dialog-actions">
            <button class="danger-text" data-action="delete" data-entry-id="${request.entry_id}"><ha-icon icon="mdi:delete-outline"></ha-icon>${t.delete}</button>
            <span class="action-spacer"></span>
            <button class="secondary" data-action="edit" data-entry-id="${request.entry_id}"><ha-icon icon="mdi:pencil-outline"></ha-icon>${t.edit}</button>
            <button class="primary" data-action="run" data-entry-id="${request.entry_id}" ${this._running.has(request.entry_id) || !request.loaded ? "disabled" : ""}>
              <ha-icon icon="mdi:play"></ha-icon>${t.run}
            </button>
          </div>
        </section>
      </div>`;
  }

  _editorDialog(editor) {
    const t = this._t;
    const config = editor.config;
    const headers = JSON.stringify(config.headers || {}, null, 2);
    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    return `
      <div class="overlay" data-action="close-editor">
        <section class="dialog editor-dialog" role="dialog" aria-modal="true" aria-label="${editor.entry_id ? t.editTitle : t.addTitle}">
          <form id="request-editor">
            <div class="dialog-header">
              <h2>${editor.entry_id ? t.editTitle : t.addTitle}</h2>
              <button type="button" class="icon-button" data-action="close-editor" aria-label="${t.close}" ${this._saving ? "disabled" : ""}><ha-icon icon="mdi:close"></ha-icon></button>
            </div>
            <div class="form-content">
              ${editor.source === "yaml" ? `<div class="warning"><ha-icon icon="mdi:alert-outline"></ha-icon><span>${t.yamlWarning}</span></div>` : ""}
              <div class="form-grid">
                <label class="field full"><span>${t.name}</span><input name="name" required maxlength="128" value="${escapeHtml(config.name)}"></label>
                <label class="field full"><span>${t.url}</span><input name="url" type="url" required value="${escapeHtml(config.url)}"></label>
                <label class="field"><span>${t.method}</span><select name="method">${methods.map((method) => `<option value="${method}" ${config.method === method ? "selected" : ""}>${method}</option>`).join("")}</select></label>
                <label class="field"><span>${t.timeout} (s)</span><input name="timeout" type="number" required min="1" max="300" step="1" value="${config.timeout}"></label>
                <label class="field full"><span>${t.headers}</span><small>${t.headersHelp}</small><textarea name="headers" rows="6" spellcheck="false">${escapeHtml(headers)}</textarea></label>
                <label class="field full"><span>${t.body}</span><textarea name="body" rows="7" spellcheck="false">${escapeHtml(config.body || "")}</textarea></label>
                <label class="field"><span>${t.responseLimit} (B)</span><input name="response_limit" type="number" required min="256" max="65536" step="256" value="${config.response_limit}"></label>
                <div class="toggles">
                  <label class="toggle"><input name="verify_ssl" type="checkbox" ${config.verify_ssl ? "checked" : ""}><span>${t.verifySsl}</span></label>
                  <label class="toggle"><input name="follow_redirects" type="checkbox" ${config.follow_redirects ? "checked" : ""}><span>${t.redirects}</span></label>
                </div>
              </div>
              ${this._error ? `<div class="alert form-alert"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${escapeHtml(this._error)}</div>` : ""}
            </div>
            <div class="dialog-actions">
              ${editor.entry_id ? `<button type="button" class="danger-text" data-action="delete" data-entry-id="${editor.entry_id}" ${this._saving ? "disabled" : ""}><ha-icon icon="mdi:delete-outline"></ha-icon>${t.delete}</button>` : ""}
              <span class="action-spacer"></span>
              <button type="button" class="secondary" data-action="close-editor" ${this._saving ? "disabled" : ""}>${t.cancel}</button>
              <button type="submit" class="primary" ${this._saving ? "disabled" : ""}><ha-icon icon="${this._saving ? "mdi:loading" : "mdi:content-save-outline"}" class="${this._saving ? "spin" : ""}"></ha-icon>${this._saving ? t.saving : t.save}</button>
            </div>
          </form>
        </section>
      </div>`;
  }

  _deleteDialog(request) {
    const t = this._t;
    return `
      <div class="overlay" data-action="cancel-delete">
        <section class="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-label="${t.deleteTitle}">
          <div class="confirm-content">
            <ha-icon class="danger-icon" icon="mdi:delete-alert-outline"></ha-icon>
            <div><h2>${t.deleteTitle}</h2><p><strong>${escapeHtml(request.config.name)}</strong></p><p>${t.deleteConfirm}</p></div>
          </div>
          ${request.source === "yaml" ? `<div class="warning yaml-delete"><ha-icon icon="mdi:alert-outline"></ha-icon><span>${t.yamlWarning}</span></div>` : ""}
          ${this._error ? `<div class="alert confirm-alert"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${escapeHtml(this._error)}</div>` : ""}
          <div class="dialog-actions">
            <button class="secondary" data-action="cancel-delete" ${this._deleting ? "disabled" : ""}>${t.cancel}</button>
            <button class="danger" data-action="confirm-delete" ${this._deleting ? "disabled" : ""}><ha-icon icon="${this._deleting ? "mdi:loading" : "mdi:delete-outline"}" class="${this._deleting ? "spin" : ""}"></ha-icon>${this._deleting ? t.deleting : t.delete}</button>
          </div>
        </section>
      </div>`;
  }

  _formattedResponse(result) {
    const status = result.error
      ? `Error: ${result.error}`
      : `${result.status}${result.reason ? ` ${result.reason}` : ""}`;
    const lines = [
      `Status: ${status}`,
      `Content-Type: ${result.content_type || "-"}`,
      `Duration: ${result.elapsed_ms} ms`,
      `Received: ${formatDate(result.timestamp)}`,
      "",
      "Body:",
      result.formatted_body || result.body || this._t.empty,
    ];
    if (result.truncated) lines.push("", "[response truncated]");
    return lines.join("\n");
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(value));
  } catch (_error) {
    return value;
  }
}

const STYLES = `
  :host { display:block; min-height:100%; background:var(--primary-background-color); color:var(--primary-text-color); }
  * { box-sizing:border-box; }
  main { max-width:1500px; margin:0 auto; padding:32px clamp(16px,3vw,40px) 48px; }
  header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; margin-bottom:28px; }
  .toolbar { display:flex; flex:0 0 auto; gap:10px; }
  h1 { margin:0 0 6px; font-size:32px; line-height:1.15; letter-spacing:-.02em; }
  header p { margin:0; color:var(--secondary-text-color); font-size:15px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(310px,1fr)); gap:18px; }
  .card { min-width:0; padding:20px; border:1px solid var(--divider-color); border-radius:18px; background:var(--card-background-color); box-shadow:var(--ha-card-box-shadow,0 2px 8px rgba(0,0,0,.08)); }
  .card-top,.meta,.actions,.dialog-header,.dialog-actions { display:flex; align-items:center; }
  .card-top { justify-content:space-between; gap:12px; }
  .method { display:inline-flex; width:max-content; padding:5px 9px; border-radius:7px; color:var(--primary-color); background:color-mix(in srgb,var(--primary-color) 12%,transparent); font:700 12px/1 var(--code-font-family,monospace); letter-spacing:.04em; }
  .status { display:flex; align-items:center; gap:6px; min-width:0; color:var(--secondary-text-color); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .status i { flex:0 0 8px; width:8px; height:8px; border-radius:50%; background:var(--disabled-text-color); }
  .status.success i { background:var(--success-color,#43a047); }.status.warning i { background:var(--warning-color,#ffa600); }.status.failure i { background:var(--error-color,#db4437); }
  .card h2 { margin:18px 0 7px; font-size:20px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .url { display:block; overflow:hidden; color:var(--secondary-text-color); font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .response-preview { display:block; width:100%; min-height:0; margin-top:18px; padding:13px 14px; color:var(--primary-text-color); border-radius:12px; background:var(--secondary-background-color); text-align:left; cursor:pointer; transition:filter .15s; }
  .response-preview:hover { filter:brightness(.97); }
  .response-preview:focus-visible { outline:2px solid var(--primary-color); outline-offset:2px; }
  .response-preview>span,.dialog-content>section>label { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; color:var(--secondary-text-color); font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
  .response-preview>span ha-icon { --mdc-icon-size:15px; }
  pre { margin:0; font-family:var(--code-font-family,ui-monospace,monospace); white-space:pre-wrap; overflow-wrap:anywhere; }
  .response-preview pre { height:82px; overflow:auto; overscroll-behavior:contain; font-size:12px; line-height:1.45; scrollbar-width:thin; }
  .muted pre { color:var(--disabled-text-color); font-family:inherit; }
  .meta { justify-content:space-between; margin-top:10px; color:var(--secondary-text-color); font-size:11px; }
  .actions { gap:10px; margin-top:18px; }
  button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:40px; padding:0 15px; border:0; border-radius:10px; font:600 13px/1 inherit; cursor:pointer; transition:filter .15s,transform .15s; }
  button:hover:not(:disabled) { filter:brightness(.96); } button:active:not(:disabled) { transform:translateY(1px); } button:disabled { opacity:.55; cursor:not-allowed; }
  button ha-icon { --mdc-icon-size:18px; }
  .primary { color:var(--text-primary-color,#fff); background:var(--primary-color); }.secondary { color:var(--primary-text-color); background:var(--secondary-background-color); }.compact { flex:0 0 auto; }
  .actions button { flex:1; }
  .actions .icon-button { flex:0 0 40px; padding:0; }
  .loading,.empty { display:grid; place-items:center; min-height:280px; color:var(--secondary-text-color); text-align:center; }
  .empty ha-icon { --mdc-icon-size:48px; opacity:.5; }.empty p { margin:12px 0; }
  .alert { display:flex; align-items:center; gap:10px; margin-bottom:18px; padding:12px 14px; border-radius:10px; color:var(--error-color); background:color-mix(in srgb,var(--error-color) 10%,var(--card-background-color)); }
  .overlay { position:fixed; z-index:10; inset:0; display:grid; place-items:center; padding:20px; background:rgba(0,0,0,.55); backdrop-filter:blur(3px); }
  .dialog { width:min(980px,100%); max-height:min(820px,92vh); overflow:auto; border-radius:20px; background:var(--card-background-color); box-shadow:0 20px 60px rgba(0,0,0,.35); }
  .dialog-header { position:sticky; z-index:2; top:0; justify-content:space-between; padding:20px 22px; border-bottom:1px solid var(--divider-color); background:var(--card-background-color); }
  .dialog-header>div { display:flex; align-items:center; gap:12px; min-width:0; }.dialog-header h2 { margin:0; font-size:22px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .icon-button { width:40px; padding:0; border-radius:50%; background:transparent; }
  .dialog-content { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:0; }
  .dialog-content>section { min-width:0; padding:22px; }.dialog-content>section+section { border-left:1px solid var(--divider-color); }
  h3 { margin:0 0 18px; font-size:16px; }
  dl { display:grid; grid-template-columns:130px minmax(0,1fr); gap:10px 14px; margin:0 0 22px; font-size:13px; } dt { color:var(--secondary-text-color); } dd { min-width:0; margin:0; overflow-wrap:anywhere; }
  .code-block,.response-full { max-height:260px; overflow:auto; padding:14px; border:1px solid var(--divider-color); border-radius:10px; background:var(--secondary-background-color); font-size:12px; line-height:1.5; }
  label:not(:first-of-type) { margin-top:18px; }
  .response-full { min-height:350px; max-height:560px; }
  .dialog-actions { position:sticky; bottom:0; justify-content:flex-end; gap:10px; padding:14px 22px; border-top:1px solid var(--divider-color); background:var(--card-background-color); }
  .action-spacer { flex:1; }
  .danger,.danger-text { color:#fff; background:var(--error-color,#db4437); }
  .danger-text { color:var(--error-color,#db4437); background:transparent; }
  .editor-dialog { width:min(760px,100%); }
  .form-content { padding:22px; }
  .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .field { display:block; min-width:0; }
  .field.full { grid-column:1/-1; }
  .field>span { display:block; margin-bottom:7px; font-size:13px; font-weight:600; }
  .field small { display:block; margin:-2px 0 8px; color:var(--secondary-text-color); font-size:11px; }
  input,select,textarea { width:100%; color:var(--primary-text-color); border:1px solid var(--divider-color); border-radius:9px; outline:0; background:var(--card-background-color); font-family:inherit; font-size:14px; line-height:1.4; }
  input,select { height:44px; padding:0 12px; }
  textarea { resize:vertical; padding:11px 12px; font-family:var(--code-font-family,ui-monospace,monospace); }
  input:focus,select:focus,textarea:focus { border-color:var(--primary-color); box-shadow:0 0 0 1px var(--primary-color); }
  .toggles { display:flex; flex-direction:column; justify-content:center; gap:12px; }
  .toggle { display:flex; align-items:center; gap:9px; font-size:13px; }
  .toggle input { width:18px; height:18px; margin:0; accent-color:var(--primary-color); }
  .warning { display:flex; align-items:flex-start; gap:10px; margin-bottom:18px; padding:12px 14px; color:var(--warning-color,#b26a00); border-radius:10px; background:color-mix(in srgb,var(--warning-color,#ffa600) 12%,var(--card-background-color)); font-size:13px; line-height:1.4; }
  .warning ha-icon { flex:0 0 auto; --mdc-icon-size:20px; }
  .form-alert { margin:18px 0 0; }
  .confirm-dialog { width:min(520px,100%); }
  .confirm-content { display:flex; gap:18px; padding:26px 24px 18px; }
  .confirm-content h2 { margin:0 0 12px; }.confirm-content p { margin:6px 0; color:var(--secondary-text-color); line-height:1.45; }
  .danger-icon { flex:0 0 auto; color:var(--error-color,#db4437); --mdc-icon-size:36px; }
  .yaml-delete { margin:0 24px 18px; }.confirm-alert { margin:0 24px 18px; }
  .spin { animation:spin 1s linear infinite; } @keyframes spin { to { transform:rotate(360deg); } }
  @media (max-width:720px) { main { padding-top:20px; } header { flex-direction:column; }.toolbar { width:100%; }.toolbar button { flex:1; }.grid { grid-template-columns:1fr; }.dialog-content,.form-grid { grid-template-columns:1fr; }.dialog-content>section+section { border-left:0; border-top:1px solid var(--divider-color); }.field.full { grid-column:auto; }.dialog { max-height:95vh; }.dialog-actions { flex-wrap:wrap; }.dialog-actions button { flex:1; }.dialog-actions .danger-text { flex:0 0 auto; }.action-spacer { display:none; } }
`;

if (!customElements.get("http-requests-panel")) {
  customElements.define("http-requests-panel", HttpRequestsPanel);
}
