<script setup lang="ts">
import { computed } from "vue";
import { annotations, selectedId, selectAnnotation } from "../state";

const sorted = computed(() =>
	[...annotations.value].sort((a, b) => {
		const nameDiff = a.name.localeCompare(b.name);
		if (nameDiff !== 0) return nameDiff;
		return a.frame - b.frame;
	}),
);
</script>

<template>
	<section class="panel">
		<div class="panel-header">
			<h2>Sprites In Sheet</h2>
			<span class="pill">{{ annotations.length }}</span>
		</div>
		<div class="annotation-list">
			<button
				v-for="annotation in sorted"
				:key="annotation.id"
				type="button"
				class="annotation-card"
				:class="{ selected: annotation.id === selectedId }"
				@click="selectAnnotation(annotation.id)"
			>
				<div class="annotation-name">{{ annotation.name }}</div>
				<div class="annotation-meta">
					frame {{ annotation.frame }} &bull; {{ annotation.x }},{{
						annotation.y
					}}
					&bull; {{ annotation.width }}x{{ annotation.height }}
				</div>
			</button>
		</div>
	</section>
</template>
