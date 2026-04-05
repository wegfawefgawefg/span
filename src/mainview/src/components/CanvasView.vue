<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import type { Annotation } from "../annotation";
import { getEntityByLabel } from "../spec/types";
import {
	zoom,
	annotations,
	currentSheet,
	selectedId,
	selectAnnotation,
	activeSpec,
	activeTool,
	currentSheetImageSrc,
	imageWidth,
	imageHeight,
	registerViewportCenterFn,
	registerFitZoomFn,
	addAnnotation,
	addAnnotationWithSize,
	duplicateSelected,
	deleteSelected,
	selectedAnnotation,
	activeEyedropper,
	canvasGridEnabled,
	canvasGridWidth,
	canvasGridHeight,
	canvasCheckerStrength,
} from "../state";
import { ZOOM_FACTOR } from "../state";
import { useCanvas } from "../composables/useCanvas";
import { api } from "../platform/adapter";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";
import ToolPalette from "./ToolPalette.vue";

const scroller = ref<HTMLElement | null>(null);
const workspace = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const displayCanvas = ref<HTMLCanvasElement | null>(null);
const { zoomTo, normalizeZoom, startDrag, onPointerMove, endDrag } = useCanvas();

const PAN_MARGIN = 384;
const FIT_PADDING = 32;

interface DrawingState {
	originX: number;
	originY: number;
	currentX: number;
	currentY: number;
	entityType: string;
	shapeType: "rect" | "point";
}

const drawing = ref<DrawingState | null>(null);
const displayCanvasKey = computed(() => currentSheet.value?.path ?? "no-sheet");

const stageWidth = computed(() => Math.round(imageWidth.value * zoom.value));
const stageHeight = computed(() => Math.round(imageHeight.value * zoom.value));
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);
const scrollerViewportWidth = ref(0);
const scrollerViewportHeight = ref(0);
const workspaceWidth = computed(() =>
	Math.max(stageWidth.value + PAN_MARGIN * 2, scrollerViewportWidth.value + PAN_MARGIN * 2),
);
const workspaceHeight = computed(() =>
	Math.max(stageHeight.value + PAN_MARGIN * 2, scrollerViewportHeight.value + PAN_MARGIN * 2),
);
const stageOffsetX = computed(() => Math.round((workspaceWidth.value - stageWidth.value) / 2));
const stageOffsetY = computed(() => Math.round((workspaceHeight.value - stageHeight.value) / 2));
const gridOverlayStyle = computed(() => {
	const cellWidth = Math.max(1, Math.round(canvasGridWidth.value * zoom.value));
	const cellHeight = Math.max(1, Math.round(canvasGridHeight.value * zoom.value));
	return {
		backgroundImage: [
			"linear-gradient(to right, rgba(232, 226, 212, 0.14) 1px, transparent 1px)",
			"linear-gradient(to bottom, rgba(232, 226, 212, 0.14) 1px, transparent 1px)",
		].join(", "),
		backgroundSize: `${cellWidth}px ${cellHeight}px`,
		backgroundPosition: "0 0, 0 0",
		opacity: canvasGridEnabled.value ? "1" : "0",
	};
});

