# Dynamic Annotation Model + Inspector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded annotation type and Inspector with a spec-driven dynamic model supporting rect, point, circle, and polygon shapes.

**Architecture:** New `annotation.ts` module defines the `Annotation` interface and helpers (create, migrate, shape geometry). `DynamicInspector.vue` renders fields from the spec. `ToolPalette.vue` provides entity type selection. `state.ts` gains `activeSpec` and `activeTool` refs. Canvas composable is extended for multi-shape support.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-23-dynamic-annotation-model-design.md`

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `src/mainview/src/annotation.ts` | `Annotation` interface + helpers: `createAnnotation`, `migrateEntityType`, `getShapeRect`, `getShapePosition`, `duplicateAnnotation`, `clampToImage` |
| `src/mainview/src/annotation.test.ts` | Tests for annotation helpers |
| `src/mainview/src/components/ToolPalette.vue` | Vertical toolbar showing entity types from spec |
| `src/mainview/src/components/DynamicInspector.vue` | Spec-driven field renderer |

### Modified files

| File | Changes |
|------|---------|
| `src/mainview/src/types.ts` | Remove `Annotation`, `normalizeAnnotation`. Keep `Sheet`, `SheetWithAnnotations` (updated to use new `Annotation`), `makeId`. |
| `src/mainview/src/state.ts` | Add `activeSpec`, `activeTool`. Rewrite CRUD functions for new `Annotation` type. Replace `updateSelectedAnnotation` with `updateShapeData`/`updatePropertyData`. Remove `colorPickArmed`. |
| `src/mainview/src/composables/useCanvas.ts` | Extend `DragState` and drag logic for multi-shape. Use `getShapeRect`/`getShapePosition` instead of direct field access. |
| `src/mainview/src/components/Inspector.vue` | Replace hardcoded fields with `<DynamicInspector>`. |
| `src/mainview/src/components/CanvasView.vue` | Add `ToolPalette` to left side. Render point/circle/polygon shapes. Route creation to active tool. |
| `src/mainview/src/components/AnnotationList.vue` | Show entity type badge. Use first string property as display name. |
| `src/mainview/src/components/GalleryPanel.vue` | Filter to rect-only entities. Use dynamic field lookup for name/frame. |
| `src/mainview/main.ts` | Remove `addAnnotationAtViewportCenter` import (will be updated in state.ts). |

---

## Task 1: Annotation Module (Data Model + Helpers)

**Files:**
- Create: `src/mainview/src/annotation.ts`
- Create: `src/mainview/src/annotation.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/mainview/src/annotation.test.ts
import { describe, test, expect } from "bun:test";
import {
	createAnnotation,
	migrateEntityType,
	getShapeRect,
	getShapePosition,
	duplicateAnnotation,
	clampToImage,
} from "./annotation";
import type { SpanSpec } from "./spec/types";
import { parseSpec } from "./spec/parse";

function spec(yaml: string): SpanSpec {
	const result = parseSpec(yaml, "yaml");
	if (Array.isArray(result)) throw new Error(JSON.stringify(result));
	return result;
}

const TEST_SPEC = spec(`
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
  Waypoint:
    shape:
      type: point
      x: integer
      y: integer
    properties:
      name: string
      order: integer
  Circle:
    shape:
      type: circle
      cx: integer
      cy: integer
      radius: integer
    properties:
      name: string
`);

describe("createAnnotation", () => {
	test("creates rect annotation with defaults", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		expect(ann.entityType).toBe("Sprite");
		expect(ann.shapeData.x).toBe(10);
		expect(ann.shapeData.y).toBe(20);
		expect(ann.shapeData.width).toBe(16);
		expect(ann.shapeData.height).toBe(16);
		expect(ann.propertyData.name).toBe("");
		expect(ann.propertyData.frame).toBe(0);
		expect(ann.propertyData.direction).toBe("up");
		expect(ann.id).toBeTruthy();
	});

	test("creates point annotation", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 50, y: 60 });
		expect(ann.shapeData.x).toBe(50);
		expect(ann.shapeData.y).toBe(60);
		expect(Object.keys(ann.shapeData)).toHaveLength(2);
	});

	test("creates circle annotation with default radius", () => {
		const ann = createAnnotation(TEST_SPEC, "Circle", { x: 100, y: 100 });
		expect(ann.shapeData.cx).toBe(100);
		expect(ann.shapeData.cy).toBe(100);
		expect(ann.shapeData.radius).toBe(8);
	});
});

