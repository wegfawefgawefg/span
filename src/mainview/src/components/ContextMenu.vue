<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from "vue";

export interface MenuItem {
	label: string;
	action: () => void;
	disabled?: boolean;
	separator?: false;
}

export interface MenuSeparator {
	separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

const visible = ref(false);
const x = ref(0);
const y = ref(0);
const items = ref<MenuEntry[]>([]);

function show(event: MouseEvent, entries: MenuEntry[]) {
	event.preventDefault();
	event.stopPropagation();
	items.value = entries;
	x.value = event.clientX;
	y.value = event.clientY;
	visible.value = true;

	// Clamp to viewport after render
	nextTick(() => {
		const el = document.querySelector(".ctx-menu") as HTMLElement;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		if (rect.right > window.innerWidth) {
			x.value = window.innerWidth - rect.width - 4;
		}
		if (rect.bottom > window.innerHeight) {
			y.value = window.innerHeight - rect.height - 4;
		}
	});
}

function hide() {
	visible.value = false;
}

function handleAction(entry: MenuEntry) {
	if ("separator" in entry && entry.separator) return;
	const item = entry as MenuItem;
	if (item.disabled) return;
	item.action();
	hide();
}

function onClickOutside(e: MouseEvent) {
	if (visible.value) {
		hide();
	}
}

onMounted(() => {
	window.addEventListener("pointerdown", onClickOutside, true);
});

onUnmounted(() => {
	window.removeEventListener("pointerdown", onClickOutside, true);
});

defineExpose({ show, hide });
</script>

<template>
	<Teleport to="body">
		<div
			v-if="visible"
			class="ctx-menu fixed z-[9999] min-w-[140px] py-1 bg-surface-2 border border-border rounded shadow-lg shadow-black/40"
			:style="{ left: x + 'px', top: y + 'px' }"
			@pointerdown.stop
			@contextmenu.prevent
		>
			<template v-for="(entry, i) in items" :key="i">
				<div
					v-if="'separator' in entry && entry.separator"
					class="my-1 border-t border-border"
				/>
				<button
					v-else
					type="button"
					class="w-full text-left px-3 py-1 text-xs transition-colors cursor-pointer bg-transparent"
					:class="
						(entry as MenuItem).disabled
							? 'text-text-faint cursor-default'
							: 'text-text hover:bg-copper-glow hover:text-copper-bright'
					"
					@click="handleAction(entry)"
				>
					{{ (entry as MenuItem).label }}
				</button>
			</template>
		</div>
	</Teleport>
</template>
