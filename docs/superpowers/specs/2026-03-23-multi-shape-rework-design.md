# Multi-Shape Spec Rework

**Date:** 2026-03-23
**Status:** Approved

## Summary

Rework the spec format and annotation model to support multiple named shapes per entity type. The spec becomes an array of entity definitions where shapes and properties coexist as named fields distinguished by the `__shape` marker. The spec file *is* the output schema — export output mirrors the spec structure exactly.

## New Spec Format

### Structure

```yaml
---
__properties:          # optional — static key-value pairs hoisted to output top level
  path: assets
  version: 2
---
- label: Sprite        # display name in UI
  group: sprites       # top-level key in export output
  properties:          # flat map defining the output schema
    path: RelativePath  # special type — image file path (relative to workspace root)
    slice:              # shape (detected by __shape key)
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    collision:           # second shape on same entity
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    origin:              # third shape — different type
      __shape: point
      x: integer
      y: integer
    name: string         # scalar property
    frame: integer
    direction: { enum: [up, down, left, right] }
    variant: string
    tags: string[]
```

### Spec is an Array

The spec file is an array of entity type definitions (not keyed by name). Each entity has:
- `label` — display name in the UI and the entity type key for annotations
- `group` — top-level key in the export output (e.g., `sprites`, `tiles`)
- `properties` — flat map where each entry is either a shape, a special type, or a scalar

### Property Types

**Scalars:**
- `string` — text value
- `integer` — whole number
- `number` — decimal number
- `boolean` — true/false
- `string[]` — array of strings
- `{ enum: [...] }` — constrained set of string values

**Special types:**
- `Path` — absolute image file path. Stored internally as the image's absolute path. Exported as-is.
- `RelativePath` — image file path relative to workspace root. Stored internally as absolute. Exported relative to the workspace root defined in the `.span` file.

Both `Path` and `RelativePath` tell the app which image this annotation belongs to. An entity type should have exactly one `Path` or `RelativePath` property.

**Shapes:**
An object with a `__shape` key indicating the geometry type (`rect`, `point`, `circle`, `polygon`). The remaining keys are the geometry fields with their value types (`integer` or `number`).

### `__` Prefix Convention

- `__shape` marks a shape definition within properties
- `__properties` in frontmatter defines static top-level output fields
- The `__` prefix is reserved — user field names cannot start with `__`

### `__properties` Frontmatter

A key-value map of literal values written to the top level of the export output. These are static — not per-annotation, not typed. They pass through unchanged.

```yaml
# Spec
__properties:
  path: assets
  version: 2

# Output
path: assets
version: 2
sprites:
  - ...
```

### Shape Field Inference

Same as before — field names are matched against a fixed alias list per shape type to determine roles (x, y, width, height, radius, points). Unrecognized names produce warnings.

## Annotation Data Model

```typescript
interface Annotation {
  id: string;
  entityType: string;                                    // matches entity's label
  shapes: Record<string, Record<string, number>>;        // shapeName → { fieldName: value }
  propertyData: Record<string, unknown>;                 // scalar + Path properties
  _stash?: Record<string, unknown>;
}
```

### Example

```typescript
// Sprite with three shapes
{
  id: "abc-123",
  entityType: "Sprite",
  shapes: {
    slice:     { x: 0, y: 0, width: 16, height: 16 },
    collision: { x: 2, y: 4, width: 12, height: 12 },
    origin:    { x: 8, y: 16 }
  },
  propertyData: {
    path: "/absolute/path/to/link.png",
    name: "link_idle",
    frame: 0,
    direction: "down",
    variant: "default",
    tags: ["player", "idle"]
  }
}
```

### Creating Annotations

When creating an annotation, all shapes are created at once:
- The first shape (primary) is placed at the interaction position
- Rects default to 16x16
- Points default to the position
- Circles default to radius 8
- Secondary shapes are offset slightly from the primary so they're visually distinguishable

### Primary Shape

The first shape in the entity's properties map is the primary:
- Moving the primary moves all shapes as a group (offsets preserved)
- Secondary shapes can be repositioned/resized independently
- The primary shape is used for the annotation's position in the annotation list

### Shape Helper Functions

Updated signatures — shape helpers now take a shape name:
- `getShapeRect(annotation, spec, shapeName)` — returns `{ x, y, width, height }` for a specific named shape
- `getShapePosition(annotation, spec, shapeName)` — returns `{ x, y }` for a specific named shape
- `getPrimaryShapeName(spec, entityType)` — returns the first shape's name

