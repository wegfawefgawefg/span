# File Decomposition: CanvasView.vue, state.ts, style.css

## Goal

Split three oversized files into smaller, single-responsibility modules without changing behavior. Direct imports (no barrel re-exports) for better tree-shaking.

## Execution Order

1. CanvasView.vue composables + CanvasToolbar component
2. state.ts domain modules
3. style.css split into styles/ directory

---

## 1. CanvasView.vue (2,278 lines -> ~600-700 lines)

CanvasView stays as the orchestrator: template, main pointer-event dispatcher, watchers, context menus, annotation style computations. All heavy logic moves to composables.

### New composables (in `composables/`)

| File | Responsibility | Key exports |
|------|---------------|-------------|
| `useCanvasPanning.ts` | Space+drag and MMB panning, viewport centering | `isPanning`, `spaceHeld`, `handleScrollerPointerDown/Move/Up`, `centerViewportOnStage`, `centerViewportOnImagePoint` |
| `useCanvasPaint.ts` | Pencil/eraser strokes, color sampling, palette rebuild | `paintStroke`, `stampPaintPixel`, `drawPaintLine`, `commitPaintStroke`, `rebuildPaintPalette`, `samplePixelAt` |
| `usePixelSelection.ts` | Marquee selection, floating selection, clipboard, nudge | `pixelSelectionDrag`, `pixelSelectionMove`, `copyToClipboard`, `cutToClipboard`, `paste`, `deletePixels`, `clearSelection`, `finalizeFloating` |
| `useAnnotationDrawing.ts` | Drawing new rect/point annotations, commit, hit-testing | `drawing`, `getPrimaryShapeKind`, `getAnnotationLabel`, `commitDrawing`, `annotationAtPoint` |
| `useSpriteMove.ts` | Multi-sprite selection and drag, atlas selection | `spriteMove`, `atlasMoveSelectionDrag`, `beginSpriteMove`, `updateSpriteMove`, `finalizeSpriteMove` |
| `useCanvasRendering.ts` | Checkerboard, display canvas rendering, grid lines | `renderDisplayCanvas`, `rebuildCheckerboardSource`, `drawGridLines` |

### New component

| File | Responsibility |
|------|---------------|
| `CanvasToolbar.vue` | Zoom controls, grid toggle, checker slider, paint palette swatches |

### Stays in CanvasView.vue

- Template (referencing child components + composable state)
- `handleLayerPointerDown/Move/Up` dispatcher (calls into composables based on active tool)
- Watchers for `currentSheet` and `currentSheetImageSrc` (orchestration)
- Context menu handlers
- Style computations for annotation positioning (`boxStyle`, `pointStyle`, etc.)

---

## 2. state.ts (1,742 lines -> ~500-600 lines)

### New modules (in `state/`)

| File | Responsibility | Key exports |
|------|---------------|-------------|
| `toolState.ts` | Tool selection, mode switching | `activeTool`, `activePaintTool`, `activeAtlasTool`, `setSelectTool`, `setEntityTool`, `setPaintTool`, `setAtlasTool` |
| `paletteState.ts` | Paint palette, project palettes, import/parse | `paintPalette`, `projectPalettes`, `activeProjectPaletteId`, `activeProjectPalette`, `availablePaintSwatches`, `setPaintPalette`, `setActiveProjectPalette`, `importPaletteFromPath` |
| `paintHistory.ts` | Undo/redo stacks, snapshot capture/apply | `recordPaintUndoSnapshot`, `undoPaintEdit`, `redoPaintEdit`, `applyPaintedSheetImage`, `savePendingImageEdits`, `hasUnsavedImageEdits` |
| `specState.ts` | Spec loading, validation, editor apply, file watching | `activeSpec`, `activeSpecRaw`, `specFilePath`, `loadSpec`, `applySpecFromEditor`, `forceApplySpec`, `importSpecFromPath` |
| `canvasPrefs.ts` | Per-sheet canvas preferences persistence | `loadCanvasPrefsForSheet`, `saveCanvasPrefsForSheet`, `getCurrentCanvasPrefs`, `applyCanvasPrefs` |
| `ioState.ts` | Import sheets, export workspace/spec, save/open | `importSheetFromPath`, `importSheetsFromPaths`, `exportWorkspace`, `exportSpec`, `saveWorkspace`, `saveWorkspaceAs`, `openWorkspace`, `loadWorkspaceFromPath` |

### Stays in state.ts

- Core refs: `selectedId`, `zoom`, `dirty`, `statusText`, `imageWidth`, `imageHeight`, `currentSheetImageSrc`, `canvasGrid*`, `canvasCheckerStrength`
- Annotation CRUD: `addAnnotation`, `deleteSelected`, `updateShapeData`, etc.
- `markDirty()`, `closeProject()`, preview shape helpers
- Re-exports from `workspace.ts`
- Cross-domain watchers

### Import updates

All consumers update from `import { x } from './state'` to import from the specific module, e.g. `import { activeTool } from './state/toolState'`.

---

## 3. style.css (1,232 lines -> ~15 lines of imports)

### New structure (`styles/` directory)

| File | Lines (approx) | Contents |
|------|----------------|----------|
| `styles/tokens.css` | ~35 | `@import "tailwindcss"`, `@theme` block, font-face declarations |
| `styles/base.css` | ~90 | Universal box-sizing, body, scrollbars, form resets |
| `styles/app-shell.css` | ~115 | `.app-shell`, `.app-modal-*`, dockview container |
| `styles/dockview.css` | ~70 | `.dv-theme-base` shared variables and utilities |
| `styles/themes/whisper.css` | ~70 | `.dv-theme-whisper` |
| `styles/themes/frost.css` | ~55 | `.dv-theme-frost` |
| `styles/themes/ember.css` | ~55 | `.dv-theme-ember` |
| `styles/themes/daylight.css` | ~55 | `.dv-theme-daylight` |
| `styles/themes/aseprite.css` | ~55 | `.dv-theme-aseprite` |
| `styles/themes/gamemaker.css` | ~55 | `.dv-theme-gamemaker` |
| `styles/canvas.css` | ~245 | Canvas shell, scroller, workspace, toolbar, rendering layers |
| `styles/annotations.css` | ~265 | Shape colors, annotation types, handles, previews, animations, reduced-motion |
| `styles/gallery.css` | ~45 | Gallery zoom slider, preview tiles |

### style.css becomes

```css
@import "./styles/tokens.css";
@import "./styles/base.css";
@import "./styles/app-shell.css";
@import "./styles/dockview.css";
@import "./styles/themes/whisper.css";
@import "./styles/themes/frost.css";
@import "./styles/themes/ember.css";
@import "./styles/themes/daylight.css";
@import "./styles/themes/aseprite.css";
@import "./styles/themes/gamemaker.css";
@import "./styles/canvas.css";
@import "./styles/annotations.css";
@import "./styles/gallery.css";
```

---

## Constraints

- Pure refactor: no behavior changes, no new features
- Direct imports everywhere (no barrel re-exports) for tree-shaking
- Each composable receives shared refs as parameters or imports from state modules
- Existing tests must pass unchanged (they test behavior, not file structure)
