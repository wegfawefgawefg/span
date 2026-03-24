# Workspace + I/O Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the project-directory file model with drag-and-drop workspace loading, `.span` working file persistence, and spec-conforming export.

**Architecture:** Three new modules (`workspace.ts`, `persistence.ts`, `export.ts`) handle the data flow. The `PlatformAdapter` interface is simplified to file dialog + file I/O methods. The RPC schema and Bun main process are updated to match. Components consume `WorkspaceSheet[]` from workspace state instead of `projectSheets`.

**Tech Stack:** Vue 3, TypeScript, `yaml` package (for YAML export), Bun test runner

**Spec:** `docs/superpowers/specs/2026-03-23-workspace-io-design.md`

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `src/mainview/src/workspace.ts` | `WorkspaceSheet` type, workspace state refs, `addImages()`, `computeRoot()`, `removeSheet()`, `openSheet()` |
| `src/mainview/src/persistence.ts` | `.span` file serialization/deserialization, autosave debouncing, localStorage persistence |
| `src/mainview/src/persistence.test.ts` | Persistence round-trip tests |
| `src/mainview/src/export.ts` | Export to spec-conforming output (JSON/YAML) |
| `src/mainview/src/export.test.ts` | Export tests |

### Modified files

| File | Changes |
|------|---------|
| `src/mainview/src/types.ts` | Remove `Sheet`, `SheetWithAnnotations`. Keep `makeId`. |
| `src/mainview/src/state.ts` | Remove old project loading. Wire workspace + persistence. Add export action. |
| `src/mainview/src/platform/types.ts` | Replace project methods with file I/O methods on `PlatformAdapter`. |
| `src/mainview/src/platform/adapter.ts` | Update `api` proxy. Remove `projectPath`/`projectOpen`. |
| `src/mainview/src/platform/electrobun.ts` | New RPC calls for file dialogs and I/O. |
| `src/mainview/src/platform/web.ts` | Remove project methods. Add localStorage + download helpers. |
| `src/shared/rpc-schema.ts` | New RPC schema with file dialog and I/O methods. |
| `src/bun/index.ts` | New RPC handlers. Remove project loading. |
| `src/bun/project.ts` | Delete (replaced by generic file I/O in index.ts). |
| `src/mainview/src/components/SheetSidebar.vue` | Consume workspace sheets. Add images via drop/picker. |
| `src/mainview/src/components/App.vue` | Wire drop zone for images/spec/span files. Export shortcut. |
| `src/mainview/main.ts` | Update desktop menu handlers for new state API. |
| `src/mainview/main-web.ts` | Wire localStorage restore on load. |

---

## Task 1: Export Module

The export module is pure logic with no platform dependencies — ideal to build and test first.

**Files:**
- Create: `src/mainview/src/export.ts`
- Create: `src/mainview/src/export.test.ts`

- [ ] **Step 1: Write export tests**

Test cases:
- Export a spec with rect Sprite entities → correct YAML output with flattened shape+property fields
- Export a spec with mixed entity types per sheet → grouped by entity type
- Export JSON when spec format is "json"
- Exclude annotations with missing entity types
- Exclude sheets with no annotations
- Field order matches spec order (shape fields first, then properties)
- `id` and `_stash` excluded from output
- `string[]` properties serialized as arrays
- Empty workspace → empty sheets array

- [ ] **Step 2: Implement export**

