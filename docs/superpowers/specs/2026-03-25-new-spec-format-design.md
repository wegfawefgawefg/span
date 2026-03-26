# New Spec File Format

## Overview

Rewrite the spec module to support a simplified, more declarative YAML spec format. No backwards compatibility with the old format. Shapes use fixed `x/y/w/h` fields internally with workspace-level export overrides.

## New Spec Format

```yaml
- label: Sprite
  group: sprites
  aabb: rect
  path: file_name
  properties:
    name: string
    frame: integer
    collision: rect[]
    origin: point
    chroma_key: color
    direction: enum[up, down, left, right]
    variant: string
    tags: string[]

- label: Tile
  group: tiles
  aabb: rect
  path: file_name
  properties:
    name: string
    solid: boolean
    layer: enum[background, foreground, overlay]
    chroma_key: color
    tags: string[]

- label: Waypoint
  group: waypoints
  point: point
  properties:
    name: string
    order: integer
    type: enum[spawn, entrance, exit, warp]
```

### Top-level entity fields

- `label` — display name and annotation key (identifier format, unique)
- `group` — output grouping key for export (unique)
- `aabb: rect` — primary shape is a bounding box drawn on the sheet
- `point: point` — primary shape is a point placed on the sheet
- `path: file_name` — entity's image path comes from the sheet file where it's created

Every entity must have exactly one primary shape (`aabb` or `point`, not both).

### Property types

| Syntax | Kind | Example |
|--------|------|---------|
| `string` | scalar | `name: string` |
| `integer` | scalar | `frame: integer` |
| `number` | scalar | `scale: number` |
| `boolean` | scalar | `solid: boolean` |
| `string[]` | scalar | `tags: string[]` |
| `color` | color | `chroma_key: color` |
| `enum[a, b, c]` | enum | `direction: enum[up, down, left, right]` |
| `rect` | shape (single) | `bounds: rect` |
| `point` | shape (single) | `origin: point` |
| `rect[]` | shape (array) | `collision: rect[]` |
| `point[]` | shape (array) | `hotspots: point[]` |

Shape properties are always relative to the entity's primary shape (aabb). Only entities with `aabb: rect` can have shape properties.

## Type System

### SpanSpec

```typescript
interface SpanSpec {
  format: "json" | "yaml";
  entities: EntityDef[];
}
```

No more `frontmatter`.

### EntityDef

```typescript
interface EntityDef {
  label: string;
  group: string;
  primaryShape: PrimaryShape;
  hasPath: boolean;
  properties: PropertyField[];  // ordered, preserving spec order
}

interface PrimaryShape {
  kind: "rect" | "point";
}
```

### PropertyField

```typescript
type PropertyField =
  | ScalarPropertyField
  | EnumPropertyField
  | ColorPropertyField
  | ShapePropertyField;

interface ScalarPropertyField {
  kind: "scalar";
  name: string;
  type: "string" | "integer" | "number" | "boolean" | "string[]";
}

interface EnumPropertyField {
  kind: "enum";
  name: string;
  values: string[];
}

interface ColorPropertyField {
  kind: "color";
  name: string;
}

interface ShapePropertyField {
  kind: "shape";
  name: string;
  shapeType: "rect" | "point";
  array: boolean;
}
```

### SpecError (unchanged)

```typescript
interface SpecError {
  path: string;
  severity: "error" | "warning";
  message: string;
}
```

## Parsing

The parser reads the YAML array of entity definitions. No multi-document support needed (no frontmatter).

For each entity:
1. Extract `label`, `group` (same rules as before)
2. Check for `aabb: rect` or `point: point` → set `primaryShape`
3. Check for `path: file_name` → set `hasPath`
4. Parse `properties` object in insertion order:
   - String values: match against scalar types (`string`, `integer`, `number`, `boolean`, `string[]`), `color`, shape types (`rect`, `point`, `rect[]`, `point[]`)
   - `enum[...]` syntax: regex parse to extract values

### Validation rules

