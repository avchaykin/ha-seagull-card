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
      icon_border_color_template: "{{ '#ffffff' }}",
      badge_icon_template: "",
      badge_color_template: "{{ '#ff3b30' }}",
      tap_action: { action: "toggle" },
      icon_tap_action: { action: "none" },
      sub_entities: [],
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
      tap_action: { action: "toggle" },
      icon_tap_action: { action: "none" },
      sub_entities: [],
      ...config,
      tap_action: { action: "toggle", ...(normalizedTap || {}) },
      icon_tap_action: { action: "none", ...(normalizedIconTap || {}) },
      sub_entities: this._normalizeSubEntities(config.sub_entities),
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

  _normalizeSubEntities(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        entity: item.entity || "",
        icon_template: item.icon_template || "",
        icon_color_template: item.icon_color_template || "",
        icon_background_color_template: item.icon_background_color_template || "",
        icon_border_color_template: item.icon_border_color_template || "",
        badge_icon_template: item.badge_icon_template || "",
        badge_color_template: item.badge_color_template || "",
        text_template: item.text_template || "",
        tap_action:
          typeof item.tap_action === "string"
            ? { action: item.tap_action }
            : { action: "none", ...(item.tap_action || {}) },
      }));
  }

  _subscribeTemplates() {
    if (!this._hass || !this._config) return;

    const signature = JSON.stringify({
      entity: this._config.entity,
      color_template: this._config.color_template || "",
      icon_template: this._config.icon_template || "",
      icon_color_template: this._config.icon_color_template || "",
      icon_background_color_template: this._config.icon_background_color_template || "",
      icon_border_color_template: this._config.icon_border_color_template || "",
      badge_icon_template: this._config.badge_icon_template || "",
      badge_color_template: this._config.badge_color_template || "",
      text_template: this._config.text_template || "",
      sub_entities: this._config.sub_entities || [],
    });

    if (signature === this._templateSignature) return;
    this._templateSignature = signature;

    this._clearTemplateSubs();

    const templates = {
      color: this._config.color_template,
      icon: this._config.icon_template,
      icon_color: this._config.icon_color_template,
      icon_background_color: this._config.icon_background_color_template,
      icon_border_color: this._config.icon_border_color_template,
      badge_icon: this._config.badge_icon_template,
      badge_color: this._config.badge_color_template,
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

    (this._config.sub_entities || []).forEach((sub, index) => {
      if (!sub?.entity) return;
      const subTemplates = {
        icon: sub.icon_template,
        icon_color: sub.icon_color_template,
        icon_background_color: sub.icon_background_color_template,
        icon_border_color: sub.icon_border_color_template,
        badge_icon: sub.badge_icon_template,
        badge_color: sub.badge_color_template,
        text: sub.text_template,
      };

      Object.entries(subTemplates).forEach(([field, template]) => {
        if (!template || typeof template !== "string") return;
        const key = `sub_${index}_${field}`;
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
            entity_ids: [sub.entity],
            variables: { entity: sub.entity },
          }
        );
      });
    });
  }

  _getStateObj() {
    return this._hass?.states?.[this._config?.entity];
  }

  _resolvedValue(key, fallback) {
    const value = this._rendered[key];
    return value !== undefined && value !== "" ? value : fallback;
  }

  _subResolvedValue(index, field, fallback) {
    return this._resolvedValue(`sub_${index}_${field}`, fallback);
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
    const iconBorderColor = this._resolvedValue("icon_border_color", "#ffffff");
    const badgeIcon = this._resolvedValue("badge_icon", "");
    const badgeColor = this._resolvedValue("badge_color", "#ff3b30");
    const text = this._resolvedValue("text", "");
    const subEntities = this._config.sub_entities || [];

    const subHtml = subEntities
      .filter((sub) => sub?.entity)
      .map((sub, index) => {
        const subState = this._hass?.states?.[sub.entity];
        const subIcon = this._subResolvedValue(index, "icon", subState?.attributes?.icon || "mdi:help-circle");
        const subIconColor = this._subResolvedValue(index, "icon_color", "#000000");
        const subIconBg = this._subResolvedValue(index, "icon_background_color", "#ffffff");
        const subIconBorder = this._subResolvedValue(index, "icon_border_color", "#ffffff");
        const subBadgeIcon = this._subResolvedValue(index, "badge_icon", "");
        const subBadgeColor = this._subResolvedValue(index, "badge_color", "#ff3b30");
        const subText = this._subResolvedValue(index, "text", "");
        const hasText = Boolean(subText && String(subText).trim());
        const shapeClass = hasText ? "sub-pill" : "sub-circle";
        return `<button class="sub-item ${shapeClass}" data-sub-index="${index}" type="button" aria-label="${sub.entity}" style="--sub-icon-bg:${subIconBg}; --sub-icon-color:${subIconColor}; --sub-icon-border:${subIconBorder}; --sub-badge-color:${subBadgeColor};"><ha-icon icon="${subIcon}"></ha-icon>${subBadgeIcon ? `<span class=\"sub-badge\"><ha-icon icon=\"${subBadgeIcon}\"></ha-icon></span>` : ""}${hasText ? `<span>${subText}</span>` : ""}</button>`;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, sans-serif)); }
        ha-card {
          font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, sans-serif));
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
        .main {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 10px;
          flex: 1 1 auto;
        }
        .icon-wrap {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          border: 2px solid ${iconBorderColor};
          background: ${iconBackground};
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex: 0 0 auto;
          padding: 0;
          transition: background-color 220ms ease, transform 180ms ease;
        }
        .icon-wrap:active { transform: scale(0.97); }
        ha-icon {
          color: ${iconColor};
          --mdc-icon-size: 27px;
          transition: color 220ms ease;
        }
        .badge {
          position: absolute;
          right: -3px;
          top: -3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${badgeColor};
          color: #fff;
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .badge ha-icon {
          color: #fff;
          --mdc-icon-size: 11px;
          transform: none;
        }
        .label {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .subs {
          margin-left: auto;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .sub-item {
          border: 2px solid var(--sub-icon-border, #ffffff);
          background: var(--sub-icon-bg);
          color: var(--sub-icon-color);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 220ms ease, color 220ms ease;
          position: relative;
        }
        .sub-item ha-icon {
          color: var(--sub-icon-color);
          --mdc-icon-size: 22px;
        }
        .sub-badge {
          position: absolute;
          right: -3px;
          top: -3px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--sub-badge-color, #ff3b30);
          border: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        .sub-badge ha-icon {
          color: #fff;
          --mdc-icon-size: 9px;
          transform: none;
        }
        .sub-circle {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          padding: 0;
        }
        .sub-pill {
          height: 40px;
          border-radius: 999px;
          padding: 0 12px;
          gap: 8px;
          max-width: 180px;
        }
        .sub-pill span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          color: var(--sub-icon-color);
        }
      </style>
      <ha-card class="card" tabindex="0" role="button" aria-label="${text || this._config.entity}">
        <div class="content">
          <div class="main">
            <button class="icon-wrap" type="button" aria-label="Icon action">
              <ha-icon icon="${icon}"></ha-icon>
              ${badgeIcon ? `<span class="badge"><ha-icon icon="${badgeIcon}"></ha-icon></span>` : ""}
            </button>
            <div class="label">${text}</div>
          </div>
          <div class="subs">${subHtml}</div>
        </div>
      </ha-card>
    `;

    const card = this.shadowRoot.querySelector(".card");
    const iconBtn = this.shadowRoot.querySelector(".icon-wrap");
    const subButtons = this.shadowRoot.querySelectorAll(".sub-item");

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

    subButtons.forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const index = Number(btn.dataset.subIndex);
        const sub = this._config.sub_entities?.[index];
        if (!sub) return;
        this._handleAction({ ...(sub.tap_action || { action: "none" }), entity: sub.entity });
      });
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
    this._selectedSubIndex = 0;
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
      tap_action: { action: "toggle" },
      icon_tap_action: { action: "none" },
      sub_entities: [],
      ...config,
      tap_action: { action: "toggle", ...(normalizedTap || {}) },
      icon_tap_action: { action: "none", ...(normalizedIconTap || {}) },
      sub_entities: this._normalizeSubEntities(config?.sub_entities),
    };

    const nextHash = JSON.stringify(normalized);
    if (nextHash === this._lastConfigHash) return;

    this._config = normalized;
    this._lastConfigHash = nextHash;
    if (this._selectedSubIndex >= (this._config.sub_entities || []).length) {
      this._selectedSubIndex = Math.max(0, (this._config.sub_entities || []).length - 1);
    }

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

  _normalizeSubEntities(items) {
    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        entity: item.entity || "",
        icon_template: item.icon_template || "",
        icon_color_template: item.icon_color_template || "",
        icon_background_color_template: item.icon_background_color_template || "",
        icon_border_color_template: item.icon_border_color_template || "",
        badge_icon_template: item.badge_icon_template || "",
        badge_color_template: item.badge_color_template || "",
        text_template: item.text_template || "",
        tap_action:
          typeof item.tap_action === "string"
            ? { action: item.tap_action }
            : { action: "none", ...(item.tap_action || {}) },
      }));
  }

  _emitConfig(newConfig, rerender = false) {
    this._config = newConfig;
    this._lastConfigHash = JSON.stringify(newConfig);
    this._skipNextSetConfigRender = true;
    fireEvent(this, "config-changed", { config: newConfig });
    if (rerender) this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;

    this._rendered = true;
    this.shadowRoot.innerHTML = `
      <style>
        .stack { display: grid; gap: 12px; font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, Roboto, sans-serif)); }
        .hint { font-size: 12px; color: var(--secondary-text-color); margin-top: 6px; }
        .sub-list { display: grid; gap: 8px; margin-bottom: 10px; }
        .sub-row {
          width: 100%; border: 1px solid var(--divider-color); border-radius: 14px;
          padding: 10px 12px; background: var(--card-background-color); color: var(--primary-text-color);
          display: flex; align-items: center; justify-content: space-between; cursor: pointer;
        }
        .sub-row.active { border-color: var(--primary-color); box-shadow: 0 0 0 1px var(--primary-color) inset; }
        .sub-row-left { display: inline-flex; gap: 10px; align-items: center; min-width: 0; }
        .dot { width: 26px; height: 26px; border-radius: 999px; background: var(--secondary-background-color); }
        .sub-name { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .sub-actions { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        button.ctrl {
          border: 1px solid var(--divider-color); border-radius: 10px; background: var(--card-background-color);
          padding: 8px 12px; cursor: pointer; color: var(--primary-text-color);
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
          <div id="content-form"></div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined expanded>
          <div slot="header">Interactions</div>
          <div id="actions-form"></div>
        </ha-expansion-panel>

        <ha-expansion-panel outlined expanded>
          <div slot="header">Sub-buttons editor</div>
          <div class="sub-actions">
            <button class="ctrl" id="sub-add">Add</button>
            <button class="ctrl" id="sub-remove">Remove</button>
            <button class="ctrl" id="sub-up">Move up</button>
            <button class="ctrl" id="sub-down">Move down</button>
            <button class="ctrl" id="sub-paste">Paste JSON</button>
          </div>
          <div class="sub-list" id="sub-list"></div>
          <div id="sub-form"></div>
        </ha-expansion-panel>
      </div>
    `;

    this._renderForm(
      "#context-form",
      [{ name: "entity", label: "Entity", required: true, selector: { entity: {} } }],
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
        { name: "icon_border_color_template", label: "Icon border color template", selector: { template: {} } },
        { name: "badge_icon_template", label: "Badge icon template", selector: { template: {} } },
        { name: "badge_color_template", label: "Badge color template", selector: { template: {} } },
      ],
      this._config
    );

    this._renderForm(
      "#actions-form",
      [
        {
          name: "tap_action_action",
          label: "Tap behavior",
          selector: { select: { mode: "dropdown", options: ["none", "more-info", "toggle", "navigate", "url", "call-service"].map((v)=>({value:v,label:v})) } },
        },
        {
          name: "icon_tap_action_action",
          label: "Icon tap behavior",
          selector: { select: { mode: "dropdown", options: ["none", "more-info", "toggle", "navigate", "url", "call-service"].map((v)=>({value:v,label:v})) } },
        },
      ],
      {
        tap_action_action: this._config.tap_action?.action || "toggle",
        icon_tap_action_action: this._config.icon_tap_action?.action || "none",
      }
    );

    this._renderSubEntitiesEditor();
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
  }

  _renderSubEntitiesEditor() {
    const items = this._config.sub_entities || [];
    const list = this.shadowRoot.querySelector("#sub-list");
    if (!list) return;

    list.innerHTML = items
      .map((item, i) => `
        <button class="sub-row ${i === this._selectedSubIndex ? "active" : ""}" data-index="${i}" type="button">
          <span class="sub-row-left">
            <span class="dot"></span>
            <span class="sub-name">Sub-button ${i + 1} · ${item.entity}</span>
          </span>
          <span>⋮</span>
        </button>
      `)
      .join("");

    list.querySelectorAll(".sub-row").forEach((el) => {
      el.addEventListener("click", () => {
        this._selectedSubIndex = Number(el.dataset.index);
        this._renderSubEntitiesEditor();
      });
    });

    const selected = items[this._selectedSubIndex];
    const subFormContainer = this.shadowRoot.querySelector("#sub-form");
    if (subFormContainer) {
      if (!selected) {
        subFormContainer.innerHTML = `<div class="hint">No sub-buttons yet. Click <b>Add</b>.</div>`;
      } else {
        this._renderSubForm(selected);
      }
    }

    this.shadowRoot.querySelector("#sub-add")?.addEventListener("click", () => {
      const next = [...items, { entity: "", icon_template: "", icon_color_template: "", icon_background_color_template: "", icon_border_color_template: "", badge_icon_template: "", badge_color_template: "", text_template: "", tap_action: { action: "none" } }];
      this._config.sub_entities = next;
      this._selectedSubIndex = next.length - 1;
      this._emitConfig({ ...this._config, sub_entities: next }, true);
    });

    this.shadowRoot.querySelector("#sub-remove")?.addEventListener("click", () => {
      if (!items.length) return;
      const next = items.filter((_, i) => i !== this._selectedSubIndex);
      this._selectedSubIndex = Math.max(0, this._selectedSubIndex - 1);
      this._emitConfig({ ...this._config, sub_entities: next }, true);
    });

    this.shadowRoot.querySelector("#sub-up")?.addEventListener("click", () => this._moveSub(-1));
    this.shadowRoot.querySelector("#sub-down")?.addEventListener("click", () => this._moveSub(1));

    this.shadowRoot.querySelector("#sub-paste")?.addEventListener("click", () => {
      const raw = prompt("Paste sub_entities JSON array", JSON.stringify(items, null, 2));
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        const normalized = this._normalizeSubEntities(parsed);
        this._selectedSubIndex = Math.max(0, normalized.length - 1);
        this._emitConfig({ ...this._config, sub_entities: normalized }, true);
      } catch (_e) {
        alert("Invalid JSON");
      }
    });
  }

  _moveSub(direction) {
    const items = [...(this._config.sub_entities || [])];
    const from = this._selectedSubIndex;
    const to = from + direction;
    if (from < 0 || to < 0 || to >= items.length) return;
    [items[from], items[to]] = [items[to], items[from]];
    this._selectedSubIndex = to;
    this._emitConfig({ ...this._config, sub_entities: items }, true);
  }

  _renderSubForm(selected) {
    const container = this.shadowRoot.querySelector("#sub-form");
    if (!container) return;

    this._renderForm(
      "#sub-form",
      [
        { name: "sub_entity", label: "Entity", required: true, selector: { entity: {} } },
        { name: "sub_icon_template", label: "Icon template", selector: { template: {} } },
        { name: "sub_icon_color_template", label: "Icon color template", selector: { template: {} } },
        { name: "sub_icon_background_color_template", label: "Icon background color template", selector: { template: {} } },
        { name: "sub_icon_border_color_template", label: "Icon border color template", selector: { template: {} } },
        { name: "sub_badge_icon_template", label: "Badge icon template", selector: { template: {} } },
        { name: "sub_badge_color_template", label: "Badge color template", selector: { template: {} } },
        { name: "sub_text_template", label: "Text template", selector: { template: {} } },
        {
          name: "sub_tap_action",
          label: "Tap behavior",
          selector: { select: { mode: "dropdown", options: ["none", "more-info", "toggle", "navigate", "url", "call-service"].map((v)=>({value:v,label:v})) } },
        },
      ],
      {
        sub_entity: selected.entity || "",
        sub_icon_template: selected.icon_template || "",
        sub_icon_color_template: selected.icon_color_template || "",
        sub_icon_background_color_template: selected.icon_background_color_template || "",
        sub_icon_border_color_template: selected.icon_border_color_template || "",
        sub_badge_icon_template: selected.badge_icon_template || "",
        sub_badge_color_template: selected.badge_color_template || "",
        sub_text_template: selected.text_template || "",
        sub_tap_action: selected.tap_action?.action || "none",
      }
    );
  }

  _valueChanged(ev) {
    const value = ev.detail?.value;
    if (!value) return;

    const newConfig = { ...(this._config || {}) };

    if (Object.prototype.hasOwnProperty.call(value, "entity")) newConfig.entity = value.entity;
    if (Object.prototype.hasOwnProperty.call(value, "text_template")) newConfig.text_template = value.text_template;
    if (Object.prototype.hasOwnProperty.call(value, "color_template")) newConfig.color_template = value.color_template;
    if (Object.prototype.hasOwnProperty.call(value, "icon_template")) newConfig.icon_template = value.icon_template;
    if (Object.prototype.hasOwnProperty.call(value, "icon_color_template")) newConfig.icon_color_template = value.icon_color_template;
    if (Object.prototype.hasOwnProperty.call(value, "icon_background_color_template")) newConfig.icon_background_color_template = value.icon_background_color_template;
    if (Object.prototype.hasOwnProperty.call(value, "icon_border_color_template")) newConfig.icon_border_color_template = value.icon_border_color_template;
    if (Object.prototype.hasOwnProperty.call(value, "badge_icon_template")) newConfig.badge_icon_template = value.badge_icon_template;
    if (Object.prototype.hasOwnProperty.call(value, "badge_color_template")) newConfig.badge_color_template = value.badge_color_template;
    if (Object.prototype.hasOwnProperty.call(value, "tap_action_action")) {
      newConfig.tap_action = { ...(newConfig.tap_action || {}), action: value.tap_action_action || "none" };
    }
    if (Object.prototype.hasOwnProperty.call(value, "icon_tap_action_action")) {
      newConfig.icon_tap_action = { ...(newConfig.icon_tap_action || {}), action: value.icon_tap_action_action || "none" };
    }

    const subItems = [...(newConfig.sub_entities || [])];
    const idx = this._selectedSubIndex;
    if (idx >= 0 && idx < subItems.length) {
      const sub = { ...subItems[idx] };
      let subChanged = false;
      if (Object.prototype.hasOwnProperty.call(value, "sub_entity")) { sub.entity = value.sub_entity; subChanged = true; }
      if (Object.prototype.hasOwnProperty.call(value, "sub_icon_template")) { sub.icon_template = value.sub_icon_template; subChanged = true; }
      if (Object.prototype.hasOwnProperty.call(value, "sub_icon_color_template")) { sub.icon_color_template = value.sub_icon_color_template; subChanged = true; }
      if (Object.prototype.hasOwnProperty.call(value, "sub_icon_background_color_template")) { sub.icon_background_color_template = value.sub_icon_background_color_template; subChanged = true; }
      if (Object.prototype.hasOwnProperty.call(value, "sub_icon_border_color_template")) { sub.icon_border_color_template = value.sub_icon_border_color_template; subChanged = true; }
      if (Object.prototype.hasOwnProperty.call(value, "sub_badge_icon_template")) { sub.badge_icon_template = value.sub_badge_icon_template; subChanged = true; }
      if (Object.prototype.hasOwnProperty.call(value, "sub_badge_color_template")) { sub.badge_color_template = value.sub_badge_color_template; subChanged = true; }
      if (Object.prototype.hasOwnProperty.call(value, "sub_text_template")) { sub.text_template = value.sub_text_template; subChanged = true; }
      if (Object.prototype.hasOwnProperty.call(value, "sub_tap_action")) { sub.tap_action = { ...(sub.tap_action || {}), action: value.sub_tap_action || "none" }; subChanged = true; }
      if (subChanged) {
        subItems[idx] = sub;
        newConfig.sub_entities = this._normalizeSubEntities(subItems);
      }
    }

    this._emitConfig(newConfig, false);
  }
}

if (!customElements.get("seagull-card")) {
  customElements.define("seagull-card", SeagullCard);
}
if (!customElements.get("seagull-card-editor")) {
  customElements.define("seagull-card-editor", SeagullCardEditor);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "seagull-card",
  name: "Seagull Card",
  description: "Universal card with Jinja2 templates",
  preview: true,
});
