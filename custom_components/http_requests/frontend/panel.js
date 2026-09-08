const COPY = {
  en : {
    title : "HTTP Requests",
    subtitle :
        "Run requests and inspect their configuration and latest response.",
    refresh : "Refresh",
    run : "Run",
    running : "In progress…",
    details : "Details",
    add : "Add request",
    edit : "Edit",
    save : "Save request",
    saving : "Saving…",
    cancel : "Cancel",
    delete : "Delete",
    deleting : "Deleting…",
    addTitle : "Add HTTP request",
    editTitle : "Edit HTTP request",
    deleteTitle : "Delete request?",
    deleteConfirm :
        "This removes the request, its device, and its entities from Home Assistant.",
    yamlWarning :
        "This request was imported from YAML. YAML remains authoritative after a restart.",
    name : "Name",
    url : "URL",
    method : "Method",
    section : "Section",
    newSection : "New section",
    sectionName : "Section name",
    createSection : "Create",
    duplicateSection : "This section already exists.",
    headersHelp : 'A JSON object, for example {"Authorization": "Bearer …"}',
    invalidHeaders : "Headers must be a valid JSON object with scalar values.",
    invalidName : "Enter a name other than whitespace.",
    noRequests : "No HTTP requests configured yet.",
    noMatches : "No requests match this filter.",
    noResponse : "Not run yet",
    response : "Response",
    configuration : "Configuration",
    headers : "Headers",
    body : "Request body",
    close : "Close",
    source : "Source",
    timeout : "Timeout",
    responseLimit : "Response limit",
    verifySsl : "Verify TLS",
    redirects : "Follow redirects",
    yes : "Yes",
    no : "No",
    error : "Request failed",
    empty : "Empty response",
    all : "All",
    ok : "Success",
    fail : "Errors",
    idle : "No response",
    expandAll : "Expand responses",
    collapseAll : "Collapse responses",
    expand : "Expand",
    collapse : "Collapse",
    group : "Group in sections",
    ungroup : "Ungroup",
    unsectioned : "Unsectioned",
    requests : "requests",
    status : "Status",
    duration : "Duration",
    received : "Received",
    contentType : "Content type",
    truncated : "Response truncated",
    ui : "Panel / UI",
    yaml : "YAML",
    loadedError : "This request is not currently loaded."
  },
  pl : {
    title : "Żądania HTTP",
    subtitle :
        "Uruchamiaj żądania oraz sprawdzaj ich konfigurację i ostatnią odpowiedź.",
    refresh : "Odśwież",
    run : "Uruchom",
    running : "Trwa…",
    details : "Szczegóły",
    add : "Dodaj request",
    edit : "Edytuj",
    save : "Zapisz żądanie",
    saving : "Zapisywanie…",
    cancel : "Anuluj",
    delete : "Usuń",
    deleting : "Usuwanie…",
    addTitle : "Nowy request HTTP",
    editTitle : "Edytuj request HTTP",
    deleteTitle : "Usunąć żądanie?",
    deleteConfirm :
        "Żądanie, jego urządzenie i encje zostaną usunięte z Home Assistanta.",
    yamlWarning :
        "To żądanie zaimportowano z YAML. Po restarcie YAML ponownie nadpisze ustawienia.",
    name : "Nazwa",
    url : "URL",
    method : "Metoda",
    section : "Sekcja",
    newSection : "Nowa sekcja",
    sectionName : "Nazwa sekcji",
    createSection : "Utwórz",
    duplicateSection : "Taka sekcja już istnieje.",
    headersHelp : 'Obiekt JSON, np. {"Authorization": "Bearer …"}',
    invalidHeaders :
        "Nagłówki muszą być poprawnym obiektem JSON z prostymi wartościami.",
    invalidName : "Podaj nazwę zawierającą nie tylko spacje.",
    noRequests : "Nie skonfigurowano jeszcze żadnych żądań HTTP.",
    noMatches : "Żadne żądanie nie pasuje do filtra.",
    noResponse : "Brak odpowiedzi",
    response : "Odpowiedź",
    configuration : "Konfiguracja",
    headers : "Nagłówki",
    body : "Treść żądania",
    close : "Zamknij",
    source : "Źródło",
    timeout : "Limit czasu",
    responseLimit : "Limit odpowiedzi",
    verifySsl : "Weryfikacja TLS",
    redirects : "Przekierowania",
    yes : "Tak",
    no : "Nie",
    error : "Żądanie nie powiodło się",
    empty : "Pusta odpowiedź",
    all : "Wszystkie",
    ok : "Sukces",
    fail : "Błędy",
    idle : "Bez odpowiedzi",
    expandAll : "Rozwiń odpowiedzi",
    collapseAll : "Zwiń odpowiedzi",
    expand : "Rozwiń",
    collapse : "Zwiń",
    group : "Grupuj w sekcje",
    ungroup : "Bez grupowania",
    unsectioned : "Bez sekcji",
    requests : "żądań",
    status : "Status",
    duration : "Czas",
    received : "Odebrano",
    contentType : "Typ treści",
    truncated : "Odpowiedź ucięta",
    ui : "Panel / UI",
    yaml : "YAML",
    loadedError : "To żądanie nie jest obecnie załadowane."
  }
}

class HttpRequestsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode : "open"});
    this._requests = [];
    this._running = new Set;
    this._filter = "all";
    this._grouped = true;
    this._collapsed = new Set;
    this._expanded = new Set;
    this._selected = null;
    this._editor = null;
    this._deleteCandidate = null;
    this._loading = true;
    this._saving = false;
    this._deleting = false;
    this._error = null;
    this._restoreFocus = null;
    this.shadowRoot.addEventListener("click", e => this._click(e));
    this.shadowRoot.addEventListener("keydown", e => this._keydown(e));
    this.shadowRoot.addEventListener("input", () => this._capture());
    this.shadowRoot.addEventListener("change", () => this._capture());
    this.shadowRoot.addEventListener("submit", e => this._submit(e))
  }
  set hass(v) {
    const first = !this._hass;
    this._hass = v;
    this.toggleAttribute("data-dark", Boolean(v?.themes?.darkMode));
    if (first)
      this._load()
  }
  get hass() { return this._hass }
  connectedCallback() { this._render() }
  get _t() {
    return (this._hass?.language || "en").toLowerCase().startsWith("pl")
               ? COPY.pl
               : COPY.en
  }
  async _load() {
    if (!this._hass)
      return;
    this._loading = true;
    this._error = null;
    this._render();
    try {
      const r = await this._hass.callWS({type : "http_requests/list"});
      this._requests =
          (r.requests ||
           []).map(x => ({...x, config : {section : "", ...x.config}}));
      if (this._selected)
        this._selected =
            this._requests.find(x => x.entry_id === this._selected.entry_id) ||
            null
    } catch (e) {
      this._error = this._err(e)
    } finally {
      this._loading = false;
      this._render()
    }
  }
  async _run(id) {
    if (this._running.has(id))
      return;
    const modal = Boolean(this._selected);
    this._running.add(id);
    this._error = null;
    this._render(modal);
    try {
      const result = await this._hass.callWS(
                {type : "http_requests/run", entry_id : id}),
            r = this._requests.find(x => x.entry_id === id);
      if (r)
        r.result = result;
      if (this._selected?.entry_id === id)
        this._selected = r
    } catch (e) {
      this._error = this._err(e)
    } finally {
      this._running.delete(id);
      this._render(modal)
    }
  }
  _remember() {
    if (!this._restoreFocus?.isConnected)
      this._restoreFocus = this.shadowRoot.activeElement
  }
  _close(kind) {
    if (kind === "details")
      this._selected = null;
    if (kind === "editor") {
      this._editor = null;
      this._error = null
    }
    if (kind === "delete")
      this._deleteCandidate = null;
    this._render();
    const f = this._restoreFocus;
    this._restoreFocus = null;
    queueMicrotask(() => {
      if (f?.isConnected)
        f.focus()
    })
  }
  _openEditor(r = null) {
    this._remember();
    this._selected = null;
    this._error = null;
    const c = r ? {...r.config} : {
      name : "",
      section : this._sections()[0] || "",
      url : "http://",
      method : "GET",
      headers : {},
      body : "",
      timeout : 10,
      response_limit : 4096,
      verify_ssl : true,
      follow_redirects : true
    };
    this._editor = {
      entry_id : r?.entry_id || null,
      source : r?.source || "ui",
      config : c,
      headersText : JSON.stringify(c.headers || {}, null, 2),
      newSection : "",
      sectionError : "",
      creatingSection : false
    };
    this._render(true)
  }
  _capture() {
    if (!this._editor)
      return;
    const f = this.shadowRoot.querySelector("#request-editor");
    if (!f)
      return;
    const d = new FormData(f);
    Object.assign(this._editor.config, {
      name : String(d.get("name") || ""),
      section : String(d.get("section") ?? this._editor.config.section ?? ""),
      url : String(d.get("url") || ""),
      method : String(d.get("method") || "GET"),
      body : String(d.get("body") || ""),
      timeout : String(d.get("timeout") || ""),
      response_limit : String(d.get("response_limit") || ""),
      verify_ssl : d.has("verify_ssl"),
      follow_redirects : d.has("follow_redirects")
    });
    this._editor.headersText = String(d.get("headers") || "");
    this._editor.newSection = String(d.get("new_section") || "")
  }
  async _submit(e) {
    if (e.target.id !== "request-editor")
      return;
    e.preventDefault();
    if (this._saving)
      return;
    this._capture();
    const f = e.target, c = this._editor.config;
    f.elements.name.setCustomValidity(c.name.trim() ? "" : this._t.invalidName);
    let headers;
    try {
      headers = JSON.parse(this._editor.headersText || "{}");
      if (!headers || Array.isArray(headers) || typeof headers !== "object" ||
          Object.values(headers).some(
              v => !["string", "number", "boolean"].includes(typeof v)))
        throw Error();
      f.elements.headers.setCustomValidity("")
    } catch (_) {
      f.elements.headers.setCustomValidity(this._t.invalidHeaders)
    }
    if (!f.reportValidity())
      return;
    const typedSection = (this._editor.newSection || "").trim(), config = {
      ...c,
      name : c.name.trim(),
      section : typedSection || (c.section || "").trim(),
      headers,
      timeout : Number(c.timeout),
      response_limit : Number(c.response_limit)
    },
          editor = {...this._editor, config, newSection : ""};
    this._editor = editor;
    this._saving = true;
    this._error = null;
    this._render();
    try {
      await this._hass.callWS({
        type : editor.entry_id ? "http_requests/update"
                               : "http_requests/create",
        ...(editor.entry_id ? {entry_id : editor.entry_id} : {}),
        config
      });
      this._editor = null;
      await this._load()
    } catch (x) {
      this._error = this._err(x)
    } finally {
      this._saving = false;
      this._render()
    }
  }
  async _delete(r) {
    if (!r || this._deleting)
      return;
    this._deleting = true;
    this._error = null;
    this._render();
    try {
      await this._hass.callWS(
          {type : "http_requests/delete", entry_id : r.entry_id});
      this._deleteCandidate = null;
      this._selected = null;
      await this._load()
    } catch (e) {
      this._error = this._err(e)
    } finally {
      this._deleting = false;
      this._render()
    }
  }
  _click(e) {
    const x = e.target.closest("[data-action]");
    if (!x || x.classList.contains("overlay") && e.target !== x)
      return;
    const a = x.dataset.action, id = x.dataset.entryId,
          r = this._requests.find(v => v.entry_id === id);
    if (this._editor)
      this._capture();
    if (a === "refresh")
      this._load();
    else if (a === "add")
      this._openEditor();
    else if (a === "run")
      this._run(id);
    else if (a === "details") {
      this._remember();
      this._selected = r;
      this._render(true)
    } else if (a === "close-details")
      this._close("details");
    else if (a === "edit")
      this._openEditor(r || this._selected);
    else if (a === "close-editor" && !this._saving)
      this._close("editor");
    else if (a === "delete") {
      this._remember();
      this._selected = null;
      this._deleteCandidate = r || this._editor;
      this._editor = null;
      this._render(true)
    } else if (a === "cancel-delete" && !this._deleting)
      this._close("delete");
    else if (a === "confirm-delete")
      this._delete(this._deleteCandidate);
    else if (a === "filter") {
      this._filter = x.dataset.filter;
      this._render()
    } else if (a === "toggle-section") {
      const s = x.dataset.section;
      this._collapsed.has(s) ? this._collapsed.delete(s)
                             : this._collapsed.add(s);
      this._render()
    } else if (a === "toggle-response") {
      this._expanded.has(id) ? this._expanded.delete(id)
                             : this._expanded.add(id);
      this._render()
    } else if (a === "toggle-all")
      this._toggleAll();
    else if (a === "toggle-grouping") {
      this._grouped = !this._grouped;
      this._render()
    } else if (a === "select-section") {
      this._editor.config.section = x.dataset.section || "";
      this._editor.sectionError = "";
      this._render()
    } else if (a === "create-section")
      this._createSection()
      else if (a === "toggle-new-section") {
        this._editor.creatingSection = !this._editor.creatingSection;
        this._render()
      }
  }
  _keydown(e) {
    const d =
        this.shadowRoot.querySelector('[role="dialog"],[role="alertdialog"]');
    if (e.key === "Escape" && d) {
      if (this._editor && !this._saving)
        this._close("editor");
      else if (this._deleteCandidate && !this._deleting)
        this._close("delete");
      else if (this._selected)
        this._close("details");
      return
    }
    if (e.key !== "Tab" || !d)
      return;
    const q = [
      ...d.querySelectorAll(
          'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]')
    ];
    if (!q.length)
      return;
    const first = q[0], last = q.at(-1), active = this.shadowRoot.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus()
    }
  }
  _createSection() {
    const n = (this._editor.newSection || "").trim();
    if (!n)
      return;
    if (this._sections().includes(n)) {
      this._editor.sectionError = this._t.duplicateSection;
      this._render();
      return
    }
    this._editor.config.section = n;
    this._editor.newSection = "";
    this._editor.sectionError = "";
    this._editor.creatingSection = false;
    this._render()
  }
  _state(r) {
    return !r.result ? "idle"
           : !r.result.error && r.result.status >= 200 && r.result.status < 300
               ? "ok"
               : "fail"
  }
  _visible() {
    return this._requests.filter(r => this._filter === "all" ||
                                      this._state(r) === this._filter)
  }
  _groups(rs) {
    const g = new Map;
    for (const r of rs) {
      const s = (r.config.section || "").trim();
      if (!g.has(s))
        g.set(s, []);
      g.get(s).push(r)
    }
    if (g.has("")) {
      const unsectioned = g.get("");
      g.delete("");
      g.set("", unsectioned)
    }
    return g
  }
  _sections() {
    return [...this._groups(this._requests).keys() ].filter(Boolean)
  }
  _toggleAll() {
    const ids = this._visible()
                    .filter(r => !this._grouped ||
                                 !this._collapsed.has(
                                     (r.config.section || "").trim()))
                    .map(r => r.entry_id),
          all = ids.length && ids.every(id => this._expanded.has(id));
    ids.forEach(id => all ? this._expanded.delete(id) : this._expanded.add(id));
    this._render()
  }
  _err(e) { return e?.message || e?.code || String(e) }
  _render(focus = false) {
    if (!this.shadowRoot)
      return;
    const t = this._t, v = this._visible(), g = this._groups(v),
          counts = {all : this._requests.length, ok : 0, fail : 0, idle : 0};
    this._requests.forEach(r => counts[this._state(r)]++);
    const candidates = this._grouped
                           ? v.filter(r => !this._collapsed.has(
                                          (r.config.section || "").trim()))
                           : v,
          allOpen = candidates.length &&
                    candidates.every(r => this._expanded.has(r.entry_id));
    this.shadowRoot.innerHTML = `<style>${STYLES}${
        HANDOFF_STYLES}</style><main><header><div><h1>${t.title}</h1><p>${
        t.subtitle}</p></div><div class="toolbar"><button class="secondary" data-action="refresh" ${
        this._loading ? "disabled" : ""}><ha-icon icon="mdi:refresh" class="${
        this._loading ? "spin" : ""}"></ha-icon>${
        t.refresh}</button><button class="primary" data-action="add"><ha-icon icon="mdi:plus"></ha-icon>${
        t.add}</button></div></header><nav class="controls" aria-label="Filters"><div class="filters">${
            ["all", "ok", "fail", "idle"]
                .map(f => `<button class="filter ${
                         this._filter === f
                             ? "active"
                             : ""}" data-action="filter" data-filter="${
                         f}" aria-pressed="${this._filter === f}">${t[f]} <b>${
                         counts[f]}</b></button>`)
                .join(
                    "")}</div><button class="view-toggle" data-action="toggle-grouping"><ha-icon icon="mdi:view-${
        this._grouped ? "grid-outline" : "agenda-outline"}"></ha-icon>${
        this._grouped
            ? (t.ungroup || "Ungroup")
            : (t.group ||
               "Group in sections")}</button><button class="view-toggle expand-all" data-action="toggle-all" ${
        v.length ? "" : "disabled"}><ha-icon icon="mdi:unfold-${
        allOpen ? "less" : "more"}-horizontal"></ha-icon>${
        allOpen ? t.collapseAll : t.expandAll}</button></nav>${
        this._error
            ? `<div class="alert" role="alert">${escapeHtml(this._error)}</div>`
            : ""}${
        this._loading
            ? `<div class="empty"><ha-circular-progress active></ha-circular-progress></div>`
            : ""}${
    !this._loading && !this._requests.length
        ? `<div class="empty"><ha-icon icon="mdi:web-off"></ha-icon><p>${
              t.noRequests}</p></div>`
        : ""}${
    !this._loading && this._requests.length && !v.length
        ? `<div class="empty"><ha-icon icon="mdi:filter-off-outline"></ha-icon><p>${
              t.noMatches}</p></div>`
        : ""}<div class="groups">${
        (this._grouped ? [...g ].map(([ s, rs ]) => this._group(s, rs, true))
                       : [ this._group("", v, false) ])
            .join("")}</div></main>${
        this._selected ? this._details(this._selected)
                       : ""}${this._editor ? this._editorHtml() : ""}${
        this._deleteCandidate ? this._deleteHtml() : ""}`;
    if (focus)
      queueMicrotask(
          () =>
              this.shadowRoot
                  .querySelector(
                      '[role="dialog"] button,[role="alertdialog"] button,input')
                  ?.focus())
  }
  _group(s, rs, showHeader = true) {
    const closed = this._collapsed.has(s), t = this._t;
    return `<section>${
        showHeader
        ? `<button class="section-head" data-action="toggle-section" data-section="${
              escapeHtml(s)}" aria-expanded="${
    !closed}"><ha-icon icon="mdi:chevron-${
        closed ? "right" : "down"}"></ha-icon><strong>${
        escapeHtml(s || t.unsectioned)}</strong><em>${rs.length} ${
        t.requests}</em><i></i></button>`: ""}${
        showHeader && closed
        ? ""
        : `<div class="grid">${
              rs.map(r => this._card(r)).join("")}</div>`}</section>`
  }
  _card(r) {
    const t = this._t, c = r.config, z = r.result, state = this._state(r),
          open = this._expanded.has(r.entry_id),
          running = this._running.has(r.entry_id),
          status =
              state === "idle" ? t.noResponse
              : z.error
                  ? t.error
                  : `${z.status}${z.reason ? ` ${escapeHtml(z.reason)}` : ""}`,
          response = z?.formatted_body || z?.body || z?.error || "";
    return `<article class="card state-${
        state}"><span class="rail"></span><div class="card-body"><div class="card-top"><span class="method ${
        c.method}">${escapeHtml(c.method)}</span><span class="status"><i></i>${
        status}</span></div><h2 title="${escapeHtml(c.name)}">${
        escapeHtml(c.name)}</h2><code title="${escapeHtml(c.url)}">${
        escapeHtml(
            c.url)}</code><div class="response-box"><div class="response-head"><span>${
        t.response}</span><button data-action="toggle-response" data-entry-id="${
        r.entry_id}" aria-expanded="${open}">${
        open ? (t.collapse || "Collapse")
             : (t.expand || "Expand")}<ha-icon icon="mdi:chevron-down" class="${
        open ? "open" : ""}"></ha-icon></button></div><pre class="preview ${
        open ? "open" : ""} ${response ? "" : "muted"}">${
        escapeHtml(response || t.noResponse)}</pre></div>${
        z?.truncated ? `<small>${t.truncated}</small>`
                     : ""}<div class="meta"><span>${
        z ? formatDate(z.timestamp) : "—"}</span><span><i></i>${
        z ? `${z.elapsed_ms} ms`
          : "—"}</span></div></div><footer><button class="primary" data-action="run" data-entry-id="${
        r.entry_id}" title="${!r.loaded ? t.loadedError : ""}" ${
        running || !r.loaded ? "disabled" : ""}><ha-icon icon="mdi:${
        running ? "loading"
                : "play"}" class="${running ? "spin" : ""}"></ha-icon>${
        running
            ? t.running
            : t.run}</button><button class="secondary" data-action="details" data-entry-id="${
        r.entry_id}">${
        t.details}</button><button class="secondary icon" data-action="edit" data-entry-id="${
        r.entry_id}" aria-label="${
        t.edit}"><ha-icon icon="mdi:pencil-outline"></ha-icon></button></footer></article>`
  }
  _details(r) {
    const t = this._t, c = r.config, z = r.result,
          h = Object.keys(c.headers || {}).length
                  ? JSON.stringify(c.headers, null, 2)
                  : "—",
          state = this._state(r),
          status = state === "idle" ? t.noResponse
                   : z.error ? t.error
                             : `${z.status}${z.reason ? ` ${z.reason}` : ""}`,
          dump = z ? `Status: ${status}\nContent-Type: ${
                         z.content_type ||
                         "—"}\nDuration: ${z.elapsed_ms} ms\nReceived: ${
                         formatDate(z.timestamp)}\n\nBody:\n${
                         z.formatted_body || z.body || z.error ||
                         t.empty}${z.truncated ? `\n\n[${t.truncated}]` : ""}`
                   : t.noResponse;
    return `<div class="overlay" data-action="close-details"><section class="dialog state-${
        state}" role="dialog" aria-modal="true" aria-labelledby="details-title"><div class="dialog-head"><div><span class="method ${
        c.method}">${c.method}</span><h2 id="details-title">${
        escapeHtml(c.name)}</h2><span class="status"><i></i>${
        escapeHtml(status)}</span></div><span class="section-pill">${
        escapeHtml(
            c.section ||
            t.unsectioned)}</span><button class="icon" data-action="close-details" aria-label="${
        t.close}"><ha-icon icon="mdi:close"></ha-icon></button></div><div class="detail-grid"><section><h3>${
        t.configuration}</h3><dl><dt>URL</dt><dd><code>${
        escapeHtml(c.url)}</code></dd><dt>${t.section}</dt><dd>${
        escapeHtml(c.section || t.unsectioned)}</dd><dt>${t.source}</dt><dd>${
        r.source === "yaml" ? t.yaml : t.ui}</dd><dt>${t.timeout}</dt><dd>${
        c.timeout} s</dd><dt>${t.responseLimit}</dt><dd>${
        c.response_limit} B</dd><dt>${t.verifySsl}</dt><dd>${
        c.verify_ssl ? t.yes : t.no}</dd><dt>${t.redirects}</dt><dd>${
        c.follow_redirects ? t.yes
                           : t.no}</dd></dl><label>${t.headers}</label><pre>${
        escapeHtml(h)}</pre><label>${t.body}</label><pre>${
        escapeHtml(c.body || "—")}</pre></section><section><h3>${
        t.response}</h3><pre class="full-response">${
        escapeHtml(
            dump)}</pre></section></div><div class="dialog-actions"><button class="danger-text" data-action="delete" data-entry-id="${
        r.entry_id}">${
        t.delete}</button><i></i><button class="secondary" data-action="edit" data-entry-id="${
        r.entry_id}">${
        t.edit}</button><button class="primary" data-action="run" data-entry-id="${
        r.entry_id}" ${
        this._running.has(r.entry_id) || !r.loaded ? "disabled" : ""}>${
        this._running.has(r.entry_id) ? t.running
                                      : t.run}</button></div></section></div>`
  }
  _editorHtml() {
    const t = this._t, e = this._editor, c = e.config,
          sections =
              [
                "", ...this._sections(),
                ...(c.section && !this._sections().includes(c.section)
                        ? [ c.section ]
                        : [])
              ],
          methods = [ "GET", "POST", "PUT", "PATCH", "DELETE" ];
    return `<div class="overlay" data-action="close-editor"><section class="dialog editor" role="dialog" aria-modal="true" aria-labelledby="editor-title"><form id="request-editor"><div class="dialog-head"><h2 id="editor-title">${
        e.entry_id
            ? t.editTitle
            : t.addTitle}</h2><button type="button" class="icon" data-action="close-editor" aria-label="${
        t.close}" ${
        this._saving
            ? "disabled"
            : ""}><ha-icon icon="mdi:close"></ha-icon></button></div><div class="form">${
        e.source === "yaml" ? `<div class="warning">${t.yamlWarning}</div>`
                            : ""}<label class="name-field"><span>${
        t.name}</span><input name="name" required maxlength="128" value="${
        escapeHtml(c.name)}"></label><label class="url-field"><span>${
        t.url}</span><input name="url" type="url" required value="${
        escapeHtml(
            c.url)}"></label><fieldset class="wide section-field"><div class="section-title"><legend>${
        t.section}</legend><button type="button" data-action="toggle-new-section">${
        e.creatingSection ? t.cancel : `＋ ${t.newSection}`}</button></div>${
        e.creatingSection
            ? `<div class="new-section"><input name="new_section" maxlength="128" value="${
                  escapeHtml(e.newSection)}" placeholder="${
                  t.sectionName}"><button type="button" class="primary" data-action="create-section">${
                  t.createSection}</button></div>`
            : `<input type="hidden" name="new_section" value="">`}<input type="hidden" name="section" value="${
        escapeHtml(c.section || "")}"><div class="chips">${
        sections
            .map(s => `<button type="button" class="chip ${
                     (c.section || "") === s
                         ? "selected"
                         : ""}" data-action="select-section" data-section="${
                     escapeHtml(s)}" aria-pressed="${
                     (c.section || "") ===
                     s}">${escapeHtml(s || t.unsectioned)}</button>`)
            .join("")}</div>${
        e.sectionError ? `<small class="error">${e.sectionError}</small>`
                       : ""}</fieldset><label class="method-field"><span>${
        t.method}</span><select name="method">${
        methods
            .map(m => `<option value="${m}" ${
                     c.method === m ? "selected" : ""}>${m}</option>`)
            .join("")}</select></label><label class="timeout-field"><span>${
        t.timeout} (s)</span><input name="timeout" type="number" required min="1" max="300" value="${
        escapeHtml(c.timeout)}"></label><label class="limit-field"><span>${
        t.responseLimit} (B)</span><input name="response_limit" type="number" required min="256" max="65536" step="256" value="${
        escapeHtml(
            c.response_limit)}"></label><label class="wide headers-field"><span>${
        t.headers}</span><small>${
        t.headersHelp}</small><textarea name="headers" rows="6">${
        escapeHtml(
            e.headersText)}</textarea></label><label class="wide body-field"><span>${
        t.body}</span><textarea name="body" rows="7">${
        escapeHtml(
            c.body)}</textarea></label><div class="toggles wide toggle-field"><label><input name="verify_ssl" type="checkbox" ${
        c.verify_ssl ? "checked" : ""}>${
        t.verifySsl}</label><label><input name="follow_redirects" type="checkbox" ${
        c.follow_redirects ? "checked" : ""}>${t.redirects}</label></div>${
        this._error ? `<div class="alert wide">${escapeHtml(this._error)}</div>`
                    : ""}</div><div class="dialog-actions">${
        e.entry_id
            ? `<button type="button" class="danger-text" data-action="delete" data-entry-id="${
                  e.entry_id}" ${this._saving ? "disabled" : ""}>${
                  t.delete}</button>`
            : ""}<i></i><button type="button" class="secondary" data-action="close-editor" ${
        this._saving
            ? "disabled"
            : ""}>${t.cancel}</button><button type="submit" class="primary" ${
        this._saving ? "disabled" : ""}>${
        this._saving ? t.saving : t.save}</button></div></form></section></div>`
  }
  _deleteHtml() {
    const t = this._t, r = this._deleteCandidate;
    return `<div class="overlay" data-action="cancel-delete"><section class="dialog confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><div class="confirm-body"><h2 id="delete-title">${
        t.deleteTitle}</h2><strong>${escapeHtml(r.config.name)}</strong><p>${
        t.deleteConfirm}</p>${
        r.source === "yaml" ? `<div class="warning">${t.yamlWarning}</div>`
                            : ""}${
        this._error
            ? `<div class="alert">${escapeHtml(this._error)}</div>`
            : ""}</div><div class="dialog-actions"><i></i><button class="secondary" data-action="cancel-delete" ${
        this._deleting ? "disabled" : ""}>${
        t.cancel}</button><button class="danger" data-action="confirm-delete" ${
        this._deleting ? "disabled" : ""}>${
        this._deleting ? t.deleting : t.delete}</button></div></section></div>`
  }
}

function escapeHtml(v) {
  return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;")
}
function formatDate(v) {
  if (!v)
    return "—";
  try {
    return new Intl
        .DateTimeFormat(undefined, {dateStyle : "medium", timeStyle : "short"})
        .format(new Date(v))
  } catch (_) {
    return v
  }
}

const STYLES =
    `:host{display:block;min-height:100%;background:var(--primary-background-color,#10151c);color:var(--primary-text-color,#f3f6f9);font-family:var(--ha-font-family,Roboto,sans-serif)}*{box-sizing:border-box}main{max-width:1480px;margin:auto;padding:32px clamp(16px,3vw,42px) 50px}header,.toolbar,.controls,.filters,.card-top,.meta,footer,.dialog-head,.dialog-actions,.chips,.new-section,.methods,.toggles{display:flex;align-items:center}header{justify-content:space-between;gap:20px;margin-bottom:25px}h1{margin:0 0 6px;font-size:32px}header p{margin:0;color:var(--secondary-text-color,#9aa6b4)}button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:0 14px;border:0;border-radius:9px;font:600 13px inherit;cursor:pointer}button:disabled{opacity:.5;cursor:not-allowed}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--primary-color,#03a9f4);outline-offset:2px}.primary{color:var(--text-primary-color,#fff);background:var(--primary-color,#03a9f4)}.secondary{color:var(--primary-text-color,#fff);background:var(--secondary-background-color,#222b36)}.toolbar{gap:9px}.controls{justify-content:space-between;gap:12px;margin-bottom:27px;padding:8px;border:1px solid var(--divider-color,#2d3743);border-radius:13px;background:var(--card-background-color,#171e27)}.filters{gap:4px;overflow:auto}.filter{color:var(--secondary-text-color,#9aa6b4);background:transparent}.filter b{padding:3px 6px;border-radius:9px;background:var(--secondary-background-color,#222b36)}.filter.active{color:var(--primary-text-color,#fff);background:color-mix(in srgb,var(--primary-color,#03a9f4) 16%,transparent)}.groups{display:grid;gap:28px}.section-head{width:100%;justify-content:flex-start;padding:0 2px;color:inherit;background:transparent}.section-head em{padding:3px 7px;border-radius:9px;color:var(--secondary-text-color,#9aa6b4);background:var(--secondary-background-color,#222b36);font-size:10px;font-style:normal}.section-head i{height:1px;flex:1;margin-left:10px;background:var(--divider-color,#2d3743)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(315px,1fr));gap:16px;margin-top:11px}.card{position:relative;display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--divider-color,#2d3743);border-radius:14px;background:var(--card-background-color,#171e27)}.rail{position:absolute;inset:0 auto 0 0;width:4px;background:var(--disabled-text-color,#657180)}.state-ok .rail,.state-ok .status i{background:var(--success-color,#45b36b)}.state-fail .rail,.state-fail .status i{background:var(--error-color,#ef5b5b)}.card-body{flex:1;padding:18px 18px 15px 21px}.card-top{justify-content:space-between}.method{padding:5px 9px;border-radius:6px;color:#71c7ff;background:#2495dd26;font:700 11px var(--code-font-family,monospace)}.method.POST,.method.PUT,.method.PATCH{color:#d5a6ff;background:#9b5bd22b}.method.DELETE{color:#ff9191;background:#dc46462b}.status{display:flex;align-items:center;gap:6px;color:var(--secondary-text-color,#9aa6b4);font-size:11px}.status i{width:7px;height:7px;border-radius:50%;background:var(--disabled-text-color,#657180)}.card h2{margin:14px 0 5px;overflow:hidden;font-size:18px;text-overflow:ellipsis;white-space:nowrap}.card code{display:block;overflow:hidden;color:var(--secondary-text-color,#9aa6b4);font:12px var(--code-font-family,monospace);text-overflow:ellipsis;white-space:nowrap}.meta{flex-wrap:wrap;gap:7px 12px;margin-top:13px;color:var(--secondary-text-color,#9aa6b4);font-size:10px}.meta span{display:flex;align-items:center;gap:4px}.meta ha-icon{--mdc-icon-size:13px}.response-toggle{width:100%;justify-content:space-between;margin-top:10px;padding:0;color:var(--secondary-text-color,#9aa6b4);background:transparent;font-size:10px;text-transform:uppercase}.preview,.detail-grid pre{overflow:auto;padding:11px;border:1px solid var(--divider-color,#2d3743);border-radius:8px;background:var(--secondary-background-color,#111820);font:11px/1.5 var(--code-font-family,monospace);white-space:pre-wrap;overflow-wrap:anywhere}.preview{max-height:150px;margin:0}.card small,.detail-grid small{color:var(--warning-color,#ffb648)}footer{gap:8px;padding:12px 14px 12px 18px;border-top:1px solid var(--divider-color,#2d3743)}footer button{flex:1}footer .icon{flex:0 0 40px}.empty{display:grid;place-items:center;min-height:280px;color:var(--secondary-text-color,#9aa6b4);text-align:center}.alert,.warning{padding:12px;border-radius:8px}.alert{color:var(--error-color,#ef5b5b);background:#ef5b5b18}.warning{color:var(--warning-color,#ffb648);background:#ffb64818}.overlay{position:fixed;z-index:10;inset:0;display:grid;place-items:center;padding:20px;background:#05090dbb;backdrop-filter:blur(3px)}.dialog{width:min(1040px,100%);max-height:94vh;overflow:auto;border:1px solid var(--divider-color,#2d3743);border-radius:16px;background:var(--card-background-color,#171e27)}.dialog-head{position:sticky;z-index:2;top:0;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--divider-color,#2d3743);background:inherit}.dialog-head>div{display:flex;align-items:center;gap:12px}.dialog-head h2{margin:0}.icon{width:40px;padding:0;color:inherit;background:transparent}.detail-grid{display:grid;grid-template-columns:1fr 1fr}.detail-grid>section{min-width:0;padding:22px}.detail-grid>section+section{border-left:1px solid var(--divider-color,#2d3743)}h3{margin:0 0 17px;font-size:14px}dl{display:grid;grid-template-columns:120px 1fr;gap:9px 13px;font-size:12px}dt{color:var(--secondary-text-color,#9aa6b4)}dd{margin:0;overflow-wrap:anywhere}.detail-grid label{display:block;margin:16px 0 6px;color:var(--secondary-text-color,#9aa6b4);font-size:10px;text-transform:uppercase}.full-response{min-height:330px;max-height:510px}.summary{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:12px}.summary span{display:flex;flex-direction:column;padding:8px;background:var(--secondary-background-color,#111820);font-size:11px}.summary b{color:var(--secondary-text-color,#9aa6b4);font-size:9px}.dialog-actions{position:sticky;z-index:2;bottom:0;gap:9px;padding:13px 22px;border-top:1px solid var(--divider-color,#2d3743);background:inherit}.dialog-actions i{flex:1}.danger{color:#fff;background:var(--error-color,#ef5b5b)}.danger-text{color:var(--error-color,#ef5b5b);background:transparent}.editor{width:min(780px,100%)}.form{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:22px}.wide{grid-column:1/-1}.form label>span,legend{display:block;margin-bottom:7px;font-size:12px;font-weight:600}.form label>small{display:block;margin-bottom:7px;color:var(--secondary-text-color,#9aa6b4);font-size:10px}fieldset{min-width:0;margin:0;padding:0;border:0}.chips,.methods,.toggles{flex-wrap:wrap;gap:8px}.chip{min-height:34px;color:var(--secondary-text-color,#9aa6b4);border:1px solid var(--divider-color,#2d3743);border-radius:18px;background:transparent}.chip.selected{color:var(--primary-color,#03a9f4);border-color:var(--primary-color,#03a9f4)}.new-section{gap:8px;margin-top:11px}.new-section input{flex:1}.error{display:block;margin-top:7px;color:var(--error-color,#ef5b5b)}.methods label input{position:absolute;opacity:0}.methods span{display:block;padding:9px 12px;border:1px solid var(--divider-color,#2d3743);border-radius:7px;font:700 11px var(--code-font-family,monospace);cursor:pointer}.methods input:checked+span{color:var(--primary-color,#03a9f4);border-color:var(--primary-color,#03a9f4)}input,textarea{width:100%;color:inherit;border:1px solid var(--divider-color,#2d3743);border-radius:8px;background:var(--secondary-background-color,#111820);font:13px inherit}input{height:42px;padding:0 11px}textarea{padding:10px;font-family:var(--code-font-family,monospace);resize:vertical}.toggles label{display:flex;align-items:center;gap:7px}.toggles input{width:18px;height:18px}.confirm{width:min(500px,100%)}.confirm-body{padding:24px}.confirm-body h2{margin-top:0}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:720px){main{padding-top:20px}header,.controls{align-items:stretch;flex-direction:column}.toolbar button{flex:1}.expand-all{width:100%}.grid,.detail-grid,.form{grid-template-columns:1fr}.detail-grid>section+section{border-left:0;border-top:1px solid var(--divider-color,#2d3743)}.wide{grid-column:auto}.dialog-actions{flex-wrap:wrap}.dialog-actions button{flex:1}.dialog-actions i{display:none}.new-section{align-items:stretch;flex-direction:column}.summary{grid-template-columns:1fr}}`;

const HANDOFF_STYLES = `
  :host{--hr-bg:var(--primary-background-color,#0b0d0f);--hr-card:var(--card-background-color,#13181d);--hr-surface:var(--secondary-background-color,#0c1013);--hr-border:var(--divider-color,#1e242b);--hr-text:var(--primary-text-color,#e8ecf1);--hr-muted:var(--secondary-text-color,#8b95a1);--hr-primary:var(--primary-color,#0ea5e9);background:radial-gradient(120% 80% at 15% -10%,color-mix(in srgb,var(--hr-bg) 75%,#252d36) 0%,var(--hr-bg) 60%);color:var(--hr-text);font-family:var(--ha-font-family,Manrope,system-ui,sans-serif)}
  :host([data-dark]){--hr-bg:#0b0d0f;--hr-card:#13181d;--hr-surface:#0c1013;--hr-border:#1e242b;--hr-text:#e8ecf1;--hr-muted:#8b95a1;--hr-primary:#0ea5e9}
  .primary{background:var(--hr-primary);color:#03151f}
  *::-webkit-scrollbar{width:6px;height:6px}*::-webkit-scrollbar-thumb{background:#2a3038;border-radius:3px}
  main{max-width:1672px;padding:40px clamp(20px,4vw,56px) 72px}header{align-items:flex-end;gap:24px;margin-bottom:28px}h1{font-size:34px;line-height:1.1;letter-spacing:-.02em}header p{font-size:15px;max-width:52ch}.toolbar{gap:10px}.toolbar button{height:42px;border-radius:11px;font-size:14px}.toolbar .secondary{border:1px solid #232a32;background:#151a1f;color:#c8d2dc}.toolbar .primary{padding:0 18px;color:#03151f;box-shadow:0 6px 20px -8px color-mix(in srgb,var(--hr-primary) 80%,transparent)}
  .controls{gap:8px;margin-bottom:24px;padding:0;border:0;border-radius:0;background:transparent}.filters{gap:8px}.filter,.view-toggle{height:34px;min-height:34px;padding:0 14px;border:1px solid #1f262e;border-radius:99px;background:#12171c;color:#8b95a1;font-size:13px}.filter::before{content:"";width:6px;height:6px;border-radius:50%;background:#64748b}.filter[data-filter="ok"]::before{background:#34d399}.filter[data-filter="fail"]::before{background:#f87171}.filter[data-filter="idle"]::before{background:#94a3b8}.filter b{padding:0;background:transparent;font-variant-numeric:tabular-nums;opacity:.6}.filter.active{border-color:#2b5c78;background:#1a2530;color:#e8ecf1}.view-toggle{background:transparent}.view-toggle:first-of-type{margin-left:auto}
  .groups{gap:28px}.section-head{gap:14px;height:auto;min-height:0;padding:0 2px 14px}.section-head strong{font-size:15px;letter-spacing:.02em}.section-head em{padding:0;background:transparent;color:#5f6b78;font-size:12px;font-weight:600}.section-head>i{margin-left:0;background:linear-gradient(90deg,#1e242b,transparent)}.section-head ha-icon{color:#5f6b78;--mdc-icon-size:16px}.grid{grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:16px;margin:0}
  .card{border:1px solid #1e242b;border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,var(--hr-card) 96%,#13181d),color-mix(in srgb,var(--hr-card) 90%,#101418))}.card:hover{border-color:#2b333d}.rail{position:static;width:auto;height:2px;background:#64748b;opacity:.9}.state-ok .rail{background:var(--success-color,#34d399)}.state-fail .rail{background:var(--error-color,#f87171)}.card-body{padding:16px 18px 14px;display:flex;flex-direction:column;gap:12px}.method{padding:4px 8px;font-size:10.5px;font-weight:500;letter-spacing:.12em;color:#7dd3fc;background:rgba(56,189,248,.12)}.method.POST,.method.PUT,.method.PATCH,.method.DELETE{color:#c4b5fd;background:rgba(167,139,250,.14)}.status{font-size:12px;font-weight:600;color:#64748b}.status i{box-shadow:0 0 0 3px rgba(100,116,139,.16)}.state-ok .status{color:var(--success-color,#34d399)}.state-ok .status i{box-shadow:0 0 0 3px rgba(52,211,153,.16)}.state-fail .status{color:var(--error-color,#f87171)}.state-fail .status i{box-shadow:0 0 0 3px rgba(248,113,113,.16)}.card h2{margin:0 0 -7px;font-size:18px;letter-spacing:-.01em}.card code{font-size:11.5px;color:#6f7b88}.response-box{overflow:hidden;border:1px solid #1c2229;border-radius:11px;background:#0c1013}.response-head{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #171d23}.response-head>span{font-size:10px;font-weight:700;letter-spacing:.14em;color:#5f6b78;text-transform:uppercase}.response-head button{min-height:0;padding:0;background:transparent;color:#6f7b88;font-size:11px}.response-head ha-icon{transition:transform .18s ease;--mdc-icon-size:15px}.response-head ha-icon.open{transform:rotate(180deg)}.preview{height:auto;min-height:0;max-height:104px;margin:0;padding:12px;border:0;border-radius:0;background:transparent;color:#cbd5e1;font-size:12px;line-height:1.55;transition:max-height .22s ease}.preview.open{max-height:320px}.preview.muted{color:#4d5762}.meta{justify-content:space-between;margin:0;color:#5f6b78;font-size:11.5px;font-variant-numeric:tabular-nums}.meta span{gap:6px}.meta i{width:4px;height:4px;border-radius:50%;background:#39424c}footer{gap:8px;padding:12px 18px;border-top:1px solid #1a2027;background:#0f1317}footer button{height:38px;border-radius:10px;font-size:13.5px}footer .primary{color:#03151f}.card footer .secondary{border:1px solid #242b33;background:transparent;color:#a9b4c0}
  .overlay{z-index:60;padding:clamp(16px,4vw,48px);background:rgba(4,6,8,.7);backdrop-filter:blur(6px)}.dialog{width:min(1060px,100%);max-height:86vh;border:1px solid #232a32;border-radius:20px;background:color-mix(in srgb,var(--hr-card) 94%,#121619);box-shadow:0 40px 100px -30px rgba(0,0,0,.9)}.dialog-head{position:static;gap:16px;padding:20px 24px;border-color:#1e242b}.dialog-head>div{gap:16px;min-width:0}.dialog-head h2{font-size:22px;letter-spacing:-.01em}.dialog-head .status{flex:none}.section-pill{margin-left:auto;padding:5px 11px;border:1px solid #242b33;border-radius:99px;color:#8b95a1;font-size:12px;font-weight:600}.dialog-head .icon{width:34px;height:34px;min-height:34px;border:1px solid #242b33;border-radius:9px}.detail-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);overflow:auto}.detail-grid>section{padding:24px}.detail-grid>section+section{border-color:#1e242b}.detail-grid h3{font-size:16px}.detail-grid dl{grid-template-columns:150px minmax(0,1fr);gap:0;margin:0}.detail-grid dt,.detail-grid dd{padding:9px 0;border-bottom:1px solid #171d23;font-size:13.5px}.detail-grid dt{color:#8b95a1}.detail-grid dd{color:#e8ecf1}.detail-grid dd code{font-size:12.5px;color:#cbd5e1;word-break:break-all}.detail-grid label{margin:18px 0 8px;font-size:10px;font-weight:700;letter-spacing:.14em;color:#5f6b78}.detail-grid pre{padding:14px;border-color:#1c2229;border-radius:11px;background:#0c1013;font-size:12.5px;color:#7c8794}.detail-grid .full-response{min-height:430px;padding:16px;border-radius:12px;color:#cbd5e1;line-height:1.65}.dialog-actions{position:static;padding:16px 24px;border-color:#1e242b;background:#0f1317}.dialog-actions button{height:40px;border-radius:10px;font-size:13.5px}.dialog-actions .secondary{border:1px solid #242b33;background:transparent;color:#c8d2dc}
  .editor{width:min(760px,100%)}.editor .dialog-head h2{font-size:20px}.form{grid-template-columns:repeat(6,minmax(0,1fr));gap:20px 16px;padding:24px}.name-field,.url-field{grid-column:span 3;order:1}.method-field,.timeout-field,.limit-field{grid-column:span 2;order:2}.section-field{grid-column:1/-1;order:3}.headers-field{order:4}.body-field{order:5}.toggle-field{order:6}.form>.warning{grid-column:1/-1;order:0}.form>.alert{order:7}.form label>span,legend{font-size:13px;color:#c8d2dc}.form input,.form textarea,.form select{width:100%;border:1px solid #242b33;border-radius:10px;background:#0e1216;color:#e8ecf1;font:13.5px var(--ha-font-family,system-ui,sans-serif)}.form input,.form select{height:42px;padding:0 13px}.name-field input,.url-field input{font-family:var(--code-font-family,ui-monospace,monospace);font-size:13px}.form textarea{min-height:110px;padding:12px 13px;border-radius:11px;font:12.5px/1.6 var(--code-font-family,ui-monospace,monospace)}.form fieldset{padding:16px;border:1px solid #1f2a33;border-radius:13px;background:#0e1418}.section-title{display:flex;align-items:center;justify-content:space-between}.section-title legend{margin:0;font-weight:700;color:#e8ecf1}.section-title button{min-height:0;padding:0;border:0;background:transparent;color:#38bdf8;font-size:12.5px}.chip{height:34px;border-color:#1f262e;border-radius:99px;background:#12171c;font-size:13px}.chip.selected{border-color:#2b5c78;background:#123043;color:#e8ecf1}.section-field .chips{margin-top:10px}.new-section input{height:40px;border-color:#2b5c78}.new-section button{height:40px;color:#03151f;background:var(--hr-primary)}.toggles{gap:22px}.toggles label{font-size:13.5px}.confirm{width:min(500px,100%)}
  .form .toggles input{width:17px;height:17px;padding:0;flex:0 0 17px;accent-color:var(--hr-primary)}
  @media(max-width:900px){.detail-grid{grid-template-columns:1fr}.detail-grid>section+section{border-left:0;border-top:1px solid #1e242b}.form{grid-template-columns:1fr}.form>*{grid-column:1!important}.wide{grid-column:auto}}
  @media(max-width:720px){main{padding:24px 20px 48px}header{align-items:stretch}.controls{align-items:stretch}.view-toggle:first-of-type{margin-left:0}.grid{grid-template-columns:1fr}.dialog-head{flex-wrap:wrap}.section-pill{order:3;margin-left:0}.dialog-actions{flex-wrap:wrap}}
`;
if (!customElements.get("http-requests-panel"))
  customElements.define("http-requests-panel", HttpRequestsPanel);
