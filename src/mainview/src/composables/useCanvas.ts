import { ref, triggerRef } from "vue";
import type { Annotation } from "../annotation";
import { zoom, annotations, markDirty } from "../state";
import { ZOOM_MIN, ZOOM_MAX } from "../state";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export interface DragState {
	id: string;
	shapeName: string; // "aabb", "point", or a property shape name
	shapeIndex?: number; // for array shape properties
	mode: "move" | "resize";
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startAabb: { x: number; y: number; w: number; h: number } | null;
	startPoint: { x: number; y: number } | null;
	startPropertyValue: unknown;
}

export function useCanvas() {
	const drag = ref<DragState | null>(null);

	function normalizeZoom(nextZoom: number) {
		return Math.round(clamp(nextZoom, ZOOM_MIN, ZOOM_MAX) * 1000) / 1000;
	}

	function zoomTo(
		nextZoom: number,
		scroller: HTMLElement,
		stage: HTMLElement,
		clientX: number | null = null,
		clientY: number | null = null,
	) {
		const clamped = normalizeZoom(nextZoom);
		if (clamped === zoom.value) return;

		const oldZoom = zoom.value;
		const scrollerRect = scroller.getBoundingClientRect();
		const stageRect = stage.getBoundingClientRect();
		const stageContentX = stageRect.left - scrollerRect.left + scroller.scrollLeft;
		const stageContentY = stageRect.top - scrollerRect.top + scroller.scrollTop;
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
				? scroller.scrollLeft + offsetX - stageContentX
				: clientX - stageRect.left;
		const stageY =
			clientY === null
				? scroller.scrollTop + offsetY - stageContentY
				: clientY - stageRect.top;
		const worldX = stageX / oldZoom;
		const worldY = stageY / oldZoom;

		zoom.value = clamped;

		requestAnimationFrame(() => {
			const nextStageRect = stage.getBoundingClientRect();
			const nextStageContentX = nextStageRect.left - scrollerRect.left + scroller.scrollLeft;
			const nextStageContentY = nextStageRect.top - scrollerRect.top + scroller.scrollTop;
			scroller.scrollLeft = nextStageContentX + worldX * clamped - offsetX;
			scroller.scrollTop = nextStageContentY + worldY * clamped - offsetY;
		});
	}

	function startDrag(
		event: PointerEvent,
		annotation: Annotation,
		shapeName: string,
		mode: "move" | "resize" = "move",
		shapeIndex?: number,
	) {
		drag.value = {
			id: annotation.id,
			shapeName,
			shapeIndex,
			mode,
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startAabb: annotation.aabb ? { ...annotation.aabb } : null,
			startPoint: annotation.point ? { ...annotation.point } : null,
			startPropertyValue: shapeName !== "aabb" && shapeName !== "point"
				? JSON.parse(JSON.stringify(annotation.properties[shapeName]))
				: null,
		};
	}

	function onPointerMove(
		event: PointerEvent,
		imageWidth: number,
		imageHeight: number,
	) {
		const d = drag.value;
		if (!d || d.pointerId !== event.pointerId) return;

		const ann = annotations.value.find((a) => a.id === d.id);
		if (!ann) return;

		const deltaX = (event.clientX - d.startClientX) / zoom.value;
		const deltaY = (event.clientY - d.startClientY) / zoom.value;

		if (d.shapeName === "aabb" && ann.aabb && d.startAabb) {
			if (d.mode === "move") {
				const w = ann.aabb.w;
				const h = ann.aabb.h;
				ann.aabb.x = clamp(Math.round(d.startAabb.x + deltaX), 0, imageWidth - w);
				ann.aabb.y = clamp(Math.round(d.startAabb.y + deltaY), 0, imageHeight - h);
			} else if (d.mode === "resize") {
				const x = ann.aabb.x;
				const y = ann.aabb.y;
				ann.aabb.w = clamp(Math.round(d.startAabb.w + deltaX), 1, imageWidth - x);
				ann.aabb.h = clamp(Math.round(d.startAabb.h + deltaY), 1, imageHeight - y);
			}
		} else if (d.shapeName === "point" && ann.point && d.startPoint) {
			ann.point.x = clamp(Math.round(d.startPoint.x + deltaX), 0, imageWidth);
			ann.point.y = clamp(Math.round(d.startPoint.y + deltaY), 0, imageHeight);
		}
		// Property shape drag handling can be added later for the CRUD feature

		markDirty(true);
		triggerRef(annotations);
	}

	function endDrag() {
		drag.value = null;
	}

	return { drag, zoomTo, normalizeZoom, startDrag, onPointerMove, endDrag };
}
