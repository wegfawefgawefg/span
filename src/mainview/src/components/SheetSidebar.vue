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
	<div class="flex flex-col h-full gap-2 p-3 overflow-hidden bg-surface-1">
		<div class="flex items-center justify-between">
			<h1 class="text-sm font-semibold tracking-wide text-text-dim uppercase">Sheets</h1>
			<button
				type="button"
				class="px-2.5 py-1 text-xs font-mono text-text-dim border border-border rounded-sm
					hover:border-copper hover:text-copper transition-colors cursor-pointer bg-surface-2"
				@click="handleRefresh"
			>
				Refresh
			</button>
		</div>
		<input
			v-model="filterQuery"
			class="!bg-surface-0 !border-border placeholder:text-text-faint"
			type="search"
			placeholder="Filter sheets..."
			autocomplete="off"
		/>
		<div class="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0">
			<button
				v-for="sheet in filteredSheets"
				:key="sheet.file"
				type="button"
				class="w-full text-left px-3 py-2 border rounded-sm transition-all cursor-pointer"
				:class="
					currentSheet?.file === sheet.file
						? 'bg-copper-glow border-copper text-text'
						: 'bg-surface-2 border-border text-text-dim hover:border-border-strong hover:text-text'
				"
				@click="handleOpen(sheet.file)"
			>
				<div class="font-medium text-[13px] truncate">{{ sheet.name }}</div>
				<div class="font-mono text-[10px] text-text-faint truncate mt-0.5">{{ sheet.file }}</div>
			</button>
		</div>
	</div>
</template>
