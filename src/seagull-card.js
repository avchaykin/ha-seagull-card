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
          transition: background-color 220ms ease, box-shadow 220ms ease;
        }
        .content {
          display: flex;
          align-items: center;
          width: 100%;
          min-width: 0;
          gap: 10px;
        }
        .icon-wrap {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: none;
          background: ${iconBackground};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex: 0 0 auto;
          padding: 0;
          transition: background-color 220ms ease, transform 180ms ease;
        }
        .icon-wrap:active {
          transform: scale(0.97);
        }
        ha-icon {
          color: ${iconColor};
          --mdc-icon-size: 24px;
          transition: color 220ms ease;
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

  _updateConfig(path, value) {
    const newConfig = { ...(this._config || {}) };

    if (path.includes(".")) {
      const [parent, child] = path.split(".");
      newConfig[parent] = { ...(newConfig[parent] || {}) };
      if (value === "" || value == null) delete newConfig[parent][child];
      else newConfig[parent][child] = value;
    } else {
      if (value === "" || value == null) delete newConfig[path];
      else newConfig[path] = value;
    }

    this._config = newConfig;
    fireEvent(this, "config-changed", { config: newConfig });
  }

  _bindInput(selector, path, eventName = "change") {
    const el = this.shadowRoot.querySelector(selector);
    if (!el) return;

    el.addEventListener(eventName, (ev) => {
      const value = ev?.detail?.value ?? el.value ?? "";
      this._updateConfig(path, value);
    });

    if (eventName !== "input") {
      el.addEventListener("input", (ev) => {
        const value = ev?.detail?.value ?? el.value ?? "";
        this._updateConfig(path, value);
      });
    }
  }

  _render() {
    if (!this._config) return;

    if (!this.shadowRoot) this.attachShadow({ mode: "open" });

    this.shadowRoot.innerHTML = `
      <style>
        .stack { display: grid; gap: 12px; }
        .section { padding: 4px 0; display: grid; gap: 12px; }
        .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field { display: grid; gap: 4px; }
        .hint { color: var(--secondary-text-color); font-size: 12px; }
        @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }
        ha-code-editor {
          --code-mirror-max-height: 140px;
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          overflow: hidden;
        }
      </style>

      <div class="stack">
        <ha-expansion-panel outlined expanded>
          <div slot="header">Context</div>
          <div class="section">
            <ha-entity-picker id="entity"></ha-entity-picker>
            <div class="hint">Entity is available in templates as <code>entity</code>.</div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined expanded>
          <div slot="header">Content Templates</div>
          <div class="section">
            <div class="field"><div class="hint">Text template</div><ha-code-editor id="text_template"></ha-code-editor></div>
            <div class="field"><div class="hint">Card color template</div><ha-code-editor id="color_template"></ha-code-editor></div>
            <div class="pair">
              <div class="field"><div class="hint">Icon template</div><ha-code-editor id="icon_template"></ha-code-editor></div>
              <div class="field"><div class="hint">Icon color template</div><ha-code-editor id="icon_color_template"></ha-code-editor></div>
            </div>
            <div class="field"><div class="hint">Icon background color template</div><ha-code-editor id="icon_background_color_template"></ha-code-editor></div>
          </div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined expanded>
          <div slot="header">Actions</div>
          <div class="section pair">
            <div class="field">
              <div class="hint">Tap behavior</div>
              <ha-select id="tap_action">
                <mwc-list-item value="none">none</mwc-list-item>
                <mwc-list-item value="more-info">more-info</mwc-list-item>
                <mwc-list-item value="toggle">toggle</mwc-list-item>
                <mwc-list-item value="navigate">navigate</mwc-list-item>
                <mwc-list-item value="url">url</mwc-list-item>
                <mwc-list-item value="call-service">call-service</mwc-list-item>
              </ha-select>
            </div>

            <div class="field">
              <div class="hint">Icon tap behavior</div>
              <ha-select id="icon_tap_action">
                <mwc-list-item value="none">none</mwc-list-item>
                <mwc-list-item value="more-info">more-info</mwc-list-item>
                <mwc-list-item value="toggle">toggle</mwc-list-item>
                <mwc-list-item value="navigate">navigate</mwc-list-item>
                <mwc-list-item value="url">url</mwc-list-item>
                <mwc-list-item value="call-service">call-service</mwc-list-item>
              </ha-select>
            </div>
          </div>
        </ha-expansion-panel>
      </div>
    `;

    const entity = this.shadowRoot.querySelector("#entity");
    if (entity) {
      entity.hass = this._hass;
      entity.value = this._config.entity || "";
      entity.includeDomains = undefined;
      entity.allowCustomEntity = true;
      entity.label = "Entity";
      entity.addEventListener("value-changed", (ev) => this._updateConfig("entity", ev.detail?.value || ""));
      entity.addEventListener("change", () => this._updateConfig("entity", entity.value || ""));
    }

    const codeFields = [
      ["#text_template", "text_template"],
      ["#color_template", "color_template"],
      ["#icon_template", "icon_template"],
      ["#icon_color_template", "icon_color_template"],
      ["#icon_background_color_template", "icon_background_color_template"],
    ];

    codeFields.forEach(([selector, path]) => {
      const el = this.shadowRoot.querySelector(selector);
      if (!el) return;
      el.hass = this._hass;
      el.value = this._config[path] || "";
      el.mode = "jinja2";
      el.autocomplete = true;
      el.dir = "ltr";
      el.addEventListener("value-changed", (ev) => this._updateConfig(path, ev.detail?.value ?? ""));
      el.addEventListener("input", () => this._updateConfig(path, el.value || ""));
      el.addEventListener("change", () => this._updateConfig(path, el.value || ""));
    });

    const tap = this.shadowRoot.querySelector("#tap_action");
    if (tap) {
      tap.value = this._config.tap_action?.action || "more-info";
      tap.addEventListener("selected", (ev) => this._updateConfig("tap_action.action", ev.detail.value));
      tap.addEventListener("change", () => this._updateConfig("tap_action.action", tap.value));
    }

    const iconTap = this.shadowRoot.querySelector("#icon_tap_action");
    if (iconTap) {
      iconTap.value = this._config.icon_tap_action?.action || "none";
      iconTap.addEventListener("selected", (ev) => this._updateConfig("icon_tap_action.action", ev.detail.value));
      iconTap.addEventListener("change", () => this._updateConfig("icon_tap_action.action", iconTap.value));
    }
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
