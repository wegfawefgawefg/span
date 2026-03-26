<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { Annotation } from "../annotation";
import type { SpanSpec } from "../spec/types";
import { getEntityByLabel } from "../spec/types";
import { updateShapeData, markDirty } from "../state";

const props = defineProps<{
	annotation: Annotation;
	spec: SpanSpec;
	shapeName: string;
	sheetImageSrc: string;
	shapeColor: string;
	// Property shape support
	propertyShapes?: { type: "rect" | "point"; items: Array<{ x: number; y: number; w?: number; h?: number }> };
}>();

const emit = defineEmits<{
	"update:propertyShape": [propName: string, index: number | null, patch: Record<string, number>];
}>();

const PADDING = 8;
const MIN_CANVAS_HEIGHT = 48;

const container = ref<HTMLElement | null>(null);
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const containerWidth = ref(200);

// --- Derived spec info ---

const entity = computed(() => getEntityByLabel(props.spec, props.annotation.entityType));
const primaryShapeKind = computed(() => entity.value?.primaryShape.kind ?? null);

// Whether this shape canvas is showing the primary shape
const isPrimaryShape = computed(() => {
	if (primaryShapeKind.value === "rect") return props.shapeName === "aabb";
	if (primaryShapeKind.value === "point") return props.shapeName === "point";
	return false;
});

// --- Preview rect (the "master" crop region) ---

const previewRect = computed(() => {
	const aabb = props.annotation.aabb;
	if (!aabb) return null;
	return { x: aabb.x, y: aabb.y, width: aabb.w, height: aabb.h };
});

// --- Viewport: what region of the spritesheet to show ---

