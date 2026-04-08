<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  sheets,
  currentSheet,
  effectiveRoot,
  openSheetByPath,
  removeSheet,
  addSheet,
  fulfillSheet,
  statusText,
  markDirty,
} from '../state';
import type { WorkspaceSheet } from '../state';
import { api, platform } from '../platform/adapter';
import ContextMenu from './ContextMenu.vue';
import type { MenuEntry } from './ContextMenu.vue';

const filterQuery = ref('');
const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);
const expandedFolders = ref<Set<string>>(new Set());
const showCreateDialog = ref(false);
const showDeleteDialog = ref(false);
const newSheetName = ref('');
const newSheetWidth = ref('64');
const newSheetHeight = ref('64');
const pendingDeleteSheet = ref<WorkspaceSheet | null>(null);

type SheetTreeNode =
  | {
      kind: 'folder';
      id: string;
      name: string;
      path: string;
      children: SheetTreeNode[];
    }
  | {
      kind: 'sheet';
      id: string;
      sheet: WorkspaceSheet;
    };

interface VisibleTreeNode {
  node: SheetTreeNode;
  depth: number;
}

/** Extract filename from a path (last segment). */
function filename(path: string): string {
  return path.split('/').pop() ?? path;
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
  const parts = path.split('/').slice(0, -1);
  let current = '';
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

  function getOrCreateFolder(
    children: SheetTreeNode[],
    name: string,
    path: string
  ) {
    const existing = children.find(
      (node): node is Extract<SheetTreeNode, { kind: 'folder' }> =>
        node.kind === 'folder' && node.path === path
    );
    if (existing) return existing;
    const created: Extract<SheetTreeNode, { kind: 'folder' }> = {
      kind: 'folder',
      id: `folder:${path}`,
      name,
      path,
      children: [],
    };
    children.push(created);
    return created;
  }

  for (const sheet of items) {
    const parts = sheet.path.split('/');
    let children = root;
    let folderPath = '';
    for (const part of parts.slice(0, -1)) {
      folderPath = folderPath ? `${folderPath}/${part}` : part;
      const folder = getOrCreateFolder(children, part, folderPath);
      children = folder.children;
    }
    children.push({
      kind: 'sheet',
      id: `sheet:${sheet.path}`,
      sheet,
    });
  }

  function sortNodes(nodes: SheetTreeNode[]): SheetTreeNode[] {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      const aName = a.kind === 'folder' ? a.name : filename(a.sheet.path);
      const bName = b.kind === 'folder' ? b.name : filename(b.sheet.path);
      return aName.localeCompare(bName);
    });
    for (const node of nodes) {
      if (node.kind === 'folder') {
        sortNodes(node.children);
      }
    }
    return nodes;
  }

  return sortNodes(root);
}

const sheetTree = computed(() => buildTree(filteredSheets.value));

function flattenVisibleTree(
  nodes: SheetTreeNode[],
  depth = 0
): VisibleTreeNode[] {
  const visible: VisibleTreeNode[] = [];
  for (const node of nodes) {
    visible.push({ node, depth });
    if (node.kind === 'folder' && isFolderExpanded(node.path)) {
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

function parentFolder(path: string): string {
  const parts = path.split('/');
  parts.pop();
  return parts.join('/');
}

const targetFolder = computed(() => {
  if (currentSheet.value) return parentFolder(currentSheet.value.path);
  return '';
});

const targetFolderLabel = computed(() => targetFolder.value || '.');

function buildAbsoluteSheetPath(relativePath: string): string {
  const root = effectiveRoot.value;
  if (!root) return relativePath;
  return root.endsWith('/') ? `${root}${relativePath}` : `${root}/${relativePath}`;
}

function createBlankPngDataUrl(width: number, height: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create image canvas');
  ctx.clearRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}

function openCreateDialog() {
  const base = currentSheet.value
    ? filename(currentSheet.value.path).replace(/\.[^.]+$/, '')
    : 'sheet';
  newSheetName.value = `${base || 'sheet'}-new.png`;
  newSheetWidth.value = '64';
  newSheetHeight.value = '64';
  showCreateDialog.value = true;
}

function closeCreateDialog() {
  showCreateDialog.value = false;
}

function openDeleteDialog(sheet: WorkspaceSheet) {
  pendingDeleteSheet.value = sheet;
  showDeleteDialog.value = true;
}

function closeDeleteDialog() {
  showDeleteDialog.value = false;
  pendingDeleteSheet.value = null;
}

async function createSheet() {
  if (platform.value !== 'desktop' || !effectiveRoot.value) return;
  const trimmed = newSheetName.value.trim();
  if (!trimmed) {
    statusText.value = 'Enter a filename';
    return;
  }
  const fileName = /\.png$/i.test(trimmed) ? trimmed : `${trimmed}.png`;
  const width = Math.max(1, Math.round(Number(newSheetWidth.value) || 0));
  const height = Math.max(1, Math.round(Number(newSheetHeight.value) || 0));
  if (width < 1 || height < 1) {
    statusText.value = 'Width and height must be at least 1';
    return;
  }

  const relativePath = targetFolder.value ? `${targetFolder.value}/${fileName}` : fileName;
  const absolutePath = buildAbsoluteSheetPath(relativePath);

  try {
    const imageUrl = createBlankPngDataUrl(width, height);
    await api.writeImageDataUrl(absolutePath, imageUrl);
    ensureExpandedParents(relativePath);
    addSheet({
      path: relativePath,
      absolutePath,
      annotations: [],
      status: 'loaded',
      imageUrl,
      width,
      height,
    });
    markDirty(true);
    closeCreateDialog();
    await handleOpen(relativePath);
    statusText.value = `Created ${fileName}`;
  } catch (e) {
    console.error(e);
    statusText.value = 'Failed to create PNG';
  }
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
    if (
      !window.confirm(
        `"${filename(path)}" has annotations. Remove from workspace?`
      )
    ) {
      return;
    }
  }
  removeSheet(path);
}

async function handleDeleteSheet(sheet: WorkspaceSheet) {
  try {
    if (platform.value === 'desktop' && sheet.status !== 'missing') {
      await api.deleteFile(sheet.absolutePath);
    }
    removeSheet(sheet.path);
    markDirty(true);
    statusText.value = `Deleted ${filename(sheet.path)}`;
    closeDeleteDialog();
  } catch (e) {
    console.error(e);
    statusText.value = 'Failed to delete PNG';
  }
}

async function handleLocateImage(sheet: WorkspaceSheet) {
  const selected = await api.showOpenDialog([
    { name: 'Images', extensions: ['png', 'jpg', 'gif', 'webp'] },
  ]);
  if (!selected) return;

  try {
    const dataUrl = await api.readImageAsDataUrl(selected);
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
    });
    fulfillSheet(sheet, dataUrl, img.naturalWidth, img.naturalHeight);
  } catch (e) {
    console.error(e);
    statusText.value = 'Failed to load image';
  }
}

