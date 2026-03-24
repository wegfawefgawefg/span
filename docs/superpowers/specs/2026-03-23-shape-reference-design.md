# Shape References (`__reference`)

## Problem

In sprite annotation specs, secondary shapes like `collision` and `origin` are semantically positioned relative to a primary shape like `slice`. Currently all shape coordinates are stored and rendered as absolute image-space values, which means:

- Moving the primary shape doesn't automatically reposition dependent shapes in a meaningful way (group-move applies the same delta, but the relationship isn't semantic)
- Exported coordinates are absolute, not relative — consumers must compute offsets themselves
- There's no way for the spec to declare that one shape's coordinate space is anchored to another

The `__reference` field solves this by declaring that a shape's coordinates are offsets from another shape's position.

## Spec Format

A shape object can include `__reference: <shapeName>` alongside `__shape`:

```yaml
- label: Sprite
  group: sprites
  properties:
    slice:
      __shape: rect
      x: integer
      y: integer
      width: integer
      height: integer
    collision:
      __shape: rect
      __reference: slice
      x: integer
      y: integer
      width: integer
      height: integer
    origin:
      __shape: point
      __reference: slice
      x: integer
      y: integer
```

Here, `collision.x=5` means "5px right of slice's x position." `origin.x=8, origin.y=8` means "8px right and 8px down from slice's top-left."

## Design

### 1. Spec Parsing & Types

**`ShapeSpecField`** gains a new field:

```ts
export interface ShapeSpecField {
  kind: "shape";
  name: string;
  shapeType: ShapeType;
  shapeFields: ShapeField[];
  mapping: ShapeMapping | null;
  reference: string | null;  // NEW — name of referenced shape, or null
  warnings: string[];
}
```

**Parsing (`buildShapeField`):**
- Extract `__reference` from the shape object (alongside `__shape`)
- Store as `reference` on the `ShapeSpecField`
- Exclude `__reference` from the list of shape data fields (like `__shape` is excluded)

**Validation:**
- `__reference` value must be the name of another shape field in the same entity
- No self-references (`collision` cannot reference itself)
- No circular references (if A references B, B cannot reference A or anything that chains back to A)
- Reference target must appear before the referencing shape in spec order (enforces DAG and makes resolution order deterministic)
- Only shapes with a `mapping` can be referenced (the reference needs x/y to resolve)

### 2. Storage Model

Referenced shapes store **relative offsets** from their reference shape's position:

- `annotation.shapes["collision"].x = 5` → 5px right of `slice.x`
- `annotation.shapes["collision"].y = 0` → same y as `slice.y`
- Non-referenced shapes (like `slice`) store absolute image-space coordinates (unchanged)

