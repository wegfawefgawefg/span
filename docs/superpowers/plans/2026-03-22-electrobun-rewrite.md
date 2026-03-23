# Electrobun Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Python server + vanilla JS frontend with an Electrobun desktop app. Bun handles file I/O, Vue 3 + TypeScript handles UI in a native webview, typed RPC connects them.

**Architecture:** Single Electrobun app. `src/bun/` is the main process (file I/O, window management). `src/mainview/` is the Vue webview. `src/shared/` holds the RPC type schema. No HTTP, no Python.

**Tech Stack:** Electrobun 1.16+, Bun, Vue 3 (Composition API), TypeScript, Vite

**Spec:** `docs/superpowers/specs/2026-03-22-web-server-split-design.md`

**Reference (master branch):** The current working app on `master`. Use `git show master:<path>` to reference. Key files:
- `server.py` — HTTP server with all routes
- `web/app.js` — main app logic (577 lines)
- `web/annotator_common.js` — shared state, elements, constants
- `web/annotator_annotations.js` — annotation CRUD, rendering, inspector
- `web/annotator_gallery.js` — gallery grouping, preview rendering
- `web/styles.css` — all styles (370 lines)
- `web/index.html` — HTML template
- `example_project/manifest.json` — sample manifest

---

## File Map

### Shared

| File | Responsibility |
|------|---------------|
| `src/shared/rpc-schema.ts` | RPC type definitions (imported by both sides) |

### Bun Main Process

| File | Responsibility |
|------|---------------|
| `src/bun/index.ts` | Entry: CLI args, window creation, RPC handlers, quit handling |
| `src/bun/project.ts` | File I/O: list sheets, load/save annotations, manifest, image base64 |

### Vue Webview

| File | Responsibility |
|------|---------------|
| `src/mainview/index.html` | HTML entry point |
| `src/mainview/src/main.ts` | Vue app bootstrap + Electroview RPC init |
| `src/mainview/src/App.vue` | Root layout, toolbar, keyboard shortcuts |
| `src/mainview/src/rpc.ts` | Electroview RPC client, exported for use by state/components |
| `src/mainview/src/types.ts` | Annotation, Sheet, SheetWithAnnotations interfaces |
| `src/mainview/src/state.ts` | Reactive store (sheets, annotations, zoom, dirty) |
| `src/mainview/src/components/SheetSidebar.vue` | Sheet list with filter |
| `src/mainview/src/components/CanvasView.vue` | Sheet image + annotation boxes |
| `src/mainview/src/components/Inspector.vue` | Selected annotation form |
| `src/mainview/src/components/AnnotationList.vue` | Annotation list for current sheet |
| `src/mainview/src/components/GalleryPanel.vue` | Animated sprite previews |
| `src/mainview/src/composables/useCanvas.ts` | Zoom, drag, resize logic |
| `src/mainview/src/composables/useChromaKey.ts` | Chroma key parsing + removal |

### Config

| File | Responsibility |
|------|---------------|
| `package.json` | Electrobun project, deps, scripts |
| `electrobun.config.ts` | App config, build settings, copy rules |
| `tsconfig.json` | TypeScript config |
| `vite.config.ts` | Vite config (root: src/mainview) |
| `env.d.ts` | Vue SFC type declarations |

### Deleted

| File | Reason |
|------|--------|
| `pyproject.toml` | No longer using Python |
| `span/` (entire directory) | Replaced by `src/bun/` |
| `uv.lock` | No longer using uv |
| `.venv/` | No longer using Python |
| `server.py` | Already deleted |
| `web/` (entire directory) | Replaced by `src/mainview/` |

---

## Task 1: Clean workspace and scaffold Electrobun project

**Files:**
- Delete: `pyproject.toml`, `span/`, `uv.lock`, `.venv/`, `web/`
- Create: `package.json`, `electrobun.config.ts`, `tsconfig.json`, `vite.config.ts`, `env.d.ts`
- Create: `src/bun/index.ts`, `src/mainview/index.html`, `src/mainview/src/main.ts`, `src/mainview/src/App.vue`
- Modify: `.gitignore`

- [ ] **Step 1: Delete Python and old web files**

```bash
rm -f pyproject.toml uv.lock
rm -rf span/ .venv/ __pycache__/ .mypy_cache/ web/
```

- [ ] **Step 2: Initialize Electrobun Vue project**

```bash
npx electrobun init vue
```

This creates a `vue/` subdirectory. Move its contents to the repo root:

```bash
mv vue/* vue/.* . 2>/dev/null || true
rmdir vue
```

- [ ] **Step 3: Install dependencies**

```bash
bun install
```

- [ ] **Step 4: Update .gitignore**

```gitignore
node_modules/
dist/
build/
.venv/
__pycache__/
*.pyc
.mypy_cache/
.claude/
```

- [ ] **Step 5: Update package.json**

Change the name to `"span"` and description to `"Standalone spritesheet annotator"`.

- [ ] **Step 6: Verify scaffold-generated files**

Check that `vite.config.ts` has `root: "src/mainview"` and build output goes
to `../../dist`. Check that `env.d.ts` exists with the Vue SFC declaration.
Fix if the scaffold generated different values.

Expected `vite.config.ts`:
```typescript
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

Expected `env.d.ts`:
```typescript
/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
```

- [ ] **Step 7: Update electrobun.config.ts**

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Span",
    identifier: "dev.span.annotator",
    version: "0.1.0",
  },
  build: {
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "example_project": "resources/example_project",
    },
    watchIgnore: ["dist/**"],
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
```

- [ ] **Step 8: Update src/bun/index.ts to a minimal placeholder**

```typescript
import { BrowserWindow, Updater } from "electrobun/bun";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log("Vite dev server not running. Run 'bun run dev:hmr' for HMR.");
    }
  }
  return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
  title: "Span Sprite Annotator",
  url,
  frame: {
    width: 1400,
    height: 900,
    x: 100,
    y: 100,
  },
});

console.log("Span started!");
```

- [ ] **Step 9: Update src/mainview/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Span Sprite Annotator</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 10: Write minimal src/mainview/src/main.ts**

```typescript
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
```

- [ ] **Step 11: Write placeholder src/mainview/src/App.vue**

```vue
<script setup lang="ts">
</script>

<template>
  <div class="app">
    <p>Span loading...</p>
  </div>
</template>
```

Note: Styles are not added until Task 9. Tasks 1-8 will render unstyled.
Visual testing should wait until after Task 9.

- [ ] **Step 12: Verify the app launches**

```bash
bun start
```

