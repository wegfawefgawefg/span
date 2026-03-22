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

- Sheet browser on the left with filter input.
- Current sheet loads into a central canvas view.
- Selection inspector lives on the right.
- Existing annotations for the current sheet are listed in the right column.
- Add, duplicate, delete, and save actions are exposed as buttons.

## Sheet Interaction

- Add creates a new single-frame sprite box near the current viewport center.
- Boxes can be dragged.
- Boxes can be resized from the bottom-right handle.
- Mouse wheel zooms toward the cursor.
- `+` and `-` buttons also adjust zoom.
- Overlapping sprite boxes use explicit z-order so one box wins the click.

## Annotation Editing

- Inspector edits update the selected annotation directly.
- Duplicate creates a copied annotation with the frame incremented.
- `Ctrl/Cmd + D` duplicates the selected annotation and increments `frame`.
- Delete removes the selected annotation.
- Saved annotations are stored as JSON in `annotations/*.annotations.json`.

## Gallery

- Realized sprites are shown in a bottom gallery.
- Gallery groups frames by sprite identity metadata.
- Multi-frame groups animate in place.
- Current-sheet groups are sorted first.
- Clicking a gallery item jumps to the corresponding sprite, opening another sheet if needed.

## Chroma Key

- Each sprite can define its own `chroma_key`.
- The inspector exposes a manual chroma key field.
- A `Pick` button arms sheet sampling mode.
- Clicking a color on the sheet stores the sampled color as `#rrggbb`.
- Gallery previews apply exact RGB chroma removal before rendering.

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
- The intended direction is a sprite owning multiple auxiliary annotations, not flattening all of them into unrelated standalone entries.

## Hot Reload

- HTML, CSS, and JS changes trigger browser reload.
- `server.py` changes restart the Python server process.
- If the current sheet has unsaved edits, the UI warns instead of force-reloading.

## Project Layout

- `web/`
  - frontend files served by the annotator
- `example_project/`
  - sample project bundled with the repo
- `example_project/sheets/`
  - Zelda sheets copied from the source game repo
- `example_project/annotations/`
  - sample annotations
- `example_project/manifest.json`
  - optional source metadata surfaced in the UI

## Runtime Entry

- Default command:
  - `uv run server.py`
- Alternate project:
  - `uv run server.py --project /abs/path/to/project`
- Expected external project layout:
  - `sheets/`
  - `annotations/`
  - optional `manifest.json`
