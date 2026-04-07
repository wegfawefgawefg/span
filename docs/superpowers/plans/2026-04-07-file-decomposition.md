# File Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split CanvasView.vue (2,278 lines), state.ts (1,742 lines), and style.css (1,232 lines) into smaller, single-responsibility modules without changing behavior.

**Architecture:** Extract composables from CanvasView.vue, domain modules from state.ts, and themed CSS files from style.css. All imports updated to point directly at new modules (no barrel re-exports) for tree-shaking. Execution order: composables first, then state modules, then CSS.

**Tech Stack:** Vue 3 + TypeScript, CSS with Tailwind

---

## File Structure

### New files to create:

**Composables** (in `src/mainview/src/composables/`):
- `useCanvasPanning.ts` — panning, viewport centering, scroll handling
- `useCanvasPaint.ts` — paint/erase strokes, color sampling, palette rebuild
- `usePixelSelection.ts` — marquee selection, floating selection, clipboard, nudge
- `useAnnotationDrawing.ts` — draw new rect/point annotations, commit, hit-test
- `useSpriteMove.ts` — multi-sprite selection/drag, atlas selection drag
- `useCanvasRendering.ts` — checkerboard, display canvas rendering, grid lines

**Components** (in `src/mainview/src/components/`):
- `CanvasToolbar.vue` — zoom, grid, checker controls extracted from CanvasView template

**State modules** (in `src/mainview/src/state/`):
- `toolState.ts` — tool switching refs and functions
- `paletteState.ts` — paint/project palette management
- `paintHistory.ts` — undo/redo stacks, snapshot capture/apply
- `specState.ts` — spec loading, validation, file watching
- `canvasPrefs.ts` — per-sheet canvas preferences persistence
- `ioState.ts` — import/export/save/open workspace operations

**CSS** (in `src/mainview/src/styles/`):
- `tokens.css` — Tailwind import, @theme block, font-face
- `base.css` — universal resets, body, scrollbars, form elements
- `app-shell.css` — .app-shell, .app-modal-*, .dockview-container
- `dockview.css` — .dv-theme-base shared variables
- `themes/whisper.css`, `themes/frost.css`, `themes/ember.css`, `themes/daylight.css`, `themes/aseprite.css`, `themes/gamemaker.css`
- `canvas.css` — canvas shell, scroller, workspace, toolbar, rendering layers
- `annotations.css` — shape colors, annotation types, handles, previews, animations, reduced-motion
- `gallery.css` — gallery zoom slider, preview tiles

### Files to modify:
- `src/mainview/src/components/CanvasView.vue` — gut script, keep template + orchestration
- `src/mainview/src/state.ts` — extract domain logic, keep core refs + annotation CRUD
- `src/mainview/src/style.css` — replace contents with imports

### Import updates needed:
- `App.vue` — imports from `./state` → split across `./state`, `./state/toolState`, `./state/paletteState`, `./state/paintHistory`, `./state/specState`, `./state/ioState`
- `composables/useCanvas.ts` — no changes needed (imports `zoom`, `annotations`, `markDirty`, `ZOOM_MIN`, `ZOOM_MAX` — all stay in state.ts)
- `ColorPicker.vue` — `activeEyedropper` stays in state.ts, no change
- `PaintPanel.vue` — split imports across `state`, `state/toolState`, `state/paletteState`, `state/paintHistory`, `state/ioState`
- `GalleryPanel.vue` — no change (imports stay in state.ts)
- `DynamicInspector.vue` — no change (imports stay in state.ts)
- `SheetSidebar.vue` — `fulfillSheet` stays in state.ts, `statusText` stays, no change
- `SpecEditor.vue` — `activeSpecRaw`, `applySpecFromEditor`, `forceApplySpec`, `specFilePath` → `../state/specState`
- `AnnotationList.vue` — no change (imports stay in state.ts)
- `ToolPalette.vue` — `setEntityTool`, `setPaintTool`, `setAtlasTool`, `setSelectTool` → `../state/toolState`; `activeSpec` stays in state.ts
- `Inspector.vue` — no change
- `ShapeCanvas.vue` — no change

---

## Task 1: Extract `useCanvasPanning` composable

**Files:**
- Create: `src/mainview/src/composables/useCanvasPanning.ts`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Create `useCanvasPanning.ts`**

```ts
import { ref, type Ref } from 'vue';
import { zoom, persistCurrentCanvasViewport } from '../state';

interface PanStart {
  x: number;
  y: number;
  scrollLeft: number;
  scrollTop: number;
}

export function useCanvasPanning(
  scroller: Ref<HTMLElement | null>,
  stage: Ref<HTMLElement | null>,
  stageOffsetX: Ref<number>,
  stageOffsetY: Ref<number>,
  stageWidth: Ref<number>,
  stageHeight: Ref<number>,
) {
  const isPanning = ref(false);
  const spaceHeld = ref(false);
  let panStart: PanStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };
  let hasCenteredCurrentSheet = false;

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

  function handleScrollerPointerDown(event: PointerEvent) {
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
```

- [ ] **Step 2: Update CanvasView.vue to use `useCanvasPanning`**

Replace the panning-related code in CanvasView.vue (lines 190-196, 215-246, 549-588) with:

```ts
import { useCanvasPanning } from '../composables/useCanvasPanning';

const {
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
} = useCanvasPanning(scroller, stage, stageOffsetX, stageOffsetY, stageWidth, stageHeight);
```

Remove the extracted functions and state from CanvasView. Replace `hasCenteredCurrentSheet = true` with `markCentered()` and `hasCenteredCurrentSheet = false` with `resetCentered()`.

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/composables/useCanvasPanning.ts src/mainview/src/components/CanvasView.vue
git commit -m "refactor: extract useCanvasPanning composable from CanvasView"
```

---

## Task 2: Extract `useCanvasRendering` composable

**Files:**
- Create: `src/mainview/src/composables/useCanvasRendering.ts`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Create `useCanvasRendering.ts`**

```ts
import { type Ref } from 'vue';
import {
  canvasGridEnabled,
  canvasGridWidth,
  canvasGridHeight,
  canvasCheckerStrength,
} from '../state';

