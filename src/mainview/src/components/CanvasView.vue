<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { Annotation } from "../annotation";
import { getShapeRect, getShapePosition } from "../annotation";
import {
	zoom,
	annotations,
	selectedId,
	selectAnnotation,
	activeSpec,
	activeTool,
	currentSheetImageSrc,
	imageWidth,
	imageHeight,
	registerViewportCenterFn,
	addAnnotation,
	duplicateSelected,
	deleteSelected,
	selectedAnnotation,
} from "../state";
import { ZOOM_STEP } from "../state";
import { useCanvas } from "../composables/useCanvas";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";
import ToolPalette from "./ToolPalette.vue";

const scroller = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const sheetImg = ref<HTMLImageElement | null>(null);
const { zoomTo, startDrag, onPointerMove, endDrag } = useCanvas();

const stageWidth = computed(() => Math.round(imageWidth.value * zoom.value));
const stageHeight = computed(() => Math.round(imageHeight.value * zoom.value));
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);

// Chroma sampling canvas
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", {
	willReadFrequently: true,
})!;

// --- Panning state ---
const isPanning = ref(false);
const spaceHeld = ref(false);
let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

function onKeyDown(e: KeyboardEvent) {
	if (e.code === "Space") {
		const tag = (document.activeElement?.tagName ?? "").toUpperCase();
		if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
		e.preventDefault();
		spaceHeld.value = true;
	}
}

function onKeyUp(e: KeyboardEvent) {
	if (e.code === "Space") {
		spaceHeld.value = false;
		if (isPanning.value) {
			isPanning.value = false;
		}
	}
}

function handleScrollerPointerDown(event: PointerEvent) {
	// MMB (button 1) always pans
	// Space+LMB pans
	const isMMB = event.button === 1;
	const isSpaceLMB = spaceHeld.value && event.button === 0;

	if (!isMMB && !isSpaceLMB) return;

	event.preventDefault();
	event.stopPropagation();
	isPanning.value = true;

	const el = scroller.value!;
	panStart = {
		x: event.clientX,
		y: event.clientY,
		scrollLeft: el.scrollLeft,
		scrollTop: el.scrollTop,
	};

	el.setPointerCapture(event.pointerId);
}

function handleScrollerPointerMove(event: PointerEvent) {
	if (!isPanning.value) return;
	const el = scroller.value!;
	el.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
	el.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
}

function handleScrollerPointerUp(event: PointerEvent) {
	if (!isPanning.value) return;
	isPanning.value = false;
	scroller.value?.releasePointerCapture(event.pointerId);
}

onMounted(() => {
	registerViewportCenterFn(() => {
		const el = scroller.value;
		if (!el) return { x: 0, y: 0 };
		const x = (el.scrollLeft + el.clientWidth / 2) / zoom.value;
		const y = (el.scrollTop + el.clientHeight / 2) / zoom.value;
		return { x, y };
	});

	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
});

onUnmounted(() => {
	window.removeEventListener("keydown", onKeyDown);
	window.removeEventListener("keyup", onKeyUp);
});

function onImageLoad() {
	const img = sheetImg.value;
	if (!img) return;
	imageWidth.value = img.naturalWidth;
	imageHeight.value = img.naturalHeight;
	sampleCanvas.width = img.naturalWidth;
	sampleCanvas.height = img.naturalHeight;
	sampleCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
	sampleCtx.drawImage(img, 0, 0);
}

function handleWheel(event: WheelEvent) {
	if (!imageWidth.value) return;
	event.preventDefault();
	const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
	zoomTo(
		zoom.value + delta,
		scroller.value!,
		stage.value!,
		event.clientX,
		event.clientY,
	);
}

function handleZoomIn() {
	zoomTo(zoom.value + ZOOM_STEP, scroller.value!, stage.value!);
}

function handleZoomOut() {
	zoomTo(zoom.value - ZOOM_STEP, scroller.value!, stage.value!);
}

// --- Shape type helpers ---