Should open a native window showing "Span loading...".

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "scaffold Electrobun project with Vue"
```

---

## Task 2: RPC schema and Bun-side project I/O

**Files:**
- Create: `src/shared/rpc-schema.ts`, `src/bun/project.ts`
- Modify: `src/bun/index.ts`

**Reference:** `git show master:server.py` lines 37-74 for file I/O logic.

- [ ] **Step 1: Create src/shared/ directory and rpc-schema.ts**

```typescript
import type { RPCSchema } from "electrobun/bun";

export interface Annotation {
  id: string;
  name: string;
  type: "sprite" | "tile";
  frame: number;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: string;
  variant: string;
  chroma_key: string;
  tags: string;
  notes: string;
}

export interface Sheet {
  file: string;
  name: string;
  imageUrl: string;
  annotationFile: string;
}

export interface SheetWithAnnotations extends Sheet {
  annotations: Annotation[];
}

export type SpanRPC = {
  bun: RPCSchema<{
    requests: {
      getProjectAnnotations: {
        params: {};
        response: SheetWithAnnotations[];
      };
      saveAnnotations: {
        params: { sheet: string; annotations: Annotation[] };
        response: { ok: boolean };
      };
      getSheetImage: {
        params: { sheet: string };
        response: string;
      };
      pickProjectDirectory: {
        params: {};
        response: string | null;
      };
    };
    messages: {};
  }>;
  webview: RPCSchema<{
    requests: {
      canClose: {
        params: {};
        response: boolean;
      };
    };
    messages: {
      projectLoaded: { projectPath: string };
    };
  }>;
};
```

- [ ] **Step 2: Create src/bun/project.ts**

```typescript
import { readdir } from "fs/promises";
import { join, parse as parsePath } from "path";
import type { Annotation, SheetWithAnnotations } from "../shared/rpc-schema";

export class Project {
  readonly root: string;
  readonly sheetsDir: string;
  readonly annotationsDir: string;
  readonly manifestPath: string;

  constructor(projectDir: string) {
    this.root = projectDir;
    this.sheetsDir = join(projectDir, "sheets");
    this.annotationsDir = join(projectDir, "annotations");
    this.manifestPath = join(projectDir, "manifest.json");
  }

  async ensureAnnotationsDir(): Promise<void> {
    const { mkdir } = await import("fs/promises");
    await mkdir(this.annotationsDir, { recursive: true });
  }

  async listSheetFiles(): Promise<string[]> {
    try {
      const entries = await readdir(this.sheetsDir);
      return entries
        .filter((f) => f.toLowerCase().endsWith(".png"))
        .sort();
    } catch {
      return [];
    }
  }

  annotationPathForSheet(sheetName: string): string {
    const stem = parsePath(sheetName).name;
    return join(this.annotationsDir, `${stem}.annotations.json`);
  }