- Entity must be an object with `label` (identifier format, unique) and `group` (string, unique)
- Entity must have exactly one primary shape (`aabb` or `point`)
- `aabb` value must be `rect`; `point` value must be `point`
- Shape properties require the entity to have `aabb: rect` as primary shape
- Enum must have at least 2 string values
- No duplicate property names
- Property names cannot start with `__`

### Removed

- `infer.ts` — deleted entirely. No more shape field alias mapping.
- `__shape`, `__reference`, `__properties` concepts — gone.
- `FileName`, `ColorHEX` type names — replaced by `file_name` (top-level) and `color`.

## Annotation

```typescript
interface Annotation {
  id: string;
  entityType: string;
  aabb: { x: number; y: number; w: number; h: number } | null;
  point: { x: number; y: number } | null;
  properties: Record<string, unknown>;
}
```

- Exactly one of `aabb` or `point` is non-null (matches entity's primary shape)
- Shape properties stored in `properties` as relative offsets:
  - Single shape: `{ x: 0, y: 0 }` (point) or `{ x: 0, y: 0, w: 16, h: 16 }` (rect)
  - Array shape: `[{ x: 0, y: 0, w: 16, h: 16 }, ...]`
- Absolute position = `aabb.x + shape.x`, `aabb.y + shape.y`

### Creation defaults

- `aabb` entity: `{ x: clickX, y: clickY, w: 16, h: 16 }`
- `point` entity: `{ x: clickX, y: clickY }`
- Single shape properties: `{ x: 0, y: 0, ... }` (relative origin)
- Array shape properties: `[]` (empty, user adds via CRUD)
- Scalars/enums/colors: same defaults as before (`""`, `0`, `false`, `[]`, first enum value)

### Inspector

Properties display in the order defined in the spec. Array shape properties get CRUD controls (add/remove/reorder items).

## Export

Output structure: `{ [group]: [...entries] }`

Each entry contains:
- `path` field (if entity has `hasPath`) — set to sheet filename
- Primary shape fields (aabb or point) with workspace field name config
- All properties in spec order

### Workspace shape field overrides

In the `.span` file:
```yaml
shape_fields:
  rect: [left, top, width, height]
  point: [px, py]
```

Defaults: `rect: [x, y, w, h]`, `point: [x, y]`

Only affects exported key names. Internal storage always uses `x/y/w/h` and `x/y`.

### Example export

Default field names:
```yaml
sprites:
  - path: "hero.png"
    aabb:
      x: 0
      y: 0
      w: 32
      h: 32
    name: "hero"
    collision:
      - x: 2
        y: 4
        w: 28
        h: 24
    origin:
      x: 16
      y: 16
    direction: "up"
    tags: ["player"]
```

With override `rect: [left, top, width, height]`:
```yaml
sprites:
  - path: "hero.png"
    aabb:
      left: 0
      top: 0
      width: 32
      height: 32
    name: "hero"
    collision:
      - left: 2
        top: 4
        width: 28
        height: 24
    origin:
      x: 16
      y: 16
    direction: "up"
    tags: ["player"]
```

## Consumer Changes

### `annotation.ts`
- Rewrite `createAnnotation` for new `aabb`/`point` + `properties` structure
- Remove `resolveAbsolutePosition` (resolution is now `aabb.x + shape.x`)
- Simplify `clampToImage`, `duplicateAnnotation`, `migrateEntityType`

### `export.ts`
- Rewrite `buildExportData` for new structure
- Add workspace `shape_fields` remapping
- Remove frontmatter spreading

### `state.ts`
- Update `loadSpec` and `restoreWorkspace` (no frontmatter)
- Add `shape_fields` to workspace settings

### `diff.ts`
- Update to compare new type structure
- Simpler with fewer field kinds

### Canvas/rendering
- Read `annotation.aabb` or `annotation.point` directly instead of `annotation.shapes[primaryShapeName]` with mapping lookups

### Persistence (`.span` files)
- Serialized annotation format changes to match new `Annotation` type
- Breaking change to saved workspaces

### `spec/infer.ts`
- Deleted entirely
