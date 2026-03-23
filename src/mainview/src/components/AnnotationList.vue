<script setup lang="ts">
import { computed, ref } from "vue";
import type { Annotation } from "../types";
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
const collapsed = ref<Set<string>>(new Set());

interface SpriteGroup {
	key: string;
	name: string;
	frames: Annotation[];
}

function groupKey(a: Annotation): string {
	return [
		a.type ?? "sprite",
		a.name?.trim() ?? "",
		a.direction?.trim() ?? "",
		a.variant?.trim() ?? "",
	].join("|");
}

const groups = computed<SpriteGroup[]>(() => {
	const map = new Map<string, SpriteGroup>();
	for (const ann of annotations.value) {
		const key = groupKey(ann);
		let group = map.get(key);
		if (!group) {
			group = { key, name: ann.name?.trim() || "unnamed", frames: [] };
			map.set(key, group);
		}
		group.frames.push(ann);
	}
	const result = Array.from(map.values());
	for (const g of result) {
		g.frames.sort((a, b) => a.frame - b.frame);
	}
	result.sort((a, b) => a.name.localeCompare(b.name));
	return result;
});

function toggleGroup(key: string) {
	if (collapsed.value.has(key)) {
		collapsed.value.delete(key);
	} else {
		collapsed.value.add(key);
	}
}

function groupMeta(group: SpriteGroup): string {
	const first = group.frames[0];
	const parts = [first.type];
	if (first.direction) parts.push(first.direction);
	if (first.variant) parts.push(first.variant);
	return parts.join(" · ");
}

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
		<div class="flex flex-col gap-0.5 flex-1 overflow-y-auto min-h-0 px-2 py-2">
			<div v-for="group in groups" :key="group.key">
				<button
					type="button"
					class="w-full flex items-center gap-1.5 px-2 py-1 text-left cursor-pointer bg-transparent transition-colors hover:text-text"
					@click="toggleGroup(group.key)"
				>
					<span
						class="text-[10px] text-text-faint transition-transform"
						:class="collapsed.has(group.key) ? '-rotate-90' : ''"
					>&#9660;</span>
					<span class="text-xs font-medium truncate" :class="group.frames.some(a => a.id === selectedId) ? 'text-copper-bright' : 'text-text-dim'">
						{{ group.name }}
					</span>
					<span class="text-[10px] font-mono text-text-faint ml-auto shrink-0">
						{{ group.frames.length }}f
					</span>
				</button>
				<div v-if="!collapsed.has(group.key)" class="flex flex-col gap-0.5 pl-4 mt-0.5">
					<button
						v-for="ann in group.frames"
						:key="ann.id"
						type="button"
						class="w-full text-left px-2 py-1 border rounded-sm transition-colors cursor-pointer active:translate-y-px"
						:class="
							ann.id === selectedId
								? 'bg-copper-glow border-copper'
								: 'bg-surface-2 border-border hover:border-border-strong hover:-translate-y-px'
						"
						@click="selectAnnotation(ann.id)"
						@contextmenu="onContextMenu($event, ann.id)"
					>
						<div class="font-mono text-[10px]" :class="ann.id === selectedId ? 'text-copper-bright' : 'text-text-dim'">
							f{{ ann.frame }} &middot; {{ ann.x }},{{ ann.y }} &middot; {{ ann.width }}&times;{{ ann.height }}
						</div>
					</button>
				</div>
			</div>
		</div>
		<ContextMenu ref="ctxMenu" />
	</div>
</template>