  async loadAnnotations(
    sheetName: string
  ): Promise<{ image: string; annotations: Annotation[] }> {
    const path = this.annotationPathForSheet(sheetName);
    try {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return { image: sheetName, annotations: [] };
      }
      return await file.json();
    } catch {
      return { image: sheetName, annotations: [] };
    }
  }

  async saveAnnotations(
    sheetName: string,
    annotations: Annotation[]
  ): Promise<void> {
    await this.ensureAnnotationsDir();
    const path = this.annotationPathForSheet(sheetName);
    const payload = { image: sheetName, annotations };
    const tmpPath = path + ".tmp";
    await Bun.write(tmpPath, JSON.stringify(payload, null, 2) + "\n");
    const { rename } = await import("fs/promises");
    await rename(tmpPath, path);
  }

  async loadManifest(): Promise<Map<string, Record<string, unknown>>> {
    const result = new Map<string, Record<string, unknown>>();
    try {
      const file = Bun.file(this.manifestPath);
      if (!(await file.exists())) return result;
      const data = await file.json();
      for (const asset of data.assets ?? []) {
        if (typeof asset.file === "string") {
          result.set(asset.file, asset);
        }
      }
    } catch {
      // ignore
    }
    return result;
  }

  async getSheetImageBase64(sheetName: string): Promise<string> {
    const path = join(this.sheetsDir, sheetName);
    const file = Bun.file(path);
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:image/png;base64,${base64}`;
  }

  async loadProjectAnnotations(): Promise<SheetWithAnnotations[]> {
    const manifest = await this.loadManifest();
    const files = await this.listSheetFiles();
    const sheets: SheetWithAnnotations[] = [];

    for (const file of files) {
      const asset = manifest.get(file) ?? {};
      const { annotations } = await this.loadAnnotations(file);
      const annotationFile = parsePath(
        this.annotationPathForSheet(file)
      ).base;

      sheets.push({
        file,
        name: (asset.name as string) ?? parsePath(file).name,
        imageUrl: "", // webview uses getSheetImage RPC instead
        annotationFile: `annotations/${annotationFile}`,
        annotations,
      });
    }

    return sheets;
  }
}
```

- [ ] **Step 3: Wire RPC handlers into src/bun/index.ts**

Replace the placeholder `src/bun/index.ts` with the full version:

```typescript
import Electrobun, {
  BrowserView,
  BrowserWindow,
  Updater,
  Utils,
} from "electrobun/bun";
import type { SpanRPC } from "../shared/rpc-schema";
import { Project } from "./project";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// --- CLI args ---
const args = process.argv.slice(2);
let projectPath: string | null = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--project" && args[i + 1]) {
    projectPath = args[i + 1];
    break;
  }
}

// --- Resolve project directory ---
async function resolveProjectPath(): Promise<string> {
  if (projectPath) return projectPath;

  // TODO: check saved last-used project in user data

  // Fall back to bundled example project
  // In dev, it's relative to the repo root
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    return new URL("../../example_project", import.meta.url).pathname;
  }

  // In production, it's in the resources folder
  return "resources://example_project";
}

const resolvedPath = await resolveProjectPath();
const project = new Project(resolvedPath);
await project.ensureAnnotationsDir();
console.log(`Project: ${resolvedPath}`);

// --- RPC ---
const rpc = BrowserView.defineRPC<SpanRPC>({
  handlers: {
    requests: {
      getProjectAnnotations: async () => {
        return await project.loadProjectAnnotations();
      },
      saveAnnotations: async ({ sheet, annotations }) => {
        await project.saveAnnotations(sheet, annotations);
        return { ok: true };
      },
      getSheetImage: async ({ sheet }) => {
        return await project.getSheetImageBase64(sheet);
      },
      pickProjectDirectory: async () => {
        // TODO: implement native file picker
        return null;
      },
    },
    messages: {},
  },
});

// --- Window ---
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR: Using Vite at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log("No Vite dev server. Use 'bun run dev:hmr' for HMR.");
    }
  }
  return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
  title: "Span Sprite Annotator",
  url,
  rpc,
  frame: {
    width: 1400,
    height: 900,
    x: 100,
    y: 100,
  },
});

// Send project path to webview once it's ready.
// The webview will request project data via RPC on mount,
// so we don't need to push — it pulls. But we send this
// message for the status bar to show the project path.
mainWindow.on("first-content-loaded", () => {
  mainWindow.webview.rpc.send.projectLoaded({
    projectPath: resolvedPath,
  });
});

// --- Quit handling ---
Electrobun.events.on("before-quit", async (e) => {
  try {
    const canClose = await mainWindow.webview.rpc.request.canClose({});
    if (!canClose) {
      e.response = { allow: false };
    }
  } catch {
    // If RPC fails, allow close
  }
});

console.log("Span started!");
```

- [ ] **Step 4: Verify the app still launches**

```bash
bun start
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/ src/bun/
git commit -m "add RPC schema and Bun-side project I/O"
```

---

## Task 3: Frontend types, RPC client, and state store

**Files:**
- Create: `src/mainview/src/types.ts`, `src/mainview/src/rpc.ts`, `src/mainview/src/state.ts`

- [ ] **Step 1: Write types.ts**

```typescript
export interface Annotation {
  id: string;
  name: string;
  type: "sprite" | "tile";
  frame: number;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: string;
  variant: string;
  chroma_key: string;
  tags: string;
  notes: string;
}

export interface Sheet {
  file: string;
  name: string;
  imageUrl: string;
  annotationFile: string;
}

export interface SheetWithAnnotations extends Sheet {
  annotations: Annotation[];
}

export function makeId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `annotation-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function normalizeAnnotation(
  raw: Record<string, unknown>
): Annotation {
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
    name: typeof raw.name === "string" ? raw.name : "unnamed",
    type: raw.type === "tile" ? "tile" : "sprite",
    frame:
      typeof raw.frame === "number" &&
      Number.isFinite(raw.frame) &&
      raw.frame >= 0
        ? raw.frame
        : 0,
    x: typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : 0,
    y: typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : 0,
    width:
      typeof raw.width === "number" &&
      Number.isFinite(raw.width) &&
      raw.width > 0
        ? raw.width
        : 16,
    height:
      typeof raw.height === "number" &&
      Number.isFinite(raw.height) &&
      raw.height > 0
        ? raw.height
        : 16,
    direction: typeof raw.direction === "string" ? raw.direction : "",
    variant: typeof raw.variant === "string" ? raw.variant : "",
    chroma_key:
      typeof raw.chroma_key === "string" ? raw.chroma_key : "",
    tags: typeof raw.tags === "string" ? raw.tags : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}
```

- [ ] **Step 2: Write rpc.ts**

```typescript
import { Electroview } from "electrobun/view";
import type { SpanRPC } from "../../shared/rpc-schema";
import { ref } from "vue";

export const projectPath = ref<string>("");

// Handlers for Bun → webview calls
let canCloseHandler: () => boolean = () => true;

export function setCanCloseHandler(handler: () => boolean) {
  canCloseHandler = handler;
}

const rpc = Electroview.defineRPC<SpanRPC>({
  handlers: {
    requests: {
      canClose: () => canCloseHandler(),
    },
    messages: {
      projectLoaded: ({ projectPath: path }) => {
        projectPath.value = path;
        console.log("Project loaded:", path);
      },
    },
  },
});

const electroview = new Electroview({ rpc });

// Export typed request functions for the webview to call into Bun
export const api = {
  getProjectAnnotations: () =>
    electroview.rpc.request.getProjectAnnotations({}),
  saveAnnotations: (sheet: string, annotations: unknown[]) =>
    electroview.rpc.request.saveAnnotations({ sheet, annotations: annotations as any }),
  getSheetImage: (sheet: string) =>
    electroview.rpc.request.getSheetImage({ sheet }),
  pickProjectDirectory: () =>
    electroview.rpc.request.pickProjectDirectory({}),
};
```

- [ ] **Step 3: Write state.ts**

Port from `git show master:web/annotator_common.js` (state) and
`git show master:web/app.js` (data loading, actions).

```typescript
import { computed, ref } from "vue";
import type {
  Annotation,
  Sheet,
  SheetWithAnnotations,
} from "./types";
import { makeId, normalizeAnnotation } from "./types";
import { api, setCanCloseHandler } from "./rpc";

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 12;
export const ZOOM_FACTOR = 1.15;

// --- Core state ---

export const projectSheets = ref<SheetWithAnnotations[]>([]);
export const sheets = computed<Sheet[]>(() =>
  projectSheets.value.map(({ annotations, ...sheet }) => sheet)
);
export const currentSheet = ref<SheetWithAnnotations | null>(null);
export const annotations = ref<Annotation[]>([]);
export const selectedId = ref<string | null>(null);
export const zoom = ref(2);
export const dirty = ref(false);
export const colorPickArmed = ref(false);
export const statusText = ref("Loading sheets...");
export const currentSheetImageSrc = ref<string>("");

// --- Derived ---

export const selectedAnnotation = computed<Annotation | null>(
  () =>
    annotations.value.find((a) => a.id === selectedId.value) ?? null
);

// --- Dirty guard for quit ---

setCanCloseHandler(() => {
  if (!dirty.value) return true;
  return window.confirm("You have unsaved changes. Quit anyway?");
});

// --- Actions ---

export function selectAnnotation(id: string | null) {
  selectedId.value = id;
  colorPickArmed.value = false;
}

export function markDirty(isDirty: boolean) {
  dirty.value = isDirty;
  if (!currentSheet.value) {
    statusText.value = isDirty ? "Unsaved changes" : "Ready";
    return;
  }
  statusText.value = `${currentSheet.value.file} \u2022 ${
    isDirty ? "Unsaved changes" : "Saved"
  }`;
}

function syncCurrentSheetIntoProject() {
  const sheet = currentSheet.value;
  if (!sheet) return;
  const record = projectSheets.value.find(
    (s) => s.file === sheet.file
  );
  if (!record) return;
  record.annotations = annotations.value.map((a) =>
    normalizeAnnotation(a as unknown as Record<string, unknown>)
  );
}

export async function loadProjectData() {
  statusText.value = "Loading sheets...";
  const prevFile = currentSheet.value?.file ?? null;
  const prevSelection = selectedId.value;
  const sheets = await api.getProjectAnnotations();
  projectSheets.value = sheets.map((s) => ({
    ...s,
    annotations: s.annotations.map((a) =>
      normalizeAnnotation(a as unknown as Record<string, unknown>)
    ),
  }));

  if (
    prevFile &&
    projectSheets.value.some((s) => s.file === prevFile)
  ) {
    await openSheet(prevFile, prevSelection);
  } else if (projectSheets.value.length > 0) {
    await openSheet(projectSheets.value[0].file);
  }
}

export async function openSheet(
  file: string,
  selectId: string | null = null
) {
  if (currentSheet.value?.file !== file && dirty.value) {
    if (
      !window.confirm(
        "Discard unsaved changes on the current sheet?"
      )
    ) {
      return;
    }
  }

  const record = projectSheets.value.find((s) => s.file === file);
  if (!record) return;

  currentSheet.value = record;
  annotations.value = record.annotations.map((a) =>
    normalizeAnnotation(a as unknown as Record<string, unknown>)
  );
  selectedId.value =
    selectId &&
    annotations.value.some((a) => a.id === selectId)
      ? selectId
      : (annotations.value[0]?.id ?? null);
  markDirty(false);

  // Load the sheet image via RPC
  currentSheetImageSrc.value = await api.getSheetImage(file);
}

export function addAnnotation(
  viewportCenterX: number,
  viewportCenterY: number,
  imageWidth: number,
  imageHeight: number
) {
  const w = Math.min(16, imageWidth || 16);
  const h = Math.min(16, imageHeight || 16);
  const x = Math.max(0, Math.round(viewportCenterX - w / 2));
  const y = Math.max(0, Math.round(viewportCenterY - h / 2));
  const annotation: Annotation = {
    id: makeId(),
    name: "new_sprite",
    type: "sprite",
    frame: 0,
    x,
    y,
    width: w,
    height: h,
    direction: "",
    variant: "",
    chroma_key: "",
    tags: "",
    notes: "",
  };
  annotations.value.push(annotation);
  selectedId.value = annotation.id;
  markDirty(true);
  syncCurrentSheetIntoProject();
}

export function duplicateSelected() {
  const ann = selectedAnnotation.value;
  if (!ann) return;
  const copy: Annotation = {
    ...ann,
    id: makeId(),
    frame: ann.frame + 1,
    x: ann.x + 4,
    y: ann.y + 4,
  };
  annotations.value.push(copy);
  selectedId.value = copy.id;
  markDirty(true);
  syncCurrentSheetIntoProject();
}

export function deleteSelected() {
  if (!selectedId.value) return;
  annotations.value = annotations.value.filter(
    (a) => a.id !== selectedId.value
  );
  selectedId.value = annotations.value[0]?.id ?? null;
  markDirty(true);
  syncCurrentSheetIntoProject();
}

export function updateSelectedAnnotation(
  patch: Partial<Annotation>
) {
  const ann = selectedAnnotation.value;
  if (!ann) return;
  Object.assign(ann, patch);
  markDirty(true);
  syncCurrentSheetIntoProject();
}

export async function saveCurrentAnnotations() {
  const sheet = currentSheet.value;
  if (!sheet) return;
  statusText.value = `Saving ${sheet.file}...`;
  await api.saveAnnotations(
    sheet.file,
    annotations.value.map((a) => ({ ...a }))
  );
  syncCurrentSheetIntoProject();
  markDirty(false);
}

export function clampAnnotationToImage(
  annotation: Annotation,
  imageWidth: number,
  imageHeight: number
) {
  annotation.frame = Math.max(0, Math.round(annotation.frame));
  annotation.x = Math.max(0, Math.round(annotation.x));
  annotation.y = Math.max(0, Math.round(annotation.y));
  annotation.width = Math.max(1, Math.round(annotation.width));
  annotation.height = Math.max(1, Math.round(annotation.height));
  annotation.width = Math.min(annotation.width, imageWidth);
  annotation.height = Math.min(annotation.height, imageHeight);
  annotation.x = Math.min(
    annotation.x,
    Math.max(0, imageWidth - annotation.width)
  );
  annotation.y = Math.min(
    annotation.y,
    Math.max(0, imageHeight - annotation.height)
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/types.ts src/mainview/src/rpc.ts src/mainview/src/state.ts
git commit -m "add frontend types, RPC client, and reactive state store"
```

---

## Task 4: SheetSidebar component

**Files:**
- Create: `src/mainview/src/components/SheetSidebar.vue`

**Reference:** `git show master:web/app.js` functions `filterSheets`, `renderSheets`.

- [ ] **Step 1: Write SheetSidebar.vue**

```vue
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  sheets,
  currentSheet,
  openSheet,
  dirty,
  statusText,
  loadProjectData,
} from "../state";

const filterQuery = ref("");

const filteredSheets = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return sheets.value;
  return sheets.value.filter(
    (s) =>
      s.file.toLowerCase().includes(q) ||
      s.name.toLowerCase().includes(q)
  );
});

