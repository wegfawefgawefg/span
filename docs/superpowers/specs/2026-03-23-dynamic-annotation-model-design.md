# Dynamic Annotation Model + Inspector

**Date:** 2026-03-23
**Status:** Approved
**Sub-project:** 2 of 3 (Spec Engine → Dynamic Annotation Model + Inspector → Workspace + I/O)

## Summary

Replace the hardcoded annotation type and Inspector panel with a spec-driven dynamic model. Annotations store shape data and property data separately, the Inspector renders fields dynamically based on the entity type's spec definition, and a tool palette lets users create annotations of different entity types.

## Dependencies

- Sub-project 1 (Spec Engine) — `SpanSpec`, `EntityDef`, `ShapeDef`, `ShapeMapping`, `PropertyDef`, `defaultForProperty`, `defaultForShapeField`

## Annotation Data Model

Replace the hardcoded `Annotation` interface with:

```typescript
interface Annotation {
  id: string;
  entityType: string;                  // key into SpanSpec.entities
  shapeData: Record<string, number | PolygonVertices>; // user-named shape fields → values
  propertyData: Record<string, unknown>; // user-named properties → values
  _stash?: Record<string, unknown>;    // orphaned property data from entity type changes
}

type PolygonVertices = Array<Record<string, number>>; // e.g., [{ x: 0, y: 0 }, { x: 16, y: 0 }]
```

**Notes:**
- `shapeData` values are `number` for rect/point/circle fields, or `PolygonVertices` for the polygon points field.
- `_stash` preserves orphaned property values when switching entity types (for potential undo). Not included in export.

### Example

```typescript
// Sprite (rect shape)
{
  id: "abc-123",
  entityType: "Sprite",
  shapeData: { x: 32, y: 16, width: 16, height: 16 },
  propertyData: { name: "idle", frame: 0, direction: "down", tags: ["player"] }
}

// Waypoint (point shape)
{
  id: "def-456",
  entityType: "Waypoint",
  shapeData: { x: 128, y: 64 },
  propertyData: { name: "spawn_point", order: 1 }
}
```

### Creating Annotations

When creating a new annotation, populate initial values using `defaultForProperty` and `defaultForShapeField` from the spec engine. The entity type comes from the active tool in the tool palette.

**Default rect dimensions:** Rects default to 16x16 (not 0x0) placed at the interaction point. Points default to the click location. Circles default to radius 8. Polygons start with 0 vertices and the user adds them by clicking.

### Changing Entity Type

When the user changes an annotation's entity type via the Inspector dropdown:

1. **Shape data** — reset to defaults (different geometry type means old shape data is meaningless)
2. **Property data** — migrated:
   - Properties that exist in both old and new type keep their values
   - Properties only in the old type are stashed in a `_stash: Record<string, unknown>` field on the annotation for potential undo
   - Properties only in the new type get defaults
3. If the new shape type differs from the old, the canvas representation changes (e.g., rect → point drops the rectangle and places a pin)

### Annotation Helpers

`annotation.ts` exports these functions:

- **`createAnnotation(spec, entityType, position)`** — creates an annotation with defaults. Rects get 16x16 at position, points get the position, circles get position + radius 8.
- **`migrateEntityType(annotation, spec, newType)`** — changes entity type. Resets shape data, migrates properties (shared names keep values, removed → `_stash`, new → defaults).
- **`getShapeRect(annotation, spec)`** — returns `{ x, y, width, height }` for canvas rendering by reading `shapeData` through `ShapeMapping`. Handles LTRB conversion. Returns null for non-rect shapes.
- **`getShapePosition(annotation, spec)`** — returns `{ x, y }` for any shape type (reads the x/y roles from the mapping).
- **`updateShapeFromDrag(annotation, spec, drag)`** — writes canvas drag deltas back into `shapeData` through the mapping.

### Canvas Geometry

The canvas uses `ShapeMapping` to translate between user-named fields and geometry roles:

- For a rect with mapping `{ x: "left", y: "top", width: "right", height: "bottom" }`, the canvas reads `shapeData.left` for x position, etc.
- **LTRB detection:** if a rect mapping's `width` field name matches an x-role alias (`right`) and `height` matches a y-role alias (`bottom`), it is treated as LTRB. The `getShapeRect` helper computes `width = right - left`, `height = bottom - top` for rendering, and `updateShapeFromDrag` writes back LTRB values on resize.
- Export writes back the user's original field names and values

### Canvas Rendering Per Shape

- **rect** — colored box with border, resize handle at bottom-right, label above (existing behavior)
- **point** — crosshair marker (8px) with label. No resize handles.
- **circle** — stroked circle outline with a radius handle at the 3 o'clock position. Label at center.
- **polygon** — stroked polygon outline connecting vertices. Each vertex has a small drag handle. Label at centroid.

All shapes share the same selection highlight style (copper glow).

### Canvas Selection and Drag Behavior

- **rect** — click to select, drag to move, drag resize handle to resize (existing)
- **point** — click to select, drag to move. No resize.
- **circle** — click inside to select, drag to move. Drag radius handle to resize radius.
- **polygon** — click inside to select, drag to move all vertices. Drag individual vertex handles to reshape. Double-click an edge to insert a new vertex.

