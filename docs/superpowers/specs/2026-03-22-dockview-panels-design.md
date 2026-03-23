# Dockview Panel Layout Design

## Overview

Replace the fixed CSS grid layout with Dockview, making all content panels
dockable, rearrangeable, and tab-stackable. Move toolbar actions to native
Electrobun menus and keyboard shortcuts. Persist layout across restarts.

## Goals

- All content areas become dockable Dockview panels.
- Users can drag, resize, tab-stack, and rearrange panels freely.
- Toolbar buttons are replaced by native Electrobun app menus.
- Layout is saved to disk and restored on startup.
- "View > Reset Layout" restores the default arrangement.

## Panels

| Panel ID | Title | Component | Default Position |
|----------|-------|-----------|-----------------|
| `sheets` | Sheets | SheetSidebar | Left group |
| `canvas` | Canvas | CanvasView | Center group (largest) |
| `inspector` | Inspector | Inspector | Right group |
| `annotations` | Sprites In Sheet | AnnotationList | Right group (tabbed with inspector) |
| `gallery` | Gallery | GalleryPanel | Bottom group |

The canvas panel receives the most space in the default layout. Zoom controls
(`-` button, zoom label, `+` button) move into the CanvasView panel's header
area using Dockview's header action slots. The zoom functions (`handleZoomIn`,
`handleZoomOut`) and `zoom` ref are already in `state.ts` / `useCanvas.ts` —
the header actions component imports them directly from the store rather than
needing a ref to the CanvasView instance.

## Native Menus

Native Electrobun menus replace the toolbar. Defined on the Bun side via
Electrobun's menu API.

**File menu:**
- Save (`Cmd+S`)

**Edit menu:**
- Add Sprite
- Duplicate (`Cmd+D`)
- Delete (`Backspace`)

**View menu:**
- Reset Layout

Menu actions that affect the webview are sent as RPC messages from Bun to
the webview. The webview handles them by calling the appropriate state
actions.

Keyboard shortcuts (`Cmd+S`, `Cmd+D`, `Delete/Backspace`) remain in the
webview's keydown handler as a fallback — they work regardless of whether
the menu is present.

## Layout Persistence

### Save

When the Dockview layout changes (panel moved, resized, tab reordered),
the webview serializes the layout via `dockviewApi.toJSON()` and sends it
to Bun via the `saveLayout` RPC request. Bun writes it to Electrobun's
user data directory as `layout.json`.

Debounce the save — layout changes fire rapidly during drag operations.
A 500ms debounce is sufficient.

### Load

On startup, after the webview mounts, it calls the `loadLayout` RPC
request. If Bun returns a saved layout object, the webview applies it via
`dockviewApi.fromJSON(layout)` inside a try/catch. If null, corrupt, or
the Dockview version has changed and the format is incompatible, fall back
to the default layout. The catch ensures a bad `layout.json` never
prevents startup.

### Reset

"View > Reset Layout": Bun deletes the saved `layout.json` file, then
sends a `resetLayout` RPC message to the webview. The webview clears the
Dockview instance and applies the default layout.

## RPC Additions

All additions below must be added to the `SpanRPC` type in
`src/shared/rpc-schema.ts`, implemented in `src/bun/index.ts` (Bun-side
handlers) and `src/mainview/src/rpc.ts` (webview-side handlers and api
wrappers).

### Bun-side handlers (webview calls these)

```typescript
saveLayout: {
  params: { layout: object };
  response: { ok: boolean };
}
loadLayout: {
  params: {};
  response: object | null;
}
```

### Webview-side handlers (Bun calls these)

```typescript
// Menu-triggered actions
addSprite: { params: {}; response: void }
duplicateSprite: { params: {}; response: void }
deleteSprite: { params: {}; response: void }
triggerSave: { params: {}; response: void }
resetLayout: { params: {}; response: void }
```

Note: `triggerSave` is the menu-triggered save action (distinct from the
existing `saveAnnotations` RPC which is the webview calling Bun to persist
annotation data to disk).

## State Changes

`imageWidth` and `imageHeight` move from local refs in `App.vue` to
exported refs in `state.ts`. CanvasView sets them on image load.
`addAnnotation` already reads them from its parameters — update it to
read from state instead, so the menu-triggered `addSprite` RPC handler
can call `addAnnotation()` with no arguments.

`statusText` moves to a small status bar rendered below the Dockview
container in `App.vue`. It is not a dockable panel — just a fixed
single-line element at the bottom of the window.

## App.vue Changes

- Remove the CSS grid layout (`div.app` with sidebar/workspace/inspector).
- Remove the toolbar (`div.toolbar` with buttons).
- Replace with a `<DockviewVue>` component that fills the viewport.
- Add a fixed status bar below the Dockview container for `statusText`.
- Register each panel component in Dockview's component registry, keyed by
  panel ID.
- On mount: call `loadLayout` RPC, apply saved layout or default.
- On layout change: debounced `saveLayout` RPC call.

## Component Changes

### CanvasView

- Zoom controls (`-`, label, `+`) move from the App.vue toolbar into
  the Dockview panel header. Dockview supports custom header actions via
  the panel's `params` or a custom header renderer.
- The component itself is otherwise unchanged.

### SheetSidebar, Inspector, AnnotationList, GalleryPanel

- No changes to component internals. They are mounted inside Dockview
  panels instead of fixed grid slots.
- Each component should fill its panel (`width: 100%; height: 100%;
  overflow: auto`).

## Dependencies

- `dockview-vue` — Dockview's Vue 3 integration package.
- `dockview-core` — pulled in as a peer dependency.

## Default Layout

The default layout is defined programmatically (not from a JSON file) so
it always works even if the saved layout is missing or incompatible:

```
+----------+------------------+-----------+
|          |                  |           |
|  Sheets  |     Canvas       | Inspector |
|  (20%)   |     (55%)        |  (25%)    |
|          |                  | --------- |
|          |                  | Annot.    |
|          |                  | List      |
+----------+------------------+-----------+
|          Gallery (height: 280px)        |
+-----------------------------------------+
```

- Left group: `sheets` panel, 20% width.
- Center group: `canvas` panel, 55% width.
- Right group: `inspector` and `annotations` as tabs, 25% width.
- Bottom group: `gallery` panel, 280px height, spans full width.

## Styles

Dockview ships its own CSS (`dockview-vue/dist/styles/dockview.css`).
Import it in `main.ts`. The existing app styles (`.sidebar`, `.workspace`,
`.inspector`, `.toolbar`, etc.) that controlled the grid layout are removed.
Component-internal styles (`.sheet-list`, `.annotation-box`, etc.) remain
unchanged.

Dockview's default theme should be overridden to match the app's dark theme
(CSS custom properties on `.dockview-theme-dark` or a custom theme class).
