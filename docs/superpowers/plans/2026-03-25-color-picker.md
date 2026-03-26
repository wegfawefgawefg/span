# Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom color picker component with an auto-extracted palette from the entity's aabb region, a hex input, and an eyedropper tool for sampling colors from the canvas.

**Architecture:** A `ColorPicker.vue` component replaces the inline color handling in `DynamicInspector.vue`. Palette extraction runs on dropdown open via an offscreen canvas. Eyedropper mode is coordinated between `ColorPicker` and `CanvasView` through a shared reactive ref in `state.ts`.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS, Canvas API (`getImageData`)

**Spec:** `docs/superpowers/specs/2026-03-25-color-picker-design.md`

---

### File Structure

**Create:**
- `src/mainview/src/components/ColorPicker.vue` — full color picker component (swatch, hex input, collapsible palette, native fallback, eyedropper button)

**Modify:**
- `src/mainview/src/state.ts` — add `activeEyedropper` ref
- `src/mainview/src/components/DynamicInspector.vue` — replace inline color template with `<ColorPicker>`
- `src/mainview/src/components/CanvasView.vue` — add eyedropper mode (cursor, hover sampling, click confirm, escape cancel)

---

### Task 1: Add activeEyedropper ref to state

**Files:**
- Modify: `src/mainview/src/state.ts`

- [ ] **Step 1: Add the eyedropper ref**

Add after the `activeTool` ref (around line 54):

```typescript
// Eyedropper state: when non-null, the canvas is in eyedropper mode
export const activeEyedropper = ref<{
	callback: (hex: string) => void;
	originalValue: string;
} | null>(null);
```

- [ ] **Step 2: Commit**

```bash
git add src/mainview/src/state.ts
git commit -m "add activeEyedropper ref for color picker coordination"
```

---

### Task 2: Create ColorPicker component

**Files:**
- Create: `src/mainview/src/components/ColorPicker.vue`

- [ ] **Step 1: Create the component**

```vue
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
	// Try adding # prefix
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
		// Clamp to image bounds
		const sx = Math.max(0, Math.min(a.x, img.naturalWidth));
		const sy = Math.max(0, Math.min(a.y, img.naturalHeight));
		const sw = Math.max(1, Math.min(a.w, img.naturalWidth - sx));
		const sh = Math.max(1, Math.min(a.h, img.naturalHeight - sy));

		const imageData = ctx.getImageData(sx, sy, sw, sh);
		const data = imageData.data;
		const freq = new Map<string, number>();

		for (let i = 0; i < data.length; i += 4) {
			const alpha = data[i + 3];
			if (alpha < 128) continue; // skip transparent

			// Quantize to nearest 8
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

// Invalidate cache when aabb changes
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
```

- [ ] **Step 2: Verify the component has no syntax errors**

Run: `bunx tsc --noEmit --pretty 2>&1 | grep "ColorPicker" | head -5`
Expected: No errors from ColorPicker.vue (or no output at all)

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/components/ColorPicker.vue
git commit -m "add ColorPicker component with palette extraction and eyedropper"
```

---

### Task 3: Integrate ColorPicker into DynamicInspector

**Files:**
- Modify: `src/mainview/src/components/DynamicInspector.vue`

- [ ] **Step 1: Add the import**

Add after the existing imports in the `<script setup>` block:

```typescript
import ColorPicker from "./ColorPicker.vue";
```

- [ ] **Step 2: Replace the color picker template block**

Replace the color picker section (the `<!-- Color picker -->` label block, lines 239-265) with:

```vue
					<!-- Color picker -->
					<label
						v-else-if="def.kind === 'color'"
						:class="labelClass"
					>
						{{ def.name }}
						<ColorPicker
							:model-value="(annotation.properties[def.name] as string) ?? ''"
							:image-source="currentSheetImageSrc"
							:aabb="annotation.aabb"
							@update:model-value="onPropertyInput(def, $event)"
						/>
					</label>
```

- [ ] **Step 3: Verify no type errors**

Run: `bunx tsc --noEmit --pretty 2>&1 | grep -E "(DynamicInspector|ColorPicker)" | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/components/DynamicInspector.vue
git commit -m "replace inline color handling with ColorPicker component"
```

---

### Task 4: Add eyedropper mode to CanvasView

**Files:**
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Import the eyedropper ref**

Add `activeEyedropper` to the state import (around line 6-22):

```typescript
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
	activeEyedropper,
} from "../state";
```

- [ ] **Step 2: Update the cursor class**

Replace the `layerCursorClass` computed (around line 48-53) with:

```typescript
const layerCursorClass = computed(() => {
	if (activeEyedropper.value) return 'cursor-crosshair';
	if (spaceHeld.value && !isPanning.value) return '';
	if (isPanning.value) return '';
	if (activeTool.value) return 'cursor-crosshair';
	return 'cursor-default';
});
```

- [ ] **Step 3: Add eyedropper pixel sampling function**

Add after the `onImageLoad` function:

```typescript
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
```

- [ ] **Step 4: Add eyedropper keyboard handler**

Add to the `onKeyDown` function, before the Space check:

```typescript
	if (e.code === "Escape" && activeEyedropper.value) {
		const original = activeEyedropper.value.originalValue;
		activeEyedropper.value.callback(original);
		activeEyedropper.value = null;
		return;
	}
```

- [ ] **Step 5: Update handleLayerPointerDown for eyedropper click**

Add at the top of `handleLayerPointerDown`, before the panning check:

```typescript
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
```

- [ ] **Step 6: Update handleLayerPointerMove for eyedropper hover preview**

Add at the top of `handleLayerPointerMove`, before the drawing check:

```typescript
	// Eyedropper mode: live preview on hover
	if (activeEyedropper.value) {
		const hex = samplePixelAt(event.clientX, event.clientY);
		if (hex) {
			activeEyedropper.value.callback(hex);
		}
		return;
	}
```

- [ ] **Step 7: Add right-click cancel for eyedropper**

Add to the `onCanvasContextMenu` function, at the top:

```typescript
	if (activeEyedropper.value) {
		event.preventDefault();
		const original = activeEyedropper.value.originalValue;
		activeEyedropper.value.callback(original);
		activeEyedropper.value = null;
		return;
	}
```

- [ ] **Step 8: Verify no type errors**

Run: `bunx tsc --noEmit --pretty 2>&1 | grep "CanvasView" | head -10`
Expected: No errors

- [ ] **Step 9: Run all tests**

Run: `bunx bun test 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 10: Commit**

```bash
git add src/mainview/src/components/CanvasView.vue
git commit -m "add eyedropper mode to canvas for color picking"
```
