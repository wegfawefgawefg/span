# span

Standalone spritesheet annotator.

## Run

```bash
cd /home/vega/Coding/GameDev/zelda_1_multiplayer/span
uv run server.py
```

Then open `http://127.0.0.1:8765`.

## Docs

- [docs/features.md](/home/vega/Coding/GameDev/zelda_1_multiplayer/span/docs/features.md)

## Layout

- `web/`: the annotator UI
- `server.py`: tiny Python server with hot reload
- `example_project/`: a runnable sample project
- `example_project/sheets/`: Zelda sheets copied from the main game repo
- `example_project/annotations/`: saved annotation JSON

## Use A Different Project

```bash
uv run server.py --project /abs/path/to/your/project
```

Expected project layout:

- `sheets/`
- `annotations/`
- optional `manifest.json`

## Dev Notes

- HTML/CSS/JS changes trigger browser reload
- `server.py` changes restart the Python process
- if the current sheet has unsaved edits, the UI warns instead of force-reloading
