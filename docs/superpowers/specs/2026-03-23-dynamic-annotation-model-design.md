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
  shapeData: Record<string, number>;   // user-named shape fields → values
  propertyData: Record<string, unknown>; // user-named properties → values
}
```

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

### Changing Entity Type

When the user changes an annotation's entity type via the Inspector dropdown:

1. **Shape data** — reset to defaults (different geometry type means old shape data is meaningless)
2. **Property data** — migrated:
   - Properties that exist in both old and new type keep their values
   - Properties only in the old type are stashed in a `_stash: Record<string, unknown>` field on the annotation for potential undo
   - Properties only in the new type get defaults
3. If the new shape type differs from the old, the canvas representation changes (e.g., rect → point drops the rectangle and places a pin)

### Canvas Geometry

The canvas uses `ShapeMapping` to translate between user-named fields and geometry roles:

- For a rect with mapping `{ x: "left", y: "top", width: "right", height: "bottom" }`, the canvas reads `shapeData.left` for x position, etc.
- LTRB model rects are converted to XYWH internally for rendering: `width = right - left`, `height = bottom - top`
- Export writes back the user's original field names and values

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
| `src/mainview/src/components/GalleryPanel.vue` | Adapt frame/preview logic to use spec-driven fields instead of hardcoded `.frame`, `.name`, etc. |

### Not touched (deferred to sub-project 3)

- File loading, saving, export — still uses current format for now
- Landing screen / workspace changes
- `.span` working file format

### Migration Strategy

The old `Annotation` type is replaced wholesale. No backwards compatibility layer. The app won't load old annotation files until sub-project 3 implements the new workspace/IO. Sub-projects 2 and 3 ship together.
