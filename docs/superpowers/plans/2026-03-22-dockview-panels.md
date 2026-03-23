# Dockview Panel Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed CSS grid layout with Dockview dockable panels, move toolbar to native menus, and persist layout across restarts.

**Architecture:** Dockview manages all content panels (sheets, canvas, inspector, annotation list, gallery). Native Electrobun menus replace the toolbar. Layout is serialized to JSON and saved/loaded via RPC to the Bun process.

**Tech Stack:** dockview-vue, dockview-core, Electrobun menus API

**Spec:** `docs/superpowers/specs/2026-03-22-dockview-panels-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add `dockview-vue` dependency |
| `src/shared/rpc-schema.ts` | Modify | Add layout + menu RPC types |
| `src/bun/index.ts` | Modify | Add native menus, layout save/load handlers, menu RPC sends |
| `src/mainview/src/rpc.ts` | Modify | Add menu action + resetLayout handlers, layout api wrappers |
| `src/mainview/src/state.ts` | Modify | Add `imageWidth`/`imageHeight` refs, refactor `addAnnotation` |
| `src/mainview/src/App.vue` | Rewrite | Replace grid with DockviewVue, add status bar, remove toolbar |
| `src/mainview/src/components/CanvasView.vue` | Modify | Remove imageWidth/imageHeight props, use state refs, remove emit |
| `src/mainview/src/style.css` | Modify | Remove grid layout styles, add Dockview theme overrides, add status bar |
| `src/mainview/main.ts` | Modify | Add dockview CSS import |

---

## Task 1: Install dockview-vue and update RPC schema

**Files:**
- Modify: `package.json`
- Modify: `src/shared/rpc-schema.ts`

- [ ] **Step 1: Install dockview-vue**

```bash
bun add dockview-vue dockview-core
```

`dockview-core` is a peer dependency of `dockview-vue`. Install both explicitly.

- [ ] **Step 2: Update RPC schema**

Add new RPC types to `src/shared/rpc-schema.ts`. In the `bun` section's `requests`, add:

```typescript
saveLayout: {
    params: { layout: object };
    response: { ok: boolean };
};
loadLayout: {
    params: {};
    response: object | null;
};
```

In the `webview` section's `requests`, add:

```typescript
addSprite: {
    params: {};
    response: void;
};
duplicateSprite: {
    params: {};
    response: void;
};
deleteSprite: {
    params: {};
    response: void;
};
triggerSave: {
    params: {};
    response: void;
};
resetLayout: {
    params: {};
    response: void;
};
```

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock src/shared/rpc-schema.ts
git commit -m "add dockview-vue and extend RPC schema for menus and layout"
```

---

## Task 2: Bun-side — native menus and layout persistence

**Files:**
- Modify: `src/bun/index.ts`

- [ ] **Step 1: Add layout save/load RPC handlers**

Add to the `handlers.requests` object in `BrowserView.defineRPC`:

```typescript
saveLayout: async ({ layout }) => {
    const { join } = await import("path");
    const { writeFile } = await import("fs/promises");
    const dir = (await import("electrobun/bun")).Utils.paths.userData();
    await writeFile(
        join(dir, "layout.json"),
        JSON.stringify(layout, null, 2),
    );
    return { ok: true };
},
loadLayout: async () => {
    const { join } = await import("path");
    const dir = (await import("electrobun/bun")).Utils.paths.userData();
    try {
        const file = Bun.file(join(dir, "layout.json"));
        if (!(await file.exists())) return null;
        return await file.json();
    } catch {
        return null;
    }
},
```

- [ ] **Step 2: Add native menus after window creation**

After `const mainWindow = new BrowserWindow(...)`, add the native menus.
Use Electrobun's `ApplicationMenu` API:

