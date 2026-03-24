# Select Tool & Drawing Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a select tool as the default interaction mode, improve rect/circle drawing with deferred creation and live preview, and make the app start with panels visible while gating editing behind spec file presence.

**Architecture:** The select tool is represented by `activeTool === ""` (empty string). Drawing is refactored from immediate annotation creation on mousedown to a deferred model: track origin on mousedown, show a ghost preview during drag, and only create the annotation on mouseup if the drawn size exceeds a 4px threshold. The `LandingScreen` gate is removed so panels are always visible; the status bar shows "No spec file" when no spec is loaded.

**Tech Stack:** Vue 3, TypeScript, Dockview, Tailwind CSS

---

### Task 1: Remove auto-select of first entity on spec load

**Files:**
- Modify: `src/mainview/src/state.ts:224-228`

- [ ] **Step 1: Remove the auto-select lines in `loadSpec()`**

In `src/mainview/src/state.ts`, the `loadSpec()` function currently sets `activeTool` to the first entity label after parsing. Remove lines 225-228:

```ts
// DELETE these lines:
	// Set first entity as active tool
	if (result.entities.length > 0) {
		activeTool.value = result.entities[0].label;
	}
```

The function should go from setting `activeSpec.value = result;` directly to `statusText.value = "Spec loaded";`.

- [ ] **Step 2: Verify manually**

Run the dev server (`bun run hmr`), load the app, drop a spec file. Confirm that `activeTool` stays as `""` (select mode) — no entity tool should be auto-selected.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/state.ts
git commit -m "remove auto-select of first entity tool on spec load"
```

---

### Task 2: Remove LandingScreen gate, always show panels

**Files:**
- Modify: `src/mainview/src/App.vue:290-313` (template section)

- [ ] **Step 1: Remove the `v-if="workspaceReady"` / `v-else` conditional**

In `src/mainview/src/App.vue`, the template currently wraps the Dockview container in `<template v-if="workspaceReady">` and shows `<LandingScreen v-else .../>`. Change the template to always show the Dockview layout and status bar, removing the LandingScreen entirely:

```html
<template>
	<div class="app-shell" @contextmenu.prevent>
		<div class="dockview-theme-dark dockview-container">
			<DockviewVue @ready="onReady" />
		</div>
		<div
			class="px-3 py-1 border-t text-[11px] font-mono truncate transition-all duration-300 ease-out"
			:class="
				statusFlash
					? 'border-copper/40 bg-copper-glow text-copper-bright'
					: 'border-border bg-surface-1 text-text-faint'
			"
		>
			<div class="flex justify-between">
				<span class="truncate">{{ statusText }}</span>
				<span v-if="!activeSpec" class="text-danger shrink-0">No spec file</span>
			</div>
		</div>
	</div>
</template>
```

- [ ] **Step 2: Remove unused imports**

Remove the `LandingScreen` import and the `landingError` ref and `onLandingDrop` function from the `<script setup>` block since they are no longer used. Also remove the `LandingScreen` import statement:

```ts
// DELETE this import:
import LandingScreen from "./components/LandingScreen.vue";

// DELETE these:
const landingError = ref("");

// DELETE this function:
function onLandingDrop(files: File[]) {
	handleDroppedFiles(files);
}
```

Also remove all references to `landingError` inside `handleDroppedFiles` — replace `landingError.value = ...` with `statusText.value = ...` so errors still surface in the status bar. There are 5 occurrences:

- Line 78: `landingError.value = ""` → DELETE this line (the function already clears errors via statusText naturally)
- Line 104: `landingError.value = \`Spec errors: ...\`` → `statusText.value = \`Spec errors: ...\``
- Line 92: `landingError.value = "Failed to read .span file"` → `statusText.value = "Failed to read .span file"`
- Line 111: `landingError.value = "Failed to read spec file"` → `statusText.value = "Failed to read spec file"`
- Line 130: `landingError.value = "Failed to load image"` → `statusText.value = "Failed to load image"`

