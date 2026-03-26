<script setup lang="ts">
import { ref } from "vue";
import type { Annotation } from "../annotation";
import { migrateEntityType } from "../annotation";
import type { SpanSpec, PropertyField, ScalarPropertyField, EnumPropertyField, ColorPropertyField, ShapePropertyField } from "../spec/types";
import { getEntityByLabel } from "../spec/types";
import {
	annotations,
	updateShapeData,
	updatePropertyData,
	markDirty,
	currentSheetImageSrc,
} from "../state";
import ShapeCanvas from "./ShapeCanvas.vue";
import ColorPicker from "./ColorPicker.vue";
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

function onPropertyInput(def: PropertyField, value: string | boolean) {
	let converted: unknown = value;
	if (def.kind === "scalar") {
		switch (def.type) {
			case "integer":
			case "ainteger":
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
				converted = value;
				break;
		}
	} else if (def.kind === "enum" || def.kind === "color") {
		converted = value;
	}
	updatePropertyData({ [def.name]: converted });
}

function onShapePropertyInput(propName: string, index: number | null, field: string, value: string) {
	const numValue = Number(value) || 0;
	const current = props.annotation.properties[propName];

	if (index === null) {
		// Single shape
		const shape = (current as Record<string, number>) ?? {};
		const updated = { ...shape, [field]: numValue };
		updatePropertyData({ [propName]: updated });
	} else {
		// Array shape
		const arr = Array.isArray(current) ? [...current] : [];
		if (index < arr.length) {
			arr[index] = { ...arr[index], [field]: numValue };
			updatePropertyData({ [propName]: arr });
		}
	}
}

function addShapeArrayItem(propName: string, shapeType: "rect" | "point") {
	const current = props.annotation.properties[propName];
	const arr = Array.isArray(current) ? [...current] : [];
	const newItem = shapeType === "rect"
		? { x: 0, y: 0, w: 16, h: 16 }
		: { x: 0, y: 0 };
	arr.push(newItem);
	updatePropertyData({ [propName]: arr });
}

function removeShapeArrayItem(propName: string, index: number) {
	const current = props.annotation.properties[propName];
	if (!Array.isArray(current)) return;
	const arr = [...current];
	arr.splice(index, 1);
	updatePropertyData({ [propName]: arr });
}

function displayValue(def: ScalarPropertyField, value: unknown): string {
	if (def.type === "string[]" && Array.isArray(value)) {
		return value.join(", ");
	}
	return String(value ?? "");
}

function getPropertyShapeData(def: ShapePropertyField): { type: "rect" | "point"; items: Array<{ x: number; y: number; w?: number; h?: number }> } {
	const value = props.annotation.properties[def.name];
	if (def.array) {
		const arr = Array.isArray(value) ? value : [];
		return { type: def.shapeType, items: arr as any[] };
	}
	if (value && typeof value === "object") {
		return { type: def.shapeType, items: [value as any] };
	}
	return { type: def.shapeType, items: [] };
}

function onShapeCanvasUpdate(propName: string, index: number | null, patch: Record<string, number>) {
	const current = props.annotation.properties[propName];

	if (index === null) {
		// Single shape
		const shape = (current as Record<string, number>) ?? {};
		const updated = { ...shape, ...patch };
		updatePropertyData({ [propName]: updated });
	} else {
		// Array shape
		const arr = Array.isArray(current) ? [...current] : [];
		if (index < arr.length) {
			arr[index] = { ...arr[index], ...patch };
			updatePropertyData({ [propName]: arr });
		}
	}
}

function onChromaKeyInput(value: string) {
	const ann = props.annotation;
	ann.chromaKey = value;
	markDirty(true);
}