```typescript
import { ApplicationMenu } from "electrobun/bun";

const menu = ApplicationMenu.create([
    {
        label: "File",
        submenu: [
            {
                label: "Save",
                accelerator: "CommandOrControl+S",
                click: () => {
                    mainWindow.webview.rpc.request.triggerSave({});
                },
            },
        ],
    },
    {
        label: "Edit",
        submenu: [
            {
                label: "Add Sprite",
                click: () => {
                    mainWindow.webview.rpc.request.addSprite({});
                },
            },
            {
                label: "Duplicate",
                accelerator: "CommandOrControl+D",
                click: () => {
                    mainWindow.webview.rpc.request.duplicateSprite({});
                },
            },
            {
                label: "Delete",
                accelerator: "Backspace",
                click: () => {
                    mainWindow.webview.rpc.request.deleteSprite({});
                },
            },
        ],
    },
    {
        label: "View",
        submenu: [
            {
                label: "Reset Layout",
                click: async () => {
                    // Delete saved layout first
                    const { join } = await import("path");
                    const { unlink } = await import("fs/promises");
                    const { Utils } = await import("electrobun/bun");
                    const dir = Utils.paths.userData();
                    try {
                        await unlink(join(dir, "layout.json"));
                    } catch {
                        // ignore if not found
                    }
                    mainWindow.webview.rpc.request.resetLayout({});
                },
            },
        ],
    },
]);
```

Note: Check Electrobun's actual menu API at runtime — it may use `Tray` or
`Menu` instead of `ApplicationMenu`. Consult the Electrobun docs
(`https://blackboard.sh/electrobun/llms.txt`) for the exact API. The pattern
above shows the intent; adapt to the actual API shape.

- [ ] **Step 3: Commit**

```bash
git add src/bun/index.ts
git commit -m "add native menus and layout persistence handlers"
```

---

## Task 3: Webview RPC — menu action handlers and layout API

**Files:**
- Modify: `src/mainview/src/rpc.ts`

- [ ] **Step 1: Add handler registration for menu actions**

Similar to the `canCloseHandler` pattern, add handlers for menu-triggered
actions. These will be wired up by `state.ts` on import:

```typescript
let addSpriteHandler: () => void = () => {};
let duplicateSpriteHandler: () => void = () => {};
let deleteSpriteHandler: () => void = () => {};
let triggerSaveHandler: () => void = () => {};
let resetLayoutHandler: () => void = () => {};

export function setMenuHandlers(handlers: {
    addSprite: () => void;
    duplicateSprite: () => void;
    deleteSprite: () => void;
    triggerSave: () => void;
}) {
    addSpriteHandler = handlers.addSprite;
    duplicateSpriteHandler = handlers.duplicateSprite;
    deleteSpriteHandler = handlers.deleteSprite;
    triggerSaveHandler = handlers.triggerSave;
}

export function setResetLayoutHandler(handler: () => void) {
    resetLayoutHandler = handler;
}
```

- [ ] **Step 2: Register the handlers in defineRPC**

Update the `Electroview.defineRPC` call to include the new request handlers:

```typescript
const rpc = Electroview.defineRPC<SpanRPC>({
    handlers: {
        requests: {
            canClose: () => canCloseHandler(),
            addSprite: () => { addSpriteHandler(); },
            duplicateSprite: () => { duplicateSpriteHandler(); },
            deleteSprite: () => { deleteSpriteHandler(); },
            triggerSave: () => { triggerSaveHandler(); },
            resetLayout: () => { resetLayoutHandler(); },
        },
        messages: {
            projectLoaded: ({ projectPath: path }) => {
                projectPath.value = path;
                console.log("Project loaded:", path);
            },
        },
    },
});
```

- [ ] **Step 3: Add layout API wrappers**

Add to the `api` export:

