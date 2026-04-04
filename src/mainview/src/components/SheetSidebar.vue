<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
	sheets,
	currentSheet,
	openSheetByPath,
	removeSheet,
	fulfillSheet,
	statusText,
} from "../state";
import type { WorkspaceSheet } from "../state";
import { api, platform } from "../platform/adapter";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";

const filterQuery = ref("");
const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);
const expandedFolders = ref<Set<string>>(new Set());

type SheetTreeNode =
	| {
		kind: "folder";
		id: string;
		name: string;
		path: string;
		children: SheetTreeNode[];
	  }
	| {
		kind: "sheet";
		id: string;
		sheet: WorkspaceSheet;
	  };

interface VisibleTreeNode {
	node: SheetTreeNode;
	depth: number;
}

/** Extract filename from a path (last segment). */
function filename(path: string): string {
	return path.split("/").pop() ?? path;
}

const filteredSheets = computed(() => {
	const q = filterQuery.value.trim().toLowerCase();
	if (!q) return sheets.value;
	return sheets.value.filter((s) => s.path.toLowerCase().includes(q));
});

function ensureFolderExpanded(path: string) {
	if (!path || expandedFolders.value.has(path)) return;
	expandedFolders.value = new Set(expandedFolders.value).add(path);
}

function ensureExpandedParents(path: string) {
	const parts = path.split("/").slice(0, -1);
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		ensureFolderExpanded(current);
	}
}

watch(
	sheets,
	(nextSheets) => {
		for (const sheet of nextSheets) {
			ensureExpandedParents(sheet.path);
		}
	},
	{ immediate: true }
);

function buildTree(items: WorkspaceSheet[]): SheetTreeNode[] {
	const root: SheetTreeNode[] = [];

	function getOrCreateFolder(children: SheetTreeNode[], name: string, path: string) {
		const existing = children.find(
			(node): node is Extract<SheetTreeNode, { kind: "folder" }> =>
				node.kind === "folder" && node.path === path,
		);
		if (existing) return existing;
		const created: Extract<SheetTreeNode, { kind: "folder" }> = {
			kind: "folder",
			id: `folder:${path}`,
			name,
			path,
			children: [],
		};
		children.push(created);
		return created;
	}

	for (const sheet of items) {
		const parts = sheet.path.split("/");
		let children = root;
		let folderPath = "";
		for (const part of parts.slice(0, -1)) {
			folderPath = folderPath ? `${folderPath}/${part}` : part;
			const folder = getOrCreateFolder(children, part, folderPath);
			children = folder.children;
		}
		children.push({
			kind: "sheet",
			id: `sheet:${sheet.path}`,
			sheet,
		});
	}

	function sortNodes(nodes: SheetTreeNode[]): SheetTreeNode[] {
		nodes.sort((a, b) => {
			if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
			const aName = a.kind === "folder" ? a.name : filename(a.sheet.path);
			const bName = b.kind === "folder" ? b.name : filename(b.sheet.path);
			return aName.localeCompare(bName);
		});
		for (const node of nodes) {
			if (node.kind === "folder") {
				sortNodes(node.children);
			}
		}
		return nodes;
	}

	return sortNodes(root);
}

const sheetTree = computed(() => buildTree(filteredSheets.value));

function flattenVisibleTree(nodes: SheetTreeNode[], depth = 0): VisibleTreeNode[] {
	const visible: VisibleTreeNode[] = [];
	for (const node of nodes) {
		visible.push({ node, depth });
		if (node.kind === "folder" && isFolderExpanded(node.path)) {
			visible.push(...flattenVisibleTree(node.children, depth + 1));
		}
	}
	return visible;
}

const visibleTreeNodes = computed(() => flattenVisibleTree(sheetTree.value));

function isFolderExpanded(path: string): boolean {
	return expandedFolders.value.has(path);
}

function toggleFolder(path: string) {
	const next = new Set(expandedFolders.value);
	if (next.has(path)) {
		next.delete(path);
	} else {
		next.add(path);
	}
	expandedFolders.value = next;
}

