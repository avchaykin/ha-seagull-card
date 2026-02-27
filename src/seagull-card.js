const fireEvent = (node, type, detail = {}, options = {}) => {
  const event = new Event(type, {
    bubbles: options.bubbles ?? true,
    cancelable: Boolean(options.cancelable),
    composed: options.composed ?? true,
  });
  event.detail = detail;
  node.dispatchEvent(event);
  return event;
};

class SeagullCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._rendered = {};
    this._unsubs = {};
  }

  static getConfigElement() {
    return document.createElement("seagull-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:seagull-card",
      entity: "light.kitchen",
      text_template: "{{ state_attr(entity, 'friendly_name') }}",
      color_template: "{{ 'var(--state-light-active-color)' if is_state(entity, 'on') else '#9e9e9e' }}",
      icon_template: "{{ 'mdi:lightbulb-on' if is_state(entity, 'on') else 'mdi:lightbulb' }}",
      icon_color_template: "{{ '#000000' }}",
      icon_background_color_template: "{{ '#ffffff' }}",
      tap_action: { action: "more-info" },
      icon_tap_action: { action: "toggle" },
    };
  }

  setConfig(config) {
    if (!config?.entity) {
      throw new Error("Seagull Card: entity is required");
    }

    this._config = {
      tap_action: { action: "more-info" },
      icon_tap_action: { action: "none" },
      ...config,
    };

    this._subscribeTemplates();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._subscribeTemplates();
    this._render();
  }

  connectedCallback() {
    this._subscribeTemplates();
    this._render();
  }

  disconnectedCallback() {
    this._clearTemplateSubs();
  }

  _clearTemplateSubs() {
    Object.values(this._unsubs).forEach((unsub) => {
      try {
        unsub?.();
      } catch (_e) {}
    });
    this._unsubs = {};
  }

  _subscribeTemplates() {
    if (!this._hass || !this._config) return;

    this._clearTemplateSubs();

    const templates = {
      color: this._config.color_template,
      icon: this._config.icon_template,
      icon_color: this._config.icon_color_template,
      icon_background_color: this._config.icon_background_color_template,
      text: this._config.text_template,
    };

    Object.entries(templates).forEach(([key, template]) => {
      if (!template || typeof template !== "string") return;

      this._unsubs[key] = this._hass.connection.subscribeMessage(
        (msg) => {
          if (msg?.result !== undefined) {
            this._rendered[key] = String(msg.result);
            this._render();
          }
        },
        {
          type: "render_template",
          template,
          entity_ids: [this._config.entity],
          variables: { entity: this._config.entity },
        }
      );
    });
  }

  _getStateObj() {
    return this._hass?.states?.[this._config?.entity];
  }

  _resolvedValue(key, fallback) {
    const value = this._rendered[key];
    return value !== undefined && value !== "" ? value : fallback;
  }

  _handleAction(actionConfig) {
    if (!this._hass || !this._config) return;

    const action = actionConfig?.action || "none";
    const entityId = actionConfig?.entity || this._config.entity;

    switch (action) {
      case "more-info":
        fireEvent(this, "hass-more-info", { entityId });
        break;
      case "navigate":
        if (actionConfig.navigation_path) {
          history.pushState(null, "", actionConfig.navigation_path);
          fireEvent(window, "location-changed", { replace: false });
        }
        break;
      case "url":
        if (actionConfig.url_path) {
          window.open(actionConfig.url_path, "_blank");
        }
        break;
      case "toggle":
        if (entityId) {
          this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
        }
        break;
      case "call-service": {
        const service = actionConfig.service;
        if (!service || !service.includes(".")) break;
        const [domain, serviceName] = service.split(".");
        this._hass.callService(domain, serviceName, actionConfig.data || {}, actionConfig.target);
        break;
      }
      case "none":
      default:
        break;
    }
  }

  _render() {
    if (!this._config) return;

    const stateObj = this._getStateObj();
    const fallbackText = stateObj?.attributes?.friendly_name || this._config.entity;

    const cardColor = this._resolvedValue("color", "#9e9e9e");
    const icon = this._resolvedValue("icon", stateObj?.attributes?.icon || "mdi:help-circle");
    const iconColor = this._resolvedValue("icon_color", "#000000");
    const iconBackground = this._resolvedValue("icon_background_color", "#ffffff");
    const text = this._resolvedValue("text", fallbackText);

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          min-height: 56px;
          border-radius: 9999px;
          background: ${cardColor};
          box-sizing: border-box;
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          border: none;
          box-shadow: none;
          --ha-card-border-width: 0;
        }
        .content {
          display: flex;
          align-items: center;
          width: 100%;
          min-width: 0;
          gap: 10px;
        }
        .icon-wrap {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: ${iconBackground};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex: 0 0 auto;
          padding: 0;
        }
        ha-icon {
          color: ${iconColor};
          --mdc-icon-size: 18px;
        }
        .label {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      </style>
      <ha-card class="card" tabindex="0" role="button" aria-label="${text}">
        <div class="content">
          <button class="icon-wrap" type="button" aria-label="Icon action">
            <ha-icon icon="${icon}"></ha-icon>
          </button>
          <div class="label">${text}</div>
        </div>
      </ha-card>
    `;

    const card = this.shadowRoot.querySelector(".card");
    const iconBtn = this.shadowRoot.querySelector(".icon-wrap");

    card?.addEventListener("click", () => this._handleAction(this._config.tap_action));
    card?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        this._handleAction(this._config.tap_action);
      }
    });

    iconBtn?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._handleAction(this._config.icon_tap_action);
    });
  }

  getCardSize() {
    return 1;
  }
}

class SeagullCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _onValueChanged(ev) {
    if (!this._config) return;
    const key = ev.target.dataset.configValue;
    if (!key) return;

    const value = ev.target.value;
    const newConfig = { ...this._config };

    if (key.includes(".")) {
      const [parent, child] = key.split(".");
      newConfig[parent] = { ...(newConfig[parent] || {}) };
      if (value === "") delete newConfig[parent][child];
      else newConfig[parent][child] = value;
    } else {
      if (value === "") delete newConfig[key];
      else newConfig[key] = value;
    }

    this._config = newConfig;
    fireEvent(this, "config-changed", { config: newConfig });
  }

  _render() {
    if (!this._config) return;

    if (!this.shadowRoot) this.attachShadow({ mode: "open" });

    const entityOptions = Object.keys(this._hass?.states || {})
      .slice(0, 500)
      .map((entityId) => `<option value="${entityId}"></option>`)
      .join("");

    this.shadowRoot.innerHTML = `
      <style>
        .grid { display: grid; gap: 10px; font-family: var(--primary-font-family); }
        .row { display: grid; gap: 6px; }
        label { font-size: 13px; color: var(--secondary-text-color); }
        input, select {
          width: 100%; box-sizing: border-box; padding: 8px;
          border-radius: 8px; border: 1px solid var(--divider-color);
          background: var(--card-background-color); color: var(--primary-text-color);
        }
      </style>
      <div class="grid">
        <div class="row">
          <label>Entity</label>
          <input list="seagull-entities" data-config-value="entity" value="${this._config.entity || ""}" />
          <datalist id="seagull-entities">${entityOptions}</datalist>
        </div>

        <div class="row"><label>Text template</label><input data-config-value="text_template" value="${this._config.text_template || ""}" /></div>
        <div class="row"><label>Card color template</label><input data-config-value="color_template" value="${this._config.color_template || ""}" /></div>
        <div class="row"><label>Icon template</label><input data-config-value="icon_template" value="${this._config.icon_template || ""}" /></div>
        <div class="row"><label>Icon color template</label><input data-config-value="icon_color_template" value="${this._config.icon_color_template || ""}" /></div>
        <div class="row"><label>Icon background color template</label><input data-config-value="icon_background_color_template" value="${this._config.icon_background_color_template || ""}" /></div>

        <div class="row">
          <label>Tap behavior</label>
          <select data-config-value="tap_action.action">
            ${["none", "more-info", "toggle", "navigate", "url", "call-service"].map((v) => `<option value="${v}" ${((this._config.tap_action?.action || "more-info") === v) ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>

        <div class="row">
          <label>Icon tap behavior</label>
          <select data-config-value="icon_tap_action.action">
            ${["none", "more-info", "toggle", "navigate", "url", "call-service"].map((v) => `<option value="${v}" ${((this._config.icon_tap_action?.action || "none") === v) ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
      </div>
    `;

    this.shadowRoot.querySelectorAll("input,select").forEach((el) => {
      el.addEventListener("change", this._onValueChanged.bind(this));
      el.addEventListener("input", this._onValueChanged.bind(this));
    });
  }
}

customElements.define("seagull-card", SeagullCard);
customElements.define("seagull-card-editor", SeagullCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "seagull-card",
  name: "Seagull Card",
  description: "Universal card with Jinja2 templates",
  preview: true,
});
