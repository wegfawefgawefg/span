<script setup lang="ts">
import {
	selectedAnnotation,
	updateSelectedAnnotation,
	colorPickArmed,
	statusText,
	currentSheet,
	dirty,
} from "../state";

const NUMERIC_FIELDS = new Set(["frame", "x", "y", "width", "height"]);

function onFieldInput(field: string, value: string) {
	if (NUMERIC_FIELDS.has(field)) {
		updateSelectedAnnotation({ [field]: Number(value) || 0 });
	} else {
		updateSelectedAnnotation({ [field]: value });
	}
}

function togglePick() {
	if (!selectedAnnotation.value) return;
	colorPickArmed.value = !colorPickArmed.value;
	if (colorPickArmed.value) {
		statusText.value = "Click the sheet to sample a chroma key.";
	} else if (currentSheet.value) {
		statusText.value = `${currentSheet.value.file} \u2022 ${dirty.value ? "Unsaved changes" : "Saved"}`;
	}
}

const labelClass = "flex flex-col gap-1 text-[11px] font-medium text-text-dim uppercase tracking-wider";
</script>

<template>
	<div class="h-full flex flex-col overflow-hidden bg-surface-1">
		<div v-if="!selectedAnnotation" class="flex-1 flex flex-col items-center justify-center gap-2 text-center">
			<svg class="w-8 h-8 text-text-faint/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="4 2" />
				<path d="M9 12h6M12 9v6" stroke-linecap="round" />
			</svg>
			<span class="text-xs text-text-faint">Select a sprite on the sheet</span>
		</div>

		<form v-else class="flex-1 overflow-y-auto min-h-0 grid grid-cols-2 gap-2 px-2 pb-2 pt-2 auto-rows-max content-start" @submit.prevent>
			<label :class="[labelClass, 'col-span-2']">
				Name
				<input type="text" :value="selectedAnnotation.name" @input="onFieldInput('name', ($event.target as HTMLInputElement).value)" />
			</label>

			<label :class="labelClass">
				Type
				<select :value="selectedAnnotation.type" @input="onFieldInput('type', ($event.target as HTMLSelectElement).value)">
					<option value="sprite">sprite</option>
					<option value="tile">tile</option>
				</select>
			</label>

			<label :class="labelClass">
				Frame
				<input type="number" min="0" :value="selectedAnnotation.frame" @input="onFieldInput('frame', ($event.target as HTMLInputElement).value)" />
			</label>

			<label :class="labelClass">
				Direction
				<input type="text" :value="selectedAnnotation.direction" @input="onFieldInput('direction', ($event.target as HTMLInputElement).value)" />
			</label>

			<label :class="labelClass">
				Variant
				<input type="text" :value="selectedAnnotation.variant" @input="onFieldInput('variant', ($event.target as HTMLInputElement).value)" />
			</label>

			<label :class="[labelClass, 'col-span-2']">
				Chroma Key
				<div class="grid grid-cols-[1fr_auto] gap-1.5">
					<input type="text" placeholder="#00a000" :value="selectedAnnotation.chroma_key" @input="onFieldInput('chroma_key', ($event.target as HTMLInputElement).value)" />
					<button
						type="button"
						class="px-2 py-1 text-[11px] font-mono border rounded-sm cursor-pointer whitespace-nowrap transition-colors active:translate-y-px"
						:class="
							colorPickArmed
								? 'bg-copper-glow border-copper text-copper-bright'
								: 'bg-surface-2 border-border text-text-dim hover:border-copper hover:text-copper'
						"
						@click="togglePick"
					>
						{{ colorPickArmed ? "Sampling..." : "Pick" }}
					</button>
				</div>
			</label>

			<label :class="labelClass">X <input type="number" :value="selectedAnnotation.x" @input="onFieldInput('x', ($event.target as HTMLInputElement).value)" /></label>
			<label :class="labelClass">Y <input type="number" :value="selectedAnnotation.y" @input="onFieldInput('y', ($event.target as HTMLInputElement).value)" /></label>
			<label :class="labelClass">Width <input type="number" min="1" :value="selectedAnnotation.width" @input="onFieldInput('width', ($event.target as HTMLInputElement).value)" /></label>
			<label :class="labelClass">Height <input type="number" min="1" :value="selectedAnnotation.height" @input="onFieldInput('height', ($event.target as HTMLInputElement).value)" /></label>

			<label :class="[labelClass, 'col-span-2']">
				Tags
				<input type="text" placeholder="comma,separated" :value="selectedAnnotation.tags" @input="onFieldInput('tags', ($event.target as HTMLInputElement).value)" />
			</label>

			<label :class="[labelClass, 'col-span-2']">
				Notes
				<textarea rows="3" :value="selectedAnnotation.notes" @input="onFieldInput('notes', ($event.target as HTMLTextAreaElement).value)"></textarea>
			</label>
		</form>
	</div>
</template>
