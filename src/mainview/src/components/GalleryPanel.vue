<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { Annotation } from "../types";
import {
	projectSheets,
	currentSheet,
	openSheet,
	selectAnnotation,
} from "../state";
import { api } from "../rpc";
import { parseHexColor, applyChromaKey } from "../composables/useChromaKey";

interface GalleryFrame {
	annotation: Annotation;
	annotationId: string;
	sheetFile: string;
}

interface SpriteGroup {
	key: string;
	type: string;
	name: string;
	direction: string;
	variant: string;
	inCurrentSheet: boolean;
	frames: GalleryFrame[];
}

const PREVIEW_SCALE = 3;
const imageCache = new Map<string, Promise<HTMLImageElement>>();
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", {
	willReadFrequently: true,
})!;

let galleryTick = 0;
let galleryTimer: number | null = null;
const canvasRefs = ref<Map<string, HTMLCanvasElement>>(new Map());

function groupKey(a: Annotation): string {
	return [
		a.type ?? "sprite",
		a.name?.trim() ?? "",
		a.direction?.trim() ?? "",
		a.variant?.trim() ?? "",
	].join("|");
}

const groups = computed<SpriteGroup[]>(() => {
	const map = new Map<string, SpriteGroup>();
	for (const sheet of projectSheets.value) {
		for (const ann of sheet.annotations ?? []) {
			const name = ann.name?.trim() ?? "";
			if (!name) continue;
			const key = groupKey(ann);
			let group = map.get(key);
			if (!group) {
				group = {
					key,
					type: ann.type ?? "sprite",
					name,
					direction: ann.direction?.trim() ?? "",
					variant: ann.variant?.trim() ?? "",
					inCurrentSheet: false,
					frames: [],
				};
				map.set(key, group);
			}
			group.inCurrentSheet ||= sheet.file === currentSheet.value?.file;
			group.frames.push({
				annotation: ann,
				annotationId: ann.id,
				sheetFile: sheet.file,
			});
		}
	}

	const result = Array.from(map.values());
	for (const g of result) {
		g.frames.sort((a, b) => {
			const fd = (a.annotation.frame ?? 0) - (b.annotation.frame ?? 0);
			if (fd !== 0) return fd;
			if (a.sheetFile !== b.sheetFile)
				return a.sheetFile.localeCompare(b.sheetFile);
			if (a.annotation.y !== b.annotation.y)
				return a.annotation.y - b.annotation.y;
			return a.annotation.x - b.annotation.x;
		});
	}

	result.sort((a, b) => {
		if (a.inCurrentSheet !== b.inCurrentSheet)
			return a.inCurrentSheet ? -1 : 1;
		return a.key.localeCompare(b.key);
	});

	return result;
});

function loadImage(sheetFile: string): Promise<HTMLImageElement> {
	const cached = imageCache.get(sheetFile);
	if (cached) return cached;
	const p = api.getSheetImage(sheetFile).then((dataUrl) => {
		return new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = dataUrl;
		});
	});
	imageCache.set(sheetFile, p);
	return p;
}

function drawFrame(canvas: HTMLCanvasElement, frame: GalleryFrame) {
	const w = Math.max(1, frame.annotation.width);
	const h = Math.max(1, frame.annotation.height);
	canvas.width = w * PREVIEW_SCALE;
	canvas.height = h * PREVIEW_SCALE;

	loadImage(frame.sheetFile)
		.then((img) => {
			sourceCanvas.width = w;
			sourceCanvas.height = h;
			sourceCtx.clearRect(0, 0, w, h);
			sourceCtx.drawImage(
				img,
				frame.annotation.x,
				frame.annotation.y,
				w,
				h,
				0,
				0,
				w,
				h,
			);

			const chroma = parseHexColor(frame.annotation.chroma_key);
			if (chroma) {
				const id = sourceCtx.getImageData(0, 0, w, h);
				applyChromaKey(id, chroma);
				sourceCtx.putImageData(id, 0, 0);
			}

			const ctx = canvas.getContext("2d")!;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.imageSmoothingEnabled = false;
			ctx.drawImage(
				sourceCanvas,
				0,
				0,
				w,
				h,
				0,
				0,
				canvas.width,
				canvas.height,
			);
		})
		.catch(() => {
			const ctx = canvas.getContext("2d")!;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = "#9da3ad";
			ctx.font = "11px sans-serif";
			ctx.fillText("Load failed", 8, 16);
		});
}

function renderPreviews() {
	for (const group of groups.value) {
		const canvas = canvasRefs.value.get(group.key);
		if (!canvas) continue;
		const frameIndex =
			group.frames.length === 1
				? 0
				: galleryTick % group.frames.length;
		drawFrame(canvas, group.frames[frameIndex]);
	}
}

function setCanvasRef(key: string, el: unknown) {
	if (el instanceof HTMLCanvasElement) {
		canvasRefs.value.set(key, el);
	} else {
		canvasRefs.value.delete(key);
	}
}

watch(groups, () => {
	requestAnimationFrame(renderPreviews);
});

onMounted(() => {
	galleryTimer = window.setInterval(() => {
		galleryTick++;
		renderPreviews();
	}, 250);
	renderPreviews();
});

onUnmounted(() => {
	if (galleryTimer !== null) {
		clearInterval(galleryTimer);
		galleryTimer = null;
	}
});

async function handleClick(group: SpriteGroup) {
	const target =
		group.frames.find((f) => f.sheetFile === currentSheet.value?.file) ??
		group.frames[0];
	if (!target) return;
	if (currentSheet.value?.file !== target.sheetFile) {
		await openSheet(target.sheetFile, target.annotationId);
	} else {
		selectAnnotation(target.annotationId);
	}
}
</script>

<template>
	<div class="h-full p-3 flex flex-col overflow-hidden bg-surface-1">
		<div class="flex items-center justify-between mb-2">
			<h2 class="text-xs font-semibold tracking-wide text-text-dim uppercase">Gallery</h2>
			<span class="px-1.5 py-0.5 text-[10px] font-mono text-text-faint border border-border rounded-sm">
				{{ groups.length }}
			</span>
		</div>
		<div class="flex-1 overflow-y-auto min-h-0 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2 auto-rows-max content-start">
			<button
				v-for="group in groups"
				:key="group.key"
				type="button"
				class="flex flex-col gap-1.5 p-2 border rounded-sm text-left transition-all cursor-pointer"
				:class="
					group.inCurrentSheet
						? 'bg-copper-glow border-copper/30'
						: 'bg-surface-2 border-border hover:border-border-strong'
				"
				@click="handleClick(group)"
			>
				<canvas
					:ref="(el: any) => setCanvasRef(group.key, el)"
					class="gallery-preview"
				></canvas>
				<div class="text-xs font-medium truncate" :class="group.inCurrentSheet ? 'text-copper-bright' : 'text-text'">
					{{ group.name }}
				</div>
				<div class="font-mono text-[10px] text-text-faint">
					{{ group.frames.length }}f<template v-if="group.direction"> &middot; {{ group.direction }}</template><template v-if="group.variant"> &middot; {{ group.variant }}</template>
				</div>
			</button>
		</div>
	</div>
</template>