export function useCanvasRendering(
  displayCanvas: Ref<HTMLCanvasElement | null>,
  sampleCanvas: HTMLCanvasElement,
  checkerCanvas: HTMLCanvasElement,
  floatingSelectionCanvas: HTMLCanvasElement,
  stageWidth: Ref<number>,
  stageHeight: Ref<number>,
  pixelSelectionMove: Ref<{ currentRect: { x: number; y: number; w: number; h: number } } | null>,
  spriteMove: Ref<{
    items: Array<{
      sourceRect: { x: number; y: number; w: number; h: number };
      currentRect: { x: number; y: number; w: number; h: number };
      canvas: HTMLCanvasElement;
    }>;
  } | null>,
) {
  function rebuildCheckerboardSource(width: number, height: number) {
    checkerCanvas.width = width;
    checkerCanvas.height = height;

    const checkerCtx = checkerCanvas.getContext('2d');
    if (!checkerCtx) return;

    const imageData = checkerCtx.createImageData(width, height);
    const data = imageData.data;
    const strength =
      Math.max(0, Math.min(100, canvasCheckerStrength.value)) / 100;
    const darkSquare = [
      Math.round(17 + strength * 16),
      Math.round(20 + strength * 18),
      Math.round(25 + strength * 21),
    ];
    const lightSquare = [
      Math.round(17 + strength * 70),
      Math.round(20 + strength * 76),
      Math.round(25 + strength * 82),
    ];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const isLight = (x + y) % 2 === 0;
        const offset = (y * width + x) * 4;
        if (isLight) {
          data[offset] = lightSquare[0];
          data[offset + 1] = lightSquare[1];
          data[offset + 2] = lightSquare[2];
          data[offset + 3] = 255;
        } else {
          data[offset] = darkSquare[0];
          data[offset + 1] = darkSquare[1];
          data[offset + 2] = darkSquare[2];
          data[offset + 3] = 255;
        }
      }
    }

    checkerCtx.putImageData(imageData, 0, 0);
  }

  function drawGridLines(
    ctx: CanvasRenderingContext2D,
    backingWidth: number,
    backingHeight: number
  ) {
    if (!canvasGridEnabled.value || !sampleCanvas.width || !sampleCanvas.height)
      return;

    const cellWidth = Math.max(1, Math.round(canvasGridWidth.value || 1));
    const cellHeight = Math.max(1, Math.round(canvasGridHeight.value || 1));
    const scaleX = backingWidth / sampleCanvas.width;
    const scaleY = backingHeight / sampleCanvas.height;

    ctx.fillStyle = 'rgba(232, 226, 212, 0.18)';

    let lastX = -1;
    for (let x = cellWidth; x < sampleCanvas.width; x += cellWidth) {
      const px = Math.round(x * scaleX);
      if (px <= 0 || px >= backingWidth || px === lastX) continue;
      ctx.fillRect(px, 0, 1, backingHeight);
      lastX = px;
    }

    let lastY = -1;
    for (let y = cellHeight; y < sampleCanvas.height; y += cellHeight) {
      const py = Math.round(y * scaleY);
      if (py <= 0 || py >= backingHeight || py === lastY) continue;
      ctx.fillRect(0, py, backingWidth, 1);
      lastY = py;
    }
  }

  function renderDisplayCanvas() {
    const canvas = displayCanvas.value;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.max(1, stageWidth.value);
    const displayHeight = Math.max(1, stageHeight.value);
    const backingWidth = Math.max(1, Math.round(displayWidth * dpr));
    const backingHeight = Math.max(1, Math.round(displayHeight * dpr));

    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, backingWidth, backingHeight);

    if (!sampleCanvas.width || !sampleCanvas.height) return;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(checkerCanvas, 0, 0, backingWidth, backingHeight);
    ctx.drawImage(sampleCanvas, 0, 0, backingWidth, backingHeight);

    const movingSprite = spriteMove.value;
    if (movingSprite) {
      const scaleX = backingWidth / sampleCanvas.width;
      const scaleY = backingHeight / sampleCanvas.height;
      for (const item of movingSprite.items) {
        ctx.drawImage(
          checkerCanvas,
          item.sourceRect.x,
          item.sourceRect.y,
          item.sourceRect.w,
          item.sourceRect.h,
          item.sourceRect.x * scaleX,
          item.sourceRect.y * scaleY,
          item.sourceRect.w * scaleX,
          item.sourceRect.h * scaleY
        );
      }
    }
    drawGridLines(ctx, backingWidth, backingHeight);

    const moving = pixelSelectionMove.value;
    if (
      moving &&
      floatingSelectionCanvas.width &&
      floatingSelectionCanvas.height
    ) {
      const scaleX = backingWidth / sampleCanvas.width;
      const scaleY = backingHeight / sampleCanvas.height;
      ctx.drawImage(
        floatingSelectionCanvas,
        0,
        0,
        floatingSelectionCanvas.width,
        floatingSelectionCanvas.height,
        moving.currentRect.x * scaleX,
        moving.currentRect.y * scaleY,
        moving.currentRect.w * scaleX,
        moving.currentRect.h * scaleY
      );
    }

    if (movingSprite) {
      const scaleX = backingWidth / sampleCanvas.width;
      const scaleY = backingHeight / sampleCanvas.height;
      for (const item of movingSprite.items) {
        ctx.drawImage(
          item.canvas,
          0,
          0,
          item.canvas.width,
          item.canvas.height,
          item.currentRect.x * scaleX,
          item.currentRect.y * scaleY,
          item.currentRect.w * scaleX,
          item.currentRect.h * scaleY
        );
      }
    }
  }

  return {
    rebuildCheckerboardSource,
    drawGridLines,
    renderDisplayCanvas,
  };
}
```

- [ ] **Step 2: Update CanvasView.vue**

Replace the rendering functions (lines 258-461) with the composable call. Wire it up after the existing refs are defined:

```ts
import { useCanvasRendering } from '../composables/useCanvasRendering';

const { rebuildCheckerboardSource, renderDisplayCanvas } = useCanvasRendering(
  displayCanvas,
  sampleCanvas,
  checkerCanvas,
  floatingSelectionCanvas,
  stageWidth,
  stageHeight,
  pixelSelectionMove,
  spriteMove,
);
```

Remove the extracted functions from CanvasView.

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/composables/useCanvasRendering.ts src/mainview/src/components/CanvasView.vue
git commit -m "refactor: extract useCanvasRendering composable from CanvasView"
```

---

## Task 3: Extract `useCanvasPaint` composable

**Files:**
- Create: `src/mainview/src/composables/useCanvasPaint.ts`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Create `useCanvasPaint.ts`**

This composable encapsulates paint stroke logic, color sampling, palette rebuilding, and commit operations. It receives the shared canvases and rendering function as parameters.