async function handleOpen(file: string) {
  try {
    await openSheet(file);
  } catch (e) {
    console.error(e);
    statusText.value = `Failed to open ${file}`;
  }
}

async function handleRefresh() {
  if (dirty.value) {
    if (
      !window.confirm(
        "Discard unsaved changes and reload project annotations?"
      )
    ) {
      return;
    }
  }
  try {
    await loadProjectData();
  } catch (e) {
    console.error(e);
    statusText.value = "Failed to load sheets";
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="panel-header">
      <h1>Sheets</h1>
      <button type="button" @click="handleRefresh">Refresh</button>
    </div>
    <input
      v-model="filterQuery"
      class="search-input"
      type="search"
      placeholder="Filter sheets"
      autocomplete="off"
    />
    <div class="sheet-list">
      <button
        v-for="sheet in filteredSheets"
        :key="sheet.file"
        type="button"
        class="sheet-card"
        :class="{ selected: currentSheet?.file === sheet.file }"
        @click="handleOpen(sheet.file)"
      >
        <div class="sheet-name">{{ sheet.name }}</div>
        <div class="sheet-meta">{{ sheet.file }}</div>
      </button>
    </div>
  </aside>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/SheetSidebar.vue
git commit -m "add SheetSidebar component"
```

---

## Task 5: CanvasView component and useCanvas composable

**Files:**
- Create: `src/mainview/src/composables/useCanvas.ts`, `src/mainview/src/components/CanvasView.vue`

**Reference:** `git show master:web/app.js` lines 151-370 for zoom, drag, resize logic.

- [ ] **Step 1: Write useCanvas.ts**

```typescript
import { ref } from "vue";
import type { Annotation } from "../types";
import { zoom, annotations, markDirty } from "../state";
import { ZOOM_MIN, ZOOM_MAX, ZOOM_FACTOR } from "../state";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface DragState {
  id: string;
  mode: "move" | "resize";
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
}

export function useCanvas() {
  const drag = ref<DragState | null>(null);

  function zoomTo(
    nextZoom: number,
    scroller: HTMLElement,
    stage: HTMLElement,
    clientX: number | null = null,
    clientY: number | null = null
  ) {
    const clamped = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(clamped - zoom.value) < 0.001) return;

    const oldZoom = zoom.value;
    const scrollerRect = scroller.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const offsetX =
      clientX === null
        ? scroller.clientWidth / 2
        : clientX - scrollerRect.left;
    const offsetY =
      clientY === null
        ? scroller.clientHeight / 2
        : clientY - scrollerRect.top;
    const stageX =
      clientX === null
        ? scroller.scrollLeft + offsetX
        : clientX - stageRect.left;
    const stageY =
      clientY === null
        ? scroller.scrollTop + offsetY
        : clientY - stageRect.top;
    const worldX = stageX / oldZoom;
    const worldY = stageY / oldZoom;

    zoom.value = clamped;

    requestAnimationFrame(() => {
      scroller.scrollLeft = worldX * clamped - offsetX;
      scroller.scrollTop = worldY * clamped - offsetY;
    });
  }

  function startDrag(
    event: PointerEvent,
    annotation: Annotation,
    isResize: boolean
  ) {
    drag.value = {
      id: annotation.id,
      mode: isResize ? "resize" : "move",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: annotation.x,
      startY: annotation.y,
      startWidth: annotation.width,
      startHeight: annotation.height,
    };
  }

  function onPointerMove(
    event: PointerEvent,
    imageWidth: number,
    imageHeight: number
  ) {
    const d = drag.value;
    if (!d || d.pointerId !== event.pointerId) return;

    const ann = annotations.value.find((a) => a.id === d.id);
    if (!ann) return;

    const deltaX = (event.clientX - d.startClientX) / zoom.value;
    const deltaY = (event.clientY - d.startClientY) / zoom.value;

    if (d.mode === "move") {
      ann.x = clamp(
        Math.round(d.startX + deltaX),
        0,
        imageWidth - ann.width
      );
      ann.y = clamp(
        Math.round(d.startY + deltaY),
        0,
        imageHeight - ann.height
      );
    } else {
      ann.width = clamp(
        Math.round(d.startWidth + deltaX),
        1,
        imageWidth - ann.x
      );
      ann.height = clamp(
        Math.round(d.startHeight + deltaY),
        1,
        imageHeight - ann.y
      );
    }

    markDirty(true);
  }

  function endDrag() {
    drag.value = null;
  }

  return { drag, zoomTo, startDrag, onPointerMove, endDrag };
}
```

- [ ] **Step 2: Write CanvasView.vue**

```vue
<script setup lang="ts">
import { ref, computed } from "vue";
import type { Annotation } from "../types";
import {
  zoom,
  annotations,
  selectedId,
  selectAnnotation,
  colorPickArmed,
  currentSheetImageSrc,
} from "../state";
import { ZOOM_FACTOR } from "../state";
import { useCanvas } from "../composables/useCanvas";

const emit = defineEmits<{
  chromaSampled: [color: string];
  imageLoaded: [width: number, height: number];
}>();

const props = defineProps<{
  imageWidth: number;
  imageHeight: number;
}>();

const scroller = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const sheetImg = ref<HTMLImageElement | null>(null);
const { drag, zoomTo, startDrag, onPointerMove, endDrag } =
  useCanvas();

const stageWidth = computed(
  () => Math.round(props.imageWidth * zoom.value)
);
const stageHeight = computed(
  () => Math.round(props.imageHeight * zoom.value)
);

// Chroma sampling canvas
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", {
  willReadFrequently: true,
})!;

