# Span: Web/Server Split Design

## Overview

Refactor Span (spritesheet annotator) from a single Python server with vanilla JS
frontend into a FastAPI backend + Vue 3/TypeScript frontend. Flat monorepo layout
with `pyproject.toml` at root and `web/` as a subdirectory.

## Goals

- Replace stdlib `http.server` with FastAPI + uvicorn.
- Replace vanilla JS frontend with Vue 3 (Composition API) + TypeScript, built
  with Vite via Bun.
- Full feature parity with the current app (see `docs/features.md`).
- In dev: separate Vite dev server proxying API to FastAPI.
- In prod: FastAPI serves built frontend assets from `web/dist/`.

## Project Layout

```
span/
├── pyproject.toml          # uv project, FastAPI + uvicorn deps
├── span/
│   ├── __init__.py
│   ├── __main__.py         # entry: uvicorn + arg parsing
│   ├── app.py              # FastAPI app factory, static file mounting
│   ├── routes.py           # API routes (sheets, annotations)
│   └── project.py          # project/sheet/annotation file logic
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts      # proxy /api → FastAPI in dev
│   ├── index.html
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── api.ts           # fetch wrappers for /api/*
│       ├── types.ts         # Annotation, Sheet interfaces
│       ├── state.ts         # reactive store (Vue composables)
│       ├── components/
│       │   ├── SheetSidebar.vue
│       │   ├── CanvasView.vue
│       │   ├── Inspector.vue
│       │   ├── GalleryPanel.vue
│       │   └── AnnotationList.vue
│       └── composables/
│           ├── useCanvas.ts      # zoom, pan, drag, resize logic
│           └── useChromaKey.ts   # chroma sampling + removal
├── example_project/        # unchanged
├── docs/
└── AGENTS.md
```

## Server (FastAPI)

### `span/__main__.py`

Parses CLI arguments: `--project` (default: `example_project/`), `--host`
(default: `127.0.0.1`), `--port` (default: `8765`), `--dev` flag.

Starts uvicorn. In dev mode, only serves the API (frontend served by Vite). In
prod mode (default), mounts `web/dist/` as static files with `index.html` SPA
fallback.

### `span/app.py`

`create_app(project_path, dev)` factory function. Creates the FastAPI instance,
includes the API router, and conditionally mounts static file serving for prod.

### `span/routes.py`

Same API surface as the current server:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sheets` | List sheets with manifest metadata |
| GET | `/api/annotations?sheet=` | Load annotations for a sheet |
| POST | `/api/annotations?sheet=` | Save annotations for a sheet |
| GET | `/api/project_annotations` | All sheets with their annotations |
| GET | `/sheets/{path:path}` | Serve sheet image files |

The `/api/dev_revision` endpoint is dropped. Hot reload is handled by Vite HMR
(frontend) and uvicorn `--reload` (backend).

### `span/project.py`

File I/O logic extracted from `server.py`:

- `list_sheet_files()` — glob PNG files from sheets directory.
- `annotation_path_for_sheet()` — derive annotation JSON path from sheet name.
- `load_annotations()` — read and parse annotation JSON, return empty default on
  missing/malformed files.
- `save_annotations()` — atomic write via temp file + `os.replace`.
- `load_manifest()` — read optional `manifest.json` for asset metadata.

No HTTP concerns in this module.

## Frontend (Vue 3 + TypeScript)

### Build Tooling

- Bun as package manager and runtime.
- Vite as build tool and dev server.
- Vue 3 with Composition API (`<script setup lang="ts">`).
- TypeScript throughout.

### `src/types.ts`

Interfaces matching the JSON shapes:

```typescript
interface Annotation {
  name: string
  type: string
  frame: number
  x: number
  y: number
  width: number
  height: number
  direction: string
  variant: string
  chroma_key: string
  tags: string[]
  notes: string
}

interface Sheet {
  file: string
  name: string
  image_url: string
  annotation_url: string
  annotation_file: string
  asset_page: string
  download_url: string
}

