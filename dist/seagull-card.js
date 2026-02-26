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
    const friendlyName = stateObj?.attributes?.friendly_name || this._config.entity;

    const cardColor = this._resolvedValue("color", "#9e9e9e");
    const icon = this._resolvedValue("icon", stateObj?.attributes?.icon || "mdi:help-circle");
    const iconColor = this._resolvedValue("icon_color", "#000000");
    const iconBackground = this._resolvedValue("icon_background_color", "#ffffff");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          min-height: 72px;
          border-radius: 9999px;
          background: ${cardColor};
          box-sizing: border-box;
          padding: 12px 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
        }
        .content {
          display: flex;
          align-items: center;
          width: 100%;
          min-width: 0;
        }
        .icon-wrap {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          margin-right: 12px;
          background: ${iconBackground};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex: 0 0 auto;
        }
        ha-icon {
          color: ${iconColor};
        }
        .label {
          font-size: 16px;
          font-weight: 500;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      </style>
      <ha-card class="card" tabindex="0" role="button" aria-label="${friendlyName}">
        <div class="content">
          <button class="icon-wrap" type="button" aria-label="Icon action">
            <ha-icon icon="${icon}"></ha-icon>
          </button>
          <div class="label">${friendlyName}</div>
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

  static getStubConfig() {
    return {
      type: "custom:seagull-card",
      entity: "light.kitchen",
      color_template: "{{ 'var(--state-light-active-color)' if is_state(entity, 'on') else '#9e9e9e' }}",
      icon_template: "{{ 'mdi:lightbulb-on' if is_state(entity, 'on') else 'mdi:lightbulb' }}",
      icon_color_template: "{{ '#000000' }}",
      icon_background_color_template: "{{ '#ffffff' }}",
      tap_action: { action: "more-info" },
      icon_tap_action: { action: "toggle" }
    };
  }
}

customElements.define("seagull-card", SeagullCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "seagull-card",
  name: "Seagull Card",
  description: "Universal card with Jinja2 templates",
  preview: true,
});
