<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
	hasDirectoryPicker: boolean;
	externalError?: string;
}>();

const emit = defineEmits<{
	pickDirectory: [];
	openHandle: [handle: FileSystemDirectoryHandle];
	selectFiles: [files: FileList];
}>();

const error = ref("");
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

function onDrop(e: DragEvent) {
	dragging.value = false;
	error.value = "";
	e.preventDefault();

	// Try to get a directory handle (Chromium only)
	const items = e.dataTransfer?.items;
	if (items && items.length === 1) {
		const item = items[0];
		if ("getAsFileSystemHandle" in item) {
			(item as any)
				.getAsFileSystemHandle()
				.then((handle: FileSystemHandle) => {
					if (handle.kind === "directory") {
						emit("openHandle", handle as FileSystemDirectoryHandle);
					}
				})
				.catch(() => {
					error.value = "Could not read dropped folder";
				});
			return;
		}
	}

	// Fallback: read files from drop
	const files = e.dataTransfer?.files;
	if (files && files.length > 0) {
		emit("selectFiles", files);
	}
}

function onFileInputChange(e: Event) {
	error.value = "";
	const input = e.target as HTMLInputElement;
	if (input.files && input.files.length > 0) {
		emit("selectFiles", input.files);
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
				dragging
					? 'border-copper bg-copper-glow'
					: 'border-border bg-surface-1'
			"
		>
			<div>
				<h1 class="text-xl font-semibold text-text">Span</h1>
				<p class="text-sm text-text-dim mt-1">
					Spritesheet annotation tool
				</p>
			</div>

			<p class="text-xs text-text-faint">
				Open a project folder containing a <code class="text-text-dim">sheets/</code> directory with PNG spritesheets.
			</p>

			<button
				v-if="hasDirectoryPicker"
				type="button"
				class="px-5 py-2 bg-copper text-surface-0 font-medium text-sm rounded cursor-pointer hover:brightness-110 active:translate-y-px transition-all"
				@click="emit('pickDirectory')"
			>
				Open Folder
			</button>

			<template v-else>
				<button
					type="button"
					class="px-5 py-2 bg-copper text-surface-0 font-medium text-sm rounded cursor-pointer hover:brightness-110 active:translate-y-px transition-all"
					@click="fileInput?.click()"
				>
					Select Folder
				</button>
				<input
					ref="fileInput"
					type="file"
					webkitdirectory
					class="hidden"
					@change="onFileInputChange"
				/>
			</template>

			<p v-if="hasDirectoryPicker" class="text-[11px] text-text-faint">
				or drag and drop a folder here
			</p>

			<p v-if="error || externalError" class="text-xs text-danger">{{ error || externalError }}</p>
		</div>
	</div>
</template>
