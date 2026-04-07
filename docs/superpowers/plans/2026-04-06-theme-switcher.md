# Theme Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 10 switchable dockview themes (4 custom, 2 retro, 4 built-in) with a View > Theme submenu in both web and native menus, persisted via localStorage.

**Architecture:** Theme registry in `themes.ts` defines all themes. Each custom theme is a CSS class with `--dv-*` variable overrides. App.vue holds a reactive theme ref, drives the dockview `:theme` prop and container class. Menu and native menu both dispatch `setTheme:<id>` actions.

**Tech Stack:** Vue 3, dockview-core themes, CSS custom properties, localStorage, Electrobun RPC

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/mainview/src/themes.ts` (create) | Theme registry — types, theme list, lookup helpers |
| `src/mainview/src/style.css` (modify) | CSS variable overrides for each custom theme class |
| `src/mainview/src/menus.ts` (modify) | Add Theme submenu to View menu |
| `src/mainview/src/components/MenuBar.vue` (modify) | Render submenu for items with `children` |
| `src/mainview/src/App.vue` (modify) | Reactive theme state, setTheme handler, template binding |
| `src/mainview/src/platform/adapter.ts` (modify) | setTheme handler slot |
| `src/mainview/src/platform/electrobun.ts` (modify) | Wire setTheme RPC handler |
| `src/shared/rpc-schema.ts` (modify) | Add setTheme to webview requests |
| `src/bun/index.ts` (modify) | Theme submenu in native menu, forward setTheme action |

---

### Task 1: Create theme registry

**Files:**
- Create: `src/mainview/src/themes.ts`

- [ ] **Step 1: Create themes.ts with types and all theme definitions**

```typescript
import {
	themeDark,
	themeLight,
	themeVisualStudio,
	themeDracula,
} from "dockview-core";
import type { DockviewTheme } from "dockview-core";

export interface Theme {
	id: string;
	label: string;
	dockviewTheme: DockviewTheme;
	cssClass?: string;
}

export const THEMES: Theme[] = [
	// Custom
	{ id: "whisper", label: "Whisper", dockviewTheme: themeDark, cssClass: "dv-theme-whisper" },
	{ id: "frost", label: "Frost", dockviewTheme: themeDark, cssClass: "dv-theme-frost" },
	{ id: "ember", label: "Ember", dockviewTheme: themeDark, cssClass: "dv-theme-ember" },
	{ id: "daylight", label: "Daylight", dockviewTheme: themeLight, cssClass: "dv-theme-daylight" },
	// Retro
	{ id: "aseprite", label: "Aseprite", dockviewTheme: themeDark, cssClass: "dv-theme-aseprite" },
	{ id: "gamemaker", label: "GameMaker", dockviewTheme: themeLight, cssClass: "dv-theme-gamemaker" },
	// Built-in
	{ id: "classic-dark", label: "Dark (Classic)", dockviewTheme: themeDark },
	{ id: "classic-light", label: "Light (Classic)", dockviewTheme: themeLight },
	{ id: "vscode", label: "VS Code", dockviewTheme: themeVisualStudio },
	{ id: "dracula", label: "Dracula", dockviewTheme: themeDracula },
];

const THEME_MAP = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: string): Theme {
	return THEME_MAP.get(id) ?? THEMES[0];
}

export function getDefaultTheme(): Theme {
	return THEMES[0];
}

