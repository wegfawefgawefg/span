<script setup lang="ts">
import { computed, ref, triggerRef } from 'vue';
import type { Annotation } from '../annotation';
import { migrateEntityType } from '../annotation';
import type {
  SpanSpec,
  PropertyField,
  ScalarPropertyField,
  ShapePropertyField,
} from '../spec/types';
import { getEntityByLabel, getRequiredFields } from '../spec/types';
import {
  annotations,
  sheets,
  recordPaintUndoSnapshot,
  updateShapeData,
  updatePropertyData,
  markDirty,
  currentSheetImageSrc,
} from '../state';
import ShapeCanvas from './ShapeCanvas.vue';
import ColorPicker from './ColorPicker.vue';
import {
  controlDisclosureButtonClass,
  controlPropertyToggleButtonClass,
  controlSubtleButtonClass,
  controlTextDangerButtonClass,
} from '../controlStyles';

const props = defineProps<{
  annotation: Annotation;
  annotations: Annotation[];
  spec: SpanSpec;
}>();

const SHAPE_COLORS = ['var(--color-copper)', '#5a8ac8', '#5ac878', '#8a5ac8'];
const MIXED_TEXT = 'mixed';
const MIXED_SELECT_VALUE = '__span_mixed__';

const labelClass =
  'flex flex-col gap-1 text-[11px] font-medium text-text-dim uppercase tracking-wider';
const sectionToggleClass = controlDisclosureButtonClass;
const propHeaderClass = 'flex items-center gap-2';
const propToggleClass = controlPropertyToggleButtonClass;
const propTypeClass = 'text-[10px] font-normal text-text-faint';
const propSyncClass = `${controlSubtleButtonClass} shrink-0 px-1.5 py-0.5 text-[10px]`;
const selectionMetaClass = 'text-[10px] font-mono text-text-faint';

const inspectedAnnotations = computed(() =>
  props.annotations.length > 0 ? props.annotations : [props.annotation]
);
const isMultiSelection = computed(() => inspectedAnnotations.value.length > 1);

const collapsed = ref<Set<string>>(new Set());

function toggleSection(key: string) {
  if (collapsed.value.has(key)) {
    collapsed.value.delete(key);
  } else {
    collapsed.value.add(key);
  }
}

function recordUndoForAnnotationIds(annotationIds: string[]) {
  const remaining = new Set(annotationIds);
  if (remaining.size === 0) return;

  for (const sheet of sheets.value) {
    const touchesSheet = sheet.annotations.some((annotation) =>
      remaining.has(annotation.id)
    );
    if (touchesSheet) {
      recordPaintUndoSnapshot(sheet);
    }
  }
}

function valuesMatch(left: unknown, right: unknown) {
  if (Object.is(left, right)) return true;
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object'
  ) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function getCommonValue(values: unknown[]) {
  if (values.length === 0) {
    return { mixed: false, value: null as unknown };
  }
  const first = values[0];
  const mixed = values.some((value) => !valuesMatch(value, first));
  return { mixed, value: first };
}

const entityTypeState = computed(() =>
  getCommonValue(inspectedAnnotations.value.map((annotation) => annotation.entityType))
);
const hasMixedEntityTypes = computed(() => entityTypeState.value.mixed);
const selectionSummary = computed(
  () => `${inspectedAnnotations.value.length} selected`
);

function onEntityTypeChange(newType: string) {
  const targets = inspectedAnnotations.value.filter(
    (annotation) => annotation.entityType !== newType
  );
  if (targets.length === 0) return;

  recordUndoForAnnotationIds(targets.map((annotation) => annotation.id));
  for (const target of targets) {
    const migrated = migrateEntityType(target, props.spec, newType);
    const idx = annotations.value.findIndex((annotation) => annotation.id === target.id);
    if (idx !== -1) {
      annotations.value[idx] = migrated;
    }
  }
  triggerRef(annotations);
  markDirty(true);
  collapsed.value = new Set();
}

function onShapeInput(shapeName: string, fieldName: string, value: string) {
  updateShapeData(shapeName, { [fieldName]: Number(value) || 0 });
}

function onPropertyInput(def: PropertyField, value: string | boolean) {
  let converted: unknown = value;
  if (def.kind === 'scalar') {
    switch (def.type) {
      case 'integer':
      case 'ainteger':
        converted = Math.round(Number(value) || 0);
        break;
      case 'number':
        converted = Number(value) || 0;
        break;
      case 'boolean':
        converted = value;
        break;
      case 'string[]':
        converted = (value as string)
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean);
        break;
      case 'string':
        converted = value;
        break;
    }
  } else if (def.kind === 'enum' || def.kind === 'color') {
    converted = value;
  }
  updatePropertyData({ [def.name]: converted });
}