// Extended type returned by /api/project_annotations
interface SheetWithAnnotations extends Sheet {
  annotations: Annotation[]
}
```

### `src/api.ts`

Thin typed fetch wrappers for each API endpoint. Returns parsed, typed responses.

### `src/state.ts`

Reactive store using Vue's `ref`/`reactive`/`computed`. No Pinia — this is a
single-view app with straightforward state:

- `sheets` — list of available sheets
- `currentSheet` — currently selected sheet
- `annotations` — annotations for the current sheet
- `selectedAnnotation` — currently selected annotation (or null)
- `allProjectAnnotations` — all annotations across all sheets, fetched via
  `/api/project_annotations` on startup and refreshed after saves. Used by the
  gallery to show cross-sheet sprite groups.
- `zoom` — current zoom level
- `dirty` — whether unsaved changes exist

Exposed as composable functions.

### Components

**`App.vue`** — Root layout: three-column (sidebar, workspace, inspector).
Orchestrates initial data loading and keyboard shortcut handling (`Ctrl/Cmd+D`
for duplicate). Contains the toolbar with Add, Duplicate, Delete, and Save
buttons, plus zoom controls (+/- and label). The toolbar lives in App.vue
because its actions span multiple child components.

- **Add** creates a new annotation with default size near the current viewport
  center (same behavior as current app).
- **Duplicate** copies the selected annotation with frame incremented.
- **Delete** removes the selected annotation.
- **Save** POSTs current annotations to the server. Disabled when not dirty.
- Switching sheets while dirty shows a confirm dialog before discarding changes.
- `beforeunload` handler warns on tab close when dirty.

**`SheetSidebar.vue`** — Sheet list with text filter input. Clicking a sheet
loads it into the workspace. Shows refresh button.

**`CanvasView.vue`** — The main workspace area. Displays the sheet image with
annotation overlay boxes rendered as positioned `<div>` elements. Handles:
- Zoom via mouse wheel (zooms toward cursor)
- Scroll/pan via the scroller container
- Box selection on click (z-order: later annotations in the list render on top
  and win clicks, matching the current app's behavior via array index)
- Box drag to reposition
- Box resize via bottom-right handle
- Chroma key color sampling mode (activated by Inspector's Pick button)

Uses `useCanvas` composable for interaction logic to keep the template clean.
Zoom +/- buttons and label live in the App.vue toolbar but control zoom state
shared via the store.

**`Inspector.vue`** — Form for editing the selected annotation's fields via
`v-model`. Includes the chroma key field with Pick button that arms sampling
mode on the canvas. Shows empty state when nothing is selected.

**`GalleryPanel.vue`** — Realized sprite previews at the bottom of the
workspace. Groups frames by sprite identity (name + type + direction + variant).
Multi-frame groups animate in place. Current-sheet groups sorted first. Clicking
a gallery item navigates to that sprite's sheet and selects it. Applies chroma
key removal for previews.

**`AnnotationList.vue`** — Simple list of all annotations in the current sheet,
shown in the inspector sidebar. Clicking selects the annotation.

### Composables

**`useCanvas.ts`** — Encapsulates canvas interaction state and logic: zoom
level, drag state, resize state, coordinate transforms between screen and sheet
space. Emits position/size updates back to the annotation store.

**`useChromaKey.ts`** — Chroma key sampling mode toggle, pixel color extraction
from the sheet image, and chroma key removal for gallery preview rendering.

## Dev Workflow

```bash
# Backend (terminal 1)
uv run span --dev

# Frontend (terminal 2)
cd web && bun run dev
```

- Vite dev server runs on port 5173, proxies `/api` and `/sheets` to
  `localhost:8765`.
- Backend runs with uvicorn `--reload` for automatic restart on Python changes.
- Vite provides HMR for Vue component changes.

## Production

```bash
cd web && bun run build   # outputs to web/dist/
uv run span               # serves API + frontend on port 8765
```

FastAPI mounts `web/dist/` with `index.html` as SPA fallback. Single process,
no reverse proxy needed.

## What's Preserved

- Annotation JSON format (`{"image": "...", "annotations": [...]}`).
- Annotation file naming (`annotations/<stem>.annotations.json`).
- Project directory structure (`sheets/`, `annotations/`, `manifest.json`).
- `example_project/` directory and its contents.
- All features documented in `docs/features.md`.
- CLI interface: `uv run span [--project PATH] [--host HOST] [--port PORT]`.

## Out of Scope

- **Planned annotation types** (points, sub-AABBs like collision boxes and
  hurtboxes) documented in `docs/features.md` under "Planned Annotation Types."
  The current app does not implement these yet. This refactor targets feature
  parity with the existing implementation only. The `Annotation` interface and
  component structure can accommodate these later without architectural changes.

## Notes

- **`annotation_file`** in the Sheet type is the annotation JSON path relative
  to the project directory. The server computes it from the project path. The
  frontend does not currently use it but it's preserved for display/debugging
  purposes (e.g., showing which file a sheet's annotations are stored in).
- **`asset_page` and `download_url`** come from `manifest.json` metadata. The
  current app does not display them in the UI; they're carried through for
  potential future use and are included for API compatibility.

## What's Removed

- `server.py` (replaced by `span/` package).
- Custom hot reload watcher (replaced by Vite HMR + uvicorn `--reload`).
- `/api/dev_revision` endpoint.
- All vanilla JS files in `web/` (replaced by Vue components).
