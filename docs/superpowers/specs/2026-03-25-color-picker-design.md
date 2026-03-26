# Color Picker

## Overview

A custom color picker component for `color` type properties in the inspector. Shows a collapsible palette of colors extracted from the entity's aabb region on the sheet image, plus an eyedropper tool for picking colors directly from the canvas preview.

## Component: ColorPicker.vue

### Props

- `modelValue: string` — hex color like `#ff00ff` or empty string
- `imageSource: string` — current sheet image URL (data URL or blob URL)
- `aabb: { x: number; y: number; w: number; h: number } | null` — region to sample from
- `@update:modelValue` — emits selected hex string

### Layout

**Collapsed (default):**
```
[ swatch 28x28 ] [ #ff00ff text input ] [ eyedropper icon ] [ expand chevron ]
```

**Expanded:**
```
[ swatch 28x28 ] [ #ff00ff text input ] [ eyedropper icon ] [ expand chevron ]
┌─────────────────────────────────────────────┐
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]           │
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]           │
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]           │
│  [ ] [ ] [ ] [ ] [ ] [ ] [ ] [ ]           │
│  [ eyedropper ] [ custom (native picker) ]  │
└─────────────────────────────────────────────┘
```

### Behavior

- **Swatch:** 28x28px, shows current color, rounded corners, border matching app theme
- **Hex input:** text input, placeholder `#000000`, emits on change/blur. Normalizes to lowercase `#rrggbb`
- **Expand chevron:** toggles the dropdown panel open/closed
- **Palette grid:** 8 columns, up to 32 swatches. Clicking a swatch selects it, emits the value, and closes the dropdown. Selected color has copper highlight border.
- **Custom button:** opens a hidden `<input type="color">` for arbitrary color selection
- **Eyedropper icon:** appears both in the collapsed row and in the dropdown panel. Activates eyedropper mode on the canvas.
- **Click outside:** closes the dropdown

## Palette Extraction

When the dropdown opens, extract colors from the sheet image within the annotation's aabb:

1. Draw the sheet image onto an offscreen `<canvas>`
2. Read pixel data for the aabb region via `getImageData(x, y, w, h)`
3. Quantize each pixel's RGB channels by rounding to the nearest 8 (e.g., `Math.round(r / 8) * 8`) to merge near-duplicates
4. Count frequency of each quantized color
5. Sort by frequency descending (most common first)
6. Take the top 32 colors
7. Convert each to `#rrggbb` hex

**Caching:** Cache the palette keyed by `annotationId + aabb.x + aabb.y + aabb.w + aabb.h`. Invalidate when the aabb changes. No need for persistence — the cache lives in component state.

**Edge cases:**
- If `aabb` is null (point entity), show no palette — only the hex input and custom/eyedropper buttons
- If the image isn't loaded yet, show an empty palette
- Skip fully transparent pixels (alpha < 128)

## Eyedropper Mode

### Activation

Click the eyedropper icon (in the row or dropdown panel) to activate.

### Cross-component Communication

Add to `state.ts`:
```typescript
export const activeEyedropper = ref<{
  callback: (hex: string) => void;
  originalValue: string;
} | null>(null);
```

When the eyedropper is activated, `ColorPicker` sets `activeEyedropper` with a callback and the current value (for cancel/restore). When the canvas reports a pick or cancel, it calls the callback or restores the original value.

### Canvas Behavior (CanvasView.vue)

When `activeEyedropper` is non-null:

- Change cursor to `crosshair` on the canvas stage
- **On pointermove:** sample the pixel under the cursor from the sheet image, call `activeEyedropper.callback(hex)` to live-preview the color in the swatch
- **On click:** confirm the color — call `activeEyedropper.callback(hex)`, then set `activeEyedropper` to null
- **On Escape or right-click:** cancel — restore `activeEyedropper.originalValue`, set `activeEyedropper` to null
- Suppress normal canvas interactions (drag, select) while eyedropper is active

### Pixel Sampling

Read pixels from the sheet image by drawing it to an offscreen canvas (can reuse the same one as palette extraction). Given the pointer position in canvas coordinates, convert to image coordinates (divide by zoom), then read the pixel at that position.

## Output Format

Always lowercase `#rrggbb` hex. If the user types an invalid hex, don't emit — keep the last valid value.

## Files Changed

- **Create:** `src/mainview/src/components/ColorPicker.vue`
- **Modify:** `src/mainview/src/components/DynamicInspector.vue` — replace inline color template block with `<ColorPicker>` component
- **Modify:** `src/mainview/src/components/CanvasView.vue` — add eyedropper mode handling (cursor, pointermove sampling, click confirm, escape cancel)
- **Modify:** `src/mainview/src/state.ts` — add `activeEyedropper` ref