function onShapePropertyInput(
  propName: string,
  index: number | null,
  field: string,
  value: string
) {
  const numValue = Number(value) || 0;
  const targets = inspectedAnnotations.value.filter((annotation) => {
    const current = annotation.properties[propName];
    if (index === null) {
      const shape = (current as Record<string, number>) ?? {};
      return shape[field] !== numValue;
    }
    const arr = Array.isArray(current) ? current : [];
    if (index >= arr.length) return false;
    return ((arr[index] as Record<string, number>)?.[field] ?? 0) !== numValue;
  });
  if (targets.length === 0) return;

  recordUndoForAnnotationIds(targets.map((annotation) => annotation.id));
  for (const target of targets) {
    const current = target.properties[propName];
    if (index === null) {
      const shape = (current as Record<string, number>) ?? {};
      target.properties[propName] = { ...shape, [field]: numValue };
      continue;
    }
    const arr = Array.isArray(current) ? [...current] : [];
    if (index >= arr.length) continue;
    arr[index] = { ...arr[index], [field]: numValue };
    target.properties[propName] = arr;
  }
  markDirty(true);
}

function addShapeArrayItem(propName: string, shapeType: 'rect' | 'point') {
  const current = props.annotation.properties[propName];
  const arr = Array.isArray(current) ? [...current] : [];
  const newItem =
    shapeType === 'rect' ? { x: 0, y: 0, w: 16, h: 16 } : { x: 0, y: 0 };
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
  if (def.type === 'string[]' && Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value ?? '');
}

function propertyState(propName: string) {
  return getCommonValue(
    inspectedAnnotations.value.map((annotation) => annotation.properties[propName])
  );
}

function propertyInputValue(def: ScalarPropertyField) {
  const state = propertyState(def.name);
  return state.mixed ? '' : displayValue(def, state.value);
}

function propertyPlaceholder(def: ScalarPropertyField) {
  if (propertyState(def.name).mixed) return MIXED_TEXT;
  return def.type === 'string[]' ? 'comma-separated values' : '';
}

function propertyBooleanValue(propName: string) {
  const state = propertyState(propName);
  return state.mixed ? false : !!state.value;
}

function propertySelectValue(propName: string) {
  const state = propertyState(propName);
  return state.mixed ? MIXED_SELECT_VALUE : String(state.value ?? '');
}

function primaryShapeFieldState(shapeName: 'aabb' | 'point', field: string) {
  return getCommonValue(
    inspectedAnnotations.value
      .map((annotation) => (shapeName === 'aabb' ? annotation.aabb : annotation.point))
      .filter(Boolean)
      .map((shape) => (shape as Record<string, number>)[field] ?? 0)
  );
}

function primaryShapeFieldValue(shapeName: 'aabb' | 'point', field: string) {
  const state = primaryShapeFieldState(shapeName, field);
  return state.mixed ? '' : String(state.value ?? 0);
}

function propertyShapeFieldState(
  propName: string,
  index: number | null,
  field: string
) {
  const values = inspectedAnnotations.value.map((annotation) => {
    const current = annotation.properties[propName];
    if (index === null) {
      return ((current as Record<string, number>) ?? {})[field] ?? 0;
    }
    const arr = Array.isArray(current) ? current : [];
    return ((arr[index] as Record<string, number>) ?? {})[field] ?? 0;
  });
  return getCommonValue(values);
}

function propertyShapeFieldValue(
  propName: string,
  index: number | null,
  field: string
) {
  const state = propertyShapeFieldState(propName, index, field);
  return state.mixed ? '' : String(state.value ?? 0);
}

function getPropertyShapeData(def: ShapePropertyField): {
  type: 'rect' | 'point';
  array: boolean;
  items: Array<{ x: number; y: number; w?: number; h?: number }>;
} {
  const value = props.annotation.properties[def.name];
  if (def.array) {
    const arr = Array.isArray(value) ? value : [];
    return { type: def.shapeType, array: true, items: arr as any[] };
  }
  if (value && typeof value === 'object') {
    return { type: def.shapeType, array: false, items: [value as any] };
  }
  return { type: def.shapeType, array: false, items: [] };
}

