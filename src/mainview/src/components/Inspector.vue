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
</script>

<template>
	<section class="panel">
		<div class="panel-header">
			<h2>Selection</h2>
		</div>
		<div v-if="!selectedAnnotation" class="empty-state">
			Select a sprite on the sheet.
		</div>
		<form v-else class="inspector-form" @submit.prevent>
			<label>
				Name
				<input
					type="text"
					:value="selectedAnnotation.name"
					@input="
						onFieldInput(
							'name',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Type
				<select
					:value="selectedAnnotation.type"
					@input="
						onFieldInput(
							'type',
							($event.target as HTMLSelectElement).value,
						)
					"
				>
					<option value="sprite">sprite</option>
					<option value="tile">tile</option>
				</select>
			</label>
			<label>
				Frame
				<input
					type="number"
					min="0"
					:value="selectedAnnotation.frame"
					@input="
						onFieldInput(
							'frame',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Direction
				<input
					type="text"
					:value="selectedAnnotation.direction"
					@input="
						onFieldInput(
							'direction',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Variant
				<input
					type="text"
					:value="selectedAnnotation.variant"
					@input="
						onFieldInput(
							'variant',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Chroma Key
				<div class="inline-field">
					<input
						type="text"
						placeholder="#00a000"
						:value="selectedAnnotation.chroma_key"
						@input="
							onFieldInput(
								'chroma_key',
								($event.target as HTMLInputElement).value,
							)
						"
					/>
					<button type="button" @click="togglePick">
						{{ colorPickArmed ? "Click Sheet" : "Pick" }}
					</button>
				</div>
			</label>
			<label>
				X
				<input
					type="number"
					:value="selectedAnnotation.x"
					@input="
						onFieldInput(
							'x',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Y
				<input
					type="number"
					:value="selectedAnnotation.y"
					@input="
						onFieldInput(
							'y',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Width
				<input
					type="number"
					min="1"
					:value="selectedAnnotation.width"
					@input="
						onFieldInput(
							'width',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Height
				<input
					type="number"
					min="1"
					:value="selectedAnnotation.height"
					@input="
						onFieldInput(
							'height',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Tags
				<input
					type="text"
					placeholder="comma,separated"
					:value="selectedAnnotation.tags"
					@input="
						onFieldInput(
							'tags',
							($event.target as HTMLInputElement).value,
						)
					"
				/>
			</label>
			<label>
				Notes
				<textarea
					rows="4"
					:value="selectedAnnotation.notes"
					@input="
						onFieldInput(
							'notes',
							($event.target as HTMLTextAreaElement).value,
						)
					"
				></textarea>
			</label>
		</form>
	</section>
</template>