function onImageLoad() {
  const img = sheetImg.value;
  if (!img) return;
  sampleCanvas.width = img.naturalWidth;
  sampleCanvas.height = img.naturalHeight;
  sampleCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
  sampleCtx.drawImage(img, 0, 0);
  emit("imageLoaded", img.naturalWidth, img.naturalHeight);
}

function handleWheel(event: WheelEvent) {
  if (!props.imageWidth) return;
  event.preventDefault();
  const factor =
    event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
  zoomTo(
    zoom.value * factor,
    scroller.value!,
    stage.value!,
    event.clientX,
    event.clientY
  );
}

function handleZoomIn() {
  zoomTo(
    zoom.value * ZOOM_FACTOR,
    scroller.value!,
    stage.value!
  );
}

function handleZoomOut() {
  zoomTo(
    zoom.value / ZOOM_FACTOR,
    scroller.value!,
    stage.value!
  );
}

function handleBoxPointerDown(
  event: PointerEvent,
  annotation: Annotation
) {
  event.preventDefault();
  event.stopPropagation();

  if (colorPickArmed.value) {
    sampleColorAt(event.clientX, event.clientY);
    return;
  }

  selectAnnotation(annotation.id);
  const target = event.target as HTMLElement;
  const isResize = target.dataset.resize === "true";
  startDrag(event, annotation, isResize);

  const box = event.currentTarget as HTMLElement;
  box.setPointerCapture(event.pointerId);
}

function handleBoxPointerMove(event: PointerEvent) {
  onPointerMove(event, props.imageWidth, props.imageHeight);
}

function handleBoxPointerUp(event: PointerEvent) {
  const box = event.currentTarget as HTMLElement;
  box.releasePointerCapture(event.pointerId);
  endDrag();
}

function handleLayerPointerDown(event: PointerEvent) {
  if (!colorPickArmed.value) return;
  event.preventDefault();
  event.stopPropagation();
  sampleColorAt(event.clientX, event.clientY);
}

function sampleColorAt(clientX: number, clientY: number) {
  const layer = stage.value;
  if (!layer) return;
  const rect = layer.getBoundingClientRect();
  const x = Math.floor((clientX - rect.left) / zoom.value);
  const y = Math.floor((clientY - rect.top) / zoom.value);
  if (
    x < 0 ||
    y < 0 ||
    x >= props.imageWidth ||
    y >= props.imageHeight
  )
    return;

  const pixel = sampleCtx.getImageData(x, y, 1, 1).data;
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  const color = `#${hex(pixel[0])}${hex(pixel[1])}${hex(pixel[2])}`;
  emit("chromaSampled", color);
}

function boxStyle(annotation: Annotation, index: number) {
  const isSelected = annotation.id === selectedId.value;
  return {
    left: `${annotation.x * zoom.value}px`,
    top: `${annotation.y * zoom.value}px`,
    width: `${annotation.width * zoom.value}px`,
    height: `${annotation.height * zoom.value}px`,
    zIndex: isSelected
      ? annotations.value.length + 10
      : index + 1,
  };
}

