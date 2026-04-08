<script setup lang="ts">
import { computed, ref } from 'vue';
import { getMenus, type MenuSection, type MenuItem } from '../menus';

const props = defineProps<{
  isPanelOpen?: (panelId: string) => boolean;
  currentThemeId?: string;
}>();

const emit = defineEmits<{
  action: [action: string];
}>();

const menus = computed(() =>
  getMenus({
    isPanelOpen: props.isPanelOpen,
    currentThemeId: props.currentThemeId,
  })
);
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
    emit('action', item.action);
  }
  openMenu.value = null;
}

function closeMenus() {
  openMenu.value = null;
}

function formatShortcut(shortcut: string): string {
  return shortcut
    .replace('Cmd+', '\u2318')
    .replace('Shift+', '\u21E7')
    .replace('Alt+', '\u2325')
    .replace('Backspace', '\u232B');
}
</script>

<template>
  <div
    class="flex h-7 select-none items-center border-b border-border bg-surface-1 px-1 text-xs"
    @mouseleave="closeMenus"
  >
    <div
      v-for="section in menus"
      :key="section.label"
      class="relative"
    >
      <button
        type="button"
        class="rounded-[3px] border-0 bg-transparent px-2 py-0.5 text-text-faint"
        :class="
          openMenu === section.label
            ? 'bg-surface-2 text-text'
            : 'hover:bg-surface-2 hover:text-text'
        "
        @click="toggleMenu(section.label)"
        @mouseenter="hoverMenu(section.label)"
      >
        {{ section.label }}
      </button>
      <div
        v-if="openMenu === section.label"
        class="absolute left-0 top-full z-[1000] min-w-[200px] rounded border border-border bg-surface-2 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
      >
        <template v-for="(item, i) in section.items" :key="i">
          <div v-if="item.separator" class="mx-2 my-1 h-px bg-border" />
          <div v-else-if="item.children" class="group/submenu relative">
            <button
              type="button"
              class="group/menu-item flex w-full items-center border-0 bg-transparent px-3 py-1 text-left text-xs text-text hover:bg-copper-glow hover:text-copper-bright"
            >
              <span class="mr-2 w-3.5 shrink-0 text-center text-copper-bright"></span>
              <span class="flex-1">{{ item.label }}</span>
              <span
                class="ml-6 text-[11px] text-text-faint group-hover/menu-item:text-copper-bright group-hover/menu-item:opacity-70"
              >
                &#x25B8;
              </span>
            </button>
            <div
              class="absolute left-full top-[-4px] z-[1001] hidden min-w-[180px] rounded border border-border bg-surface-2 py-1 shadow-[0_4px_12px_rgba(0,0,0,0.3)] group-hover/submenu:block"
            >
              <template v-for="(child, j) in item.children" :key="j">
                <div v-if="child.separator" class="mx-2 my-1 h-px bg-border" />
                <button
                  v-else
                  type="button"
                  class="group/menu-item flex w-full items-center border-0 bg-transparent px-3 py-1 text-left text-xs text-text enabled:hover:bg-copper-glow enabled:hover:text-copper-bright disabled:cursor-default disabled:text-text-faint"
                  :disabled="child.disabled?.()"
                  @click="handleAction(child)"
                >
                  <span class="mr-2 w-3.5 shrink-0 text-center text-copper-bright">{{
                    child.checked ? '✓' : ''
                  }}</span>
                  <span class="flex-1">{{ child.label }}</span>
                  <span
                    v-if="child.shortcut"
                    class="ml-6 text-[11px] text-text-faint group-hover/menu-item:text-copper-bright group-hover/menu-item:opacity-70"
                  >{{
                    formatShortcut(child.shortcut)
                  }}</span>
                </button>
              </template>
            </div>
          </div>
          <button
            v-else
            type="button"
            class="group/menu-item flex w-full items-center border-0 bg-transparent px-3 py-1 text-left text-xs text-text enabled:hover:bg-copper-glow enabled:hover:text-copper-bright disabled:cursor-default disabled:text-text-faint"
            :disabled="item.disabled?.()"
            @click="handleAction(item)"
          >
            <span class="mr-2 w-3.5 shrink-0 text-center text-copper-bright">{{
              item.checked ? '✓' : ''
            }}</span>
            <span class="flex-1">{{ item.label }}</span>
            <span
              v-if="item.shortcut"
              class="ml-6 text-[11px] text-text-faint group-hover/menu-item:text-copper-bright group-hover/menu-item:opacity-70"
            >{{
              formatShortcut(item.shortcut)
            }}</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