```typescript
// src/mainview/src/export.ts
import YAML from "yaml";
import type { SpanSpec } from "./spec/types";
import type { Annotation } from "./annotation";
import type { WorkspaceSheet } from "./workspace";

export interface ExportSheet {
	file: string;
	[entityType: string]: unknown; // entity type → annotation array
}

export function buildExportData(
	sheets: WorkspaceSheet[],
	spec: SpanSpec,
	root: string,
): { sheets: ExportSheet[] } {
	const result: ExportSheet[] = [];

	for (const sheet of sheets) {
		// Group annotations by entity type
		const groups = new Map<string, Record<string, unknown>[]>();

		for (const ann of sheet.annotations) {
			const entityDef = spec.entities[ann.entityType];
			if (!entityDef) continue; // skip orphaned annotations

			// Build flattened object: shape fields first (spec order), then properties (spec order)
			const flat: Record<string, unknown> = {};

			for (const field of entityDef.shape.fields) {
				flat[field.name] = ann.shapeData[field.name] ?? 0;
			}
			for (const prop of entityDef.properties) {
				flat[prop.name] = ann.propertyData[prop.name] ?? null;
			}

			if (!groups.has(ann.entityType)) {
				groups.set(ann.entityType, []);
			}
			groups.get(ann.entityType)!.push(flat);
		}

		if (groups.size === 0) continue; // skip sheets with no valid annotations

		const exportSheet: ExportSheet = { file: sheet.path };
		for (const [entityType, annotations] of groups) {
			exportSheet[entityType] = annotations;
		}
		result.push(exportSheet);
	}

	return { sheets: result };
}

export function exportToString(
	sheets: WorkspaceSheet[],
	spec: SpanSpec,
	root: string,
): string {
	const data = buildExportData(sheets, spec, root);

	if (spec.format === "yaml") {
		return YAML.stringify(data, { flowCollectionPadding: true, defaultKeyType: "PLAIN", defaultStringType: "QUOTE_DOUBLE" });
	}
	return JSON.stringify(data, null, 2) + "\n";
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `bun test src/mainview/src/export.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/export.ts src/mainview/src/export.test.ts
git commit -m "add spec-conforming export module"
```

---

## Task 2: Workspace Module

**Files:**
- Create: `src/mainview/src/workspace.ts`

- [ ] **Step 1: Create workspace module**

```typescript
// src/mainview/src/workspace.ts
import { ref, computed } from "vue";
import type { Annotation } from "./annotation";

export interface WorkspaceSheet {
	path: string;              // relative to root
	absolutePath: string;      // full path for loading
	annotations: Annotation[];
	status: "loaded" | "missing";
	imageUrl: string;          // blob URL or data URL
	width: number;
	height: number;
}

// --- State ---
export const sheets = ref<WorkspaceSheet[]>([]);
export const root = ref<string>("");
export const rootOverride = ref<string | null>(null);
export const spanFilePath = ref<string | null>(null); // null until first save
export const specFilePath = ref<string>("");

export const effectiveRoot = computed(() => rootOverride.value ?? root.value);
export const workspaceReady = computed(() => sheets.value.length > 0);

export const currentSheet = ref<WorkspaceSheet | null>(null);

// --- Root auto-detection ---
export function computeRoot(paths: string[]): string {
	if (paths.length === 0) return "";
	if (paths.length === 1) {
		const parts = paths[0].split("/");
		parts.pop(); // remove filename
		return parts.join("/");
	}
	const split = paths.map((p) => p.split("/"));
	const minLen = Math.min(...split.map((s) => s.length));
	let common = 0;
	for (let i = 0; i < minLen; i++) {
		if (split.every((s) => s[i] === split[0][i])) {
			common = i + 1;
		} else {
			break;
		}
	}
	return split[0].slice(0, common).join("/");
}

export function relativePath(absolutePath: string, rootPath: string): string {
	if (!rootPath) return absolutePath;
	const prefix = rootPath.endsWith("/") ? rootPath : rootPath + "/";
	if (absolutePath.startsWith(prefix)) {
		return absolutePath.slice(prefix.length);
	}
	return absolutePath;
}

// --- Actions ---
export function addSheet(sheet: WorkspaceSheet): void {
	// Dedupe by absolutePath
	if (sheets.value.some((s) => s.absolutePath === sheet.absolutePath)) return;
	sheets.value.push(sheet);
	updateRoot();
}

function updateRoot(): void {
	if (rootOverride.value) return;
	const paths = sheets.value.map((s) => s.absolutePath);
	root.value = computeRoot(paths);
	// Update relative paths
	for (const sheet of sheets.value) {
		sheet.path = relativePath(sheet.absolutePath, effectiveRoot.value);
	}
}

export function removeSheet(path: string): void {
	sheets.value = sheets.value.filter((s) => s.path !== path);
	if (currentSheet.value?.path === path) {
		currentSheet.value = sheets.value[0] ?? null;
	}
	updateRoot();
}