export const THEME_STORAGE_KEY = "span-theme";
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/themes.ts
git commit -m "feat: add theme registry with 10 themes"
```

---

### Task 2: Refactor Whisper CSS into a scoped class

**Files:**
- Modify: `src/mainview/src/style.css:251-351`

The current `.dockview-theme-dark.dockview-theme-dark` block needs to become `.dv-theme-whisper`. This block contains all the Whisper-specific variable overrides and class rules.

- [ ] **Step 1: Rename the selector**

Change line 251 from:
```css
.dockview-theme-dark.dockview-theme-dark {
```
to:
```css
.dv-theme-whisper {
```

- [ ] **Step 2: Extract shared custom-theme base rules**

Before `.dv-theme-whisper`, add a shared base class that all custom themes will use for the common Whisper-style polish (slim tabs, close button behavior, rounded drop targets, etc.):

```css
/* --- Custom theme base (shared by all non-built-in themes) --- */

.dv-theme-base {
	/* Sizing & typography */
	--dv-tabs-and-actions-container-height: 26px;
	--dv-tabs-and-actions-container-font-size: 11px;
	--dv-tab-font-size: 11px;
	font-family: var(--font-body);

	/* No tab dividers */
	--dv-tab-divider-color: transparent;

	/* Sash behavior */
	--dv-sash-color: transparent;
	--dv-active-sash-transition-duration: 0.15s;
	--dv-active-sash-transition-delay: 0.3s;

	/* Transition timing */
	--dv-transition-duration: 150ms;

	/* Hide close buttons, show on tab hover */
	& .dv-default-tab-action {
		opacity: 0;
		transition: opacity 0.15s;
	}
	& .dv-default-tab:hover .dv-default-tab-action {
		opacity: 1;
	}

	/* Slim tab padding */
	& .dv-default-tab {
		padding: 0 12px;
		min-width: 0;
		gap: 6px;
	}
	& .dv-default-tab-action {
		padding: 2px;
	}
	& .dv-default-tab-action svg {
		width: 10px;
		height: 10px;
	}

	/* Rounded drop targets */
	& .dv-drop-target-selection {
		border-radius: 4px;
		margin: 4px;
	}

	/* Dragged tab ghost */
	& .dv-tab.dv-tab-dragging {
		opacity: 0.5;
	}

	/* Rounded floating panels */
	& .dv-resize-container {
		border-radius: 4px;
		overflow: hidden;
	}

	/* Inactive tabs lift on hover */
	& .dv-tab.dv-inactive-tab .dv-default-tab {
		transition: color 0.15s;
	}
}
```

- [ ] **Step 3: Slim down .dv-theme-whisper to only Whisper-specific values**

Remove everything that was moved to `.dv-theme-base`. The Whisper block should only contain color-specific overrides:

```css
.dv-theme-whisper {
	/* Backgrounds */
	--dv-background-color: #0c0d0f;
	--dv-group-view-background-color: #121417;
	--dv-tabs-and-actions-container-background-color: #0c0d0f;

	/* Tab backgrounds — all flat */
	--dv-activegroup-visiblepanel-tab-background-color: #0c0d0f;
	--dv-activegroup-hiddenpanel-tab-background-color: #0c0d0f;
	--dv-inactivegroup-visiblepanel-tab-background-color: #0c0d0f;
	--dv-inactivegroup-hiddenpanel-tab-background-color: #0c0d0f;

	/* Tab text */
	--dv-activegroup-visiblepanel-tab-color: #e4a46e;
	--dv-activegroup-hiddenpanel-tab-color: #6b6558;
	--dv-inactivegroup-visiblepanel-tab-color: #9b9484;
	--dv-inactivegroup-hiddenpanel-tab-color: #6b6558;

	/* Borders */
	--dv-separator-border: #2a2e35;
	--dv-paneview-header-border-color: #2a2e35;

	/* Drag & drop */
	--dv-drag-over-background-color: rgba(200, 136, 90, 0.08);
	--dv-drag-over-border: 1px solid rgba(200, 136, 90, 0.25);

	/* Focus & interaction */
	--dv-paneview-active-outline-color: #c8885a;
	--dv-icon-hover-background-color: #22252a;
	--dv-active-sash-color: #c8885a;

	/* Scrollbar */
	--dv-tabs-container-scrollbar-color: #2a2e35;
	--dv-scrollbar-background-color: #2a2e35;

	/* Floating */
	--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(200, 136, 90, 0.15);

	/* Active tab glow */
	& .dv-groupview.dv-active-group .dv-tab.dv-active-tab .dv-default-tab {
		font-weight: 500;
		text-shadow: 0 0 10px rgba(200, 136, 90, 0.3);
	}

	/* Inactive tab hover */
	& .dv-tab.dv-inactive-tab:hover .dv-default-tab {
		color: #9b9484;
	}

	/* Sash glow */
	& .dv-sash:hover,
	& .dv-sash:active {
		box-shadow: 0 0 8px rgba(200, 136, 90, 0.25);
	}
}
```

Note: all `var(--color-*)` references are replaced with hardcoded hex values so themes are self-contained and don't depend on the app's base token system.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "refactor: extract theme base, scope Whisper to .dv-theme-whisper"
```

---

### Task 3: Add Frost, Ember, and Daylight theme CSS

**Files:**
- Modify: `src/mainview/src/style.css` (add after `.dv-theme-whisper` block)

- [ ] **Step 1: Add Frost theme**

```css
.dv-theme-frost {
	/* Backgrounds — cool dark */
	--dv-background-color: #0b0d10;
	--dv-group-view-background-color: #10141a;
	--dv-tabs-and-actions-container-background-color: #0b0d10;

	/* Tab backgrounds — all flat */
	--dv-activegroup-visiblepanel-tab-background-color: #0b0d10;
	--dv-activegroup-hiddenpanel-tab-background-color: #0b0d10;
	--dv-inactivegroup-visiblepanel-tab-background-color: #0b0d10;
	--dv-inactivegroup-hiddenpanel-tab-background-color: #0b0d10;

	/* Tab text */
	--dv-activegroup-visiblepanel-tab-color: #88b4e0;
	--dv-activegroup-hiddenpanel-tab-color: #4a5568;
	--dv-inactivegroup-visiblepanel-tab-color: #7a8a9e;
	--dv-inactivegroup-hiddenpanel-tab-color: #4a5568;

	/* Borders */
	--dv-separator-border: #1e2836;
	--dv-paneview-header-border-color: #1e2836;

	/* Drag & drop */
	--dv-drag-over-background-color: rgba(106, 159, 216, 0.08);
	--dv-drag-over-border: 1px solid rgba(106, 159, 216, 0.25);

	/* Focus & interaction */
	--dv-paneview-active-outline-color: #6a9fd8;
	--dv-icon-hover-background-color: #1a2230;
	--dv-active-sash-color: #6a9fd8;

	/* Scrollbar */
	--dv-tabs-container-scrollbar-color: #1e2836;
	--dv-scrollbar-background-color: #1e2836;

	/* Floating */
	--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(106, 159, 216, 0.15);

	/* Active tab glow */
	& .dv-groupview.dv-active-group .dv-tab.dv-active-tab .dv-default-tab {
		font-weight: 500;
		text-shadow: 0 0 10px rgba(106, 159, 216, 0.3);
	}

	/* Inactive tab hover */
	& .dv-tab.dv-inactive-tab:hover .dv-default-tab {
		color: #7a8a9e;
	}

	/* Sash glow */
	& .dv-sash:hover,
	& .dv-sash:active {
		box-shadow: 0 0 8px rgba(106, 159, 216, 0.25);
	}
}
```

- [ ] **Step 2: Add Ember theme**

```css
.dv-theme-ember {
	/* Backgrounds — warm dark */
	--dv-background-color: #100c0a;
	--dv-group-view-background-color: #171210;
	--dv-tabs-and-actions-container-background-color: #100c0a;

	/* Tab backgrounds — all flat */
	--dv-activegroup-visiblepanel-tab-background-color: #100c0a;
	--dv-activegroup-hiddenpanel-tab-background-color: #100c0a;
	--dv-inactivegroup-visiblepanel-tab-background-color: #100c0a;
	--dv-inactivegroup-hiddenpanel-tab-background-color: #100c0a;

	/* Tab text */
	--dv-activegroup-visiblepanel-tab-color: #e8956a;
	--dv-activegroup-hiddenpanel-tab-color: #5e4a3e;
	--dv-inactivegroup-visiblepanel-tab-color: #9e8070;
	--dv-inactivegroup-hiddenpanel-tab-color: #5e4a3e;

	/* Borders */
	--dv-separator-border: #2a2220;
	--dv-paneview-header-border-color: #2a2220;

	/* Drag & drop */
	--dv-drag-over-background-color: rgba(212, 115, 74, 0.08);
	--dv-drag-over-border: 1px solid rgba(212, 115, 74, 0.25);

	/* Focus & interaction */
	--dv-paneview-active-outline-color: #d4734a;
	--dv-icon-hover-background-color: #261c18;
	--dv-active-sash-color: #d4734a;

	/* Scrollbar */
	--dv-tabs-container-scrollbar-color: #2a2220;
	--dv-scrollbar-background-color: #2a2220;

	/* Floating */
	--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(212, 115, 74, 0.15);

	/* Active tab glow */
	& .dv-groupview.dv-active-group .dv-tab.dv-active-tab .dv-default-tab {
		font-weight: 500;
		text-shadow: 0 0 10px rgba(212, 115, 74, 0.3);
	}

	/* Inactive tab hover */
	& .dv-tab.dv-inactive-tab:hover .dv-default-tab {
		color: #9e8070;
	}

	/* Sash glow */
	& .dv-sash:hover,
	& .dv-sash:active {
		box-shadow: 0 0 8px rgba(212, 115, 74, 0.25);
	}
}
```

- [ ] **Step 3: Add Daylight theme**

```css
.dv-theme-daylight {
	/* Backgrounds — warm light */
	--dv-background-color: #f5f2ed;
	--dv-group-view-background-color: #ece8e0;
	--dv-tabs-and-actions-container-background-color: #f5f2ed;

	/* Tab backgrounds — all flat */
	--dv-activegroup-visiblepanel-tab-background-color: #f5f2ed;
	--dv-activegroup-hiddenpanel-tab-background-color: #f5f2ed;
	--dv-inactivegroup-visiblepanel-tab-background-color: #f5f2ed;
	--dv-inactivegroup-hiddenpanel-tab-background-color: #f5f2ed;

	/* Tab text */
	--dv-activegroup-visiblepanel-tab-color: #a0693e;
	--dv-activegroup-hiddenpanel-tab-color: #b0a898;
	--dv-inactivegroup-visiblepanel-tab-color: #8a8078;
	--dv-inactivegroup-hiddenpanel-tab-color: #b0a898;

	/* Borders */
	--dv-separator-border: #d8d2c8;
	--dv-paneview-header-border-color: #d8d2c8;

	/* Drag & drop */
	--dv-drag-over-background-color: rgba(160, 105, 62, 0.08);
	--dv-drag-over-border: 1px solid rgba(160, 105, 62, 0.2);

	/* Focus & interaction */
	--dv-paneview-active-outline-color: #a0693e;
	--dv-icon-hover-background-color: #e8e4dc;
	--dv-active-sash-color: #a0693e;

	/* Scrollbar */
	--dv-tabs-container-scrollbar-color: #d0c8bc;
	--dv-scrollbar-background-color: #d0c8bc;

	/* Floating */
	--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 0 1px rgba(160, 105, 62, 0.2);

	/* Active tab glow */
	& .dv-groupview.dv-active-group .dv-tab.dv-active-tab .dv-default-tab {
		font-weight: 500;
		text-shadow: 0 0 8px rgba(160, 105, 62, 0.2);
	}

	/* Inactive tab hover */
	& .dv-tab.dv-inactive-tab:hover .dv-default-tab {
		color: #8a8078;
	}

	/* Sash glow */
	& .dv-sash:hover,
	& .dv-sash:active {
		box-shadow: 0 0 8px rgba(160, 105, 62, 0.15);
	}
}
```

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "feat: add Frost, Ember, and Daylight theme CSS"
```

---

### Task 4: Add Aseprite and GameMaker retro theme CSS

**Files:**
- Modify: `src/mainview/src/style.css` (add after Daylight block)

- [ ] **Step 1: Add Aseprite theme**

```css
.dv-theme-aseprite {
	/* Backgrounds — dark charcoal */
	--dv-background-color: #1f1f24;
	--dv-group-view-background-color: #28282e;
	--dv-tabs-and-actions-container-background-color: #1f1f24;

	/* Tab backgrounds — all flat */
	--dv-activegroup-visiblepanel-tab-background-color: #1f1f24;
	--dv-activegroup-hiddenpanel-tab-background-color: #1f1f24;
	--dv-inactivegroup-visiblepanel-tab-background-color: #1f1f24;
	--dv-inactivegroup-hiddenpanel-tab-background-color: #1f1f24;

	/* Tab text */
	--dv-activegroup-visiblepanel-tab-color: #c490d8;
	--dv-activegroup-hiddenpanel-tab-color: #555560;
	--dv-inactivegroup-visiblepanel-tab-color: #8a8a96;
	--dv-inactivegroup-hiddenpanel-tab-color: #555560;

	/* Borders */
	--dv-separator-border: #35353c;
	--dv-paneview-header-border-color: #35353c;

	/* Drag & drop */
	--dv-drag-over-background-color: rgba(168, 108, 193, 0.08);
	--dv-drag-over-border: 1px solid rgba(168, 108, 193, 0.25);

	/* Focus & interaction */
	--dv-paneview-active-outline-color: #a86cc1;
	--dv-icon-hover-background-color: #30303a;
	--dv-active-sash-color: #a86cc1;

	/* Scrollbar */
	--dv-tabs-container-scrollbar-color: #35353c;
	--dv-scrollbar-background-color: #35353c;

	/* Floating */
	--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(168, 108, 193, 0.15);

	/* Active tab glow */
	& .dv-groupview.dv-active-group .dv-tab.dv-active-tab .dv-default-tab {
		font-weight: 500;
		text-shadow: 0 0 10px rgba(168, 108, 193, 0.3);
	}

	/* Inactive tab hover */
	& .dv-tab.dv-inactive-tab:hover .dv-default-tab {
		color: #8a8a96;
	}

	/* Sash glow */
	& .dv-sash:hover,
	& .dv-sash:active {
		box-shadow: 0 0 8px rgba(168, 108, 193, 0.25);
	}
}
```

- [ ] **Step 2: Add GameMaker theme**

```css
.dv-theme-gamemaker {
	/* Backgrounds — classic grey */
	--dv-background-color: #d4d4d4;
	--dv-group-view-background-color: #e0e0e0;
	--dv-tabs-and-actions-container-background-color: #d4d4d4;

	/* Tab backgrounds — all flat */
	--dv-activegroup-visiblepanel-tab-background-color: #d4d4d4;
	--dv-activegroup-hiddenpanel-tab-background-color: #d4d4d4;
	--dv-inactivegroup-visiblepanel-tab-background-color: #d4d4d4;
	--dv-inactivegroup-hiddenpanel-tab-background-color: #d4d4d4;

	/* Tab text */
	--dv-activegroup-visiblepanel-tab-color: #3a6aa0;
	--dv-activegroup-hiddenpanel-tab-color: #999999;
	--dv-inactivegroup-visiblepanel-tab-color: #666666;
	--dv-inactivegroup-hiddenpanel-tab-color: #999999;

	/* Borders */
	--dv-separator-border: #b8b8b8;
	--dv-paneview-header-border-color: #b8b8b8;

	/* Drag & drop */
	--dv-drag-over-background-color: rgba(74, 122, 191, 0.1);
	--dv-drag-over-border: 1px solid rgba(74, 122, 191, 0.3);

	/* Focus & interaction */
	--dv-paneview-active-outline-color: #4a7abf;
	--dv-icon-hover-background-color: #c8c8c8;
	--dv-active-sash-color: #4a7abf;

	/* Scrollbar */
	--dv-tabs-container-scrollbar-color: #b0b0b0;
	--dv-scrollbar-background-color: #b0b0b0;

	/* Floating */
	--dv-floating-box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15), 0 0 1px rgba(74, 122, 191, 0.2);

	/* Active tab glow */
	& .dv-groupview.dv-active-group .dv-tab.dv-active-tab .dv-default-tab {
		font-weight: 500;
		text-shadow: 0 0 8px rgba(74, 122, 191, 0.15);
	}

	/* Inactive tab hover */
	& .dv-tab.dv-inactive-tab:hover .dv-default-tab {
		color: #666666;
	}

	/* Sash glow */
	& .dv-sash:hover,
	& .dv-sash:active {
		box-shadow: 0 0 6px rgba(74, 122, 191, 0.15);
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "feat: add Aseprite and GameMaker retro theme CSS"
```

---

### Task 5: Add submenu rendering to MenuBar.vue

**Files:**
- Modify: `src/mainview/src/components/MenuBar.vue`

- [ ] **Step 1: Add submenu template**

Replace the `<template>` section (lines 47-77) with:

```html
<template>
	<div class="menubar" @mouseleave="closeMenus">
		<div v-for="section in menus" :key="section.label" class="menu-trigger-wrapper">
			<button
				type="button"
				class="menu-trigger"
				:class="{ active: openMenu === section.label }"
				@click="toggleMenu(section.label)"
				@mouseenter="hoverMenu(section.label)"
			>
				{{ section.label }}
			</button>
			<div v-if="openMenu === section.label" class="menu-dropdown">
				<template v-for="(item, i) in section.items" :key="i">
					<div v-if="item.separator" class="menu-separator" />
					<div v-else-if="item.children" class="menu-item-submenu-wrapper">
						<button type="button" class="menu-item">
							<span class="menu-item-check"></span>
							<span class="menu-item-label">{{ item.label }}</span>
							<span class="menu-item-shortcut">&#x25B8;</span>
						</button>
						<div class="menu-submenu">
							<template v-for="(child, j) in item.children" :key="j">
								<div v-if="child.separator" class="menu-separator" />
								<button
									v-else
									type="button"
									class="menu-item"
									:disabled="child.disabled?.()"
									@click="handleAction(child)"
								>
									<span class="menu-item-check">{{ child.checked ? "✓" : "" }}</span>
									<span class="menu-item-label">{{ child.label }}</span>
									<span v-if="child.shortcut" class="menu-item-shortcut">{{ formatShortcut(child.shortcut) }}</span>
								</button>
							</template>
						</div>
					</div>
					<button
						v-else
						type="button"
						class="menu-item"
						:disabled="item.disabled?.()"
						@click="handleAction(item)"
					>
						<span class="menu-item-check">{{ item.checked ? "✓" : "" }}</span>
						<span class="menu-item-label">{{ item.label }}</span>
						<span v-if="item.shortcut" class="menu-item-shortcut">{{ formatShortcut(item.shortcut) }}</span>
					</button>
				</template>
			</div>
		</div>
	</div>
</template>
```

- [ ] **Step 2: Add submenu CSS**

Add to the `<style scoped>` section:

```css
.menu-item-submenu-wrapper {
	position: relative;
}

.menu-submenu {
	display: none;
	position: absolute;
	top: -4px;
	left: 100%;
	min-width: 180px;
	padding: 4px 0;
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: 4px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	z-index: 1001;
}

.menu-item-submenu-wrapper:hover > .menu-submenu {
	display: block;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/components/MenuBar.vue
git commit -m "feat: add submenu rendering to MenuBar"
```

---

### Task 6: Add Theme submenu to menus.ts

**Files:**
- Modify: `src/mainview/src/menus.ts`

- [ ] **Step 1: Update getMenus to accept currentThemeId and add Theme submenu**

Replace the full contents of `menus.ts`:

```typescript
import { THEMES } from "./themes";

export interface MenuItem {
	label: string;
	action?: string;
	shortcut?: string;
	separator?: boolean;
	disabled?: () => boolean;
	checked?: boolean;
	children?: MenuItem[];
}

export interface MenuSection {
	label: string;
	items: MenuItem[];
}

export function getMenus(options?: {
	isPanelOpen?: (panelId: string) => boolean;
	currentThemeId?: string;
}): MenuSection[] {
	const isPanelOpen = options?.isPanelOpen ?? (() => false);
	const currentThemeId = options?.currentThemeId ?? "whisper";

	const themeChildren: MenuItem[] = [
		...THEMES.filter((t) => ["whisper", "frost", "ember", "daylight"].includes(t.id)).map((t) => ({
			label: t.label,
			action: `setTheme:${t.id}`,
			checked: currentThemeId === t.id,
		})),
		{ separator: true, label: "" },
		...THEMES.filter((t) => ["aseprite", "gamemaker"].includes(t.id)).map((t) => ({
			label: t.label,
			action: `setTheme:${t.id}`,
			checked: currentThemeId === t.id,
		})),
		{ separator: true, label: "" },
		...THEMES.filter((t) => ["classic-dark", "classic-light", "vscode", "dracula"].includes(t.id)).map((t) => ({
			label: t.label,
			action: `setTheme:${t.id}`,
			checked: currentThemeId === t.id,
		})),
	];

	return [
		{
			label: "File",
			items: [
				{ label: "Open Folder\u2026", action: "openFolder", shortcut: "Cmd+O" },
				{ label: "Close Project", action: "closeProject" },
				{ separator: true },
				{ label: "Import Spec\u2026", action: "importSpec" },
				{ label: "Export Spec\u2026", action: "exportSpec" },
				{ label: "Import Palette\u2026", action: "importPalette" },
				{ label: "Import Sheet\u2026", action: "importSheet" },
				{ separator: true },
				{ label: "Save", action: "save", shortcut: "Cmd+S" },
				{ label: "Save As\u2026", action: "saveAs", shortcut: "Cmd+Shift+S" },
				{ separator: true },
				{ label: "Export\u2026", action: "export", shortcut: "Cmd+E" },
			],
		},
		{
			label: "Edit",
			items: [
				{ label: "Undo Paint", action: "undo", shortcut: "Cmd+Z" },
				{ label: "Redo Paint", action: "redo", shortcut: "Cmd+Shift+Z" },
				{ separator: true },
				{ label: "Copy Pixels", action: "copyPixels", shortcut: "Cmd+C" },
				{ label: "Cut Pixels", action: "cutPixels", shortcut: "Cmd+X" },
				{ label: "Paste Pixels", action: "pastePixels", shortcut: "Cmd+V" },
				{ label: "Delete Pixels", action: "deletePixels", shortcut: "Backspace" },
				{ label: "Resize Canvas…", action: "resizeCanvas" },
				{ separator: true },
				{ label: "Add Annotation", action: "addAnnotation" },
				{ label: "Duplicate Annotation", action: "duplicateAnnotation", shortcut: "Cmd+D" },
				{ label: "Delete Annotation", action: "deleteAnnotation", shortcut: "Backspace" },
			],
		},
		{
			label: "View",
			items: [
				{ label: "Reload Window", action: "reloadWindow", shortcut: "F5" },
				{ separator: true },
				{ label: "Sheets", action: "addPanel:sheets", checked: isPanelOpen("sheets") },
				{ label: "Canvas", action: "addPanel:sprite-canvas", checked: isPanelOpen("sprite-canvas") },
				{ label: "Paint", action: "addPanel:paint", checked: isPanelOpen("paint") },
				{ label: "Inspector", action: "addPanel:inspector", checked: isPanelOpen("inspector") },
				{ label: "Sprites In Sheet", action: "addPanel:annotations", checked: isPanelOpen("annotations") },
				{ label: "Gallery", action: "addPanel:gallery", checked: isPanelOpen("gallery") },
				{ label: "Spec Editor", action: "addPanel:spec-editor", checked: isPanelOpen("spec-editor") },
				{ separator: true },
				{ label: "Theme", children: themeChildren },
				{ separator: true },
				{ label: "Reset Panel Layout", action: "resetLayout" },
			],
		},
	];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/menus.ts
git commit -m "feat: add Theme submenu to View menu"
```

---

### Task 7: Wire theme state in App.vue

**Files:**
- Modify: `src/mainview/src/App.vue`

- [ ] **Step 1: Update imports**

Replace the dockview imports at the top of the `<script setup>`:

Change:
```typescript
import type { DockviewReadyEvent, DockviewApi } from "dockview-core";
import { themeDark } from "dockview-core";
```

To:
```typescript
import type { DockviewReadyEvent, DockviewApi } from "dockview-core";
import { getTheme, THEME_STORAGE_KEY } from "./themes";
```

- [ ] **Step 2: Add reactive theme state**

After the existing `const panelStateVersion = ref(0);` line, add:

```typescript
const currentThemeId = ref(localStorage.getItem(THEME_STORAGE_KEY) ?? "whisper");
const currentTheme = computed(() => getTheme(currentThemeId.value));
```

- [ ] **Step 3: Add setTheme function**

After the `isPanelOpen` function, add:

```typescript
function setTheme(id: string) {
	currentThemeId.value = id;
	localStorage.setItem(THEME_STORAGE_KEY, id);
}
```

- [ ] **Step 4: Update MenuBar props**

Find the `<MenuBar>` in the template. Change:
```html
<MenuBar :is-panel-open="isPanelOpen" @action="handleMenuAction" />
```
To:
```html
<MenuBar :is-panel-open="isPanelOpen" :current-theme-id="currentThemeId" @action="handleMenuAction" />
```

- [ ] **Step 5: Update MenuBar component to accept currentThemeId prop**

In `MenuBar.vue`, update the props:

```typescript
const props = defineProps<{
	isPanelOpen?: (panelId: string) => boolean;
	currentThemeId?: string;
}>();
```

Update the computed menus:
```typescript
const menus = computed(() => getMenus({ isPanelOpen: props.isPanelOpen, currentThemeId: props.currentThemeId }));
```

- [ ] **Step 6: Update the dockview container template**

Change:
```html
<div class="dockview-theme-dark dockview-container">
	<DockviewVue :theme="themeDark" @ready="onReady" />
</div>
```
To:
```html
<div :class="['dockview-container', currentTheme.cssClass]">
	<DockviewVue :theme="currentTheme.dockviewTheme" @ready="onReady" />
</div>
```

- [ ] **Step 7: Add setTheme to handleMenuAction**

In `handleMenuAction`, add before the `addPanel:` check:

```typescript
} else if (action.startsWith("setTheme:")) {
	setTheme(action.slice("setTheme:".length));
```

- [ ] **Step 8: Commit**

```bash
git add src/mainview/src/App.vue src/mainview/src/components/MenuBar.vue
git commit -m "feat: wire reactive theme switching in App.vue"
```

---

### Task 8: Add setTheme RPC and native menu

**Files:**
- Modify: `src/shared/rpc-schema.ts`
- Modify: `src/mainview/src/platform/adapter.ts`
- Modify: `src/mainview/src/platform/electrobun.ts`
- Modify: `src/bun/index.ts`

- [ ] **Step 1: Add setTheme to RPC schema**

In `src/shared/rpc-schema.ts`, add to the `webview.requests` section (after `addPanel`):

```typescript
setTheme: {
	params: { themeId: string };
	response: void;
};
```

- [ ] **Step 2: Add setTheme handler slot to adapter.ts**

In `src/mainview/src/platform/adapter.ts`, add after the `addPanelHandler` lines:

```typescript
let setThemeHandler: (themeId: string) => void = () => {};

export function setSetThemeHandler(handler: (themeId: string) => void) {
	setThemeHandler = handler;
}

export function getSetThemeHandler() {
	return (themeId: string) => setThemeHandler(themeId);
}
```

- [ ] **Step 3: Wire RPC handler in electrobun.ts**

In `src/mainview/src/platform/electrobun.ts`, add import:

```typescript
import {
	getResetLayoutHandler,
	getAddPanelHandler,
	getSetThemeHandler,
} from "./adapter";
```

Add to the `handlers.requests` object (after `addPanel`):

```typescript
setTheme: ({ themeId }) => getSetThemeHandler()(themeId),
```

- [ ] **Step 4: Wire setTheme handler in App.vue**

In `App.vue`, import `setSetThemeHandler` from `./platform/adapter`:

```typescript
import {
	setResetLayoutHandler,
	setAddPanelHandler,
	setSetThemeHandler,
} from "./platform/adapter";
```

In the `onReady` function, after the existing `setAddPanelHandler` call, add:

```typescript
setSetThemeHandler((themeId: string) => setTheme(themeId));
```

- [ ] **Step 5: Add Theme submenu to native menu**

In `src/bun/index.ts`, find the View submenu (around line 402-418). Add the Theme submenu between the panel list and Reset Panel Layout. Replace the View section:

```typescript
{
	label: "View",
	submenu: [
		{ label: "Reload Window", accelerator: "F5", action: "reloadWindow" },
		{ type: "separator" as const },
		{ label: "Sheets", action: "addPanel:sheets" },
		{ label: "Canvas", action: "addPanel:sprite-canvas" },
		{ label: "Inspector", action: "addPanel:inspector" },
		{ label: "Sprites In Sheet", action: "addPanel:annotations" },
		{ label: "Gallery", action: "addPanel:gallery" },
		{ label: "Spec Editor", action: "addPanel:spec-editor" },
		{ type: "separator" as const },
		{
			label: "Theme",
			submenu: [
				{ label: "Whisper", action: "setTheme:whisper" },
				{ label: "Frost", action: "setTheme:frost" },
				{ label: "Ember", action: "setTheme:ember" },
				{ label: "Daylight", action: "setTheme:daylight" },
				{ type: "separator" as const },
				{ label: "Aseprite", action: "setTheme:aseprite" },
				{ label: "GameMaker", action: "setTheme:gamemaker" },
				{ type: "separator" as const },
				{ label: "Dark (Classic)", action: "setTheme:classic-dark" },
				{ label: "Light (Classic)", action: "setTheme:classic-light" },
				{ label: "VS Code", action: "setTheme:vscode" },
				{ label: "Dracula", action: "setTheme:dracula" },
			],
		},
		{ type: "separator" as const },
		{ label: "Reset Panel Layout", action: "resetLayout" },
		{ type: "separator" as const },
		{ role: "toggleFullScreen" },
	],
},
```

- [ ] **Step 6: Add setTheme forwarding in native menu handler**

In `src/bun/index.ts`, in the `application-menu-clicked` handler's `default` case (around line 550), add before the `addPanel:` check:

```typescript
if (action.startsWith("setTheme:")) {
	const themeId = action.slice("setTheme:".length);
	mainWindow.webview.rpc.request.setTheme({ themeId });
} else if (action.startsWith("addPanel:")) {
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/rpc-schema.ts src/mainview/src/platform/adapter.ts src/mainview/src/platform/electrobun.ts src/bun/index.ts src/mainview/src/App.vue
git commit -m "feat: add setTheme RPC and native Theme menu"
```

---

### Task 9: Verify and test

**Files:**
- Review: all modified files

- [ ] **Step 1: Start dev server and test theme switching**

Run: `bun run dev -- --port 5174`

Test each theme via View > Theme in the web menu:
- Whisper — warm dark, copper glow
- Frost — cool dark, blue-steel glow
- Ember — warm dark, red-orange glow
- Daylight — light surfaces, copper accent
- Aseprite — charcoal, purple-pink glow
- GameMaker — grey surfaces, blue accent
- Dark (Classic) — dockview default dark
- Light (Classic) — dockview default light
- VS Code — VS Code style tabs
- Dracula — dockview dracula

- [ ] **Step 2: Test persistence**

Switch to Frost, reload window (F5). Expected: Frost theme persists.

- [ ] **Step 3: Test native menu**

Use the macOS View > Theme menu. Expected: theme switches work identically.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete theme switcher with 10 themes"
```