const layerCursorClass = computed(() => {
	if (activeEyedropper.value) return 'cursor-crosshair';
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
const checkerCanvas = document.createElement("canvas");
let loadedSheetImage: HTMLImageElement | null = null;
let imageLoadVersion = 0;

// --- Panning state ---
const isPanning = ref(false);
const spaceHeld = ref(false);
let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };
let scrollerResizeObserver: ResizeObserver | null = null;
let hasCenteredCurrentSheet = false;
let lastRenderMismatchKey = "";
let canvasDebugSeq = 0;

function shortImageId(value: string | null | undefined): string {
	if (!value) return "null";
	return value.slice(0, 48);
}

function debugCanvas(message: string) {
	void api.debugLog(`[canvas ${++canvasDebugSeq}] ${message}`);
}

function updateScrollerViewportSize() {
	const el = scroller.value;
	if (!el) return;
	scrollerViewportWidth.value = el.clientWidth;
	scrollerViewportHeight.value = el.clientHeight;
}

function centerViewportOnStage() {
	const el = scroller.value;
	if (!el) return;
	el.scrollLeft = Math.max(0, stageOffsetX.value - (el.clientWidth - stageWidth.value) / 2);
	el.scrollTop = Math.max(0, stageOffsetY.value - (el.clientHeight - stageHeight.value) / 2);
}

function computeFitZoomForImage(width: number, height: number): number | null {
	const el = scroller.value;
	if (!el || width <= 0 || height <= 0) return null;
	const availableWidth = Math.max(1, el.clientWidth - FIT_PADDING * 2);
	const availableHeight = Math.max(1, el.clientHeight - FIT_PADDING * 2);
	return normalizeZoom(Math.min(availableWidth / width, availableHeight / height));
}

function rebuildCheckerboardSource(width: number, height: number) {
	checkerCanvas.width = width;
	checkerCanvas.height = height;

	const checkerCtx = checkerCanvas.getContext("2d");
	if (!checkerCtx) return;

	const imageData = checkerCtx.createImageData(width, height);
	const data = imageData.data;
	const strength = Math.max(0, Math.min(100, canvasCheckerStrength.value)) / 100;
	const darkSquare = [
		Math.round(17 + strength * 16),
		Math.round(20 + strength * 18),
		Math.round(25 + strength * 21),
	];
	const lightSquare = [
		Math.round(17 + strength * 70),
		Math.round(20 + strength * 76),
		Math.round(25 + strength * 82),
	];

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const isLight = (x + y) % 2 === 0;
			const offset = (y * width + x) * 4;
			if (isLight) {
				data[offset] = lightSquare[0];
				data[offset + 1] = lightSquare[1];
				data[offset + 2] = lightSquare[2];
				data[offset + 3] = 255;
			} else {
				data[offset] = darkSquare[0];
				data[offset + 1] = darkSquare[1];
				data[offset + 2] = darkSquare[2];
				data[offset + 3] = 255;
			}
		}
	}

	checkerCtx.putImageData(imageData, 0, 0);
}

function renderDisplayCanvas() {
	const canvas = displayCanvas.value;
	if (!canvas) return;

	const dpr = window.devicePixelRatio || 1;
	const displayWidth = Math.max(1, stageWidth.value);
	const displayHeight = Math.max(1, stageHeight.value);
	const backingWidth = Math.max(1, Math.round(displayWidth * dpr));
	const backingHeight = Math.max(1, Math.round(displayHeight * dpr));

	if (canvas.width !== backingWidth) canvas.width = backingWidth;
	if (canvas.height !== backingHeight) canvas.height = backingHeight;

	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, backingWidth, backingHeight);

	if (!loadedSheetImage) return;

	const loadedId = shortImageId(loadedSheetImage.src);
	const targetId = shortImageId(currentSheetImageSrc.value);
	if (loadedSheetImage.src !== currentSheetImageSrc.value) {
		const mismatchKey = `${currentSheet.value?.path ?? "none"}|${loadedId}|${targetId}|${backingWidth}x${backingHeight}`;
		if (mismatchKey !== lastRenderMismatchKey) {
			lastRenderMismatchKey = mismatchKey;
			debugCanvas(
				`render mismatch sheet=${currentSheet.value?.path ?? "none"} loaded=${loadedId} target=${targetId} backing=${backingWidth}x${backingHeight}`
			);
		}
	} else {
		lastRenderMismatchKey = "";
	}

	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(checkerCanvas, 0, 0, backingWidth, backingHeight);
	ctx.drawImage(loadedSheetImage, 0, 0, backingWidth, backingHeight);
}

async function waitForImageReady(img: HTMLImageElement): Promise<void> {
	if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
		try {
			await img.decode();
		} catch {
			// Some engines reject decode for already-loaded images; the load state is enough.
		}
		return;
	}

	await new Promise<void>((resolve, reject) => {
		const onLoad = () => {
			img.removeEventListener("load", onLoad);
			img.removeEventListener("error", onError);
			resolve();
		};
		const onError = () => {
			img.removeEventListener("load", onLoad);
			img.removeEventListener("error", onError);
			reject(new Error("Failed to load image"));
		};
		img.addEventListener("load", onLoad, { once: true });
		img.addEventListener("error", onError, { once: true });
	});

	try {
		await img.decode();
	} catch {
		// If decode is flaky, the successful load event is still enough to draw.
	}
}

function onKeyDown(e: KeyboardEvent) {
	if (e.code === "Escape" && activeEyedropper.value) {
		const original = activeEyedropper.value.originalValue;
		activeEyedropper.value.callback(original);
		activeEyedropper.value = null;
		return;
	}
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
		const stageEl = stage.value;
		if (!el || !stageEl) return { x: 0, y: 0 };
		const scrollerRect = el.getBoundingClientRect();
		const stageRect = stageEl.getBoundingClientRect();
		const x = (scrollerRect.left + el.clientWidth / 2 - stageRect.left) / zoom.value;
		const y = (scrollerRect.top + el.clientHeight / 2 - stageRect.top) / zoom.value;
		return { x, y };
	});
	registerFitZoomFn((width, height) => computeFitZoomForImage(width, height));

	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
	updateScrollerViewportSize();
	scrollerResizeObserver = new ResizeObserver(() => {
		updateScrollerViewportSize();
	});
	if (scroller.value) {
		scrollerResizeObserver.observe(scroller.value);
	}
});

