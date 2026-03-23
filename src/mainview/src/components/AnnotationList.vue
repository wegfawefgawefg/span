<script setup lang="ts">
import { computed } from "vue";
import { annotations, selectedId, selectAnnotation } from "../state";

const sorted = computed(() =>
	[...annotations.value].sort((a, b) => {
		const nameDiff = a.name.localeCompare(b.name);
		if (nameDiff !== 0) return nameDiff;
		return a.frame - b.frame;
	}),
);
</script>

<template>
	<div class="h-full p-3 flex flex-col overflow-hidden bg-surface-1">
		<div class="flex items-center justify-between mb-2">
			<h2 class="text-xs font-semibold tracking-wide text-text-dim uppercase">Sprites</h2>
			<span class="px-1.5 py-0.5 text-[10px] font-mono text-text-faint border border-border rounded-sm">
				{{ annotations.length }}
			</span>
		</div>
		<div class="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0">
			<button
				v-for="annotation in sorted"
				:key="annotation.id"
				type="button"
				class="w-full text-left px-2.5 py-2 border rounded-sm transition-colors cursor-pointer"
				:class="
					annotation.id === selectedId
						? 'bg-copper-glow border-copper'
						: 'bg-surface-2 border-border hover:border-border-strong'
				"
				@click="selectAnnotation(annotation.id)"
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
	</div>
</template>
