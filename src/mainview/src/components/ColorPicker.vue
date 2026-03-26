<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from "vue";
import { activeEyedropper } from "../state";

const props = defineProps<{
	modelValue: string;
	imageSource: string;
	aabb: { x: number; y: number; w: number; h: number } | null;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const expanded = ref(false);
const pickerRef = ref<HTMLElement | null>(null);
const nativeInput = ref<HTMLInputElement | null>(null);
const palette = ref<string[]>([]);
const paletteCache = ref<{ key: string; colors: string[] } | null>(null);

// --- Hex normalization ---

const HEX_RE = /^#[0-9a-f]{6}$/i;

function normalizeHex(value: string): string | null {
	const v = value.trim().toLowerCase();
	if (HEX_RE.test(v)) return v;
	if (/^[0-9a-f]{6}$/i.test(v)) return `#${v}`;
	return null;
}

function rgbToHex(r: number, g: number, b: number): string {
	return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

// --- Palette extraction ---

function cacheKey(): string {
	if (!props.aabb) return "";
	return `${props.imageSource}:${props.aabb.x},${props.aabb.y},${props.aabb.w},${props.aabb.h}`;
}

function extractPalette() {
	if (!props.aabb || !props.imageSource) {
		palette.value = [];
		return;
	}

	const key = cacheKey();
	if (paletteCache.value?.key === key) {
		palette.value = paletteCache.value.colors;
		return;
	}

	const img = new Image();
	img.crossOrigin = "anonymous";
	img.onload = () => {
		const canvas = document.createElement("canvas");
		canvas.width = img.naturalWidth;
		canvas.height = img.naturalHeight;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) return;

		ctx.drawImage(img, 0, 0);

		const a = props.aabb!;
		const sx = Math.max(0, Math.min(a.x, img.naturalWidth));
		const sy = Math.max(0, Math.min(a.y, img.naturalHeight));
		const sw = Math.max(1, Math.min(a.w, img.naturalWidth - sx));
		const sh = Math.max(1, Math.min(a.h, img.naturalHeight - sy));

		const imageData = ctx.getImageData(sx, sy, sw, sh);
		const data = imageData.data;
		const freq = new Map<string, number>();

		for (let i = 0; i < data.length; i += 4) {
			const alpha = data[i + 3];
			if (alpha < 128) continue;

			const r = Math.round(data[i] / 8) * 8;
			const g = Math.round(data[i + 1] / 8) * 8;
			const b = Math.round(data[i + 2] / 8) * 8;
			const hex = rgbToHex(
				Math.min(r, 255),
				Math.min(g, 255),
				Math.min(b, 255),
			);
			freq.set(hex, (freq.get(hex) ?? 0) + 1);
		}

		const sorted = [...freq.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 32)
			.map(([hex]) => hex);

		palette.value = sorted;
		paletteCache.value = { key, colors: sorted };
	};
	img.src = props.imageSource;
}

watch(
	() => cacheKey(),
	() => {
		if (paletteCache.value && paletteCache.value.key !== cacheKey()) {
			paletteCache.value = null;
		}
	},
);

// --- Toggle dropdown ---

function toggleExpanded() {
	expanded.value = !expanded.value;
	if (expanded.value) {
		extractPalette();
	}
}

// --- Swatch click ---

function selectColor(hex: string) {
	emit("update:modelValue", hex);
	expanded.value = false;
}

// --- Hex input ---

function onHexInput(event: Event) {
	const value = (event.target as HTMLInputElement).value;
	const hex = normalizeHex(value);
	if (hex) {
		emit("update:modelValue", hex);
	}
}

// --- Native color picker ---

function openNativePicker() {
	nativeInput.value?.click();
}

function onNativeInput(event: Event) {
	const value = (event.target as HTMLInputElement).value;
	emit("update:modelValue", value.toLowerCase());
	expanded.value = false;
}

// --- Eyedropper ---

function activateEyedropper() {
	expanded.value = false;
	activeEyedropper.value = {
		callback: (hex: string) => {
			emit("update:modelValue", hex);
		},
		originalValue: props.modelValue || "",
	};
}

// --- Click outside ---

function onClickOutside(event: MouseEvent) {
	if (expanded.value && pickerRef.value && !pickerRef.value.contains(event.target as Node)) {
		expanded.value = false;
	}
}

onMounted(() => {
	document.addEventListener("pointerdown", onClickOutside, true);
});

onUnmounted(() => {
	document.removeEventListener("pointerdown", onClickOutside, true);
});

const displayColor = computed(() => props.modelValue || "#000000");
const isSelected = (hex: string) => hex.toLowerCase() === (props.modelValue || "").toLowerCase();
</script>

<template>
	<div ref="pickerRef" class="flex flex-col gap-1.5">
		<!-- Collapsed row: swatch + hex + eyedropper + chevron -->
		<div class="flex items-center gap-1.5">
			<span
				class="w-7 h-7 shrink-0 rounded-sm border border-border"
				:style="{ backgroundColor: displayColor }"
			/>
			<input
				type="text"
				:value="modelValue ?? ''"
				placeholder="#000000"
				class="flex-1 min-w-0"
				@change="onHexInput"
			/>
			<button
				type="button"
				class="w-6 h-6 flex items-center justify-center text-text-dim hover:text-copper transition-colors cursor-pointer bg-transparent border-none p-0"
				title="Pick color from canvas"
				@click="activateEyedropper"
			>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M13.5 2.5a1.41 1.41 0 0 0-2 0L9.5 4.5 7 2 2 7l2.5 2.5L2.5 11.5v2h2L6.5 11.5 9 14l5-5-2.5-2.5 2-2a1.41 1.41 0 0 0 0-2z"/>
				</svg>
			</button>
			<button
				type="button"
				class="w-6 h-6 flex items-center justify-center text-text-faint hover:text-text-dim transition-colors cursor-pointer bg-transparent border-none p-0"
				title="Toggle palette"
				@click="toggleExpanded"
			>
				{{ expanded ? "\u25B2" : "\u25BC" }}
			</button>
		</div>

		<!-- Expanded dropdown -->
		<div
			v-if="expanded"
			class="bg-surface-2 border border-border rounded p-2 flex flex-col gap-2"
		>
			<!-- Palette grid -->
			<div
				v-if="palette.length > 0"
				class="grid gap-1"
				style="grid-template-columns: repeat(8, 1fr);"
			>
				<button
					v-for="hex in palette"
					:key="hex"
					type="button"
					class="aspect-square rounded-sm cursor-pointer border p-0 bg-transparent"
					:class="isSelected(hex) ? 'border-copper border-2' : 'border-border'"
					:style="{ backgroundColor: hex }"
					:title="hex"
					@click="selectColor(hex)"
				/>
			</div>
			<div v-else class="text-text-faint text-[11px] text-center py-2">
				No colors extracted
			</div>

			<!-- Bottom row: eyedropper + custom -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="flex items-center gap-1 text-[11px] text-text-dim hover:text-copper transition-colors cursor-pointer bg-transparent border-none p-0"
					@click="activateEyedropper"
				>
					<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M13.5 2.5a1.41 1.41 0 0 0-2 0L9.5 4.5 7 2 2 7l2.5 2.5L2.5 11.5v2h2L6.5 11.5 9 14l5-5-2.5-2.5 2-2a1.41 1.41 0 0 0 0-2z"/>
					</svg>
					pick
				</button>
				<button
					type="button"
					class="flex items-center gap-1 text-[11px] text-text-dim hover:text-copper transition-colors cursor-pointer bg-transparent border-none p-0 ml-auto"
					@click="openNativePicker"
				>
					<div
						class="w-4 h-4 rounded-sm border border-border"
						style="background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);"
					/>
					custom
				</button>
			</div>

			<!-- Hidden native color input -->
			<input
				ref="nativeInput"
				type="color"
				:value="displayColor"
				class="absolute w-0 h-0 opacity-0 pointer-events-none"
				@input="onNativeInput"
			/>
		</div>
	</div>
</template>
