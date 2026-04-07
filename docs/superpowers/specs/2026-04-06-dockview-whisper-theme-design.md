# Dockview "Whisper" Theme Design

**Date:** 2026-04-06  
**Scope:** Full dockview chrome — tabs, sashes, drag & drop, floating panels  
**Direction:** Modern/minimal. Chrome disappears, content breathes.

## Tab Bar

### Layout
- Height: 26px
- Font: IBM Plex Sans, 11px
- No background differentiation between tabs — all tabs sit on surface-0
- No dividers or separators between tabs
- Horizontal padding: 12px per tab
- Close buttons: hidden by default, appear on tab hover (opacity 0 → 1, 0.15s)

### Active Tab — Active Group
- Text color: copper-bright (`#e4a46e` / `--color-copper-bright`)
- Font weight: 500
- Text shadow: `0 0 10px rgba(200, 136, 90, 0.3)` (copper glow)
- No background change

### Active Tab — Inactive Group
- Text color: text-dim (`#9b9484` / `--color-text-dim`)
- No glow, no font weight change
- No background change

### Inactive Tabs (all groups)
- Text color: text-faint (`#6b6558` / `--color-text-faint`)
- Hover: transition to text-dim (`#9b9484`), 0.15s

### Tab Bar Container
- Background: surface-0 (`--color-surface-0`)
- No bottom border

## Sashes & Resize Handles

### Default State
- Sash color: transparent (invisible)
- Only the existing 1px border between panel groups is visible (`--color-border`)

### Hover State
- Color: copper (`#c8885a` / `--color-copper`)
- Width: 2px (dockview default sash hit area, visual width via color)
- Glow: `box-shadow: 0 0 8px rgba(200, 136, 90, 0.25)` (via CSS override on `.dv-sash`)
- Transition: 0.15s duration, 0.3s delay (delayed reveal to avoid flicker during normal mouse movement)

### Active/Dragging State
- Same copper color, immediate (no delay)

## Drag & Drop

### Drop Target Overlay
- Background: `rgba(200, 136, 90, 0.08)` (very subtle copper wash)
- Border: `1px solid rgba(200, 136, 90, 0.25)`
- Border radius: 4px
- Inset: 4px from panel edges
- Transition: 0.15s

### Dragged Tab Ghost (best-effort)
Dockview controls the drag ghost element internally. Style via `.dv-tab.dv-tab-dragging` where possible. Target appearance:
- Reduced opacity (0.5) on the source tab
- If the ghost element is styleable: surface-2 bg, faint copper border, 4px radius, drop shadow

## Floating Panels

- Background: surface-1 (`--color-surface-1`)
- Border: `1px solid var(--color-border)`
- Border radius: 4px
- Shadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(200, 136, 90, 0.15)`
- Tab bar inside floating panel follows the same tab styling rules

## Implementation Notes

All changes are CSS-only, applied through:
1. `--dv-*` CSS custom properties on `.dockview-theme-dark`
2. Targeted class overrides nested under `.dockview-theme-dark` for styles not exposed as variables (tab hover, sash glow, drop target radius)

No component changes required. No JavaScript changes.
