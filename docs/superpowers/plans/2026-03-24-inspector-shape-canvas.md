# Inspector Shape Canvases & Canvas Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Filter the main canvas to only show the preview shape per annotation, and add interactive mini-canvases in the inspector for editing each shape over a cropped sprite image.

**Architecture:** CanvasView's `getShapesForAnnotation` is filtered to return only the preview shape. A new `ShapeCanvas.vue` component renders a cropped spritesheet region as a `<canvas>` background with DOM overlay elements for shapes (reusing existing CSS classes). Each shape section in DynamicInspector embeds a ShapeCanvas with inline drag handling.

**Tech Stack:** Vue 3, TypeScript, Canvas 2D API, existing Tailwind + CSS shape styles

---

### Task 1: Filter main canvas to preview shape only

**Files:**
- Modify: `src/mainview/src/components/CanvasView.vue:185-198`

- [ ] **Step 1: Update `getShapesForAnnotation` to filter**

Import `getPreviewShapeName` from `../state` (add to existing state imports around line 13-25). Then replace the `getShapesForAnnotation` function:

```ts
function getShapesForAnnotation(annotation: Annotation): ShapeRenderInfo[] {
	if (!activeSpec.value) return [];
	const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
	if (!entity) return [];
	const shapes = getShapesForEntity(entity);
	const previewName = getPreviewShapeName(annotation.entityType);

	// Only show the preview shape on the main canvas
	return shapes
		.filter((sf) => sf.name === previewName)
		.map((sf, index) => ({
			annotation,
			shapeName: sf.name,
			shapeField: sf,
			shapeIndex: index,
			isPrimary: true,
		}));
}
```

- [ ] **Step 2: Verify manually**

