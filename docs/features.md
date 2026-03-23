# Span Features

## Core Model

- Each annotation is a single sprite rectangle.
- Animation grouping is metadata-driven instead of strip-driven.
- Frames are joined by shared sprite identity plus `frame`.
- Supported annotation fields:
  - `name`
  - `type`
  - `frame`
  - `x`
  - `y`
  - `width`
  - `height`
  - `direction`
  - `variant`
  - `chroma_key`
  - `tags`
  - `notes`

## Editor UI

- All panels are dockable, rearrangeable, and tab-stackable (Dockview).
- Sheet browser panel with filter input.
- Canvas panel for the current sheet with annotation overlays.
- Inspector panel for editing selected annotation fields.
- Sprites In Sheet panel listing all annotations on the current sheet.
- Gallery panel showing realized sprite previews with adjustable zoom.
- Fixed status bar at the bottom showing current state.
- Actions available via native macOS menus and keyboard shortcuts.

## Canvas Interaction

- Add creates a new single-frame sprite box near the current viewport center.
- Boxes can be dragged to reposition.
- Boxes can be resized from the bottom-right handle.
- Mouse wheel zooms toward the cursor in 10% increments.
- Floating `+` and `-` buttons also adjust zoom.
- Space + drag or middle mouse button pans the canvas.
- Alt/Option + drag duplicates the annotation and drags the copy.
- Overlapping sprite boxes use explicit z-order so one box wins the click.
- Right-click on a box: Duplicate, Delete, Pick chroma.
- Right-click on empty canvas: Add sprite, Pick chroma.

## Annotation Editing

- Inspector edits update the selected annotation directly.
- Changes are reflected live in the gallery preview.
- Duplicate creates a copied annotation with the frame incremented.
- `Cmd+D` duplicates the selected annotation.
- `Delete` / `Backspace` removes the selected annotation.
- `Cmd+S` saves annotations to disk.
- Saved annotations are stored as JSON in `annotations/*.annotations.json`.

## Gallery

- Realized sprites are shown in a gallery panel.
- Gallery groups frames by sprite identity metadata.
- Multi-frame groups animate in place.
- Current-sheet groups are sorted first.
- Clicking a gallery item jumps to the corresponding sprite, opening another sheet if needed.
- Zoom slider controls preview scale (1x to 8x).
- Text labels hidden at small scales, visible at 3x+.
- Gallery updates live during canvas drag and inspector edits.

## Chroma Key

- Each sprite can define its own `chroma_key`.
- The inspector exposes a manual chroma key field.
- A `Pick` button arms sheet sampling mode.
- Clicking a color on the sheet stores the sampled color as `#rrggbb`.
- Gallery previews apply exact RGB chroma removal before rendering.

## Panel Layout

- Panels can be dragged, resized, and stacked as tabs.
- Layout persists across app restarts.
- View > Reset Panel Layout restores the default arrangement.
- View > Add Panel re-opens a closed panel in the active group.
- Close buttons hidden by default, shown on tab hover.

## Context Menus

- Sheet sidebar: Open, Reveal in Finder, Refresh all sheets.
- Canvas annotation box: Duplicate, Delete, Pick chroma.
- Canvas empty area: Add sprite, Pick chroma.
- Annotation list: Duplicate, Delete.
- Gallery: Select sprite, Open sheet (cross-sheet).
- Inspector: Native Cut/Copy/Paste on form inputs.
- Global right-click disabled outside of these contexts.

## Native Menus

- **Span**: About, Hide, Hide Others, Show All, Quit.
- **File**: Save, Refresh Sheets.
- **Edit**: Undo, Redo, Cut, Copy, Paste, Select All, Add Sprite, Duplicate Sprite, Delete Sprite.
- **View**: Add Panel (submenu), Reset Panel Layout, Toggle Full Screen.
- **Window**: Minimize, Zoom, Close, Bring All to Front.
- **Help**: Toggle Developer Tools.

## Planned Annotation Types

- Add point annotations in addition to rectangle annotations.
- Points should cover things like:
  - `center`
  - `grab_point`
  - other named anchor points
- Add support for per-sprite sub-AABBs.
- Sub-AABBs should cover things like:
  - `collision_box`
  - `hurtbox`
  - `hitbox`
  - `grab_box`
- These should be attachable to a sprite annotation instead of requiring a separate top-level sprite.

## Project Layout

- `src/bun/`
  - Electrobun main process (file I/O, menus, window, RPC handlers)
- `src/shared/`
  - Shared RPC type definitions
- `src/mainview/`
  - Vue 3 webview (all UI)
- `example_project/`
  - sample project bundled with the app
- `example_project/sheets/`
  - Zelda sheets copied from the source game repo
- `example_project/annotations/`
  - sample annotations
- `example_project/manifest.json`
  - optional source metadata

## Runtime Entry

- Default command:
  - `bun start`
- With HMR:
  - `bun run dev:hmr`
- Alternate project:
  - `bun start -- --project /path/to/project`
- Expected external project layout:
  - `sheets/`
  - `annotations/`
  - optional `manifest.json`