function getShapeType(annotation: Annotation): string | null {
	if (!activeSpec.value) return null;
	const entity = activeSpec.value.entities[annotation.entityType];
	return entity?.shape.type ?? null;
}

function getAnnotationRect(annotation: Annotation) {
	if (!activeSpec.value) return null;
	return getShapeRect(annotation, activeSpec.value);
}

function getAnnotationPosition(annotation: Annotation) {
	if (!activeSpec.value) return null;
	return getShapePosition(annotation, activeSpec.value);
}

function getCircleRadius(annotation: Annotation): number {
	if (!activeSpec.value) return 0;
	const entity = activeSpec.value.entities[annotation.entityType];
	const mapping = entity?.shape.mapping;
	if (!mapping || mapping.type !== "circle") return 0;
	return (annotation.shapeData[mapping.radius] as number) ?? 0;
}

// --- Annotation display helpers ---

function getAnnotationLabel(annotation: Annotation): string {
	if (!activeSpec.value) return annotation.entityType;
	const entity = activeSpec.value.entities[annotation.entityType];
	if (!entity) return annotation.entityType;
	// Use first string property as display name
	const firstStringProp = entity.properties.find((p) => p.type === "string");
	if (firstStringProp) {
		const val = annotation.propertyData[firstStringProp.name];
		if (val && typeof val === "string") return val;
	}
	return annotation.entityType;
}

// --- Box (rect) handlers ---

function handleBoxPointerDown(event: PointerEvent, annotation: Annotation) {
	if (isPanning.value || spaceHeld.value) return;
	event.preventDefault();
	event.stopPropagation();

	const target = event.target as HTMLElement;
	const isResize = target.dataset.resize === "true";

	// Alt/Option+drag: duplicate first, then drag the copy
	if (event.altKey && !isResize) {
		selectAnnotation(annotation.id);
		duplicateSelected();
		const copy = selectedAnnotation.value;
		if (copy) {
			// Reset copy position to match original for "pull off a clone" feel
			const spec = activeSpec.value;
			if (spec) {
				const entity = spec.entities[annotation.entityType];
				const mapping = entity?.shape.mapping;
				if (mapping && (mapping.type === "rect" || mapping.type === "point" || mapping.type === "circle")) {
					copy.shapeData[mapping.x] = annotation.shapeData[mapping.x];
					copy.shapeData[mapping.y] = annotation.shapeData[mapping.y];
				}
			}
			startDrag(event, copy, "move");
			const box = event.currentTarget as HTMLElement;
			box.setPointerCapture(event.pointerId);
		}
		return;
	}

	selectAnnotation(annotation.id);
	startDrag(event, annotation, isResize ? "resize" : "move");

	const box = event.currentTarget as HTMLElement;
	box.setPointerCapture(event.pointerId);
}

// --- Circle radius drag handler ---

function handleRadiusPointerDown(event: PointerEvent, annotation: Annotation) {
	if (isPanning.value || spaceHeld.value) return;
	event.preventDefault();
	event.stopPropagation();

	selectAnnotation(annotation.id);
	startDrag(event, annotation, "radius");

	const el = event.currentTarget as HTMLElement;
	el.setPointerCapture(event.pointerId);
}

function handleBoxPointerMove(event: PointerEvent) {
	onPointerMove(event, imageWidth.value, imageHeight.value);
}

function handleBoxPointerUp(event: PointerEvent) {
	const box = event.currentTarget as HTMLElement;
	box.releasePointerCapture(event.pointerId);
	endDrag();
}

function handleLayerPointerDown(event: PointerEvent) {
	if (isPanning.value || spaceHeld.value) return;

	// Click-to-create: guard behind activeSpec and activeTool
	if (!activeSpec.value || !activeTool.value) return;

	const entity = activeSpec.value.entities[activeTool.value];
	if (!entity) return;

	const stageEl = stage.value;
	if (!stageEl) return;
	const rect = stageEl.getBoundingClientRect();
	const x = Math.round((event.clientX - rect.left) / zoom.value);
	const y = Math.round((event.clientY - rect.top) / zoom.value);

	const shapeType = entity.shape.type;

	if (shapeType === "point") {
		// Single click creates point annotation
		event.preventDefault();
		event.stopPropagation();
		addAnnotation(x, y);
	} else if (shapeType === "rect" || shapeType === "circle") {
		// Click-drag creates rect or circle
		event.preventDefault();
		event.stopPropagation();
		addAnnotation(x, y);
		const ann = selectedAnnotation.value;
		if (ann) {
			startDrag(event, ann, shapeType === "rect" ? "resize" : "radius");
			stageEl.setPointerCapture(event.pointerId);
		}
	}
	// polygon: skip for now
}

