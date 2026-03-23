# Web Build for GitHub Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Span spritesheet annotator run in a browser via GitHub Pages, sharing all Vue components with the existing Electrobun desktop build through a platform adapter pattern.

**Architecture:** Extract the `api` object from `rpc.ts` into a `PlatformAdapter` interface with two implementations (Electrobun and Web). The web adapter uses the File System Access API for read/write with a download-based fallback. Entry points (`main.ts` vs `main-web.ts`) determine which adapter is used — no runtime detection.

**Tech Stack:** Vue 3, Vite, TypeScript, Tailwind CSS v4, File System Access API, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-23-web-github-pages-design.md`

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `src/mainview/src/platform/types.ts` | `PlatformAdapter` interface |
| `src/mainview/src/platform/adapter.ts` | Global `api` instance, `setAdapter()`, `platform` ref, `projectPath` ref, layout handler slots |
| `src/mainview/src/platform/electrobun.ts` | `ElectrobunAdapter` — wraps Electrobun RPC, registers menu handlers |
| `src/mainview/src/platform/web.ts` | `WebAdapter` — File System Access API + fallbacks |
| `src/mainview/main-web.ts` | Web entry point — boots Vue app with `WebAdapter` |
| `src/mainview/index-web.html` | Web HTML entry |
| `src/mainview/src/components/LandingScreen.vue` | "Open Folder" landing screen for web |
| `vite.config.web.ts` | Vite config for web build |
| `.github/workflows/deploy-web.yml` | GitHub Actions deploy to Pages |

### Other changes

- Add `dist-web/` to `.gitignore`

### Modified files

| File | Changes |
|------|---------|
| `src/mainview/src/state.ts` | Change `api` import from `./rpc` to `./platform/adapter`; remove `setCanCloseHandler`/`setMenuHandlers` calls |
| `src/mainview/src/App.vue` | Change imports from `./rpc` to `./platform/adapter`; add `projectOpen` conditional; show `LandingScreen` or workspace |
| `src/mainview/src/components/SheetSidebar.vue` | Change import from `../rpc` to `../platform/adapter`; hide "Reveal in Finder" on web |
| `src/mainview/src/components/GalleryPanel.vue` | Change import from `../rpc` to `../platform/adapter` |
| `src/mainview/main.ts` | Add adapter initialization (import `ElectrobunAdapter`, call `setAdapter`) |
| `package.json` | Add `build:web` and `dev:web` scripts |

### Deleted files

| File | Reason |
|------|--------|
| `src/mainview/src/rpc.ts` | Replaced by `platform/` modules |

---

## Task 1: Create Platform Adapter Interface and Adapter Module

**Files:**
- Create: `src/mainview/src/platform/types.ts`
- Create: `src/mainview/src/platform/adapter.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
// src/mainview/src/platform/types.ts
import type { Ref } from "vue";
import type { Annotation, SheetWithAnnotations } from "../types";

export interface PlatformAdapter {
	getProjectAnnotations(): Promise<SheetWithAnnotations[]>;
	saveAnnotations(
		sheet: string,
		annotations: Annotation[],
	): Promise<{ ok: boolean }>;
	getSheetImage(sheet: string): Promise<string>;
	pickProjectDirectory(): Promise<string | null>;
	revealSheet(sheet: string): Promise<void>;
	saveLayout(layout: object): Promise<{ ok: boolean }>;
	loadLayout(): Promise<object | null>;
	/** Whether direct save-back to disk is available */
	canSave: Ref<boolean>;
}
```

- [ ] **Step 2: Create `adapter.ts`**

This module holds the global `api` proxy, `platform` ref, `projectPath` ref, and the layout handler slots (moved from `rpc.ts` since they're used by `App.vue` on both platforms).

```typescript
// src/mainview/src/platform/adapter.ts
import { ref } from "vue";
import type { PlatformAdapter } from "./types";

export const platform = ref<"desktop" | "web">("desktop");
export const projectPath = ref<string>("");
export const projectOpen = ref(false);

// --- Layout handler slots (used by App.vue on both platforms) ---

let resetLayoutHandler: () => void = () => {};
let addPanelHandler: (panelId: string) => void = () => {};

export function setResetLayoutHandler(handler: () => void) {
	resetLayoutHandler = handler;
}

export function setAddPanelHandler(handler: (panelId: string) => void) {
	addPanelHandler = handler;
}