function onShapeCanvasUpdate(
  propName: string,
  index: number | null,
  patch: Record<string, number>,
  captureHistory: boolean = true
) {
  const current = props.annotation.properties[propName];

  if (index === null) {
    const shape = (current as Record<string, number>) ?? {};
    const updated = { ...shape, ...patch };
    updatePropertyData({ [propName]: updated }, { captureHistory });
  } else {
    const arr = Array.isArray(current) ? [...current] : [];
    if (index < arr.length) {
      arr[index] = { ...arr[index], ...patch };
      updatePropertyData({ [propName]: arr }, { captureHistory });
    }
  }
}

function getEntity() {
  if (hasMixedEntityTypes.value) return null;
  return getEntityByLabel(props.spec, String(entityTypeState.value.value ?? ''));
}

function getRequiredDefs(): PropertyField[] {
  const entity = getEntity();
  return entity ? getRequiredFields(entity) : [];
}

function spriteIdentity(
  annotation: Annotation
): { entityType: string; name: string; variant: string } | null {
  const name =
    typeof annotation.properties.name === 'string'
      ? annotation.properties.name.trim()
      : '';
  if (!name) return null;
  const variant =
    typeof annotation.properties.variant === 'string'
      ? annotation.properties.variant.trim()
      : '';
  return {
    entityType: annotation.entityType,
    name,
    variant,
  };
}

