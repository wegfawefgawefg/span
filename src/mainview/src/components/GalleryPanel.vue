<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { Annotation } from "../types";
import {
	projectSheets,
	currentSheet,
	annotations as currentAnnotations,
	openSheet,
	selectAnnotation,
} from "../state";
import { api } from "../rpc";
import { parseHexColor, applyChromaKey } from "../composables/useChromaKey";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";

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

const previewScale = ref(3);
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
	// Depend on currentAnnotations so we react to live edits (drag, inspector)
	const liveAnnotations = currentAnnotations.value;
	const currentFile = currentSheet.value?.file;

	const map = new Map<string, SpriteGroup>();
	for (const sheet of projectSheets.value) {
		// For the active sheet, use live annotations instead of the
		// stale projectSheets copy (which only syncs on commit actions)
		const anns =
			sheet.file === currentFile ? liveAnnotations : (sheet.annotations ?? []);
		for (const ann of anns) {
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
			group.inCurrentSheet ||= sheet.file === currentFile;
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
	canvas.width = w * previewScale.value;
	canvas.height = h * previewScale.value;

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

watch(previewScale, () => {
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

const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

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

function onGroupContextMenu(event: MouseEvent, group: SpriteGroup) {
	const target =
		group.frames.find((f) => f.sheetFile === currentSheet.value?.file) ??
		group.frames[0];
	const entries: MenuEntry[] = [
		{
			label: "Select sprite",
			action: () => { if (target) handleClick(group); },
		},
	];
	if (target && target.sheetFile !== currentSheet.value?.file) {
		entries.unshift({
			label: `Open ${target.sheetFile}`,
			action: () => openSheet(target.sheetFile, target.annotationId),
		});
	}
	ctxMenu.value?.show(event, entries);
}
</script>

<template>
	<div class="h-full flex flex-col overflow-hidden bg-surface-1">
		<div class="flex items-center gap-2 px-2 pt-1.5 pb-0.5">
			<span class="text-[10px] font-mono text-text-faint">{{ previewScale }}x</span>
			<input
				type="range"
				min="1"
				max="8"
				step="1"
				:value="previewScale"
				class="gallery-zoom-slider flex-1"
				@input="previewScale = Number(($event.target as HTMLInputElement).value)"
			/>
			<span class="text-[10px] font-mono text-text-faint border border-border rounded-sm px-1">{{ groups.length }}</span>
		</div>
		<div class="flex-1 overflow-y-auto min-h-0 px-2 py-2 flex flex-wrap gap-2 content-start items-start">
			<button
				v-for="group in groups"
				:key="group.key"
				type="button"
				class="inline-flex flex-col gap-1.5 p-2 border rounded-sm text-left transition-all cursor-pointer active:translate-y-px"
				:class="
					group.inCurrentSheet
						? 'bg-copper-glow border-copper/30'
						: 'bg-surface-2 border-border hover:border-border-strong hover:-translate-y-px'
				"
				@click="handleClick(group)"
			@contextmenu.stop="onGroupContextMenu($event, group)"
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
		<ContextMenu ref="ctxMenu" />
	</div>
</template>