```typescript
saveLayout: (layout: object) =>
    electroview.rpc.request.saveLayout({ layout }),
loadLayout: () =>
    electroview.rpc.request.loadLayout({}),
```

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/rpc.ts
git commit -m "add menu action handlers and layout API to webview RPC"
```

---

## Task 4: State changes — imageWidth/imageHeight and addAnnotation refactor

**Files:**
- Modify: `src/mainview/src/state.ts`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Move imageWidth/imageHeight to state.ts**

Add to the core state section of `state.ts`:

```typescript
export const imageWidth = ref(0);
export const imageHeight = ref(0);
```

- [ ] **Step 2: Refactor addAnnotation to read from state**

Change the `addAnnotation` function signature to take no required image
dimensions — read them from state instead. Keep `viewportCenterX` and
`viewportCenterY` as parameters since those come from the canvas:

```typescript
export function addAnnotation(
    viewportCenterX: number = 0,
    viewportCenterY: number = 0,
) {
    const w = Math.min(16, imageWidth.value || 16);
    const h = Math.min(16, imageHeight.value || 16);
    const x = Math.max(0, Math.round(viewportCenterX - w / 2));
    const y = Math.max(0, Math.round(viewportCenterY - h / 2));
    // ... rest unchanged
```

- [ ] **Step 3: Wire menu handlers in state.ts**

Import `setMenuHandlers` from `./rpc` and call it. This requires a
reference to the CanvasView's `getViewportCenter` — but since menus trigger
from outside the component, use a global callback:

```typescript
import { api, setCanCloseHandler, setMenuHandlers } from "./rpc";

let getViewportCenter: () => { x: number; y: number } = () => ({ x: 0, y: 0 });

export function registerViewportCenterFn(
    fn: () => { x: number; y: number },
) {
    getViewportCenter = fn;
}

// After the existing setCanCloseHandler call:
setMenuHandlers({
    addSprite: () => {
        const center = getViewportCenter();
        addAnnotation(center.x, center.y);
    },
    duplicateSprite: () => duplicateSelected(),
    deleteSprite: () => deleteSelected(),
    triggerSave: () => {
        saveCurrentAnnotations().catch((e) => {
            console.error(e);
            statusText.value = "Save failed";
        });
    },
});
// resetLayout is wired separately by App.vue via setResetLayoutHandler
```

- [ ] **Step 4: Update CanvasView.vue**

Remove the `imageWidth`/`imageHeight` props. Import them from state instead.
Remove the `imageLoaded` emit — instead, set `imageWidth.value` and
`imageHeight.value` directly in `onImageLoad`. Also call
`registerViewportCenterFn` on mount:

In `<script setup>`:
```typescript
import { imageWidth, imageHeight, registerViewportCenterFn } from "../state";
// Remove: const props = defineProps<{ imageWidth: number; imageHeight: number }>();
// Remove: const emit = defineEmits<{ chromaSampled: ...; imageLoaded: ... }>();
// Keep only chromaSampled emit
const emit = defineEmits<{ chromaSampled: [color: string] }>();
```

Replace `props.imageWidth` / `props.imageHeight` references with
`imageWidth.value` / `imageHeight.value` throughout the component.

In `onImageLoad`:
```typescript
function onImageLoad() {
    const img = sheetImg.value;
    if (!img) return;
    imageWidth.value = img.naturalWidth;
    imageHeight.value = img.naturalHeight;
    sampleCanvas.width = img.naturalWidth;
    sampleCanvas.height = img.naturalHeight;
    sampleCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
    sampleCtx.drawImage(img, 0, 0);
}
```

In `onMounted` (add):
```typescript
import { onMounted } from "vue";

onMounted(() => {
    registerViewportCenterFn(() => {
        const el = scroller.value;
        if (!el) return { x: 0, y: 0 };
        const x = (el.scrollLeft + el.clientWidth / 2) / zoom.value;
        const y = (el.scrollTop + el.clientHeight / 2) / zoom.value;
        return { x, y };
    });
});
```

Update `stageWidth`/`stageHeight` computed refs:
```typescript
const stageWidth = computed(() => Math.round(imageWidth.value * zoom.value));
const stageHeight = computed(() => Math.round(imageHeight.value * zoom.value));
```

Replace **every** `props.imageWidth` with `imageWidth.value` and
`props.imageHeight` with `imageHeight.value` throughout the file. Key
call sites to check:
- `handleWheel`: guard `if (!props.imageWidth)` → `if (!imageWidth.value)`
- `handleBoxPointerMove`: `onPointerMove(event, props.imageWidth, props.imageHeight)` → `onPointerMove(event, imageWidth.value, imageHeight.value)`
- `sampleColorAt`: bounds checks
- `stageWidth`/`stageHeight` computed refs (already shown above)

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/state.ts src/mainview/src/components/CanvasView.vue
git commit -m "move image dimensions to state, refactor addAnnotation for menu support"
```

---

## Task 5: Rewrite App.vue with DockviewVue

**Files:**
- Modify: `src/mainview/src/App.vue`
- Modify: `src/mainview/main.ts`

- [ ] **Step 1: Add dockview CSS import to main.ts**

Add before the style.css import:

```typescript
import "dockview-vue/dist/styles/dockview.css";
```

- [ ] **Step 2: Rewrite App.vue**

Replace the entire file. The new App.vue:
- Uses `<DockviewVue>` as the main layout container
- Registers panel components via Dockview's component map
- Loads saved layout on mount, falls back to default
- Debounced layout save on change
- Renders status bar below the Dockview container
- Handles `chromaSampled` via a provide/inject or direct import pattern

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import {
    DockviewVue,
    type DockviewReadyEvent,
    type DockviewApi,
} from "dockview-vue";
import SheetSidebar from "./components/SheetSidebar.vue";
import CanvasView from "./components/CanvasView.vue";
import Inspector from "./components/Inspector.vue";
import AnnotationList from "./components/AnnotationList.vue";
import GalleryPanel from "./components/GalleryPanel.vue";
import {
    zoom,
    dirty,
    statusText,
    selectedAnnotation,
    loadProjectData,
    duplicateSelected,
    deleteSelected,
    saveCurrentAnnotations,
    colorPickArmed,
    updateSelectedAnnotation,
} from "./state";
import { ZOOM_FACTOR } from "./state";
import { api, setResetLayoutHandler } from "./rpc";

const components = {
    sheets: SheetSidebar,
    canvas: CanvasView,
    inspector: Inspector,
    annotations: AnnotationList,
    gallery: GalleryPanel,
};

let dockviewApi: DockviewApi | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveLayout() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        if (!dockviewApi) return;
        const layout = dockviewApi.toJSON();
        try {
            await api.saveLayout(layout);
        } catch (e) {
            console.error("Failed to save layout", e);
        }
    }, 500);
}

