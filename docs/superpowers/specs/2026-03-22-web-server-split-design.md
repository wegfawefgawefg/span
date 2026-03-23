# Span: Electrobun Desktop App Design

## Overview

Refactor Span (spritesheet annotator) from a Python server with vanilla JS frontend
into a native desktop app using Electrobun. Bun main process handles all file I/O.
Vue 3 + TypeScript webview handles the UI. Typed RPC connects them. No HTTP, no
Python.

## Goals

- Replace stdlib `http.server` + Python with Bun-native file I/O.
- Replace vanilla JS frontend with Vue 3 (Composition API) + TypeScript.
- Ship as a native desktop app via Electrobun (native webview, not Chromium).
- Full feature parity with the current app (see `docs/features.md`).
- Single `bun run dev` command for development with HMR.

## Project Layout

```
span/
├── package.json
├── tsconfig.json
├── electrobun.config.ts
├── src/
│   ├── shared/                 # Shared between Bun and webview
│   │   └── rpc-schema.ts       # RPC type definitions
│   ├── bun/                    # Main process (Bun runtime)
│   │   ├── index.ts            # Entry: window creation, RPC setup, CLI args
│   │   └── project.ts          # File I/O: sheets, annotations, manifest
│   └── mainview/               # Webview (Vue app)
│       ├── index.html
│       └── src/
│           ├── main.ts
│           ├── App.vue
│           ├── rpc.ts           # Electroview RPC client (typed)
│           ├── types.ts         # Annotation, Sheet interfaces
│           ├── state.ts         # Reactive store
│           ├── components/
│           │   ├── SheetSidebar.vue
│           │   ├── CanvasView.vue
│           │   ├── Inspector.vue
│           │   ├── AnnotationList.vue
│           │   └── GalleryPanel.vue
│           └── composables/
│               ├── useCanvas.ts
│               └── useChromaKey.ts
├── example_project/            # Bundled sample project
├── docs/
└── AGENTS.md
```

## Bun Main Process

### `src/bun/index.ts`

Entry point. Responsibilities:

- Parse CLI args: `--project <path>` to open a specific project directory.
- If no `--project` arg, check for last-used project path in Electrobun user
  data. If none found, open a native file picker dialog
  (`Utils.openFileDialog()`).
- Create a `BrowserWindow` with the RPC schema and handlers.
- Send `projectLoaded` message to the webview once the project path is resolved.
- Remember last-used project path in user data for next launch.

### `src/bun/project.ts`

File I/O logic, replacing the old `server.py`. Uses Bun file APIs
(`Bun.file()`, `Bun.write()`, `fs`, `path`).

Functions:

- `listSheetFiles(sheetsDir)` — glob `*.png` from the sheets directory, return
  sorted list of file info objects.
- `annotationPathForSheet(annotationsDir, sheetName)` — derive annotation JSON
  path from sheet name.
- `loadAnnotations(annotationsDir, sheetName)` — read and parse annotation
  JSON. Return empty default on missing/malformed files. Used internally by
  `loadProjectAnnotations`.
- `saveAnnotations(annotationsDir, sheetName, payload)` — atomic write via temp
  file + rename.
- `loadManifest(manifestPath)` — read optional `manifest.json`, return a
  `Map<string, ManifestAsset>` keyed by filename. The manifest JSON has shape
  `{ assets: [{ file, name, asset_page, download_url, ... }] }`. See
  `example_project/manifest.json` for the full schema.
- `loadProjectAnnotations(projectDir)` — load all sheets with their annotations
  and manifest metadata. Returns the full project data in one call.
- `getSheetImageBase64(sheetsDir, sheetName)` — read a PNG file and return it
  as a base64 data URL (`data:image/png;base64,...`) for the webview.

### `src/shared/rpc-schema.ts`

Shared RPC type definitions. Imported by both the Bun process and the webview.
Lives in `src/shared/` and is accessible to both sides.

Electrobun RPC schema uses `RPCSchema` wrapper with `bun` and `webview`
top-level keys. `bun` defines what the Bun process handles; `webview` defines
what the webview handles.

```typescript
import { RPCSchema } from "electrobun/bun"

export type SpanRPC = {
  bun: RPCSchema<{
    requests: {
      getProjectAnnotations: {
        params: {}
        response: SheetWithAnnotations[]
      }
      saveAnnotations: {
        params: { sheet: string; annotations: Annotation[] }
        response: { ok: boolean }
      }
      getSheetImage: {
        params: { sheet: string }
        response: string  // base64 data URL (data:image/png;base64,...)
      }
      pickProjectDirectory: {
        params: {}
        response: string | null
      }
    }
    messages: {}
  }>
  webview: RPCSchema<{
    requests: {
      canClose: {
        params: {}
        response: boolean
      }
    }
    messages: {
      projectLoaded: { projectPath: string }
    }
  }>
}
```

### Window Close Handling

The Bun process intercepts quit via Electrobun's `before-quit` event. On
quit, it calls the webview's `canClose` RPC request. If the webview returns
`false` (dirty + user cancels), the quit is cancelled.

```typescript
Electrobun.events.on("before-quit", async (e) => {
  const canClose = await win.webview.rpc.request.canClose({})
  if (!canClose) {
    e.response = { allow: false }
  }
})
```

### Sheet Image Loading

Sheet images are loaded as base64 data URLs via the `getSheetImage` RPC.
The Bun process reads the PNG file and returns `data:image/png;base64,...`.
This avoids `file://` URL issues with native webviews. Sprite sheets are
typically small enough (under 500KB) that base64 encoding is not a
performance concern.

## Frontend (Vue 3 + TypeScript)

### Build Tooling

