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
	<aside class="sidebar">
		<div class="panel-header">
			<h1>Sheets</h1>
			<button type="button" @click="handleRefresh">Refresh</button>
		</div>
		<input
			v-model="filterQuery"
			class="search-input"
			type="search"
			placeholder="Filter sheets"
			autocomplete="off"
		/>
		<div class="sheet-list">
			<button
				v-for="sheet in filteredSheets"
				:key="sheet.file"
				type="button"
				class="sheet-card"
				:class="{ selected: currentSheet?.file === sheet.file }"
				@click="handleOpen(sheet.file)"
			>
				<div class="sheet-name">{{ sheet.name }}</div>
				<div class="sheet-meta">{{ sheet.file }}</div>
			</button>
		</div>
	</aside>
</template>
