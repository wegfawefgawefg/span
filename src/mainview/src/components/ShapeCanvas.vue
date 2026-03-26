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
	previewRect.value,
], drawBackground, { deep: true });

// --- Drag handling ---

interface DragState {
	mode: "move" | "resize";
	startX: number;
	startY: number;
	startData: Record<string, number>;
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
