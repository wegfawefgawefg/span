<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';
import {
  activeSpecRaw,
  applySpecFromEditor,
  forceApplySpec,
  specFilePath,
} from '../state/specState';
import { serializeSpecRaw } from '../spec/serialize';
import type { SpecError, SpecDiff } from '../spec/types';
import { DEFAULT_SPEC_FORMAT } from '../spec/default-spec';
import {
  controlButtonClass,
  controlPrimaryButtonClass,
  controlSegmentButtonActiveClass,
  controlSegmentButtonClass,
} from '../controlStyles';

const REFERENCE_SPEC_RAW = `\
- label: Sprite
  group: sprites
  aabb: rect
  path: file_name
  name: string
  frame: ainteger
  duration: integer
  offset: point
  properties:
    health: integer
    speed: number
    looping: boolean
    tags: string[]
    palette_swap: color
    hurtbox: rect
    sockets: point[]
    hitboxes: rect[]
    state: enum[idle, run, attack, dead]

- label: Spawn
  group: markers
  point: point
  properties:
    name: string
    faction: enum[player, enemy, neutral]
    enabled: boolean
`;

// --- Editor state ---
const editorText = ref('');
const editorFormat = ref<'yaml' | 'json'>('yaml');
const errors = ref<SpecError[]>([]);
const pendingDiff = ref<SpecDiff | null>(null);
const pendingRaw = ref<string>('');
const lastAppliedText = ref('');
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const sampleSpec = computed(() => {
  if (editorFormat.value === DEFAULT_SPEC_FORMAT) {
    return REFERENCE_SPEC_RAW.trim();
  }
  return (
    serializeSpecRaw(
      REFERENCE_SPEC_RAW,
      DEFAULT_SPEC_FORMAT,
      editorFormat.value
    )?.trim() ?? REFERENCE_SPEC_RAW.trim()
  );
});

const syntaxHints = computed(() =>
  editorFormat.value === 'yaml'
    ? [
        '`label` and `group` are required for each entity.',
        'Set the primary shape with exactly one of `aabb: rect` or `point: point`.',
        '`path: file_name` is an optional feature toggle.',
        '`path: file_name` exports the source sheet filename with entries.',
        '`properties` accepts `string`, `integer`, `number`, `boolean`, `string[]`, and `ainteger`.',
        '`properties` also accepts `color`, `rect`, `point`, `rect[]`, `point[]`, and `enum[a, b, c]`.',
      ]
    : [
        'The root is an array of entity objects.',
        '`label` and `group` are required for each entity.',
        'Set the primary shape with exactly one of `"aabb": "rect"` or `"point": "point"`.',
        'Use `"path": "file_name"` when needed.',
        '`properties` accepts scalar types, colors, shapes, shape arrays, and `enum[a, b, c]` strings.',
        'The sample includes every currently supported property type.',
      ]
);

// Initialize from current spec
onMounted(() => {
  syncFromState();
});

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
});

// Watch for external spec changes (e.g., import, workspace restore)
watch(activeSpecRaw, () => {
  // Only sync if the change came from outside (not from our own apply)
  const current = activeSpecRaw.value;
  if (!current) return;
  if (current.raw === lastAppliedText.value) return;
  syncFromState();
});

function syncFromState() {
  const current = activeSpecRaw.value;
  if (!current) return;
  editorText.value = current.raw;
  editorFormat.value = current.format;
  lastAppliedText.value = current.raw;
  errors.value = [];
  pendingDiff.value = null;
}

// --- Debounced apply on edit ---
function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer);
  pendingDiff.value = null;
  debounceTimer = setTimeout(() => {
    tryApply();
  }, 500);
}

function tryApply() {
  const raw = editorText.value;
  const result = applySpecFromEditor(raw, editorFormat.value);

  if ('errors' in result) {
    errors.value = result.errors;
    return;
  }

  if ('destructive' in result && result.destructive) {
    errors.value = [];
    pendingDiff.value = result.diff;
    pendingRaw.value = raw;
    return;
  }

  // Applied successfully
  errors.value = [];
  pendingDiff.value = null;
  lastAppliedText.value = raw;
}

function confirmDestructive() {
  forceApplySpec(pendingRaw.value, editorFormat.value);
  lastAppliedText.value = pendingRaw.value;
  pendingDiff.value = null;
  errors.value = [];
}

function revertToLastApplied() {
  editorText.value = lastAppliedText.value;
  pendingDiff.value = null;
  errors.value = [];
}

