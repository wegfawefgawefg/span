<script setup lang="ts">
import { activeSpec, activeTool } from "../state";
</script>

<template>
  <div class="tool-palette">
    <!-- Select tool — always visible -->
    <button
      type="button"
      class="tool-button"
      :class="{ active: activeTool === '' }"
      title="Select"
      @click="activeTool = ''"
    >
      <svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 3l10 7.5-6 1-3 5.5z" fill="currentColor" />
      </svg>
      <span class="tool-label">Select</span>
    </button>

    <!-- Entity tools — only when spec is loaded -->
    <template v-if="activeSpec">
      <button
        v-for="entity in activeSpec.entities"
        :key="entity.label"
        type="button"
        class="tool-button"
        :class="{ active: activeTool === entity.label }"
        :title="entity.label"
        @click="activeTool = entity.label"
      >
        <svg v-if="entity.primaryShape.kind === 'rect'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
        <svg v-else-if="entity.primaryShape.kind === 'point'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="10" cy="10" r="2" fill="currentColor" />
          <path d="M10 4v4M10 12v4M4 10h4M12 10h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <span class="tool-label">{{ entity.label }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.tool-palette {
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface-0);
  border-right: 1px solid var(--color-border);
  width: 40px;
  overflow: hidden;
}

.tool-button {
  width: 100%;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  cursor: pointer;
  color: var(--color-text-faint);
  transition: color 0.15s;
  border: none;
  background: transparent;
  padding: 0.25rem;
}

.tool-button:hover {
  color: var(--color-text-dim);
}

.tool-button.active {
  color: var(--color-copper-bright);
  background-color: var(--color-copper-glow);
}

.tool-label {
  font-size: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  line-height: 1.2;
}
</style>