onUnmounted(() => {
	window.removeEventListener("keydown", onKeyDown);
	window.removeEventListener("keyup", onKeyUp);
	scrollerResizeObserver?.disconnect();
	scrollerResizeObserver = null;
	registerFitZoomFn(() => null);
});

watch(
	currentSheet,
	() => {
		debugCanvas(`sheet change -> ${currentSheet.value?.path ?? "none"} size=${imageWidth.value}x${imageHeight.value}`);
		imageLoadVersion += 1;
		loadedSheetImage = null;
		renderDisplayCanvas();
	},
	{ flush: "sync" },
);

watch(
	displayCanvas,
	async () => {
		await nextTick();
		renderDisplayCanvas();
	},
	{ flush: "post" },
);

watch(currentSheetImageSrc, async (src) => {
	hasCenteredCurrentSheet = false;
	debugCanvas(`src watch start sheet=${currentSheet.value?.path ?? "none"} target=${shortImageId(src)}`);
	await nextTick();
	updateScrollerViewportSize();

	imageLoadVersion += 1;
	const loadVersion = imageLoadVersion;

	if (!src) {
		loadedSheetImage = null;
		debugCanvas(`src cleared sheet=${currentSheet.value?.path ?? "none"}`);
		renderDisplayCanvas();
		return;
	}

	const img = new Image();
	img.src = src;

	await waitForImageReady(img);

	if (loadVersion !== imageLoadVersion) return;

	loadedSheetImage = img;
	debugCanvas(`image ready sheet=${currentSheet.value?.path ?? "none"} loaded=${shortImageId(img.src)} natural=${img.naturalWidth}x${img.naturalHeight}`);
	imageWidth.value = img.naturalWidth;
	imageHeight.value = img.naturalHeight;
	sampleCanvas.width = img.naturalWidth;
	sampleCanvas.height = img.naturalHeight;
	rebuildCheckerboardSource(img.naturalWidth, img.naturalHeight);
	sampleCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
	sampleCtx.drawImage(img, 0, 0);

	await nextTick();
	renderDisplayCanvas();
});

watch(
	() => [currentSheetImageSrc.value, stageWidth.value, stageHeight.value, scrollerViewportWidth.value, scrollerViewportHeight.value],
	async () => {
		if (!currentSheetImageSrc.value || hasCenteredCurrentSheet) return;
		if (!stageWidth.value || !stageHeight.value || !scrollerViewportWidth.value || !scrollerViewportHeight.value) return;
		await nextTick();
		centerViewportOnStage();
		hasCenteredCurrentSheet = true;
	},
);

watch(
	() => [stageWidth.value, stageHeight.value, zoom.value, currentSheetImageSrc.value, canvasCheckerStrength.value],
	async () => {
		await nextTick();
		if (imageWidth.value > 0 && imageHeight.value > 0) {
			rebuildCheckerboardSource(imageWidth.value, imageHeight.value);
		}
		renderDisplayCanvas();
	},
);

function samplePixelAt(clientX: number, clientY: number): string | null {
	const stageEl = stage.value;
	if (!stageEl || !sampleCanvas.width) return null;
	const rect = stageEl.getBoundingClientRect();
	const imgX = Math.floor((clientX - rect.left) / zoom.value);
	const imgY = Math.floor((clientY - rect.top) / zoom.value);
	if (imgX < 0 || imgY < 0 || imgX >= imageWidth.value || imgY >= imageHeight.value) return null;
	const pixel = sampleCtx.getImageData(imgX, imgY, 1, 1).data;
	const hex = "#" + [pixel[0], pixel[1], pixel[2]]
		.map((c) => c.toString(16).padStart(2, "0"))
		.join("");
	return hex;
}

function handleWheel(event: WheelEvent) {
	if (!imageWidth.value) return;
	event.preventDefault();
	const nextZoom = event.deltaY < 0
		? zoom.value * ZOOM_FACTOR
		: zoom.value / ZOOM_FACTOR;
	zoomTo(
		normalizeZoom(nextZoom),
		scroller.value!,
		stage.value!,
		event.clientX,
		event.clientY,
	);
}

function handleZoomIn() {
	zoomTo(normalizeZoom(zoom.value * ZOOM_FACTOR), scroller.value!, stage.value!);
}