// --- Format toggle ---
function switchFormat(target: 'yaml' | 'json') {
  if (target === editorFormat.value) return;
  if (debounceTimer) clearTimeout(debounceTimer);

  const converted = serializeSpecRaw(
    editorText.value,
    editorFormat.value,
    target
  );
  if (converted === null) {
    // Can't convert — there are parse errors
    errors.value = [
      {
        path: '',
        severity: 'error',
        message: 'Fix errors before switching format.',
      },
    ];
    return;
  }

  editorText.value = converted;
  editorFormat.value = target;
  // Apply the converted text
  tryApply();
}
</script>

<template>
  <div class="flex h-full flex-col bg-surface-0 text-text">
    <!-- Toolbar -->
    <div
      class="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-surface-1 px-2 py-1"
    >
      <div class="flex gap-0.5">
        <button
          type="button"
          :class="[
            controlSegmentButtonClass,
            editorFormat === 'yaml' ? controlSegmentButtonActiveClass : '',
          ]"
          @click="switchFormat('yaml')"
        >
          YAML
        </button>
        <button
          type="button"
          :class="[
            controlSegmentButtonClass,
            editorFormat === 'json' ? controlSegmentButtonActiveClass : '',
          ]"
          @click="switchFormat('json')"
        >
          JSON
        </button>
      </div>
      <div
        class="h-2 w-2 shrink-0 rounded-full"
        :class="
          errors.length > 0
            ? 'bg-danger'
            : pendingDiff
              ? 'bg-amber-400'
              : 'bg-emerald-400'
        "
        :title="
          errors.length > 0
            ? 'Parse errors'
            : pendingDiff
              ? 'Pending destructive changes'
              : 'Valid'
        "
      />
    </div>
    <div
      class="shrink-0 border-b border-border bg-surface-1 px-2 py-1.5 text-[11px] leading-[1.4] text-text-faint"
    >
      Spec edits auto-apply and save to
      <code class="font-mono text-text-dim">{{
        specFilePath
          ? specFilePath.split('/').slice(-2).join('/')
          : '.span/spec.yaml'
      }}</code
      >.
    </div>

    <!-- Destructive change warning -->
    <div
      v-if="pendingDiff"
      class="shrink-0 border-b border-amber-400/30 bg-amber-400/10 p-2"
    >
      <div class="mb-1.5 text-[11px] text-amber-400">
        <strong>Destructive changes detected:</strong>
        <ul class="mt-1 ml-4 list-disc p-0">
          <li
            v-for="change in pendingDiff.changes.filter((c) => c.destructive)"
            :key="change.description"
            class="mt-0.5"
          >
            {{ change.description }}
          </li>
        </ul>
      </div>
      <div class="flex gap-1.5">
        <button
          type="button"
          :class="controlPrimaryButtonClass"
          @click="confirmDestructive"
        >
          Apply
        </button>
        <button
          type="button"
          :class="controlButtonClass"
          @click="revertToLastApplied"
        >
          Revert
        </button>
      </div>
    </div>

    <div
      class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] max-[1100px]:grid-cols-1 max-[1100px]:grid-rows-[minmax(0,1fr)_auto]"
    >
      <textarea
        v-model="editorText"
        class="h-full min-h-0 w-full resize-none border-0 bg-surface-0 p-3 font-mono text-xs leading-[1.5] text-text outline-none placeholder:text-text-faint [tab-size:2]"
        spellcheck="false"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        @input="onInput"
      />

      <aside
        class="flex flex-col gap-3 overflow-y-auto border-l border-border bg-surface-1 p-2.5 max-[1100px]:max-h-[220px] max-[1100px]:border-l-0 max-[1100px]:border-t"
      >
        <div class="flex flex-col gap-1.5">
          <div
            class="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-dim"
          >
            Guide
          </div>
          <ul class="m-0 flex list-disc flex-col gap-1 pl-4 text-[11px] text-text-faint">
            <li v-for="hint in syntaxHints" :key="hint">{{ hint }}</li>
          </ul>
        </div>
        <div class="flex flex-col gap-1.5">
          <div
            class="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-dim"
          >
            Sample {{ editorFormat.toUpperCase() }}
          </div>
          <pre
            class="m-0 overflow-x-auto rounded border border-border bg-surface-0 p-2 font-mono text-[11px] leading-[1.45] text-text"
          ><code>{{ sampleSpec }}</code></pre>
        </div>
      </aside>
    </div>

    <!-- Error panel -->
    <div
      v-if="errors.length > 0 && !pendingDiff"
      class="max-h-[120px] shrink-0 overflow-y-auto border-t border-danger bg-red-500/10 px-2 py-1.5"
    >
      <div
        v-for="(err, i) in errors"
        :key="i"
        class="py-0.5 font-mono text-[11px] text-danger"
      >
        <span v-if="err.path" class="mr-1 text-text-faint">{{ err.path }}:</span>
        {{ err.message }}
      </div>
    </div>
  </div>
</template>
