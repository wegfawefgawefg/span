# Spec Engine

**Date:** 2026-03-23
**Status:** Approved
**Sub-project:** 1 of 3 (Spec Engine → Dynamic Annotation Model + Inspector → Workspace + I/O)

## Summary

A standalone module that parses, validates, and diffs user-provided spec files (JSON/YAML). The spec defines entity types (Sprite, Tile, etc.), their shapes (rect, point, circle, polygon), and metadata properties. The spec acts as a contract — the export output matches it exactly.

## Context

Span is being reworked from a hardcoded annotation schema to a spec-driven model:

1. User provides a spec file defining entity types and their properties
2. User drags in images to annotate
3. The app renders dynamic annotation tools based on the spec
4. Export produces a single file conforming to the spec's shape

This sub-project covers only the spec parsing/validation/diffing engine. It has no UI or state dependencies.

## Spec File Format

A spec file defines entity types. Each entity has a `shape` section (geometry + output field names) and a `properties` section (metadata fields).

```yaml
entities:
  Sprite:
    shape:
      type: rect
      x: integer
      y: integer
      width: integer
      height: integer
    properties:
      name: string
      frame: integer
      direction: { enum: [up, down, left, right] }
      variant: string
      tags: string[]
      notes: string

  Waypoint:
    shape:
      type: point
      x: integer
      y: integer
    properties:
      name: string
      order: integer

  HitCircle:
    shape:
      type: circle
      cx: integer
      cy: integer
      radius: integer
    properties:
      name: string
      damage: number

  Region:
    shape:
      type: polygon
      points: { type: array, items: { x: integer, y: integer } }
    properties:
      name: string
      layer: integer
```

### Supported Shape Types

- `rect` — rectangle defined by position + dimensions
- `point` — single coordinate
- `circle` — center + radius
- `polygon` — array of vertex coordinates

### Supported Property Types

- `string` — text value
- `integer` — whole number
- `number` — decimal number
- `boolean` — true/false
- `string[]` — array of strings
- `{ enum: [...] }` — constrained set of string values

### Shape Field Naming

Shape fields define both the geometry and the output field names. The user chooses the names; the app infers the role using a fixed alias list:

**`rect`** (requires exactly 4 fields):
- x-role: `x`, `left`, `col`
- y-role: `y`, `top`, `row`
- width-role: `width`, `w`, `right` (if `right` is present with `left`, treated as LTRB bounds model — converted to XYWH internally)
- height-role: `height`, `h`, `bottom` (if `bottom` is present with `top`, treated as LTRB bounds model)

**`point`** (requires exactly 2 fields):
- x-role: `x`, `col`
- y-role: `y`, `row`

**`circle`** (requires exactly 3 fields):
- x-role: `x`, `cx`
- y-role: `y`, `cy`
- radius-role: `radius`, `r`

**`polygon`** (requires exactly 1 field):
- points-role: `points`, `vertices`, `verts`

If any field name is not in the alias list for its shape type, the engine produces a warning. If the required number of fields is wrong or no valid mapping can be inferred, it produces an error and the entity type is unusable until fixed.

**LTRB model:** When a rect uses `left`/`top`/`right`/`bottom`, the engine stores the mapping with those names but the canvas internally converts to XYWH for rendering. Export outputs the user's original field names and values.

### Input Format Dictates Output Format

- YAML spec → YAML output
- JSON spec → JSON output

## Spec Parsing & Validation

The spec engine takes a raw JSON/YAML string and produces a typed, validated spec object or a list of errors.

### Data Model

```typescript
interface SpanSpec {
  format: "json" | "yaml";
  entities: Record<string, EntityDef>;  // keyed by entity name
}

interface EntityDef {
  shape: ShapeDef;
  properties: PropertyDef[];  // order preserved from spec file
}

interface ShapeDef {
  type: "rect" | "point" | "circle" | "polygon";
  fields: ShapeField[];       // the user-named fields
  mapping: ShapeMapping;      // inferred role assignments
  warnings: string[];         // inference warnings
}

interface ShapeField {
  name: string;               // user-chosen output name (e.g., "x", "left", "cx")
  valueType: "integer" | "number";  // shape fields are always numeric
}

// Discriminated union — each shape type has its own mapping
type ShapeMapping =
  | { type: "rect"; x: string; y: string; width: string; height: string }
  | { type: "point"; x: string; y: string }
  | { type: "circle"; x: string; y: string; radius: string }
  | { type: "polygon"; points: string };

interface PropertyDef {
  name: string;
  type: "string" | "integer" | "number" | "boolean" | "string[]" | "enum";
  enumValues?: string[];      // for enum type
}

interface SpecError {
  path: string;               // e.g., "entities.Sprite.shape.type"
  severity: "error" | "warning";
  message: string;
}
```

