const COPY = {
  en: {
    title: "HTTP Requests",
    subtitle: "Run requests and inspect their configuration and latest response.",
    refresh: "Refresh",
    run: "Run",
    running: "Running…",
    details: "Details",
    edit: "Configure in Home Assistant",
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
    edit: "Konfiguruj w Home Assistant",
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
    this._loading = true;
    this._error = null;
    this.shadowRoot.addEventListener("click", (event) => this._handleClick(event));
    this.shadowRoot.addEventListener("keydown", (event) => this._handleKeydown(event));
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

  _handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    if (target.classList.contains("overlay") && event.target !== target) return;
    const action = target.dataset.action;
    const entryId = target.dataset.entryId;
    if (action === "refresh") this._load();
    if (action === "run") this._run(entryId);
    if (action === "details") {
      this._selected = this._requests.find((item) => item.entry_id === entryId);
      this._render();
    }
    if (action === "close") {
      this._selected = null;
      this._render();
    }
    if (action === "edit") {
      history.pushState(null, "", "/config/integrations/integration/http_requests");
      window.dispatchEvent(new Event("location-changed"));
    }
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
          <button class="secondary compact" data-action="refresh" ${this._loading ? "disabled" : ""}>
            <ha-icon icon="mdi:refresh"></ha-icon>${t.refresh}
          </button>
        </header>
        ${this._error ? `<div class="alert"><ha-icon icon="mdi:alert-circle-outline"></ha-icon>${escapeHtml(this._error)}</div>` : ""}
        ${this._loading ? `<div class="loading"><ha-circular-progress active></ha-circular-progress></div>` : ""}
        ${!this._loading && !cards ? `<div class="empty"><ha-icon icon="mdi:web-off"></ha-icon><p>${t.noRequests}</p></div>` : ""}
        <section class="grid">${cards}</section>
      </main>
      ${this._selected ? this._dialog(this._selected) : ""}
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
      <div class="overlay" data-action="close">
        <section class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(config.name)}">
          <div class="dialog-header">
            <div><span class="method">${escapeHtml(config.method)}</span><h2>${escapeHtml(config.name)}</h2></div>
            <button class="icon-button" data-action="close" aria-label="${t.close}"><ha-icon icon="mdi:close"></ha-icon></button>
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
            <button class="secondary" data-action="edit"><ha-icon icon="mdi:cog-outline"></ha-icon>${t.edit}</button>
            <button class="primary" data-action="run" data-entry-id="${request.entry_id}" ${this._running.has(request.entry_id) || !request.loaded ? "disabled" : ""}>
              <ha-icon icon="mdi:play"></ha-icon>${t.run}
            </button>
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
  .response-preview>span,label { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; color:var(--secondary-text-color); font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
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
  .spin { animation:spin 1s linear infinite; } @keyframes spin { to { transform:rotate(360deg); } }
  @media (max-width:720px) { main { padding-top:20px; }.grid { grid-template-columns:1fr; }.dialog-content { grid-template-columns:1fr; }.dialog-content>section+section { border-left:0; border-top:1px solid var(--divider-color); }.dialog { max-height:95vh; }.dialog-actions { flex-wrap:wrap; }.dialog-actions button { flex:1; } }
`;

if (!customElements.get("http-requests-panel")) {
  customElements.define("http-requests-panel", HttpRequestsPanel);
}
