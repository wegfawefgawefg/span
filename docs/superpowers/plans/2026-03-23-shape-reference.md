# Shape References (`__reference`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `__reference` support to shape specs so that secondary shapes store coordinates as relative offsets from a named reference shape.

**Architecture:** The `ShapeSpecField` type gains a `reference: string | null` field. Coordinates for referenced shapes are stored as relative offsets. `getShapeRect`/`getShapePosition` resolve references to compute absolute positions for rendering. Dragging a reference shape moves it absolutely; referenced shapes follow for free. Export outputs raw stored values (already relative).

**Tech Stack:** Vue 3, TypeScript

---

### Task 1: Add `reference` field to `ShapeSpecField` type

**Files:**
- Modify: `src/mainview/src/spec/types.ts:35-42`

- [ ] **Step 1: Add the reference field**

In `src/mainview/src/spec/types.ts`, add `reference: string | null;` to the `ShapeSpecField` interface:

```ts
export interface ShapeSpecField {
	kind: "shape";
	name: string;
	shapeType: ShapeType;
	shapeFields: ShapeField[];
	mapping: ShapeMapping | null;
	reference: string | null;  // name of referenced shape, or null
	warnings: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/spec/types.ts
git commit -m "add reference field to ShapeSpecField type"
```

---

### Task 2: Parse `__reference` from spec

**Files:**
- Modify: `src/mainview/src/spec/parse.ts:152-181`

- [ ] **Step 1: Extract `__reference` in `buildShapeField()`**

In `src/mainview/src/spec/parse.ts`, update the `buildShapeField` function to extract `__reference` and exclude it from shape data fields:

```ts
function buildShapeField(name: string, obj: Record<string, unknown>): ShapeSpecField {
	const shapeType = obj.__shape as ShapeType;
	const reference = typeof obj.__reference === "string" ? obj.__reference : null;

	// Extract shape fields (everything except __shape and __reference)
	const shapeFields: ShapeField[] = [];
	for (const [fieldName, fieldType] of Object.entries(obj)) {
		if (fieldName === "__shape" || fieldName === "__reference") continue;

		if (shapeType === "polygon" && typeof fieldType === "object") {
			shapeFields.push({ name: fieldName, valueType: "integer" });
		} else {
			shapeFields.push({
				name: fieldName,
				valueType: fieldType as "integer" | "number",
			});
		}
	}

	const inference = inferShapeMapping(shapeType, shapeFields);

	return {
		kind: "shape",
		name,
		shapeType,
		shapeFields,
		mapping: inference.mapping,
		reference,
		warnings: inference.warnings,
	};
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/spec/parse.ts
git commit -m "parse __reference from shape spec fields"
```

---

### Task 3: Validate `__reference` in spec validation

**Files:**
- Modify: `src/mainview/src/spec/validate.ts:159-245`

- [ ] **Step 1: Exclude `__reference` from field count and add reference validation**

In `src/mainview/src/spec/validate.ts`, update `validateShapeField` to exclude `__reference` from the field count check (line 176):

```ts
const shapeFieldEntries = Object.entries(obj).filter(([k]) => k !== "__shape" && k !== "__reference");
```

- [ ] **Step 2: Add entity-level reference validation**

After the per-field validation loop in `validateSpec` (after line 153, before the closing `}` of the entity loop), add reference validation for all shape fields within the entity:

