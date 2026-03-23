<script setup lang="ts">
import { computed, ref } from "vue";
import {
	annotations,
	selectedId,
	selectAnnotation,
	duplicateSelected,
	deleteSelected,
} from "../state";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";

const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

const sorted = computed(() =>
	[...annotations.value].sort((a, b) => {
		const nameDiff = a.name.localeCompare(b.name);
		if (nameDiff !== 0) return nameDiff;
		return a.frame - b.frame;
	}),
);

function onContextMenu(event: MouseEvent, annotationId: string) {
	selectAnnotation(annotationId);
	const entries: MenuEntry[] = [
		{ label: "Duplicate", action: () => duplicateSelected() },
		{ label: "Delete", action: () => deleteSelected() },
	];
	ctxMenu.value?.show(event, entries);
}
</script>

<template>
	<div class="h-full flex flex-col overflow-hidden bg-surface-1">
		<div class="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0 px-2 py-2">
			<button
				v-for="annotation in sorted"
				:key="annotation.id"
				type="button"
				class="w-full text-left px-2.5 py-2 border rounded-sm transition-colors cursor-pointer active:translate-y-px"
				:class="
					annotation.id === selectedId
						? 'bg-copper-glow border-copper'
						: 'bg-surface-2 border-border hover:border-border-strong hover:-translate-y-px'
				"
				@click="selectAnnotation(annotation.id)"
				@contextmenu="onContextMenu($event, annotation.id)"
			>
				<div
					class="text-xs font-medium truncate"
					:class="annotation.id === selectedId ? 'text-copper-bright' : 'text-text'"
				>
					{{ annotation.name }}
				</div>
				<div class="font-mono text-[10px] text-text-faint mt-0.5">
					f{{ annotation.frame }} &middot; {{ annotation.x }},{{ annotation.y }} &middot; {{ annotation.width }}&times;{{ annotation.height }}
				</div>
			</button>
		</div>
		<ContextMenu ref="ctxMenu" />
	</div>
</template>
