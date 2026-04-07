# Dockview "Whisper" Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle all dockview chrome (tabs, sashes, drag & drop, floating panels) into a minimal "Whisper" theme where chrome disappears and content breathes.

**Architecture:** All changes are CSS-only, modifying the existing `.dockview-theme-dark` block in `src/mainview/src/style.css`. No component or JS changes. We replace the current dockview overrides with new variable values and targeted class overrides.

**Tech Stack:** CSS (nested selectors via Tailwind/PostCSS), dockview-core v5.1 CSS custom properties

---

### Task 1: Replace tab background variables — all tabs on surface-0

**Files:**
- Modify: `src/mainview/src/style.css:257-261` (tab background variables)

- [ ] **Step 1: Update tab background variables to all use surface-0**

In `.dockview-theme-dark`, replace the tab backgrounds section:

```css
/* Tab backgrounds — all flat on surface-0 (Whisper: no background differentiation) */
--dv-activegroup-visiblepanel-tab-background-color: var(--color-surface-0);
--dv-activegroup-hiddenpanel-tab-background-color: var(--color-surface-0);
--dv-inactivegroup-visiblepanel-tab-background-color: var(--color-surface-0);
--dv-inactivegroup-hiddenpanel-tab-background-color: var(--color-surface-0);
```

- [ ] **Step 2: Verify in browser**

Run: `bun run dev` (if not already running)
Expected: All tabs should have the same flat background, no raised/recessed tab surfaces.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "style: flatten all tab backgrounds to surface-0"
```

---

### Task 2: Update tab text colors for copper glow active state

**Files:**
- Modify: `src/mainview/src/style.css:263-267` (tab text variables)

- [ ] **Step 1: Update tab text color variables**

Replace the tab text section:

```css
/* Tab text — active group uses copper-bright, inactive group uses dim */
--dv-activegroup-visiblepanel-tab-color: var(--color-copper-bright);
--dv-activegroup-hiddenpanel-tab-color: var(--color-text-faint);
--dv-inactivegroup-visiblepanel-tab-color: var(--color-text-dim);
--dv-inactivegroup-hiddenpanel-tab-color: var(--color-text-faint);
```

- [ ] **Step 2: Verify in browser**

Expected: Active tab in the focused group shows copper-bright text. Active tab in unfocused groups shows dim text. All inactive tabs show faint text.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "style: copper-bright text for active tab, faint for inactive"
```

---

### Task 3: Add copper text glow and font-weight on active tab

**Files:**
- Modify: `src/mainview/src/style.css` (add new class overrides inside `.dockview-theme-dark`, after the existing `.dv-default-tab` block around line 310)

- [ ] **Step 1: Add active tab glow styles**

Add these rules inside `.dockview-theme-dark`, after the existing `& .dv-default-tab` block:

```css
/* Whisper: copper glow on active tab in active group */
& .dv-groupview.dv-active-group .dv-tab.dv-active-tab .dv-default-tab {
	font-weight: 500;
	text-shadow: 0 0 10px rgba(200, 136, 90, 0.3);
}
```

- [ ] **Step 2: Verify in browser**

Expected: The active tab in the focused group has a subtle copper text glow and slightly bolder weight. Inactive groups' active tabs have no glow.

- [ ] **Step 3: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "style: add copper text-shadow glow on active tab"
```

---

### Task 4: Remove tab dividers and add hover transition

**Files:**
- Modify: `src/mainview/src/style.css:270` (tab divider variable)
- Modify: `src/mainview/src/style.css` (add hover rule inside `.dockview-theme-dark`)

- [ ] **Step 1: Set tab divider to transparent**

Change the tab divider line:

```css
--dv-tab-divider-color: transparent;
```

- [ ] **Step 2: Add inactive tab hover transition**

Add this rule inside `.dockview-theme-dark`, after the active tab glow rule from Task 3:

```css
/* Whisper: inactive tabs lift to dim on hover */
& .dv-tab.dv-inactive-tab .dv-default-tab {
	transition: color 0.15s;
}
& .dv-tab.dv-inactive-tab:hover .dv-default-tab {
	color: var(--color-text-dim);
}
```

- [ ] **Step 3: Update tab padding**

Update the existing `& .dv-default-tab` rule to use 12px padding per the spec:

```css
/* Slim tab padding */
& .dv-default-tab {
	padding: 0 12px;
	min-width: 0;
}
```

- [ ] **Step 4: Verify in browser**

Expected: No vertical lines between tabs. Hovering an inactive tab transitions its text color from faint to dim.

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "style: remove tab dividers, add hover transition, adjust padding"
```