Run the dev server. Load a spec and create a Sprite annotation. Only the slice rect should appear on the canvas — no collision or origin overlays.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/components/CanvasView.vue
git commit -m "filter main canvas to only render preview shape per annotation"
```

---

### Task 2: Create `ShapeCanvas.vue` component

**Files:**
- Create: `src/mainview/src/components/ShapeCanvas.vue`

- [ ] **Step 1: Create the component**

Create `src/mainview/src/components/ShapeCanvas.vue` with the full implementation:

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { Annotation } from "../annotation";
import { getShapeRect, getShapePosition, resolveAbsolutePosition } from "../annotation";
import type { SpanSpec, ShapeSpecField } from "../spec/types";
import { getEntityByLabel, getShapesForEntity } from "../spec/types";
import { updateShapeData, markDirty, getPreviewShapeName } from "../state";

const props = defineProps<{
	annotation: Annotation;
	spec: SpanSpec;
	shapeName: string;
	sheetImageSrc: string;
	shapeColor: string;
}>();

const PADDING = 8; // extra pixels around preview shape for the preview shape's own canvas
const MIN_CANVAS_HEIGHT = 48;

const container = ref<HTMLElement | null>(null);
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const containerWidth = ref(200);

// --- Derived spec info ---

const entity = computed(() => getEntityByLabel(props.spec, props.annotation.entityType));
const shapeField = computed(() => {
	if (!entity.value) return null;
	return getShapesForEntity(entity.value).find(s => s.name === props.shapeName) ?? null;
});
const previewShapeName = computed(() => getPreviewShapeName(props.annotation.entityType));
const isPreviewShape = computed(() => props.shapeName === previewShapeName.value);

// --- Preview rect (the "master" crop region) ---

const previewRect = computed(() => {
	if (!previewShapeName.value) return null;
	return getShapeRect(props.annotation, props.spec, previewShapeName.value);
});

// --- Viewport: what region of the spritesheet to show ---

const viewport = computed(() => {
	const pr = previewRect.value;
	if (!pr) return null;
	if (isPreviewShape.value) {
		// Preview shape itself: show padded region
		return {
			x: pr.x - PADDING,
			y: pr.y - PADDING,
			width: pr.width + PADDING * 2,
			height: pr.height + PADDING * 2,
		};
	}
	// Other shapes: show exactly the preview rect
	return { x: pr.x, y: pr.y, width: pr.width, height: pr.height };
});

// --- Scale and canvas dimensions ---

const scale = computed(() => {
	const vp = viewport.value;
	if (!vp || vp.width === 0) return 1;
	return containerWidth.value / vp.width;
});

const canvasHeight = computed(() => {
	const vp = viewport.value;
	if (!vp) return MIN_CANVAS_HEIGHT;
	return Math.max(MIN_CANVAS_HEIGHT, Math.round(vp.height * scale.value));
});

// --- Shape position within the mini-canvas ---

const shapeStyle = computed(() => {
	const sf = shapeField.value;
	const vp = viewport.value;
	if (!sf?.mapping || !vp) return {};

	if (sf.mapping.type === "rect") {
		const rect = getShapeRect(props.annotation, props.spec, props.shapeName);
		if (!rect) return {};
		return {
			left: `${(rect.x - vp.x) * scale.value}px`,
			top: `${(rect.y - vp.y) * scale.value}px`,
			width: `${rect.width * scale.value}px`,
			height: `${rect.height * scale.value}px`,
		};
	}

	if (sf.mapping.type === "point") {
		const pos = getShapePosition(props.annotation, props.spec, props.shapeName);
		if (!pos) return {};
		return {
			left: `${(pos.x - vp.x) * scale.value}px`,
			top: `${(pos.y - vp.y) * scale.value}px`,
		};
	}

	if (sf.mapping.type === "circle") {
		const pos = getShapePosition(props.annotation, props.spec, props.shapeName);
		if (!pos) return {};
		const shapeData = props.annotation.shapes[props.shapeName];
		const r = shapeData?.[sf.mapping.radius] ?? 0;
		const diameter = r * 2 * scale.value;
		return {
			left: `${(pos.x - r - vp.x) * scale.value}px`,
			top: `${(pos.y - r - vp.y) * scale.value}px`,
			width: `${diameter}px`,
			height: `${diameter}px`,
		};
	}

	return {};
});

const radiusHandleStyle = computed(() => {
	const sf = shapeField.value;
	const vp = viewport.value;
	if (!sf?.mapping || sf.mapping.type !== "circle" || !vp) return {};
	const pos = getShapePosition(props.annotation, props.spec, props.shapeName);
	if (!pos) return {};
	const shapeData = props.annotation.shapes[props.shapeName];
	const r = shapeData?.[sf.mapping.radius] ?? 0;
	return {
		left: `${(pos.x + r - vp.x) * scale.value}px`,
		top: `${(pos.y - vp.y) * scale.value}px`,
	};
});

// --- Background image rendering ---

let sheetImage: HTMLImageElement | null = null;

function loadSheetImage() {
	if (!props.sheetImageSrc) return;
	const img = new Image();
	img.onload = () => {
		sheetImage = img;
		drawBackground();
	};
	img.src = props.sheetImageSrc;
}

function drawBackground() {
	const canvas = bgCanvas.value;
	const vp = viewport.value;
	if (!canvas || !vp || !sheetImage) return;

	const dpr = window.devicePixelRatio || 1;
	const w = containerWidth.value;
	const h = canvasHeight.value;
	canvas.width = w * dpr;
	canvas.height = h * dpr;
	canvas.style.width = `${w}px`;
	canvas.style.height = `${h}px`;

	const ctx = canvas.getContext("2d")!;
	ctx.scale(dpr, dpr);
	ctx.clearRect(0, 0, w, h);
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(
		sheetImage,
		vp.x, vp.y, vp.width, vp.height,
		0, 0, w, h,
	);
}

// --- Resize observer ---

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
	loadSheetImage();
	if (container.value) {
		containerWidth.value = container.value.clientWidth;
		resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				containerWidth.value = entry.contentRect.width;
			}
		});
		resizeObserver.observe(container.value);
	}
});

onUnmounted(() => {
	resizeObserver?.disconnect();
});

watch(() => props.sheetImageSrc, loadSheetImage);
watch([viewport, () => containerWidth.value], drawBackground);
watch(() => [
	props.annotation.shapes[props.shapeName],
	previewRect.value,
], drawBackground, { deep: true });

// --- Drag handling ---

interface DragState {
	mode: "move" | "resize" | "radius";
	startX: number;
	startY: number;
	startData: Record<string, number>;
}

const drag = ref<DragState | null>(null);

function onShapePointerDown(event: PointerEvent) {
	event.preventDefault();
	event.stopPropagation();
	const sf = shapeField.value;
	if (!sf?.mapping) return;

	const target = event.target as HTMLElement;
	const isResize = target.dataset.resize === "true";

	drag.value = {
		mode: isResize ? "resize" : "move",
		startX: event.clientX,
		startY: event.clientY,
		startData: { ...props.annotation.shapes[props.shapeName] },
	};

	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onRadiusPointerDown(event: PointerEvent) {
	event.preventDefault();
	event.stopPropagation();

	drag.value = {
		mode: "radius",
		startX: event.clientX,
		startY: event.clientY,
		startData: { ...props.annotation.shapes[props.shapeName] },
	};

	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
	const d = drag.value;
	const sf = shapeField.value;
	if (!d || !sf?.mapping) return;

	const s = scale.value;
	const deltaX = (event.clientX - d.startX) / s;
	const deltaY = (event.clientY - d.startY) / s;

	const mapping = sf.mapping;
	const patch: Record<string, number> = {};

	if (d.mode === "move") {
		if (mapping.type === "rect" || mapping.type === "point" || mapping.type === "circle") {
			patch[mapping.x] = Math.round(d.startData[mapping.x] + deltaX);
			patch[mapping.y] = Math.round(d.startData[mapping.y] + deltaY);
		}
	} else if (d.mode === "resize" && mapping.type === "rect") {
		patch[mapping.width] = Math.max(1, Math.round(d.startData[mapping.width] + deltaX));
		patch[mapping.height] = Math.max(1, Math.round(d.startData[mapping.height] + deltaY));
	} else if (d.mode === "radius" && mapping.type === "circle") {
		const vp = viewport.value;
		if (!vp) return;
		const el = container.value;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const pointerX = (event.clientX - rect.left) / s + vp.x;
		const pointerY = (event.clientY - rect.top) / s + vp.y;

		// Resolve absolute center
		const absPos = resolveAbsolutePosition(props.annotation, props.spec, props.shapeName);
		if (!absPos) return;
		const dist = Math.sqrt((pointerX - absPos.x) ** 2 + (pointerY - absPos.y) ** 2);
		patch[mapping.radius] = Math.max(1, Math.round(dist));
	}

	if (Object.keys(patch).length > 0) {
		updateShapeData(props.shapeName, patch);
	}
}

function onPointerUp(event: PointerEvent) {
	if (!drag.value) return;
	(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	drag.value = null;
}
</script>

<template>
	<div
		ref="container"
		class="shape-canvas-container"
		:style="{ height: canvasHeight + 'px' }"
	>
		<canvas ref="bgCanvas" class="shape-canvas-bg" />
		<div class="shape-canvas-overlay" :style="{ width: '100%', height: canvasHeight + 'px' }">
			<!-- Rect shape -->
			<div
				v-if="shapeField?.mapping?.type === 'rect'"
				class="annotation-box selected"
				:style="shapeStyle"
				@pointerdown="onShapePointerDown"
				@pointermove="onPointerMove"
				@pointerup="onPointerUp"
				@pointercancel="onPointerUp"
			>
				<div class="resize-handle" data-resize="true"></div>
			</div>

			<!-- Point shape -->
			<div
				v-else-if="shapeField?.mapping?.type === 'point'"
				class="annotation-point selected"
				:style="shapeStyle"
				@pointerdown="onShapePointerDown"
				@pointermove="onPointerMove"
				@pointerup="onPointerUp"
				@pointercancel="onPointerUp"
			></div>

			<!-- Circle shape -->
			<template v-else-if="shapeField?.mapping?.type === 'circle'">
				<div
					class="annotation-circle selected"
					:style="shapeStyle"
					@pointerdown="onShapePointerDown"
					@pointermove="onPointerMove"
					@pointerup="onPointerUp"
					@pointercancel="onPointerUp"
				></div>
				<div
					class="radius-handle"
					:style="radiusHandleStyle"
					@pointerdown="onRadiusPointerDown"
					@pointermove="onPointerMove"
					@pointerup="onPointerUp"
					@pointercancel="onPointerUp"
				></div>
			</template>
		</div>
	</div>
</template>

<style scoped>
.shape-canvas-container {
	position: relative;
	width: 100%;
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: 2px;
	background: var(--color-surface-0);
}

.shape-canvas-bg {
	position: absolute;
	top: 0;
	left: 0;
	image-rendering: pixelated;
}

.shape-canvas-overlay {
	position: absolute;
	top: 0;
	left: 0;
	pointer-events: none;
}

.shape-canvas-overlay > * {
	pointer-events: auto;
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/components/ShapeCanvas.vue
git commit -m "add ShapeCanvas component for inspector mini-canvases"
```

