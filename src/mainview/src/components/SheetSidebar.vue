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
import { api, platform } from "../platform/adapter";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";

const filterQuery = ref("");
const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

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
				"Discard unsaved changes and reload all sheets?",
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

function onSheetContextMenu(event: MouseEvent, file: string) {
	const entries: MenuEntry[] = [
		{
			label: "Open",
			action: () => handleOpen(file),
			disabled: currentSheet.value?.file === file,
		},
		...(platform.value === "desktop"
			? [{ label: "Reveal in Finder", action: () => api.revealSheet(file) }]
			: []),
		{ separator: true },
		{ label: "Refresh all sheets", action: () => handleRefresh() },
	];
	ctxMenu.value?.show(event, entries);
}

function onPanelContextMenu(event: MouseEvent) {
	const entries: MenuEntry[] = [
		{ label: "Refresh all sheets", action: () => handleRefresh() },
	];
	ctxMenu.value?.show(event, entries);
}
</script>

<template>
	<div class="h-full flex flex-col gap-2 overflow-hidden bg-surface-1" @contextmenu="onPanelContextMenu">
		<div class="flex flex-col gap-1.5 p-2 pb-0">
			<input v-model="filterQuery" type="search" placeholder="Filter sheets..." autocomplete="off" @contextmenu.stop />
		</div>
		<div class="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0 px-2 pb-2">
			<button v-for="sheet in filteredSheets" :key="sheet.file" type="button"
				class="w-full text-left px-2.5 py-2 border rounded-sm transition-colors cursor-pointer active:translate-y-px"
				:class="currentSheet?.file === sheet.file
					? 'bg-copper-glow border-copper'
					: 'bg-surface-2 border-border hover:border-border-strong hover:-translate-y-px'
				"
				@click="handleOpen(sheet.file)"
				@contextmenu.stop="onSheetContextMenu($event, sheet.file)"
			>
				<div class="text-xs font-medium truncate"
					:class="currentSheet?.file === sheet.file ? 'text-copper-bright' : 'text-text'">
					{{ sheet.name }}
				</div>
				<div class="font-mono text-[10px] text-text-faint truncate mt-0.5">{{ sheet.file }}</div>
			</button>
		</div>
		<ContextMenu ref="ctxMenu" />
	</div>
</template>
