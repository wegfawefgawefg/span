import { THEMES } from "./themes";

export interface MenuItem {
	label: string;
	action?: string;
	shortcut?: string;
	separator?: boolean;
	disabled?: () => boolean;
	checked?: boolean;
	children?: MenuItem[];
}

export interface MenuSection {
	label: string;
	items: MenuItem[];
}

export function getMenus(options?: {
	isPanelOpen?: (panelId: string) => boolean;
	currentThemeId?: string;
}): MenuSection[] {
	const isPanelOpen = options?.isPanelOpen ?? (() => false);
	const currentThemeId = options?.currentThemeId ?? "whisper";

	const themeChildren: MenuItem[] = [
		...THEMES.filter((t) => ["whisper", "frost", "ember", "daylight"].includes(t.id)).map((t) => ({
			label: t.label,
			action: `setTheme:${t.id}`,
			checked: currentThemeId === t.id,
		})),
		{ separator: true, label: "" },
		...THEMES.filter((t) => ["aseprite", "gamemaker"].includes(t.id)).map((t) => ({
			label: t.label,
			action: `setTheme:${t.id}`,
			checked: currentThemeId === t.id,
		})),
		{ separator: true, label: "" },
		...THEMES.filter((t) => ["classic-dark", "classic-light", "vscode", "dracula"].includes(t.id)).map((t) => ({
			label: t.label,
			action: `setTheme:${t.id}`,
			checked: currentThemeId === t.id,
		})),
	];

	return [
		{
			label: "File",
			items: [
				{ label: "Open Folder\u2026", action: "openFolder", shortcut: "Cmd+O" },
				{ label: "Close Project", action: "closeProject" },
				{ separator: true },
				{ label: "Import Spec\u2026", action: "importSpec" },
				{ label: "Export Spec\u2026", action: "exportSpec" },
				{ label: "Import Palette\u2026", action: "importPalette" },
				{ label: "Import Sheet\u2026", action: "importSheet" },
				{ separator: true },
				{ label: "Save", action: "save", shortcut: "Cmd+S" },
				{ label: "Save As\u2026", action: "saveAs", shortcut: "Cmd+Shift+S" },
				{ separator: true },
				{ label: "Export\u2026", action: "export", shortcut: "Cmd+E" },
			],
		},
		{
			label: "Edit",
			items: [
				{ label: "Undo", action: "undo", shortcut: "Cmd+Z" },
				{ label: "Redo", action: "redo", shortcut: "Cmd+Shift+Z" },
				{ separator: true },
				{ label: "Copy Pixels", action: "copyPixels", shortcut: "Cmd+C" },
				{ label: "Cut Pixels", action: "cutPixels", shortcut: "Cmd+X" },
				{ label: "Paste Pixels", action: "pastePixels", shortcut: "Cmd+V" },
				{ label: "Delete Pixels", action: "deletePixels", shortcut: "Backspace" },
				{ label: "Resize Canvas…", action: "resizeCanvas" },
				{ separator: true },
				{ label: "Add Annotation", action: "addAnnotation" },
				{ label: "Duplicate Annotation", action: "duplicateAnnotation", shortcut: "Cmd+D" },
				{ label: "Delete Annotation", action: "deleteAnnotation", shortcut: "Backspace" },
			],
		},
		{
			label: "View",
			items: [
				{ label: "Reload Window", action: "reloadWindow", shortcut: "F5" },
				{ separator: true },
				{ label: "Sheets", action: "addPanel:sheets", checked: isPanelOpen("sheets") },
				{ label: "Canvas", action: "addPanel:sprite-canvas", checked: isPanelOpen("sprite-canvas") },
				{ label: "Paint", action: "addPanel:paint", checked: isPanelOpen("paint") },
				{ label: "Inspector", action: "addPanel:inspector", checked: isPanelOpen("inspector") },
				{ label: "Sprites In Sheet", action: "addPanel:annotations", checked: isPanelOpen("annotations") },
				{ label: "Gallery", action: "addPanel:gallery", checked: isPanelOpen("gallery") },
				{ label: "Spec Editor", action: "addPanel:spec-editor", checked: isPanelOpen("spec-editor") },
				{ separator: true },
				{ label: "Theme", children: themeChildren },
				{ separator: true },
				{ label: "Reset Panel Layout", action: "resetLayout" },
			],
		},
	];
}
