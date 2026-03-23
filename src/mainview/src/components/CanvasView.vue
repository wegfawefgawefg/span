<script setup lang="ts">
import { ref, computed } from "vue";
import type { Annotation } from "../types";
import {
	zoom,
	annotations,
	selectedId,
	selectAnnotation,
	colorPickArmed,
	currentSheetImageSrc,
} from "../state";
import { ZOOM_FACTOR } from "../state";
import { useCanvas } from "../composables/useCanvas";

const emit = defineEmits<{
	chromaSampled: [color: string];
	imageLoaded: [width: number, height: number];
}>();

const props = defineProps<{
	imageWidth: number;
	imageHeight: number;
}>();

const scroller = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const sheetImg = ref<HTMLImageElement | null>(null);
const { zoomTo, startDrag, onPointerMove, endDrag } = useCanvas();

const stageWidth = computed(() => Math.round(props.imageWidth * zoom.value));
const stageHeight = computed(() => Math.round(props.imageHeight * zoom.value));

// Chroma sampling canvas
const sampleCanvas = document.createElement("canvas");
const sampleCtx = sampleCanvas.getContext("2d", {
	willReadFrequently: true,
})!;

function onImageLoad() {
	const img = sheetImg.value;
	if (!img) return;
	sampleCanvas.width = img.naturalWidth;
	sampleCanvas.height = img.naturalHeight;
	sampleCtx.clearRect(0, 0, img.naturalWidth, img.naturalHeight);
	sampleCtx.drawImage(img, 0, 0);
	emit("imageLoaded", img.naturalWidth, img.naturalHeight);
}

function handleWheel(event: WheelEvent) {
	if (!props.imageWidth) return;
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
	onPointerMove(event, props.imageWidth, props.imageHeight);
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
	if (x < 0 || y < 0 || x >= props.imageWidth || y >= props.imageHeight)
		return;

	const pixel = sampleCtx.getImageData(x, y, 1, 1).data;
	const hex = (v: number) => v.toString(16).padStart(2, "0");
	const color = `#${hex(pixel[0])}${hex(pixel[1])}${hex(pixel[2])}`;
	emit("chromaSampled", color);
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

defineExpose({
	getViewportCenter() {
		const el = scroller.value;
		if (!el) return { x: 0, y: 0 };
		const x = (el.scrollLeft + el.clientWidth / 2) / zoom.value;
		const y = (el.scrollTop + el.clientHeight / 2) / zoom.value;
		return { x, y };
	},
	handleZoomIn,
	handleZoomOut,
});
</script>

<template>
	<div class="canvas-shell">
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
