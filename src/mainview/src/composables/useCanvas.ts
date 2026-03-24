import { ref, triggerRef } from "vue";
import type { Annotation } from "../annotation";
import { zoom, annotations, markDirty, activeSpec } from "../state";
import { ZOOM_MIN, ZOOM_MAX } from "../state";
import {
	getEntityByLabel,
	getShapesForEntity,
	getPrimaryShapeName,
} from "../spec/types";
import type { ShapeMapping } from "../spec/types";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export interface DragState {
	id: string;
	shapeName: string;
	mode: "move" | "resize" | "radius";
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startShapeData: Record<string, Record<string, number>>;
}

export function useCanvas() {
	const drag = ref<DragState | null>(null);

	function zoomTo(
		nextZoom: number,
		scroller: HTMLElement,
		stage: HTMLElement,
		clientX: number | null = null,
		clientY: number | null = null,
	) {
		const clamped = Math.round(clamp(nextZoom, ZOOM_MIN, ZOOM_MAX) * 10) / 10;
		if (clamped === zoom.value) return;

		const oldZoom = zoom.value;
		const scrollerRect = scroller.getBoundingClientRect();
		const stageRect = stage.getBoundingClientRect();
		const offsetX =
			clientX === null
				? scroller.clientWidth / 2
				: clientX - scrollerRect.left;
		const offsetY =
			clientY === null
				? scroller.clientHeight / 2
				: clientY - scrollerRect.top;
		const stageX =
			clientX === null
				? scroller.scrollLeft + offsetX
				: clientX - stageRect.left;
		const stageY =
			clientY === null
				? scroller.scrollTop + offsetY
				: clientY - stageRect.top;
		const worldX = stageX / oldZoom;
		const worldY = stageY / oldZoom;

		zoom.value = clamped;

		requestAnimationFrame(() => {
			scroller.scrollLeft = worldX * clamped - offsetX;
			scroller.scrollTop = worldY * clamped - offsetY;
		});
	}

	function startDrag(
		event: PointerEvent,
		annotation: Annotation,
		shapeName: string,
		mode: "move" | "resize" | "radius" = "move",
	) {
		// Snapshot all shapes' numeric data for group-move support
		const startShapeData: Record<string, Record<string, number>> = {};
		for (const [sName, sData] of Object.entries(annotation.shapes)) {
			const snapshot: Record<string, number> = {};
			for (const [key, value] of Object.entries(sData)) {
				if (typeof value === "number") {
					snapshot[key] = value;
				}
			}
			startShapeData[sName] = snapshot;
		}

		drag.value = {
			id: annotation.id,
			shapeName,
			mode,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startShapeData,
		};
	}

	function applyMoveDelta(
		shapeData: Record<string, number>,
		startData: Record<string, number>,
		mapping: ShapeMapping,
		deltaX: number,
		deltaY: number,
		imageWidth: number,
		imageHeight: number,
	) {
		switch (mapping.type) {
			case "rect": {
				const w = shapeData[mapping.width] as number;
				const h = shapeData[mapping.height] as number;
				shapeData[mapping.x] = clamp(
					Math.round(startData[mapping.x] + deltaX),
					0,
					imageWidth - w,
				);
				shapeData[mapping.y] = clamp(
					Math.round(startData[mapping.y] + deltaY),
					0,
					imageHeight - h,
				);
				break;
			}
			case "point": {
				shapeData[mapping.x] = clamp(
					Math.round(startData[mapping.x] + deltaX),
					0,
					imageWidth,
				);
				shapeData[mapping.y] = clamp(
					Math.round(startData[mapping.y] + deltaY),
					0,
					imageHeight,
				);
				break;
			}
			case "circle": {
				const r = shapeData[mapping.radius] as number;
				shapeData[mapping.x] = clamp(
					Math.round(startData[mapping.x] + deltaX),
					r,
					imageWidth - r,
				);
				shapeData[mapping.y] = clamp(
					Math.round(startData[mapping.y] + deltaY),
					r,
					imageHeight - r,
				);
				break;
			}
		}
	}

	function onPointerMove(
		event: PointerEvent,
		imageWidth: number,
		imageHeight: number,
	) {
		const d = drag.value;
		if (!d || d.pointerId !== event.pointerId) return;

		const spec = activeSpec.value;
		if (!spec) return;

		const ann = annotations.value.find((a) => a.id === d.id);
		if (!ann) return;

		const entity = getEntityByLabel(spec, ann.entityType);
		if (!entity) return;

		const shapeFields = getShapesForEntity(entity);
		const primaryName = getPrimaryShapeName(entity);
		const isPrimaryDrag = d.shapeName === primaryName;

		const deltaX = (event.clientX - d.startClientX) / zoom.value;
		const deltaY = (event.clientY - d.startClientY) / zoom.value;

		if (d.mode === "move") {
			if (isPrimaryDrag) {
				// Group move: apply delta to ALL shapes
				for (const sf of shapeFields) {
					const mapping = sf.mapping;
					if (!mapping) continue;
					const shapeData = ann.shapes[sf.name];
					const startData = d.startShapeData[sf.name];
					if (!shapeData || !startData) continue;
					applyMoveDelta(shapeData, startData, mapping, deltaX, deltaY, imageWidth, imageHeight);
				}
			} else {
				// Secondary shape: move only this shape
				const sf = shapeFields.find((s) => s.name === d.shapeName);
				if (!sf?.mapping) return;
				const shapeData = ann.shapes[d.shapeName];
				const startData = d.startShapeData[d.shapeName];
				if (!shapeData || !startData) return;
				applyMoveDelta(shapeData, startData, sf.mapping, deltaX, deltaY, imageWidth, imageHeight);
			}
		} else if (d.mode === "resize") {
			// Resize only applies to the specific shape being dragged
			const sf = shapeFields.find((s) => s.name === d.shapeName);
			if (!sf?.mapping || sf.mapping.type !== "rect") return;
			const mapping = sf.mapping;
			const shapeData = ann.shapes[d.shapeName];
			const startData = d.startShapeData[d.shapeName];
			if (!shapeData || !startData) return;

			const x = shapeData[mapping.x] as number;
			const y = shapeData[mapping.y] as number;
			shapeData[mapping.width] = clamp(
				Math.round(startData[mapping.width] + deltaX),
				1,
				imageWidth - x,
			);
			shapeData[mapping.height] = clamp(
				Math.round(startData[mapping.height] + deltaY),
				1,
				imageHeight - y,
			);
		} else if (d.mode === "radius") {
			// Radius drag only applies to the specific shape
			const sf = shapeFields.find((s) => s.name === d.shapeName);
			if (!sf?.mapping || sf.mapping.type !== "circle") return;
			const mapping = sf.mapping;
			const startData = d.startShapeData[d.shapeName];
			const shapeData = ann.shapes[d.shapeName];
			if (!shapeData || !startData) return;

			const cx = startData[mapping.x];
			const cy = startData[mapping.y];
			const stageEl = event.currentTarget as HTMLElement;
			const rect = stageEl.getBoundingClientRect();
			const pointerX = (event.clientX - rect.left) / zoom.value;
			const pointerY = (event.clientY - rect.top) / zoom.value;
			const dist = Math.sqrt((pointerX - cx) ** 2 + (pointerY - cy) ** 2);
			shapeData[mapping.radius] = Math.max(1, Math.round(dist));
		}

		markDirty(true);
		triggerRef(annotations);
	}

	function endDrag() {
		drag.value = null;
	}

	return { drag, zoomTo, startDrag, onPointerMove, endDrag };
}