```ts
import { ref, type Ref } from 'vue';
import {
  zoom,
  currentSheet,
  activePaintColor,
  paintToolSize,
  applyPaintedSheetImage,
  recordPaintUndoSnapshot,
  statusText,
  setPaintPalette,
} from '../state';

interface PaintStrokeState {
  lastX: number;
  lastY: number;
}

export function useCanvasPaint(
  stage: Ref<HTMLElement | null>,
  sampleCanvas: HTMLCanvasElement,
  sampleCtx: CanvasRenderingContext2D,
  imageWidth: Ref<number>,
  imageHeight: Ref<number>,
  renderDisplayCanvas: () => void,
) {
  const paintStroke = ref<PaintStrokeState | null>(null);

  function samplePixelAt(clientX: number, clientY: number): string | null {
    const stageEl = stage.value;
    if (!stageEl || !sampleCanvas.width) return null;
    const rect = stageEl.getBoundingClientRect();
    const imgX = Math.floor((clientX - rect.left) / zoom.value);
    const imgY = Math.floor((clientY - rect.top) / zoom.value);
    if (
      imgX < 0 ||
      imgY < 0 ||
      imgX >= imageWidth.value ||
      imgY >= imageHeight.value
    )
      return null;
    const pixel = sampleCtx.getImageData(imgX, imgY, 1, 1).data;
    const hex =
      '#' +
      [pixel[0], pixel[1], pixel[2]]
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('');
    return hex;
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = hex.trim().toLowerCase();
    const match = normalized.match(/^#?([0-9a-f]{6})$/i);
    if (!match) return null;
    const value = match[1];
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  function stampPaintPixel(x: number, y: number, erase: boolean) {
    if (!sampleCanvas.width || !sampleCanvas.height) return;
    const half = Math.floor(
      Math.max(1, Math.round(paintToolSize.value || 1)) / 2
    );
    const size = Math.max(1, Math.round(paintToolSize.value || 1));
    if (erase) {
      sampleCtx.clearRect(x - half, y - half, size, size);
      return;
    }
    const rgb = hexToRgb(activePaintColor.value);
    if (!rgb) return;
    sampleCtx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
    sampleCtx.fillRect(x - half, y - half, size, size);
  }

  function drawPaintLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    erase: boolean
  ) {
    let x0 = fromX;
    let y0 = fromY;
    const x1 = toX;
    const y1 = toY;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      stampPaintPixel(x0, y0, erase);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  function currentSheetMimeType(): string {
    const path = (
      currentSheet.value?.absolutePath ||
      currentSheet.value?.path ||
      ''
    ).toLowerCase();
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    if (path.endsWith('.webp')) return 'image/webp';
    return 'image/png';
  }

  function rebuildPaintPalette() {
    if (!sampleCanvas.width || !sampleCanvas.height) {
      setPaintPalette([]);
      return;
    }

    const { data } = sampleCtx.getImageData(
      0,
      0,
      sampleCanvas.width,
      sampleCanvas.height
    );
    const counts = new Map<string, number>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) continue;
      const hex =
        '#' +
        [data[i], data[i + 1], data[i + 2]]
          .map((c) => c.toString(16).padStart(2, '0'))
          .join('');
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }

    const colors = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([hex]) => hex);

    setPaintPalette(colors);
  }

  function commitSampleCanvasEdit(message: string) {
    const sheet = currentSheet.value;
    if (!sheet) return;
    const dataUrl = sampleCanvas.toDataURL(currentSheetMimeType());
    applyPaintedSheetImage(
      sheet,
      dataUrl,
      sampleCanvas.width,
      sampleCanvas.height
    );
    rebuildPaintPalette();
    renderDisplayCanvas();
    statusText.value = `${sheet.path} • ${message}`;
  }

  function commitPaintStroke() {
    const stroke = paintStroke.value;
    paintStroke.value = null;
    if (!stroke || !currentSheet.value) return;
    commitSampleCanvasEdit('Image edits pending save');
  }

  return {
    paintStroke,
    samplePixelAt,
    stampPaintPixel,
    drawPaintLine,
    rebuildPaintPalette,
    commitSampleCanvasEdit,
    commitPaintStroke,
  };
}
```

- [ ] **Step 2: Update CanvasView.vue to use `useCanvasPaint`**

```ts
import { useCanvasPaint } from '../composables/useCanvasPaint';

const {
  paintStroke,
  samplePixelAt,
  drawPaintLine,
  rebuildPaintPalette,
  commitSampleCanvasEdit,
  commitPaintStroke,
} = useCanvasPaint(stage, sampleCanvas, sampleCtx, imageWidth, imageHeight, renderDisplayCanvas);
```

Remove the extracted functions and `PaintStrokeState` interface from CanvasView.

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/composables/useCanvasPaint.ts src/mainview/src/components/CanvasView.vue
git commit -m "refactor: extract useCanvasPaint composable from CanvasView"
```

---

## Task 4: Extract `usePixelSelection` composable

**Files:**
- Create: `src/mainview/src/composables/usePixelSelection.ts`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Create `usePixelSelection.ts`**

This composable encapsulates all marquee selection logic: drag, floating selection, clipboard, nudge. It receives shared state and the paint composable's `commitSampleCanvasEdit` as parameters.

```ts
import { ref, type Ref } from 'vue';
import {
  zoom,
  currentSheet,
  paintPixelSelection,
  hasPaintClipboard,
  recordPaintUndoSnapshot,
  statusText,
} from '../state';

interface PixelSelectionDragState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

interface PixelClipboardState {
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  imageData: ImageData;
}

interface PixelSelectionMoveState {
  pointerOriginX: number;
  pointerOriginY: number;
  sourceRect: { x: number; y: number; w: number; h: number };
  dragStartRect: { x: number; y: number; w: number; h: number };
  currentRect: { x: number; y: number; w: number; h: number };
  imageData: ImageData;
  dragging: boolean;
}

export type { PixelSelectionDragState, PixelSelectionMoveState };