defineExpose({
  getViewportCenter() {
    const el = scroller.value;
    if (!el) return { x: 0, y: 0 };
    const x =
      (el.scrollLeft + el.clientWidth / 2) / zoom.value;
    const y =
      (el.scrollTop + el.clientHeight / 2) / zoom.value;
    return { x, y };
  },
  handleZoomIn,
  handleZoomOut,
});
</script>

<template>
  <div class="canvas-shell">
    <div
      ref="scroller"
      class="canvas-scroller"
      @wheel.prevent="handleWheel"
    >
      <div
        ref="stage"
        class="canvas-stage"
        :style="{
          width: stageWidth + 'px',
          height: stageHeight + 'px',
        }"
      >
        <img
          ref="sheetImg"
          class="sheet-image"
          :src="currentSheetImageSrc"
          alt=""
          :style="{
            width: stageWidth + 'px',
            height: stageHeight + 'px',
          }"
          draggable="false"
          @load="onImageLoad"
        />
        <div
          class="annotation-layer"
          :class="{ 'color-pick-armed': colorPickArmed }"
          :style="{
            width: stageWidth + 'px',
            height: stageHeight + 'px',
          }"
          @pointerdown="handleLayerPointerDown"
        >
          <button
            v-for="(annotation, index) in annotations"
            :key="annotation.id"
            type="button"
            class="annotation-box"
            :class="{
              selected: annotation.id === selectedId,
            }"
            :style="boxStyle(annotation, index)"
            @pointerdown="
              handleBoxPointerDown($event, annotation)
            "
            @pointermove="handleBoxPointerMove"
            @pointerup="handleBoxPointerUp"
            @pointercancel="handleBoxPointerUp"
          >
            <div class="annotation-label">
              {{ annotation.name }} [{{ annotation.frame }}]
            </div>
            <div
              class="resize-handle"
              data-resize="true"
            ></div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/composables/useCanvas.ts src/mainview/src/components/CanvasView.vue
git commit -m "add CanvasView component with zoom, drag, and resize"
```

---

## Task 6: Inspector and AnnotationList components

**Files:**
- Create: `src/mainview/src/components/Inspector.vue`, `src/mainview/src/components/AnnotationList.vue`

**Reference:** `git show master:web/annotator_annotations.js` for `renderInspector` and `renderAnnotationList`.

- [ ] **Step 1: Write Inspector.vue**

```vue
<script setup lang="ts">
import {
  selectedAnnotation,
  updateSelectedAnnotation,
  colorPickArmed,
  statusText,
  currentSheet,
  dirty,
} from "../state";

const NUMERIC_FIELDS = new Set([
  "frame",
  "x",
  "y",
  "width",
  "height",
]);

function onFieldInput(field: string, value: string) {
  if (NUMERIC_FIELDS.has(field)) {
    updateSelectedAnnotation({ [field]: Number(value) || 0 });
  } else {
    updateSelectedAnnotation({ [field]: value });
  }
}

