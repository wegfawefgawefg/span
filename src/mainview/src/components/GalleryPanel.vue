<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import type { Annotation } from "../annotation";
import {
	sheets,
	currentSheet,
	annotations as currentAnnotations,
	openSheetByPath,
	selectAnnotation,
	activeSpec,
	getPreviewShapeName,
} from "../state";
import { getEntityByLabel } from "../spec/types";

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
	name: string;
	frameCount: number;
	inCurrentSheet: boolean;
	frames: GalleryFrame[];
}

const previewScale = ref(3);
const imageCache = new Map<string, Promise<HTMLImageElement>>();

// Invalidate cached images only when sheets are added/removed or images change (not on annotation edits)
watch(
	() => sheets.value.map(s => s.path + "\0" + s.imageUrl + "\0" + s.status),
	() => { imageCache.clear(); },
);
const sourceCanvas = document.createElement("canvas");
const sourceCtx = sourceCanvas.getContext("2d", {
	willReadFrequently: true,
})!;

let galleryTick = 0;
let galleryTimer: number | null = null;
const canvasRefs = ref<Map<string, HTMLCanvasElement>>(new Map());

const isRectEntity = (ann: Annotation): boolean => {
	return getPreviewShapeName(ann.entityType) !== null;
};

function getAnnotationName(ann: Annotation): string {
	if (!activeSpec.value) return "";
	const entity = getEntityByLabel(activeSpec.value, ann.entityType);
	if (!entity) return "";
	const firstString = entity.properties.find(f => f.kind === "scalar" && f.type === "string");
	return firstString ? (ann.properties[firstString.name] as string ?? "") : "";
}

function getFrameValue(ann: Annotation): number {
	if (!activeSpec.value) return 0;
	const entity = getEntityByLabel(activeSpec.value, ann.entityType);
	if (!entity) return 0;
	const scalars = entity.properties.filter(f => f.kind === "scalar");
	const numericTypes = new Set(["integer", "number", "ainteger"]);
	const frameProp = scalars.find(f => f.kind === "scalar" && f.name === "frame" && numericTypes.has(f.type))
		?? scalars.find(f => f.kind === "scalar" && numericTypes.has(f.type));
	return frameProp ? (ann.properties[frameProp.name] as number ?? 0) : 0;
}

function getChromaKey(ann: Annotation): string | undefined {
	return ann.chromaKey || undefined;
}

function groupKey(ann: Annotation): string {
	const name = getAnnotationName(ann).trim();
	// Build extra grouping fields: all string properties except the first (name)
	if (!activeSpec.value) return [ann.entityType, name].join("|");
	const entity = getEntityByLabel(activeSpec.value, ann.entityType);
	if (!entity) return [ann.entityType, name].join("|");
	const stringFields = entity.properties.filter(f => f.kind === "scalar" && f.type === "string");
	const extraFields = stringFields.slice(1).map(f => (ann.properties[f.name] as string ?? "").trim());
	return [ann.entityType, name, ...extraFields].join("|");
}

const groups = computed<SpriteGroup[]>(() => {
	// Depend on currentAnnotations so we react to live edits (drag, inspector)
	const liveAnnotations = currentAnnotations.value;
	const currentFile = currentSheet.value?.path;

	const map = new Map<string, SpriteGroup>();
	for (const sheet of sheets.value) {
		// Skip missing sheets (no image data to render)
		if (sheet.status === "missing") continue;
		// For the active sheet, use live annotations for real-time updates
		const anns =
			sheet.path === currentFile ? liveAnnotations : (sheet.annotations ?? []);
		for (const ann of anns) {
			// Only show rect-shape entities in the gallery
			if (!isRectEntity(ann)) continue;

			const name = getAnnotationName(ann).trim();
			if (!name) continue;
			const key = groupKey(ann);
			let group = map.get(key);
			if (!group) {
				group = {
					key,
					name,
					frameCount: 0,
					inCurrentSheet: false,
					frames: [],
				};
				map.set(key, group);
			}
			group.inCurrentSheet ||= sheet.path === currentFile;
			group.frames.push({
				annotation: ann,
				annotationId: ann.id,
				sheetFile: sheet.path,
			});
		}
	}

	const result = Array.from(map.values());
	for (const g of result) {
		g.frames.sort((a, b) => {
			const fd = getFrameValue(a.annotation) - getFrameValue(b.annotation);
			if (fd !== 0) return fd;
			if (a.sheetFile !== b.sheetFile)
				return a.sheetFile.localeCompare(b.sheetFile);
			const ra = a.annotation.aabb;
			const rb = b.annotation.aabb;
			if (ra && rb) {
				if (ra.y !== rb.y) return ra.y - rb.y;
				return ra.x - rb.x;
			}
			return 0;
		});
		g.frameCount = g.frames.length;
	}

	result.sort((a, b) => {
		if (a.inCurrentSheet !== b.inCurrentSheet)
			return a.inCurrentSheet ? -1 : 1;
		return a.key.localeCompare(b.key);
	});

	return result;
});

