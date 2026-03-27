<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from "vue";
import {
	activeSpecRaw,
	applySpecFromEditor,
	forceApplySpec,
} from "../state";
import { serializeSpecRaw } from "../spec/serialize";
import type { SpecError, SpecDiff } from "../spec/types";

// --- Editor state ---
const editorText = ref("");
const editorFormat = ref<"yaml" | "json">("yaml");
const errors = ref<SpecError[]>([]);
const pendingDiff = ref<SpecDiff | null>(null);
const pendingRaw = ref<string>("");
const lastAppliedText = ref("");
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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

	if ("errors" in result) {
		errors.value = result.errors;
		return;
	}

	if ("destructive" in result && result.destructive) {
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
function switchFormat(target: "yaml" | "json") {
	if (target === editorFormat.value) return;
	if (debounceTimer) clearTimeout(debounceTimer);

	const converted = serializeSpecRaw(editorText.value, editorFormat.value, target);
	if (converted === null) {
		// Can't convert — there are parse errors
		errors.value = [{
			path: "",
			severity: "error",
			message: "Fix errors before switching format.",
		}];
		return;
	}

	editorText.value = converted;
	editorFormat.value = target;
	// Apply the converted text
	tryApply();
}
</script>

<template>
	<div class="spec-editor">
		<!-- Toolbar -->
		<div class="spec-toolbar">
			<div class="format-toggle">
				<button
					type="button"
					class="format-btn"
					:class="{ active: editorFormat === 'yaml' }"
					@click="switchFormat('yaml')"
				>YAML</button>
				<button
					type="button"
					class="format-btn"
					:class="{ active: editorFormat === 'json' }"
					@click="switchFormat('json')"
				>JSON</button>
			</div>
			<div
				class="status-dot"
				:class="errors.length > 0 ? 'error' : pendingDiff ? 'warning' : 'valid'"
				:title="errors.length > 0 ? 'Parse errors' : pendingDiff ? 'Pending destructive changes' : 'Valid'"
			/>
		</div>

		<!-- Destructive change warning -->
		<div v-if="pendingDiff" class="warning-banner">
			<div class="warning-text">
				<strong>Destructive changes detected:</strong>
				<ul>
					<li v-for="change in pendingDiff.changes.filter(c => c.destructive)" :key="change.description">
						{{ change.description }}
					</li>
				</ul>
			</div>
			<div class="warning-actions">
				<button type="button" class="btn-apply" @click="confirmDestructive">Apply</button>
				<button type="button" class="btn-revert" @click="revertToLastApplied">Revert</button>
			</div>
		</div>

		<!-- Editor -->
		<textarea
			v-model="editorText"
			class="spec-textarea"
			spellcheck="false"
			autocomplete="off"
			autocorrect="off"
			autocapitalize="off"
			@input="onInput"
		/>

		<!-- Error panel -->
		<div v-if="errors.length > 0 && !pendingDiff" class="error-panel">
			<div v-for="(err, i) in errors" :key="i" class="error-item">
				<span class="error-path" v-if="err.path">{{ err.path }}:</span>
				{{ err.message }}
			</div>
		</div>
	</div>
</template>

<style scoped>
.spec-editor {
	display: flex;
	flex-direction: column;
	height: 100%;
	background-color: var(--color-surface-0);
	color: var(--color-text);
}

.spec-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 4px 8px;
	border-bottom: 1px solid var(--color-border);
	background-color: var(--color-surface-1);
	gap: 8px;
	flex-shrink: 0;
}

.format-toggle {
	display: flex;
	gap: 2px;
}

.format-btn {
	padding: 2px 8px;
	font-size: 11px;
	font-family: var(--font-mono, monospace);
	border: 1px solid var(--color-border);
	border-radius: 3px;
	background: transparent;
	color: var(--color-text-faint);
	cursor: pointer;
	transition: all 0.15s;
}

.format-btn:hover {
	color: var(--color-text-dim);
}

.format-btn.active {
	background-color: var(--color-copper-glow);
	color: var(--color-copper-bright);
	border-color: var(--color-copper);
}

.status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	flex-shrink: 0;
}

.status-dot.valid {
	background-color: #4ade80;
}

.status-dot.error {
	background-color: var(--color-danger);
}

.status-dot.warning {
	background-color: #fbbf24;
}

.warning-banner {
	padding: 8px;
	background-color: #fbbf2418;
	border-bottom: 1px solid #fbbf2444;
	flex-shrink: 0;
}

.warning-text {
	font-size: 11px;
	color: #fbbf24;
	margin-bottom: 6px;
}

.warning-text ul {
	margin: 4px 0 0 16px;
	padding: 0;
}

.warning-text li {
	margin: 2px 0;
}

.warning-actions {
	display: flex;
	gap: 6px;
}

.btn-apply,
.btn-revert {
	padding: 2px 10px;
	font-size: 11px;
	border-radius: 3px;
	border: none;
	cursor: pointer;
	transition: all 0.15s;
}

.btn-apply {
	background-color: var(--color-copper);
	color: var(--color-surface-0);
}

.btn-apply:hover {
	filter: brightness(1.1);
}

.btn-revert {
	background-color: var(--color-surface-1);
	color: var(--color-text-dim);
	border: 1px solid var(--color-border);
}

.btn-revert:hover {
	color: var(--color-text);
}

.spec-textarea {
	flex: 1;
	resize: none;
	border: none;
	outline: none;
	padding: 12px;
	font-family: var(--font-mono, monospace);
	font-size: 12px;
	line-height: 1.5;
	tab-size: 2;
	background-color: var(--color-surface-0);
	color: var(--color-text);
}

.spec-textarea::placeholder {
	color: var(--color-text-faint);
}

.error-panel {
	max-height: 120px;
	overflow-y: auto;
	padding: 6px 8px;
	border-top: 1px solid var(--color-danger);
	background-color: #ef444418;
	flex-shrink: 0;
}

.error-item {
	font-size: 11px;
	font-family: var(--font-mono, monospace);
	color: var(--color-danger);
	padding: 2px 0;
}

.error-path {
	color: var(--color-text-faint);
	margin-right: 4px;
}
</style>
