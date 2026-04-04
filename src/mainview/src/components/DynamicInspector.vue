<script setup lang="ts">
import { ref, triggerRef } from "vue";
import type { Annotation } from "../annotation";
import { migrateEntityType } from "../annotation";
import type { SpanSpec, PropertyField, ScalarPropertyField, EnumPropertyField, ColorPropertyField, ShapePropertyField } from "../spec/types";
import { getEntityByLabel } from "../spec/types";
import {
	annotations,
	sheets,
	updateShapeData,
	updatePropertyData,
	markDirty,
	currentSheetImageSrc,
} from "../state";
import ShapeCanvas from "./ShapeCanvas.vue";
import ColorPicker from "./ColorPicker.vue";

const props = defineProps<{
	annotation: Annotation;
	spec: SpanSpec;
}>();

const SHAPE_COLORS = ["var(--color-copper)", "#5a8ac8", "#5ac878", "#8a5ac8"];

const labelClass =
	"flex flex-col gap-1 text-[11px] font-medium text-text-dim uppercase tracking-wider";

// Track which sections are collapsed (by key: 'primary', 'chroma', 'properties', 'prop:<name>')
const collapsed = ref<Set<string>>(new Set());

function toggleSection(key: string) {
	if (collapsed.value.has(key)) {
		collapsed.value.delete(key);
	} else {
		collapsed.value.add(key);
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
	collapsed.value = new Set();
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

function clearChromaKey() {
	onChromaKeyInput("");
}

function getEntity() {
	return getEntityByLabel(props.spec, props.annotation.entityType);
}

function deepClone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}

function spriteIdentity(annotation: Annotation): { entityType: string; name: string; variant: string } | null {
	const name = typeof annotation.properties.name === "string" ? annotation.properties.name.trim() : "";
	if (!name) return null;
	const variant = typeof annotation.properties.variant === "string"
		? annotation.properties.variant.trim()
		: "";
	return {
		entityType: annotation.entityType,
		name,
		variant,
	};
}

function canSyncProperty(propName: string): boolean {
	return !["name", "variant", "frame"].includes(propName) && spriteIdentity(props.annotation) !== null;
}

function matchingSpriteAnnotations(): Annotation[] {
	const identity = spriteIdentity(props.annotation);
	if (!identity) return [];

	return sheets.value.flatMap((sheet) =>
		sheet.annotations.filter((annotation) => {
			const candidate = spriteIdentity(annotation);
			return (
				candidate !== null &&
				candidate.entityType === identity.entityType &&
				candidate.name === identity.name &&
				candidate.variant === identity.variant
			);
		})
	);
}

function syncCountForProperty(propName: string): number {
	if (!canSyncProperty(propName)) return 0;
	return Math.max(0, matchingSpriteAnnotations().length - 1);
}

function syncPropertyAcrossSprite(propName: string) {
	if (!canSyncProperty(propName)) return;
	const value = deepClone(props.annotation.properties[propName]);
	const targets = matchingSpriteAnnotations().filter((annotation) => annotation.id !== props.annotation.id);
	if (targets.length === 0) return;

	for (const target of targets) {
		target.properties[propName] = deepClone(value);
	}

	triggerRef(sheets);
	markDirty(true);
}
</script>

<template>
	<form
		class="instant-scroll flex-1 overflow-y-auto min-h-0 flex flex-col gap-3 px-2 pb-2 pt-2"
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
					@click="toggleSection('primary')"
				>
					<span
						class="inline-block w-2 h-2 rounded-full flex-shrink-0"
						:style="{ backgroundColor: SHAPE_COLORS[0] }"
					/>
					{{ getEntity()!.primaryShape.kind === 'rect' ? 'aabb' : 'point' }} ({{ getEntity()!.primaryShape.kind }})
					<span class="ml-auto text-text-faint">
						{{ collapsed.has('primary') ? "▶" : "▼" }}
					</span>
				</button>

				<!-- Mini-canvas for shape editing -->
				<ShapeCanvas
					v-if="!collapsed.has('primary') && currentSheetImageSrc"
					:annotation="annotation"
					:spec="spec"
					:shape-name="getEntity()!.primaryShape.kind === 'rect' ? 'aabb' : 'point'"
					:sheet-image-src="currentSheetImageSrc"
					:shape-color="SHAPE_COLORS[0]"
				/>

				<!-- Shape fields for rect -->
				<div
					v-if="!collapsed.has('primary') && getEntity()!.primaryShape.kind === 'rect' && annotation.aabb"
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
					v-if="!collapsed.has('primary') && getEntity()!.primaryShape.kind === 'point' && annotation.point"
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
		<div v-if="getEntity()?.hasChromaKey" class="flex flex-col gap-2">
			<button
				type="button"
				class="section-toggle"
				@click="toggleSection('chroma')"
			>
				chroma_key
				<span class="ml-auto text-text-faint">
					{{ collapsed.has('chroma') ? "▶" : "▼" }}
				</span>
			</button>
			<div
				v-if="!collapsed.has('chroma')"
				class="flex flex-col gap-2"
			>
				<div class="flex items-center justify-between text-[11px] text-text-faint font-mono">
					<span>{{ annotation.chromaKey ? annotation.chromaKey : "none" }}</span>
					<button
						type="button"
						class="text-text-faint hover:text-copper transition-colors cursor-pointer bg-transparent border border-border rounded px-2 py-1"
						:disabled="!annotation.chromaKey"
						@click="clearChromaKey"
					>
						Unset
					</button>
				</div>
				<label :class="labelClass">
					<ColorPicker
						:model-value="annotation.chromaKey ?? ''"
						:image-source="currentSheetImageSrc"
						:aabb="annotation.aabb"
						@update:model-value="onChromaKeyInput($event)"
					/>
				</label>
			</div>
		</div>

		<!-- Properties section -->
		<div
			v-if="getEntity() && getEntity()!.properties.length > 0"
			class="flex flex-col gap-2"
		>
			<button
				type="button"
				class="section-toggle"
				@click="toggleSection('properties')"
			>
				Properties
				<span class="ml-auto text-text-faint">
					{{ collapsed.has('properties') ? "▶" : "▼" }}
				</span>
			</button>
			<div v-if="!collapsed.has('properties')" class="flex flex-col gap-2">
				<template
					v-for="def in getEntity()!.properties"
					:key="def.name"
				>
					<!-- Property header (collapsible) -->
					<div class="flex flex-col gap-1">
						<div class="prop-header">
							<button
								type="button"
								class="prop-toggle"
								@click="toggleSection('prop:' + def.name)"
							>
								<span>{{ def.name }}</span>
								<span class="prop-type">{{ def.kind === 'scalar' ? (def as ScalarPropertyField).type : def.kind === 'enum' ? 'enum' : def.kind === 'color' ? 'color' : (def as ShapePropertyField).shapeType + ((def as ShapePropertyField).array ? '[]' : '') }}</span>
								<span class="ml-auto text-text-faint">
									{{ collapsed.has('prop:' + def.name) ? "▶" : "▼" }}
								</span>
							</button>
							<button
								v-if="canSyncProperty(def.name)"
								type="button"
								class="prop-sync"
								:title="syncCountForProperty(def.name) > 0 ? `Copy this field to ${syncCountForProperty(def.name)} matching frame${syncCountForProperty(def.name) === 1 ? '' : 's'}` : 'No other matching frames to sync'"
								:disabled="syncCountForProperty(def.name) === 0"
								@click="syncPropertyAcrossSprite(def.name)"
							>
								Sync
							</button>
						</div>

						<template v-if="!collapsed.has('prop:' + def.name)">
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
							</label>

							<!-- Enum select -->
							<label
								v-else-if="def.kind === 'enum'"
								:class="labelClass"
							>
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
								<div class="flex flex-col gap-1.5">
									<!-- Mini-canvas preview -->
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
										<div class="grid grid-cols-2 gap-1.5">
											<label v-for="field in ['x', 'y']" :key="field" class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint">
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
										<div class="grid grid-cols-2 gap-1.5">
											<label v-for="field in ['x', 'y', 'w', 'h']" :key="field" class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint">
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
												<span class="text-[10px] font-mono text-text-faint">#{{ idx + 1 }}</span>
												<button
													type="button"
													class="text-[10px] text-text-faint hover:text-danger transition-colors cursor-pointer bg-transparent border-none p-0"
													@click="removeShapeArrayItem(def.name, idx)"
												>remove</button>
											</div>
											<div class="grid grid-cols-2 gap-1.5" v-if="(def as ShapePropertyField).shapeType === 'point'">
												<label v-for="field in ['x', 'y']" :key="field" class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint">
													{{ field }}
													<input
														type="number"
														:value="(item as any)?.[field] ?? 0"
														@input="onShapePropertyInput(def.name, idx, field, ($event.target as HTMLInputElement).value)"
													/>
												</label>
											</div>
											<div class="grid grid-cols-2 gap-1.5" v-else>
												<label v-for="field in ['x', 'y', 'w', 'h']" :key="field" class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint">
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
											class="text-[11px] text-text-dim hover:text-copper transition-colors cursor-pointer bg-transparent border border-border rounded px-2 py-1 self-start"
											@click="addShapeArrayItem(def.name, (def as ShapePropertyField).shapeType)"
										>Add {{ (def as ShapePropertyField).shapeType }}</button>
									</template>
								</div>
							</template>
						</template>
					</div>
				</template>
			</div>
		</div>

		</form>
</template>

<style scoped>
.section-toggle {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 10px;
	font-weight: 500;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: var(--color-text-faint);
	cursor: pointer;
	background: transparent;
	border: none;
	padding: 0;
	text-align: left;
	transition: color 0.15s;
}

.section-toggle:hover {
	color: var(--color-text-dim);
}

.prop-toggle {
	display: flex;
	align-items: center;
	gap: 0.375rem;
	font-size: 11px;
	font-weight: 500;
	color: var(--color-text-dim);
	cursor: pointer;
	background: transparent;
	border: none;
	padding: 2px 0;
	text-align: left;
	transition: color 0.15s;
	flex: 1 1 auto;
	min-width: 0;
}

.prop-toggle:hover {
	color: var(--color-text);
}

.prop-header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
}

.prop-type {
	font-size: 10px;
	font-weight: 400;
	color: var(--color-text-faint);
}

.prop-sync {
	flex: 0 0 auto;
	font-size: 10px;
	font-weight: 500;
	color: var(--color-text-faint);
	background: transparent;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	padding: 2px 6px;
	cursor: pointer;
	transition: color 0.15s, border-color 0.15s;
}

.prop-sync:hover:not(:disabled) {
	color: var(--color-copper);
	border-color: var(--color-copper);
}

.prop-sync:disabled {
	opacity: 0.4;
	cursor: default;
}
</style>