describe("migrateEntityType", () => {
	test("migrates Sprite to Waypoint, preserving shared properties", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		ann.propertyData.name = "hero";
		ann.propertyData.frame = 3;

		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated.entityType).toBe("Waypoint");
		expect(migrated.propertyData.name).toBe("hero"); // shared
		expect(migrated.propertyData.order).toBe(0); // new, default
		expect(migrated._stash?.frame).toBe(3); // stashed
		expect(migrated._stash?.direction).toBe("up"); // stashed
	});

	test("resets shape data on type change", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 99, y: 99 });
		const migrated = migrateEntityType(ann, TEST_SPEC, "Waypoint");
		expect(migrated.shapeData.x).toBe(0);
		expect(migrated.shapeData.y).toBe(0);
		expect(migrated.shapeData.width).toBeUndefined();
	});
});

describe("getShapeRect", () => {
	test("returns rect for rect shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		ann.shapeData.width = 32;
		ann.shapeData.height = 24;
		const rect = getShapeRect(ann, TEST_SPEC);
		expect(rect).toEqual({ x: 5, y: 10, width: 32, height: 24 });
	});

	test("returns null for point shape", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 5, y: 10 });
		expect(getShapeRect(ann, TEST_SPEC)).toBeNull();
	});
});

describe("getShapePosition", () => {
	test("returns position for rect", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 5, y: 10 });
		expect(getShapePosition(ann, TEST_SPEC)).toEqual({ x: 5, y: 10 });
	});

	test("returns position for circle using cx/cy", () => {
		const ann = createAnnotation(TEST_SPEC, "Circle", { x: 50, y: 60 });
		expect(getShapePosition(ann, TEST_SPEC)).toEqual({ x: 50, y: 60 });
	});
});

describe("duplicateAnnotation", () => {
	test("creates copy with new id and offset position", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: 10, y: 20 });
		ann.propertyData.name = "original";
		const copy = duplicateAnnotation(ann, TEST_SPEC);
		expect(copy.id).not.toBe(ann.id);
		expect(copy.shapeData.x).toBe(14); // offset by 4
		expect(copy.shapeData.y).toBe(24);
		expect(copy.propertyData.name).toBe("original");
	});
});