This means:
- Moving the reference shape automatically repositions all dependent shapes (offsets don't change)
- Export outputs stored values directly (they're already relative)
- Only rendering needs to resolve the reference chain to compute absolute positions

### 3. Canvas Rendering — Reference Resolution

`getShapeRect` and `getShapePosition` in `annotation.ts` gain reference resolution. When computing a shape's position:

1. Look up the shape's `ShapeSpecField`
2. If `reference` is null, return stored values directly (current behavior)
3. If `reference` is set, recursively resolve the reference shape's absolute position, then add the stored offsets

```
absoluteX = refAbsoluteX + storedOffsetX
absoluteY = refAbsoluteY + storedOffsetY
```

Reference chains (A → B → C) resolve recursively. Since validation enforces no cycles and forward-reference-only ordering, recursion always terminates.

The style helpers in `CanvasView.vue` (`boxStyle`, `pointStyle`, `circleStyle`) consume the resolved absolute positions — they don't change.

### 4. Annotation Creation

**`createAnnotation` / `buildShapeDefaults`:**
- For shapes with a reference, default coordinates to `0, 0` (same position as reference shape) instead of the annotation's click position
- Width/height/radius defaults remain unchanged (e.g., 16x16 for rects)

**`createAnnotationWithSize` (deferred drawing):**
- The drawn position (absolute image-space) is converted to a relative offset by subtracting the reference shape's absolute position before storing
- This requires the reference shape's data to already exist in the annotation (guaranteed because referenced shapes come after their reference in spec order, and `createAnnotation` processes shapes in order)

### 5. Dragging

**Moving a reference shape (e.g., slice):**
- Updates only the reference shape's absolute coordinates
- Referenced shapes follow automatically because their stored offsets don't change
- The current group-move logic (primary shape drags all shapes) must be updated: **skip shapes that have a `reference`** in the group-move loop. They follow their reference parent without needing explicit updates.

**Moving a referenced shape (e.g., collision):**
- The delta from the drag is applied to the stored offset values (not absolute coordinates)
- The drag math is the same (start value + delta), but the clamping logic changes:
  - Currently clamps to image bounds (0 to imageWidth/imageHeight)
  - For referenced shapes, clamping is not applied (spec says "free to go outside" the reference)
  - However, the *resolved absolute position* should still be reasonable — but since the user explicitly said no bounds constraint, just apply the delta without clamping

**`applyMoveDelta` changes:**
- Needs to know whether a shape has a reference
- If referenced: apply delta to stored offset directly, no clamping
- If not referenced: current behavior (apply delta, clamp to image bounds)

**Resize and radius drags:**
- Work on stored values directly — unchanged, since width/height/radius are not affected by the reference system (only x/y position is relative)

### 6. Export

No changes needed. The export already reads `annotation.shapes[shapeName][fieldName]` and outputs the raw values. Since referenced shapes store relative offsets, the exported values are already relative.

### 7. Inspector

**DynamicInspector.vue:**
- For shape sections that have a reference, show a label like "(relative to slice)" in the collapsible section header
- The input fields show the stored offset values (which is what the user wants — "how far from the reference")
- No special conversion needed

## Files Changed

| File | Change |
|------|--------|
| `src/mainview/src/spec/types.ts` | Add `reference: string \| null` to `ShapeSpecField` |
| `src/mainview/src/spec/parse.ts` | Extract `__reference` in `buildShapeField()`, exclude from data fields |
| `src/mainview/src/spec/validate.ts` | Allow `__reference` as reserved key, validate target exists, no cycles, forward-only |
| `src/mainview/src/annotation.ts` | Reference resolution in `getShapeRect`/`getShapePosition`; relative defaults in `buildShapeDefaults`; offset conversion in `createAnnotationWithSize` |
| `src/mainview/src/composables/useCanvas.ts` | Skip referenced shapes in group-move; no-clamp mode for referenced shape drags |
| `src/mainview/src/components/DynamicInspector.vue` | Show "(relative to X)" label on referenced shape sections |

## Files NOT Changed

| File | Reason |
|------|--------|
| `src/mainview/src/export.ts` | Stored values are already relative — export outputs them directly |
| `src/mainview/src/components/CanvasView.vue` | Consumes resolved absolute positions from `getShapeRect`/`getShapePosition` — no changes needed |
| `src/mainview/src/components/ToolPalette.vue` | Tool selection unaffected |
| `src/mainview/src/state.ts` | State actions call into `annotation.ts` — no direct changes needed |

## Edge Cases

- **Reference chain resolution:** A → B → C resolves recursively. Validation ensures no cycles.
- **Deleting a reference target:** Not applicable — shapes are defined by the spec, not user-deletable individually.
- **Spec reload with different references:** `activeTool` resets to select mode (already implemented). Existing annotations may have stale data — this is handled by the existing spec-diff/migration system.
- **Creating annotation via deferred drawing:** The drawn absolute position is converted to relative offset at creation time. The reference shape's data is guaranteed to exist because shapes are processed in spec order.
- **Negative offsets:** Valid — a collision rect can be positioned above/left of its reference shape.
