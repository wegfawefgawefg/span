<script setup lang="ts">
import { computed, ref } from "vue";
import {
	sheets,
	currentSheet,
	openSheetByPath,
	removeSheet,
	addSheet,
	statusText,
} from "../state";
import { api, platform } from "../platform/adapter";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";

const filterQuery = ref("");
const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);

/** Extract filename from a path (last segment). */
function filename(path: string): string {
	return path.split("/").pop() ?? path;
}

const filteredSheets = computed(() => {
	const q = filterQuery.value.trim().toLowerCase();
	if (!q) return sheets.value;
	return sheets.value.filter((s) => s.path.toLowerCase().includes(q));
});

async function handleOpen(path: string) {
	try {
		await openSheetByPath(path);
	} catch (e) {
		console.error(e);
		statusText.value = `Failed to open ${path}`;
	}
}

async function handleAddImages() {
	const selected = await api.showOpenDialog([
		{ name: "Images", extensions: ["png", "jpg", "gif", "webp"] },
	]);
	if (!selected) return;

	try {
		const dataUrl = await api.readImageAsDataUrl(selected);
		// Resolve dimensions from the data URL
		const img = new Image();
		img.src = dataUrl;
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("Failed to load image"));
		});

		addSheet({
			path: selected,
			absolutePath: selected,
			annotations: [],
			status: "loaded",
			imageUrl: dataUrl,
			width: img.naturalWidth,
			height: img.naturalHeight,
		});
	} catch (e) {
		console.error(e);
		statusText.value = "Failed to add image";
	}
}

function handleRemove(path: string, hasAnnotations: boolean) {
	if (hasAnnotations) {
		if (!window.confirm(`"${filename(path)}" has annotations. Remove from workspace?`)) {
			return;
		}
	}
	removeSheet(path);
}

function onSheetContextMenu(event: MouseEvent, sheet: (typeof sheets.value)[number]) {
	const entries: MenuEntry[] = [
		{
			label: "Open",
			action: () => handleOpen(sheet.path),
			disabled: currentSheet.value?.path === sheet.path,
		},
		...(platform.value === "desktop"
			? [{ label: "Reveal in Finder", action: () => api.revealFile(sheet.absolutePath) }]
			: []),
		{ separator: true },
		{
			label: "Remove from workspace",
			action: () => handleRemove(sheet.path, sheet.annotations.length > 0),
		},
	];
	ctxMenu.value?.show(event, entries);
}

function onPanelContextMenu(event: MouseEvent) {
	const entries: MenuEntry[] = [
		{ label: "Add images\u2026", action: () => handleAddImages() },
	];
	ctxMenu.value?.show(event, entries);
}
</script>

<template>
	<div class="h-full flex flex-col gap-2 overflow-hidden bg-surface-1" @contextmenu="onPanelContextMenu">
		<div class="flex flex-col gap-1.5 p-2 pb-0">
			<input v-model="filterQuery" type="search" placeholder="Filter sheets..." autocomplete="off" @contextmenu.stop />
			<button type="button" class="w-full text-xs px-2 py-1.5 rounded-sm bg-surface-2 border border-border hover:border-border-strong cursor-pointer transition-colors" @click="handleAddImages">
				Add images
			</button>
		</div>
		<div class="flex flex-col gap-1 flex-1 overflow-y-auto min-h-0 px-2 pb-2">
			<button v-for="sheet in filteredSheets" :key="sheet.path" type="button"
				class="w-full text-left px-2.5 py-2 border rounded-sm transition-colors cursor-pointer active:translate-y-px"
				:class="[
					currentSheet?.path === sheet.path
						? 'bg-copper-glow border-copper'
						: 'bg-surface-2 border-border hover:border-border-strong hover:-translate-y-px',
					sheet.status === 'missing' ? 'opacity-50' : '',
				]"
				@click="handleOpen(sheet.path)"
				@contextmenu.stop="onSheetContextMenu($event, sheet)"
			>
				<div class="text-xs font-medium truncate flex items-center gap-1"
					:class="currentSheet?.path === sheet.path ? 'text-copper-bright' : 'text-text'">
					<span v-if="sheet.status === 'missing'" title="Image file not found">&#9888;</span>
					{{ filename(sheet.path) }}
				</div>
				<div class="font-mono text-[10px] text-text-faint truncate mt-0.5">{{ sheet.path }}</div>
			</button>
		</div>
		<ContextMenu ref="ctxMenu" />
	</div>
</template>