describe("clampToImage", () => {
	test("clamps rect to image bounds", () => {
		const ann = createAnnotation(TEST_SPEC, "Sprite", { x: -5, y: -5 });
		ann.shapeData.width = 200;
		clampToImage(ann, TEST_SPEC, 100, 100);
		expect(ann.shapeData.x).toBe(0);
		expect(ann.shapeData.y).toBe(0);
		expect(ann.shapeData.width).toBe(100);
	});

	test("clamps point to image bounds", () => {
		const ann = createAnnotation(TEST_SPEC, "Waypoint", { x: 200, y: -10 });
		clampToImage(ann, TEST_SPEC, 100, 100);
		expect(ann.shapeData.x).toBe(100);
		expect(ann.shapeData.y).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/mainview/src/annotation.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement annotation module**

```typescript
// src/mainview/src/annotation.ts
import type { SpanSpec, ShapeMapping } from "./spec/types";
import { defaultForProperty, defaultForShapeField } from "./spec/types";
import { makeId } from "./types";

export type PolygonVertices = Array<Record<string, number>>;

export interface Annotation {
	id: string;
	entityType: string;
	shapeData: Record<string, number | PolygonVertices>;
	propertyData: Record<string, unknown>;
	_stash?: Record<string, unknown>;
}

function getMapping(spec: SpanSpec, entityType: string): ShapeMapping | null {
	return spec.entities[entityType]?.shape.mapping ?? null;
}

export function createAnnotation(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
): Annotation {
	const entity = spec.entities[entityType];
	if (!entity) throw new Error(`Unknown entity type: ${entityType}`);

	const mapping = entity.shape.mapping;
	const shapeData: Record<string, number> = {};

	// Set defaults for all shape fields
	for (const field of entity.shape.fields) {
		shapeData[field.name] = defaultForShapeField();
	}

	// Apply position and sensible defaults based on shape type
	if (mapping) {
		switch (mapping.type) {
			case "rect":
				shapeData[mapping.x] = position.x;
				shapeData[mapping.y] = position.y;
				shapeData[mapping.width] = 16;
				shapeData[mapping.height] = 16;
				break;
			case "point":
				shapeData[mapping.x] = position.x;
				shapeData[mapping.y] = position.y;
				break;
			case "circle":
				shapeData[mapping.x] = position.x;
				shapeData[mapping.y] = position.y;
				shapeData[mapping.radius] = 8;
				break;
			case "polygon":
				// Polygons start empty — user adds vertices by clicking
				break;
		}
	}

	// Set property defaults
	const propertyData: Record<string, unknown> = {};
	for (const prop of entity.properties) {
		propertyData[prop.name] = defaultForProperty(prop);
	}

	return { id: makeId(), entityType, shapeData, propertyData };
}

export function migrateEntityType(
	annotation: Annotation,
	spec: SpanSpec,
	newType: string,
): Annotation {
	const newEntity = spec.entities[newType];
	if (!newEntity) throw new Error(`Unknown entity type: ${newType}`);

	// Build new shape data with defaults
	const newShapeData: Record<string, number> = {};
	for (const field of newEntity.shape.fields) {
		newShapeData[field.name] = defaultForShapeField();
	}

	// Migrate properties — keep shared, stash removed, default new
	const oldProps = { ...annotation.propertyData };
	const newPropertyData: Record<string, unknown> = {};
	const stash: Record<string, unknown> = { ...(annotation._stash ?? {}) };

	const newPropNames = new Set(newEntity.properties.map((p) => p.name));

	// Stash old properties not in new type
	for (const [key, value] of Object.entries(oldProps)) {
		if (!newPropNames.has(key)) {
			stash[key] = value;
		}
	}

	// Set new properties — use old value if available, then stash, then default
	for (const prop of newEntity.properties) {
		if (prop.name in oldProps) {
			newPropertyData[prop.name] = oldProps[prop.name];
		} else if (prop.name in stash) {
			newPropertyData[prop.name] = stash[prop.name];
			delete stash[prop.name];
		} else {
			newPropertyData[prop.name] = defaultForProperty(prop);
		}
	}

	return {
		id: annotation.id,
		entityType: newType,
		shapeData: newShapeData,
		propertyData: newPropertyData,
		...(Object.keys(stash).length > 0 ? { _stash: stash } : {}),
	};
}

export function getShapeRect(
	annotation: Annotation,
	spec: SpanSpec,
): { x: number; y: number; width: number; height: number } | null {
	const mapping = getMapping(spec, annotation.entityType);
	if (!mapping || mapping.type !== "rect") return null;

	const x = annotation.shapeData[mapping.x] as number;
	const y = annotation.shapeData[mapping.y] as number;
	const w = annotation.shapeData[mapping.width] as number;
	const h = annotation.shapeData[mapping.height] as number;

	// TODO: LTRB detection — for now assume XYWH
	return { x, y, width: w, height: h };
}

export function getShapePosition(
	annotation: Annotation,
	spec: SpanSpec,
): { x: number; y: number } | null {
	const mapping = getMapping(spec, annotation.entityType);
	if (!mapping) return null;

	switch (mapping.type) {
		case "rect":
		case "point":
			return {
				x: annotation.shapeData[mapping.x] as number,
				y: annotation.shapeData[mapping.y] as number,
			};
		case "circle":
			return {
				x: annotation.shapeData[mapping.x] as number,
				y: annotation.shapeData[mapping.y] as number,
			};
		case "polygon":
			return null; // polygons don't have a single position
	}
}

export function duplicateAnnotation(
	annotation: Annotation,
	spec: SpanSpec,
): Annotation {
	const mapping = getMapping(spec, annotation.entityType);
	const newShapeData = { ...annotation.shapeData };

	// Offset position by 4px via mapping
	if (mapping) {
		switch (mapping.type) {
			case "rect":
			case "point":
				(newShapeData[mapping.x] as number) += 4;
				(newShapeData[mapping.y] as number) += 4;
				break;
			case "circle":
				(newShapeData[mapping.x] as number) += 4;
				(newShapeData[mapping.y] as number) += 4;
				break;
			case "polygon":
				// TODO: offset all vertices
				break;
		}
	}

	return {
		id: makeId(),
		entityType: annotation.entityType,
		shapeData: newShapeData,
		propertyData: { ...annotation.propertyData },
	};
}

export function clampToImage(
	annotation: Annotation,
	spec: SpanSpec,
	imgW: number,
	imgH: number,
): void {
	const mapping = getMapping(spec, annotation.entityType);
	if (!mapping) return;

	switch (mapping.type) {
		case "rect": {
			let x = annotation.shapeData[mapping.x] as number;
			let y = annotation.shapeData[mapping.y] as number;
			let w = annotation.shapeData[mapping.width] as number;
			let h = annotation.shapeData[mapping.height] as number;
			w = Math.max(1, Math.min(Math.round(w), imgW));
			h = Math.max(1, Math.min(Math.round(h), imgH));
			x = Math.max(0, Math.min(Math.round(x), imgW - w));
			y = Math.max(0, Math.min(Math.round(y), imgH - h));
			annotation.shapeData[mapping.x] = x;
			annotation.shapeData[mapping.y] = y;
			annotation.shapeData[mapping.width] = w;
			annotation.shapeData[mapping.height] = h;
			break;
		}
		case "point": {
			annotation.shapeData[mapping.x] = Math.max(0, Math.min(Math.round(annotation.shapeData[mapping.x] as number), imgW));
			annotation.shapeData[mapping.y] = Math.max(0, Math.min(Math.round(annotation.shapeData[mapping.y] as number), imgH));
			break;
		}
		case "circle": {
			const r = annotation.shapeData[mapping.radius] as number;
			annotation.shapeData[mapping.x] = Math.max(r, Math.min(Math.round(annotation.shapeData[mapping.x] as number), imgW - r));
			annotation.shapeData[mapping.y] = Math.max(r, Math.min(Math.round(annotation.shapeData[mapping.y] as number), imgH - r));
			break;
		}
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/mainview/src/annotation.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/annotation.ts src/mainview/src/annotation.test.ts
git commit -m "add spec-driven annotation data model with helpers"
```

---

## Task 2: Update types.ts

**Files:**
- Modify: `src/mainview/src/types.ts`

- [ ] **Step 1: Remove old Annotation type, keep Sheet types and makeId**

Replace the entire file with:

```typescript
// src/mainview/src/types.ts
import type { Annotation } from "./annotation";

export type { Annotation };

export interface Sheet {
	file: string;
	name: string;
	imageUrl: string;
	annotationFile: string;
}

export interface SheetWithAnnotations extends Sheet {
	annotations: Annotation[];
}

export function makeId(): string {
	if (globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	return `annotation-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}
```

Note: `normalizeAnnotation` is removed entirely. The old flat annotation format is no longer supported — sub-project 3 will handle the new I/O.

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/types.ts
git commit -m "remove hardcoded Annotation type, re-export from annotation.ts"
```

---

## Task 3: Update state.ts

**Files:**
- Modify: `src/mainview/src/state.ts`

- [ ] **Step 1: Rewrite state.ts**

Key changes:
- Add `activeSpec: ref<SpanSpec | null>(null)` and `activeTool: ref<string>("")`
- Remove `colorPickArmed`
- Replace `addAnnotation(x, y)` with spec-aware version using `createAnnotation`
- Replace `updateSelectedAnnotation` with `updateShapeData` and `updatePropertyData`
- Replace `duplicateSelected` with spec-aware version using `duplicateAnnotation`
- Replace `clampAnnotationToImage` with spec-aware version using `clampToImage`
- Remove `normalizeAnnotation` calls from `syncCurrentSheetIntoProject`, `loadProjectData`, `openSheet`
- `addAnnotationAtViewportCenter` uses `activeTool` and `activeSpec`

Read the current `state.ts` and make these specific changes:

**Line 1-4:** Update imports:
```typescript
import { computed, ref, triggerRef } from "vue";
import type { Sheet, SheetWithAnnotations } from "./types";
import type { Annotation } from "./annotation";
import { createAnnotation, duplicateAnnotation, clampToImage, getShapePosition } from "./annotation";
import type { SpanSpec } from "./spec/types";
import { makeId } from "./types";
import { api } from "./platform/adapter";
```

**After line 25 (imageHeight):** Add:
```typescript
export const activeSpec = ref<SpanSpec | null>(null);
export const activeTool = ref<string>("");
```

**Remove line 21:** `export const colorPickArmed = ref(false);`

**Update `selectAnnotation`:** Remove `colorPickArmed.value = false;`

**Remove `normalizeAnnotation` from `syncCurrentSheetIntoProject`:** Just copy annotations directly:
```typescript
record.annotations = [...annotations.value];
```

**Remove `normalizeAnnotation` from `loadProjectData` and `openSheet`:** Just spread annotations directly:
```typescript
// In loadProjectData:
projectSheets.value = result.map((s) => ({ ...s }));

// In openSheet:
annotations.value = [...record.annotations];
```

**Rewrite `addAnnotation`:**
```typescript
export function addAnnotation(x: number = 0, y: number = 0) {
	const spec = activeSpec.value;
	const tool = activeTool.value;
	if (!spec || !tool || !spec.entities[tool]) return;

	const annotation = createAnnotation(spec, tool, { x, y });
	annotations.value.push(annotation);
	selectedId.value = annotation.id;
	markDirty(true);
	syncCurrentSheetIntoProject();
}
```

**Rewrite `duplicateSelected`:**
```typescript
export function duplicateSelected() {
	const ann = selectedAnnotation.value;
	const spec = activeSpec.value;
	if (!ann || !spec) return;
	const copy = duplicateAnnotation(ann, spec);
	annotations.value.push(copy);
	selectedId.value = copy.id;
	markDirty(true);
	syncCurrentSheetIntoProject();
}
```

**Replace `updateSelectedAnnotation` with two functions:**
```typescript
export function updateShapeData(patch: Record<string, number>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	Object.assign(ann.shapeData, patch);
	markDirty(true);
	triggerRef(annotations);
	syncCurrentSheetIntoProject();
}

export function updatePropertyData(patch: Record<string, unknown>) {
	const ann = selectedAnnotation.value;
	if (!ann) return;
	Object.assign(ann.propertyData, patch);
	markDirty(true);
	triggerRef(annotations);
	syncCurrentSheetIntoProject();
}
```

**Rewrite `clampAnnotationToImage`:**
```typescript
export function clampAnnotationToImage(
	annotation: Annotation,
	imgW: number = imageWidth.value,
	imgH: number = imageHeight.value,
) {
	const spec = activeSpec.value;
	if (!spec) return;
	clampToImage(annotation, spec, imgW, imgH);
}
```

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: All tests pass (annotation tests + spec tests)

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/state.ts
git commit -m "rewrite state.ts for spec-driven annotation model"
```

---

## Task 4: DynamicInspector Component

**Files:**
- Create: `src/mainview/src/components/DynamicInspector.vue`
- Modify: `src/mainview/src/components/Inspector.vue`

- [ ] **Step 1: Create DynamicInspector.vue**

The component receives the selected annotation and the active spec. It renders:
1. Entity type dropdown
2. Shape fields in a 2-column grid (all numeric inputs)
3. Property fields (type-appropriate inputs)

Key behaviors:
- Entity type dropdown calls `migrateEntityType` and updates the annotation in state
- Shape field inputs call `updateShapeData`
- Property field inputs call `updatePropertyData`
- Field input types: string→text, integer/number→number, boolean→checkbox, enum→select, string[]→text (comma-separated)

Read the current `Inspector.vue` for styling patterns (label classes, form layout). The `DynamicInspector` should match the visual style.

Props:
```typescript
const props = defineProps<{
	annotation: Annotation;
	spec: SpanSpec;
}>();
```

Emits: none (calls state functions directly via imports)

- [ ] **Step 2: Update Inspector.vue**

Replace the hardcoded form with:
```vue
<template>
	<div class="h-full flex flex-col overflow-hidden bg-surface-1" @contextmenu="onContextMenu">
		<div v-if="!activeSpec" class="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
			<span class="text-xs text-text-faint">Load a spec file to begin annotating.</span>
		</div>
		<div v-else-if="!selectedAnnotation" class="flex-1 flex flex-col items-center justify-center gap-2 text-center">
			<svg class="w-8 h-8 text-text-faint/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="4 2" />
				<path d="M9 12h6M12 9v6" stroke-linecap="round" />
			</svg>
			<span class="text-xs text-text-faint">Select an annotation</span>
		</div>
		<DynamicInspector v-else :annotation="selectedAnnotation" :spec="activeSpec" />
	</div>
</template>
```

Import `activeSpec` from state and `DynamicInspector`.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/components/DynamicInspector.vue src/mainview/src/components/Inspector.vue
git commit -m "add DynamicInspector with spec-driven field rendering"
```

---

## Task 5: ToolPalette Component

**Files:**
- Create: `src/mainview/src/components/ToolPalette.vue`

- [ ] **Step 1: Create ToolPalette.vue**

A vertical toolbar that lists entity types from the active spec. Each button shows the entity name and a shape icon. Clicking selects the active tool.

Props: none (reads `activeSpec` and `activeTool` from state)

Key markup structure:
```html
<div class="tool-palette">
  <button v-for="(entity, name) in activeSpec.entities" ...>
    <ShapeIcon :type="entity.shape.type" />
    <span>{{ name }}</span>
  </button>
</div>
```

Shape icons are inline SVGs:
- rect: `<rect>` outline
- point: crosshair / `+` mark
- circle: `<circle>` outline
- polygon: triangle/pentagon outline

Style: vertical strip, 36px wide buttons, dark background matching the canvas theme. Active tool has copper highlight.

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/ToolPalette.vue
git commit -m "add ToolPalette component for entity type selection"
```

---

## Task 6: Update CanvasView for Multi-Shape

**Files:**
- Modify: `src/mainview/src/composables/useCanvas.ts`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Update useCanvas.ts**

Extend `DragState` to support multi-shape:
```typescript
export interface DragState {
	id: string;
	mode: "move" | "resize" | "radius";
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startShapeData: Record<string, number>; // snapshot of shape data at drag start
}
```

Update `startDrag` to snapshot `shapeData` instead of individual fields.
Update `onPointerMove` to use `getShapeRect`/`getShapePosition` and write back through the mapping.

- [ ] **Step 2: Update CanvasView.vue**

Key changes:
- Add `<ToolPalette>` as a vertical bar on the left side of `.canvas-shell`
- Render annotations based on shape type:
  - rect: existing `.annotation-box` divs (use `getShapeRect` for positioning)
  - point: small crosshair markers positioned at `getShapePosition`
  - circle: SVG circle overlay
  - polygon: SVG polygon overlay
- Route click/drag creation to the active tool's shape type
- Import `activeSpec`, `activeTool` from state

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/composables/useCanvas.ts src/mainview/src/components/CanvasView.vue
git commit -m "update canvas for multi-shape rendering and tool palette"
```

---

## Task 7: Update AnnotationList

**Files:**
- Modify: `src/mainview/src/components/AnnotationList.vue`

- [ ] **Step 1: Update AnnotationList.vue**

Key changes:
- Show entity type as a small badge/tag next to the annotation name
- Use the first string property value as the display name (instead of hardcoded `.name`)
- Group by entity type + first-string-property (replaces the current hardcoded identity grouping)
- Import `activeSpec` from state to check if entity type is valid (show warning badge if not)

Read the current `AnnotationList.vue` for the existing grouping/collapsing pattern and adapt it.

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/AnnotationList.vue
git commit -m "update AnnotationList for spec-driven entity types"
```

---

## Task 8: Update GalleryPanel

**Files:**
- Modify: `src/mainview/src/components/GalleryPanel.vue`

- [ ] **Step 1: Update GalleryPanel.vue**

Key changes:
- Filter to only show annotations whose entity type has a `rect` shape (point/circle/polygon have no meaningful crop preview)
- Use `getShapeRect` instead of directly accessing `.x`, `.y`, `.width`, `.height`
- Use first string property as display name instead of hardcoded `.name`
- For animation grouping, look for an integer property named `frame` — if not found, use the first integer property. If no integer properties, each annotation is its own group.
- Import `activeSpec` from state

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/GalleryPanel.vue
git commit -m "update GalleryPanel for spec-driven rect-only previews"
```

---

## Task 9: Update main.ts Desktop Menu Handlers

**Files:**
- Modify: `src/mainview/main.ts`

- [ ] **Step 1: Update imports**

The `addAnnotationAtViewportCenter` function in `state.ts` now uses `activeSpec` and `activeTool` internally, so no changes to the function itself are needed. However, verify the import still works and remove any imports of removed functions (like `colorPickArmed`-related things if they were referenced).

- [ ] **Step 2: Commit if changes needed**

```bash
git add src/mainview/main.ts
git commit -m "update main.ts for new annotation model imports"
```

---

## Task 10: Add CSS for New Shapes

**Files:**
- Modify: `src/mainview/src/style.css`

- [ ] **Step 1: Add styles for point, circle, polygon annotations**

Add CSS for:
- `.annotation-point` — crosshair marker, 8px centered at position
- `.annotation-circle` — SVG circle container, same selection style as rect
- `.annotation-polygon` — SVG polygon container, vertex handles
- `.tool-palette` — vertical toolbar styling (dark bg, 36px buttons, copper active state)

Match the existing `.annotation-box` copper theme.

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "add CSS for point, circle, polygon annotations and tool palette"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run all tests**

Run: `bun test`
Expected: All annotation + spec tests pass

- [ ] **Step 2: Verify web build**

Run: `bun run build:web`
Expected: Build succeeds

- [ ] **Step 3: Manual testing checklist**

Since this sub-project removes the old annotation format and the new I/O isn't built yet (sub-project 3), the app won't load real projects. But verify:
- App boots without errors (desktop and web)
- No TypeScript compilation errors
- No import cycle issues

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```