export function openSheetByPath(path: string): void {
	const sheet = sheets.value.find((s) => s.path === path);
	if (sheet) currentSheet.value = sheet;
}

export function resetWorkspace(): void {
	sheets.value = [];
	root.value = "";
	rootOverride.value = null;
	spanFilePath.value = null;
	specFilePath.value = "";
	currentSheet.value = null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/workspace.ts
git commit -m "add workspace module with sheet management and root detection"
```

---

## Task 3: Persistence Module

**Files:**
- Create: `src/mainview/src/persistence.ts`
- Create: `src/mainview/src/persistence.test.ts`

- [ ] **Step 1: Write persistence tests**

Test cases:
- Serialize workspace to `.span` JSON format → correct structure
- Deserialize `.span` JSON → workspace state restored
- `_stash` fields preserved through round-trip
- Version check rejects version > 1
- Empty workspace serializes correctly
- Spec path stored relative to `.span` file directory when possible

- [ ] **Step 2: Implement persistence**

```typescript
// src/mainview/src/persistence.ts
import type { Annotation } from "./annotation";
import type { WorkspaceSheet } from "./workspace";

export interface SpanFile {
	version: number;
	spec: string;
	root: string;
	sheets: SpanFileSheet[];
}

export interface SpanFileSheet {
	path: string;
	annotations: Annotation[];
}

export function serializeWorkspace(
	sheets: WorkspaceSheet[],
	specPath: string,
	root: string,
	spanFileDir?: string,
): string {
	// Make spec path relative to .span file directory if possible
	let relativeSpecPath = specPath;
	if (spanFileDir) {
		const prefix = spanFileDir.endsWith("/") ? spanFileDir : spanFileDir + "/";
		if (specPath.startsWith(prefix)) {
			relativeSpecPath = specPath.slice(prefix.length);
		}
	}

	const data: SpanFile = {
		version: 1,
		spec: relativeSpecPath,
		root,
		sheets: sheets.map((s) => ({
			path: s.path,
			annotations: s.annotations.map((a) => ({
				id: a.id,
				entityType: a.entityType,
				shapeData: { ...a.shapeData },
				propertyData: { ...a.propertyData },
				...(a._stash && Object.keys(a._stash).length > 0
					? { _stash: { ...a._stash } }
					: {}),
			})),
		})),
	};

	return JSON.stringify(data, null, 2) + "\n";
}

export function deserializeWorkspace(raw: string): SpanFile {
	const data = JSON.parse(raw);

	if (typeof data.version !== "number") {
		throw new Error("Invalid .span file: missing version");
	}
	if (data.version > 1) {
		throw new Error(
			`Unsupported .span file version: ${data.version}. This version of Span supports version 1.`,
		);
	}

	return {
		version: data.version,
		spec: data.spec ?? "",
		root: data.root ?? "",
		sheets: (data.sheets ?? []).map((s: any) => ({
			path: s.path ?? "",
			annotations: (s.annotations ?? []).map((a: any) => ({
				id: a.id ?? "",
				entityType: a.entityType ?? "",
				shapeData: a.shapeData ?? {},
				propertyData: a.propertyData ?? {},
				...(a._stash ? { _stash: a._stash } : {}),
			})),
		})),
	};
}

// --- Autosave debouncing ---
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(fn: () => void, delay: number = 500): void {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(fn, delay);
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `bun test src/mainview/src/persistence.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/persistence.ts src/mainview/src/persistence.test.ts
git commit -m "add .span file persistence with serialization and autosave"
```

---

## Task 4: Update Platform Adapter Interface

**Files:**
- Modify: `src/mainview/src/platform/types.ts`
- Modify: `src/mainview/src/platform/adapter.ts`

- [ ] **Step 1: Rewrite PlatformAdapter interface**

Replace `src/mainview/src/platform/types.ts`:

```typescript
import type { Ref } from "vue";

export interface FileFilter {
	name: string;
	extensions: string[];
}

export interface PlatformAdapter {
	// File dialogs
	showSaveDialog(defaultName: string, filters: FileFilter[]): Promise<string | null>;
	showOpenDialog(filters: FileFilter[]): Promise<string | null>;

	// File I/O
	readFile(path: string): Promise<string>;
	writeFile(path: string, contents: string): Promise<{ ok: boolean }>;
	readImageAsDataUrl(path: string): Promise<string>;

	// OS integration
	revealFile(path: string): Promise<void>;

	// Layout persistence
	saveLayout(layout: object): Promise<{ ok: boolean }>;
	loadLayout(): Promise<object | null>;

	// Capabilities
	canSave: Ref<boolean>;
}
```

- [ ] **Step 2: Update adapter.ts**

Remove `projectPath`, `projectOpen` exports. Update the `api` proxy to match the new interface. Keep `platform`, `setAdapter`, `getRawAdapter`, layout handler slots.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/platform/types.ts src/mainview/src/platform/adapter.ts
git commit -m "update PlatformAdapter interface for workspace file I/O"
```

---

## Task 5: Update RPC Schema and Desktop Backend

**Files:**
- Modify: `src/shared/rpc-schema.ts`
- Modify: `src/bun/index.ts`
- Delete: `src/bun/project.ts`

- [ ] **Step 1: Rewrite RPC schema**

Replace `src/shared/rpc-schema.ts` — remove old `Annotation`/`Sheet`/`SheetWithAnnotations` types, remove old project RPCs, add file I/O RPCs. Keep webview RPCs and layout RPCs. Remove `projectLoaded` message.

- [ ] **Step 2: Update bun/index.ts**

Replace the old RPC handlers with new ones:
- `showSaveDialog` — use Electrobun's native save dialog
- `showOpenDialog` — use Electrobun's native open dialog
- `readFile` — `Bun.file(path).text()`
- `writeFile` — `Bun.write(path, contents)`
- `readImageAsDataUrl` — read file as buffer, convert to base64 data URL
- `revealFile` — use Electrobun's reveal-in-finder API
- Keep `saveLayout`/`loadLayout` as-is

Remove `Project` import and all project-related code. Remove the `--project` CLI arg handling. Remove the `projectLoaded` message.

- [ ] **Step 3: Delete project.ts**

```bash
rm src/bun/project.ts
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "update RPC schema and backend for workspace file I/O"
```

---

## Task 6: Update ElectrobunAdapter

**Files:**
- Modify: `src/mainview/src/platform/electrobun.ts`

- [ ] **Step 1: Update to match new PlatformAdapter**

Replace old project RPC calls with new file I/O calls. The adapter now proxies `showSaveDialog`, `showOpenDialog`, `readFile`, `writeFile`, `readImageAsDataUrl`, `revealFile` through Electrobun RPC. Remove `projectLoaded` message handler. Remove `projectPath` import from adapter.

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/platform/electrobun.ts
git commit -m "update ElectrobunAdapter for workspace file I/O"
```

---

## Task 7: Update WebAdapter

**Files:**
- Modify: `src/mainview/src/platform/web.ts`

- [ ] **Step 1: Rewrite WebAdapter**

Remove all project directory methods (`getProjectAnnotations`, `saveAnnotations`, `getSheetImage`, `pickProjectDirectory`, `setFallbackFiles`, `openWithHandle`). The `WebPlatformAdapter` extension interface is simplified.

Implement new methods:
- `showSaveDialog` — not available on web, return null (use download instead)
- `showOpenDialog` — use `<input type="file">` programmatically
- `readFile` — read from a stored File object (for dropped/selected files)
- `writeFile` — trigger download
- `readImageAsDataUrl` — read from stored File object as data URL
- `revealFile` — no-op

Add localStorage workspace persistence:
- `saveWorkspaceToLocalStorage(data: string)` — store under `span-workspace` key
- `loadWorkspaceFromLocalStorage()` — read from key
- `clearWorkspaceFromLocalStorage()`

The web adapter maintains a `Map<string, File>` of dropped files for `readFile`/`readImageAsDataUrl` to reference.

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/platform/web.ts
git commit -m "rewrite WebAdapter for workspace file I/O and localStorage"
```

---

## Task 8: Rewrite state.ts

**Files:**
- Modify: `src/mainview/src/state.ts`

- [ ] **Step 1: Rewrite state.ts for workspace model**

Key changes:
- Remove `projectSheets`, `sheets` (computed), old `loadProjectData`, old `openSheet`, old `saveCurrentAnnotations`
- Import and re-export workspace state (`sheets`, `currentSheet`, `workspaceReady`, etc. from workspace.ts)
- `annotations` is now derived from `currentSheet.value?.annotations`
- Wire autosave: on any `markDirty(true)`, call `debouncedSave` which serializes workspace and writes via platform adapter (desktop) or localStorage (web)
- Add `loadSpec(raw: string, format: "json" | "yaml")` function
- Add `exportWorkspace()` function that builds export data and writes via adapter
- `addAnnotation` pushes to `currentSheet.value.annotations`
- `selectAnnotation`, `deleteSelected`, `duplicateSelected`, `updateShapeData`, `updatePropertyData` operate on `currentSheet.value.annotations`
- Keep `zoom`, `dirty`, `statusText`, `imageWidth`, `imageHeight`, `currentSheetImageSrc`, viewport center registration

- [ ] **Step 2: Run all tests**

Run: `bun test`

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/state.ts
git commit -m "rewrite state.ts for workspace-driven data flow"
```

---

## Task 9: Update types.ts

**Files:**
- Modify: `src/mainview/src/types.ts`

- [ ] **Step 1: Remove Sheet types**

Remove `Sheet` and `SheetWithAnnotations` (replaced by `WorkspaceSheet` from workspace.ts). Keep `makeId` and the `Annotation` re-export.

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/types.ts
git commit -m "remove old Sheet types from types.ts"
```

---

## Task 10: Update SheetSidebar

**Files:**
- Modify: `src/mainview/src/components/SheetSidebar.vue`

- [ ] **Step 1: Rewrite SheetSidebar**

Key changes:
- Import `sheets`, `currentSheet`, `openSheetByPath`, `removeSheet` from workspace
- Replace `sheets` computed (from old state) with workspace `sheets`
- "Refresh all sheets" → "Add images" (opens file picker or triggers drag-and-drop)
- Add drag-and-drop handler on the sidebar panel for adding images
- Show missing file indicator (dimmed, warning icon) for sheets with `status === "missing"`
- Context menu: "Open", "Remove from workspace" (with confirmation if annotations exist), "Reveal in Finder" (desktop only, uses `revealFile`)
- Remove old `handleRefresh` / `loadProjectData` calls

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/SheetSidebar.vue
git commit -m "update SheetSidebar for workspace image management"
```

---

## Task 11: Update App.vue

**Files:**
- Modify: `src/mainview/src/App.vue`

- [ ] **Step 1: Update App.vue**

Key changes:
- Replace `projectOpen` with `workspaceReady` from workspace
- Landing screen drop zone handles three file types:
  - Image files → `addImages` to workspace
  - `.yaml`/`.yml`/`.json` → try `parseSpec`, set `activeSpec`
  - `.span` → deserialize and restore workspace
- Add Cmd+E / Ctrl+E shortcut for export
- Remove old project-loading flow from `onMounted`
- On web, restore from localStorage on mount
- Global drag-and-drop (not just landing screen) — images can be dropped anytime

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/App.vue
git commit -m "update App.vue for workspace drop zone and export shortcut"
```

---

## Task 12: Update main.ts and main-web.ts

**Files:**
- Modify: `src/mainview/main.ts`
- Modify: `src/mainview/main-web.ts`

- [ ] **Step 1: Update main.ts**

- Remove `projectOpen.value = true` (no longer exists)
- Update imports for removed/renamed functions
- Keep desktop menu handler wiring

- [ ] **Step 2: Update main-web.ts**

- Remove `projectOpen` import
- Add localStorage workspace restore on page load
- Keep `beforeunload` handler

- [ ] **Step 3: Commit**

```bash
git add src/mainview/main.ts src/mainview/main-web.ts
git commit -m "update entry points for workspace model"
```

---

## Task 13: Final Verification

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass (spec engine + annotation + export + persistence)

- [ ] **Step 2: Verify web build**

Run: `bun run build:web`
Expected: Build succeeds

- [ ] **Step 3: Verify desktop build**

Run: `bun run start`
Expected: App boots without errors (no project loaded — shows landing screen)

- [ ] **Step 4: Commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
