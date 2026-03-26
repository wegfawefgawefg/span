<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import type { Annotation } from "../annotation";
import { getEntityByLabel } from "../spec/types";
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
	addAnnotationWithSize,
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

interface DrawingState {
	originX: number;
	originY: number;
	currentX: number;
	currentY: number;
	entityType: string;
	shapeType: "rect" | "point";
}

const drawing = ref<DrawingState | null>(null);

const stageWidth = computed(() => Math.round(imageWidth.value * zoom.value));
const stageHeight = computed(() => Math.round(imageHeight.value * zoom.value));
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);

const layerCursorClass = computed(() => {
	if (spaceHeld.value && !isPanning.value) return '';
	if (isPanning.value) return '';
	if (activeTool.value) return 'cursor-crosshair';
	return 'cursor-default';
});

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

// --- Primary shape helper ---

function getPrimaryShapeKind(annotation: Annotation): "rect" | "point" | null {
	if (!activeSpec.value) return null;
	const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
	if (!entity) return null;
	return entity.primaryShape.kind;
}

// --- Annotation display helpers ---

function getAnnotationLabel(annotation: Annotation): string {
	if (!activeSpec.value) return annotation.entityType;
	const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
	if (!entity) return annotation.entityType;
	// Use first string scalar property as display name
	for (const field of entity.properties) {
		if (field.kind === "scalar" && field.type === "string") {
			const val = annotation.properties[field.name];
			if (val && typeof val === "string") return val;
		}
	}
	return annotation.entityType;
}

// --- Shape geometry helpers ---

// --- Box (rect) handlers ---

function handleShapePointerDown(event: PointerEvent, annotation: Annotation) {
	if (isPanning.value || spaceHeld.value) return;
	event.preventDefault();
	event.stopPropagation();

	const target = event.target as HTMLElement;
	const isResize = target.dataset.resize === "true";
	const shapeName = annotation.aabb ? "aabb" : "point";

	// Alt/Option+drag: duplicate first, then drag the copy
	if (event.altKey && !isResize) {
		selectAnnotation(annotation.id);
		duplicateSelected();
		const copy = selectedAnnotation.value;
		if (copy) {
			startDrag(event, copy, shapeName, "move");
			const box = event.currentTarget as HTMLElement;
			box.setPointerCapture(event.pointerId);
		}
		return;
	}

	selectAnnotation(annotation.id);
	startDrag(event, annotation, shapeName, isResize ? "resize" : "move");

	const box = event.currentTarget as HTMLElement;
	box.setPointerCapture(event.pointerId);
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

	const shapeKind = entity.primaryShape.kind;

	if (shapeKind === "point") {
		event.preventDefault();
		event.stopPropagation();
		addAnnotation(x, y);
	} else if (shapeKind === "rect") {
		event.preventDefault();
		event.stopPropagation();
		drawing.value = {
			originX: x,
			originY: y,
			currentX: x,
			currentY: y,
			entityType: activeTool.value,
			shapeType: "rect",
		};
		const layerEl = event.currentTarget as HTMLElement;
		layerEl.setPointerCapture(event.pointerId);
	}
}

function handleLayerPointerMove(event: PointerEvent) {
	// Drawing preview takes priority
	if (drawing.value) {
		const stageEl = stage.value;
		if (!stageEl) return;
		const rect = stageEl.getBoundingClientRect();
		const newX = Math.max(0, Math.min(Math.round((event.clientX - rect.left) / zoom.value), imageWidth.value));
		const newY = Math.max(0, Math.min(Math.round((event.clientY - rect.top) / zoom.value), imageHeight.value));
		drawing.value = { ...drawing.value, currentX: newX, currentY: newY };
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

function handleLayerPointerCancel() {
	drawing.value = null;
	endDrag();
}

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
	}
}

// --- Style helpers ---

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

	return {};
});

function boxStyle(annotation: Annotation, annIndex: number) {
	const isSelected = annotation.id === selectedId.value;
	const aabb = annotation.aabb;
	if (!aabb) return {};
	return {
		left: `${aabb.x * zoom.value}px`,
		top: `${aabb.y * zoom.value}px`,
		width: `${aabb.w * zoom.value}px`,
		height: `${aabb.h * zoom.value}px`,
		zIndex: isSelected ? annotations.value.length + 10 : annIndex + 1,
	};
}

function pointStyle(annotation: Annotation, annIndex: number) {
	const isSelected = annotation.id === selectedId.value;
	const pt = annotation.point;
	if (!pt) return {};
	return {
		left: `${pt.x * zoom.value}px`,
		top: `${pt.y * zoom.value}px`,
		zIndex: isSelected ? annotations.value.length + 10 : annIndex + 1,
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
					<div class="annotation-layer" :class="layerCursorClass" :style="{
						width: stageWidth + 'px',
						height: stageHeight + 'px',
					}"
					@pointerdown="handleLayerPointerDown"
					@pointermove="handleLayerPointerMove"
					@pointerup="handleLayerPointerUp"
					@pointercancel="handleLayerPointerCancel">
						<template v-for="(annotation, annIndex) in annotations" :key="annotation.id">
							<!-- Rect shape (aabb) -->
							<button v-if="getPrimaryShapeKind(annotation) === 'rect' && annotation.aabb"
								type="button"
								class="annotation-box"
								:class="{ selected: annotation.id === selectedId }"
								:style="boxStyle(annotation, annIndex)"
								@pointerdown="handleShapePointerDown($event, annotation)"
								@pointermove="handleBoxPointerMove" @pointerup="handleBoxPointerUp"
								@pointercancel="handleBoxPointerUp"
								@contextmenu.stop="onBoxContextMenu($event, annotation)">
								<div class="annotation-label">
									{{ getAnnotationLabel(annotation) }}
								</div>
								<div class="resize-handle" data-resize="true"></div>
							</button>

							<!-- Point shape -->
							<button v-else-if="getPrimaryShapeKind(annotation) === 'point' && annotation.point"
								type="button"
								class="annotation-point"
								:class="{ selected: annotation.id === selectedId }"
								:style="pointStyle(annotation, annIndex)"
								@pointerdown="handleShapePointerDown($event, annotation)"
								@pointermove="handleBoxPointerMove" @pointerup="handleBoxPointerUp"
								@pointercancel="handleBoxPointerUp"
								@contextmenu.stop="onBoxContextMenu($event, annotation)">
							</button>
						</template>
						<!-- Drawing preview -->
						<div
							v-if="drawing"
							class="draw-preview"
							:style="drawPreviewStyle"
						></div>
					</div>
				</div>
			</div>
			<ContextMenu ref="ctxMenu" />
		</div>
	</div>
</template>
