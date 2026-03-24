# Select Tool & Drawing Improvements

## Problem

The canvas currently has no select-only mode — every click on empty canvas creates a new annotation, leading to frequent accidental creation. The draw interaction for rects/circles also feels bad: annotations are created immediately at mousedown with zero size, so quick clicks produce tiny/invisible sprites. There is no visual feedback during the draw drag. Additionally, the app requires a spec file before the panel layout is shown, but it should start with panels visible and gate editing behind spec presence.

## Design

### 1. Select Tool

A dedicated select mode is added as the default tool.

**Behavior:**
- `activeTool === ""` (empty string) represents select mode
- `activeTool` defaults to `""` on app start — loading a spec does NOT auto-switch to an entity tool (the existing `activeTool.value = result.entities[0].label` in `loadSpec()` must be removed)
- In select mode:
  - Click on empty canvas: sets `selectedId` to `null` (deselects). This requires a new code path in `handleLayerPointerDown` — when `activeTool === ""`, call `selectAnnotation(null)` and return early instead of the existing early-return that checks `!activeTool.value`.
  - Click/drag on existing annotations: selects and moves (same as current behavior)
- In entity draw mode:
  - Click on an existing annotation: selects it (does NOT create a new one on top)
  - Click/drag on empty canvas: initiates drawing (see below)

**ToolPalette changes:**
- Select tool button appears first in the palette, always visible, with a cursor/pointer icon
- Entity tool buttons only appear when a spec is loaded (`activeSpec !== null`)
- Select button uses the same `.active` styling when `activeTool === ""`

### 2. Drawing Improvements

Drawing is refactored from immediate-creation to deferred-creation with live preview.

**Flow for rects and circles:**
1. **Mousedown on empty canvas** (in entity draw mode): Record origin point `(x, y)`, enter "drawing" state. No annotation is created yet.
2. **Pointermove while drawing**: Render a ghost preview overlay — dashed border, semi-transparent, showing the shape from origin to current pointer position. For rects: the preview computes `x = min(originX, currentX)`, `y = min(originY, currentY)`, `width = abs(currentX - originX)`, `height = abs(currentY - originY)` to handle drags in any direction. For circles: origin is center, distance to pointer sets radius.
3. **Mouseup**: Compute final dimensions using the same min/abs logic. If the drawn size exceeds the minimum threshold (4 image-space pixels for rect width or height, 4 image-space pixels for circle radius), create the annotation with the drawn dimensions and select it. If below threshold, discard — no annotation created. The annotation's position is set to the computed top-left (not necessarily the origin point).

**Points:** Unchanged — single click on empty canvas in point-entity draw mode creates a point annotation at that location (points have no size to drag).

**Polygons:** Polygon entities in draw mode are a no-op — no preview, no creation. (Polygon drawing is not implemented in this iteration.)

**Minimum threshold:** 4 image-space pixels (independent of zoom level).

**Cursors:** In select mode, the canvas uses the default pointer cursor. In entity draw mode, the canvas shows a crosshair cursor to indicate draw-readiness. Panning cursors (grab/grabbing) override these as they do currently.

### 3. App Startup & Spec Gating

The app starts with the full panel layout visible but no spec loaded.

**Changes:**
- Remove the `v-if="workspaceReady"` gate on the Dockview container in `App.vue` so the panel layout is always shown. `workspaceReady` (currently a computed: `sheets.value.length > 0`) can remain as-is for other uses but no longer gates the UI. The `LandingScreen` component is removed — file drops are handled by the existing global drag-and-drop handlers already on `App.vue`.
- Without a spec loaded:
  - ToolPalette shows only the select tool (no entity buttons)
  - Drawing is disabled (no `activeTool` to draw with)
  - No annotations can be created via any method
- Status bar shows a right-aligned "No spec file" message when `activeSpec === null`
- Once a spec is loaded (via file drop), entity tools appear and drawing becomes available

### 4. Status Bar

- When no spec is loaded: right-aligned "No spec file" text in the status bar (error/warning styling)
- When a spec is loaded: existing behavior (shows current sheet name, save state, etc.)

## Implementation

### Files Changed

| File | Change |
|------|--------|
| `src/mainview/src/components/ToolPalette.vue` | Add select button at top with cursor icon; conditionally show entity tools only when `activeSpec` is set |
| `src/mainview/src/state.ts` | Default `activeTool` to `""`; remove auto-select of first entity on spec load; make `workspaceReady` start as `true` |
| `src/mainview/src/App.vue` | Update status bar to show right-aligned "No spec file" when `activeSpec` is null; remove or restructure landing screen gate |
| `src/mainview/src/components/CanvasView.vue` | Refactor `handleLayerPointerDown/Move/Up` for deferred creation with preview ghost; add hit-test check so clicking existing annotations in draw mode selects instead of creating; add preview overlay element in template |
| `src/mainview/src/components/LandingScreen.vue` | May be removed or repurposed as a drop-zone overlay rather than a full-screen gate |

### Files NOT Changed

| File | Reason |
|------|--------|
| `src/mainview/src/composables/useCanvas.ts` | Only handles drags on existing annotations — unaffected |
| `src/mainview/src/spec/*` | No spec format changes |
| `src/mainview/src/annotation.ts` | No annotation model changes |

### Drawing State

New local reactive state in `CanvasView.vue`:

```ts
interface DrawingState {
  originX: number;       // image-space X where mousedown occurred
  originY: number;       // image-space Y
  currentX: number;      // image-space X of current pointer
  currentY: number;      // image-space Y of current pointer
  entityType: string;    // activeTool value at draw start
  shapeType: "rect" | "circle";  // primary shape type being drawn
}

const drawing = ref<DrawingState | null>(null);
```

Points don't use this — they create immediately on click.

### Preview Rendering

A `<div>` element in the annotation layer, visible only when `drawing !== null`:

- For rects: positioned at `(originX, originY)`, sized to `(currentX - originX, currentY - originY)` (with absolute value handling for negative drags)
- For circles: centered at `(originX, originY)`, radius = distance from origin to current pointer
- Styled: dashed border matching the entity's shape color, semi-transparent fill, no pointer events

### Hit Testing for Annotation Selection in Draw Mode

In `handleLayerPointerDown`, before initiating a draw:

- The pointer event target is checked — if it's an annotation element (has an annotation ID), select that annotation instead of starting a draw
- This is naturally handled because annotation buttons have `stopPropagation` on their pointerdown — so `handleLayerPointerDown` only fires on empty canvas. No additional hit testing needed.

## Edge Cases

- **Drawing while panning:** Drawing does not start if `spaceHeld` or `isPanning` is true (existing guard)
- **Drawing canceled by escape:** Not implemented in this iteration — releasing the mouse below threshold achieves the same result
- **Zoom during draw:** Preview should use `zoom.value` for rendering, origin stays in image-space
- **No spec loaded + click on canvas:** No-op (no activeTool, no entity, guard returns early)