function handleLayerPointerMove(event: PointerEvent) {
	onPointerMove(event, imageWidth.value, imageHeight.value);
}

function handleLayerPointerUp(event: PointerEvent) {
	const el = event.currentTarget as HTMLElement;
	el.releasePointerCapture(event.pointerId);
	endDrag();
}

// --- Style helpers ---

function boxStyle(annotation: Annotation, index: number) {
	const isSelected = annotation.id === selectedId.value;
	const rect = getAnnotationRect(annotation);
	if (!rect) return {};
	return {
		left: `${rect.x * zoom.value}px`,
		top: `${rect.y * zoom.value}px`,
		width: `${rect.width * zoom.value}px`,
		height: `${rect.height * zoom.value}px`,
		zIndex: isSelected ? annotations.value.length + 10 : index + 1,
	};
}

function pointStyle(annotation: Annotation, index: number) {
	const isSelected = annotation.id === selectedId.value;
	const pos = getAnnotationPosition(annotation);
	if (!pos) return {};
	return {
		left: `${pos.x * zoom.value}px`,
		top: `${pos.y * zoom.value}px`,
		zIndex: isSelected ? annotations.value.length + 10 : index + 1,
	};
}

function circleStyle(annotation: Annotation, index: number) {
	const isSelected = annotation.id === selectedId.value;
	const pos = getAnnotationPosition(annotation);
	const r = getCircleRadius(annotation);
	if (!pos) return {};
	const diameter = r * 2 * zoom.value;
	return {
		left: `${(pos.x - r) * zoom.value}px`,
		top: `${(pos.y - r) * zoom.value}px`,
		width: `${diameter}px`,
		height: `${diameter}px`,
		zIndex: isSelected ? annotations.value.length + 10 : index + 1,
	};
}

function radiusHandleStyle(annotation: Annotation) {
	const pos = getAnnotationPosition(annotation);
	const r = getCircleRadius(annotation);
	if (!pos) return {};
	// Position handle at the right edge of the circle
	return {
		left: `${(pos.x + r) * zoom.value}px`,
		top: `${pos.y * zoom.value}px`,
	};
}

// --- Context menus ---

const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

function onBoxContextMenu(event: MouseEvent, annotation: Annotation) {
	selectAnnotation(annotation.id);
	const entries: MenuEntry[] = [
		{ label: "Duplicate", action: () => duplicateSelected() },
		{ label: "Delete", action: () => deleteSelected() },
	];
	ctxMenu.value?.show(event, entries);
}

function onCanvasContextMenu(event: MouseEvent) {
	const el = scroller.value;
	if (!el) return;
	const cx = (el.scrollLeft + el.clientWidth / 2) / zoom.value;
	const cy = (el.scrollTop + el.clientHeight / 2) / zoom.value;
	const entries: MenuEntry[] = [
		{
			label: "Add annotation here",
			action: () => addAnnotation(cx, cy),
			disabled: !activeSpec.value || !activeTool.value,
		},
	];
	ctxMenu.value?.show(event, entries);
}
</script>