**Minimum polygon vertices:** 3. A polygon with fewer than 3 vertices is incomplete and renders as a polyline (open path) until closed.

### State Update API

Replace `updateSelectedAnnotation(patch: Partial<Annotation>)` with two focused functions:

- **`updateShapeData(patch: Record<string, number>)`** — merges into `shapeData`, triggers canvas redraw
- **`updatePropertyData(patch: Record<string, unknown>)`** — merges into `propertyData`

Both functions mark dirty and sync to project state.

### Duplication

`duplicateSelected()` copies all `shapeData` and `propertyData`. The shape position is offset by 4px (via the mapping's x/y roles). No hardcoded field assumptions.

### Clamping

`clampAnnotationToImage()` reads shape position/dimensions through the mapping and clamps values to image bounds. Only applies to rect and circle shapes. Points are clamped to image bounds. Polygons clamp each vertex individually.

### Color Picker

The `chroma_key` feature is removed from the hardcoded UI. If a spec defines a `chroma_key` string property, it renders as a regular text input. The color-sampling canvas mode is deferred — it can be re-added as an optional feature driven by a property annotation (e.g., `chroma_key: { type: string, widget: color }`) in a future iteration.

## Dynamic Inspector

The Inspector panel renders three sections based on the selected annotation's entity type definition.

### Layout

1. **Entity type dropdown** — at the top. Lists all entity types from the spec. Changing type triggers the migration described above.
2. **Shape fields** — rendered in a 2-column grid below the type dropdown. Section header shows "Shape — {type}" (e.g., "Shape — rect"). Labels use the user's field names from the spec. All inputs are numeric.
3. **Property fields** — rendered below shape fields. Section header shows "Properties". Input type is driven by property type:
   - `string` → `<input type="text">`
   - `integer` / `number` → `<input type="number">`
   - `boolean` → `<input type="checkbox">`
   - `enum` → `<select>` with the spec's enum values as options
   - `string[]` → `<input type="text">` with comma-separated values (split/join on read/write)

### No Spec Loaded

If no spec is loaded, the Inspector shows a message: "Load a spec file to begin annotating."

## Tool Palette

A vertical toolbar on the left side of the canvas panel. One tool button per entity type defined in the spec.

### Behavior

- Each button shows the entity type name and a shape icon (rect, point, circle, polygon)
- Clicking a tool selects it as the active drawing tool
- The active tool determines what annotation type is created on canvas interaction
- The palette updates when the spec changes (entity types added/removed)
- If no spec is loaded, the palette is empty/disabled
- The first entity type is selected by default when a spec is loaded
- If the active tool's entity type is removed during a spec change, the tool switches to the first available entity type
- Annotations whose entity type was removed from the spec are displayed with a warning badge in the annotation list and are not exported. They can be reassigned to a valid type via the Inspector dropdown.

### Canvas Interaction Per Shape

- **rect** — click-drag to draw rectangle (existing behavior, reused)
- **point** — click to place (no drag needed)
- **circle** — click-drag from center outward to set radius
- **polygon** — click to place vertices, double-click to close path

## Module Structure

### New files

| File | Purpose |
|------|---------|
| `src/mainview/src/annotation.ts` | `Annotation` interface, `createAnnotation()`, `migrateEntityType()`, `annotationShapeToRect()` helpers |
| `src/mainview/src/components/ToolPalette.vue` | Entity type tool selector (vertical bar, left of canvas) |
| `src/mainview/src/components/DynamicInspector.vue` | Spec-driven field renderer (replaces Inspector.vue internals) |

### Modified files

| File | Changes |
|------|---------|
| `src/mainview/src/types.ts` | Remove old `Annotation` interface, remove `normalizeAnnotation` (replaced by `annotation.ts`) |
| `src/mainview/src/state.ts` | Add `activeSpec` ref, `activeTool` ref. Update annotation CRUD to use new `Annotation` type. Update `addAnnotation` to use active tool's entity type. |
| `src/mainview/src/components/Inspector.vue` | Replace hardcoded fields with `<DynamicInspector>` component |
| `src/mainview/src/components/CanvasView.vue` | Use `ShapeMapping` to position annotations. Add point/circle/polygon drawing. Add `ToolPalette` to the left side. |
| `src/mainview/src/components/AnnotationList.vue` | Display entity type badge. Use first string property as display name (instead of hardcoded `.name`). |
| `src/mainview/src/components/GalleryPanel.vue` | Only show rect-based entities in gallery (point/circle/polygon have no meaningful crop preview). Use first string property as display name, look for an integer property named `frame` (or first integer property) for animation grouping. |

### Not touched (deferred to sub-project 3)

- File loading, saving, export — still uses current format for now
- Landing screen / workspace changes
- `.span` working file format

### Migration Strategy

The old `Annotation` type is replaced wholesale. No backwards compatibility layer. The app won't load old annotation files until sub-project 3 implements the new workspace/IO. Sub-projects 2 and 3 ship together.