function applyDefaultLayout(api: DockviewApi) {
    const left = api.addGroup();
    const center = api.addGroup();
    const right = api.addGroup();
    const bottom = api.addGroup();

    api.addPanel({
        id: "sheets",
        component: "sheets",
        title: "Sheets",
        position: { referenceGroup: left },
    });
    api.addPanel({
        id: "canvas",
        component: "canvas",
        title: "Canvas",
        position: { referenceGroup: center },
    });
    api.addPanel({
        id: "inspector",
        component: "inspector",
        title: "Inspector",
        position: { referenceGroup: right },
    });
    api.addPanel({
        id: "annotations",
        component: "annotations",
        title: "Sprites In Sheet",
        position: { referenceGroup: right },
    });
    api.addPanel({
        id: "gallery",
        component: "gallery",
        title: "Gallery",
        position: { referenceGroup: bottom },
    });

    // Set relative sizes
    api.getGroup(left.id)?.api.setSize({ width: 280 });
    api.getGroup(right.id)?.api.setSize({ width: 340 });
    api.getGroup(bottom.id)?.api.setSize({ height: 280 });
}

async function onReady(event: DockviewReadyEvent) {
    dockviewApi = event.api;

    // Try to load saved layout
    try {
        const saved = await api.loadLayout();
        if (saved) {
            event.api.fromJSON(saved as any);
        } else {
            applyDefaultLayout(event.api);
        }
    } catch {
        applyDefaultLayout(event.api);
    }

    // Listen for layout changes
    event.api.onDidLayoutChange(() => {
        debouncedSaveLayout();
    });

    // Wire reset layout handler (separate from menu handlers set by state.ts)
    setResetLayoutHandler(() => {
        if (!dockviewApi) return;
        dockviewApi.clear();
        applyDefaultLayout(dockviewApi);
    });
}

