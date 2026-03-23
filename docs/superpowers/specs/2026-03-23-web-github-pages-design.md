# Web Build for GitHub Pages

**Date:** 2026-03-23
**Status:** Approved

## Summary

Add a web build of Span that runs on GitHub Pages, allowing users to load spritesheet projects from their local filesystem via the browser. The desktop (Electrobun) build remains unchanged. Both builds share the same Vue components and state logic through a platform adapter pattern.

## Requirements

- Users load projects via drag-and-drop or folder picker (no bundled demo)
- Read/write via File System Access API; fallback to download-based export on unsupported browsers
- Shared codebase with adapter pattern — same components, same `state.ts`
- Layout persistence via localStorage
- Deploy to GitHub Pages via GitHub Actions

## Architecture

### Platform Adapter Interface

Extract the `api` object from `rpc.ts` into a typed interface with two implementations:

```typescript
// src/mainview/src/platform/types.ts
export interface PlatformAdapter {
  getProjectAnnotations(): Promise<SheetWithAnnotations[]>;
  saveAnnotations(sheet: string, annotations: Annotation[]): Promise<{ ok: boolean }>;
  getSheetImage(sheet: string): Promise<string>;
  pickProjectDirectory(): Promise<string | null>;
  revealSheet(sheet: string): Promise<void>;
  saveLayout(layout: object): Promise<{ ok: boolean }>;
  loadLayout(): Promise<object | null>;
}
```

### Module Structure

```
src/mainview/src/platform/
├── types.ts          # PlatformAdapter interface
├── adapter.ts        # Global api instance + setter + platform ref
├── electrobun.ts     # ElectrobunAdapter (wraps current rpc.ts logic)
└── web.ts            # WebAdapter (File System Access API + fallbacks)
```

**`adapter.ts` exports:**
- `api` — the global adapter instance, same shape consumers already use
- `setAdapter(adapter: PlatformAdapter)` — called once at boot by the entry point
- `platform` — a reactive ref (`"desktop"` | `"web"`) for conditional UI

### Consumer Changes

These files change their import from `"./rpc"` / `"../rpc"` to `"./platform/adapter"` / `"../platform/adapter"`:
- `state.ts`
- `App.vue`
- `SheetSidebar.vue`
- `GalleryPanel.vue`

The `api` object they import has the same shape — no other changes needed.

### ElectrobunAdapter

Wraps the existing Electrobun RPC logic from `rpc.ts`. Keeps the handler registration functions (`setCanCloseHandler`, `setMenuHandlers`, `setResetLayoutHandler`, `setAddPanelHandler`) as desktop-only concerns tied to native menus.

### WebAdapter

**Loading a project:**
- `showDirectoryPicker()` grants a `FileSystemDirectoryHandle`
- Reads `sheets/` subdirectory for PNGs, `annotations/` for JSON files, `manifest.json` for metadata
- PNGs read as blobs → `URL.createObjectURL()` (no base64 encoding)
- Directory handle stored for save-back
- Fallback: `<input type="file" webkitdirectory>` reads files into memory (no save-back)

**Saving annotations:**
- With `FileSystemDirectoryHandle`: write directly to `annotations/*.annotations.json`
- Without handle (fallback): trigger browser download of JSON file(s)
- Status bar indicates active mode

**Layout persistence:**
- `saveLayout` → `localStorage.setItem("span-layout", JSON.stringify(layout))`
- `loadLayout` → `JSON.parse(localStorage.getItem("span-layout"))`

**`revealSheet`:** no-op on web

**`pickProjectDirectory`:** calls `showDirectoryPicker()` or shows file input fallback

## Entry Points

**New files:**
- `src/mainview/main-web.ts` — web entry point (~15 lines). Creates Vue app, initializes `WebAdapter`, shows landing screen until user picks a directory.
- `src/mainview/index-web.html` — web HTML entry, points to `main-web.ts`

**App.vue changes:**
- `loadProjectData()` stays the same; web adapter returns empty array from `getProjectAnnotations()` until directory opened
- New reactive `projectOpen` flag controls whether to show workspace or landing screen
- Landing screen: centered card with app name, description, "Open Folder" button
- Drag-and-drop folder onto landing screen also works

## Build Configuration

**`vite.config.web.ts`:**
- Same plugins (Vue, Tailwind)
- `build.outDir` → `dist-web/`
- `base: "/span/"` (for `username.github.io/span/`)
- Entry: `index-web.html`

**New script in `package.json`:**
- `"build:web": "vite build --config vite.config.web.ts"`

## Deployment

**`.github/workflows/deploy-web.yml`:**
- Trigger: push to master
- Steps: `bun install` → `bun run build:web` → deploy `dist-web/` via `actions/deploy-pages`

## Web-Specific UX

**Landing screen:**
- Centered card with app name, brief description, "Open Folder" button
- If File System Access API unavailable, button says "Select Folder" and uses `<input webkitdirectory>` fallback
- Drag-and-drop folder also supported

**Save mode indicator:**
- Status bar badge: "Direct Save" (File System Access API) or "Download Mode" (fallback)
- In download mode, Cmd+S triggers download of annotation JSON files

**Gracefully hidden on web (not errored):**
- "Reveal in Finder" — hidden from context menu when `platform.value === "web"`
- Native menu bar — keyboard shortcuts in `App.vue` already cover all actions
- `canClose` handler — replaced with `beforeunload` event for unsaved changes warning
- `projectLoaded` RPC message — web adapter sets `projectPath` directly

**Browser support:**
- Full experience: Chrome, Edge (File System Access API)
- Degraded (no save-back): Firefox, Safari
- No polyfills or shims needed

## Unchanged

- `state.ts` logic (except import path)
- All Vue components (except import path and conditional "Reveal in Finder")
- Desktop build process and configuration
- `src/bun/` main process
- `electrobun.config.ts`
- Existing `vite.config.ts` (desktop build)
