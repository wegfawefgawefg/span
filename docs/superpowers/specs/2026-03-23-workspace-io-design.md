# Workspace + I/O

**Date:** 2026-03-23
**Status:** Approved
**Sub-project:** 3 of 3 (Spec Engine → Dynamic Annotation Model + Inspector → Workspace + I/O)

## Summary

Replace the project-directory-based file loading model with a drag-and-drop workspace. Users drop images and a spec file into the app, annotate, and export a single spec-conforming output file. Session state is persisted in a `.span` working file (desktop) or localStorage (web).

## Dependencies

- Sub-project 1 (Spec Engine) — `parseSpec`, `diffSpecs`, `SpanSpec`
- Sub-project 2 (Dynamic Annotation Model) — `Annotation`, `createAnnotation`, annotation helpers

## `.span` Working File Format

```json
{
  "version": 1,
  "spec": "/absolute/path/to/spec.yaml",
  "root": "/common/ancestor/of/images",
  "sheets": [
    {
      "path": "relative/to/root/hero.png",
      "annotations": [
        {
          "id": "abc-123",
          "entityType": "Sprite",
          "shapeData": { "x": 32, "y": 16, "width": 16, "height": 16 },
          "propertyData": { "name": "idle", "frame": 0, "direction": "down" }
        }
      ]
    }
  ]
}
```

- Format is always JSON (internal format, not governed by spec)
- `spec` is a path relative to the `.span` file's directory (desktop) or filename (web). Falls back to absolute path if the spec is outside the `.span` file's directory tree.
- `root` is the auto-detected common ancestor of all image paths, overridable by user
- `sheets[].path` is relative to `root`
- `version: 1` for future format evolution. Reject with an error if version > 1.
- `_stash` fields on annotations are preserved in the `.span` file but excluded from export

### Web Persistence

On web, `.span` contents are stored in localStorage under a fixed key `span-workspace` (single workspace — only the latest is kept). On page load, if a workspace exists in localStorage, auto-restore it. Images must be re-loaded via drag-and-drop since browsers can't persist file handles across sessions. Multi-tab behavior is not supported — last write wins.

## Export Output Format

The export produces a single file conforming to the spec. Format matches the spec format (YAML spec → YAML export, JSON spec → JSON export).

```yaml
sheets:
  - file: "relative/to/root/hero.png"
    Sprite:
      - { name: "idle", x: 32, y: 16, width: 16, height: 16, frame: 0, direction: "down" }
    Waypoint:
      - { name: "spawn", x: 128, y: 64, order: 1 }
  - file: "terrain/tileset.png"
    Tile:
      - { name: "grass", x: 0, y: 0, width: 16, height: 16, solid: false }
```

### YAML Export Configuration

YAML export uses `YAML.stringify()` with flow-level 3 (inline objects for annotation entries, block sequences for the top-level lists). This produces the compact format shown in the example above. JSON export uses `JSON.stringify(data, null, 2)`.

### `string[]` Property Serialization

Array properties are serialized as native arrays in the output: `tags: ["idle", "player"]` in JSON, inline `[idle, player]` in YAML.

### Export Rules

- Annotations grouped by entity type within each sheet
- Shape data and property data flattened into a single object per annotation
- Field order: shape fields first (in spec order), then property fields (in spec order)
- `id` and `_stash` excluded from export
- Annotations whose entity type is missing from the spec are excluded
- File paths relative to `root`
- Sheets with no annotations are excluded from export

## Image Loading & Workspace

### Drag-and-Drop

- User can drop files, multiple files, or folders onto the app at any time
- The app scans for image files (PNG, JPG, GIF, WebP)
- Duplicate files (same path) are ignored
- Dropping more files/folders adds to the workspace, never replaces
- The landing screen serves as the initial drop zone; once images are loaded, the workspace is shown
- Images can also be added via a file picker menu action

### Spec Loading

- Spec file can be dropped onto the app (detected by `.yaml`/`.yml`/`.json` extension + valid spec structure) or loaded via menu
- When a spec is loaded, `activeSpec` is set, tool palette populates, annotation begins
- Loading a new spec mid-session runs `diffSpecs` and warns if destructive changes detected
- If a `.json`/`.yaml`/`.yml` file is dropped and fails to parse as a valid spec, show an error notification ("Invalid spec file") — do not silently ignore it
- Dropping a `.span` file opens/restores that workspace. If a workspace is already active, confirm before replacing.
- On web, dropping a `.span` file also works (imports it)

### Root Auto-Detection

- When images are added, compute the longest common directory prefix of all absolute image paths
- If user overrides root, the override is stored in the `.span` file
- On web (no real paths), root is empty and paths are just filenames

### Missing Files on Restore

- If spec file is missing on session restore, warn and let user pick a new one
- If image files are missing, show them in the sidebar with a "missing" indicator (dimmed, with a warning icon). Annotations are preserved.
- On web, images always show as "missing" on restore and need re-loading

## Session Persistence

### Desktop — First Save

- On the first change that triggers autosave, if no `.span` file location is set, prompt with a save dialog
- Subsequent autosaves write to the same location (debounced, 500ms after last edit)
- "Save As" menu option lets the user pick a new location

### Desktop — Session Restore

- User opens a `.span` file via menu, CLI argument, or drag-and-drop
- App reads the file, loads spec from referenced path, loads images relative to root
- Missing files handled as described above

### Web — Persistence

