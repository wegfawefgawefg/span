<script setup lang="ts">
import { ref } from 'vue';
import { controlPrimaryButtonClass } from '../controlStyles';

defineProps<{
  externalError?: string;
}>();

const emit = defineEmits<{
  dropFiles: [files: File[]];
}>();

const error = ref('');
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function onDrop(e: DragEvent) {
  dragging.value = false;
  error.value = '';
  e.preventDefault();

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    emit('dropFiles', Array.from(files));
  }
}

function onFileInputChange(e: Event) {
  error.value = '';
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    emit('dropFiles', Array.from(input.files));
  }
}
</script>

<template>
  <div
    class="h-full flex items-center justify-center bg-surface-0"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop="onDrop"
  >
    <div
      class="flex flex-col items-center gap-6 p-10 rounded border max-w-md text-center transition-colors"
      :class="
        dragging ? 'border-copper bg-copper-glow' : 'border-border bg-surface-1'
      "
    >
      <div>
        <h1 class="text-xl font-semibold text-text">Span</h1>
        <p class="text-sm text-text-dim mt-1">Spritesheet annotation tool</p>
      </div>

      <p class="text-xs text-text-faint">
        Drop images, spec files, or a
        <code class="text-text-dim">.span</code> workspace file to get started.
      </p>

      <button
        type="button"
        :class="[controlPrimaryButtonClass, 'px-5 font-body text-sm']"
        @click="fileInput?.click()"
      >
        Select Files
      </button>
      <input
        ref="fileInput"
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.gif,.webp,.yaml,.yml,.json,.span"
        class="hidden"
        @change="onFileInputChange"
      />

      <p class="text-[11px] text-text-faint">or drag and drop files here</p>

      <p v-if="error || externalError" class="text-xs text-danger">
        {{ error || externalError }}
      </p>
    </div>
  </div>
</template>