**Notes:**
- `entities` uses `Record` (not `Map`) for JSON serialization compatibility and Vue reactivity.
- Entity name is the key, not duplicated as a field.
- Shape field `valueType` is always numeric — shape geometry doesn't use strings/booleans.
- `ShapeMapping` is a discriminated union so consumers know exactly which fields are available per shape type.
- Property field order is preserved from the spec file (JS object key insertion order) and respected in the export output.

### Validation Rules

- Must have at least one entity
- Entity names must be unique and valid identifiers (alphanumeric + underscore, no spaces)
- Each entity must have a `shape` with a recognized `type` (case-sensitive, lowercase only)
- Shape must have the correct number of fields for its type
- Shape fields must have recognized value types (`integer`, `number`)
- Properties must have recognized types
- No name collisions between shape fields and property fields within an entity
- No duplicate property names within an entity
- Enum types must have at least 2 values
- Warn (not error) on unrecognized shape field names
- Empty `properties` section is valid (entity with shape only, no metadata)
- Empty or missing `entities` section is an error

### Default Values

The engine assigns implicit defaults by property type when creating new annotations:
- `string` → `""`
- `integer` → `0`
- `number` → `0`
- `boolean` → `false`
- `string[]` → `[]`
- `enum` → first value in the enum list

Shape fields default to `0`.

### Polygon Shape Fields

The polygon `points` field uses a special nested type: `{ type: array, items: { x: integer, y: integer } }`. This is a one-off structure specific to polygon shapes — the general property system does not support arrays of objects. The field names within `items` follow the same inference rules as point shapes.

## Spec Change Diffing

When the user loads a new spec mid-session, the engine compares old and new to determine what's safe and what's destructive.

### Diff Categories

- **Safe:** new entity types added, new properties added to existing entities, property type widened (e.g., `integer` → `number`)
- **Destructive:** entity type removed (annotations of that type would be orphaned), property removed (data loss), property type narrowed or changed incompatibly, shape type changed on existing entity

### Diff Output

```typescript
interface SpecDiff {
  safe: boolean;              // true if no destructive changes
  changes: SpecChange[];
}

interface SpecChange {
  entity: string;
  field?: string;             // absent for entity-level changes
  kind: "entity_added" | "entity_removed" | "property_added" | "property_removed"
      | "property_type_changed" | "shape_type_changed";
  destructive: boolean;
  description: string;        // human-readable summary for the confirmation dialog
}
```

If `safe === false`, the app shows a confirmation dialog listing the destructive changes. If confirmed, orphaned annotations keep their data internally (in the `.span` working file) but are flagged as unresolved — they won't appear in the export.

## Module Structure

```
src/mainview/src/spec/
├── types.ts          # SpanSpec, EntityDef, ShapeDef, PropertyDef, SpecDiff interfaces
├── parse.ts          # parseSpec(raw: string, format: "json" | "yaml"): SpanSpec | SpecError[]
├── validate.ts       # validateSpec(raw: object): SpecError[] — structural validation
├── infer.ts          # inferShapeMapping(shape: ShapeDef): ShapeMapping — field role inference
└── diff.ts           # diffSpecs(oldSpec: SpanSpec, newSpec: SpanSpec): SpecDiff
```

### Dependencies

- `yaml` npm package — for YAML parsing (works in both Bun and browser)
- No Vue, platform adapter, state, or UI dependencies
- Pure TypeScript, testable in isolation

### Consumed By

- `state.ts` — stores the active spec
- Inspector — reads entity/property defs to render dynamic fields
- Annotation model — uses shape defs for geometry
- Export — uses spec to produce conforming output
