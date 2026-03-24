<script setup lang="ts">
import { activeSpec, selectedAnnotation } from "../state";
import DynamicInspector from "./DynamicInspector.vue";

const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function onContextMenu(event: MouseEvent) {
	const tag = (event.target as HTMLElement)?.tagName;
	if (FORM_TAGS.has(tag)) {
		// Allow native context menu on form elements
		event.stopPropagation();
		return;
	}
	// Block everywhere else
	event.preventDefault();
}
</script>

<template>
	<div class="h-full flex flex-col overflow-hidden bg-surface-1" @contextmenu="onContextMenu">
		<div v-if="!activeSpec" class="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
			<span class="text-xs text-text-faint">Load a spec file to begin annotating.</span>
		</div>
		<div v-else-if="!selectedAnnotation" class="flex-1 flex flex-col items-center justify-center gap-2 text-center">
			<svg class="w-8 h-8 text-text-faint/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="3" y="3" width="18" height="18" rx="1" stroke-dasharray="4 2" />
				<path d="M9 12h6M12 9v6" stroke-linecap="round" />
			</svg>
			<span class="text-xs text-text-faint">Select an annotation</span>
		</div>
		<DynamicInspector v-else :annotation="selectedAnnotation" :spec="activeSpec" />
	</div>
</template>
