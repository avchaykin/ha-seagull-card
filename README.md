# Seagull Card

[![Open Bubble Card on Home Assistant Community Store (HACS)](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=avchaykin&repository=ha-seagull-card&category=plugin)

Универсальная пользовательская карточка для Home Assistant c Jinja2-шаблонами (в духе Mushroom Card).

## Что есть в v0.1.2

- Компактная карточка (меньше стандартной Tile Card)
- Максимально скругленные края (pill-форма)
- Без каемки/бордера
- Серый фон по умолчанию
- Контекст `entity` (обязательный)
- Контент через Jinja2-шаблоны:
  - `text_template` — текст справа от иконки (по умолчанию пустой)
  - `color_template` — цвет карточки (по умолчанию серый)
  - `icon_template` — иконка
  - `icon_color_template` — цвет иконки (по умолчанию черный)
  - `icon_background_color_template` — фон иконки (по умолчанию белый)
  - `icon_border_color_template` — цвет рамки круга иконки (по умолчанию белый)
- Действия:
  - `tap_action` — клик по карточке (по умолчанию `toggle`)
  - `icon_tap_action` — клик по иконке
- `sub_entities` — массив вложенных элементов справа (каждый с собственным `entity`, шаблонами, `tap_action`)
- Поддержка визуального редактора Lovelace (UI)
- Увеличенный блок иконки (иконка + круглый фон)
- Плавные анимации смены цвета (фон карточки/иконки)
- Поля шаблонов в кодовом редакторе (`ha-code-editor`, моноширинный стиль)
- Стандартизированный редактор с группировкой по секциям (`ha-expansion-panel`)

## Установка через HACS (стандартный путь)

> Пока репозиторий не в дефолтном каталоге HACS, добавляется как **Custom repository**.

1. Откройте HACS → **⋮** → **Custom repositories**.
2. Добавьте URL репозитория:  
   `https://github.com/avchaykin/ha-seagull-card`
3. Тип репозитория: **Dashboard**.
4. Нажмите **Add**.
5. Перейдите в HACS → Dashboard и найдите **Seagull Card**.
6. Нажмите **Download** / **Update**.
7. Перезапустите Home Assistant.

После установки HACS сам добавит ресурс `/hacsfiles/seagull-card.js` в Lovelace (если включено управление ресурсами через HACS).

## Ручное добавление ресурса (если нужно)

Settings → Dashboards → Resources:

- URL: `/hacsfiles/seagull-card.js`
- Type: `module`

## Пример конфигурации

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
    text_template: "{{ states(entity) }}%"
    tap_action:
      action: more-info
  - entity: binary_sensor.door
    icon_template: "{{ 'mdi:door-open' if is_state(entity, 'on') else 'mdi:door-closed' }}"
    icon_color_template: "{{ '#000000' }}"
    icon_background_color_template: "{{ '#ffffff' }}"
    icon_border_color_template: "{{ '#ffffff' }}"
    text_template: ""
    tap_action:
      action: more-info
```

## Поддерживаемые action

- `none`
- `more-info`
- `toggle`
- `navigate` (`navigation_path`)
- `url` (`url_path`)
- `call-service` (`service`, `data`, `target`)

## Структура репозитория

- `src/seagull-card.js` — исходник
- `dist/seagull-card.js` — файл для HACS
- `hacs.json` — метаданные HACS

## Локальная разработка (быстрый dev-деплой без пуша)

1. Добавьте ресурс в HA (один раз):
   - URL: `/local/seagull-card/seagull-card.js?v=dev`
   - Type: `module`
2. Скопируйте `.env.local.example` в `.env.local` и заполните SSH-параметры вашего HA.
3. Выполните:

```bash
npm install
npm run dev:push
```

Это соберет карточку и загрузит `dist/seagull-card.js` на ваш HA в `/config/www/seagull-card/seagull-card.js` (или путь из `.env.local`).

По умолчанию ресурс держится как стабильный URL (`/local/seagull-card/seagull-card.js`) без ручного редактирования в Manage resources.

Если нужен агрессивный cache-bust, включите в `.env.local`:
`HA_BUMP_RESOURCE_VERSION=true`.

## Разработка

```bash
npm install
npm run build
```

После `build` файл `dist/seagull-card.js` готов к публикации.
