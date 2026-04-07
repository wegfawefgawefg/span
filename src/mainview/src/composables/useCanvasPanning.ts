import { ref, type Ref, type ComputedRef } from 'vue';
import { zoom, persistCurrentCanvasViewport } from '../state';

export function useCanvasPanning(deps: {
  scroller: Ref<HTMLElement | null>;
  stageOffsetX: ComputedRef<number>;
  stageOffsetY: ComputedRef<number>;
  stageWidth: ComputedRef<number>;
  stageHeight: ComputedRef<number>;
}) {
  const { scroller, stageOffsetX, stageOffsetY, stageWidth, stageHeight } =
    deps;

  // --- Panning state ---
  const isPanning = ref(false);
  const spaceHeld = ref(false);
  let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };
  let hasCenteredCurrentSheet = false;

  // --- Viewport centering ---

  function centerViewportOnStage() {
    const el = scroller.value;
    if (!el) return;
    el.scrollLeft = Math.max(
      0,
      stageOffsetX.value - (el.clientWidth - stageWidth.value) / 2
    );
    el.scrollTop = Math.max(
      0,
      stageOffsetY.value - (el.clientHeight - stageHeight.value) / 2
    );
  }

  function alignViewportToImageOrigin() {
    const el = scroller.value;
    if (!el) return;
    el.scrollLeft = Math.max(0, stageOffsetX.value);
    el.scrollTop = Math.max(0, stageOffsetY.value);
  }

  function centerViewportOnImagePoint(centerX: number, centerY: number) {
    const el = scroller.value;
    if (!el) return;
    el.scrollLeft = Math.max(
      0,
      stageOffsetX.value + centerX * zoom.value - el.clientWidth / 2
    );
    el.scrollTop = Math.max(
      0,
      stageOffsetY.value + centerY * zoom.value - el.clientHeight / 2
    );
  }

  // --- Pointer handlers for panning ---

  function handleScrollerPointerDown(event: PointerEvent) {
    // MMB (button 1) always pans
    // Space+LMB pans
    const isMMB = event.button === 1;
    const isSpaceLMB = spaceHeld.value && event.button === 0;

    if (!isMMB && !isSpaceLMB) return;

    event.preventDefault();
    event.stopPropagation();
    isPanning.value = true;

    const el = scroller.value!;
    panStart = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };

    el.setPointerCapture(event.pointerId);
  }

  function handleScrollerPointerMove(event: PointerEvent) {
    if (!isPanning.value) return;
    const el = scroller.value!;
    el.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
    el.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
  }

  function handleScrollerPointerUp(event: PointerEvent) {
    if (!isPanning.value) return;
    isPanning.value = false;
    scroller.value?.releasePointerCapture(event.pointerId);
  }

  function handleScrollerScroll() {
    if (!hasCenteredCurrentSheet) return;
    persistCurrentCanvasViewport();
  }

  // --- Centered-sheet tracking ---

  function markCentered() {
    hasCenteredCurrentSheet = true;
  }

  function resetCentered() {
    hasCenteredCurrentSheet = false;
  }

  return {
    isPanning,
    spaceHeld,
    centerViewportOnStage,
    alignViewportToImageOrigin,
    centerViewportOnImagePoint,
    handleScrollerPointerDown,
    handleScrollerPointerMove,
    handleScrollerPointerUp,
    handleScrollerScroll,
    markCentered,
    resetCentered,
  };
}
