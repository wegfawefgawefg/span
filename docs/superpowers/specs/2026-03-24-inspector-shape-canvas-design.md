# Inspector Shape Canvases & Canvas Filtering

## Problem

The main canvas currently renders all shapes for every annotation (slice, collision, origin), making it visually noisy. Secondary shapes like collision and origin are hard to edit precisely on the full spritesheet canvas because they're small and overlapping. There's no focused way to see and edit individual shapes relative to the sprite image they annotate.

## Design

### 1. Canvas View — Preview Shape Only

The main canvas filters rendered shapes so only the preview shape (as determined by `getPreviewShapeName()`) is shown per annotation. All other shapes are hidden from the main canvas.

**What changes:**
- `getShapesForAnnotation()` in CanvasView filters to only return the preview shape
- Selection, dragging, deferred drawing, labels, context menus — all unchanged, just operating on fewer visible shapes

**What doesn't change:**
- The annotation layer still renders all annotations
- Click-to-select, draw-to-create, panning, zooming — all the same

### 2. Inspector Mini-Canvases

Each shape section in DynamicInspector gets a `ShapeCanvas` component rendered between the section header and the number inputs (when the section is expanded).

**The mini-canvas shows:**
- **Background image:** The current sheet image cropped to the preview shape's absolute rect. This is the "master" sprite image that all shapes are annotated on.
- **Shape overlay:** The section's shape rendered on top — rect outline, point crosshair, or circle — using the same visual styling as the main canvas.

**For the preview shape itself (e.g., slice):**
- The canvas shows a padded region around the slice rect from the spritesheet, so the user can see context and adjust the slice bounds by dragging edges.
- Padding: ~8px of surrounding spritesheet context on each side.

**For referenced shapes (e.g., collision, origin):**
- The canvas shows the preview rect's cropped image as background.
- The shape is rendered at its relative offset position within the preview rect's coordinate space.

**For non-referenced secondary shapes:**
- Same as referenced — the preview rect image is the background, shape is overlaid at its position relative to the preview rect.

### 3. Mini-Canvas Interactions

The mini-canvas supports the same interactions as the main canvas:

- **Move:** Click-drag the shape to reposition. Updates the stored shape data (absolute coords for non-referenced, relative offsets for referenced shapes).
- **Resize (rects):** Drag the bottom-right resize handle to change width/height.
- **Radius (circles):** Drag the radius handle to change the circle radius.
- **No creation:** The mini-canvas doesn't support creating new annotations — it only edits the existing shape.
- **No panning/zooming:** The mini-canvas has a fixed viewport.

The drag math is the same as `useCanvas` — pointer delta divided by scale, applied to shape data, with the same clamping rules (unclamped for referenced shapes).

### 4. Mini-Canvas Coordinate Space

**Scale:** The mini-canvas renders at a fixed pixel scale. The canvas element width fills the inspector panel width. The scale is computed as `canvasElementWidth / previewRect.width`.

**For the preview shape (slice):**
- The viewport shows `previewRect` expanded by `padding` pixels on each side (in image space).
- The shape overlay is positioned relative to this padded viewport.
- Dragging adjusts the shape's absolute position in the spritesheet.

**For secondary shapes (collision, origin):**
- The viewport maps 1:1 to the preview shape's rect (no padding).
- The shape overlay position is the shape's resolved position minus the preview rect's position (so it appears at its visual position within the cropped image).
- For referenced shapes, the overlay position is simply the stored offset (since offsets are already relative to the reference).
- Dragging adjusts the stored offset directly.

### 5. New Component: `ShapeCanvas.vue`

**Props:**
- `annotation: Annotation` — the annotation being edited
- `spec: SpanSpec` — the current spec
- `shapeName: string` — which shape this canvas is for
- `sheetImageSrc: string` — the current sheet image (data URL / blob URL)
- `previewShapeName: string` — the preview shape name (for computing crop rect)
- `shapeColor: string` — CSS color for the shape overlay

**Behavior:**
- Computes the preview rect from `getShapeRect(annotation, spec, previewShapeName)`
- For the preview shape: adds padding to the crop region
- For other shapes: uses the preview rect as the crop region
- Renders the cropped image to a `<canvas>` element
- Overlays the shape using DOM elements (same approach as CanvasView — `<div>` elements with absolute positioning)
- Handles pointer events for move/resize/radius, calling `updateShapeData` to update values
- Re-renders when annotation data changes (via Vue reactivity)

**Implementation approach:** Use a `<canvas>` element for the background image (cropped spritesheet) and DOM overlay divs for the shape (same as main canvas). This avoids reimplementing shape rendering in canvas 2D and reuses the existing CSS styles.

## Files Changed

| File | Change |
|------|--------|
| `src/mainview/src/components/CanvasView.vue` | Filter `getShapesForAnnotation()` to only return the preview shape |
| `src/mainview/src/components/ShapeCanvas.vue` (new) | Mini-canvas component: cropped image background, shape overlay, drag interactions |
| `src/mainview/src/components/DynamicInspector.vue` | Import and render `ShapeCanvas` in each expanded shape section |

## Files NOT Changed

| File | Reason |
|------|--------|
| `src/mainview/src/composables/useCanvas.ts` | The drag composable is coupled to the main canvas's pointer capture and annotation lookup. ShapeCanvas implements its own simpler drag logic inline since it operates on a single known shape. |
| `src/mainview/src/annotation.ts` | No model changes |
| `src/mainview/src/state.ts` | `updateShapeData` already exists and works for any shape |
| `src/mainview/src/spec/*` | No spec changes |

## Edge Cases

- **No preview shape (entity has no rect shapes):** ShapeCanvas is not rendered. The number inputs remain as the only editing interface.
- **Preview shape has zero size:** ShapeCanvas shows nothing (or a minimum-size empty canvas).
- **Sheet image not loaded yet:** ShapeCanvas renders an empty canvas until the image is available.
- **Window resize:** The canvas scale recomputes based on available width.
- **Collapsed shape section:** ShapeCanvas is not rendered (already gated by `v-if="!collapsedShapes.has(shape.name)"`).