function canSyncProperty(propName: string) {
  return (
    !isMultiSelection.value &&
    !['name', 'variant', 'frame'].includes(propName) &&
    spriteIdentity(props.annotation) !== null
  );
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
  const targets = matchingSpriteAnnotations().filter(
    (annotation) => annotation.id !== props.annotation.id
  );
  if (targets.length === 0) return;

  recordUndoForAnnotationIds(targets.map((annotation) => annotation.id));
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
    <div v-if="isMultiSelection" :class="selectionMetaClass">
      {{ selectionSummary }}
    </div>

    <!-- Entity type dropdown -->
    <label :class="labelClass">
      Entity Type
      <select
        :value="
          entityTypeState.mixed
            ? MIXED_SELECT_VALUE
            : String(entityTypeState.value ?? '')
        "
        @change="onEntityTypeChange(($event.target as HTMLSelectElement).value)"
      >
        <option
          v-if="entityTypeState.mixed"
          :value="MIXED_SELECT_VALUE"
          disabled
        >
          {{ MIXED_TEXT }}
        </option>
        <option
          v-for="entity in spec.entities"
          :key="entity.label"
          :value="entity.label"
        >
          {{ entity.label }}
        </option>
      </select>
    </label>

    <div
      v-if="hasMixedEntityTypes"
      class="rounded-sm border border-border bg-surface-0 px-2 py-1 text-xs text-text-faint"
    >
      Mixed entity types. Choose one to apply it to all selected annotations.
    </div>

    <!-- Primary shape section -->
    <template v-else-if="getEntity()">
      <div class="flex flex-col gap-2">
        <button
          type="button"
          :class="sectionToggleClass"
          @click="toggleSection('primary')"
        >
          <span
            class="inline-block w-2 h-2 rounded-full flex-shrink-0"
            :style="{ backgroundColor: SHAPE_COLORS[0] }"
          />
          {{ getEntity()!.primaryShape.kind === 'rect' ? 'aabb' : 'point' }} ({{
            getEntity()!.primaryShape.kind
          }})
          <span class="ml-auto text-text-faint">
            {{ collapsed.has('primary') ? '▶' : '▼' }}
          </span>
        </button>

        <!-- Mini-canvas for shape editing -->
        <ShapeCanvas
          v-if="
            !isMultiSelection &&
            !collapsed.has('primary') &&
            currentSheetImageSrc
          "
          :annotation="annotation"
          :spec="spec"
          :shape-name="
            getEntity()!.primaryShape.kind === 'rect' ? 'aabb' : 'point'
          "
          :sheet-image-src="currentSheetImageSrc"
          :shape-color="SHAPE_COLORS[0]"
        />

        <!-- Shape fields for rect -->
        <div
          v-if="
            !collapsed.has('primary') &&
            getEntity()!.primaryShape.kind === 'rect' &&
            annotation.aabb
          "
          class="grid grid-cols-2 gap-2"
        >
          <label
            v-for="field in ['x', 'y', 'w', 'h']"
            :key="field"
            :class="labelClass"
          >
            {{ field }}
            <input
              type="number"
              :value="primaryShapeFieldValue('aabb', field)"
              :placeholder="
                primaryShapeFieldState('aabb', field).mixed ? MIXED_TEXT : ''
              "
              @input="
                onShapeInput(
                  'aabb',
                  field,
                  ($event.target as HTMLInputElement).value
                )
              "
            />
          </label>
        </div>

        <!-- Shape fields for point -->
        <div
          v-if="
            !collapsed.has('primary') &&
            getEntity()!.primaryShape.kind === 'point' &&
            annotation.point
          "
          class="grid grid-cols-2 gap-2"
        >
          <label v-for="field in ['x', 'y']" :key="field" :class="labelClass">
            {{ field }}
            <input
              type="number"
              :value="primaryShapeFieldValue('point', field)"
              :placeholder="
                primaryShapeFieldState('point', field).mixed ? MIXED_TEXT : ''
              "
              @input="
                onShapeInput(
                  'point',
                  field,
                  ($event.target as HTMLInputElement).value
                )
              "
            />
          </label>
        </div>
      </div>
    </template>

    <!-- Required section -->
    <div v-if="getRequiredDefs().length > 0" class="flex flex-col gap-2">
      <button
        type="button"
        :class="sectionToggleClass"
        @click="toggleSection('required')"
      >
        Required
        <span class="ml-auto text-text-faint">
          {{ collapsed.has('required') ? '▶' : '▼' }}
        </span>
      </button>
      <div v-if="!collapsed.has('required')" class="flex flex-col gap-2">
        <template
          v-for="def in getRequiredDefs()"
          :key="`required:${def.name}`"
        >
          <div class="flex flex-col gap-1">
            <div :class="propHeaderClass">
              <button
                type="button"
                :class="propToggleClass"
                @click="toggleSection('required:' + def.name)"
              >
                <span>{{ def.name }}</span>
                <span :class="propTypeClass">{{
                  def.kind === 'scalar'
                    ? (def as ScalarPropertyField).type
                    : (def as ShapePropertyField).shapeType
                }}</span>
                <span class="ml-auto text-text-faint">
                  {{ collapsed.has('required:' + def.name) ? '▶' : '▼' }}
                </span>
              </button>
            </div>

            <template v-if="!collapsed.has('required:' + def.name)">
              <label
                v-if="
                  def.kind === 'scalar' &&
                  (def.type === 'integer' ||
                    def.type === 'number' ||
                    def.type === 'ainteger')
                "
                :class="labelClass"
              >
                <input
                  type="number"
                  :value="propertyInputValue(def as ScalarPropertyField)"
                  :placeholder="
                    propertyState(def.name).mixed ? MIXED_TEXT : ''
                  "
                  @input="
                    onPropertyInput(
                      def,
                      ($event.target as HTMLInputElement).value
                    )
                  "
                />
              </label>

              <label v-else-if="def.kind === 'scalar'" :class="labelClass">
                <input
                  type="text"
                  :value="propertyInputValue(def as ScalarPropertyField)"
                  :placeholder="
                    propertyPlaceholder(def as ScalarPropertyField)
                  "
                  @input="
                    onPropertyInput(
                      def,
                      ($event.target as HTMLInputElement).value
                    )
                  "
                />
              </label>

              <template v-else-if="def.kind === 'shape'">
                <div class="flex flex-col gap-1.5">
                  <ShapeCanvas
                    v-if="
                      !isMultiSelection &&
                      currentSheetImageSrc &&
                      annotation.aabb
                    "
                    :annotation="annotation"
                    :spec="spec"
                    :shape-name="def.name"
                    :sheet-image-src="currentSheetImageSrc"
                    :shape-color="SHAPE_COLORS[1]"
                    :property-shapes="
                      getPropertyShapeData(def as ShapePropertyField)
                    "
                    @update:property-shape="onShapeCanvasUpdate"
                  />
                  <div class="grid grid-cols-2 gap-1.5">
                    <label
                      v-for="field in ['x', 'y']"
                      :key="field"
                      class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint"
                    >
                      {{ field }}
                      <input
                        type="number"
                        :value="
                          propertyShapeFieldValue(def.name, null, field)
                        "
                        :placeholder="
                          propertyShapeFieldState(def.name, null, field).mixed
                            ? MIXED_TEXT
                            : ''
                        "
                        @input="
                          onShapePropertyInput(
                            def.name,
                            null,
                            field,
                            ($event.target as HTMLInputElement).value
                          )
                        "
                      />
                    </label>
                  </div>
                </div>
              </template>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- Properties section -->
    <div
      v-if="getEntity() && getEntity()!.properties.length > 0"
      class="flex flex-col gap-2"
    >
      <button
        type="button"
        :class="sectionToggleClass"
        @click="toggleSection('properties')"
      >
        Properties
        <span class="ml-auto text-text-faint">
          {{ collapsed.has('properties') ? '▶' : '▼' }}
        </span>
      </button>
      <div v-if="!collapsed.has('properties')" class="flex flex-col gap-2">
        <template v-for="def in getEntity()!.properties" :key="def.name">
          <!-- Property header (collapsible) -->
          <div class="flex flex-col gap-1">
            <div :class="propHeaderClass">
              <button
                type="button"
                :class="propToggleClass"
                @click="toggleSection('prop:' + def.name)"
              >
                <span>{{ def.name }}</span>
                <span :class="propTypeClass">{{
                  def.kind === 'scalar'
                    ? (def as ScalarPropertyField).type
                    : def.kind === 'enum'
                      ? 'enum'
                      : def.kind === 'color'
                        ? 'color'
                        : (def as ShapePropertyField).shapeType +
                          ((def as ShapePropertyField).array ? '[]' : '')
                }}</span>
                <span class="ml-auto text-text-faint">
                  {{ collapsed.has('prop:' + def.name) ? '▶' : '▼' }}
                </span>
              </button>
              <button
                v-if="canSyncProperty(def.name)"
                type="button"
                :class="propSyncClass"
                :title="
                  syncCountForProperty(def.name) > 0
                    ? `Copy this field to ${syncCountForProperty(def.name)} matching frame${syncCountForProperty(def.name) === 1 ? '' : 's'}`
                    : 'No other matching frames to sync'
                "
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
                <span
                  v-if="propertyState(def.name).mixed"
                  :class="selectionMetaClass"
                >
                  {{ MIXED_TEXT }}
                </span>
                <input
                  type="checkbox"
                  :checked="propertyBooleanValue(def.name)"
                  @change="
                    onPropertyInput(
                      def,
                      ($event.target as HTMLInputElement).checked
                    )
                  "
                />
              </label>

              <!-- Enum select -->
              <label v-else-if="def.kind === 'enum'" :class="labelClass">
                <select
                  :value="propertySelectValue(def.name)"
                  @change="
                    onPropertyInput(
                      def,
                      ($event.target as HTMLSelectElement).value
                    )
                  "
                >
                  <option
                    v-if="propertyState(def.name).mixed"
                    :value="MIXED_SELECT_VALUE"
                    disabled
                  >
                    {{ MIXED_TEXT }}
                  </option>
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
              <label v-else-if="def.kind === 'color'" :class="labelClass">
                <ColorPicker
                  :model-value="
                    propertyState(def.name).mixed
                      ? ''
                      : ((propertyState(def.name).value as string) ?? '')
                  "
                  :placeholder="
                    propertyState(def.name).mixed ? MIXED_TEXT : undefined
                  "
                  :image-source="currentSheetImageSrc"
                  :aabb="annotation.aabb"
                  @update:model-value="onPropertyInput(def, $event)"
                />
              </label>

              <!-- Scalar: Number input -->
              <label
                v-else-if="
                  def.kind === 'scalar' &&
                  (def.type === 'integer' ||
                    def.type === 'number' ||
                    def.type === 'ainteger')
                "
                :class="labelClass"
              >
                <input
                  type="number"
                  :value="propertyInputValue(def as ScalarPropertyField)"
                  :placeholder="
                    propertyState(def.name).mixed ? MIXED_TEXT : ''
                  "
                  @input="
                    onPropertyInput(
                      def,
                      ($event.target as HTMLInputElement).value
                    )
                  "
                />
              </label>

              <!-- Scalar: String / string[] text input -->
              <label v-else-if="def.kind === 'scalar'" :class="labelClass">
                <input
                  type="text"
                  :value="propertyInputValue(def as ScalarPropertyField)"
                  :placeholder="propertyPlaceholder(def as ScalarPropertyField)"
                  @input="
                    onPropertyInput(
                      def,
                      ($event.target as HTMLInputElement).value
                    )
                  "
                />
              </label>

              <!-- Shape property -->
              <template v-else-if="def.kind === 'shape'">
                <div class="flex flex-col gap-1.5">
                  <!-- Mini-canvas preview -->
                  <ShapeCanvas
                    v-if="
                      !isMultiSelection &&
                      currentSheetImageSrc &&
                      annotation.aabb
                    "
                    :annotation="annotation"
                    :spec="spec"
                    :shape-name="def.name"
                    :sheet-image-src="currentSheetImageSrc"
                    :shape-color="SHAPE_COLORS[1]"
                    :property-shapes="
                      getPropertyShapeData(def as ShapePropertyField)
                    "
                    @update:property-shape="onShapeCanvasUpdate"
                  />

                  <!-- Single point -->
                  <template
                    v-if="
                      !(def as ShapePropertyField).array &&
                      (def as ShapePropertyField).shapeType === 'point'
                    "
                  >
                    <div class="grid grid-cols-2 gap-1.5">
                      <label
                        v-for="field in ['x', 'y']"
                        :key="field"
                        class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint"
                      >
                        {{ field }}
                        <input
                          type="number"
                          :value="
                            propertyShapeFieldValue(def.name, null, field)
                          "
                          :placeholder="
                            propertyShapeFieldState(def.name, null, field).mixed
                              ? MIXED_TEXT
                              : ''
                          "
                          @input="
                            onShapePropertyInput(
                              def.name,
                              null,
                              field,
                              ($event.target as HTMLInputElement).value
                            )
                          "
                        />
                      </label>
                    </div>
                  </template>

                  <!-- Single rect -->
                  <template
                    v-if="
                      !(def as ShapePropertyField).array &&
                      (def as ShapePropertyField).shapeType === 'rect'
                    "
                  >
                    <div class="grid grid-cols-2 gap-1.5">
                      <label
                        v-for="field in ['x', 'y', 'w', 'h']"
                        :key="field"
                        class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint"
                      >
                        {{ field }}
                        <input
                          type="number"
                          :value="
                            propertyShapeFieldValue(def.name, null, field)
                          "
                          :placeholder="
                            propertyShapeFieldState(def.name, null, field).mixed
                              ? MIXED_TEXT
                              : ''
                          "
                          @input="
                            onShapePropertyInput(
                              def.name,
                              null,
                              field,
                              ($event.target as HTMLInputElement).value
                            )
                          "
                        />
                      </label>
                    </div>
                  </template>

                  <!-- Array shapes -->
                  <template v-if="(def as ShapePropertyField).array">
                    <div
                      v-if="isMultiSelection"
                      class="rounded-sm border border-border bg-surface-0 px-2 py-1 text-xs text-text-faint"
                    >
                      Multi-edit for shape arrays is not supported.
                    </div>
                    <div
                      v-else
                      v-for="(item, idx) in (annotation.properties[
                        def.name
                      ] as any[]) ?? []"
                      :key="idx"
                      class="flex flex-col gap-1 pl-2 border-l-2 border-border"
                    >
                      <div class="flex items-center justify-between">
                        <span class="text-[10px] font-mono text-text-faint"
                          >#{{ idx + 1 }}</span
                        >
                        <button
                          type="button"
                          :class="controlTextDangerButtonClass"
                          @click="removeShapeArrayItem(def.name, idx)"
                        >
                          remove
                        </button>
                      </div>
                      <div
                        class="grid grid-cols-2 gap-1.5"
                        v-if="(def as ShapePropertyField).shapeType === 'point'"
                      >
                        <label
                          v-for="field in ['x', 'y']"
                          :key="field"
                          class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint"
                        >
                          {{ field }}
                          <input
                            type="number"
                            :value="(item as any)?.[field] ?? 0"
                            @input="
                              onShapePropertyInput(
                                def.name,
                                idx,
                                field,
                                ($event.target as HTMLInputElement).value
                              )
                            "
                          />
                        </label>
                      </div>
                      <div class="grid grid-cols-2 gap-1.5" v-else>
                        <label
                          v-for="field in ['x', 'y', 'w', 'h']"
                          :key="field"
                          class="flex flex-col gap-0.5 text-[10px] font-mono text-text-faint"
                        >
                          {{ field }}
                          <input
                            type="number"
                            :value="(item as any)?.[field] ?? 0"
                            @input="
                              onShapePropertyInput(
                                def.name,
                                idx,
                                field,
                                ($event.target as HTMLInputElement).value
                              )
                            "
                          />
                        </label>
                      </div>
                    </div>
                    <button
                      v-if="!isMultiSelection"
                      type="button"
                      :class="controlSubtleButtonClass"
                      @click="
                        addShapeArrayItem(
                          def.name,
                          (def as ShapePropertyField).shapeType
                        )
                      "
                    >
                      Add {{ (def as ShapePropertyField).shapeType }}
                    </button>
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