const viewport = computed(() => {
	const pr = previewRect.value;
	if (!pr) return null;
	return {
		x: pr.x - PADDING,
		y: pr.y - PADDING,
		width: pr.width + PADDING * 2,
		height: pr.height + PADDING * 2,
	};
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
	const vp = viewport.value;
	if (!vp) return {};

	if (props.shapeName === "aabb" && props.annotation.aabb) {
		const aabb = props.annotation.aabb;
		return {
			left: `${(aabb.x - vp.x) * scale.value}px`,
			top: `${(aabb.y - vp.y) * scale.value}px`,
			width: `${aabb.w * scale.value}px`,
			height: `${aabb.h * scale.value}px`,
		};
	}

	if (props.shapeName === "point" && props.annotation.point) {
		const pt = props.annotation.point;
		return {
			left: `${(pt.x - vp.x) * scale.value}px`,
			top: `${(pt.y - vp.y) * scale.value}px`,
		};
	}

	return {};
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

function drawCheckerboard(ctx: CanvasRenderingContext2D, w: number, h: number) {
	const size = 4;
	for (let y = 0; y < h; y += size) {
		for (let x = 0; x < w; x += size) {
			ctx.fillStyle = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0
				? "#1a1a2e" : "#16162a";
			ctx.fillRect(x, y, size, size);
		}
	}
}

function drawBackground() {
	const canvas = bgCanvas.value;
	const vp = viewport.value;
	const pr = previewRect.value;
	if (!canvas || !vp || !pr || !sheetImage) return;

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

	if (isPrimaryShape.value) {
		// Preview shape: draw the full padded spritesheet region
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(
			sheetImage,
			vp.x, vp.y, vp.width, vp.height,
			0, 0, w, h,
		);
	} else {
		// Non-preview shape: checkerboard background, then only the preview rect cropped image centered
		drawCheckerboard(ctx, w, h);
		const s = scale.value;
		const destX = (pr.x - vp.x) * s;
		const destY = (pr.y - vp.y) * s;
		const destW = pr.width * s;
		const destH = pr.height * s;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(
			sheetImage,
			pr.x, pr.y, pr.width, pr.height,
			destX, destY, destW, destH,
		);
	}

	// Apply chroma key transparency
	const chromaKey = props.annotation.chromaKey;
	if (chromaKey) {
		applyChromaKey(ctx, w, h, chromaKey);
	}
}

function applyChromaKey(ctx: CanvasRenderingContext2D, w: number, h: number, hexColor: string) {
	// Parse hex color
	const match = hexColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
	if (!match) return;
	const cr = parseInt(match[1], 16);
	const cg = parseInt(match[2], 16);
	const cb = parseInt(match[3], 16);

	const dpr = window.devicePixelRatio || 1;
	const imageData = ctx.getImageData(0, 0, w * dpr, h * dpr);
	const data = imageData.data;
	const tolerance = 2; // allow slight color variation

	for (let i = 0; i < data.length; i += 4) {
		if (Math.abs(data[i] - cr) <= tolerance &&
			Math.abs(data[i + 1] - cg) <= tolerance &&
			Math.abs(data[i + 2] - cb) <= tolerance) {
			data[i + 3] = 0; // set alpha to 0
		}
	}
	ctx.putImageData(imageData, 0, 0);
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
	props.annotation.aabb,
	props.annotation.point,
	props.annotation.chromaKey,
	previewRect.value,
], drawBackground, { deep: true });

// --- Property shape styles ---

const propertyShapeStyles = computed(() => {
	const vp = viewport.value;
	if (!vp || !props.propertyShapes) return [];
	const aabb = props.annotation.aabb;
	if (!aabb) return [];

	return props.propertyShapes.items.map((item) => {
		const absX = aabb.x + item.x;
		const absY = aabb.y + item.y;

		if (props.propertyShapes!.type === "rect" && item.w !== undefined && item.h !== undefined) {
			return {
				left: `${(absX - vp.x) * scale.value}px`,
				top: `${(absY - vp.y) * scale.value}px`,
				width: `${item.w * scale.value}px`,
				height: `${item.h * scale.value}px`,
			};
		}
		return {
			left: `${(absX - vp.x) * scale.value}px`,
			top: `${(absY - vp.y) * scale.value}px`,
		};
	});
});

// --- Drag handling ---

interface DragState {
	mode: "move" | "resize";
	startX: number;
	startY: number;
	startData: Record<string, number>;
	// For property shapes
	propertyIndex: number | null;
	isPropertyShape: boolean;
}

const drag = ref<DragState | null>(null);

function onShapePointerDown(event: PointerEvent) {
	event.preventDefault();
	event.stopPropagation();

	const target = event.target as HTMLElement;
	const isResize = target.dataset.resize === "true";

	let startData: Record<string, number> = {};
	if (props.shapeName === "aabb" && props.annotation.aabb) {
		startData = { ...props.annotation.aabb };
	} else if (props.shapeName === "point" && props.annotation.point) {
		startData = { ...props.annotation.point };
	}

	drag.value = {
		mode: isResize ? "resize" : "move",
		startX: event.clientX,
		startY: event.clientY,
		startData,
		propertyIndex: null,
		isPropertyShape: false,
	};

	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent) {
	const d = drag.value;
	if (!d) return;

	const s = scale.value;
	const deltaX = (event.clientX - d.startX) / s;
	const deltaY = (event.clientY - d.startY) / s;

	const patch: Record<string, number> = {};

	if (d.mode === "move") {
		patch.x = Math.round(d.startData.x + deltaX);
		patch.y = Math.round(d.startData.y + deltaY);
	} else if (d.mode === "resize" && props.shapeName === "aabb") {
		patch.w = Math.max(1, Math.round(d.startData.w + deltaX));
		patch.h = Math.max(1, Math.round(d.startData.h + deltaY));
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

function onPropertyShapePointerDown(event: PointerEvent, idx: number) {
	event.preventDefault();
	event.stopPropagation();

	const target = event.target as HTMLElement;
	const isResize = target.dataset.resize === "true";
	const items = props.propertyShapes?.items ?? [];
	const item = items[idx];
	if (!item) return;

	const startData: Record<string, number> = { x: item.x, y: item.y };
	if (item.w !== undefined) startData.w = item.w;
	if (item.h !== undefined) startData.h = item.h;

	drag.value = {
		mode: isResize ? "resize" : "move",
		startX: event.clientX,
		startY: event.clientY,
		startData,
		propertyIndex: idx,
		isPropertyShape: true,
	};

	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function onPropertyPointerMove(event: PointerEvent) {
	const d = drag.value;
	if (!d || !d.isPropertyShape) return;

	const s = scale.value;
	const deltaX = (event.clientX - d.startX) / s;
	const deltaY = (event.clientY - d.startY) / s;

	const patch: Record<string, number> = {};

	if (d.mode === "move") {
		patch.x = Math.round(d.startData.x + deltaX);
		patch.y = Math.round(d.startData.y + deltaY);
	} else if (d.mode === "resize") {
		patch.w = Math.max(1, Math.round(d.startData.w + deltaX));
		patch.h = Math.max(1, Math.round(d.startData.h + deltaY));
	}

	if (Object.keys(patch).length > 0) {
		emit("update:propertyShape", props.shapeName, d.propertyIndex, patch);
	}
}

function onPropertyPointerUp(event: PointerEvent) {
	if (!drag.value) return;
	(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	drag.value = null;
}

function onOverlayClick(event: PointerEvent) {
	// Only handle if we have property shapes and they're points
	if (!props.propertyShapes || props.propertyShapes.type !== "point") return;
	// Don't place if clicking on an existing shape element
	const target = event.target as HTMLElement;
	if (target.classList.contains("annotation-point") || target.classList.contains("annotation-box")) return;

	const vp = viewport.value;
	const aabb = props.annotation.aabb;
	if (!vp || !aabb) return;

	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
	const canvasX = event.clientX - rect.left;
	const canvasY = event.clientY - rect.top;

	// Convert canvas coords to image coords, then to aabb-relative
	const imgX = canvasX / scale.value + vp.x;
	const imgY = canvasY / scale.value + vp.y;
	const relX = Math.round(imgX - aabb.x);
	const relY = Math.round(imgY - aabb.y);

	// For single point, update it; for array, this is handled by the parent's add button
	if (props.propertyShapes.items.length === 0 || !Array.isArray(props.annotation.properties[props.shapeName])) {
		// Single point — just update position
		emit("update:propertyShape", props.shapeName, null, { x: relX, y: relY });
	}
}
</script>

<template>
	<div
		ref="container"
		class="shape-canvas-container"
		:style="{ height: canvasHeight + 'px' }"
	>
		<canvas ref="bgCanvas" class="shape-canvas-bg" />
		<div class="shape-canvas-overlay" :style="{ width: '100%', height: canvasHeight + 'px', pointerEvents: propertyShapes?.type === 'point' ? 'auto' : undefined }" @pointerdown.self="onOverlayClick">
			<!-- Rect shape -->
			<div
				v-if="props.shapeName === 'aabb' && annotation.aabb"
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
				v-else-if="props.shapeName === 'point' && annotation.point"
				class="annotation-point selected"
				:style="shapeStyle"
				@pointerdown="onShapePointerDown"
				@pointermove="onPointerMove"
				@pointerup="onPointerUp"
				@pointercancel="onPointerUp"
			></div>

			<!-- Property shapes (relative to aabb) — interactive -->
			<template v-if="propertyShapes">
				<template v-for="(style, idx) in propertyShapeStyles" :key="idx">
					<div
						v-if="propertyShapes.type === 'rect'"
						class="annotation-box selected"
						:style="{ ...style, borderColor: shapeColor }"
						@pointerdown="onPropertyShapePointerDown($event, idx)"
						@pointermove="onPropertyPointerMove"
						@pointerup="onPropertyPointerUp"
						@pointercancel="onPropertyPointerUp"
					>
						<div class="resize-handle" data-resize="true"></div>
					</div>
					<div
						v-else
						class="annotation-point selected"
						:style="style"
						@pointerdown="onPropertyShapePointerDown($event, idx)"
						@pointermove="onPropertyPointerMove"
						@pointerup="onPropertyPointerUp"
						@pointercancel="onPropertyPointerUp"
					></div>
				</template>
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
