<script setup lang="ts">
import {
	activeSpec,
	activeTool,
	activePaintTool,
	activeAtlasTool,
	setEntityTool,
	setPaintTool,
	setAtlasTool,
	setSelectTool,
} from "../state";

interface PaintToolDef {
	id: "marquee" | "pencil" | "erase" | "eyedropper";
	label: string;
}

const paintTools: PaintToolDef[] = [
	{ id: "marquee", label: "Marquee" },
	{ id: "pencil", label: "Pencil" },
	{ id: "erase", label: "Erase" },
	{ id: "eyedropper", label: "Pick" },
];
</script>

<template>
	<div class="tool-palette">
		<button
			type="button"
			class="tool-button"
			:class="{ active: activeTool === '' && activePaintTool === '' && activeAtlasTool === '' }"
			title="Select"
			@click="setSelectTool()"
		>
			<svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M5 3l10 7.5-6 1-3 5.5z" fill="currentColor" />
			</svg>
			<span class="tool-label">Select</span>
		</button>

		<template v-if="activeSpec">
			<button
				v-for="entity in activeSpec.entities"
				:key="entity.label"
				type="button"
				class="tool-button"
				:class="{ active: activeTool === entity.label }"
				:title="entity.label"
				@click="setEntityTool(entity.label)"
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

		<div class="tool-divider"></div>

		<button
			type="button"
			class="tool-button"
			:class="{ active: activeAtlasTool === 'sprite-move' }"
			title="Move Sprites"
			@click="setAtlasTool('sprite-move')"
		>
			<svg viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M10 2l2.5 2.5H11v3h3V5.5L16.5 8 10 14.5 3.5 8 6 5.5v2h3v-3H7.5L10 2z" fill="currentColor"/>
				<path d="M10 14v4M6 18h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
			</svg>
			<span class="tool-label">Move</span>
		</button>

		<div class="tool-divider"></div>

		<button
			v-for="tool in paintTools"
			:key="tool.id"
			type="button"
			class="tool-button"
			:class="{ active: activePaintTool === tool.id }"
			:title="tool.label"
			@click="setPaintTool(tool.id)"
		>
			<svg v-if="tool.id === 'marquee'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
				<rect x="4" y="4" width="4" height="4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
				<rect x="12" y="4" width="4" height="4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
				<rect x="4" y="12" width="4" height="4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
				<rect x="12" y="12" width="4" height="4" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
			</svg>
			<svg v-else-if="tool.id === 'pencil'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M4 14.5V16h1.5L14.8 6.7l-1.5-1.5L4 14.5z" fill="currentColor"/>
				<path d="M12.7 3.8l1.5-1.5 2.1 2.1-1.5 1.5z" fill="currentColor"/>
			</svg>
			<svg v-else-if="tool.id === 'erase'" viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M6 13l5.8-7 4.2 4.2L10.2 17H6.5L4 14.5 6 13z" fill="currentColor"/>
				<path d="M10.5 17H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
			</svg>
			<svg v-else viewBox="0 0 20 20" class="w-4 h-4" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M14 4a2 2 0 0 0-2.8 0L9.7 5.5 8 3.8 3.8 8 5.5 9.7 4 11.2V14h2.8l1.5-1.5 1.7 1.7 4.2-4.2-1.7-1.7L14 6.8A2 2 0 0 0 14 4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
			</svg>
			<span class="tool-label">{{ tool.label }}</span>
		</button>
	</div>
</template>

<style scoped>
.tool-palette {
	display: flex;
	flex-direction: column;
	background-color: var(--color-surface-0);
	border-right: 1px solid var(--color-border);
	width: 44px;
	overflow-y: auto;
	overflow-x: hidden;
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
	transition: color 0.15s, background-color 0.15s;
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

.tool-divider {
	height: 1px;
	background: var(--color-border);
	margin: 2px 6px;
}
</style>