function onSheetContextMenu(
  event: MouseEvent,
  sheet: (typeof sheets.value)[number]
) {
  const entries: MenuEntry[] = [
    {
      label: 'Open',
      action: () => handleOpen(sheet.path),
      disabled: currentSheet.value?.path === sheet.path,
    },
    ...(sheet.status === 'missing'
      ? [
          {
            label: 'Locate image\u2026',
            action: () => handleLocateImage(sheet),
          },
        ]
      : []),
    ...(platform.value === 'desktop' && sheet.status !== 'missing'
      ? [
          {
            label: 'Reveal in Finder',
            action: () => api.revealFile(sheet.absolutePath),
          },
        ]
      : []),
    { separator: true },
    ...(platform.value === 'desktop'
      ? [{ label: 'Delete PNG', action: () => openDeleteDialog(sheet) }]
      : []),
    {
      label: 'Remove from workspace',
      action: () => handleRemove(sheet.path, sheet.annotations.length > 0),
    },
  ];
  ctxMenu.value?.show(event, entries);
}
</script>

<template>
  <div class="h-full flex flex-col gap-2 overflow-hidden bg-surface-1">
    <div class="flex flex-col gap-1.5 p-2 pb-0">
      <div
        v-if="platform === 'desktop' && effectiveRoot"
        class="grid grid-cols-2 gap-2"
      >
        <button
          type="button"
          class="sheet-action-button"
          @click="openCreateDialog()"
        >
          New PNG
        </button>
        <button
          type="button"
          class="sheet-action-button"
          :disabled="!currentSheet"
          @click="currentSheet && openDeleteDialog(currentSheet)"
        >
          Delete
        </button>
      </div>
      <input
        v-model="filterQuery"
        type="search"
        placeholder="Filter sheets..."
        autocomplete="off"
        @contextmenu.stop
      />
    </div>
    <div
      class="instant-scroll flex flex-col gap-1 flex-1 overflow-y-auto min-h-0 px-2 pb-2"
    >
      <template v-if="filterQuery.trim()">
        <button
          v-for="sheet in filteredSheets"
          :key="sheet.path"
          type="button"
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
          <div
            class="text-xs font-medium truncate flex items-center gap-1"
            :class="
              currentSheet?.path === sheet.path
                ? 'text-copper-bright'
                : 'text-text'
            "
          >
            <span
              v-if="sheet.status === 'missing'"
              title="Image not found — click to locate"
              class="cursor-pointer hover:opacity-80"
              @click.stop="handleLocateImage(sheet)"
              >&#9888;</span
            >
            {{ filename(sheet.path) }}
          </div>
          <div class="font-mono text-[10px] text-text-faint truncate mt-0.5">
            {{ sheet.path }}
          </div>
        </button>
      </template>
      <template v-else>
        <ul class="sheet-tree">
          <li
            v-for="{ node, depth } in visibleTreeNodes"
            :key="node.id"
            class="sheet-tree-node"
          >
            <button
              v-if="node.kind === 'folder'"
              type="button"
              class="sheet-folder"
              :style="{ paddingLeft: `${8 + depth * 16}px` }"
              @click="toggleFolder(node.path)"
            >
              <span class="sheet-folder-chevron">{{
                isFolderExpanded(node.path) ? '▼' : '▶'
              }}</span>
              <span class="sheet-folder-name">{{ node.name }}</span>
            </button>
            <button
              v-else
              type="button"
              class="sheet-leaf"
              :style="{ paddingLeft: `${28 + depth * 16}px` }"
              :class="[
                currentSheet?.path === node.sheet.path
                  ? 'sheet-leaf-active'
                  : '',
                node.sheet.status === 'missing' ? 'opacity-50' : '',
              ]"
              @click="handleOpen(node.sheet.path)"
              @contextmenu.stop="onSheetContextMenu($event, node.sheet)"
            >
              <span
                v-if="node.sheet.status === 'missing'"
                title="Image not found — click to locate"
                class="cursor-pointer hover:opacity-80"
                @click.stop="handleLocateImage(node.sheet)"
                >&#9888;</span
              >
              <span class="truncate">{{ filename(node.sheet.path) }}</span>
            </button>
          </li>
        </ul>
      </template>
    </div>
    <div v-if="showCreateDialog" class="sheet-modal-backdrop">
      <form class="sheet-modal-card" @submit.prevent="createSheet">
        <div class="sheet-modal-title">New PNG</div>
        <div class="sheet-modal-copy">
          <div>
            Folder: <span class="font-mono">{{ targetFolderLabel }}</span>
          </div>
          <div>Creates a transparent PNG in the current sheet folder.</div>
        </div>
        <label class="sheet-modal-field">
          <span>Name</span>
          <input
            v-model="newSheetName"
            type="text"
            placeholder="sheet.png"
            autofocus
          />
        </label>
        <div class="sheet-modal-grid">
          <label class="sheet-modal-field">
            <span>Width</span>
            <input v-model="newSheetWidth" type="number" min="1" step="1" />
          </label>
          <label class="sheet-modal-field">
            <span>Height</span>
            <input v-model="newSheetHeight" type="number" min="1" step="1" />
          </label>
        </div>
        <div class="sheet-modal-actions">
          <button
            type="button"
            class="sheet-action-button ghost"
            @click="closeCreateDialog()"
          >
            Cancel
          </button>
          <button type="submit" class="sheet-action-button primary">
            Create
          </button>
        </div>
      </form>
    </div>
    <div v-if="showDeleteDialog && pendingDeleteSheet" class="sheet-modal-backdrop">
      <div class="sheet-modal-card">
        <div class="sheet-modal-title">Delete PNG</div>
        <div class="sheet-modal-copy">
          <div>
            Delete
            <span class="font-mono">{{ filename(pendingDeleteSheet.path) }}</span>
            from disk?
          </div>
          <div v-if="pendingDeleteSheet.annotations.length > 0">
            This will also remove
            {{ pendingDeleteSheet.annotations.length }}
            annotation{{ pendingDeleteSheet.annotations.length === 1 ? '' : 's' }}
            from the workspace.
          </div>
          <div v-else>This only removes the file and sheet entry.</div>
        </div>
        <div class="sheet-modal-actions">
          <button
            type="button"
            class="sheet-action-button ghost"
            @click="closeDeleteDialog()"
          >
            Cancel
          </button>
          <button
            type="button"
            class="sheet-action-button danger"
            @click="handleDeleteSheet(pendingDeleteSheet)"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
    <ContextMenu ref="ctxMenu" />
  </div>