function getFirstFrameRect(group: SpriteGroup): { width: number; height: number } | null {
	const first = group.frames[0];
	if (!first) return null;
	const aabb = first.annotation.aabb;
	if (!aabb) return null;
	return { width: aabb.w, height: aabb.h };
}

function loadImage(sheetFile: string): Promise<HTMLImageElement> {
	const cached = imageCache.get(sheetFile);
	if (cached) return cached;
	const sheet = sheets.value.find(s => s.path === sheetFile);
	if (!sheet || !sheet.imageUrl) {
		return Promise.reject(new Error(`Sheet not found: ${sheetFile}`));
	}
	const p = new Promise<HTMLImageElement>((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = sheet.imageUrl;
	});
	// Only cache successful loads — failed loads should retry when sheet data changes
	const cachedP = p.catch((err) => {
		imageCache.delete(sheetFile);
		throw err;
	});
	imageCache.set(sheetFile, cachedP);
	return cachedP;
}

function drawFrame(canvas: HTMLCanvasElement, frame: GalleryFrame) {
	const aabb = frame.annotation.aabb;
	if (!aabb) return;

	const w = Math.max(1, aabb.w);
	const h = Math.max(1, aabb.h);
	canvas.width = w * previewScale.value;
	canvas.height = h * previewScale.value;

	loadImage(frame.sheetFile)
		.then((img) => {
			sourceCanvas.width = w;
			sourceCanvas.height = h;
			sourceCtx.clearRect(0, 0, w, h);
			sourceCtx.drawImage(
				img,
				aabb.x,
				aabb.y,
				w,
				h,
				0,
				0,
				w,
				h,
			);

			const chromaValue = getChromaKey(frame.annotation);
			const chroma = chromaValue ? parseHexColor(chromaValue) : null;
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
		group.frames.find((f) => f.sheetFile === currentSheet.value?.path) ??
		group.frames[0];
	if (!target) return;
	if (currentSheet.value?.path !== target.sheetFile) {
		await openSheetByPath(target.sheetFile);
	} else {
		selectAnnotation(target.annotationId);
	}
}

function onGroupContextMenu(event: MouseEvent, group: SpriteGroup) {
	const target =
		group.frames.find((f) => f.sheetFile === currentSheet.value?.path) ??
		group.frames[0];
	const entries: MenuEntry[] = [
		{
			label: "Select sprite",
			action: () => { if (target) handleClick(group); },
		},
	];
	if (target && target.sheetFile !== currentSheet.value?.path) {
		entries.unshift({
			label: `Open ${target.sheetFile}`,
			action: () => openSheetByPath(target.sheetFile),
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
		<div class="instant-scroll flex-1 overflow-y-auto min-h-0 px-2 py-2 flex flex-wrap gap-2 content-start items-start">
			<button
				v-for="group in groups"
				:key="group.key"
				type="button"
				class="inline-flex flex-col border rounded-sm text-left transition-all cursor-pointer active:translate-y-px overflow-hidden"
				:class="[
					previewScale >= 3 ? 'gap-1 p-2' : 'gap-0 p-1',
					group.inCurrentSheet
						? 'bg-copper-glow border-copper/30'
						: 'bg-surface-2 border-border hover:border-border-strong hover:-translate-y-px'
				]"
				:style="previewScale >= 3 ? { maxWidth: (getFirstFrameRect(group)?.width ?? 16) * previewScale + 16 + 'px' } : undefined"
				@click="handleClick(group)"
				@contextmenu.stop="onGroupContextMenu($event, group)"
			>
				<canvas
					:ref="(el: any) => setCanvasRef(group.key, el)"
					class="gallery-preview"
					:title="`${group.name} — ${group.frameCount}f`"
				></canvas>
				<template v-if="previewScale >= 3">
					<div class="text-xs font-medium truncate max-w-full" :class="group.inCurrentSheet ? 'text-copper-bright' : 'text-text'">
						{{ group.name }}
					</div>
					<div class="font-mono text-[10px] text-text-faint truncate max-w-full">
						{{ group.frameCount }}f
					</div>
				</template>
			</button>
		</div>
		<ContextMenu ref="ctxMenu" />
	</div>
</template>
