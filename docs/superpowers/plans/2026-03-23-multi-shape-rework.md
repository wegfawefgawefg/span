# Multi-Shape Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the spec format, annotation model, and export to support multiple named shapes per entity type, with the spec file serving as the exact output schema.

**Architecture:** Rewrite the spec engine types and parser for the new array-based format with `__shape` markers and `__properties` frontmatter. Update the annotation model from single `shapeData` to `shapes: Record<string, ...>`. Rewrite export to group by `group` key and nest shapes. Update all components for multi-shape rendering and editing.

**Tech Stack:** Vue 3, TypeScript, `yaml` package, Bun test runner

**Spec:** `docs/superpowers/specs/2026-03-23-multi-shape-rework-design.md`

---

## File Structure

### Files to rewrite (new types/logic)

| File | Changes |
|------|---------|
| `src/mainview/src/spec/types.ts` | New `SpanSpec`, `EntityDef`, `SpecField` (discriminated union), `NamedShapeDef`. Remove old `EntityDef`/`ShapeDef` separation. |
| `src/mainview/src/spec/parse.ts` | Parse array format with YAML frontmatter. Detect `__shape` to distinguish shapes from scalars. |
| `src/mainview/src/spec/validate.ts` | Validate array structure, `label`+`group` required, `__` prefix reserved. |
| `src/mainview/src/spec/diff.ts` | Diff by `label` matching across arrays. |
| `src/mainview/src/spec/__tests__/*.test.ts` | All tests rewritten for new format. |
| `src/mainview/src/annotation.ts` | `shapeData` → `shapes`. Multi-shape `createAnnotation`, helpers take shape name. |
| `src/mainview/src/annotation.test.ts` | Tests updated for multi-shape. |
| `src/mainview/src/export.ts` | Group by `group` key, hoist `__properties`, nest shapes, handle `Path`/`RelativePath`. |
| `src/mainview/src/export.test.ts` | Tests updated for new export format. |
| `src/mainview/src/persistence.ts` | Update serialization for `shapes` field. |
| `src/mainview/src/persistence.test.ts` | Tests updated. |

### Files to update (consume new types)

| File | Changes |
|------|---------|
| `src/mainview/src/state.ts` | Update annotation CRUD for `shapes`. Update spec loading for new format. |
| `src/mainview/src/workspace.ts` | Minimal — annotations already use `Annotation` type. |
| `src/mainview/src/components/DynamicInspector.vue` | Collapsible section per named shape. |
| `src/mainview/src/components/CanvasView.vue` | Render multiple shapes per annotation with distinct colors. |
| `src/mainview/src/composables/useCanvas.ts` | Multi-shape drag with primary group-move. |
| `src/mainview/src/components/GalleryPanel.vue` | Use first rect shape for preview. |
| `src/mainview/src/components/AnnotationList.vue` | Use primary shape for positioning. |
| `src/mainview/src/style.css` | Shape color CSS variables for secondary shapes. |

### Unchanged

| File | Reason |
|------|--------|
| `src/mainview/src/spec/infer.ts` | Per-shape inference unchanged |
| `src/mainview/src/platform/*` | Platform layer unaffected |
| `src/mainview/src/workspace.ts` | Annotations are typed — changes flow through automatically |

---

## Task 1: Rewrite Spec Engine Types

**Files:**
- Rewrite: `src/mainview/src/spec/types.ts`

- [ ] **Step 1: Rewrite types.ts**

The entire type system changes. The spec is now an array of entity defs, each with `label`, `group`, and `properties` (an ordered map of named fields that are either shapes, scalars, or path types).