export function getResetLayoutHandler() {
	return () => resetLayoutHandler();
}

export function getAddPanelHandler() {
	return (panelId: string) => addPanelHandler(panelId);
}

// --- Adapter proxy ---

let _adapter: PlatformAdapter | null = null;

function getAdapter(): PlatformAdapter {
	if (!_adapter) throw new Error("Platform adapter not initialized");
	return _adapter;
}

export function setAdapter(
	adapter: PlatformAdapter,
	p: "desktop" | "web",
) {
	_adapter = adapter;
	platform.value = p;
}

/** Get the raw adapter instance (use when you need platform-specific methods like setFallbackFiles) */
export function getRawAdapter<T extends PlatformAdapter = PlatformAdapter>(): T {
	return getAdapter() as T;
}

export const api: PlatformAdapter = {
	getProjectAnnotations: () => getAdapter().getProjectAnnotations(),
	saveAnnotations: (sheet, annotations) =>
		getAdapter().saveAnnotations(sheet, annotations),
	getSheetImage: (sheet) => getAdapter().getSheetImage(sheet),
	pickProjectDirectory: () => getAdapter().pickProjectDirectory(),
	revealSheet: (sheet) => getAdapter().revealSheet(sheet),
	saveLayout: (layout) => getAdapter().saveLayout(layout),
	loadLayout: () => getAdapter().loadLayout(),
	get canSave() {
		return getAdapter().canSave;
	},
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bunx tsc --noEmit --pretty 2>&1 | head -20`

This will likely show errors from files still importing from `./rpc` — that's expected. Verify that `platform/types.ts` and `platform/adapter.ts` themselves have no errors.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/platform/types.ts src/mainview/src/platform/adapter.ts
git commit -m "add platform adapter interface and global adapter module"
```

---

## Task 2: Create ElectrobunAdapter

**Files:**
- Create: `src/mainview/src/platform/electrobun.ts`

- [ ] **Step 1: Create `electrobun.ts`**

Move the Electrobun RPC logic from `rpc.ts` into this adapter. This file owns the `canClose` and menu handler registration.

```typescript
// src/mainview/src/platform/electrobun.ts
import { ref } from "vue";
import { Electroview } from "electrobun/view";
import type { SpanRPC } from "../../../shared/rpc-schema";
import type { PlatformAdapter } from "./types";
import type { Annotation } from "../types";
import {
	projectPath,
	getResetLayoutHandler,
	getAddPanelHandler,
} from "./adapter";

// --- Handler slots for desktop menu dispatch ---

let canCloseHandler: () => boolean = () => true;
let addSpriteHandler: () => void = () => {};
let duplicateSpriteHandler: () => void = () => {};
let deleteSpriteHandler: () => void = () => {};
let triggerSaveHandler: () => void = () => {};

const rpc = Electroview.defineRPC<SpanRPC>({
	handlers: {
		requests: {
			canClose: () => canCloseHandler(),
			addSprite: () => addSpriteHandler(),
			duplicateSprite: () => duplicateSpriteHandler(),
			deleteSprite: () => deleteSpriteHandler(),
			triggerSave: () => triggerSaveHandler(),
			resetLayout: () => getResetLayoutHandler()(),
			addPanel: ({ panelId }) => getAddPanelHandler()(panelId),
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

export function createElectrobunAdapter(): PlatformAdapter {
	return {
		getProjectAnnotations: () =>
			electroview.rpc.request.getProjectAnnotations({}),
		saveAnnotations: (sheet: string, annotations: Annotation[]) =>
			electroview.rpc.request.saveAnnotations({ sheet, annotations }),
		getSheetImage: (sheet: string) =>
			electroview.rpc.request.getSheetImage({ sheet }),
		pickProjectDirectory: () =>
			electroview.rpc.request.pickProjectDirectory({}),
		revealSheet: (sheet: string) =>
			electroview.rpc.request.revealSheet({ sheet }),
		saveLayout: (layout: object) =>
			electroview.rpc.request.saveLayout({ layout }),
		loadLayout: () => electroview.rpc.request.loadLayout({}),
		canSave: ref(true),
	};
}

/**
 * Wire desktop menu handlers. Called once from main.ts after state module
 * is loaded so the action functions are available.
 */
export function wireDesktopMenuHandlers(handlers: {
	canClose: () => boolean;
	addSprite: () => void;
	duplicateSprite: () => void;
	deleteSprite: () => void;
	triggerSave: () => void;
}) {
	canCloseHandler = handlers.canClose;
	addSpriteHandler = handlers.addSprite;
	duplicateSpriteHandler = handlers.duplicateSprite;
	deleteSpriteHandler = handlers.deleteSprite;
	triggerSaveHandler = handlers.triggerSave;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/platform/electrobun.ts
git commit -m "add ElectrobunAdapter wrapping existing RPC logic"
```

---

## Task 3: Migrate Consumers to Platform Adapter

**Files:**
- Modify: `src/mainview/main.ts`
- Modify: `src/mainview/src/state.ts:1-68`
- Modify: `src/mainview/src/App.vue:13`
- Modify: `src/mainview/src/components/SheetSidebar.vue:11`
- Modify: `src/mainview/src/components/GalleryPanel.vue:11`
- Delete: `src/mainview/src/rpc.ts`

- [ ] **Step 1: Update `state.ts`**

Change the import on line 4 and remove the `setCanCloseHandler`/`setMenuHandlers` calls (lines 46-68).

Replace line 4:
```typescript
// OLD: import { api, setCanCloseHandler, setMenuHandlers } from "./rpc";
import { api } from "./platform/adapter";
```

Remove lines 46-68 (the `setCanCloseHandler(...)` call and the `setMenuHandlers(...)` call). Keep the `// --- Actions ---` comment and everything below it.

Add a new exported function that wraps `addAnnotation` with the viewport center (since `getViewportCenter` is module-private):

```typescript
/** Called from desktop menu handler — passes current viewport center */
export function addAnnotationAtViewportCenter() {
	const center = getViewportCenter();
	addAnnotation(center.x, center.y);
}
```

- [ ] **Step 2: Update `App.vue`**

Replace line 13:
```typescript
// OLD: import { api, setResetLayoutHandler, setAddPanelHandler } from "./rpc";
import { api, setResetLayoutHandler, setAddPanelHandler } from "./platform/adapter";
```

- [ ] **Step 3: Update `SheetSidebar.vue`**

Replace line 11:
```typescript
// OLD: import { api } from "../rpc";
import { api, platform } from "../platform/adapter";
```

Also conditionally hide the "Reveal in Finder" context menu entry. In `onSheetContextMenu` (around line 56), wrap the entry:

```typescript
const entries: MenuEntry[] = [
	{
		label: "Open",
		action: () => handleOpen(file),
		disabled: currentSheet.value?.file === file,
	},
	...(platform.value === "desktop"
		? [{ label: "Reveal in Finder", action: () => api.revealSheet(file) }]
		: []),
	{ separator: true },
	{ label: "Refresh all sheets", action: () => handleRefresh() },
];
```

- [ ] **Step 4: Update `GalleryPanel.vue`**

Replace line 11:
```typescript
// OLD: import { api } from "../rpc";
import { api } from "../platform/adapter";
```

- [ ] **Step 5: Update `main.ts` to initialize adapter**

Replace the contents of `main.ts` with:

```typescript
import "dockview-vue/dist/styles/dockview.css";
import "./src/style.css";
import App from "./src/App.vue";
import SheetSidebar from "./src/components/SheetSidebar.vue";
import CanvasView from "./src/components/CanvasView.vue";
import Inspector from "./src/components/Inspector.vue";
import AnnotationList from "./src/components/AnnotationList.vue";
import GalleryPanel from "./src/components/GalleryPanel.vue";
import { createApp } from "vue";
import { setAdapter, projectOpen } from "./src/platform/adapter";
import {
	createElectrobunAdapter,
	wireDesktopMenuHandlers,
} from "./src/platform/electrobun";
import {
	dirty,
	addAnnotationAtViewportCenter,
	duplicateSelected,
	deleteSelected,
	saveCurrentAnnotations,
	statusText,
} from "./src/state";

// Initialize platform
const adapter = createElectrobunAdapter();
setAdapter(adapter, "desktop");
projectOpen.value = true; // Desktop always has a project loaded via CLI

// Wire desktop-only menu handlers
wireDesktopMenuHandlers({
	canClose: () => {
		if (!dirty.value) return true;
		return window.confirm("You have unsaved changes. Quit without saving?");
	},
	addSprite: () => addAnnotationAtViewportCenter(),
	duplicateSprite: () => duplicateSelected(),
	deleteSprite: () => deleteSelected(),
	triggerSave: () => {
		saveCurrentAnnotations().catch((e) => {
			console.error(e);
			statusText.value = "Save failed — check disk permissions";
		});
	},
});

const app = createApp(App);

// Register components globally so Dockview can find them by name
app.component("sheets", SheetSidebar);
app.component("sprite-canvas", CanvasView);
app.component("inspector", Inspector);
app.component("annotations", AnnotationList);
app.component("gallery", GalleryPanel);

app.mount("#app");
```

- [ ] **Step 6: Delete `rpc.ts`**

```bash
rm src/mainview/src/rpc.ts
```

- [ ] **Step 7: Verify desktop build compiles**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run start`

The desktop app should boot and work identically to before. Test: open a sheet, add/delete a sprite, save, verify layout persists.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "migrate all consumers from rpc.ts to platform adapter"
```

---

## Task 4: Create WebAdapter

**Files:**
- Create: `src/mainview/src/platform/web.ts`

- [ ] **Step 1: Create `web.ts`**

```typescript
// src/mainview/src/platform/web.ts
import { ref } from "vue";
import type { PlatformAdapter } from "./types";
import type { Annotation, SheetWithAnnotations } from "../types";
import { normalizeAnnotation } from "../types";
import { projectPath, projectOpen } from "./adapter";

const LAYOUT_KEY = "span-layout";

export interface WebPlatformAdapter extends PlatformAdapter {
	/** Set files from a file input (fallback mode). Call loadProjectData after. */
	setFallbackFiles(files: FileList): { ok: boolean; error?: string };
	/** Open project from a pre-obtained directory handle (from drag-and-drop). Call loadProjectData after. */
	openWithHandle(handle: FileSystemDirectoryHandle): Promise<{ ok: boolean; error?: string }>;
}

export function createWebAdapter(): WebPlatformAdapter {
	let dirHandle: FileSystemDirectoryHandle | null = null;
	let fallbackFiles: Map<string, File> | null = null;
	let lastBlobUrl: string | null = null;
	const canSave = ref(false);

	async function readSubDir(
		name: string,
	): Promise<FileSystemDirectoryHandle | null> {
		if (!dirHandle) return null;
		try {
			return await dirHandle.getDirectoryHandle(name);
		} catch {
			return null;
		}
	}

	async function readJsonFile(
		dir: FileSystemDirectoryHandle,
		name: string,
	): Promise<unknown | null> {
		try {
			const fh = await dir.getFileHandle(name);
			const file = await fh.getFile();
			return JSON.parse(await file.text());
		} catch {
			return null;
		}
	}

	async function loadManifest(): Promise<Map<string, Record<string, unknown>>> {
		const result = new Map<string, Record<string, unknown>>();
		if (!dirHandle) return result;
		try {
			const data = (await readJsonFile(dirHandle, "manifest.json")) as any;
			for (const asset of data?.assets ?? []) {
				if (typeof asset.file === "string") result.set(asset.file, asset);
			}
		} catch {}
		return result;
	}

	async function loadFromHandle(): Promise<SheetWithAnnotations[]> {
		const sheetsDir = await readSubDir("sheets");
		if (!sheetsDir) return [];
		const annDir = await readSubDir("annotations");
		const manifest = await loadManifest();

		const pngs: string[] = [];
		for await (const e of sheetsDir.values()) {
			if (e.kind === "file" && e.name.toLowerCase().endsWith(".png"))
				pngs.push(e.name);
		}
		pngs.sort();

		const sheets: SheetWithAnnotations[] = [];
		for (const file of pngs) {
			const stem = file.replace(/\.png$/i, "");
			const annFile = `${stem}.annotations.json`;
			let annotations: Annotation[] = [];
			if (annDir) {
				const data = (await readJsonFile(annDir, annFile)) as any;
				if (Array.isArray(data?.annotations)) {
					annotations = data.annotations.map(
						(a: Record<string, unknown>) => normalizeAnnotation(a),
					);
				}
			}
			const asset = manifest.get(file) ?? {};
			sheets.push({
				file,
				name: (asset.name as string) ?? stem,
				imageUrl: "",
				annotationFile: `annotations/${annFile}`,
				annotations,
			});
		}
		return sheets;
	}

	async function loadFromFallback(): Promise<SheetWithAnnotations[]> {
		if (!fallbackFiles) return [];
		const pngs: string[] = [];
		const annFiles = new Map<string, File>();

		for (const [path, file] of fallbackFiles) {
			if (path.startsWith("sheets/") && path.toLowerCase().endsWith(".png"))
				pngs.push(path.replace("sheets/", ""));
			else if (
				path.startsWith("annotations/") &&
				path.endsWith(".annotations.json")
			)
				annFiles.set(path.replace("annotations/", ""), file);
		}
		pngs.sort();

		const sheets: SheetWithAnnotations[] = [];
		for (const file of pngs) {
			const stem = file.replace(/\.png$/i, "");
			const annFile = `${stem}.annotations.json`;
			let annotations: Annotation[] = [];
			const af = annFiles.get(annFile);
			if (af) {
				try {
					const data = JSON.parse(await af.text());
					if (Array.isArray(data?.annotations)) {
						annotations = data.annotations.map(
							(a: Record<string, unknown>) => normalizeAnnotation(a),
						);
					}
				} catch {}
			}
			sheets.push({
				file,
				name: stem,
				imageUrl: "",
				annotationFile: `annotations/${annFile}`,
				annotations,
			});
		}
		return sheets;
	}

	return {
		canSave,

		async getProjectAnnotations() {
			if (dirHandle) return loadFromHandle();
			if (fallbackFiles) return loadFromFallback();
			return [];
		},

		async saveAnnotations(sheet, annotations) {
			const stem = sheet.replace(/\.png$/i, "");
			const filename = `${stem}.annotations.json`;
			const payload =
				JSON.stringify({ image: sheet, annotations }, null, 2) + "\n";

			if (dirHandle && canSave.value) {
				try {
					const annDir = await dirHandle.getDirectoryHandle(
						"annotations",
						{ create: true },
					);
					const fh = await annDir.getFileHandle(filename, {
						create: true,
					});
					const w = await fh.createWritable();
					await w.write(payload);
					await w.close();
					return { ok: true };
				} catch {
					canSave.value = false;
				}
			}

			// Download fallback
			const blob = new Blob([payload], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			return { ok: true };
		},

		async getSheetImage(sheet) {
			if (lastBlobUrl) {
				URL.revokeObjectURL(lastBlobUrl);
				lastBlobUrl = null;
			}

			if (dirHandle) {
				const sheetsDir = await readSubDir("sheets");
				if (sheetsDir) {
					const fh = await sheetsDir.getFileHandle(sheet);
					const file = await fh.getFile();
					const url = URL.createObjectURL(file);
					lastBlobUrl = url;
					return url;
				}
			}

			if (fallbackFiles) {
				const file = fallbackFiles.get(`sheets/${sheet}`);
				if (file) {
					const url = URL.createObjectURL(file);
					lastBlobUrl = url;
					return url;
				}
			}

			return "";
		},

		async pickProjectDirectory() {
			if (!("showDirectoryPicker" in window)) return null;

			try {
				dirHandle = await (window as any).showDirectoryPicker({
					mode: "readwrite",
				});
				if (!dirHandle) return null;

				const sheetsDir = await readSubDir("sheets");
				if (!sheetsDir) {
					dirHandle = null;
					throw new Error("no-sheets");
				}

				let hasPng = false;
				for await (const e of sheetsDir.values()) {
					if (
						e.kind === "file" &&
						e.name.toLowerCase().endsWith(".png")
					) {
						hasPng = true;
						break;
					}
				}
				if (!hasPng) {
					dirHandle = null;
					throw new Error("no-png");
				}

				canSave.value = true;
				projectPath.value = dirHandle.name;
				projectOpen.value = true;
				return dirHandle.name;
			} catch (e: any) {
				if (e?.message === "no-sheets" || e?.message === "no-png")
					throw e;
				if (e?.name === "AbortError") return null;
				throw e;
			}
		},

		async revealSheet() {},

		async saveLayout(layout) {
			try {
				localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},

		async loadLayout() {
			try {
				const raw = localStorage.getItem(LAYOUT_KEY);
				return raw ? JSON.parse(raw) : null;
			} catch {
				return null;
			}
		},

		setFallbackFiles(files: FileList) {
			const fileMap = new Map<string, File>();
			for (const file of files) {
				const parts = file.webkitRelativePath.split("/");
				if (parts.length < 2) continue;
				fileMap.set(parts.slice(1).join("/"), file);
			}

			let hasPng = false;
			for (const path of fileMap.keys()) {
				if (
					path.startsWith("sheets/") &&
					path.toLowerCase().endsWith(".png")
				) {
					hasPng = true;
					break;
				}
			}
			if (!hasPng) {
				return {
					ok: false,
					error: "No spritesheet files found in this folder",
				};
			}

			fallbackFiles = fileMap;
			canSave.value = false;
			projectPath.value =
				files[0]?.webkitRelativePath.split("/")[0] ?? "project";
			projectOpen.value = true;
			return { ok: true };
		},

		async openWithHandle(handle: FileSystemDirectoryHandle) {
			dirHandle = handle;

			const sheetsDir = await readSubDir("sheets");
			if (!sheetsDir) {
				dirHandle = null;
				return { ok: false, error: "No sheets/ directory found" };
			}

			let hasPng = false;
			for await (const e of sheetsDir.values()) {
				if (e.kind === "file" && e.name.toLowerCase().endsWith(".png")) {
					hasPng = true;
					break;
				}
			}
			if (!hasPng) {
				dirHandle = null;
				return { ok: false, error: "No spritesheet files found in this folder" };
			}

			canSave.value = true;
			projectPath.value = handle.name;
			projectOpen.value = true;
			return { ok: true };
		},
	};
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/platform/web.ts
git commit -m "add WebAdapter with File System Access API and download fallback"
```

---

## Task 5: Create Landing Screen Component

**Files:**
- Create: `src/mainview/src/components/LandingScreen.vue`

- [ ] **Step 1: Create `LandingScreen.vue`**

```vue
<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
	hasDirectoryPicker: boolean;
}>();

const emit = defineEmits<{
	pickDirectory: [];
	openHandle: [handle: FileSystemDirectoryHandle];
	selectFiles: [files: FileList];
}>();

const error = ref("");
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function onDrop(e: DragEvent) {
	dragging.value = false;
	e.preventDefault();

	// Try to get a directory handle (Chromium only)
	const items = e.dataTransfer?.items;
	if (items && items.length === 1) {
		const item = items[0];
		if ("getAsFileSystemHandle" in item) {
			(item as any)
				.getAsFileSystemHandle()
				.then((handle: FileSystemHandle) => {
					if (handle.kind === "directory") {
						emit("openHandle", handle as FileSystemDirectoryHandle);
					}
				})
				.catch(() => {
					error.value = "Could not read dropped folder";
				});
			return;
		}
	}

	// Fallback: read files from drop
	const files = e.dataTransfer?.files;
	if (files && files.length > 0) {
		emit("selectFiles", files);
	}
}

function onFileInputChange(e: Event) {
	const input = e.target as HTMLInputElement;
	if (input.files && input.files.length > 0) {
		emit("selectFiles", input.files);
	}
}
</script>

<template>
	<div
		class="h-full flex items-center justify-center bg-surface-0"
		@dragover.prevent="dragging = true"
		@dragleave="dragging = false"
		@drop="onDrop"
	>
		<div
			class="flex flex-col items-center gap-6 p-10 rounded border max-w-md text-center transition-colors"
			:class="
				dragging
					? 'border-copper bg-copper-glow'
					: 'border-border bg-surface-1'
			"
		>
			<div>
				<h1 class="text-xl font-semibold text-text">Span</h1>
				<p class="text-sm text-text-dim mt-1">
					Spritesheet annotation tool
				</p>
			</div>

			<p class="text-xs text-text-faint">
				Open a project folder containing a <code class="text-text-dim">sheets/</code> directory with PNG spritesheets.
			</p>

			<button
				v-if="hasDirectoryPicker"
				type="button"
				class="px-5 py-2 bg-copper text-surface-0 font-medium text-sm rounded cursor-pointer hover:brightness-110 active:translate-y-px transition-all"
				@click="emit('pickDirectory')"
			>
				Open Folder
			</button>

			<template v-else>
				<button
					type="button"
					class="px-5 py-2 bg-copper text-surface-0 font-medium text-sm rounded cursor-pointer hover:brightness-110 active:translate-y-px transition-all"
					@click="fileInput?.click()"
				>
					Select Folder
				</button>
				<input
					ref="fileInput"
					type="file"
					webkitdirectory
					class="hidden"
					@change="onFileInputChange"
				/>
			</template>

			<p class="text-[11px] text-text-faint">
				or drag and drop a folder here
			</p>

			<p v-if="error" class="text-xs text-danger">{{ error }}</p>
		</div>
	</div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/LandingScreen.vue
git commit -m "add LandingScreen component for web project picker"
```

---

## Task 6: Create Web Entry Point and HTML

**Files:**
- Create: `src/mainview/main-web.ts`
- Create: `src/mainview/index-web.html`

- [ ] **Step 1: Create `main-web.ts`**

```typescript
// src/mainview/main-web.ts
import "dockview-vue/dist/styles/dockview.css";
import "./src/style.css";
import App from "./src/App.vue";
import SheetSidebar from "./src/components/SheetSidebar.vue";
import CanvasView from "./src/components/CanvasView.vue";
import Inspector from "./src/components/Inspector.vue";
import AnnotationList from "./src/components/AnnotationList.vue";
import GalleryPanel from "./src/components/GalleryPanel.vue";
import { createApp } from "vue";
import { setAdapter } from "./src/platform/adapter";
import { createWebAdapter } from "./src/platform/web";
import { dirty } from "./src/state";

// Initialize platform
const adapter = createWebAdapter();
setAdapter(adapter, "web");

// Warn on unsaved changes before closing tab
window.addEventListener("beforeunload", (e) => {
	if (dirty.value) {
		e.preventDefault();
	}
});

const app = createApp(App);

app.component("sheets", SheetSidebar);
app.component("sprite-canvas", CanvasView);
app.component("inspector", Inspector);
app.component("annotations", AnnotationList);
app.component("gallery", GalleryPanel);

app.mount("#app");
```

- [ ] **Step 2: Create `index-web.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Span — Spritesheet Annotator</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/main-web.ts"></script>
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add src/mainview/main-web.ts src/mainview/index-web.html
git commit -m "add web entry point and HTML for browser build"
```

---

## Task 7: Update App.vue for Landing Screen

**Files:**
- Modify: `src/mainview/src/App.vue`

- [ ] **Step 1: Add landing screen toggle to App.vue**

Import `projectOpen`, `platform` from adapter and `LandingScreen`. Add the `webAdapter` ref for fallback file handling. Show `LandingScreen` when `!projectOpen`.

Update the `<script setup>` section — add these imports at the top:

```typescript
import { projectOpen, platform, getRawAdapter } from "./platform/adapter";
import type { WebPlatformAdapter } from "./platform/web";
import LandingScreen from "./components/LandingScreen.vue";
import { loadProjectData } from "./state";
```

Note: `loadProjectData` is already imported. Just add `projectOpen`, `platform`, `getRawAdapter`, `WebPlatformAdapter`, and `LandingScreen`.

Add a method to handle directory picking and file selection:

```typescript
const hasDirectoryPicker = "showDirectoryPicker" in window;

async function handlePickDirectory() {
	try {
		await api.pickProjectDirectory();
		if (projectOpen.value) {
			await loadProjectData();
		}
	} catch (e: any) {
		if (e?.message === "no-sheets" || e?.message === "no-png") {
			statusText.value = "No spritesheet files found in this folder";
		}
	}
}

async function handleOpenHandle(handle: FileSystemDirectoryHandle) {
	if (platform.value !== "web") return;
	const webAdapter = getRawAdapter<WebPlatformAdapter>();
	const result = await webAdapter.openWithHandle(handle);
	if (!result.ok) {
		statusText.value = result.error ?? "Invalid project folder";
		return;
	}
	await loadProjectData();
}

async function handleSelectFiles(files: FileList) {
	if (platform.value !== "web") return;
	const webAdapter = getRawAdapter<WebPlatformAdapter>();
	const result = webAdapter.setFallbackFiles(files);
	if (!result.ok) {
		statusText.value = result.error ?? "Failed to open folder";
		return;
	}
	await loadProjectData();
}
```

Update `onMounted` to only auto-load when project is already open (desktop):

```typescript
onMounted(async () => {
	window.addEventListener("keydown", onKeydown);
	if (projectOpen.value) {
		try {
			await loadProjectData();
		} catch (e) {
			console.error(e);
			statusText.value = "Failed to load project";
		}
	}
});
```

Update the `<template>` section:

```html
<template>
	<div class="app-shell" @contextmenu.prevent>
		<template v-if="projectOpen">
			<div class="dockview-theme-dark dockview-container">
				<DockviewVue @ready="onReady" />
			</div>
			<div
				class="px-3 py-1 border-t text-[11px] font-mono truncate transition-all duration-300 ease-out"
				:class="
					statusFlash
						? 'border-copper/40 bg-copper-glow text-copper-bright'
						: 'border-border bg-surface-1 text-text-faint'
				"
			>
				{{ statusText }}
				<template v-if="platform === 'web'">
					<span class="ml-2 opacity-60">
						{{ api.canSave.value ? '· Direct Save' : '· Download Mode' }}
					</span>
				</template>
			</div>
		</template>
		<LandingScreen
			v-else
			:has-directory-picker="hasDirectoryPicker"
			@pick-directory="handlePickDirectory"
			@open-handle="handleOpenHandle"
			@select-files="handleSelectFiles"
		/>
	</div>
</template>
```

- [ ] **Step 2: Verify desktop build still works**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run start`

Desktop should work unchanged since `projectOpen` is set to `true` in `main.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/App.vue
git commit -m "add landing screen toggle and save mode indicator to App.vue"
```

---

## Task 8: Create Web Vite Config and Package Scripts

**Files:**
- Create: `vite.config.web.ts`
- Modify: `package.json`

- [ ] **Step 1: Create `vite.config.web.ts`**

```typescript
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	plugins: [vue(), tailwindcss()],
	root: "src/mainview",
	build: {
		outDir: "../../dist-web",
		emptyOutDir: true,
		rollupOptions: {
			input: "index-web.html",
		},
	},
	base: "/span/",
	server: {
		port: 5174,
	},
});
```

- [ ] **Step 2: Add scripts to `package.json`**

Add to the `"scripts"` section:

```json
"build:web": "vite build --config vite.config.web.ts",
"dev:web": "vite --config vite.config.web.ts"
```

- [ ] **Step 3: Add `dist-web/` to `.gitignore`**

Add `dist-web/` to the project's `.gitignore` file (alongside the existing `dist/` entry if present).

- [ ] **Step 4: Test web dev server**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run dev:web`

