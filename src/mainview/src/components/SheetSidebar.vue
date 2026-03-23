<script setup lang="ts">
import { computed, ref } from "vue";
import {
	sheets,
	currentSheet,
	openSheet,
	dirty,
	statusText,
	loadProjectData,
} from "../state";

const filterQuery = ref("");

const filteredSheets = computed(() => {
	const q = filterQuery.value.trim().toLowerCase();
	if (!q) return sheets.value;
	return sheets.value.filter(
		(s) =>
			s.file.toLowerCase().includes(q) ||
			s.name.toLowerCase().includes(q),
	);
});

async function handleOpen(file: string) {
	try {
		await openSheet(file);
	} catch (e) {
		console.error(e);
		statusText.value = `Failed to open ${file}`;
	}
}

async function handleRefresh() {
	if (dirty.value) {
		if (
			!window.confirm(
				"Discard unsaved changes and reload project annotations?",
			)
		) {
			return;
		}
	}
	try {
		await loadProjectData();
	} catch (e) {
		console.error(e);
		statusText.value = "Failed to load sheets";
	}
}
</script>

<template>
	<div class="h-full p-3 flex flex-col gap-2 overflow-hidden bg-surface-1">
		<div class="flex items-center justify-between">
			<h2 class="text-xs font-semibold tracking-wide text-text-dim uppercase">Sheets</h2>
			<button
				type="button"
				class="px-2 py-1 text-[11px] font-mono text-text-dim bg-surface-2 border border-border rounded-sm
					hover:border-copper hover:text-copper focus-visible:outline-copper transition-colors cursor-pointer"
				@click="handleRefresh"
			>
				Refresh
			</button>
		</div>
		<input
			v-model="filterQuery"
			type="search"
			placeholder="Filter sheets..."
			autocomplete="off"
		/>
		<div class="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0">
			<button
				v-for="sheet in filteredSheets"
				:key="sheet.file"
				type="button"
				class="w-full text-left px-2.5 py-2 border rounded-sm transition-colors cursor-pointer"
				:class="
					currentSheet?.file === sheet.file
						? 'bg-copper-glow border-copper'
						: 'bg-surface-2 border-border hover:border-border-strong hover:-translate-y-px'
				"
				@click="handleOpen(sheet.file)"
			>
				<div
					class="text-xs font-medium truncate"
					:class="currentSheet?.file === sheet.file ? 'text-copper-bright' : 'text-text'"
				>
					{{ sheet.name }}
				</div>
				<div class="font-mono text-[10px] text-text-faint truncate mt-0.5">{{ sheet.file }}</div>
			</button>
		</div>
	</div>
</template>