```typescript
// src/mainview/src/spec/types.ts

export type ShapeType = "rect" | "point" | "circle" | "polygon";

export type ScalarType =
	| "string"
	| "integer"
	| "number"
	| "boolean"
	| "string[]"
	| "enum";

export type PathType = "Path" | "RelativePath";

// --- Spec ---

export interface SpanSpec {
	format: "json" | "yaml";
	frontmatter: Record<string, unknown>; // __properties values
	entities: EntityDef[];
}

export interface EntityDef {
	label: string;    // display name + annotation key
	group: string;    // top-level output key
	fields: SpecField[];  // ordered list preserving spec property order
}

// Discriminated union for spec fields
export type SpecField =
	| ShapeSpecField
	| ScalarSpecField
	| PathSpecField;

export interface ShapeSpecField {
	kind: "shape";
	name: string;          // field name in output (e.g., "slice", "collision")
	shapeType: ShapeType;
	shapeFields: ShapeField[];
	mapping: ShapeMapping | null;
	warnings: string[];
}

export interface ScalarSpecField {
	kind: "scalar";
	name: string;
	type: ScalarType;
	enumValues?: string[];
}

export interface PathSpecField {
	kind: "path";
	name: string;
	pathType: PathType;  // "Path" or "RelativePath"
}

// --- Shape sub-types (unchanged) ---

export interface ShapeField {
	name: string;
	valueType: "integer" | "number";
}

export type ShapeMapping =
	| { type: "rect"; x: string; y: string; width: string; height: string }
	| { type: "point"; x: string; y: string }
	| { type: "circle"; x: string; y: string; radius: string }
	| { type: "polygon"; points: string };

// --- Errors ---

export interface SpecError {
	path: string;
	severity: "error" | "warning";
	message: string;
}

// --- Diff ---

export interface SpecDiff {
	safe: boolean;
	changes: SpecChange[];
}

export type SpecChangeKind =
	| "entity_added"
	| "entity_removed"
	| "field_added"
	| "field_removed"
	| "field_type_changed"
	| "shape_type_changed";

export interface SpecChange {
	entity: string;
	field?: string;
	kind: SpecChangeKind;
	destructive: boolean;
	description: string;
}

// --- Defaults ---

export function defaultForScalar(field: ScalarSpecField): unknown {
	if (field.type === "enum") return field.enumValues?.[0] ?? "";
	const defaults: Record<ScalarType, unknown> = {
		string: "", integer: 0, number: 0, boolean: false, "string[]": [], enum: null,
	};
	const d = defaults[field.type];
	return Array.isArray(d) ? [] : d;
}

export function defaultForShapeField(): number {
	return 0;
}

// --- Helpers ---

export function getEntityByLabel(spec: SpanSpec, label: string): EntityDef | undefined {
	return spec.entities.find((e) => e.label === label);
}

export function getShapesForEntity(entity: EntityDef): ShapeSpecField[] {
	return entity.fields.filter((f): f is ShapeSpecField => f.kind === "shape");
}

export function getScalarsForEntity(entity: EntityDef): ScalarSpecField[] {
	return entity.fields.filter((f): f is ScalarSpecField => f.kind === "scalar");
}

export function getPathFieldForEntity(entity: EntityDef): PathSpecField | undefined {
	return entity.fields.find((f): f is PathSpecField => f.kind === "path");
}

export function getPrimaryShapeName(entity: EntityDef): string | null {
	const shapes = getShapesForEntity(entity);
	return shapes.length > 0 ? shapes[0].name : null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/spec/types.ts
git commit -m "rewrite spec types for multi-shape array format"
```

---

## Task 2: Rewrite Spec Validation

**Files:**
- Rewrite: `src/mainview/src/spec/validate.ts`
- Rewrite: `src/mainview/src/spec/__tests__/validate.test.ts`

- [ ] **Step 1: Write tests for new validation**

Test cases:
- Valid spec with array of entities, each with `label`, `group`, `properties`
- Missing `label` or `group` → error
- Duplicate `label` → error
- Duplicate `group` → error
- `__` prefix on user field names → error
- Field with `__shape` parsed as shape, validated per shape type
- Unknown `__shape` type → error
- Scalar types validated (`string`, `integer`, `number`, `boolean`, `string[]`, enum)
- `Path`/`RelativePath` recognized as valid types
- Invalid scalar type → error
- Enum with < 2 values → error
- Empty entities array → error
- Entity with no properties → valid (but unusual)
- Shape field count validation (rect needs 4, point needs 2, etc.)
- Shape field names produce inference warnings
- No name collision between shape names and scalar property names

- [ ] **Step 2: Implement new validation**

