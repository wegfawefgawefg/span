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

Shape fields define both the geometry and the output field names. The user chooses the names; the app infers the role:

- `rect` — looks for x/y/width/height-like names (also recognizes `left`/`top`/`right`/`bottom`, `w`/`h`)
- `point` — looks for x/y-like names
- `circle` — looks for center x/y + radius-like names (e.g., `cx`/`cy`/`r`, `x`/`y`/`radius`)
- `polygon` — looks for a points/vertices array field

If inference fails, the app warns and the entity type is unusable until the user fixes the spec.

### Input Format Dictates Output Format

- YAML spec → YAML output
- JSON spec → JSON output

## Spec Parsing & Validation

The spec engine takes a raw JSON/YAML string and produces a typed, validated spec object or a list of errors.

### Data Model

```typescript
interface SpanSpec {
  format: "json" | "yaml";
  entities: Map<string, EntityDef>;
}

interface EntityDef {
  name: string;
  shape: ShapeDef;
  properties: PropertyDef[];
}

interface ShapeDef {
  type: "rect" | "point" | "circle" | "polygon";
  fields: ShapeField[];       // the user-named fields
  mapping: ShapeMapping;      // inferred role assignments
  warnings: string[];         // inference warnings
}

interface PropertyDef {
  name: string;
  type: "string" | "integer" | "number" | "boolean" | "string[]" | "enum";
  enumValues?: string[];      // for enum type
}
```

### Validation Rules

- Must have at least one entity
- Entity names must be unique
- Each entity must have a `shape` with a recognized `type`
- Shape fields must have recognized value types (`integer`, `number`)
- Properties must have recognized types
- No name collisions between shape fields and property fields within an entity
- Warn (not error) on unrecognized shape field names

## Spec Change Diffing

When the user loads a new spec mid-session, the engine compares old and new to determine what's safe and what's destructive.

### Diff Categories

- **Safe:** new entity types added, new properties added to existing entities, property type widened (e.g., `integer` → `number`)
- **Destructive:** entity type removed (annotations of that type would be orphaned), property removed (data loss), property type narrowed or changed incompatibly, shape type changed on existing entity

### Diff Output

```typescript
interface SpecDiff {
  safe: boolean;              // true if no destructive changes
  added: string[];            // "Added entity: Waypoint", "Added Sprite.layer"
  removed: string[];          // "Removed entity: Region", "Removed Sprite.tags"
  changed: string[];          // "Sprite shape changed from rect to circle"
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
