<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { Annotation } from "../types";
import {
	zoom,
	annotations,
	selectedId,
	selectAnnotation,
	colorPickArmed,
	currentSheetImageSrc,
	imageWidth,
	imageHeight,
	registerViewportCenterFn,
	updateSelectedAnnotation,
} from "../state";
import { ZOOM_FACTOR } from "../state";
import { useCanvas } from "../composables/useCanvas";

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

onMounted(() => {
	registerViewportCenterFn(() => {
		const el = scroller.value;
		if (!el) return { x: 0, y: 0 };
		const x = (el.scrollLeft + el.clientWidth / 2) / zoom.value;
		const y = (el.scrollTop + el.clientHeight / 2) / zoom.value;
		return { x, y };
	});
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
	const factor = event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
	zoomTo(
		zoom.value * factor,
		scroller.value!,
		stage.value!,
		event.clientX,
		event.clientY,
	);
}

function handleZoomIn() {
	zoomTo(zoom.value * ZOOM_FACTOR, scroller.value!, stage.value!);
}

function handleZoomOut() {
	zoomTo(zoom.value / ZOOM_FACTOR, scroller.value!, stage.value!);
}

function handleBoxPointerDown(event: PointerEvent, annotation: Annotation) {
	event.preventDefault();
	event.stopPropagation();

	if (colorPickArmed.value) {
		sampleColorAt(event.clientX, event.clientY);
		return;
	}

	selectAnnotation(annotation.id);
	const target = event.target as HTMLElement;
	const isResize = target.dataset.resize === "true";
	startDrag(event, annotation, isResize);

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
	if (!colorPickArmed.value) return;
	event.preventDefault();
	event.stopPropagation();
	sampleColorAt(event.clientX, event.clientY);
}

function sampleColorAt(clientX: number, clientY: number) {
	const layer = stage.value;
	if (!layer) return;
	const rect = layer.getBoundingClientRect();
	const x = Math.floor((clientX - rect.left) / zoom.value);
	const y = Math.floor((clientY - rect.top) / zoom.value);
	if (x < 0 || y < 0 || x >= imageWidth.value || y >= imageHeight.value)
		return;

	const pixel = sampleCtx.getImageData(x, y, 1, 1).data;
	const hex = (v: number) => v.toString(16).padStart(2, "0");
	const color = `#${hex(pixel[0])}${hex(pixel[1])}${hex(pixel[2])}`;
	updateSelectedAnnotation({ chroma_key: color });
	colorPickArmed.value = false;
}

function boxStyle(annotation: Annotation, index: number) {
	const isSelected = annotation.id === selectedId.value;
	return {
		left: `${annotation.x * zoom.value}px`,
		top: `${annotation.y * zoom.value}px`,
		width: `${annotation.width * zoom.value}px`,
		height: `${annotation.height * zoom.value}px`,
		zIndex: isSelected ? annotations.value.length + 10 : index + 1,
	};
}
</script>

<template>
	<div class="canvas-shell">
		<div class="absolute top-2 right-2 z-50 flex items-center gap-0.5 p-1 bg-surface-0/90 border border-border rounded-sm backdrop-blur-sm">
			<button
				type="button"
				class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper border border-transparent hover:border-copper/40 rounded-sm transition-colors cursor-pointer bg-transparent text-xs font-mono"
				@click="handleZoomOut"
			>-</button>
			<span class="min-w-[42px] text-center text-[10px] font-mono text-text-faint select-none">{{ zoomLabel }}</span>
			<button
				type="button"
				class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper border border-transparent hover:border-copper/40 rounded-sm transition-colors cursor-pointer bg-transparent text-xs font-mono"
				@click="handleZoomIn"
			>+</button>
		</div>
		<div ref="scroller" class="canvas-scroller" @wheel.prevent="handleWheel">
			<div
				ref="stage"
				class="canvas-stage"
				:style="{ width: stageWidth + 'px', height: stageHeight + 'px' }"
			>
				<img
					ref="sheetImg"
					class="sheet-image"
					:src="currentSheetImageSrc"
					alt=""
					:style="{
						width: stageWidth + 'px',
						height: stageHeight + 'px',
					}"
					draggable="false"
					@load="onImageLoad"
				/>
				<div
					class="annotation-layer"
					:class="{ 'color-pick-armed': colorPickArmed }"
					:style="{
						width: stageWidth + 'px',
						height: stageHeight + 'px',
					}"
					@pointerdown="handleLayerPointerDown"
				>
					<button
						v-for="(annotation, index) in annotations"
						:key="annotation.id"
						type="button"
						class="annotation-box"
						:class="{ selected: annotation.id === selectedId }"
						:style="boxStyle(annotation, index)"
						@pointerdown="handleBoxPointerDown($event, annotation)"
						@pointermove="handleBoxPointerMove"
						@pointerup="handleBoxPointerUp"
						@pointercancel="handleBoxPointerUp"
					>
						<div class="annotation-label">
							{{ annotation.name }} [{{ annotation.frame }}]
						</div>
						<div class="resize-handle" data-resize="true"></div>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>