Read the current `validate.ts` for patterns. Rewrite to:
- Accept raw `unknown` input
- Check it's an array (the entity list — frontmatter is parsed separately)
- Validate each entity: `label` (string, identifier), `group` (string), `properties` (object)
- For each property in `properties`: detect type by checking for `__shape` key (shape), `Path`/`RelativePath` string (path), enum object, or scalar string
- Run `inferShapeMapping` on each shape field and collect warnings
- Check `__` prefix reservation on user field names

- [ ] **Step 3: Run tests, verify pass**

Run: `bun test src/mainview/src/spec/__tests__/validate.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/spec/validate.ts src/mainview/src/spec/__tests__/validate.test.ts
git commit -m "rewrite spec validation for multi-shape array format"
```

---

## Task 3: Rewrite Spec Parser

**Files:**
- Rewrite: `src/mainview/src/spec/parse.ts`
- Rewrite: `src/mainview/src/spec/__tests__/parse.test.ts`

- [ ] **Step 1: Write tests for new parser**

Test cases using the example spec format:
- Parse YAML spec with frontmatter `__properties` + entity array → correct `SpanSpec`
- `__properties` values land in `spec.frontmatter`
- Entity with multiple shapes (rect + rect + point) → three `ShapeSpecField` entries in `fields`
- `Path` and `RelativePath` → `PathSpecField` entries
- Scalar properties → `ScalarSpecField` entries
- Field order preserved from spec
- JSON spec (no frontmatter) → entities parsed, empty frontmatter
- Invalid YAML → error array
- Invalid structure → error array
- Spec with no frontmatter → empty `frontmatter` object

- [ ] **Step 2: Implement parser**

The parser needs to:
1. Parse raw string as YAML/JSON
2. Handle YAML multi-document format (frontmatter `---` block + entity array). YAML `parseAllDocuments` or `parseDocument` handles this — the first document is frontmatter, the second is the entity array. Or if single document, it's just the entity array.
3. Extract `__properties` from frontmatter
4. Run validation on the entity array
5. Build `SpecField[]` for each entity by iterating `properties`:
   - If value is an object with `__shape` key → `ShapeSpecField` (run inference)
   - If value is `"Path"` or `"RelativePath"` → `PathSpecField`
   - If value is a string (`"string"`, `"integer"`, etc.) → `ScalarSpecField`
   - If value is an object with `enum` key → `ScalarSpecField` with `enumValues`

- [ ] **Step 3: Run tests, verify pass**

Run: `bun test src/mainview/src/spec/__tests__/parse.test.ts`

- [ ] **Step 4: Run all spec tests**

Run: `bun test src/mainview/src/spec/`

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/spec/parse.ts src/mainview/src/spec/__tests__/parse.test.ts
git commit -m "rewrite spec parser for multi-shape array format with frontmatter"
```

---

## Task 4: Update Spec Diff

**Files:**
- Rewrite: `src/mainview/src/spec/diff.ts`
- Rewrite: `src/mainview/src/spec/__tests__/diff.test.ts`

- [ ] **Step 1: Write tests**

Test cases:
- Identical specs → safe, no changes
- Entity added → safe
- Entity removed → destructive
- Field added to entity → safe
- Field removed from entity → destructive
- Shape type changed on existing field → destructive
- Scalar type widened (integer → number) → safe
- Scalar type changed incompatibly → destructive
- Shape field added → safe
- Shape field removed → destructive

Diff matches entities by `label` (not by array index).

- [ ] **Step 2: Implement diff**

Update to iterate `spec.entities` arrays, match by `label`, compare `fields` arrays by field `name`.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/spec/diff.ts src/mainview/src/spec/__tests__/diff.test.ts
git commit -m "update spec diff for multi-shape array format"
```

---

## Task 5: Rewrite Annotation Model

**Files:**
- Rewrite: `src/mainview/src/annotation.ts`
- Rewrite: `src/mainview/src/annotation.test.ts`

- [ ] **Step 1: Write tests for multi-shape annotations**