```ts
		// Validate __reference fields within shape properties
		const shapeNames: string[] = [];
		for (const [fieldName, fieldValue] of Object.entries(properties)) {
			if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) {
				const obj = fieldValue as Record<string, unknown>;
				if ("__shape" in obj) {
					shapeNames.push(fieldName);
				}
			}
		}

		for (const [fieldName, fieldValue] of Object.entries(properties)) {
			if (typeof fieldValue !== "object" || fieldValue === null || Array.isArray(fieldValue)) continue;
			const obj = fieldValue as Record<string, unknown>;
			if (!("__shape" in obj) || !("__reference" in obj)) continue;

			const fPath = `${ePath}.properties.${fieldName}`;
			const ref = obj.__reference;

			if (typeof ref !== "string") {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `__reference must be a string` });
				continue;
			}

			// Self-reference
			if (ref === fieldName) {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `Shape "${fieldName}" cannot reference itself` });
				continue;
			}

			// Target must exist as a shape in this entity
			if (!shapeNames.includes(ref)) {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `Reference target "${ref}" is not a shape in this entity` });
				continue;
			}

			// Forward-only: target must appear before this shape in spec order
			const targetIndex = shapeNames.indexOf(ref);
			const selfIndex = shapeNames.indexOf(fieldName);
			if (targetIndex >= selfIndex) {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `Reference target "${ref}" must appear before "${fieldName}" in spec order` });
				continue;
			}

			// Polygon cannot have __reference
			if (obj.__shape === "polygon") {
				errors.push({ path: `${fPath}.__reference`, severity: "error", message: `Polygon shapes cannot use __reference` });
			}

			// Note: the spec requires "both referencing and referenced shapes must have a mapping."
			// This is implicitly guaranteed: any shape that passes the field-count validation in
			// validateShapeField will always produce a mapping from inferShapeMapping. No additional
			// check is needed here.
		}
```

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/spec/validate.ts
git commit -m "validate __reference: target exists, no self-ref, forward-only, no polygons"
```

---

### Task 4: Reference resolution in `getShapeRect` and `getShapePosition`

**Files:**
- Modify: `src/mainview/src/annotation.ts:130-187`

- [ ] **Step 1: Add a helper function to resolve a shape's absolute position**

Add this helper function before `getShapeRect` in `annotation.ts`:

```ts
/**
 * Resolve the absolute position of a shape, following __reference chains.
 * Returns the absolute x/y by adding stored offsets to the reference shape's resolved position.
 */
function resolveAbsolutePosition(
	annotation: Annotation,
	spec: SpanSpec,
	shapeName: string,
): { x: number; y: number } | null {
	const entity = getEntityByLabel(spec, annotation.entityType);
	if (!entity) return null;

	const sf = getShapesForEntity(entity).find((s) => s.name === shapeName);
	if (!sf?.mapping) return null;

	const shapeData = annotation.shapes[shapeName];
	if (!shapeData) return null;

	let x: number;
	let y: number;

	switch (sf.mapping.type) {
		case "rect":
		case "point":
		case "circle":
			x = shapeData[sf.mapping.x];
			y = shapeData[sf.mapping.y];
			break;
		default:
			return null;
	}

	if (sf.reference) {
		const refPos = resolveAbsolutePosition(annotation, spec, sf.reference);
		if (refPos) {
			x += refPos.x;
			y += refPos.y;
		}
	}

	return { x, y };
}
```

- [ ] **Step 2: Update `getShapeRect` to use reference resolution**

Replace `getShapeRect`:

```ts
export function getShapeRect(
	annotation: Annotation,
	spec: SpanSpec,
	shapeName: string,
): { x: number; y: number; width: number; height: number } | null {
	const entity = getEntityByLabel(spec, annotation.entityType);
	if (!entity) return null;

	const shapeField = getShapesForEntity(entity).find(
		(s) => s.name === shapeName,
	);
	if (!shapeField) return null;

	const mapping = shapeField.mapping;
	if (!mapping || mapping.type !== "rect") return null;

	const shapeData = annotation.shapes[shapeName];
	if (!shapeData) return null;

	const pos = resolveAbsolutePosition(annotation, spec, shapeName);
	if (!pos) return null;

	return {
		x: pos.x,
		y: pos.y,
		width: shapeData[mapping.width],
		height: shapeData[mapping.height],
	};
}
```

- [ ] **Step 3: Update `getShapePosition` to use reference resolution**

Replace `getShapePosition`:

```ts
export function getShapePosition(
	annotation: Annotation,
	spec: SpanSpec,
	shapeName: string,
): { x: number; y: number } | null {
	return resolveAbsolutePosition(annotation, spec, shapeName);
}
```

- [ ] **Step 4: Export `resolveAbsolutePosition` for use by useCanvas**

Change `function resolveAbsolutePosition` to `export function resolveAbsolutePosition`.

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/annotation.ts
git commit -m "add reference resolution to getShapeRect and getShapePosition"
```

---

### Task 5: Update annotation creation for referenced shapes

**Files:**
- Modify: `src/mainview/src/annotation.ts:26-96`

- [ ] **Step 1: Update `createAnnotation` to use relative defaults for referenced shapes**

In `createAnnotation`, change the shape creation loop to pass `{ x: 0, y: 0 }` for referenced shapes instead of the click position with offset:

