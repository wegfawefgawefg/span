// Shared menu structure used by both native (Electrobun) and web menubars.

export interface MenuItem {
	label: string;
	action?: string;
	shortcut?: string;
	separator?: boolean;
	disabled?: () => boolean;
	children?: MenuItem[];
}

export interface MenuSection {
	label: string;
	items: MenuItem[];
}

export function getMenus(): MenuSection[] {
	return [
		{
			label: "File",
			items: [
				{ label: "Open\u2026", action: "open", shortcut: "Cmd+O" },
				{ separator: true },
				{ label: "Import Spec\u2026", action: "importSpec" },
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
				{ label: "Add Annotation", action: "addAnnotation" },
				{ label: "Duplicate Annotation", action: "duplicateAnnotation", shortcut: "Cmd+D" },
				{ label: "Delete Annotation", action: "deleteAnnotation", shortcut: "Backspace" },
			],
		},
		{
			label: "View",
			items: [
				{ label: "Sheets", action: "addPanel:sheets" },
				{ label: "Canvas", action: "addPanel:sprite-canvas" },
				{ label: "Inspector", action: "addPanel:inspector" },
				{ label: "Sprites In Sheet", action: "addPanel:annotations" },
				{ label: "Gallery", action: "addPanel:gallery" },
				{ separator: true },
				{ label: "Reset Panel Layout", action: "resetLayout" },
			],
		},
	];
}