</template>

<style scoped>
.sheet-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: var(--color-surface-2);
  color: var(--color-text);
  font: inherit;
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s, color 0.15s;
}

.sheet-action-button:hover {
  border-color: var(--color-copper);
  color: var(--color-copper-bright);
  background: color-mix(
    in srgb,
    var(--color-surface-2) 82%,
    var(--color-copper-glow)
  );
}

.sheet-action-button:disabled {
  cursor: default;
  opacity: 0.45;
  color: var(--color-text-faint);
  border-color: var(--color-border);
  background: var(--color-surface-2);
}

.sheet-action-button.primary {
  border-color: color-mix(in srgb, var(--color-copper) 60%, var(--color-border));
  background: color-mix(
    in srgb,
    var(--color-copper-glow) 55%,
    var(--color-surface-1)
  );
  color: var(--color-copper-bright);
}

.sheet-action-button.danger {
  border-color: color-mix(in srgb, var(--color-danger) 60%, var(--color-border));
  background: color-mix(in srgb, var(--color-danger) 18%, var(--color-surface-1));
  color: #f0b0b0;
}

.sheet-action-button.danger:hover {
  border-color: var(--color-danger);
  color: #ffd1d1;
  background: color-mix(in srgb, var(--color-danger) 28%, var(--color-surface-1));
}

.sheet-action-button.ghost {
  background: transparent;
}

.sheet-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.58);
}

.sheet-modal-card {
  width: min(360px, 100%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 6px;
  background: var(--color-surface-1);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5);
}

.sheet-modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.sheet-modal-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--color-text-dim);
  font-size: 12px;
}

.sheet-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.sheet-modal-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--color-text-faint);
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sheet-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>

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
