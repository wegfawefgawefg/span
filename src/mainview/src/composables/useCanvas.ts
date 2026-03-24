import { ref, triggerRef } from "vue";
import type { Annotation } from "../annotation";
import { zoom, annotations, markDirty, activeSpec } from "../state";
import { ZOOM_MIN, ZOOM_MAX } from "../state";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export interface DragState {
	id: string;
	mode: "move" | "resize" | "radius";
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startShapeData: Record<string, number>;
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
		mode: "move" | "resize" | "radius" = "move",
	) {
		// Snapshot only numeric shape data values
		const startShapeData: Record<string, number> = {};
		for (const [key, value] of Object.entries(annotation.shapeData)) {
			if (typeof value === "number") {
				startShapeData[key] = value;
			}
		}

		drag.value = {
			id: annotation.id,
			mode,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startShapeData,
		};
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

		const entity = spec.entities[ann.entityType];
		if (!entity) return;

		const mapping = entity.shape.mapping;
		if (!mapping) return;

		const deltaX = (event.clientX - d.startClientX) / zoom.value;
		const deltaY = (event.clientY - d.startClientY) / zoom.value;

		if (d.mode === "move") {
			// Move: offset x/y roles by delta
			switch (mapping.type) {
				case "rect": {
					const w = ann.shapeData[mapping.width] as number;
					const h = ann.shapeData[mapping.height] as number;
					ann.shapeData[mapping.x] = clamp(
						Math.round(d.startShapeData[mapping.x] + deltaX),
						0,
						imageWidth - w,
					);
					ann.shapeData[mapping.y] = clamp(
						Math.round(d.startShapeData[mapping.y] + deltaY),
						0,
						imageHeight - h,
					);
					break;
				}
				case "point": {
					ann.shapeData[mapping.x] = clamp(
						Math.round(d.startShapeData[mapping.x] + deltaX),
						0,
						imageWidth,
					);
					ann.shapeData[mapping.y] = clamp(
						Math.round(d.startShapeData[mapping.y] + deltaY),
						0,
						imageHeight,
					);
					break;
				}
				case "circle": {
					const r = ann.shapeData[mapping.radius] as number;
					ann.shapeData[mapping.x] = clamp(
						Math.round(d.startShapeData[mapping.x] + deltaX),
						r,
						imageWidth - r,
					);
					ann.shapeData[mapping.y] = clamp(
						Math.round(d.startShapeData[mapping.y] + deltaY),
						r,
						imageHeight - r,
					);
					break;
				}
			}
		} else if (d.mode === "resize") {
			// Resize: offset width/height roles by delta (rect only)
			if (mapping.type === "rect") {
				const x = ann.shapeData[mapping.x] as number;
				const y = ann.shapeData[mapping.y] as number;
				ann.shapeData[mapping.width] = clamp(
					Math.round(d.startShapeData[mapping.width] + deltaX),
					1,
					imageWidth - x,
				);
				ann.shapeData[mapping.height] = clamp(
					Math.round(d.startShapeData[mapping.height] + deltaY),
					1,
					imageHeight - y,
				);
			}
		} else if (d.mode === "radius") {
			// Radius: compute distance from center to pointer
			if (mapping.type === "circle") {
				const cx = d.startShapeData[mapping.x];
				const cy = d.startShapeData[mapping.y];
				// Convert pointer position to image coordinates
				const stageEl = event.currentTarget as HTMLElement;
				const rect = stageEl.getBoundingClientRect();
				const pointerX = (event.clientX - rect.left) / zoom.value;
				const pointerY = (event.clientY - rect.top) / zoom.value;
				const dist = Math.sqrt((pointerX - cx) ** 2 + (pointerY - cy) ** 2);
				ann.shapeData[mapping.radius] = Math.max(1, Math.round(dist));
			}
		}

		markDirty(true);
		triggerRef(annotations);
	}

	function endDrag() {
		drag.value = null;
	}

	return { drag, zoomTo, startDrag, onPointerMove, endDrag };
}