```ts
	for (let i = 0; i < shapeFields.length; i++) {
		const sf = shapeFields[i];
		const isPrimary = i === 0;

		let pos: { x: number; y: number };
		if (sf.reference) {
			// Referenced shapes store relative offsets — default to 0,0
			pos = { x: 0, y: 0 };
		} else {
			const offset = isPrimary ? 0 : i * 4;
			pos = { x: position.x + offset, y: position.y + offset };
		}

		shapes[sf.name] = buildShapeDefaults(sf, pos);
	}
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/annotation.ts
git commit -m "default referenced shapes to 0,0 relative offset on creation"
```

---

### Task 6: Update dragging for referenced shapes

**Files:**
- Modify: `src/mainview/src/composables/useCanvas.ts:98-239`

- [ ] **Step 1: Add import for `resolveAbsolutePosition`**

Add to the imports at the top of `useCanvas.ts`:

```ts
import { resolveAbsolutePosition } from "../annotation";
```

- [ ] **Step 2: Add `applyMoveDeltaUnclamped` for referenced shapes**

Add this function after `applyMoveDelta`:

```ts
	function applyMoveDeltaUnclamped(
		shapeData: Record<string, number>,
		startData: Record<string, number>,
		mapping: ShapeMapping,
		deltaX: number,
		deltaY: number,
	) {
		switch (mapping.type) {
			case "rect":
				shapeData[mapping.x] = Math.round(startData[mapping.x] + deltaX);
				shapeData[mapping.y] = Math.round(startData[mapping.y] + deltaY);
				break;
			case "point":
				shapeData[mapping.x] = Math.round(startData[mapping.x] + deltaX);
				shapeData[mapping.y] = Math.round(startData[mapping.y] + deltaY);
				break;
			case "circle":
				shapeData[mapping.x] = Math.round(startData[mapping.x] + deltaX);
				shapeData[mapping.y] = Math.round(startData[mapping.y] + deltaY);
				break;
		}
	}
```

- [ ] **Step 3: Update group-move to skip referenced shapes**

In `onPointerMove`, the group-move block (lines 178-187) currently applies delta to ALL shapes. Change it to skip shapes with a reference:

```ts
		if (d.mode === "move") {
			if (isPrimaryDrag) {
				// Group move: apply delta to non-referenced shapes only
				// Referenced shapes follow their reference automatically
				for (const sf of shapeFields) {
					if (sf.reference) continue; // skip — follows reference parent
					const mapping = sf.mapping;
					if (!mapping) continue;
					const shapeData = ann.shapes[sf.name];
					const startData = d.startShapeData[sf.name];
					if (!shapeData || !startData) continue;
					applyMoveDelta(shapeData, startData, mapping, deltaX, deltaY, imageWidth, imageHeight);
				}
			} else {
				// Secondary shape: move only this shape
				const sf = shapeFields.find((s) => s.name === d.shapeName);
				if (!sf?.mapping) return;
				const shapeData = ann.shapes[d.shapeName];
				const startData = d.startShapeData[d.shapeName];
				if (!shapeData || !startData) return;
				if (sf.reference) {
					// Referenced shape: update relative offset, no clamping
					applyMoveDeltaUnclamped(shapeData, startData, sf.mapping, deltaX, deltaY);
				} else {
					applyMoveDelta(shapeData, startData, sf.mapping, deltaX, deltaY, imageWidth, imageHeight);
				}
			}
```

- [ ] **Step 4: Update resize to resolve absolute position for clamping**

In the resize block (lines 197-217), the clamping uses `shapeData[mapping.x]` which is a relative offset for referenced shapes. Resolve the absolute position:

```ts
		} else if (d.mode === "resize") {
			const sf = shapeFields.find((s) => s.name === d.shapeName);
			if (!sf?.mapping || sf.mapping.type !== "rect") return;
			const mapping = sf.mapping;
			const shapeData = ann.shapes[d.shapeName];
			const startData = d.startShapeData[d.shapeName];
			if (!shapeData || !startData) return;

			if (sf.reference) {
				// Referenced shape: no clamping on resize
				shapeData[mapping.width] = Math.max(1, Math.round(startData[mapping.width] + deltaX));
				shapeData[mapping.height] = Math.max(1, Math.round(startData[mapping.height] + deltaY));
			} else {
				const x = shapeData[mapping.x] as number;
				const y = shapeData[mapping.y] as number;
				shapeData[mapping.width] = clamp(
					Math.round(startData[mapping.width] + deltaX),
					1,
					imageWidth - x,
				);
				shapeData[mapping.height] = clamp(
					Math.round(startData[mapping.height] + deltaY),
					1,
					imageHeight - y,
				);
			}
```