---

### Task 3: Integrate ShapeCanvas into DynamicInspector

**Files:**
- Modify: `src/mainview/src/components/DynamicInspector.vue`

- [ ] **Step 1: Add imports**

Add ShapeCanvas import and the `currentSheetImageSrc` state import:

```ts
import ShapeCanvas from "./ShapeCanvas.vue";
import {
	annotations,
	updateShapeData,
	updatePropertyData,
	markDirty,
	getPreviewShapeName,
	setPreviewShape,
	currentSheetImageSrc,
} from "../state";
```

- [ ] **Step 2: Add ShapeCanvas to each shape section**

In the template, between the section header `</button>` (line 153) and the shape fields `<div v-if="!collapsedShapes.has(shape.name)"` (line 156), add the ShapeCanvas:

```html
				<!-- Mini-canvas for shape editing -->
				<ShapeCanvas
					v-if="!collapsedShapes.has(shape.name) && currentSheetImageSrc"
					:annotation="annotation"
					:spec="spec"
					:shape-name="shape.name"
					:sheet-image-src="currentSheetImageSrc"
					:shape-color="SHAPE_COLORS[shapeIndex] ?? SHAPE_COLORS[SHAPE_COLORS.length - 1]"
				/>
```

Insert this between the `</button>` closing tag and the existing shape fields `<div>`.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/components/DynamicInspector.vue
git commit -m "integrate ShapeCanvas into inspector shape sections"
```

---

### Task 4: Final integration verification

- [ ] **Step 1: Full manual test**

Run the app with `bun run dev:hmr`. Load the example spec and images. Verify:

1. Main canvas only shows slice rects (no collision/origin overlays)
2. Inspector: each shape section has a mini-canvas when expanded
3. Slice mini-canvas: shows padded spritesheet region with slice rect overlaid, draggable and resizable
4. Collision mini-canvas: shows cropped slice image with collision rect overlaid, draggable and resizable
5. Origin mini-canvas: shows cropped slice image with origin point overlaid, draggable
6. Number inputs still work and update the mini-canvas in real time
7. Mini-canvas drag updates the number inputs in real time
8. Gallery still works (uses preview shape for thumbnails)
9. Creating new annotations via draw still works on main canvas
10. Select tool still works for selecting annotations on main canvas

- [ ] **Step 2: Commit any fixes**

If issues found, fix and commit individually.