- Autosave to localStorage (debounced)
- User can "Download .span" to get the file
- On page load, restore from localStorage if available
- Images need re-loading (drag-and-drop)

### Export

- Explicit action: menu item or keyboard shortcut (Cmd+E / Ctrl+E)
- On desktop: save dialog to pick export location and filename
- On web: triggers browser download
- Format matches spec format (YAML/JSON)

## In-Memory Workspace Sheet Type

```typescript
interface WorkspaceSheet {
  path: string;              // relative to root
  absolutePath: string;      // resolved, for loading
  annotations: Annotation[];
  status: "loaded" | "missing";
  imageUrl: string;          // blob URL or data URL, empty if missing
  width: number;
  height: number;
}
```

This replaces the old `Sheet`/`SheetWithAnnotations` types from `types.ts`. Components consume `WorkspaceSheet[]` from workspace state instead of the old `projectSheets`.

### Removing a Sheet

Context menu on a sheet in the sidebar offers "Remove from workspace". Annotations on that sheet are discarded (with confirmation if any exist). This is a workspace action, not a file delete.

## UI State Replacement

- `projectOpen` (from adapter.ts) → replaced by a computed `workspaceReady` that checks if at least one sheet is loaded OR a spec is loaded
- `projectPath` (from adapter.ts) → replaced by workspace's `root` ref
- `revealSheet` stays in the platform adapter — it now reveals the sheet's `absolutePath` in the OS file manager. Hidden on web as before.

## RPC Schema Changes (Desktop)

The shared RPC schema at `src/shared/rpc-schema.ts` must be updated:

**Remove:**
- `getProjectAnnotations` — no longer loading from project directory
- `saveAnnotations` — replaced by `.span` file persistence
- `getSheetImage` — images loaded directly by the webview via file paths
- `pickProjectDirectory` — no project directory concept
- `projectLoaded` message — no project to load

**Add:**
- `showSaveDialog({ defaultName: string, filters: { name: string, extensions: string[] }[] })` → `string | null` — for picking `.span` save location and export location
- `showOpenDialog({ filters: ... })` → `string | null` — for opening `.span` files and spec files
- `readFile({ path: string })` → `string` — read a file's contents (for loading `.span` and spec files)
- `writeFile({ path: string, contents: string })` → `{ ok: boolean }` — write file (for saving `.span` and export files)
- `readImageAsDataUrl({ path: string })` → `string` — read an image file as a data URL for display

**Keep:**
- `revealSheet` (renamed to `revealFile`)
- `canClose`, `addSprite`, `duplicateSprite`, `deleteSprite`, `triggerSave`, `resetLayout`, `addPanel` — webview-bound handlers
- `saveLayout`, `loadLayout` — layout persistence

The `src/bun/project.ts` file (desktop main process) is replaced with a simpler file I/O handler that implements the new RPCs.

## Module Structure

### New files

| File | Purpose |
|------|---------|
| `src/mainview/src/workspace.ts` | Workspace state: loaded images list, root path, `.span` file path. Functions: `addImages()`, `computeRoot()`, `removeSheet()` |
| `src/mainview/src/persistence.ts` | `.span` file read/write, localStorage persistence, autosave debouncing |
| `src/mainview/src/export.ts` | Export to spec-conforming output (JSON/YAML) |
| `src/mainview/src/export.test.ts` | Export tests |
| `src/mainview/src/persistence.test.ts` | `.span` serialization/deserialization tests |

### Modified files

| File | Changes |
|------|---------|
| `src/mainview/src/state.ts` | Remove `loadProjectData`/`openSheet`/`saveCurrentAnnotations`. Add workspace refs. Wire autosave via persistence module. |
| `src/mainview/src/components/SheetSidebar.vue` | Load sheets from workspace. "Add images" replaces "Refresh". Drag-and-drop on sidebar. Missing file indicators. |
| `src/mainview/src/App.vue` | Landing screen accepts image + spec drops. Wire "Export" action. Remove old project-loading flow. Add Cmd+E shortcut. |
| `src/mainview/src/platform/types.ts` | Update `PlatformAdapter` interface: remove `getProjectAnnotations`, `saveAnnotations`, `getSheetImage`, `pickProjectDirectory`. Add `showSaveDialog`, `showOpenDialog`, `readFile`, `writeFile`, `readImageAsDataUrl`. Rename `revealSheet` to `revealFile`. |
| `src/mainview/src/platform/adapter.ts` | Update `api` proxy to match new `PlatformAdapter` interface. Remove `projectPath`, `projectOpen` (replaced by workspace state). |
| `src/mainview/src/platform/web.ts` | Remove project directory methods. Add localStorage workspace persistence. |
| `src/mainview/src/platform/electrobun.ts` | Remove project directory RPC calls. Add save/open file dialog RPC. |
| `src/mainview/src/types.ts` | Remove `Sheet`, `SheetWithAnnotations` (replaced by workspace's `WorkspaceSheet`). |
| `src/shared/rpc-schema.ts` | Update RPC schema: remove old project methods, add file dialog and file I/O methods. |
| `src/bun/index.ts` | Update RPC handler registrations for new schema. |
| `src/bun/project.ts` | Replace with simple file I/O handlers (or delete and inline into index.ts). |

### Unchanged

- Spec engine (`src/mainview/src/spec/`)
- Annotation model (`src/mainview/src/annotation.ts`)
- DynamicInspector, ToolPalette, CanvasView, GalleryPanel (these consume annotations from state — data source change is transparent to them)