export function usePixelSelection(
  sampleCanvas: HTMLCanvasElement,
  sampleCtx: CanvasRenderingContext2D,
  floatingSelectionCanvas: HTMLCanvasElement,
  isPaintableCurrentSheet: Ref<boolean>,
  renderDisplayCanvas: () => void,
  commitSampleCanvasEdit: (message: string) => void,
) {
  const pixelSelectionDrag = ref<PixelSelectionDragState | null>(null);
  const pixelSelectionMove = ref<PixelSelectionMoveState | null>(null);
  let pixelClipboard: PixelClipboardState | null = null;

  function normalizePixelSelectionRect(
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ): { x: number; y: number; w: number; h: number } | null {
    if (!sampleCanvas.width || !sampleCanvas.height) return null;
    const minX = Math.max(0, Math.min(x0, x1));
    const minY = Math.max(0, Math.min(y0, y1));
    const maxX = Math.min(sampleCanvas.width - 1, Math.max(x0, x1));
    const maxY = Math.min(sampleCanvas.height - 1, Math.max(y0, y1));
    if (maxX < minX || maxY < minY) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function pointInRect(
    point: { x: number; y: number },
    rect: { x: number; y: number; w: number; h: number } | null
  ) {
    return (
      !!rect &&
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x < rect.x + rect.w &&
      point.y < rect.y + rect.h
    );
  }

  function clampSelectionTarget(
    rect: { x: number; y: number; w: number; h: number },
    x: number,
    y: number
  ) {
    return {
      x: Math.max(0, Math.min(x, Math.max(0, sampleCanvas.width - rect.w))),
      y: Math.max(0, Math.min(y, Math.max(0, sampleCanvas.height - rect.h))),
      w: rect.w,
      h: rect.h,
    };
  }

  function selectionStyle(
    rect: { x: number; y: number; w: number; h: number } | null
  ) {
    if (!rect) return {};
    return {
      left: `${rect.x * zoom.value}px`,
      top: `${rect.y * zoom.value}px`,
      width: `${rect.w * zoom.value}px`,
      height: `${rect.h * zoom.value}px`,
    };
  }

  function paintFloatingSelectionCanvas(imageData: ImageData) {
    floatingSelectionCanvas.width = imageData.width;
    floatingSelectionCanvas.height = imageData.height;
    const ctx = floatingSelectionCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    if (!ctx) return;
    ctx.putImageData(imageData, 0, 0);
  }

  function copyPixelSelectionToClipboard(): boolean {
    const floating = pixelSelectionMove.value;
    const rect = floating?.currentRect ?? paintPixelSelection.value;
    if (!rect || !sampleCanvas.width) return false;
    const imageData =
      floating?.imageData ??
      sampleCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
    pixelClipboard = {
      width: rect.w,
      height: rect.h,
      sourceX: rect.x,
      sourceY: rect.y,
      imageData,
    };
    hasPaintClipboard.value = true;
    statusText.value = `Copied ${rect.w}x${rect.h} pixels`;
    return true;
  }

  function deletePixelSelectionPixels(options?: {
    keepSelection?: boolean;
  }): boolean {
    const rect = paintPixelSelection.value;
    const sheet = currentSheet.value;
    if (!rect || !sheet || !isPaintableCurrentSheet.value) return false;
    recordPaintUndoSnapshot(sheet);
    sampleCtx.clearRect(rect.x, rect.y, rect.w, rect.h);
    if (!options?.keepSelection) {
      paintPixelSelection.value = null;
    }
    commitSampleCanvasEdit('Image edits pending save');
    return true;
  }

  function cutPixelSelectionToClipboard(): boolean {
    if (!copyPixelSelectionToClipboard()) return false;
    return deletePixelSelectionPixels({ keepSelection: true });
  }

  function pastePixelClipboard(): boolean {
    const sheet = currentSheet.value;
    if (!pixelClipboard || !sheet || !isPaintableCurrentSheet.value) return false;
    const maxX = Math.max(0, sampleCanvas.width - pixelClipboard.width);
    const maxY = Math.max(0, sampleCanvas.height - pixelClipboard.height);
    const targetX = Math.max(
      0,
      Math.min(paintPixelSelection.value?.x ?? pixelClipboard.sourceX, maxX)
    );
    const targetY = Math.max(
      0,
      Math.min(paintPixelSelection.value?.y ?? pixelClipboard.sourceY, maxY)
    );
    recordPaintUndoSnapshot(sheet);
    sampleCtx.putImageData(pixelClipboard.imageData, targetX, targetY);
    paintPixelSelection.value = {
      x: targetX,
      y: targetY,
      w: pixelClipboard.width,
      h: pixelClipboard.height,
    };
    commitSampleCanvasEdit('Image edits pending save');
    statusText.value = `${sheet.path} • Pasted ${pixelClipboard.width}x${pixelClipboard.height} pixels`;
    return true;
  }

  function clearPixelSelection() {
    pixelSelectionDrag.value = null;
    pixelSelectionMove.value = null;
    paintPixelSelection.value = null;
  }

  function finalizeFloatingSelection(options?: {
    apply?: boolean;
    clearSelection?: boolean;
    sheet?: ReturnType<typeof currentSheet['value']>;
  }) {
    const move = pixelSelectionMove.value;
    const sheet = options?.sheet ?? currentSheet.value;
    const apply = options?.apply ?? false;
    const clearSelectionAfter = options?.clearSelection ?? false;

    if (!move) {
      if (clearSelectionAfter) {
        clearPixelSelection();
      }
      return false;
    }

    const sameSpot =
      move.currentRect.x === move.sourceRect.x &&
      move.currentRect.y === move.sourceRect.y;

    if (apply && sheet && !sameSpot) {
      recordPaintUndoSnapshot(sheet);
      sampleCtx.clearRect(
        move.sourceRect.x,
        move.sourceRect.y,
        move.sourceRect.w,
        move.sourceRect.h
      );
      sampleCtx.putImageData(
        move.imageData,
        move.currentRect.x,
        move.currentRect.y
      );
      commitSampleCanvasEdit('Image edits pending save');
    }

    pixelSelectionMove.value = null;
    if (clearSelectionAfter) {
      paintPixelSelection.value = null;
    } else {
      paintPixelSelection.value = { ...move.currentRect };
    }
    renderDisplayCanvas();
    return apply && !!sheet && !sameSpot;
  }

  function commitPixelSelectionMove(): boolean {
    const move = pixelSelectionMove.value;
    if (!move) {
      renderDisplayCanvas();
      return false;
    }
    paintPixelSelection.value = { ...move.currentRect };
    pixelSelectionMove.value = {
      ...move,
      dragging: false,
      dragStartRect: { ...move.currentRect },
    };
    renderDisplayCanvas();
    statusText.value = `Selection at ${move.currentRect.x},${move.currentRect.y}`;
    return false;
  }

  function commitPixelSelection() {
    const marqueeRect = pixelSelectionDrag.value
      ? normalizePixelSelectionRect(
          pixelSelectionDrag.value.originX,
          pixelSelectionDrag.value.originY,
          pixelSelectionDrag.value.currentX,
          pixelSelectionDrag.value.currentY
        )
      : null;
    paintPixelSelection.value = marqueeRect;
    pixelSelectionDrag.value = null;
    if (paintPixelSelection.value) {
      statusText.value = `Selected ${paintPixelSelection.value.w}x${paintPixelSelection.value.h} pixels`;
    }
  }

  function beginPixelSelectionMove(point: { x: number; y: number }) {
    const existing = pixelSelectionMove.value;
    if (existing) {
      pixelSelectionMove.value = {
        ...existing,
        pointerOriginX: point.x,
        pointerOriginY: point.y,
        dragStartRect: { ...existing.currentRect },
        dragging: true,
      };
      return true;
    }
    const rect = paintPixelSelection.value;
    if (!rect) return false;
    const imageData = sampleCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
    paintFloatingSelectionCanvas(imageData);
    pixelSelectionMove.value = {
      pointerOriginX: point.x,
      pointerOriginY: point.y,
      sourceRect: { ...rect },
      dragStartRect: { ...rect },
      currentRect: { ...rect },
      imageData,
      dragging: true,
    };
    renderDisplayCanvas();
    return true;
  }

  function updatePixelSelectionMove(point: { x: number; y: number }) {
    const move = pixelSelectionMove.value;
    if (!move) return;
    const dx = point.x - move.pointerOriginX;
    const dy = point.y - move.pointerOriginY;
    pixelSelectionMove.value = {
      ...move,
      currentRect: clampSelectionTarget(
        move.dragStartRect,
        move.dragStartRect.x + dx,
        move.dragStartRect.y + dy
      ),
    };
    renderDisplayCanvas();
  }

  function nudgePixelSelection(dx: number, dy: number) {
    const current =
      pixelSelectionMove.value?.currentRect ?? paintPixelSelection.value;
    if (!current || !isPaintableCurrentSheet.value) return false;
    if (!pixelSelectionMove.value) {
      const imageData = sampleCtx.getImageData(
        current.x,
        current.y,
        current.w,
        current.h
      );
      paintFloatingSelectionCanvas(imageData);
      pixelSelectionMove.value = {
        pointerOriginX: current.x,
        pointerOriginY: current.y,
        sourceRect: { ...current },
        dragStartRect: { ...current },
        currentRect: { ...current },
        imageData,
        dragging: false,
      };
    }
    const move = pixelSelectionMove.value!;
    const target = clampSelectionTarget(
      move.currentRect,
      move.currentRect.x + dx,
      move.currentRect.y + dy
    );
    if (target.x === move.currentRect.x && target.y === move.currentRect.y)
      return false;
    pixelSelectionMove.value = {
      ...move,
      currentRect: target,
      dragStartRect: { ...target },
    };
    paintPixelSelection.value = target;
    renderDisplayCanvas();
    statusText.value = `Selection at ${target.x},${target.y}`;
    return true;
  }

  function resetClipboard() {
    pixelClipboard = null;
    hasPaintClipboard.value = false;
  }

  return {
    pixelSelectionDrag,
    pixelSelectionMove,
    normalizePixelSelectionRect,
    pointInRect,
    selectionStyle,
    copyPixelSelectionToClipboard,
    cutPixelSelectionToClipboard,
    pastePixelClipboard,
    deletePixelSelectionPixels,
    clearPixelSelection,
    finalizeFloatingSelection,
    commitPixelSelectionMove,
    commitPixelSelection,
    beginPixelSelectionMove,
    updatePixelSelectionMove,
    nudgePixelSelection,
    resetClipboard,
  };
}
```

- [ ] **Step 2: Update CanvasView.vue to use `usePixelSelection`**

Wire up the composable and remove all extracted code from CanvasView. The `PixelClipboardState`, `PixelSelectionDragState`, `PixelSelectionMoveState` interfaces and all related functions move out.

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/composables/usePixelSelection.ts src/mainview/src/components/CanvasView.vue
git commit -m "refactor: extract usePixelSelection composable from CanvasView"
```

---

## Task 5: Extract `useSpriteMove` composable

**Files:**
- Create: `src/mainview/src/composables/useSpriteMove.ts`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Create `useSpriteMove.ts`**

Encapsulates multi-sprite selection, drag, atlas selection drag, and finalization. Receives shared canvas state, annotations, and rendering function.

```ts
import { ref, type Ref } from 'vue';
import type { Annotation } from '../annotation';
import {
  selectedId,
  annotations,
  currentSheet,
  recordPaintUndoSnapshot,
  statusText,
  markDirty,
} from '../state';

interface SpriteMoveItem {
  annotationId: string;
  sourceRect: { x: number; y: number; w: number; h: number };
  dragStartRect: { x: number; y: number; w: number; h: number };
  currentRect: { x: number; y: number; w: number; h: number };
  imageData: ImageData;
  canvas: HTMLCanvasElement;
}

interface SpriteMoveState {
  pointerOriginX: number;
  pointerOriginY: number;
  items: SpriteMoveItem[];
  groupBounds: { x: number; y: number; w: number; h: number };
  dragging: boolean;
}

interface AtlasMoveSelectionDragState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
}

export type { SpriteMoveState, AtlasMoveSelectionDragState };

export function useSpriteMove(
  sampleCanvas: HTMLCanvasElement,
  sampleCtx: CanvasRenderingContext2D,
  isPaintableCurrentSheet: Ref<boolean>,
  renderDisplayCanvas: () => void,
  normalizePixelSelectionRect: (
    x0: number,
    y0: number,
    x1: number,
    y1: number
  ) => { x: number; y: number; w: number; h: number } | null,
  rectsIntersect: (
    a: { x: number; y: number; w: number; h: number },
    b: { x: number; y: number; w: number; h: number }
  ) => boolean,
  commitSampleCanvasEdit: (message: string) => void,
) {
  const spriteMove = ref<SpriteMoveState | null>(null);
  const atlasMoveSelectionDrag = ref<AtlasMoveSelectionDragState | null>(null);
  const atlasMoveSelectionIds = ref<string[]>([]);

  function createImageDataCanvas(imageData: ImageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.putImageData(imageData, 0, 0);
    }
    return canvas;
  }

  function clampSpriteMoveTarget(
    rect: { x: number; y: number; w: number; h: number },
    x: number,
    y: number
  ) {
    return {
      x: Math.max(0, Math.min(x, Math.max(0, sampleCanvas.width - rect.w))),
      y: Math.max(0, Math.min(y, Math.max(0, sampleCanvas.height - rect.h))),
      w: rect.w,
      h: rect.h,
    };
  }

  function setAtlasSelection(ids: string[]) {
    atlasMoveSelectionIds.value = [...new Set(ids)];
    selectedId.value = atlasMoveSelectionIds.value[0] ?? null;
  }

  function beginSpriteMove(
    annotation: Annotation,
    point: { x: number; y: number }
  ) {
    if (!annotation.aabb || !isPaintableCurrentSheet.value) return false;
    const selectionIds = atlasMoveSelectionIds.value.includes(annotation.id)
      ? atlasMoveSelectionIds.value
      : [annotation.id];
    const selectedAnnotations = annotations.value.filter(
      (entry) => selectionIds.includes(entry.id) && !!entry.aabb
    );
    if (selectedAnnotations.length === 0) return false;
    const items = selectedAnnotations.map((entry) => {
      const rect = { ...entry.aabb! };
      const imageData = sampleCtx.getImageData(rect.x, rect.y, rect.w, rect.h);
      return {
        annotationId: entry.id,
        sourceRect: rect,
        dragStartRect: rect,
        currentRect: rect,
        imageData,
        canvas: createImageDataCanvas(imageData),
      };
    });
    const minX = Math.min(...items.map((item) => item.sourceRect.x));
    const minY = Math.min(...items.map((item) => item.sourceRect.y));
    const maxX = Math.max(
      ...items.map((item) => item.sourceRect.x + item.sourceRect.w)
    );
    const maxY = Math.max(
      ...items.map((item) => item.sourceRect.y + item.sourceRect.h)
    );
    spriteMove.value = {
      pointerOriginX: point.x,
      pointerOriginY: point.y,
      items,
      groupBounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      dragging: true,
    };
    setAtlasSelection(items.map((item) => item.annotationId));
    renderDisplayCanvas();
    return true;
  }

  function updateSpriteMove(point: { x: number; y: number }) {
    const move = spriteMove.value;
    if (!move) return;
    const rawDx = point.x - move.pointerOriginX;
    const rawDy = point.y - move.pointerOriginY;
    const dx = Math.max(
      -move.groupBounds.x,
      Math.min(
        rawDx,
        sampleCanvas.width - (move.groupBounds.x + move.groupBounds.w)
      )
    );
    const dy = Math.max(
      -move.groupBounds.y,
      Math.min(
        rawDy,
        sampleCanvas.height - (move.groupBounds.y + move.groupBounds.h)
      )
    );
    spriteMove.value = {
      ...move,
      items: move.items.map((item) => ({
        ...item,
        currentRect: clampSpriteMoveTarget(
          item.dragStartRect,
          item.dragStartRect.x + dx,
          item.dragStartRect.y + dy
        ),
      })),
    };
    renderDisplayCanvas();
  }

  function finalizeSpriteMove(options?: {
    apply?: boolean;
    sheet?: typeof currentSheet.value;
  }) {
    const move = spriteMove.value;
    const sheet = options?.sheet ?? currentSheet.value;
    const apply = options?.apply ?? false;

    if (!move) return false;

    const sameSpot = move.items.every(
      (item) =>
        item.currentRect.x === item.sourceRect.x &&
        item.currentRect.y === item.sourceRect.y
    );

    if (apply && sheet && !sameSpot) {
      recordPaintUndoSnapshot(sheet);
    }

    for (const item of move.items) {
      const ann =
        sheet?.annotations.find((entry) => entry.id === item.annotationId) ??
        null;
      if (!ann?.aabb) continue;
      ann.aabb.x = apply ? item.currentRect.x : item.sourceRect.x;
      ann.aabb.y = apply ? item.currentRect.y : item.sourceRect.y;
    }

    if (apply && sheet && !sameSpot) {
      for (const item of move.items) {
        sampleCtx.clearRect(
          item.sourceRect.x,
          item.sourceRect.y,
          item.sourceRect.w,
          item.sourceRect.h
        );
      }
      for (const item of move.items) {
        sampleCtx.putImageData(
          item.imageData,
          item.currentRect.x,
          item.currentRect.y
        );
      }
      commitSampleCanvasEdit('Sprite moved');
      markDirty(true);
      statusText.value = `${sheet.path} • Sprite moved`;
    } else {
      renderDisplayCanvas();
    }

    spriteMove.value = null;
    return apply && !!sheet && !sameSpot;
  }

  function commitAtlasSelectionDrag() {
    const drag = atlasMoveSelectionDrag.value;
    atlasMoveSelectionDrag.value = null;
    if (!drag) {
      setAtlasSelection([]);
      return;
    }
    const rect = normalizePixelSelectionRect(
      drag.originX,
      drag.originY,
      drag.currentX,
      drag.currentY
    );
    if (!rect) {
      setAtlasSelection([]);
      return;
    }
    const ids = annotations.value
      .filter(
        (annotation) => annotation.aabb && rectsIntersect(annotation.aabb, rect)
      )
      .map((annotation) => annotation.id);
    setAtlasSelection(ids);
    statusText.value =
      ids.length > 0
        ? `Selected ${ids.length} sprite${ids.length === 1 ? '' : 's'}`
        : 'No sprites selected';
  }

  return {
    spriteMove,
    atlasMoveSelectionDrag,
    atlasMoveSelectionIds,
    setAtlasSelection,
    beginSpriteMove,
    updateSpriteMove,
    finalizeSpriteMove,
    commitAtlasSelectionDrag,
  };
}
```

- [ ] **Step 2: Update CanvasView.vue**

Wire up the composable. The `rectsIntersect` helper stays in CanvasView (or gets passed to the composable). Remove extracted code.

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/composables/useSpriteMove.ts src/mainview/src/components/CanvasView.vue
git commit -m "refactor: extract useSpriteMove composable from CanvasView"
```

---

## Task 6: Extract `useAnnotationDrawing` composable

**Files:**
- Create: `src/mainview/src/composables/useAnnotationDrawing.ts`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Create `useAnnotationDrawing.ts`**

```ts
import { ref } from 'vue';
import type { Annotation } from '../annotation';
import { getEntityByLabel } from '../spec/types';
import { activeSpec, addAnnotationWithSize } from '../state';

interface DrawingState {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  entityType: string;
  shapeType: 'rect' | 'point';
}

export type { DrawingState };

const DRAW_MIN_THRESHOLD = 4;

export function useAnnotationDrawing() {
  const drawing = ref<DrawingState | null>(null);

  function getPrimaryShapeKind(annotation: Annotation): 'rect' | 'point' | null {
    if (!activeSpec.value) return null;
    const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
    if (!entity) return null;
    return entity.primaryShape.kind;
  }

  function getAnnotationLabel(annotation: Annotation): string {
    if (!activeSpec.value) return annotation.entityType;
    const entity = getEntityByLabel(activeSpec.value, annotation.entityType);
    if (!entity) return annotation.entityType;
    if (entity.nameField) {
      const val = annotation.properties.name;
      if (val && typeof val === 'string') return val;
    }
    for (const field of entity.properties) {
      if (field.kind === 'scalar' && field.type === 'string') {
        const val = annotation.properties[field.name];
        if (val && typeof val === 'string') return val;
      }
    }
    return annotation.entityType;
  }

  function annotationAtPoint(
    point: { x: number; y: number },
    annotationsList: Annotation[]
  ): Annotation | null {
    for (let index = annotationsList.length - 1; index >= 0; index -= 1) {
      const annotation = annotationsList[index];
      if (!annotation.aabb) continue;
      if (
        point.x >= annotation.aabb.x &&
        point.y >= annotation.aabb.y &&
        point.x < annotation.aabb.x + annotation.aabb.w &&
        point.y < annotation.aabb.y + annotation.aabb.h
      ) {
        return annotation;
      }
    }
    return null;
  }

  function commitDrawing() {
    const d = drawing.value;
    drawing.value = null;
    if (!d) return;

    if (d.shapeType === 'rect') {
      const w = Math.abs(d.currentX - d.originX);
      const h = Math.abs(d.currentY - d.originY);
      if (w < DRAW_MIN_THRESHOLD || h < DRAW_MIN_THRESHOLD) return;

      const x = Math.min(d.originX, d.currentX);
      const y = Math.min(d.originY, d.currentY);
      addAnnotationWithSize(d.entityType, x, y, w, h);
    }
  }

  return {
    drawing,
    getPrimaryShapeKind,
    getAnnotationLabel,
    annotationAtPoint,
    commitDrawing,
  };
}
```

- [ ] **Step 2: Update CanvasView.vue**

```ts
import { useAnnotationDrawing } from '../composables/useAnnotationDrawing';

const {
  drawing,
  getPrimaryShapeKind,
  getAnnotationLabel,
  annotationAtPoint,
  commitDrawing,
} = useAnnotationDrawing();
```

Remove the extracted functions and `DrawingState` interface.

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/composables/useAnnotationDrawing.ts src/mainview/src/components/CanvasView.vue
git commit -m "refactor: extract useAnnotationDrawing composable from CanvasView"
```

---

## Task 7: Extract `CanvasToolbar.vue` component

**Files:**
- Create: `src/mainview/src/components/CanvasToolbar.vue`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Create `CanvasToolbar.vue`**

Extract lines 2061-2138 of the CanvasView template into a standalone component. It receives zoom-related handlers as props/emits.

```vue
<script setup lang="ts">
import {
  canvasGridEnabled,
  canvasGridWidth,
  canvasGridHeight,
  canvasCheckerStrength,
} from '../state';
import { Minus, Plus, Maximize2, Grid3x3 } from 'lucide-vue-next';

const emit = defineEmits<{
  zoomIn: [];
  zoomOut: [];
  fitView: [];
}>();

const zoomLabel = defineModel<string>('zoomLabel', { required: true });

function normalizeGridSize(axis: 'width' | 'height') {
  if (axis === 'width') {
    canvasGridWidth.value = Math.max(1, Math.round(canvasGridWidth.value || 1));
    return;
  }
  canvasGridHeight.value = Math.max(1, Math.round(canvasGridHeight.value || 1));
}

function normalizeCheckerStrength() {
  canvasCheckerStrength.value = Math.max(
    0,
    Math.min(100, Math.round(canvasCheckerStrength.value || 0))
  );
}
</script>

<template>
  <div class="canvas-toolbar">
    <div class="canvas-toolbar-group">
      <button
        type="button"
        class="canvas-toolbar-icon-button"
        title="Zoom out"
        @click="emit('zoomOut')"
      >
        <Minus :size="16" />
      </button>
      <span class="canvas-toolbar-zoom">{{ zoomLabel }}</span>
      <button
        type="button"
        class="canvas-toolbar-icon-button"
        title="Zoom in"
        @click="emit('zoomIn')"
      >
        <Plus :size="16" />
      </button>
      <button
        type="button"
        class="canvas-toolbar-icon-button"
        title="Fit view"
        @click="emit('fitView')"
      >
        <Maximize2 :size="16" />
      </button>
    </div>
    <div class="canvas-toolbar-divider"></div>
    <label
      class="canvas-toolbar-toggle"
      :class="{ active: canvasGridEnabled }"
    >
      <input v-model="canvasGridEnabled" type="checkbox" class="sr-only" />
      <Grid3x3 :size="16" />
      <span class="canvas-toolbar-label">Grid</span>
    </label>
    <div class="canvas-toolbar-group">
      <label class="canvas-toolbar-field">
        <span class="canvas-toolbar-label">W</span>
        <input
          v-model.number="canvasGridWidth"
          type="number"
          min="1"
          step="1"
          class="canvas-toolbar-number"
          @change="normalizeGridSize('width')"
        />
      </label>
      <label class="canvas-toolbar-field">
        <span class="canvas-toolbar-label">H</span>
        <input
          v-model.number="canvasGridHeight"
          type="number"
          min="1"
          step="1"
          class="canvas-toolbar-number"
          @change="normalizeGridSize('height')"
        />
      </label>
    </div>
    <div class="canvas-toolbar-divider"></div>
    <label class="canvas-toolbar-field canvas-toolbar-range-field">
      <span class="canvas-toolbar-label">Checker</span>
      <input
        v-model.number="canvasCheckerStrength"
        type="range"
        min="0"
        max="100"
        step="1"
        class="canvas-toolbar-range"
        @change="normalizeCheckerStrength"
      />
      <span class="canvas-toolbar-range-value">{{
        canvasCheckerStrength
      }}</span>
    </label>
  </div>
</template>
```

- [ ] **Step 2: Update CanvasView.vue**

Replace the toolbar template section with:

```vue
<CanvasToolbar
  :zoom-label="zoomLabel"
  @zoom-in="handleZoomIn"
  @zoom-out="handleZoomOut"
  @fit-view="handleFitView"
/>
```

Add the import: `import CanvasToolbar from './CanvasToolbar.vue';`

Remove `normalizeGridSize`, `normalizeCheckerStrength` from CanvasView, and the lucide icon imports that are only used by the toolbar (`Minus`, `Plus`, `Maximize2`, `Grid3x3`).

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/components/CanvasToolbar.vue src/mainview/src/components/CanvasView.vue
git commit -m "refactor: extract CanvasToolbar component from CanvasView"
```

---

## Task 8: Extract `state/toolState.ts`

**Files:**
- Create: `src/mainview/src/state/toolState.ts`
- Modify: `src/mainview/src/state.ts`
- Modify: `src/mainview/src/components/ToolPalette.vue`
- Modify: `src/mainview/src/components/CanvasView.vue`

- [ ] **Step 1: Create `state/toolState.ts`**

```ts
import { ref } from 'vue';

export const activeTool = ref<string>('');
export const activePaintTool = ref<'' | 'pencil' | 'erase' | 'eyedropper' | 'marquee'>('');
export const activeAtlasTool = ref<'' | 'sprite-move'>('');
export const activePaintColor = ref('#e8e2d4');
export const paintToolSize = ref(1);

export const activeEyedropper = ref<{
  callback: (hex: string) => void;
  originalValue: string;
} | null>(null);

export function setSelectTool() {
  activeTool.value = '';
  activePaintTool.value = '';
  activeAtlasTool.value = '';
}

export function setEntityTool(label: string) {
  activePaintTool.value = '';
  activeAtlasTool.value = '';
  activeTool.value = label;
}

export function setPaintTool(tool: '' | 'pencil' | 'erase' | 'eyedropper' | 'marquee') {
  activeTool.value = '';
  activeAtlasTool.value = '';
  activePaintTool.value = tool;
}

export function setAtlasTool(tool: '' | 'sprite-move') {
  activeTool.value = '';
  activePaintTool.value = '';
  activeAtlasTool.value = tool;
}
```

- [ ] **Step 2: Update `state.ts`**

Remove the tool refs, functions, and `activeEyedropper` that moved to `toolState.ts`. Replace with re-imports where needed internally, or just remove. The internal usages of `setSelectTool()` in state.ts should import from `./state/toolState`.

Add at the top of state.ts:
```ts
import {
  activeTool,
  activePaintTool,
  activeAtlasTool,
  activePaintColor,
  paintToolSize,
  activeEyedropper,
  setSelectTool,
  setEntityTool,
  setPaintTool,
  setAtlasTool,
} from './state/toolState';
```

Keep re-exporting them from state.ts for now (will be removed as consumers migrate):
```ts
export {
  activeTool,
  activePaintTool,
  activeAtlasTool,
  activePaintColor,
  paintToolSize,
  activeEyedropper,
  setSelectTool,
  setEntityTool,
  setPaintTool,
  setAtlasTool,
} from './state/toolState';
```

- [ ] **Step 3: Update consumers to import directly**

Update `ToolPalette.vue`:
```ts
import { activeSpec } from '../state';
import {
  activeTool,
  activePaintTool,
  activeAtlasTool,
  setEntityTool,
  setPaintTool,
  setAtlasTool,
  setSelectTool,
} from '../state/toolState';
```

Update `CanvasView.vue` to import tool-related state from `../state/toolState` instead of `../state`.

Update `ColorPicker.vue`:
```ts
import { activeEyedropper } from '../state/toolState';
```

Update `ShapeCanvas.vue`:
```ts
import { updateShapeData, markDirty } from '../state';
import { activeEyedropper } from '../state/toolState';
```

Update `PaintPanel.vue` to split its imports: tool-related ones from `../state/toolState`, rest from `../state`.

- [ ] **Step 4: Remove re-exports from state.ts**

Once all consumers have been updated, remove the re-exports from state.ts.

- [ ] **Step 5: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add src/mainview/src/state/toolState.ts src/mainview/src/state.ts \
  src/mainview/src/components/ToolPalette.vue \
  src/mainview/src/components/CanvasView.vue \
  src/mainview/src/components/ColorPicker.vue \
  src/mainview/src/components/ShapeCanvas.vue \
  src/mainview/src/components/PaintPanel.vue
git commit -m "refactor: extract toolState module from state.ts"
```

---

## Task 9: Extract `state/paletteState.ts`

**Files:**
- Create: `src/mainview/src/state/paletteState.ts`
- Modify: `src/mainview/src/state.ts`
- Modify: `src/mainview/src/components/PaintPanel.vue`

- [ ] **Step 1: Create `state/paletteState.ts`**

Move palette refs (`paintPalette`, `projectPalettes`, `activeProjectPaletteId`, `activeProjectPalette`, `availablePaintSwatches`) and palette functions (`setPaintPalette`, `setActiveProjectPalette`, `importPaletteFromPath`, `parsePaletteHex`, `normalizePaletteColorToken`, `slugifyPaletteName`, `debugPaletteLog`) from state.ts.

This module needs to import `markDirty`, `statusText`, `activePaintColor` and persistence utilities.

- [ ] **Step 2: Update state.ts**

Remove palette code, add imports from `./state/paletteState`, keep re-exports temporarily.

- [ ] **Step 3: Update `PaintPanel.vue`**

Split imports: palette-related from `../state/paletteState`, rest from `../state` or `../state/toolState`.

- [ ] **Step 4: Remove re-exports from state.ts**

- [ ] **Step 5: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 6: Commit**

```bash
git add src/mainview/src/state/paletteState.ts src/mainview/src/state.ts \
  src/mainview/src/components/PaintPanel.vue
git commit -m "refactor: extract paletteState module from state.ts"
```

---

## Task 10: Extract `state/paintHistory.ts`

**Files:**
- Create: `src/mainview/src/state/paintHistory.ts`
- Modify: `src/mainview/src/state.ts`

- [ ] **Step 1: Create `state/paintHistory.ts`**

Move all undo/redo logic: `EditedSheetState`, `EditSnapshot` interfaces, `editedSheetState` ref, `getSheetKey`, `ensureEditedSheetState`, `captureEditSnapshot`, `applyEditSnapshot`, `replaceEditedSheetState`, `updateSheetImageState`, `isPaintableSheet`, `hasUnsavedImageEdits`, `recordPaintUndoSnapshot`, `applyPaintedSheetImage`, `undoPaintEdit`, `redoPaintEdit`, `savePendingImageEdits`.

- [ ] **Step 2: Update state.ts**

Remove paint history code, import from `./state/paintHistory`.

- [ ] **Step 3: Update consumers**

`App.vue` imports `hasUnsavedImageEdits`, `redoPaintEdit`, `undoPaintEdit` — update to import from `./state/paintHistory`.

`CanvasView.vue` imports `applyPaintedSheetImage`, `recordPaintUndoSnapshot`, `redoPaintEdit` — update composables that use these to import from `../state/paintHistory`.

`PaintPanel.vue` imports `redoPaintEdit`, `undoPaintEdit` — update to import from `../state/paintHistory`.

- [ ] **Step 4: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/state/paintHistory.ts src/mainview/src/state.ts \
  src/mainview/src/App.vue src/mainview/src/components/PaintPanel.vue \
  src/mainview/src/composables/useCanvasPaint.ts \
  src/mainview/src/composables/usePixelSelection.ts \
  src/mainview/src/composables/useSpriteMove.ts
git commit -m "refactor: extract paintHistory module from state.ts"
```

---

## Task 11: Extract `state/specState.ts`

**Files:**
- Create: `src/mainview/src/state/specState.ts`
- Modify: `src/mainview/src/state.ts`
- Modify: `src/mainview/src/components/SpecEditor.vue`

- [ ] **Step 1: Create `state/specState.ts`**

Move: `activeSpec`, `activeSpecRaw`, `specFilePath` refs, `setSpecState`, `resetToDefaultSpec`, `loadSpec`, `applySpecFromEditor`, `forceApplySpec`, `importSpecFromPath`, `loadSpecFromFilePath`, `resolveProjectSpecForWorkspace`, `inferSpecFormatFromPath`, spec reload watcher logic (`debouncedSaveSpecFile`, `saveSpecFileNow`, `startSpecReloadWatcher`, `stopSpecReloadWatcher`), the default spec initialization, `normalizeAnnotationsForSpec`.

- [ ] **Step 2: Update state.ts**

Remove spec code, import from `./state/specState`.

- [ ] **Step 3: Update consumers**

`SpecEditor.vue`: import `activeSpecRaw`, `applySpecFromEditor`, `forceApplySpec`, `specFilePath` from `../state/specState`.

`App.vue`: import `loadSpec`, `importSpecFromPath`, `exportSpec` — spec-related from `../state/specState`.

- [ ] **Step 4: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/state/specState.ts src/mainview/src/state.ts \
  src/mainview/src/components/SpecEditor.vue src/mainview/src/App.vue
git commit -m "refactor: extract specState module from state.ts"
```

---

## Task 12: Extract `state/canvasPrefs.ts`

**Files:**
- Create: `src/mainview/src/state/canvasPrefs.ts`
- Modify: `src/mainview/src/state.ts`

- [ ] **Step 1: Create `state/canvasPrefs.ts`**

Move: `CanvasSheetPrefs` interface, `normalizeCanvasPrefs`, `loadCheckerStrength`, `getCanvasPrefsMap`, `setCanvasPrefsMap`, `getCanvasPrefsId`, `getCurrentCanvasPrefs`, `applyCanvasPrefs`, `loadCanvasPrefsForSheet`, `saveCanvasPrefsForSheet`, `saveCanvasPrefsForSheetWithOptions`, `applyingCanvasPrefs` ref, `CANVAS_PREFS_STORAGE_KEY`, `CHECKER_STRENGTH_STORAGE_KEY`.

- [ ] **Step 2: Update state.ts**

Remove canvas prefs code, import from `./state/canvasPrefs`.

- [ ] **Step 3: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/state/canvasPrefs.ts src/mainview/src/state.ts
git commit -m "refactor: extract canvasPrefs module from state.ts"
```

---

## Task 13: Extract `state/ioState.ts`

**Files:**
- Create: `src/mainview/src/state/ioState.ts`
- Modify: `src/mainview/src/state.ts`
- Modify: `src/mainview/src/App.vue`

- [ ] **Step 1: Create `state/ioState.ts`**

Move: `importSheetFromPath`, `importSheetsFromPaths`, `openProjectDirectory`, `exportWorkspace`, `exportSpec`, `doExportWrite`, `saveWorkspace`, `saveWorkspaceAs`, `openWorkspace`, `loadWorkspaceFromPath`, `restoreWorkspace`, `performSave`, `persistWorkspaceSnapshotNow`.

Also move path helpers used only by I/O: `workspaceDir`, `defaultProjectSpecPathForWorkspace`, `makeWorkspaceRelativePath`, `resolveWorkspacePath`.

- [ ] **Step 2: Update state.ts**

Remove I/O code, import from `./state/ioState`.

- [ ] **Step 3: Update `App.vue`**

Split imports: I/O functions from `./state/ioState`, rest from `./state`.

- [ ] **Step 4: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/state/ioState.ts src/mainview/src/state.ts src/mainview/src/App.vue
git commit -m "refactor: extract ioState module from state.ts"
```

---

## Task 14: Split `style.css` into `styles/` directory

**Files:**
- Create: `src/mainview/src/styles/tokens.css` (lines 1-37)
- Create: `src/mainview/src/styles/base.css` (lines 38-128)
- Create: `src/mainview/src/styles/app-shell.css` (lines 130-247)
- Create: `src/mainview/src/styles/dockview.css` (lines 249-315)
- Create: `src/mainview/src/styles/themes/whisper.css` (lines 317-389)
- Create: `src/mainview/src/styles/themes/frost.css` (lines 391-443)
- Create: `src/mainview/src/styles/themes/ember.css` (lines 445-497)
- Create: `src/mainview/src/styles/themes/daylight.css` (lines 499-551)
- Create: `src/mainview/src/styles/themes/aseprite.css` (lines 553-605)
- Create: `src/mainview/src/styles/themes/gamemaker.css` (lines 607-659)
- Create: `src/mainview/src/styles/canvas.css` (lines 661-910)
- Create: `src/mainview/src/styles/annotations.css` (lines 912-1188)
- Create: `src/mainview/src/styles/gallery.css` (lines 1190-1232)
- Modify: `src/mainview/src/style.css` — replace with imports

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/mainview/src/styles/themes
```

- [ ] **Step 2: Create all CSS files**

Extract each section of style.css into its own file, using the line ranges above. Each file contains only its section's CSS — no imports needed within individual files (CSS custom properties cascade naturally).

- [ ] **Step 3: Replace `style.css` with imports**

```css
@import "./styles/tokens.css";
@import "./styles/base.css";
@import "./styles/app-shell.css";
@import "./styles/dockview.css";
@import "./styles/themes/whisper.css";
@import "./styles/themes/frost.css";
@import "./styles/themes/ember.css";
@import "./styles/themes/daylight.css";
@import "./styles/themes/aseprite.css";
@import "./styles/themes/gamemaker.css";
@import "./styles/canvas.css";
@import "./styles/annotations.css";
@import "./styles/gallery.css";
```

Note: `main.ts` and `main-web.ts` import `./src/style.css` — this path stays valid since style.css still exists as the entry point.

- [ ] **Step 4: Verify the app builds**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/styles/ src/mainview/src/style.css
git commit -m "refactor: split style.css into styles/ directory with theme files"
```

---

## Task 15: Run full test suite and verify

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun test 2>&1 | tail -20`
Expected: All tests pass (tests don't import from state.ts directly).

- [ ] **Step 2: Build both targets**

Run: `cd /Users/la.kyle.dougan/git/personal/span && bun run build:mainview 2>&1 | tail -5`
Expected: Build succeeds.

- [ ] **Step 3: Verify line counts**

Run: `wc -l src/mainview/src/components/CanvasView.vue src/mainview/src/state.ts src/mainview/src/style.css`
Expected: CanvasView ~600-700, state.ts ~500-600, style.css ~15 lines.

- [ ] **Step 4: Commit cleanup doc**

```bash
git add docs/superpowers/plans/2026-04-07-file-decomposition.md
git commit -m "docs: add file decomposition implementation plan"
```
