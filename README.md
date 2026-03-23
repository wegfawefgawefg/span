# Span

Standalone spritesheet annotator. Native desktop app built with Electrobun, Vue 3, and TypeScript. Also runs in the browser via GitHub Pages.

## Quick Start

```bash
bun install
bun start
```

## Web Version

Span also runs in the browser. Open a local project folder via the File System Access API (Chrome/Edge) or file picker fallback (Firefox/Safari).

```bash
# Development
bun run dev:web
# Open http://localhost:5174/span/

# Production build
bun run build:web
```

The web version deploys to GitHub Pages automatically on push to master. Direct save-back works on Chrome/Edge; Firefox/Safari fall back to downloading annotation files.

## Desktop Development

```bash
# Without HMR (rebuilds on file change)
bun run dev

# With Vite HMR (live reload for Vue components)
bun run dev:hmr
```

## Project Layout

```plaintext
src/
  bun/              Electrobun main process (file I/O, menus, RPC)
  shared/           Shared RPC type definitions
  mainview/         Vue 3 webview (UI)
    main.ts         Desktop entry point (Electrobun adapter)
    main-web.ts     Web entry point (File System Access API adapter)
    src/
      platform/     Platform adapter layer
        types.ts    PlatformAdapter interface
        adapter.ts  Global API proxy + platform ref
        electrobun.ts Desktop adapter (Electrobun RPC)
        web.ts      Web adapter (File System Access API + fallback)
      components/   Vue components (panels, context menus)
      composables/  Vue composables (canvas, chroma key)
      state.ts      Reactive store
      types.ts      TypeScript interfaces
example_project/    Bundled sample project
docs/               Feature docs and design specs
```

## Use A Different Project

```bash
bun start -- --project /path/to/your/project
```

Expected project layout:

- `sheets/` — PNG spritesheet images
- `annotations/` — annotation JSON (created automatically)
- `manifest.json` — optional asset metadata

## Key Features

- Dockable, rearrangeable panel layout (Dockview)
- Sprite annotation with drag, resize, and zoom
- Inspector for editing annotation metadata
- Gallery with animated multi-frame sprite previews
- Chroma key sampling and removal
- Native macOS menus and keyboard shortcuts (desktop)
- Runs in the browser via GitHub Pages (Chrome/Edge/Firefox/Safari)
- Layout persistence across restarts (localStorage on web)
- Context menus on all panels

## Keyboard Shortcuts

| Shortcut               | Action                    |
| ---------------------- | ------------------------- |
| `Cmd+S`                | Save annotations          |
| `Cmd+D`                | Duplicate selected sprite |
| `Delete` / `Backspace` | Delete selected sprite    |
| `Space` + drag         | Pan canvas                |
| Middle mouse drag      | Pan canvas                |
| `Alt/Option` + drag    | Duplicate and drag        |
| Scroll wheel           | Zoom toward cursor        |
| `Cmd+Alt+I`            | Toggle developer tools    |

## Tech Stack

- [Electrobun](https://electrobun.dev) — native desktop runtime (Bun + system webview)
- [Vue 3](https://vuejs.org) — Composition API with TypeScript
- [Dockview](https://dockview.dev) — dockable panel layout
- [Tailwind CSS v4](https://tailwindcss.com) — utility-first styling
- [Vite](https://vitejs.dev) — build tooling and HMR

## Docs

- [Features](docs/features.md)