- Vite as build tool and dev server (inside `src/mainview/`).
- Vue 3 with Composition API (`<script setup lang="ts">`).
- TypeScript throughout.
- Electrobun handles dev mode with Vite HMR support.

### `src/mainview/src/types.ts`

Same interfaces as the previous design:

```typescript
interface Annotation {
  id: string
  name: string
  type: "sprite" | "tile"
  frame: number
  x: number
  y: number
  width: number
  height: number
  direction: string
  variant: string
  chroma_key: string
  tags: string
  notes: string
}

interface Sheet {
  file: string
  name: string
  imageUrl: string
  annotationFile: string
  assetPage: string
  downloadUrl: string
}

interface SheetWithAnnotations extends Sheet {
  annotations: Annotation[]
}
```

Note: `id` is present in the master branch code (generated by `makeId()`) and
persisted in JSON files. Essential for Vue keying and selection tracking.

Note: `tags` is a comma-separated string, matching the master branch behavior.

### `src/mainview/src/rpc.ts`

Typed RPC client wrapping `Electroview.defineRPC()`. Replaces the HTTP
`api.ts` from the previous design. Provides the same interface to the rest of
the app — components call `rpc.request.getProjectAnnotations()` instead of
`fetch("/api/project_annotations")`.

### `src/mainview/src/state.ts`

Reactive store using Vue's `ref`/`reactive`/`computed`. Same design as
previous:

- `projectSheets` — all sheets with annotations (from RPC)
- `sheets` — computed list without annotations
- `currentSheet` — currently selected sheet
- `annotations` — annotations for the current sheet
- `selectedAnnotation` — currently selected annotation (or null)
- `zoom` — current zoom level
- `dirty` — whether unsaved changes exist
- `colorPickArmed` — chroma key sampling mode
- `statusText` — status bar text

Actions: `loadProjectData`, `openSheet`, `addAnnotation`, `duplicateSelected`,
`deleteSelected`, `updateSelectedAnnotation`, `saveCurrentAnnotations`,
`selectAnnotation`, `markDirty`.

### Components

**`App.vue`** — Root layout: three-column (sidebar, workspace, inspector).
Contains the toolbar with Add, Duplicate, Delete, and Save buttons, plus zoom
controls (`-` button, zoom label, `+` button). Orchestrates data loading and
keyboard shortcuts.

- **Add** creates a new annotation with default size near viewport center.
- **Duplicate** copies selected annotation with frame incremented.
- **Delete** removes selected annotation.
- **Save** saves via RPC. Disabled when not dirty.
- **Ctrl/Cmd+S** saves, **Ctrl/Cmd+D** duplicates, **Delete/Backspace** deletes.
- Switching sheets while dirty (from sidebar or gallery navigation) shows a
  confirm dialog before discarding changes.
- Window close while dirty is intercepted on the Bun side via Electrobun's
  `before-quit` event — the Bun process calls the webview's `canClose` RPC.
  If the webview returns false (dirty + user cancels), the quit is cancelled.

**`SheetSidebar.vue`** — Sheet list with text filter input. Clicking a sheet
loads it. Shows refresh button.

**`CanvasView.vue`** — Sheet image display with annotation overlay boxes.
Handles:
- Zoom via mouse wheel (zooms toward cursor)
- Box selection (z-order: later annotations render on top, win clicks)
- Box drag to reposition
- Box resize via bottom-right handle
- Chroma key color sampling mode

Sheet images loaded as base64 data URLs provided by the Bun process via RPC.
Uses `useCanvas` composable for interaction logic.

**`Inspector.vue`** — Form for editing selected annotation fields. Includes
chroma key field with Pick button. Shows empty state when nothing is selected.

**`GalleryPanel.vue`** — Realized sprite previews grouped by identity
(name + type + direction + variant). Multi-frame groups animate in place.
Current-sheet groups sorted first. Click to navigate. Applies chroma key
removal for previews.

**`AnnotationList.vue`** — List of annotations in current sheet, sorted by
name then frame. Click to select.

### Composables

**`useCanvas.ts`** — Zoom, drag, resize state machine. Coordinate transforms
between screen and sheet space.

**`useChromaKey.ts`** — Chroma key color parsing, pixel sampling from sheet
image, and chroma removal for gallery previews.

## Project Directory Handling

1. CLI arg `--project /path` takes priority.
2. If no CLI arg, load last-used project path from Electrobun user data.
3. If no saved path, open native file picker dialog.
4. Save chosen project path to user data for next launch.
5. Expected project layout: `sheets/`, `annotations/`, optional `manifest.json`.

## Dev Workflow

```bash
bun run dev    # electrobun dev --watch + Vite HMR
```

Single command. Electrobun detects the running Vite dev server and loads it in
the webview for HMR. Changes to `src/bun/` trigger Bun process restart.
Changes to `src/mainview/` trigger Vite HMR.

## Build / Distribution

```bash
bun run build   # electrobun build --env stable
```

Produces a self-extracting native app bundle. `example_project/` is included
via the `build.copy` config in `electrobun.config.ts`.

## What's Preserved

- Annotation JSON format (`{"image": "...", "annotations": [...]}`).
- Annotation file naming (`annotations/<stem>.annotations.json`).
- Project directory structure (`sheets/`, `annotations/`, `manifest.json`).
- `example_project/` directory and contents (bundled with app).
- All features documented in `docs/features.md`.

## What's Removed

- Python entirely (`server.py`, `pyproject.toml`, `span/` package).
- HTTP API (replaced by typed RPC).
- Custom hot reload watcher (Electrobun + Vite handle this).
- `/api/dev_revision` endpoint.

## Out of Scope

- **Planned annotation types** (points, sub-AABBs) documented in
  `docs/features.md` under "Planned Annotation Types." This refactor targets
  feature parity with the existing implementation only.