Add `activeSpec` to the imports from `./state` (it's needed by the status bar template). Remove the `workspaceReady` import from the state imports (line 10) since it's no longer used in App.vue.

- [ ] **Step 3: Verify manually**

Run the dev server. The app should now start showing the full panel layout immediately (Sheets, Canvas, Inspector, etc.) with no landing screen. The status bar should show "No spec file" right-aligned. Dropping images and spec files should still work via the global drag-and-drop handlers.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/App.vue
git commit -m "remove LandingScreen gate, always show panels with spec status in bar"
```

---

### Task 3: Add select tool to ToolPalette

**Files:**
- Modify: `src/mainview/src/components/ToolPalette.vue`

- [ ] **Step 1: Add select button and conditional entity tools**

Replace the entire `ToolPalette.vue` content:

```vue
<script setup lang="ts">
import { activeSpec, activeTool } from "../state";
import { getShapesForEntity } from "../spec/types";
</script>

<template>
  <div class="tool-palette">
    <!-- Select tool — always visible -->
    <button
      type="button"
      class="tool-button"
      :class="{ active: activeTool === '' }"
      title="Select"
      @click="activeTool = ''"
    >
      <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3l10 7.5-6 1-3 5.5z" fill="currentColor" />
      </svg>
      <span class="tool-label">Select</span>
    </button>

    <!-- Entity tools — only when spec is loaded -->
    <template v-if="activeSpec">
      <button
        v-for="entity in activeSpec.entities"
        :key="entity.label"
        type="button"
        class="tool-button"
        :class="{ active: activeTool === entity.label }"
        :title="entity.label"
        @click="activeTool = entity.label"
      >
        <template v-if="getShapesForEntity(entity).length > 0">
          <svg v-if="getShapesForEntity(entity)[0].shapeType === 'rect'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="5" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <svg v-else-if="getShapesForEntity(entity)[0].shapeType === 'point'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="2" fill="currentColor" />
            <path d="M10 4v4M10 12v4M4 10h4M12 10h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <svg v-else-if="getShapesForEntity(entity)[0].shapeType === 'circle'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <svg v-else-if="getShapesForEntity(entity)[0].shapeType === 'polygon'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="10,3 17,8 15,16 5,16 3,8" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </template>
        <span class="tool-label">{{ entity.label }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.tool-palette {
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface-0);
  border-right: 1px solid var(--color-border);
  width: 40px;
  overflow: hidden;
}

.tool-button {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  cursor: pointer;
  color: var(--color-text-faint);
  transition: color 0.15s;
  border: none;
  background: transparent;
  padding: 0.25rem;
}

.tool-button:hover {
  color: var(--color-text-dim);
}

.tool-button.active {
  color: var(--color-copper-bright);
  background-color: var(--color-copper-glow);
}

.tool-label {
  font-size: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  line-height: 1.2;
}
</style>
```

- [ ] **Step 2: Verify manually**

Run the dev server. The ToolPalette should show only the Select tool (cursor icon). After dropping a spec file, entity tools should appear below it. Clicking Select should set `activeTool` to `""`.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/components/ToolPalette.vue
git commit -m "add select tool to ToolPalette, gate entity tools behind spec"
```

---

### Task 4: Add `addAnnotationWithSize` to state and annotation

**Files:**
- Modify: `src/mainview/src/annotation.ts:26-57`
- Modify: `src/mainview/src/state.ts:155-165`

- [ ] **Step 1: Add size-aware annotation creation to `annotation.ts`**

Add a new function `createAnnotationWithSize` after the existing `createAnnotation` function in `src/mainview/src/annotation.ts`:

```ts
export function createAnnotationWithSize(
	spec: SpanSpec,
	entityType: string,
	position: { x: number; y: number },
	size: { width?: number; height?: number; radius?: number },
): Annotation {
	const annotation = createAnnotation(spec, entityType, position);

	// Override primary shape dimensions with drawn size
	const entity = getEntityByLabel(spec, entityType);
	if (!entity) return annotation;

	const shapes = getShapesForEntity(entity);
	if (shapes.length === 0) return annotation;

	const primary = shapes[0];
	const mapping = primary.mapping;
	if (!mapping) return annotation;

	const shapeData = annotation.shapes[primary.name];
	if (!shapeData) return annotation;

	if (mapping.type === "rect" && size.width !== undefined && size.height !== undefined) {
		shapeData[mapping.width] = size.width;
		shapeData[mapping.height] = size.height;
	} else if (mapping.type === "circle" && size.radius !== undefined) {
		shapeData[mapping.radius] = size.radius;
	}

	return annotation;
}
```

- [ ] **Step 2: Add `addAnnotationWithSize` to state.ts**

Add this new export after the existing `addAnnotation` function in `src/mainview/src/state.ts`:

```ts
export function addAnnotationWithSize(
	entityType: string,
	x: number,
	y: number,
	...sizeArgs: number[]
) {
	const spec = activeSpec.value;
	const sheet = currentSheet.value;
	if (!spec || !getEntityByLabel(spec, entityType) || !sheet) return;

	const entity = getEntityByLabel(spec, entityType)!;
	const shapes = getShapesForEntity(entity);
	const shapeType = shapes[0]?.shapeType;

	let size: { width?: number; height?: number; radius?: number } = {};
	if (shapeType === "rect") {
		size = { width: sizeArgs[0], height: sizeArgs[1] };
	} else if (shapeType === "circle") {
		size = { radius: sizeArgs[0] };
	}

	const annotation = createAnnotationWithSize(spec, entityType, { x, y }, size);
	sheet.annotations.push(annotation);
	selectedId.value = annotation.id;
	markDirty(true);
}
```

Add the imports at the top of `state.ts`:

```ts
import { createAnnotation, duplicateAnnotation, clampToImage, createAnnotationWithSize } from "./annotation";
```

Also add `getShapesForEntity` to the imports from `./spec/types` if not already present.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/annotation.ts src/mainview/src/state.ts
git commit -m "add size-aware annotation creation for deferred drawing"
```

---

### Task 5: Add select mode behavior, deferred drawing, and crosshair cursor to canvas

**Files:**
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Add `addAnnotationWithSize` import**

Add `addAnnotationWithSize` to the imports from `../state` in `src/mainview/src/components/CanvasView.vue` (around line 13-25):

```ts
import {
	// ... existing imports ...
	addAnnotationWithSize,
} from "../state";
```

- [ ] **Step 2: Update `handleLayerPointerDown` for select mode**

In `src/mainview/src/components/CanvasView.vue`, replace the `handleLayerPointerDown` function (lines 277-315) with:

```ts
function handleLayerPointerDown(event: PointerEvent) {
	if (isPanning.value || spaceHeld.value) return;

	// Select mode: click empty canvas to deselect
	if (!activeTool.value) {
		selectAnnotation(null);
		return;
	}

	// Draw mode: guard behind activeSpec
	if (!activeSpec.value) return;

	const entity = getEntityByLabel(activeSpec.value, activeTool.value);
	if (!entity) return;

	const stageEl = stage.value;
	if (!stageEl) return;
	const rect = stageEl.getBoundingClientRect();
	const x = Math.round((event.clientX - rect.left) / zoom.value);
	const y = Math.round((event.clientY - rect.top) / zoom.value);

	const shapes = getShapesForEntity(entity);
	if (shapes.length === 0) return;

	const primaryShape = shapes[0];
	const shapeType = primaryShape.shapeType;

	if (shapeType === "point") {
		event.preventDefault();
		event.stopPropagation();
		addAnnotation(x, y);
	} else if (shapeType === "rect" || shapeType === "circle") {
		event.preventDefault();
		event.stopPropagation();
		drawing.value = {
			originX: x,
			originY: y,
			currentX: x,
			currentY: y,
			entityType: activeTool.value,
			shapeType,
		};
		stageEl.setPointerCapture(event.pointerId);
	}
	// polygon: no-op
}
```

- [ ] **Step 3: Add the `DrawingState` interface and `drawing` ref**

Add near the top of the `<script setup>` block (after the existing `useCanvas()` destructure on line 35):

```ts
interface DrawingState {
	originX: number;
	originY: number;
	currentX: number;
	currentY: number;
	entityType: string;
	shapeType: "rect" | "circle";
}

const drawing = ref<DrawingState | null>(null);
```

- [ ] **Step 4: Update `handleLayerPointerMove` and `handleLayerPointerUp`**

Replace the existing `handleLayerPointerMove` and `handleLayerPointerUp` functions (lines 317-325):

```ts
function handleLayerPointerMove(event: PointerEvent) {
	// Drawing preview takes priority
	if (drawing.value) {
		const stageEl = stage.value;
		if (!stageEl) return;
		const rect = stageEl.getBoundingClientRect();
		drawing.value.currentX = Math.round((event.clientX - rect.left) / zoom.value);
		drawing.value.currentY = Math.round((event.clientY - rect.top) / zoom.value);
		return;
	}
	onPointerMove(event, imageWidth.value, imageHeight.value);
}

function handleLayerPointerUp(event: PointerEvent) {
	const el = event.currentTarget as HTMLElement;
	el.releasePointerCapture(event.pointerId);

	if (drawing.value) {
		commitDrawing();
		return;
	}
	endDrag();
}
```

- [ ] **Step 5: Add `commitDrawing()` function**

Add this function after `handleLayerPointerUp`:

```ts
const DRAW_MIN_THRESHOLD = 4; // image-space pixels

function commitDrawing() {
	const d = drawing.value;
	drawing.value = null;
	if (!d) return;

	if (d.shapeType === "rect") {
		const w = Math.abs(d.currentX - d.originX);
		const h = Math.abs(d.currentY - d.originY);
		if (w < DRAW_MIN_THRESHOLD || h < DRAW_MIN_THRESHOLD) return;

		const x = Math.min(d.originX, d.currentX);
		const y = Math.min(d.originY, d.currentY);
		addAnnotationWithSize(d.entityType, x, y, w, h);
	} else if (d.shapeType === "circle") {
		const r = Math.round(Math.sqrt(
			(d.currentX - d.originX) ** 2 + (d.currentY - d.originY) ** 2,
		));
		if (r < DRAW_MIN_THRESHOLD) return;

		addAnnotationWithSize(d.entityType, d.originX, d.originY, r);
	}
}
```

- [ ] **Step 6: Add crosshair cursor class**

Add a computed for the annotation layer cursor class. Add near the other computed properties:

```ts
const layerCursorClass = computed(() => {
	if (spaceHeld.value && !isPanning.value) return '';
	if (isPanning.value) return '';
	if (activeTool.value) return 'cursor-crosshair';
	return '';
});
```

In the template, add the cursor class to the `.annotation-layer` div (line 438):

```html
<div class="annotation-layer" :class="layerCursorClass" :style="{
```

- [ ] **Step 7: Verify manually**

Run the dev server. In select mode (default), clicking empty canvas should deselect. After choosing an entity tool, the canvas should show a crosshair cursor and clicking should NOT immediately create an annotation (for rect/circle tools).

- [ ] **Step 8: Commit**

```bash
git add src/mainview/src/components/CanvasView.vue
git commit -m "add select mode deselect, deferred drawing, crosshair cursor"
```

---

### Task 6: Add drawing preview overlay

**Files:**
- Modify: `src/mainview/src/components/CanvasView.vue` (template section)
- Modify: `src/mainview/src/style.css`

- [ ] **Step 1: Add preview computed properties**

Add these computed properties in the `<script setup>` block of `CanvasView.vue`, near the other style helpers:

```ts
const drawPreviewStyle = computed(() => {
	const d = drawing.value;
	if (!d) return {};

	if (d.shapeType === "rect") {
		const x = Math.min(d.originX, d.currentX);
		const y = Math.min(d.originY, d.currentY);
		const w = Math.abs(d.currentX - d.originX);
		const h = Math.abs(d.currentY - d.originY);
		return {
			left: `${x * zoom.value}px`,
			top: `${y * zoom.value}px`,
			width: `${w * zoom.value}px`,
			height: `${h * zoom.value}px`,
			borderRadius: '0px',
		};
	}

	if (d.shapeType === "circle") {
		const r = Math.sqrt(
			(d.currentX - d.originX) ** 2 + (d.currentY - d.originY) ** 2,
		);
		const diameter = r * 2 * zoom.value;
		return {
			left: `${(d.originX - r) * zoom.value}px`,
			top: `${(d.originY - r) * zoom.value}px`,
			width: `${diameter}px`,
			height: `${diameter}px`,
			borderRadius: '50%',
		};
	}

	return {};
});
```

- [ ] **Step 2: Add preview element in template**

In the `CanvasView.vue` template, add the preview div inside the `.annotation-layer` div, after the annotation templates and before the closing `</div>` of the annotation layer (just before line 510 `</div>`):

```html
						<!-- Drawing preview -->
						<div
							v-if="drawing"
							class="draw-preview"
							:style="drawPreviewStyle"
						></div>
```

- [ ] **Step 3: Add CSS for preview**

Add to `src/mainview/src/style.css`:

```css
.draw-preview {
	position: absolute;
	border: 1.5px dashed var(--color-copper-bright);
	background: color-mix(in srgb, var(--color-copper-bright) 8%, transparent);
	pointer-events: none;
	z-index: 9999;
}
```

- [ ] **Step 4: Verify manually**

Run the dev server, load a spec, select a rect entity tool, click and drag on the canvas. A dashed rectangle preview should appear and follow the mouse. Releasing should create the annotation at the drawn size if large enough, or discard if too small. Test the same with a circle entity tool.

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/components/CanvasView.vue src/mainview/src/style.css
git commit -m "add live drawing preview overlay for rect and circle creation"
```

---

### Task 7: Final integration verification

- [ ] **Step 1: Full manual test**

Run the full app with `bun run dev:hmr`. Verify the following scenarios:

1. App starts showing all panels, no landing screen
2. Status bar shows "No spec file" right-aligned
3. Only Select tool in palette, crosshair cursor NOT shown
4. Drop a spec file — entity tools appear, "Spec loaded" in status bar
5. Select tool remains active (no auto-switch)
6. Click empty canvas in select mode — deselects any selected annotation
7. Switch to a rect entity tool — crosshair cursor appears on canvas
8. Click-drag on empty canvas — preview rect follows mouse
9. Release with >4px size — annotation created at drawn size
10. Quick click (below threshold) — no annotation created
11. Click on an existing annotation in draw mode — selects it, doesn't create new one
12. Test circle entity tool — preview circle follows mouse during drag
13. Point entity tool — single click creates point (unchanged behavior)
14. Space+drag and MMB still pan normally
15. Drop images — sheets appear, images render in canvas

- [ ] **Step 2: Commit any fixes if needed**

If any issues found during testing, fix and commit individually.
