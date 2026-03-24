<script setup lang="ts">
import { ref } from "vue";
import type { Annotation } from "../annotation";
import { migrateEntityType } from "../annotation";
import type { SpanSpec, ScalarSpecField } from "../spec/types";
import {
	getEntityByLabel,
	getShapesForEntity,
	getScalarsForEntity,
} from "../spec/types";
import {
	annotations,
	updateShapeData,
	updatePropertyData,
	markDirty,
	getPreviewShapeName,
	setPreviewShape,
	currentSheetImageSrc,
} from "../state";
import ShapeCanvas from "./ShapeCanvas.vue";
import { triggerRef } from "vue";

const props = defineProps<{
	annotation: Annotation;
	spec: SpanSpec;
}>();

const SHAPE_COLORS = ["var(--color-copper)", "#5a8ac8", "#5ac878", "#8a5ac8"];

const labelClass =
	"flex flex-col gap-1 text-[11px] font-medium text-text-dim uppercase tracking-wider";

// Track which shape sections are collapsed (by shape name)
const collapsedShapes = ref<Set<string>>(new Set());

function toggleShapeSection(shapeName: string) {
	if (collapsedShapes.value.has(shapeName)) {
		collapsedShapes.value.delete(shapeName);
	} else {
		collapsedShapes.value.add(shapeName);
	}
}

function onEntityTypeChange(newType: string) {
	const migrated = migrateEntityType(props.annotation, props.spec, newType);
	const idx = annotations.value.findIndex(
		(a) => a.id === props.annotation.id,
	);
	if (idx !== -1) {
		annotations.value[idx] = migrated;
		triggerRef(annotations);
		markDirty(true);
	}
	// Reset collapsed state for new entity
	collapsedShapes.value = new Set();
}

function onShapeInput(shapeName: string, fieldName: string, value: string) {
	updateShapeData(shapeName, { [fieldName]: Number(value) || 0 });
}

function onPropertyInput(def: ScalarSpecField, value: string | boolean) {
	let converted: unknown = value;
	switch (def.type) {
		case "integer":
			converted = Math.round(Number(value) || 0);
			break;
		case "number":
			converted = Number(value) || 0;
			break;
		case "boolean":
			converted = value;
			break;
		case "string[]":
			converted = (value as string)
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			break;
		case "string":
		case "enum":
			converted = value;
			break;
	}
	updatePropertyData({ [def.name]: converted });
}

function displayValue(def: ScalarSpecField, value: unknown): string {
	if (def.type === "string[]" && Array.isArray(value)) {
		return value.join(", ");
	}
	return String(value ?? "");
}
</script>

