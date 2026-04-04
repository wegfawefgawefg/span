<script setup lang="ts">
import { computed, ref } from "vue";
import type { Annotation } from "../annotation";
import {
	annotations,
	selectedId,
	selectAnnotation,
	duplicateSelected,
	deleteSelected,
	activeSpec,
	reorderAnnotation,
} from "../state";
import { getEntityByLabel } from "../spec/types";
import ContextMenu from "./ContextMenu.vue";
import type { MenuEntry } from "./ContextMenu.vue";

const ctxMenu = ref<InstanceType<typeof ContextMenu> | null>(null);
const collapsed = ref<Set<string>>(new Set());

interface AnnotationGroup {
	key: string;
	name: string;
	entityType: string;
	items: Annotation[];
}

function getDisplayName(ann: Annotation): string {
	if (!activeSpec.value) return ann.id;
	const entity = getEntityByLabel(activeSpec.value, ann.entityType);
	if (!entity) return ann.id;
	const firstString = entity.properties.find(f => f.kind === "scalar" && f.type === "string");
	if (firstString) {
		const val = ann.properties[firstString.name];
		return typeof val === "string" && val ? val : ann.entityType;
	}
	return ann.entityType;
}

function groupKey(a: Annotation): string {
	if (!activeSpec.value) return a.entityType;
	const entity = getEntityByLabel(activeSpec.value, a.entityType);
	if (!entity) return a.entityType;
	const firstString = entity.properties.find(f => f.kind === "scalar" && f.type === "string");
	const nameVal = firstString ? (a.properties[firstString.name] ?? "") : "";
	return `${a.entityType}|${nameVal}`;
}

function isUnknownEntityType(ann: Annotation): boolean {
	if (!activeSpec.value) return false;
	return getEntityByLabel(activeSpec.value, ann.entityType) === undefined;
}

const groups = computed<AnnotationGroup[]>(() => {
	const map = new Map<string, AnnotationGroup>();
	for (const ann of annotations.value) {
		const key = groupKey(ann);
		let group = map.get(key);
		if (!group) {
			group = {
				key,
				name: getDisplayName(ann),
				entityType: ann.entityType,
				items: [],
			};
			map.set(key, group);
		}
		group.items.push(ann);
	}
	const result = Array.from(map.values());
	result.sort((a, b) => {
		const byType = a.entityType.localeCompare(b.entityType);
		return byType !== 0 ? byType : a.name.localeCompare(b.name);
	});
	// Items within each group preserve their order from the annotations array
	// (user can reorder via drag-and-drop)
	return result;
});

function toggleGroup(key: string) {
	if (collapsed.value.has(key)) {
		collapsed.value.delete(key);
	} else {
		collapsed.value.add(key);
	}
}

const dragId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);

function onDragStart(event: DragEvent, id: string) {
	dragId.value = id;
	event.dataTransfer!.effectAllowed = "move";
	event.dataTransfer!.setData("text/plain", id);
}

function onDragOver(event: DragEvent, id: string) {
	if (!dragId.value || dragId.value === id) return;
	event.preventDefault();
	event.dataTransfer!.dropEffect = "move";
	dragOverId.value = id;
}

function onDragLeave(_event: DragEvent, id: string) {
	if (dragOverId.value === id) dragOverId.value = null;
}

function onDrop(event: DragEvent, id: string) {
	event.preventDefault();
	if (dragId.value && dragId.value !== id) {
		reorderAnnotation(dragId.value, id);
	}
	dragId.value = null;
	dragOverId.value = null;
}

function onDragEnd() {
	dragId.value = null;
	dragOverId.value = null;
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
		<div class="instant-scroll flex flex-col gap-0.5 flex-1 overflow-y-auto min-h-0 px-2 py-2">
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
					<span class="text-xs font-medium truncate" :class="group.items.some(a => a.id === selectedId) ? 'text-copper-bright' : 'text-text-dim'">
						{{ group.name }}
					</span>
					<span class="text-[9px] text-text-faint bg-surface-0 px-1 rounded shrink-0">{{ group.entityType }}</span>
					<span class="text-[10px] font-mono text-text-faint ml-auto shrink-0">
						{{ group.items.length }}
					</span>
				</button>
				<div v-if="!collapsed.has(group.key)" class="flex flex-col gap-0.5 pl-4 mt-0.5">
					<button
						v-for="ann in group.items"
						:key="ann.id"
						type="button"
						draggable="true"
						class="w-full text-left px-2 py-1 border rounded-sm transition-colors cursor-grab active:cursor-grabbing"
						:class="[
							ann.id === selectedId
								? 'bg-copper-glow border-copper'
								: 'bg-surface-2 border-border hover:border-border-strong',
							dragOverId === ann.id ? 'border-copper border-t-2' : '',
							dragId === ann.id ? 'opacity-40' : '',
						]"
						@click="selectAnnotation(ann.id)"
						@contextmenu="onContextMenu($event, ann.id)"
						@dragstart="onDragStart($event, ann.id)"
						@dragover="onDragOver($event, ann.id)"
						@dragleave="onDragLeave($event, ann.id)"
						@drop="onDrop($event, ann.id)"
						@dragend="onDragEnd"
					>
						<div class="flex items-center gap-1">
							<span
								v-if="isUnknownEntityType(ann)"
								class="text-[9px] text-danger font-bold shrink-0"
								title="Unknown entity type"
							>!</span>
							<span class="font-mono text-[10px] truncate" :class="ann.id === selectedId ? 'text-copper-bright' : 'text-text-dim'">
								{{ ann.id.slice(0, 8) }}
							</span>
							<span class="text-[9px] text-text-faint bg-surface-0 px-1 rounded shrink-0 ml-auto">{{ ann.entityType }}</span>
						</div>
					</button>
				</div>
			</div>
		</div>
		<ContextMenu ref="ctxMenu" />
	</div>
</template>