Test cases:
- `createAnnotation` with multi-shape entity (Sprite: slice + collision + origin) → all shapes populated with defaults, primary at position, secondaries offset
- `createAnnotation` with single-shape entity (Waypoint: point only) → one shape
- `getShapeRect(ann, spec, "slice")` → rect data for named shape
- `getShapeRect(ann, spec, "origin")` → null (origin is a point, not a rect)
- `getShapePosition(ann, spec, "origin")` → point position
- `getPrimaryShapeName` returns first shape's name
- `duplicateAnnotation` copies all shapes with offset on primary
- `migrateEntityType` resets all shapes, migrates properties
- `clampToImage` clamps all shapes

- [ ] **Step 2: Implement updated annotation module**

Key changes:
- `Annotation.shapeData` → `Annotation.shapes: Record<string, Record<string, number>>`
- `createAnnotation` iterates entity's shape fields, creates all shapes. Primary at position, secondaries offset by `(index * 4)` pixels.
- `getShapeRect(ann, spec, shapeName)` looks up the named shape in `ann.shapes[shapeName]` and uses the shape's mapping
- `getShapePosition(ann, spec, shapeName)` same but returns `{ x, y }`
- `getPrimaryShapeName(spec, entityType)` uses `getShapesForEntity` + first shape
- `duplicateAnnotation` copies all shapes, offsets primary position
- `clampToImage` clamps each shape independently
- Remove old `getMapping` helper (now per-shape)

- [ ] **Step 3: Run tests, verify pass**

Run: `bun test src/mainview/src/annotation.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/annotation.ts src/mainview/src/annotation.test.ts
git commit -m "rewrite annotation model for multi-shape support"
```

---

## Task 6: Rewrite Export

**Files:**
- Rewrite: `src/mainview/src/export.ts`
- Rewrite: `src/mainview/src/export.test.ts`

- [ ] **Step 1: Write tests for new export format**

Test cases:
- Export groups annotations by entity's `group` key (`sprites:`, `tiles:`)
- `__properties` hoisted to top level of output
- Shape data nested under shape name (without `__shape`)
- Scalar properties flat alongside shapes
- Field order matches spec definition order
- `Path` → absolute path string
- `RelativePath` → relative to workspace root
- `id`, `_stash` excluded
- Entity types with no annotations → group omitted
- JSON export produces correct structure
- YAML export produces correct structure
- Multiple entity types in same output

- [ ] **Step 2: Implement export**

Key changes:
- Build output as `Record<string, unknown>` — start with `__properties` (frontmatter), then add each entity group
- Group annotations by `entityType`, find matching entity def by `label`, use entity's `group` as the output key
- For each annotation: build flat object in spec field order. For shape fields → nest as `{ fieldName: value }`. For scalars → flat value. For `Path` → value as-is. For `RelativePath` → make relative to workspace root.
- Remove old sheet-based grouping

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/export.ts src/mainview/src/export.test.ts
git commit -m "rewrite export for multi-shape grouped output format"
```

---

## Task 7: Update Persistence

**Files:**
- Update: `src/mainview/src/persistence.ts`
- Update: `src/mainview/src/persistence.test.ts`

- [ ] **Step 1: Update serialization**

Change `shapeData` → `shapes` in serialization and deserialization. The `.span` format now stores `shapes: { shapeName: { field: value } }` instead of `shapeData: { field: value }`.

- [ ] **Step 2: Update tests**

Update all persistence tests that reference `shapeData` → `shapes`.

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/persistence.ts src/mainview/src/persistence.test.ts
git commit -m "update persistence for multi-shape annotation format"
```

---

## Task 8: Update State

**Files:**
- Update: `src/mainview/src/state.ts`

- [ ] **Step 1: Update state.ts**