- [ ] **Step 5: Update radius drag to resolve absolute center**

In the radius block (lines 218-235), the center position uses stored x/y which are relative for referenced shapes. Resolve absolute position:

```ts
		} else if (d.mode === "radius") {
			const sf = shapeFields.find((s) => s.name === d.shapeName);
			if (!sf?.mapping || sf.mapping.type !== "circle") return;
			const mapping = sf.mapping;
			const startData = d.startShapeData[d.shapeName];
			const shapeData = ann.shapes[d.shapeName];
			if (!shapeData || !startData) return;

			// Resolve absolute center for distance computation
			let cx = startData[mapping.x];
			let cy = startData[mapping.y];
			if (sf.reference && spec) {
				const absPos = resolveAbsolutePosition(ann, spec, d.shapeName);
				if (absPos) {
					// Use resolved absolute position but with startData offsets
					// We need the reference's position at drag start + stored offset at drag start
					const refPos = resolveAbsolutePosition(ann, spec, sf.reference);
					if (refPos) {
						cx = refPos.x + startData[mapping.x];
						cy = refPos.y + startData[mapping.y];
					}
				}
			}

			const stageEl = event.currentTarget as HTMLElement;
			const rect = stageEl.getBoundingClientRect();
			const pointerX = (event.clientX - rect.left) / zoom.value;
			const pointerY = (event.clientY - rect.top) / zoom.value;
			const dist = Math.sqrt((pointerX - cx) ** 2 + (pointerY - cy) ** 2);
			shapeData[mapping.radius] = Math.max(1, Math.round(dist));
		}
```

- [ ] **Step 6: Commit**

```bash
git add src/mainview/src/composables/useCanvas.ts
git commit -m "update drag logic for referenced shapes: skip group-move, unclamped offsets, resolve absolute for resize/radius"
```

---

### Task 7: Skip referenced shapes in `clampToImage`

**Files:**
- Modify: `src/mainview/src/annotation.ts:318-373`

- [ ] **Step 1: Add reference check to `clampToImage` loop**

In the `clampToImage` function, skip shapes that have a reference:

```ts
	for (const sf of shapeFields) {
		if (sf.reference) continue; // referenced shapes use relative offsets — skip clamping

		const shapeData = annotation.shapes[sf.name];
		if (!shapeData) continue;
		// ... rest unchanged
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/annotation.ts
git commit -m "skip referenced shapes in clampToImage"
```

---

### Task 8: Show reference label in DynamicInspector

**Files:**
- Modify: `src/mainview/src/components/DynamicInspector.vue:119-141`

- [ ] **Step 1: Add reference indicator to shape section header**

In `DynamicInspector.vue`, update the shape section header button (around line 137) to show the reference info. Change:

```html
					{{ shape.name }} ({{ shape.shapeType }})
```

To:

```html
					{{ shape.name }} ({{ shape.shapeType }})
					<span v-if="shape.reference" class="normal-case tracking-normal text-text-faint">
						relative to {{ shape.reference }}
					</span>
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/DynamicInspector.vue
git commit -m "show reference indicator in inspector shape section headers"
```

---

### Task 9: Final integration verification

- [ ] **Step 1: Full manual test**

Run the app with `bun run dev:hmr`. Use the example spec (`example_project/example_spec.yaml`) which has `collision` and `origin` with `__reference: slice`. Verify:

1. Spec loads without validation errors
2. ToolPalette shows entity tools (Sprite, Tile, Waypoint)
3. Create a Sprite annotation by drawing a rect — slice created at drawn position
4. In inspector: slice shows absolute coords; collision and origin show "relative to slice" and values of `0, 0`
5. Drag the slice (primary shape) — collision and origin move with it, their offset values don't change
6. Drag the collision rect — only its relative offset updates, slice stays put
7. Drag the origin point — only its relative offset updates
8. Resize collision rect — no clamping issues
9. Create a Tile annotation — no `__reference`, behaves as before (absolute coords)
10. Export — collision/origin values are relative offsets in the output

- [ ] **Step 2: Commit any fixes**

If issues found, fix and commit individually.