Open `http://localhost:5174/span/` in Chrome. You should see the landing screen with the "Open Folder" button. Click it, select a project folder with a `sheets/` directory containing PNGs, and verify:
- Sheets load in the sidebar
- Canvas shows the spritesheet
- Annotations can be added and saved (check that save writes back to disk)
- Layout changes persist across page reloads (check localStorage)

- [ ] **Step 5: Test web production build**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:web && bunx serve dist-web`

Open the served URL and verify the same functionality.

- [ ] **Step 6: Commit**

```bash
git add vite.config.web.ts package.json .gitignore
git commit -m "add web Vite config and build/dev scripts"
```

---

## Task 9: Add GitHub Actions Deployment

**Files:**
- Create: `.github/workflows/deploy-web.yml`

- [ ] **Step 1: Create workflow file**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install --frozen-lockfile

      - run: bun run build:web

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist-web

      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
mkdir -p .github/workflows
git add .github/workflows/deploy-web.yml
git commit -m "add GitHub Actions workflow for Pages deployment"
```

---

## Task 10: End-to-End Verification

- [ ] **Step 1: Verify desktop build**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run start`

Test all desktop functionality:
- Sheets load automatically
- Add, duplicate, delete sprites
- Save (Cmd+S)
- Layout persists
- "Reveal in Finder" context menu works
- Quit with unsaved changes shows confirm dialog

- [ ] **Step 2: Verify web dev build**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run dev:web`

Open `http://localhost:5174/span/` in Chrome. Test:
- Landing screen appears
- "Open Folder" button opens directory picker
- Selecting an invalid folder shows error
- Selecting a valid project loads sheets
- Sprites can be added, moved, saved
- Cmd+S saves back to disk (Chrome)
- "Reveal in Finder" is NOT in context menu
- Layout persists via localStorage
- Status bar shows "Direct Save" or "Download Mode"
- Tab close with unsaved changes shows warning

- [ ] **Step 3: Test Firefox fallback**

Open in Firefox:
- Landing screen shows "Select Folder" button (not "Open Folder")
- Selecting folder loads project
- Cmd+S triggers JSON file download
- Status bar shows "Download Mode"

- [ ] **Step 4: Verify web production build**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:web`

Check that `dist-web/` contains the built assets with correct `/span/` base path.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address issues found during e2e verification"
```