async function handleOpen(path: string) {
	try {
		await openSheetByPath(path);
	} catch (e) {
		console.error(e);
		statusText.value = `Failed to open ${path}`;
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

async function handleLocateImage(sheet: WorkspaceSheet) {
	const selected = await api.showOpenDialog([
		{ name: "Images", extensions: ["png", "jpg", "gif", "webp"] },
	]);
	if (!selected) return;

	try {
		const dataUrl = await api.readImageAsDataUrl(selected);
		const img = new Image();
		img.src = dataUrl;
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error("Failed to load image"));
		});
		fulfillSheet(sheet, dataUrl, img.naturalWidth, img.naturalHeight);
	} catch (e) {
		console.error(e);
		statusText.value = "Failed to load image";
	}
}

function onSheetContextMenu(event: MouseEvent, sheet: (typeof sheets.value)[number]) {
	const entries: MenuEntry[] = [
		{
			label: "Open",
			action: () => handleOpen(sheet.path),
			disabled: currentSheet.value?.path === sheet.path,
		},
		...(sheet.status === "missing"
			? [{ label: "Locate image\u2026", action: () => handleLocateImage(sheet) }]
			: []),
		...(platform.value === "desktop" && sheet.status !== "missing"
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

</script>

<template>
	<div class="h-full flex flex-col gap-2 overflow-hidden bg-surface-1">
		<div class="flex flex-col gap-1.5 p-2 pb-0">
			<input v-model="filterQuery" type="search" placeholder="Filter sheets..." autocomplete="off" @contextmenu.stop />
		</div>
		<div class="instant-scroll flex flex-col gap-1 flex-1 overflow-y-auto min-h-0 px-2 pb-2">
			<template v-if="filterQuery.trim()">
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
						<span v-if="sheet.status === 'missing'" title="Image not found — click to locate" class="cursor-pointer hover:opacity-80" @click.stop="handleLocateImage(sheet)">&#9888;</span>
						{{ filename(sheet.path) }}
					</div>
					<div class="font-mono text-[10px] text-text-faint truncate mt-0.5">{{ sheet.path }}</div>
				</button>
			</template>
			<template v-else>
				<ul class="sheet-tree">
					<li v-for="{ node, depth } in visibleTreeNodes" :key="node.id" class="sheet-tree-node">
						<button
							v-if="node.kind === 'folder'"
							type="button"
							class="sheet-folder"
							:style="{ paddingLeft: `${8 + depth * 16}px` }"
							@click="toggleFolder(node.path)"
						>
							<span class="sheet-folder-chevron">{{ isFolderExpanded(node.path) ? "▼" : "▶" }}</span>
							<span class="sheet-folder-name">{{ node.name }}</span>
						</button>
						<button
							v-else
							type="button"
							class="sheet-leaf"
							:style="{ paddingLeft: `${28 + depth * 16}px` }"
							:class="[
								currentSheet?.path === node.sheet.path ? 'sheet-leaf-active' : '',
								node.sheet.status === 'missing' ? 'opacity-50' : '',
							]"
							@click="handleOpen(node.sheet.path)"
							@contextmenu.stop="onSheetContextMenu($event, node.sheet)"
						>
							<span v-if="node.sheet.status === 'missing'" title="Image not found — click to locate" class="cursor-pointer hover:opacity-80" @click.stop="handleLocateImage(node.sheet)">&#9888;</span>
							<span class="truncate">{{ filename(node.sheet.path) }}</span>
						</button>
					</li>
				</ul>
			</template>
		</div>
		<ContextMenu ref="ctxMenu" />
	</div>
</template>

<style scoped>
.sheet-tree {
	list-style: none;
	margin: 0;
	padding: 0;
}

.sheet-tree {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.sheet-tree-node {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.sheet-folder,
.sheet-leaf {
	width: 100%;
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 6px 8px;
	border: 1px solid transparent;
	border-radius: 4px;
	background: transparent;
	color: var(--color-text-dim);
	cursor: pointer;
	text-align: left;
	font-size: 12px;
}

.sheet-folder:hover,
.sheet-leaf:hover {
	background: var(--color-surface-2);
	border-color: var(--color-border);
	color: var(--color-text);
}

.sheet-folder-chevron {
	width: 10px;
	flex: 0 0 10px;
	font-size: 10px;
	color: var(--color-text-faint);
}

.sheet-folder-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sheet-leaf-active {
	background: var(--color-copper-glow);
	border-color: var(--color-copper);
	color: var(--color-copper-bright);
}
</style>
