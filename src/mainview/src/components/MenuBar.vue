<script setup lang="ts">
import { computed, ref } from "vue";
import { getMenus, type MenuSection, type MenuItem } from "../menus";

const props = defineProps<{
	isPanelOpen?: (panelId: string) => boolean;
}>();

const emit = defineEmits<{
	action: [action: string];
}>();

const menus = computed(() => getMenus({ isPanelOpen: props.isPanelOpen }));
const openMenu = ref<string | null>(null);

function toggleMenu(label: string) {
	openMenu.value = openMenu.value === label ? null : label;
}

function hoverMenu(label: string) {
	if (openMenu.value !== null) {
		openMenu.value = label;
	}
}

function handleAction(item: MenuItem) {
	if (item.separator || item.disabled?.()) return;
	if (item.action) {
		emit("action", item.action);
	}
	openMenu.value = null;
}

function closeMenus() {
	openMenu.value = null;
}

function formatShortcut(shortcut: string): string {
	return shortcut
		.replace("Cmd+", "\u2318")
		.replace("Shift+", "\u21E7")
		.replace("Alt+", "\u2325")
		.replace("Backspace", "\u232B");
}
</script>

<template>
	<div class="menubar" @mouseleave="closeMenus">
		<div v-for="section in menus" :key="section.label" class="menu-trigger-wrapper">
			<button
				type="button"
				class="menu-trigger"
				:class="{ active: openMenu === section.label }"
				@click="toggleMenu(section.label)"
				@mouseenter="hoverMenu(section.label)"
			>
				{{ section.label }}
			</button>
			<div v-if="openMenu === section.label" class="menu-dropdown">
				<template v-for="(item, i) in section.items" :key="i">
					<div v-if="item.separator" class="menu-separator" />
					<button
						v-else
						type="button"
						class="menu-item"
						:disabled="item.disabled?.()"
						@click="handleAction(item)"
					>
						<span class="menu-item-check">{{ item.checked ? "✓" : "" }}</span>
						<span class="menu-item-label">{{ item.label }}</span>
						<span v-if="item.shortcut" class="menu-item-shortcut">{{ formatShortcut(item.shortcut) }}</span>
					</button>
				</template>
			</div>
		</div>
	</div>
</template>

<style scoped>
.menubar {
	display: flex;
	align-items: center;
	height: 28px;
	padding: 0 4px;
	background: var(--color-surface-1);
	border-bottom: 1px solid var(--color-border);
	font-size: 12px;
	user-select: none;
	-webkit-user-select: none;
}

.menu-trigger-wrapper {
	position: relative;
}

.menu-trigger {
	padding: 2px 8px;
	border: none;
	background: none;
	color: var(--color-text-faint);
	font-size: 12px;
	cursor: pointer;
	border-radius: 3px;
}

.menu-trigger:hover,
.menu-trigger.active {
	background: var(--color-surface-2);
	color: var(--color-text);
}

.menu-dropdown {
	position: absolute;
	top: 100%;
	left: 0;
	min-width: 200px;
	padding: 4px 0;
	background: var(--color-surface-2);
	border: 1px solid var(--color-border);
	border-radius: 4px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	z-index: 1000;
}

.menu-item {
	display: flex;
	align-items: center;
	width: 100%;
	padding: 4px 12px;
	border: none;
	background: none;
	color: var(--color-text);
	font-size: 12px;
	cursor: pointer;
	text-align: left;
}

.menu-item-check {
	width: 14px;
	margin-right: 8px;
	color: var(--color-copper-bright);
	flex-shrink: 0;
	text-align: center;
}

.menu-item-label {
	flex: 1;
}

.menu-item:hover:not(:disabled) {
	background: var(--color-copper-glow);
	color: var(--color-copper-bright);
}

.menu-item:disabled {
	color: var(--color-text-faint);
	cursor: default;
}

.menu-item-shortcut {
	margin-left: 24px;
	color: var(--color-text-faint);
	font-size: 11px;
}

.menu-item:hover:not(:disabled) .menu-item-shortcut {
	color: var(--color-copper-bright);
	opacity: 0.7;
}

.menu-separator {
	height: 1px;
	margin: 4px 8px;
	background: var(--color-border);
}
</style>