<template>
	<form
		class="flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 px-2 pb-2 pt-2"
		@submit.prevent
	>
		<!-- Entity type dropdown -->
		<label :class="labelClass">
			Entity Type
			<select
				:value="annotation.entityType"
				@change="
					onEntityTypeChange(
						($event.target as HTMLSelectElement).value,
					)
				"
			>
				<option
					v-for="entity in spec.entities"
					:key="entity.label"
					:value="entity.label"
				>
					{{ entity.label }}
				</option>
			</select>
		</label>

		<!-- Shape sections — one collapsible section per named shape -->
		<template
			v-if="getEntityByLabel(spec, annotation.entityType)"
			v-for="(shape, shapeIndex) in getShapesForEntity(getEntityByLabel(spec, annotation.entityType)!)"
			:key="shape.name"
		>
			<div class="flex flex-col gap-2">
				<!-- Shape section header -->
				<button
					type="button"
					class="flex items-center gap-2 text-[10px] font-medium text-text-faint uppercase tracking-wider cursor-pointer hover:text-text-dim transition-colors text-left"
					@click="toggleShapeSection(shape.name)"
				>
					<!-- Colored dot -->
					<span
						class="inline-block w-2 h-2 rounded-full flex-shrink-0"
						:style="{ backgroundColor: SHAPE_COLORS[shapeIndex] ?? SHAPE_COLORS[SHAPE_COLORS.length - 1] }"
					/>
					{{ shape.name }} ({{ shape.shapeType }})
					<span v-if="shape.reference" class="normal-case tracking-normal text-text-faint">
						relative to {{ shape.reference }}
					</span>
					<span
						v-if="shape.shapeType === 'rect'"
						class="normal-case tracking-normal cursor-pointer transition-colors"
						:class="getPreviewShapeName(annotation.entityType) === shape.name ? 'text-copper-bright' : 'text-text-faint hover:text-text-dim'"
						title="Use this shape for gallery preview"
						@click.stop="setPreviewShape(annotation.entityType, shape.name)"
					>⊞</span>
					<span class="ml-auto text-text-faint">
						{{ collapsedShapes.has(shape.name) ? "▶" : "▼" }}
					</span>
				</button>

				<!-- Mini-canvas for shape editing -->
				<ShapeCanvas
					v-if="!collapsedShapes.has(shape.name) && currentSheetImageSrc"
					:annotation="annotation"
					:spec="spec"
					:shape-name="shape.name"
					:sheet-image-src="currentSheetImageSrc"
					:shape-color="SHAPE_COLORS[shapeIndex] ?? SHAPE_COLORS[SHAPE_COLORS.length - 1]"
				/>

				<!-- Shape fields -->
				<div
					v-if="!collapsedShapes.has(shape.name)"
					class="grid grid-cols-2 gap-2"
				>
					<label
						v-for="field in shape.shapeFields"
						:key="field.name"
						:class="labelClass"
					>
						{{ field.name }}
						<input
							type="number"
							:value="annotation.shapes[shape.name]?.[field.name] ?? 0"
							@input="
								onShapeInput(
									shape.name,
									field.name,
									($event.target as HTMLInputElement).value,
								)
							"
						/>
					</label>
				</div>
			</div>
		</template>

		<!-- Properties section (scalar fields) -->
		<div
			v-if="getEntityByLabel(spec, annotation.entityType) && getScalarsForEntity(getEntityByLabel(spec, annotation.entityType)!).length > 0"
			class="flex flex-col gap-2"
		>
			<span class="text-[10px] font-medium text-text-faint uppercase tracking-wider">
				Properties
			</span>
			<div class="flex flex-col gap-2">
				<template
					v-for="def in getScalarsForEntity(getEntityByLabel(spec, annotation.entityType)!)"
					:key="def.name"
				>
					<!-- Boolean checkbox -->
					<label
						v-if="def.type === 'boolean'"
						:class="[labelClass, 'flex-row items-center']"
					>
						<input
							type="checkbox"
							:checked="!!annotation.propertyData[def.name]"
							@change="
								onPropertyInput(
									def,
									($event.target as HTMLInputElement).checked,
								)
							"
						/>
						{{ def.name }}
					</label>

					<!-- Enum select -->
					<label
						v-else-if="def.type === 'enum'"
						:class="labelClass"
					>
						{{ def.name }}
						<select
							:value="annotation.propertyData[def.name]"
							@change="
								onPropertyInput(
									def,
									($event.target as HTMLSelectElement).value,
								)
							"
						>
							<option
								v-for="opt in def.enumValues"
								:key="opt"
								:value="opt"
							>
								{{ opt }}
							</option>
						</select>
					</label>

					<!-- Color picker (ColorHEX) -->
					<label
						v-else-if="def.type === 'ColorHEX'"
						:class="labelClass"
					>
						{{ def.name }}
						<div class="flex items-center gap-1.5">
							<span
								class="w-7 h-7 shrink-0 rounded-sm border border-border cursor-pointer relative overflow-hidden"
								:style="{ backgroundColor: annotation.propertyData[def.name] || '#000000' }"
							>
								<input
									type="color"
									:value="annotation.propertyData[def.name] || '#000000'"
									class="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
									@input="onPropertyInput(def, ($event.target as HTMLInputElement).value)"
								/>
							</span>
							<input
								type="text"
								:value="annotation.propertyData[def.name] ?? ''"
								placeholder="#000000"
								class="flex-1 min-w-0"
								@input="onPropertyInput(def, ($event.target as HTMLInputElement).value)"
							/>
						</div>
					</label>

					<!-- Number input -->
					<label
						v-else-if="
							def.type === 'integer' || def.type === 'number'
						"
						:class="labelClass"
					>
						{{ def.name }}
						<input
							type="number"
							:value="annotation.propertyData[def.name]"
							@input="
								onPropertyInput(
									def,
									($event.target as HTMLInputElement).value,
								)
							"
						/>
					</label>

					<!-- String / string[] text input -->
					<label v-else :class="labelClass">
						{{ def.name }}
						<input
							type="text"
							:value="
								displayValue(
									def,
									annotation.propertyData[def.name],
								)
							"
							:placeholder="
								def.type === 'string[]'
									? 'comma-separated values'
									: ''
							"
							@input="
								onPropertyInput(
									def,
									($event.target as HTMLInputElement).value,
								)
							"
						/>
					</label>
				</template>
			</div>
		</div>

		</form>
</template>