// Keyboard shortcuts (fallback — menus handle these too)
function onKeydown(event: KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey;
    const tag = (document.activeElement?.tagName ?? "").toUpperCase();
    const inInput =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

    if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveCurrentAnnotations().catch((e) => {
            console.error(e);
            statusText.value = "Save failed";
        });
        return;
    }

    if (mod && event.key.toLowerCase() === "d" && !inInput) {
        event.preventDefault();
        duplicateSelected();
        return;
    }

    if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !inInput
    ) {
        event.preventDefault();
        deleteSelected();
    }
}

onMounted(async () => {
    window.addEventListener("keydown", onKeydown);
    try {
        await loadProjectData();
    } catch (e) {
        console.error(e);
        statusText.value = "Startup failed";
    }
});

onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
    if (saveTimeout) clearTimeout(saveTimeout);
});
</script>

<template>
    <div class="app-shell">
        <DockviewVue
            class="dockview-container"
            :components="components"
            class-name="dockview-theme-dark"
            @ready="onReady"
        />
        <div class="status-bar">{{ statusText }}</div>
    </div>
</template>
```

Note: The exact Dockview API for `addGroup`, `addPanel`, `setSize`,
`fromJSON`, `toJSON`, `clear`, and `onDidLayoutChange` should be verified
against the `dockview-vue` package version installed. The above matches
the dockview v1.x API. Consult the dockview docs if anything doesn't
compile.

Also note: The `chromaSampled` event that CanvasView used to emit to
App.vue needs a new path. Since CanvasView is no longer a direct child
in the template, handle it inside CanvasView itself:

In CanvasView, replace `emit("chromaSampled", color)` with:
```typescript
import { updateSelectedAnnotation, colorPickArmed } from "../state";

// In sampleColorAt:
updateSelectedAnnotation({ chroma_key: color });
colorPickArmed.value = false;
```

This removes the need for the `chromaSampled` emit entirely.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/main.ts src/mainview/src/App.vue
git commit -m "rewrite App.vue with DockviewVue layout"
```

---

## Task 6: Style updates — remove grid, add Dockview theme

**Files:**
- Modify: `src/mainview/src/style.css`

- [ ] **Step 1: Remove grid layout styles**

Remove these CSS rules that controlled the fixed grid layout:

- `.app` (grid-template-columns)
- `.sidebar` (border-right, specific padding as layout element)
- `.workspace` (grid-template-rows)
- `.inspector` (border-left)
- `.toolbar`, `.toolbar-group`, `.toolbar-help`, `.zoom-label`
- `.canvas-shell` padding (Dockview handles panel sizing)
- The `@media` responsive breakpoint rules

Keep all component-internal styles: `.sheet-list`, `.sheet-card`,
`.annotation-box`, `.inspector-form`, `.gallery-list`, `.gallery-card`,
`.panel`, `.panel-header`, `.pill`, `.canvas-scroller`, `.canvas-stage`,
`.sheet-image`, `.annotation-layer`, `.resize-handle`, `.annotation-label`,
`.inline-field`, `.gallery-panel`, `.gallery-preview`, `.empty-state`,
`.search-input`, `.annotation-list`, `.annotation-card`, `.annotation-name`,
`.annotation-meta`, `.sheet-name`, `.sheet-meta`, `.gallery-name`,
`.gallery-meta`, `.gallery-preview`.

- [ ] **Step 2: Add app shell and status bar styles**

