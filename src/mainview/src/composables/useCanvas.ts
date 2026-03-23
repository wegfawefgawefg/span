import { ref, triggerRef } from "vue";
import type { Annotation } from "../types";
import { zoom, annotations, markDirty } from "../state";
import { ZOOM_MIN, ZOOM_MAX } from "../state";

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export interface DragState {
	id: string;
	mode: "move" | "resize";
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startX: number;
	startY: number;
	startWidth: number;
	startHeight: number;
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
		const clamped = clamp(nextZoom, ZOOM_MIN, ZOOM_MAX);
		if (Math.abs(clamped - zoom.value) < 0.001) return;

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
		isResize: boolean,
	) {
		drag.value = {
			id: annotation.id,
			mode: isResize ? "resize" : "move",
			pointerId: event.pointerId,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startX: annotation.x,
			startY: annotation.y,
			startWidth: annotation.width,
			startHeight: annotation.height,
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

		if (d.mode === "move") {
			ann.x = clamp(
				Math.round(d.startX + deltaX),
				0,
				imageWidth - ann.width,
			);
			ann.y = clamp(
				Math.round(d.startY + deltaY),
				0,
				imageHeight - ann.height,
			);
		} else {
			ann.width = clamp(
				Math.round(d.startWidth + deltaX),
				1,
				imageWidth - ann.x,
			);
			ann.height = clamp(
				Math.round(d.startHeight + deltaY),
				1,
				imageHeight - ann.y,
			);
		}

		markDirty(true);
		triggerRef(annotations);
	}

	function endDrag() {
		drag.value = null;
	}

	return { drag, zoomTo, startDrag, onPointerMove, endDrag };
}
