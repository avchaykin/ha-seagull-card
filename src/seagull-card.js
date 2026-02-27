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
    this._templateSignature = "";
  }

  static getConfigElement() {
    return document.createElement("seagull-card-editor");
  }

  static getStubConfig() {
    return {
      type: "custom:seagull-card",
      entity: "light.kitchen",
      text_template: "",
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

    const normalizedTap =
      typeof config.tap_action === "string"
        ? { action: config.tap_action }
        : config.tap_action;
    const normalizedIconTap =
      typeof config.icon_tap_action === "string"
        ? { action: config.icon_tap_action }
        : config.icon_tap_action;

    this._config = {
      tap_action: { action: "more-info" },
      icon_tap_action: { action: "none" },
      ...config,
      tap_action: { action: "more-info", ...(normalizedTap || {}) },
      icon_tap_action: { action: "none", ...(normalizedIconTap || {}) },
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

    const signature = JSON.stringify({
      entity: this._config.entity,
      color_template: this._config.color_template || "",
      icon_template: this._config.icon_template || "",
      icon_color_template: this._config.icon_color_template || "",
      icon_background_color_template: this._config.icon_background_color_template || "",
      text_template: this._config.text_template || "",
    });

    if (signature === this._templateSignature) return;
    this._templateSignature = signature;

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
    const cardColor = this._resolvedValue("color", "#9e9e9e");
    const icon = this._resolvedValue("icon", stateObj?.attributes?.icon || "mdi:help-circle");
    const iconColor = this._resolvedValue("icon_color", "#000000");
    const iconBackground = this._resolvedValue("icon_background_color", "#ffffff");
    const text = this._resolvedValue("text", "");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          min-height: 58px;
          border-radius: 9999px;
          background: ${cardColor};
          box-sizing: border-box;
          padding: 6px 12px 6px 6px;
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
          width: 46px;
          height: 46px;
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
          --mdc-icon-size: 27px;
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
      <ha-card class="card" tabindex="0" role="button" aria-label="${text || this._config.entity}">
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
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._rendered = false;
    this._skipNextSetConfigRender = false;
    this._lastConfigHash = "";
  }

  setConfig(config) {
    const normalizedTap =
      typeof config?.tap_action === "string"
        ? { action: config.tap_action }
        : config?.tap_action;
    const normalizedIconTap =
      typeof config?.icon_tap_action === "string"
        ? { action: config.icon_tap_action }
        : config?.icon_tap_action;

    const normalized = {
      tap_action: { action: "more-info" },
      icon_tap_action: { action: "none" },
      ...config,
      tap_action: { action: "more-info", ...(normalizedTap || {}) },
      icon_tap_action: { action: "none", ...(normalizedIconTap || {}) },
    };

    const nextHash = JSON.stringify(normalized);
    if (nextHash === this._lastConfigHash) return;

    this._config = normalized;
    this._lastConfigHash = nextHash;

    if (this._skipNextSetConfigRender) {
      this._skipNextSetConfigRender = false;
      return;
    }

    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;

    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <style>
        .stack { display: grid; gap: 12px; }
        .hint { font-size: 12px; color: var(--secondary-text-color); margin-top: 6px; }
        .mono-wrap {
          border: 1px solid var(--divider-color);
          border-radius: 10px;
          padding: 4px;
        }
        ha-expansion-panel { --ha-card-border-width: 0; }
      </style>
      <div class="stack">
        <ha-expansion-panel outlined expanded>
          <div slot="header">Context</div>
          <div id="context-form"></div>
          <div class="hint">Used in templates and interactions as <code>entity</code>.</div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined expanded>
          <div slot="header">Content</div>
          <div class="mono-wrap"><div id="content-form"></div></div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined expanded>
          <div slot="header">Interactions</div>
          <div id="actions-form"></div>
        </ha-expansion-panel>
      </div>
    `;

    this._renderForm(
      "#context-form",
      [
        {
          name: "entity",
          label: "Entity",
          required: true,
          selector: { entity: {} },
        },
      ],
      this._config
    );

    this._renderForm(
      "#content-form",
      [
        { name: "text_template", label: "Text template", selector: { template: {} } },
        { name: "color_template", label: "Card color template", selector: { template: {} } },
        { name: "icon_template", label: "Icon template", selector: { template: {} } },
        { name: "icon_color_template", label: "Icon color template", selector: { template: {} } },
        { name: "icon_background_color_template", label: "Icon background color template", selector: { template: {} } },
      ],
      this._config
    );

    this._renderForm(
      "#actions-form",
      [
        {
          name: "tap_action_action",
          label: "Tap behavior",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "none", label: "none" },
                { value: "more-info", label: "more-info" },
                { value: "toggle", label: "toggle" },
                { value: "navigate", label: "navigate" },
                { value: "url", label: "url" },
                { value: "call-service", label: "call-service" },
              ],
            },
          },
        },
        {
          name: "icon_tap_action_action",
          label: "Icon tap behavior",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "none", label: "none" },
                { value: "more-info", label: "more-info" },
                { value: "toggle", label: "toggle" },
                { value: "navigate", label: "navigate" },
                { value: "url", label: "url" },
                { value: "call-service", label: "call-service" },
              ],
            },
          },
        },
      ],
      {
        tap_action_action: this._config.tap_action?.action || "more-info",
        icon_tap_action_action: this._config.icon_tap_action?.action || "none",
      }
    );
  }

  _renderForm(containerSelector, schema, data) {
    const container = this.shadowRoot.querySelector(containerSelector);
    if (!container) return;

    const form = document.createElement("ha-form");
    form.hass = this._hass;
    form.schema = schema;
    form.data = data;
    form.computeLabel = (s) => s.label;
    form.addEventListener("value-changed", (ev) => this._valueChanged(ev));
    container.replaceChildren(form);

    // Monospace style for template textareas rendered by ha-form
    setTimeout(() => {
      container.querySelectorAll("ha-textfield, textarea, input").forEach((el) => {
        if ((el.label || "").toLowerCase().includes("template")) {
          el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
        }
      });
    }, 0);
  }

  _valueChanged(ev) {
    const value = ev.detail?.value;
    if (!value) return;

    const newConfig = { ...(this._config || {}) };

    if (Object.prototype.hasOwnProperty.call(value, "entity")) {
      newConfig.entity = value.entity;
    }
    if (Object.prototype.hasOwnProperty.call(value, "text_template")) {
      newConfig.text_template = value.text_template;
    }
    if (Object.prototype.hasOwnProperty.call(value, "color_template")) {
      newConfig.color_template = value.color_template;
    }
    if (Object.prototype.hasOwnProperty.call(value, "icon_template")) {
      newConfig.icon_template = value.icon_template;
    }
    if (Object.prototype.hasOwnProperty.call(value, "icon_color_template")) {
      newConfig.icon_color_template = value.icon_color_template;
    }
    if (Object.prototype.hasOwnProperty.call(value, "icon_background_color_template")) {
      newConfig.icon_background_color_template = value.icon_background_color_template;
    }
    if (Object.prototype.hasOwnProperty.call(value, "tap_action_action")) {
      newConfig.tap_action = { ...(newConfig.tap_action || {}), action: value.tap_action_action || "none" };
    }
    if (Object.prototype.hasOwnProperty.call(value, "icon_tap_action_action")) {
      newConfig.icon_tap_action = { ...(newConfig.icon_tap_action || {}), action: value.icon_tap_action_action || "none" };
    }

    this._config = newConfig;
    this._lastConfigHash = JSON.stringify(newConfig);
    this._skipNextSetConfigRender = true;
    fireEvent(this, "config-changed", { config: newConfig });
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