function handleZoomOut() {
	zoomTo(normalizeZoom(zoom.value / ZOOM_FACTOR), scroller.value!, stage.value!);
}

function normalizeGridSize(axis: "width" | "height") {
	if (axis === "width") {
		canvasGridWidth.value = Math.max(1, Math.round(canvasGridWidth.value || 1));
		return;
	}
	canvasGridHeight.value = Math.max(1, Math.round(canvasGridHeight.value || 1));
}

function normalizeCheckerStrength() {
	canvasCheckerStrength.value = Math.max(0, Math.min(100, Math.round(canvasCheckerStrength.value || 0)));
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
	if (entity.nameField) {
		const val = annotation.properties.name;
		if (val && typeof val === "string") return val;
	}
	// Fallback to first string property
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
	// Eyedropper mode: click to confirm color
	if (activeEyedropper.value) {
		event.preventDefault();
		event.stopPropagation();
		const hex = samplePixelAt(event.clientX, event.clientY);
		if (hex) {
			activeEyedropper.value.callback(hex);
		}
		activeEyedropper.value = null;
		return;
	}
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
	// Eyedropper mode: live preview on hover
	if (activeEyedropper.value) {
		const hex = samplePixelAt(event.clientX, event.clientY);
		if (hex) {
			activeEyedropper.value.callback(hex);
		}
		return;
	}
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
	if (activeEyedropper.value) {
		event.preventDefault();
		const original = activeEyedropper.value.originalValue;
		activeEyedropper.value.callback(original);
		activeEyedropper.value = null;
		return;
	}
	const el = scroller.value;
	const stageEl = stage.value;
	if (!el || !stageEl) return;
	const scrollerRect = el.getBoundingClientRect();
	const stageRect = stageEl.getBoundingClientRect();
	const cx = (scrollerRect.left + el.clientWidth / 2 - stageRect.left) / zoom.value;
	const cy = (scrollerRect.top + el.clientHeight / 2 - stageRect.top) / zoom.value;
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
			<div class="canvas-toolbar">
				<div class="canvas-toolbar-group">
				<button type="button"
					class="canvas-toolbar-button"
					@click="handleZoomOut">-</button>
				<span class="canvas-toolbar-zoom">{{ zoomLabel }}</span>
				<button type="button"
					class="canvas-toolbar-button"
					@click="handleZoomIn">+</button>
				</div>
				<div class="canvas-toolbar-divider"></div>
				<label class="canvas-toolbar-checkbox">
					<input v-model="canvasGridEnabled" type="checkbox" />
					Grid
				</label>
				<div class="canvas-toolbar-group">
				<label class="canvas-toolbar-field">
					<span>W</span>
					<input
						v-model.number="canvasGridWidth"
						type="number"
						min="1"
						step="1"
						class="canvas-toolbar-number"
						@change="normalizeGridSize('width')"
					/>
				</label>
				<label class="canvas-toolbar-field">
					<span>H</span>
					<input
						v-model.number="canvasGridHeight"
						type="number"
						min="1"
						step="1"
						class="canvas-toolbar-number"
						@change="normalizeGridSize('height')"
					/>
				</label>
				</div>
				<div class="canvas-toolbar-divider"></div>
				<label class="canvas-toolbar-field canvas-toolbar-range-field">
					<span>Checker</span>
					<input
						v-model.number="canvasCheckerStrength"
						type="range"
						min="0"
						max="100"
						step="1"
						class="canvas-toolbar-range"
						@change="normalizeCheckerStrength"
					/>
					<span class="canvas-toolbar-range-value">{{ canvasCheckerStrength }}</span>
				</label>
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
				<div
					ref="workspace"
					class="canvas-workspace"
					:style="{ width: workspaceWidth + 'px', height: workspaceHeight + 'px' }"
				>
				<div
					ref="stage"
					class="canvas-stage"
					:style="{
						width: stageWidth + 'px',
						height: stageHeight + 'px',
						left: stageOffsetX + 'px',
						top: stageOffsetY + 'px',
					}"
				>
					<canvas :key="displayCanvasKey" ref="displayCanvas" class="sheet-canvas" :style="{
						width: stageWidth + 'px',
						height: stageHeight + 'px',
					}"></canvas>
					<div
						class="canvas-grid-overlay"
						:style="{
							width: stageWidth + 'px',
							height: stageHeight + 'px',
							...gridOverlayStyle,
						}"
					></div>
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
			</div>
			<ContextMenu ref="ctxMenu" />
		</div>
	</div>
</template>