## Canvas Rendering

### Multi-Shape Display

Each annotation renders all its shapes simultaneously:
- **Primary shape** (first): copper color theme (existing style)
- **Secondary shapes**: distinct muted colors per shape name — consistent across all annotations of the same entity type (e.g., `collision` is always blue, `origin` is always green)
- Each shape shows its name as a small label
- Selection highlight applies to all shapes of the selected annotation

### Interaction

- **Click on any shape** → selects the annotation
- **Drag primary shape** → moves all shapes as a group (preserving relative offsets)
- **Drag secondary shape** → moves only that shape independently
- **Resize handles** → per-shape (rects get resize handle, circles get radius handle)
- **Creating** → tool palette determines entity type, click places all shapes at once

### Shape Colors

Assign a fixed color palette for shape indices beyond the primary:
- Primary (index 0): copper (existing theme)
- Index 1: muted blue (#5a8ac8)
- Index 2: muted green (#5ac878)
- Index 3: muted purple (#8a5ac8)
- Additional: cycle through palette

## Inspector Changes

The Inspector renders a collapsible section per shape, followed by the properties section:

1. **Entity type dropdown** — unchanged
2. **Shape sections** — one per shape, e.g., "slice (rect)", "collision (rect)", "origin (point)". Each is collapsible with a colored indicator matching the canvas color. Contains the geometry fields as numeric inputs.
3. **Properties section** — scalar fields below all shape sections. `Path`/`RelativePath` shown as read-only text (the image association is set by which sheet the annotation is on, not manually edited).

## Export Format

Output mirrors the spec exactly:

```yaml
path: assets                    # from __properties
sprites:                        # from group
  - name: 'link_idle'           # scalar property
    path: './link.png'          # RelativePath — relative to workspace root
    frame: 0
    direction: down
    slice:                      # shape — nested under its name
      x: 0
      y: 0
      width: 16
      height: 16
    collision:
      x: 0
      y: 0
      width: 16
      height: 16
    origin:
      x: 8
      y: 8
    tags: ['player', 'idle']
    variant: 'default'
```

### Export Rules

- `__properties` values hoisted to top level of output
- Annotations grouped by entity's `group` key
- Within each annotation: properties and shapes interleaved in spec-defined order
- Shape fields nested under shape name (without `__shape`)
- `Path` → absolute path string
- `RelativePath` → path relative to workspace root
- `id`, `_stash` excluded
- `__shape` excluded from shape objects
- Entity types with no annotations → group key omitted from output
- Format matches spec format (YAML → YAML, JSON → JSON)

## Impact on Existing Code

### Spec Engine (`src/mainview/src/spec/`)

- `types.ts` — rewrite: `SpanSpec` has `frontmatter` (for `__properties`) and `entities` (array). Entity has `label`, `group`, and `properties` (ordered list of `SpecField` — discriminated union of shape/scalar/path). Remove old `EntityDef`/`ShapeDef` separate types.
- `parse.ts` — rewrite: parse array format, detect `__shape` vs scalars, parse YAML frontmatter
- `validate.ts` — update: validate array structure, `label`+`group` required, `__` prefix reserved, no duplicate group names
- `infer.ts` — unchanged (per-shape inference)
- `diff.ts` — update for new structure (compare by `label` matching)

### Annotation Model (`src/mainview/src/annotation.ts`)

- `shapeData` → `shapes: Record<string, Record<string, number>>`
- All helpers updated: `createAnnotation`, `migrateEntityType`, `getShapeRect`, `getShapePosition`, `duplicateAnnotation`, `clampToImage`
- New: `getPrimaryShapeName`

### Export (`src/mainview/src/export.ts`)

- Rewrite: group by `group` key, hoist `__properties`, nest shapes, handle `Path`/`RelativePath`

### Workspace/Persistence

- `workspace.ts` — minimal: `shapes` replaces `shapeData` in `WorkspaceSheet` annotations
- `persistence.ts` — update serialization for `shapes` field

### Components

- `useCanvas.ts` — multi-shape drag with primary group-move
- `CanvasView.vue` — render multiple shapes per annotation with distinct colors
- `DynamicInspector.vue` — collapsible section per shape
- `GalleryPanel.vue` — use first rect shape for preview crop
- `AnnotationList.vue` — use primary shape position for ordering

### Tests

All existing spec engine, annotation, export, and persistence tests need updating for the new structures.
