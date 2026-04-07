import type { Ref } from 'vue';
import {
  canvasGridEnabled,
  canvasGridWidth,
  canvasGridHeight,
  canvasCheckerStrength,
} from '../state';

export function useCanvasRendering(deps: {
  displayCanvas: Ref<HTMLCanvasElement | null>;
  sampleCanvas: HTMLCanvasElement;
  checkerCanvas: HTMLCanvasElement;
  floatingSelectionCanvas: HTMLCanvasElement;
  stageWidth: Ref<number>;
  stageHeight: Ref<number>;
  pixelSelectionMove: Ref<{ currentRect: { x: number; y: number; w: number; h: number } } | null>;
  spriteMove: Ref<{
    items: Array<{
      sourceRect: { x: number; y: number; w: number; h: number };
      currentRect: { x: number; y: number; w: number; h: number };
      canvas: HTMLCanvasElement;
    }>;
  } | null>;
}) {
  const {
    displayCanvas,
    sampleCanvas,
    checkerCanvas,
    floatingSelectionCanvas,
    stageWidth,
    stageHeight,
    pixelSelectionMove,
    spriteMove,
  } = deps;

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
    if (
      !canvasGridEnabled.value ||
      !sampleCanvas.width ||
      !sampleCanvas.height
    )
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

  return { rebuildCheckerboardSource, drawGridLines, renderDisplayCanvas };
}