function getEntity() {
	return getEntityByLabel(props.spec, props.annotation.entityType);
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

		<!-- Primary shape section -->
		<template v-if="getEntity()">
			<div class="flex flex-col gap-2">
				<button
					type="button"
					class="flex items-center gap-2 text-[10px] font-medium text-text-faint uppercase tracking-wider cursor-pointer hover:text-text-dim transition-colors text-left"
					@click="toggleShapeSection('primary')"
				>
					<span
						class="inline-block w-2 h-2 rounded-full flex-shrink-0"
						:style="{ backgroundColor: SHAPE_COLORS[0] }"
					/>
					{{ getEntity()!.primaryShape.kind === 'rect' ? 'aabb' : 'point' }} ({{ getEntity()!.primaryShape.kind }})
					<span class="ml-auto text-text-faint">
						{{ collapsedShapes.has('primary') ? "▶" : "▼" }}
					</span>
				</button>

				<!-- Mini-canvas for shape editing -->
				<ShapeCanvas
					v-if="!collapsedShapes.has('primary') && currentSheetImageSrc"
					:annotation="annotation"
					:spec="spec"
					:shape-name="getEntity()!.primaryShape.kind === 'rect' ? 'aabb' : 'point'"
					:sheet-image-src="currentSheetImageSrc"
					:shape-color="SHAPE_COLORS[0]"
				/>

				<!-- Shape fields for rect -->
				<div
					v-if="!collapsedShapes.has('primary') && getEntity()!.primaryShape.kind === 'rect' && annotation.aabb"
					class="grid grid-cols-2 gap-2"
				>
					<label v-for="field in ['x', 'y', 'w', 'h']" :key="field" :class="labelClass">
						{{ field }}
						<input
							type="number"
							:value="(annotation.aabb as any)[field] ?? 0"
							@input="onShapeInput('aabb', field, ($event.target as HTMLInputElement).value)"
						/>
					</label>
				</div>

				<!-- Shape fields for point -->
				<div
					v-if="!collapsedShapes.has('primary') && getEntity()!.primaryShape.kind === 'point' && annotation.point"
					class="grid grid-cols-2 gap-2"
				>
					<label v-for="field in ['x', 'y']" :key="field" :class="labelClass">
						{{ field }}
						<input
							type="number"
							:value="(annotation.point as any)[field] ?? 0"
							@input="onShapeInput('point', field, ($event.target as HTMLInputElement).value)"
						/>
					</label>
				</div>
			</div>
		</template>

		<!-- Chroma Key (top-level) -->
		<label
			v-if="getEntity()?.hasChromaKey"
			:class="labelClass"
		>
			chroma_key
			<ColorPicker
				:model-value="annotation.chromaKey ?? ''"
				:image-source="currentSheetImageSrc"
				:aabb="annotation.aabb"
				@update:model-value="onChromaKeyInput($event)"
			/>
		</label>

		<!-- Properties section -->
		<div
			v-if="getEntity() && getEntity()!.properties.length > 0"
			class="flex flex-col gap-2"
		>
			<span class="text-[10px] font-medium text-text-faint uppercase tracking-wider">
				Properties
			</span>
			<div class="flex flex-col gap-2">
				<template
					v-for="def in getEntity()!.properties"
					:key="def.name"
				>
					<!-- Scalar: Boolean checkbox -->
					<label
						v-if="def.kind === 'scalar' && def.type === 'boolean'"
						:class="[labelClass, 'flex-row items-center']"
					>
						<input
							type="checkbox"
							:checked="!!annotation.properties[def.name]"
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
						v-else-if="def.kind === 'enum'"
						:class="labelClass"
					>
						{{ def.name }}
						<select
							:value="annotation.properties[def.name]"
							@change="
								onPropertyInput(
									def,
									($event.target as HTMLSelectElement).value,
								)
							"
						>
							<option
								v-for="opt in (def as any).values"
								:key="opt"
								:value="opt"
							>
								{{ opt }}
							</option>
						</select>
					</label>

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

					<!-- Scalar: Number input -->
					<label
						v-else-if="def.kind === 'scalar' && (def.type === 'integer' || def.type === 'number' || def.type === 'ainteger')"
						:class="labelClass"
					>
						{{ def.name }}
						<input
							type="number"
							:value="annotation.properties[def.name]"
							@input="
								onPropertyInput(
									def,
									($event.target as HTMLInputElement).value,
								)
							"
						/>
					</label>

					<!-- Scalar: String / string[] text input -->
					<label v-else-if="def.kind === 'scalar'" :class="labelClass">
						{{ def.name }}
						<input
							type="text"
							:value="
								displayValue(
									def as any,
									annotation.properties[def.name],
								)
							"
							:placeholder="
								(def as any).type === 'string[]'
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

					<!-- Shape property -->
					<template v-else-if="def.kind === 'shape'">
						<div class="flex flex-col gap-1">
							<span :class="labelClass">{{ def.name }} ({{ (def as ShapePropertyField).shapeType }}{{ (def as ShapePropertyField).array ? '[]' : '' }})</span>

							<!-- Mini-canvas preview showing shapes relative to aabb -->
							<ShapeCanvas
								v-if="currentSheetImageSrc && annotation.aabb"
								:annotation="annotation"
								:spec="spec"
								:shape-name="def.name"
								:sheet-image-src="currentSheetImageSrc"
								:shape-color="SHAPE_COLORS[1]"
								:property-shapes="getPropertyShapeData(def as ShapePropertyField)"
								@update:property-shape="onShapeCanvasUpdate"
							/>

							<!-- Single point -->
							<template v-if="!(def as ShapePropertyField).array && (def as ShapePropertyField).shapeType === 'point'">
								<div class="grid grid-cols-2 gap-2">
									<label v-for="field in ['x', 'y']" :key="field" :class="labelClass">
										{{ field }}
										<input
											type="number"
											:value="((annotation.properties[def.name] as any)?.[field]) ?? 0"
											@input="onShapePropertyInput(def.name, null, field, ($event.target as HTMLInputElement).value)"
										/>
									</label>
								</div>
							</template>

							<!-- Single rect -->
							<template v-if="!(def as ShapePropertyField).array && (def as ShapePropertyField).shapeType === 'rect'">
								<div class="grid grid-cols-2 gap-2">
									<label v-for="field in ['x', 'y', 'w', 'h']" :key="field" :class="labelClass">
										{{ field }}
										<input
											type="number"
											:value="((annotation.properties[def.name] as any)?.[field]) ?? 0"
											@input="onShapePropertyInput(def.name, null, field, ($event.target as HTMLInputElement).value)"
										/>
									</label>
								</div>
							</template>

							<!-- Array shapes -->
							<template v-if="(def as ShapePropertyField).array">
								<div
									v-for="(item, idx) in (annotation.properties[def.name] as any[] ?? [])"
									:key="idx"
									class="flex flex-col gap-1 pl-2 border-l-2 border-border"
								>
									<div class="flex items-center justify-between">
										<span class="text-[10px] text-text-faint">#{{ idx + 1 }}</span>
										<button
											type="button"
											class="text-[10px] text-danger hover:text-danger/80 cursor-pointer bg-transparent border-none p-0"
											@click="removeShapeArrayItem(def.name, idx)"
										>remove</button>
									</div>
									<div class="grid grid-cols-2 gap-2" v-if="(def as ShapePropertyField).shapeType === 'point'">
										<label v-for="field in ['x', 'y']" :key="field" :class="labelClass">
											{{ field }}
											<input
												type="number"
												:value="(item as any)?.[field] ?? 0"
												@input="onShapePropertyInput(def.name, idx, field, ($event.target as HTMLInputElement).value)"
											/>
										</label>
									</div>
									<div class="grid grid-cols-2 gap-2" v-else>
										<label v-for="field in ['x', 'y', 'w', 'h']" :key="field" :class="labelClass">
											{{ field }}
											<input
												type="number"
												:value="(item as any)?.[field] ?? 0"
												@input="onShapePropertyInput(def.name, idx, field, ($event.target as HTMLInputElement).value)"
											/>
										</label>
									</div>
								</div>
								<button
									type="button"
									class="text-[11px] text-text-dim hover:text-copper cursor-pointer bg-transparent border border-border rounded px-2 py-1 self-start"
									@click="addShapeArrayItem(def.name, (def as ShapePropertyField).shapeType)"
								>+ Add {{ (def as ShapePropertyField).shapeType }}</button>
							</template>
						</div>
					</template>
				</template>
			</div>
		</div>

		</form>
</template>
