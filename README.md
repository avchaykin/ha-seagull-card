# Seagull Card

[![Open Bubble Card on Home Assistant Community Store (HACS)](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=avchaykin&repository=ha-seagull-card&category=plugin)

A universal custom Home Assistant card with Jinja2 templates (in the spirit of Mushroom Card).

## What is included in v0.1.2

- Compact card (smaller than the standard Tile Card)
- Fully rounded pill shape
- Borderless card container
- Gray background by default
- `entity` context (required)
- Jinja2-driven content:
  - `text_template` — text to the right of the icon (empty by default)
  - `color_template` — card background color (gray by default)
  - `icon_template` — icon
  - `icon_color_template` — icon color (black by default)
  - `icon_background_color_template` — icon background (white by default)
  - `icon_border_color_template` — icon circle border color (white by default)
  - `badge_icon_template` — badge icon (empty by default)
  - `badge_color_template` — badge color (red by default)
- Actions:
  - `tap_action` — card click action (default: `toggle`)
  - `icon_tap_action` — main icon click action
- `sub_entities` — right-aligned nested items (each has its own `entity`, templates, badges, and `tap_action`)
- Lovelace visual editor support
- Enlarged icon block (icon + circular background)
- Smooth color transitions
- Template fields using HA template editor controls
- Section-based editor layout

## Install via HACS (standard flow)

> Until this repo is in the default HACS catalog, add it as a **Custom repository**.

1. Open HACS → **⋮** → **Custom repositories**.
2. Add repository URL:  
   `https://github.com/avchaykin/ha-seagull-card`
3. Repository type: **Dashboard**.
4. Click **Add**.
5. Go to HACS → Dashboard and find **Seagull Card**.
6. Click **Download** / **Update**.
7. Restart Home Assistant.

If HACS resource management is enabled, HACS will add `/hacsfiles/seagull-card.js` to Lovelace automatically.

## Manual resource setup (if needed)

Settings → Dashboards → Resources:

- URL: `/hacsfiles/seagull-card.js`
- Type: `module`

## Example configuration

```yaml
type: custom:seagull-card
entity: light.kitchen
text_template: >-
  {{ state_attr(entity, 'friendly_name') }}
color_template: >-
  {{ 'var(--state-light-active-color)' if is_state(entity, 'on') else '#9e9e9e' }}
icon_template: >-
  {{ 'mdi:lightbulb-on' if is_state(entity, 'on') else 'mdi:lightbulb' }}
icon_color_template: >-
  {{ '#000000' }}
icon_background_color_template: >-
  {{ '#ffffff' }}
icon_border_color_template: >-
  {{ '#ffffff' }}
badge_icon_template: >-
  {{ 'mdi:heat-wave' }}
badge_color_template: >-
  {{ '#ff3b30' }}
tap_action:
  action: toggle
icon_tap_action:
  action: toggle
sub_entities:
  - entity: sensor.battery_phone
    icon_template: "{{ 'mdi:battery' }}"
    icon_color_template: "{{ '#000000' }}"
    icon_background_color_template: "{{ '#ffffff' }}"
    icon_border_color_template: "{{ '#ffffff' }}"
    badge_icon_template: "{{ 'mdi:heat-wave' }}"
    badge_color_template: "{{ '#ff3b30' }}"
    text_template: "{{ states(entity) }}%"
    tap_action:
      action: more-info
  - entity: binary_sensor.door
    icon_template: "{{ 'mdi:door-open' if is_state(entity, 'on') else 'mdi:door-closed' }}"
    icon_color_template: "{{ '#000000' }}"
    icon_background_color_template: "{{ '#ffffff' }}"
    icon_border_color_template: "{{ '#ffffff' }}"
    badge_icon_template: ""
    badge_color_template: "{{ '#ff3b30' }}"
    text_template: ""
    tap_action:
      action: more-info
```

## Supported actions

- `none`
- `more-info`
- `toggle`
- `navigate` (`navigation_path`)
- `url` (`url_path`)
- `call-service` (`service`, `data`, `target`)

## Repository structure

- `src/seagull-card.js` — source file
- `dist/seagull-card.js` — HACS-distributed build
- `hacs.json` — HACS metadata

## Local development (fast dev deploy without release push)

1. Add resource in HA (once):
   - URL: `/local/seagull-card/seagull-card.js?v=dev`
   - Type: `module`
2. Copy `.env.local.example` to `.env.local` and fill in your HA SSH settings.
3. Run:

```bash
npm install
npm run dev:push
```

This builds the card and uploads `dist/seagull-card.js` to `/config/www/seagull-card/seagull-card.js` on your HA instance (or custom path from `.env.local`).

By default, deploy can keep a stable resource URL, and you can enable aggressive cache-busting in `.env.local`:
`HA_BUMP_RESOURCE_VERSION=true`.

## Development

```bash
npm install
npm run build
```

After `build`, `dist/seagull-card.js` is ready for publishing.
