<script setup lang="ts">
import type { Annotation } from "../annotation";
import { migrateEntityType } from "../annotation";
import type { SpanSpec, PropertyDef } from "../spec/types";
import {
	annotations,
	updateShapeData,
	updatePropertyData,
	markDirty,
} from "../state";
import { triggerRef } from "vue";

const props = defineProps<{
	annotation: Annotation;
	spec: SpanSpec;
}>();

const labelClass =
	"flex flex-col gap-1 text-[11px] font-medium text-text-dim uppercase tracking-wider";

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
}

function onShapeInput(fieldName: string, value: string) {
	updateShapeData({ [fieldName]: Number(value) || 0 });
}

function onPropertyInput(def: PropertyDef, value: string | boolean) {
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

function displayValue(def: PropertyDef, value: unknown): string {
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
					v-for="(_, name) in spec.entities"
					:key="name"
					:value="name"
				>
					{{ name }}
				</option>
			</select>
		</label>

		<!-- Shape fields -->
		<div class="flex flex-col gap-2">
			<span class="text-[10px] font-medium text-text-faint uppercase tracking-wider">
				Shape &mdash; {{ spec.entities[annotation.entityType].shape.type }}
			</span>
			<div class="grid grid-cols-2 gap-2">
				<label
					v-for="field in spec.entities[annotation.entityType].shape.fields"
					:key="field.name"
					:class="labelClass"
				>
					{{ field.name }}
					<input
						type="number"
						:value="annotation.shapeData[field.name]"
						@input="
							onShapeInput(
								field.name,
								($event.target as HTMLInputElement).value,
							)
						"
					/>
				</label>
			</div>
		</div>

		<!-- Property fields -->
		<div
			v-if="spec.entities[annotation.entityType].properties.length > 0"
			class="flex flex-col gap-2"
		>
			<span class="text-[10px] font-medium text-text-faint uppercase tracking-wider">
				Properties
			</span>
			<div class="grid grid-cols-2 gap-2">
				<template
					v-for="def in spec.entities[annotation.entityType].properties"
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