function togglePick() {
  if (!selectedAnnotation.value) return;
  colorPickArmed.value = !colorPickArmed.value;
  if (colorPickArmed.value) {
    statusText.value =
      "Click the sheet to sample a chroma key.";
  } else if (currentSheet.value) {
    statusText.value = `${currentSheet.value.file} \u2022 ${
      dirty.value ? "Unsaved changes" : "Saved"
    }`;
  }
}
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>Selection</h2>
    </div>
    <div v-if="!selectedAnnotation" class="empty-state">
      Select a sprite on the sheet.
    </div>
    <form v-else class="inspector-form" @submit.prevent>
      <label>
        Name
        <input
          type="text"
          :value="selectedAnnotation.name"
          @input="
            onFieldInput(
              'name',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Type
        <select
          :value="selectedAnnotation.type"
          @input="
            onFieldInput(
              'type',
              ($event.target as HTMLSelectElement).value
            )
          "
        >
          <option value="sprite">sprite</option>
          <option value="tile">tile</option>
        </select>
      </label>
      <label>
        Frame
        <input
          type="number"
          min="0"
          :value="selectedAnnotation.frame"
          @input="
            onFieldInput(
              'frame',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Direction
        <input
          type="text"
          :value="selectedAnnotation.direction"
          @input="
            onFieldInput(
              'direction',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Variant
        <input
          type="text"
          :value="selectedAnnotation.variant"
          @input="
            onFieldInput(
              'variant',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Chroma Key
        <div class="inline-field">
          <input
            type="text"
            placeholder="#00a000"
            :value="selectedAnnotation.chroma_key"
            @input="
              onFieldInput(
                'chroma_key',
                ($event.target as HTMLInputElement).value
              )
            "
          />
          <button type="button" @click="togglePick">
            {{ colorPickArmed ? "Click Sheet" : "Pick" }}
          </button>
        </div>
      </label>
      <label>
        X
        <input
          type="number"
          :value="selectedAnnotation.x"
          @input="
            onFieldInput(
              'x',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Y
        <input
          type="number"
          :value="selectedAnnotation.y"
          @input="
            onFieldInput(
              'y',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Width
        <input
          type="number"
          min="1"
          :value="selectedAnnotation.width"
          @input="
            onFieldInput(
              'width',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Height
        <input
          type="number"
          min="1"
          :value="selectedAnnotation.height"
          @input="
            onFieldInput(
              'height',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Tags
        <input
          type="text"
          placeholder="comma,separated"
          :value="selectedAnnotation.tags"
          @input="
            onFieldInput(
              'tags',
              ($event.target as HTMLInputElement).value
            )
          "
        />
      </label>
      <label>
        Notes
        <textarea
          rows="4"
          :value="selectedAnnotation.notes"
          @input="
            onFieldInput(
              'notes',
              ($event.target as HTMLTextAreaElement).value
            )
          "
        ></textarea>
      </label>
    </form>
  </section>
</template>
```

- [ ] **Step 2: Write AnnotationList.vue**

```vue
<script setup lang="ts">
import { computed } from "vue";
import {
  annotations,
  selectedId,
  selectAnnotation,
} from "../state";

const sorted = computed(() =>
  [...annotations.value].sort((a, b) => {
    const nameDiff = a.name.localeCompare(b.name);
    if (nameDiff !== 0) return nameDiff;
    return a.frame - b.frame;
  })
);
</script>

<template>
  <section class="panel">
    <div class="panel-header">
      <h2>Sprites In Sheet</h2>
      <span class="pill">{{ annotations.length }}</span>
    </div>
    <div class="annotation-list">
      <button
        v-for="annotation in sorted"
        :key="annotation.id"
        type="button"
        class="annotation-card"
        :class="{ selected: annotation.id === selectedId }"
        @click="selectAnnotation(annotation.id)"
      >
        <div class="annotation-name">
          {{ annotation.name }}
        </div>
        <div class="annotation-meta">
          frame {{ annotation.frame }} &bull;
          {{ annotation.x }},{{ annotation.y }} &bull;
          {{ annotation.width }}x{{ annotation.height }}
        </div>
      </button>
    </div>
  </section>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/components/Inspector.vue src/mainview/src/components/AnnotationList.vue
git commit -m "add Inspector and AnnotationList components"
```

---

## Task 7: GalleryPanel component and useChromaKey composable

**Files:**
- Create: `src/mainview/src/composables/useChromaKey.ts`, `src/mainview/src/components/GalleryPanel.vue`

**Reference:** `git show master:web/annotator_gallery.js` — all 241 lines.

- [ ] **Step 1: Write useChromaKey.ts**

```typescript
export interface ChromaColor {
  r: number;
  g: number;
  b: number;
}

export function parseHexColor(
  value: string
): ChromaColor | null {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^#?([0-9a-f]{6})$/);
  if (!match) return null;
  const hex = match[1];
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

export function applyChromaKey(
  imageData: ImageData,
  chroma: ChromaColor
): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i] === chroma.r &&
      data[i + 1] === chroma.g &&
      data[i + 2] === chroma.b
    ) {
      data[i + 3] = 0;
    }
  }
}
```

- [ ] **Step 2: Write GalleryPanel.vue**

Port the full gallery logic from master. The key difference is that sheet
images are loaded via the `api.getSheetImage` RPC call instead of HTTP URLs.

```vue
<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
} from "vue";
import type { Annotation, SheetWithAnnotations } from "../types";
import {
  projectSheets,
  currentSheet,
  openSheet,
  selectAnnotation,
} from "../state";
import { api } from "../rpc";
import {
  parseHexColor,
  applyChromaKey,
} from "../composables/useChromaKey";

interface GalleryFrame {
  annotation: Annotation;
  annotationId: string;
  sheetFile: string;
}

interface SpriteGroup {
  key: string;
  type: string;
  name: string;
  direction: string;
  variant: string;
  inCurrentSheet: boolean;
  frames: GalleryFrame[];
}

const PREVIEW_SCALE = 3;
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", {
  willReadFrequently: true,
})!;

let galleryTick = 0;
let galleryTimer: number | null = null;
const canvasRefs = ref<Map<string, HTMLCanvasElement>>(
  new Map()
);

function groupKey(a: Annotation): string {
  return [
    a.type ?? "sprite",
    a.name?.trim() ?? "",
    a.direction?.trim() ?? "",
    a.variant?.trim() ?? "",
  ].join("|");
}

const groups = computed<SpriteGroup[]>(() => {
  const map = new Map<string, SpriteGroup>();
  for (const sheet of projectSheets.value) {
    for (const ann of sheet.annotations ?? []) {
      const name = ann.name?.trim() ?? "";
      if (!name) continue;
      const key = groupKey(ann);
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          type: ann.type ?? "sprite",
          name,
          direction: ann.direction?.trim() ?? "",
          variant: ann.variant?.trim() ?? "",
          inCurrentSheet: false,
          frames: [],
        };
        map.set(key, group);
      }
      group.inCurrentSheet ||=
        sheet.file === currentSheet.value?.file;
      group.frames.push({
        annotation: ann,
        annotationId: ann.id,
        sheetFile: sheet.file,
      });
    }
  }

  const result = Array.from(map.values());
  for (const g of result) {
    g.frames.sort((a, b) => {
      const fd =
        (a.annotation.frame ?? 0) - (b.annotation.frame ?? 0);
      if (fd !== 0) return fd;
      if (a.sheetFile !== b.sheetFile)
        return a.sheetFile.localeCompare(b.sheetFile);
      if (a.annotation.y !== b.annotation.y)
        return a.annotation.y - b.annotation.y;
      return a.annotation.x - b.annotation.x;
    });
  }

  result.sort((a, b) => {
    if (a.inCurrentSheet !== b.inCurrentSheet)
      return a.inCurrentSheet ? -1 : 1;
    return a.key.localeCompare(b.key);
  });

  return result;
});

function loadImage(
  sheetFile: string
): Promise<HTMLImageElement> {
  const cached = imageCache.get(sheetFile);
  if (cached) return cached;
  const p = api.getSheetImage(sheetFile).then((dataUrl) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  });
  imageCache.set(sheetFile, p);
  return p;
}

function drawFrame(
  canvas: HTMLCanvasElement,
  frame: GalleryFrame
) {
  const w = Math.max(1, frame.annotation.width);
  const h = Math.max(1, frame.annotation.height);
  canvas.width = w * PREVIEW_SCALE;
  canvas.height = h * PREVIEW_SCALE;

  loadImage(frame.sheetFile)
    .then((img) => {
      sourceCanvas.width = w;
      sourceCanvas.height = h;
      sourceCtx.clearRect(0, 0, w, h);
      sourceCtx.drawImage(
        img,
        frame.annotation.x,
        frame.annotation.y,
        w,
        h,
        0,
        0,
        w,
        h
      );

      const chroma = parseHexColor(
        frame.annotation.chroma_key
      );
      if (chroma) {
        const id = sourceCtx.getImageData(0, 0, w, h);
        applyChromaKey(id, chroma);
        sourceCtx.putImageData(id, 0, 0);
      }

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sourceCanvas,
        0,
        0,
        w,
        h,
        0,
        0,
        canvas.width,
        canvas.height
      );
    })
    .catch(() => {
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#9da3ad";
      ctx.font = "11px sans-serif";
      ctx.fillText("Load failed", 8, 16);
    });
}

function renderPreviews() {
  for (const group of groups.value) {
    const canvas = canvasRefs.value.get(group.key);
    if (!canvas) continue;
    const frameIndex =
      group.frames.length === 1
        ? 0
        : galleryTick % group.frames.length;
    drawFrame(canvas, group.frames[frameIndex]);
  }
}

function setCanvasRef(key: string, el: unknown) {
  if (el instanceof HTMLCanvasElement) {
    canvasRefs.value.set(key, el);
  } else {
    canvasRefs.value.delete(key);
  }
}

onMounted(() => {
  galleryTimer = window.setInterval(() => {
    galleryTick++;
    renderPreviews();
  }, 250);
  renderPreviews();
});

onUnmounted(() => {
  if (galleryTimer !== null) {
    clearInterval(galleryTimer);
    galleryTimer = null;
  }
});

async function handleClick(group: SpriteGroup) {
  const target =
    group.frames.find(
      (f) => f.sheetFile === currentSheet.value?.file
    ) ?? group.frames[0];
  if (!target) return;
  if (currentSheet.value?.file !== target.sheetFile) {
    await openSheet(target.sheetFile, target.annotationId);
  } else {
    selectAnnotation(target.annotationId);
  }
}
</script>