Key changes:
- `updateShapeData(patch)` → `updateShapeData(shapeName, patch)` — takes shape name to know which shape to update
- `loadSpec` uses new `parseSpec` which returns the new `SpanSpec` format
- `activeTool` stores entity `label` (unchanged semantically)
- `addAnnotation` calls updated `createAnnotation`
- `clampAnnotationToImage` calls updated `clampToImage`
- `duplicateSelected` calls updated `duplicateAnnotation`

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/state.ts
git commit -m "update state.ts for multi-shape annotation model"
```

---

## Task 9: Update DynamicInspector

**Files:**
- Update: `src/mainview/src/components/DynamicInspector.vue`

- [ ] **Step 1: Update DynamicInspector**

Key changes:
- Import `getShapesForEntity`, `getScalarsForEntity`, `getPathFieldForEntity` from spec types
- Instead of one "Shape — rect" section, render a collapsible section per named shape
- Each shape section header: `"{name} ({shapeType})"` with a colored dot matching the canvas color
- Shape sections expand/collapse on click
- Properties section renders below all shape sections
- `Path`/`RelativePath` fields shown as read-only text
- `updateShapeData` now called with `(shapeName, patch)` instead of just `(patch)`
- Entity type dropdown lists entity `label` values from spec

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/DynamicInspector.vue
git commit -m "update DynamicInspector for multi-shape collapsible sections"
```

---

## Task 10: Update Canvas for Multi-Shape

**Files:**
- Update: `src/mainview/src/composables/useCanvas.ts`
- Update: `src/mainview/src/components/CanvasView.vue`
- Update: `src/mainview/src/style.css`

- [ ] **Step 1: Update useCanvas.ts**

Key changes:
- `DragState` adds `shapeName: string` to track which shape is being dragged
- `startDrag` takes `shapeName` parameter, snapshots that shape's data
- `onPointerMove`: if dragging primary shape → compute deltas and apply to ALL shapes (group move). If dragging secondary shape → apply delta to just that shape.
- Import `getPrimaryShapeName`, `getEntityByLabel`, `getShapesForEntity` from spec types

- [ ] **Step 2: Update CanvasView.vue**

Key changes:
- For each annotation, iterate its shapes and render each one
- Each shape gets a CSS color class based on its index in the entity's shape list (primary = copper, secondary = blue/green/purple)
- Each shape shows its name as a small label
- Click on any shape selects the annotation
- Shape-specific resize handles rendered per shape
- Creation handler creates annotation with all shapes via `createAnnotation`

- [ ] **Step 3: Add secondary shape color CSS**

Add to `style.css`:
```css
.shape-color-0 { /* primary — copper, existing */ }
.shape-color-1 { --shape-color: #5a8ac8; --shape-glow: rgba(90, 138, 200, 0.15); }
.shape-color-2 { --shape-color: #5ac878; --shape-glow: rgba(90, 200, 120, 0.15); }
.shape-color-3 { --shape-color: #8a5ac8; --shape-glow: rgba(138, 90, 200, 0.15); }
```

Update `.annotation-box`, `.annotation-point`, `.annotation-circle` to use `var(--shape-color)` when a shape color class is applied.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/composables/useCanvas.ts src/mainview/src/components/CanvasView.vue src/mainview/src/style.css
git commit -m "update canvas for multi-shape rendering with distinct colors"
```

---

## Task 11: Update GalleryPanel and AnnotationList

**Files:**
- Update: `src/mainview/src/components/GalleryPanel.vue`
- Update: `src/mainview/src/components/AnnotationList.vue`

- [ ] **Step 1: Update GalleryPanel**

Key changes:
- Use `getShapesForEntity` to find the first rect shape for the entity type
- Call `getShapeRect(ann, spec, firstRectShapeName)` instead of `getShapeRect(ann, spec)`
- If no rect shape exists, exclude from gallery (already filtered, but shape name is now explicit)

- [ ] **Step 2: Update AnnotationList**

Key changes:
- Use `getPrimaryShapeName` for position-based ordering
- Entity type references use `label` from the spec

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/components/GalleryPanel.vue src/mainview/src/components/AnnotationList.vue
git commit -m "update GalleryPanel and AnnotationList for multi-shape"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 2: Verify web build**

Run: `bun run build:web`
Expected: Build succeeds

- [ ] **Step 3: Verify with example spec**

Load `example_project/example_spec.yaml` mentally against the parser — confirm the spec format matches what the parser expects (array of entities with `__shape` markers, YAML frontmatter).

- [ ] **Step 4: Commit if fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
