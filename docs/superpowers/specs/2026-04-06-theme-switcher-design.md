# Theme Switcher Design

**Date:** 2026-04-06
**Scope:** Multi-theme support with View > Theme submenu in both web and native menus, persisted via localStorage

## Theme List

### Custom themes (26px tabs, 11px font, Whisper-style polish)

| ID | Label | Accent | Surface palette |
|----|-------|--------|-----------------|
| `whisper` | Whisper | Copper (#c8885a / #e4a46e) | Current warm dark (#0c0d0f → #22252a) |
| `frost` | Frost | Blue-steel (#6a9fd8 / #88b4e0) | Cool dark (#0b0d10 → #1e2228) |
| `ember` | Ember | Red-orange (#d4734a / #e8956a) | Warm dark (#100c0a → #2a2220) |
| `daylight` | Daylight | Copper (#c8885a / #e4a46e) | Warm light (#f5f2ed → #e8e4dc) |

### Retro themes (custom CSS, evoke classic pixel art tools)

| ID | Label | Accent | Surface palette |
|----|-------|--------|-----------------|
| `aseprite` | Aseprite | Purple-pink (#a86cc1 / #c490d8) | Dark charcoal (#1f1f24 → #35353c) |
| `gamemaker` | GameMaker | Blue (#4a7abf / #6a9ad8) | Classic grey (#d4d4d4 → #e8e8e8) |

### Built-in dockview themes (pass-through, no custom CSS)

| ID | Label | Dockview theme object |
|----|-------|-----------------------|
| `classic-dark` | Dark (Classic) | `themeDark` |
| `classic-light` | Light (Classic) | `themeLight` |
| `vscode` | VS Code | `themeVisualStudio` |
| `dracula` | Dracula | `themeDracula` |

## Architecture

### Theme registry — `src/mainview/src/themes.ts`

```typescript
import type { DockviewTheme } from "dockview-core";

export interface Theme {
  id: string;
  label: string;
  dockviewTheme: DockviewTheme;
  cssClass?: string; // applied to dockview container, undefined for built-in themes
}

export const THEMES: Theme[] = [/* all themes */];

export function getTheme(id: string): Theme;
export function getDefaultTheme(): Theme; // returns whisper
```

- Custom themes set `dockviewTheme` to `themeDark` (or `themeLight` for daylight/gamemaker) and provide a `cssClass` for our overrides
- Built-in themes set `dockviewTheme` to the matching dockview export and leave `cssClass` undefined

### CSS structure — `src/mainview/src/style.css`

The current `.dockview-theme-dark.dockview-theme-dark` block becomes `.dv-theme-whisper` (scoped to Whisper only). Each custom theme gets its own class block:

- `.dv-theme-whisper` — current Whisper styles (moved from `.dockview-theme-dark.dockview-theme-dark`)
- `.dv-theme-frost` — same structure, blue-steel tokens
- `.dv-theme-ember` — same structure, red-orange tokens
- `.dv-theme-daylight` — light surface tokens, copper accent
- `.dv-theme-aseprite` — charcoal surfaces, purple-pink accent
- `.dv-theme-gamemaker` — grey surfaces, blue accent

Each custom theme class overrides the `--dv-*` variables and includes the same Whisper-style polish rules (slim tabs, hidden close buttons, glow on active tab, sash behavior, rounded drop targets/floating panels). The accent color and surface palette change per theme.

The `@theme` block (lines 3-17) stays as-is — it defines the app's base tokens. Theme-specific dockview overrides use hardcoded values (not `var(--color-*)`) to avoid coupling theme switching to the app's base token system.

### App.vue integration

```html
<div :class="['dockview-container', currentTheme.cssClass]">
  <DockviewVue :theme="currentTheme.dockviewTheme" @ready="onReady" />
</div>
```

- Remove the static `dockview-theme-dark` class from the container
- `currentTheme` is a computed ref derived from the theme ID stored in a reactive ref
- Theme ID initialized from `localStorage.getItem('span-theme')` or `'whisper'`

New functions in App.vue:
- `setTheme(id: string)` — updates the ref + `localStorage.setItem('span-theme', id)`
- `handleMenuAction` gets a new `setTheme:` prefix handler (same pattern as `addPanel:`)

### Menu integration — `src/mainview/src/menus.ts`

The `getMenus()` function receives an additional parameter: `currentThemeId: string`.

View menu gets a new item with `children`:

```typescript
{
  label: "Theme",
  children: [
    { label: "Whisper", action: "setTheme:whisper", checked: currentThemeId === "whisper" },
    { label: "Frost", action: "setTheme:frost", checked: currentThemeId === "frost" },
    { label: "Ember", action: "setTheme:ember", checked: currentThemeId === "ember" },
    { label: "Daylight", action: "setTheme:daylight", checked: currentThemeId === "daylight" },
    { separator: true },
    { label: "Aseprite", action: "setTheme:aseprite", checked: currentThemeId === "aseprite" },
    { label: "GameMaker", action: "setTheme:gamemaker", checked: currentThemeId === "gamemaker" },
    { separator: true },
    { label: "Dark (Classic)", action: "setTheme:classic-dark", checked: currentThemeId === "classic-dark" },
    { label: "Light (Classic)", action: "setTheme:classic-light", checked: currentThemeId === "classic-light" },
    { label: "VS Code", action: "setTheme:vscode", checked: currentThemeId === "vscode" },
    { label: "Dracula", action: "setTheme:dracula", checked: currentThemeId === "dracula" },
  ]
}
```

### Submenu rendering — `MenuBar.vue`

The `children` field on `MenuItem` already exists but isn't wired up. Add submenu rendering:
- When a menu item has `children`, render a `▸` indicator and position a nested dropdown to the right on hover
- Reuse the same item rendering for children (label, checked, action)

### Native menu — `src/bun/index.ts`

Add a `Theme` submenu to the View menu:

```typescript
{
  label: "Theme",
  submenu: [
    { label: "Whisper", action: "setTheme:whisper" },
    { label: "Frost", action: "setTheme:frost" },
    // ... all themes with separators
  ]
}
```

The native menu is static (no dynamic checkmarks).

In the `application-menu-clicked` handler, add to the `default` case:

```typescript
if (action.startsWith("setTheme:")) {
  const themeId = action.slice("setTheme:".length);
  mainWindow.webview.rpc.request.setTheme({ themeId });
}
```

### RPC schema — `src/shared/rpc-schema.ts`

Add to `webview.requests`:

```typescript
setTheme: {
  params: { themeId: string };
  response: void;
};
```

### Electrobun platform — `src/mainview/src/platform/electrobun.ts`

Register the `setTheme` RPC handler that calls the same `setTheme()` function used by the web menu.

## Persistence

- Key: `span-theme`
- Storage: `localStorage`
- Default: `whisper`
- Read on app init, write on theme change

## Implementation Notes

- No changes to the `@theme` block or base app tokens — theme switching only affects the dockview container
- The app shell (menu bar, status bar) stays in the base dark palette regardless of dockview theme. For light themes (Daylight, GameMaker, Light Classic), this creates a dark-frame/light-content contrast which is intentional — the frame stays consistent.
- Built-in dockview themes will look visually different from custom themes (larger tabs, different polish) — this is expected and acceptable