<template>
  <section class="gallery-panel">
    <div class="panel-header">
      <h2>Realized Sprites</h2>
      <span class="pill">{{ groups.length }}</span>
    </div>
    <div class="gallery-list">
      <button
        v-for="group in groups"
        :key="group.key"
        type="button"
        class="gallery-card"
        :class="{
          'current-sheet': group.inCurrentSheet,
        }"
        @click="handleClick(group)"
      >
        <canvas
          :ref="(el) => setCanvasRef(group.key, el)"
          class="gallery-preview"
        ></canvas>
        <div class="gallery-name">{{ group.name }}</div>
        <div class="gallery-meta">
          {{ group.frames.length }} frame{{
            group.frames.length === 1 ? "" : "s"
          }}
          <template v-if="group.direction">
            &bull; {{ group.direction }}</template
          >
          <template v-if="group.variant">
            &bull; {{ group.variant }}</template
          >
          <template v-if="group.inCurrentSheet">
            &bull; current sheet</template
          >
        </div>
      </button>
    </div>
  </section>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/composables/useChromaKey.ts src/mainview/src/components/GalleryPanel.vue
git commit -m "add GalleryPanel with chroma key support"
```

---

## Task 8: App.vue — wire everything together

**Files:**
- Modify: `src/mainview/src/App.vue`

**Reference:** `git show master:web/app.js` for toolbar, keyboard shortcuts, event wiring.

- [ ] **Step 1: Write the full App.vue**

```vue
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
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
  addAnnotation,
  duplicateSelected,
  deleteSelected,
  saveCurrentAnnotations,
  colorPickArmed,
  updateSelectedAnnotation,
} from "./state";
import { ZOOM_FACTOR } from "./state";

const canvasView = ref<InstanceType<typeof CanvasView> | null>(
  null
);
const imageWidth = ref(0);
const imageHeight = ref(0);

const zoomLabel = computed(
  () => `${Math.round(zoom.value * 100)}%`
);

function handleAdd() {
  const center = canvasView.value?.getViewportCenter() ?? {
    x: 0,
    y: 0,
  };
  addAnnotation(
    center.x,
    center.y,
    imageWidth.value,
    imageHeight.value
  );
}

async function handleSave() {
  try {
    await saveCurrentAnnotations();
  } catch (e) {
    console.error(e);
    statusText.value = "Save failed";
  }
}

function handleChromaSampled(color: string) {
  updateSelectedAnnotation({ chroma_key: color });
  colorPickArmed.value = false;
}

function onKeydown(event: KeyboardEvent) {
  const mod = event.ctrlKey || event.metaKey;
  const tag = (
    document.activeElement?.tagName ?? ""
  ).toUpperCase();
  const inInput =
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT";

  if (mod && event.key.toLowerCase() === "s") {
    event.preventDefault();
    handleSave();
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
});
</script>

<template>
  <div class="app">
    <SheetSidebar />

    <main class="workspace">
      <div class="toolbar">
        <div class="toolbar-group">
          <button type="button" @click="handleAdd">
            Add Sprite
          </button>
          <button
            type="button"
            :disabled="!selectedAnnotation"
            @click="duplicateSelected"
          >
            Duplicate
          </button>
          <button
            type="button"
            :disabled="!selectedAnnotation"
            @click="deleteSelected"
          >
            Delete
          </button>
          <button
            type="button"
            :disabled="!dirty"
            @click="handleSave"
          >
            Save
          </button>
        </div>
        <div class="toolbar-group">
          <button
            type="button"
            @click="canvasView?.handleZoomOut?.()"
          >
            -
          </button>
          <span class="zoom-label">{{ zoomLabel }}</span>
          <button
            type="button"
            @click="canvasView?.handleZoomIn?.()"
          >
            +
          </button>
          <span class="toolbar-help"
            >Wheel in the sheet view to zoom at the
            cursor.</span
          >
        </div>
        <div class="status-label">{{ statusText }}</div>
      </div>

      <CanvasView
        ref="canvasView"
        :image-width="imageWidth"
        :image-height="imageHeight"
        @chroma-sampled="handleChromaSampled"
        @image-loaded="
          (w: number, h: number) => {
            imageWidth = w
            imageHeight = h
          }
        "
      />

      <GalleryPanel />
    </main>

    <aside class="inspector">
      <Inspector />
      <AnnotationList />
    </aside>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/App.vue
git commit -m "wire up App.vue with all components and toolbar"
```

---

## Task 9: Styles

**Files:**
- Create: `src/mainview/src/style.css`
- Modify: `src/mainview/src/main.ts`

- [ ] **Step 1: Copy styles from master**

Copy the entire stylesheet verbatim from `git show master:web/styles.css`
into `src/mainview/src/style.css`. All 370 lines, no changes.

- [ ] **Step 2: Update main.ts to import styles**

Add to the top of `src/mainview/src/main.ts`:

```typescript
import "./style.css";
```

- [ ] **Step 3: Delete the template app.css if it exists**

```bash
rm -f src/mainview/app.css
```

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/style.css src/mainview/src/main.ts
git add -u  # pick up deleted app.css
git commit -m "port styles from master"
```

---

## Task 10: Integration testing and fixes

- [ ] **Step 1: Build and test**

```bash
bun run start
```

Verify the app opens and:
- Sheet list loads in sidebar
- Clicking a sheet loads the image (via base64 data URL)
- Annotation boxes appear on the image
- Can drag and resize boxes
- Inspector form updates on selection
- Add/Duplicate/Delete buttons work
- Save persists to disk
- Gallery shows sprite previews with animation
- Keyboard shortcuts work (Ctrl+D, Ctrl+S, Delete)
- Zoom via wheel and +/- buttons works
- Chroma key Pick button works
- Dirty flag warns on sheet switch
- Quit while dirty shows confirmation

- [ ] **Step 2: Fix any issues found**

Address bugs discovered in step 1.

- [ ] **Step 3: Test with HMR**

```bash
bun run dev:hmr
```

Verify HMR works — edit a Vue component and see changes reflected.

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "integration fixes"
```

---

## Task 11: Cleanup

- [ ] **Step 1: Remove any leftover files**

Check for files that shouldn't be tracked:

```bash
git status
```

Remove any stale files (old Python artifacts, template files, etc.).

- [ ] **Step 2: Verify .gitignore covers everything**

Ensure `node_modules/`, `dist/`, `build/` are all ignored.

- [ ] **Step 3: Final commit if needed**

```bash
git diff --cached --quiet || git commit -m "cleanup"
```