<template>
	<div class="canvas-shell" style="display: flex;">
		<ToolPalette />
		<div style="flex: 1; min-width: 0; position: relative; height: 100%;">
			<div
				class="absolute top-4 right-4 z-50 flex items-center gap-0.5 p-1 bg-surface-0/90 border border-border rounded-sm backdrop-blur-sm">
				<button type="button"
					class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper border border-transparent hover:border-copper/40 rounded-sm transition-colors cursor-pointer bg-transparent text-xs font-mono"
					@click="handleZoomOut">-</button>
				<span class="min-w-10.5 text-center text-[10px] font-mono text-text-faint select-none">{{ zoomLabel }}</span>
				<button type="button"
					class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper border border-transparent hover:border-copper/40 rounded-sm transition-colors cursor-pointer bg-transparent text-xs font-mono"
					@click="handleZoomIn">+</button>
			</div>
			<div
				ref="scroller"
				class="canvas-scroller"
				:class="{ 'cursor-grab': spaceHeld && !isPanning, 'cursor-grabbing': isPanning }"
				@wheel.prevent="handleWheel"
				@pointerdown="handleScrollerPointerDown"
				@pointermove="handleScrollerPointerMove"
				@pointerup="handleScrollerPointerUp"
				@pointercancel="handleScrollerPointerUp"
				@contextmenu="onCanvasContextMenu"
			>
				<div ref="stage" class="canvas-stage" :style="{ width: stageWidth + 'px', height: stageHeight + 'px' }">
					<img ref="sheetImg" class="sheet-image" :src="currentSheetImageSrc" alt="" :style="{
						width: stageWidth + 'px',
						height: stageHeight + 'px',
					}" draggable="false" @load="onImageLoad" />
					<div class="annotation-layer" :style="{
						width: stageWidth + 'px',
						height: stageHeight + 'px',
					}"
					@pointerdown="handleLayerPointerDown"
					@pointermove="handleLayerPointerMove"
					@pointerup="handleLayerPointerUp"
					@pointercancel="handleLayerPointerUp">
						<template v-for="(annotation, index) in annotations" :key="annotation.id">
							<!-- Rect shape -->
							<button v-if="getShapeType(annotation) === 'rect'"
								type="button"
								class="annotation-box" :class="{ selected: annotation.id === selectedId }"
								:style="boxStyle(annotation, index)"
								@pointerdown="handleBoxPointerDown($event, annotation)"
								@pointermove="handleBoxPointerMove" @pointerup="handleBoxPointerUp"
								@pointercancel="handleBoxPointerUp"
								@contextmenu.stop="onBoxContextMenu($event, annotation)">
								<div class="annotation-label">
									{{ getAnnotationLabel(annotation) }}
								</div>
								<div class="resize-handle" data-resize="true"></div>
							</button>

							<!-- Point shape -->
							<button v-else-if="getShapeType(annotation) === 'point'"
								type="button"
								class="annotation-point" :class="{ selected: annotation.id === selectedId }"
								:style="pointStyle(annotation, index)"
								@pointerdown="handleBoxPointerDown($event, annotation)"
								@pointermove="handleBoxPointerMove" @pointerup="handleBoxPointerUp"
								@pointercancel="handleBoxPointerUp"
								@contextmenu.stop="onBoxContextMenu($event, annotation)">
							</button>

							<!-- Circle shape -->
							<button v-else-if="getShapeType(annotation) === 'circle'"
								type="button"
								class="annotation-circle" :class="{ selected: annotation.id === selectedId }"
								:style="circleStyle(annotation, index)"
								@pointerdown="handleBoxPointerDown($event, annotation)"
								@pointermove="handleBoxPointerMove" @pointerup="handleBoxPointerUp"
								@pointercancel="handleBoxPointerUp"
								@contextmenu.stop="onBoxContextMenu($event, annotation)">
								<div class="annotation-label">
									{{ getAnnotationLabel(annotation) }}
								</div>
								<div class="radius-handle"
									:style="radiusHandleStyle(annotation)"
									@pointerdown.stop="handleRadiusPointerDown($event, annotation)"
									@pointermove="handleBoxPointerMove"
									@pointerup="handleBoxPointerUp"
									@pointercancel="handleBoxPointerUp"
								></div>
							</button>

							<!-- Polygon shape: placeholder -->
						</template>
					</div>
				</div>
			</div>
			<ContextMenu ref="ctxMenu" />
		</div>
	</div>
</template>