```css
.app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

.dockview-container {
    flex: 1;
    min-height: 0;
}

.status-bar {
    padding: 4px 12px;
    border-top: 1px solid var(--panel-border);
    background: var(--panel);
    color: var(--text-muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

- [ ] **Step 3: Add Dockview dark theme overrides**

Override Dockview's CSS custom properties to match the app's dark theme:

```css
.dockview-theme-dark {
    --dv-paneview-header-border-color: var(--panel-border);
    --dv-tabs-and-actions-container-background-color: var(--panel);
    --dv-activegroup-visiblepanel-tab-background-color: var(--panel-muted);
    --dv-activegroup-hiddenpanel-tab-background-color: var(--panel);
    --dv-inactivegroup-visiblepanel-tab-background-color: var(--panel-muted);
    --dv-inactivegroup-hiddenpanel-tab-background-color: var(--panel);
    --dv-tab-divider-color: var(--panel-border);
    --dv-activegroup-visiblepanel-tab-color: var(--text);
    --dv-activegroup-hiddenpanel-tab-color: var(--text-muted);
    --dv-inactivegroup-visiblepanel-tab-color: var(--text-muted);
    --dv-inactivegroup-hiddenpanel-tab-color: var(--text-muted);
    --dv-background-color: var(--bg);
    --dv-group-view-background-color: var(--panel);
    --dv-separator-border: var(--panel-border);
    --dv-drag-over-background-color: var(--overlay);
    --dv-drag-over-border-color: var(--accent);
}
```

- [ ] **Step 4: Ensure panel components fill their containers**

Add rules so each panel component fills its Dockview panel:

```css
.sidebar,
.canvas-shell,
.inspector > .panel,
.annotation-list,
.gallery-panel {
    height: 100%;
    overflow: auto;
}

.sidebar {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.canvas-shell {
    padding: 0;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "update styles for Dockview layout"
```

---

## Task 7: CanvasView zoom header actions

**Files:**
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Add zoom controls to the component itself**

Since the zoom buttons were removed from the toolbar, add them inside
CanvasView. Place them in a small floating control bar within the canvas
panel (not in the Dockview header — that's more complex and the floating
approach is simpler and looks better):

Add to the CanvasView template, right after the opening `<div class="canvas-shell">`:

```html
<div class="canvas-zoom-controls">
    <button type="button" @click="handleZoomOut">-</button>
    <span class="zoom-label">{{ zoomLabel }}</span>
    <button type="button" @click="handleZoomIn">+</button>
</div>
```

Add the computed:
```typescript
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);
```

- [ ] **Step 2: Add CSS for the floating zoom controls**

Add to `style.css`:

```css
.canvas-zoom-controls {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 100;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: rgba(23, 25, 28, 0.9);
    border: 1px solid var(--panel-border);
}

.canvas-zoom-controls button {
    width: 28px;
    padding: 4px;
    text-align: center;
}

.canvas-zoom-controls .zoom-label {
    min-width: 48px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
}
```

Also make `.canvas-shell` position relative so the absolute positioning
works:

```css
.canvas-shell {
    position: relative;
}
```

- [ ] **Step 3: Remove `handleZoomIn`/`handleZoomOut` from defineExpose**

These are no longer called from App.vue. Remove them from `defineExpose`
(keep `getViewportCenter` if still needed, or remove `defineExpose`
entirely if it's no longer used externally).

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/components/CanvasView.vue src/mainview/src/style.css
git commit -m "add floating zoom controls to CanvasView"
```

---

## Task 8: Integration testing

- [ ] **Step 1: Build and launch**

```bash
bun start
```

Verify:
- App opens with Dockview layout (5 panels in default positions)
- Native menus appear (File > Save, Edit > Add/Duplicate/Delete, View > Reset Layout)
- Panels can be dragged, resized, and tab-stacked
- Sheet list loads and clicking a sheet loads the image
- Annotation boxes appear and can be dragged/resized
- Inspector updates on selection
- Menu items work (Add Sprite, Duplicate, Delete, Save)
- Keyboard shortcuts still work (Cmd+S, Cmd+D, Delete)
- Zoom controls work in the canvas panel
- Gallery shows previews
- Chroma key Pick button works
- Status bar shows at the bottom
- Close the app and reopen — layout is restored
- View > Reset Layout restores default layout

- [ ] **Step 2: Fix any issues**

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "integration fixes for Dockview layout"
```