---

### Task 5: Style sashes — invisible at rest, copper glow on hover

**Files:**
- Modify: `src/mainview/src/style.css` (update sash variables and add sash hover rule inside `.dockview-theme-dark`)

- [ ] **Step 1: Update sash variables**

The existing variables already set `--dv-sash-color: transparent` and `--dv-active-sash-color: var(--color-copper)`. Add transition timing:

```css
--dv-active-sash-transition-duration: 0.15s;
--dv-active-sash-transition-delay: 0.3s;
```

Add these two lines in the "Focus & interaction" section, after `--dv-active-sash-color`.

- [ ] **Step 2: Add sash glow on hover**

Add this rule inside `.dockview-theme-dark`:

```css
/* Whisper: copper glow on active sash */
& .dv-sash:hover,
& .dv-sash:active {
	box-shadow: 0 0 8px rgba(200, 136, 90, 0.25);
}
```

- [ ] **Step 3: Verify in browser**

Expected: Sashes are invisible. On hover (after 0.3s delay), a copper line appears with a subtle glow. While dragging, the copper line is immediate.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "style: invisible sashes with copper glow on hover"
```

---

### Task 6: Style drag & drop overlays

**Files:**
- Modify: `src/mainview/src/style.css` (update drag variables and add drop target override inside `.dockview-theme-dark`)

- [ ] **Step 1: Update drag & drop variables**

Replace the drag & drop section:

```css
/* Drag & drop — subtle copper wash */
--dv-drag-over-background-color: rgba(200, 136, 90, 0.08);
--dv-drag-over-border: 1px solid rgba(200, 136, 90, 0.25);
--dv-transition-duration: 150ms;
```

- [ ] **Step 2: Add drop target border radius**

Add this rule inside `.dockview-theme-dark`:

```css
/* Whisper: rounded drop targets */
& .dv-drop-target-selection {
	border-radius: 4px;
	margin: 4px;
}
```

- [ ] **Step 3: Style the dragging tab**

Add this rule inside `.dockview-theme-dark`:

```css
/* Whisper: dragged tab ghost */
& .dv-tab.dv-tab-dragging {
	opacity: 0.5;
}
```

- [ ] **Step 4: Verify in browser**

Drag a tab to another panel. Expected: The source tab fades to 50% opacity. The drop zone shows a very subtle copper wash with a faint copper border, rounded corners, slightly inset from panel edges.

- [ ] **Step 5: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "style: subtle copper drop targets with rounded corners"
```

---

### Task 7: Style floating panels

**Files:**
- Modify: `src/mainview/src/style.css` (update floating shadow variable and add floating panel overrides inside `.dockview-theme-dark`)

- [ ] **Step 1: Update floating panel shadow**

Replace the floating section:

```css
/* Floating panels — deep shadow with faint copper edge */
--dv-floating-box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(200, 136, 90, 0.15);
```

- [ ] **Step 2: Add floating panel border radius**

Add this rule inside `.dockview-theme-dark`:

```css
/* Whisper: rounded floating panels */
& .dv-resize-container {
	border-radius: 4px;
	overflow: hidden;
}
```

- [ ] **Step 3: Verify in browser**

Drag a tab out to create a floating panel. Expected: The floating panel has rounded corners, a deep shadow, and a faint copper edge glow.

- [ ] **Step 4: Commit**

```bash
git add src/mainview/src/style.css
git commit -m "style: rounded floating panels with copper edge glow"
```

---

### Task 8: Final review and cleanup

**Files:**
- Review: `src/mainview/src/style.css:249-330` (approximate range of all dockview theme styles)

- [ ] **Step 1: Read the full `.dockview-theme-dark` block**

Verify all rules are well-organized with clear comment sections. Remove any now-redundant rules from the original theme.

- [ ] **Step 2: Verify all states in browser**

Manually test:
- Active tab glow in focused group
- Active tab (no glow) in unfocused group
- Inactive tab hover transition
- Close button appear on hover
- Sash invisible → copper on hover
- Drag tab → source fades, drop target shows copper wash
- Floating panel with rounded corners and shadow

- [ ] **Step 3: Final commit**

```bash
git add src/mainview/src/style.css
git commit -m "style: complete Whisper theme for dockview chrome"
```
