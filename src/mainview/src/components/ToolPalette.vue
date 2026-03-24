<script setup lang="ts">
import { activeSpec, activeTool } from "../state";
</script>

<template>
  <div class="tool-palette">
    <button
      v-for="(entity, name) in activeSpec?.entities"
      :key="name"
      type="button"
      class="tool-button"
      :class="{ active: activeTool === name }"
      :title="name"
      @click="activeTool = name"
    >
      <svg v-if="entity.shape.type === 'rect'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="5" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
      <svg v-else-if="entity.shape.type === 'point'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="2" fill="currentColor" />
        <path d="M10 4v4M10 12v4M4 10h4M12 10h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <svg v-else-if="entity.shape.type === 'circle'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
      <svg v-else-if="entity.shape.type === 'polygon'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
        <polygon points="10,3 17,8 15,16 5,16 3,8" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
      <span class="tool-label">{{ name }}</span>
    </button>
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
