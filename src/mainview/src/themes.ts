import {
	themeDark,
	themeLight,
	themeVisualStudio,
	themeDracula,
} from "dockview-core";
import type { DockviewTheme } from "dockview-core";

export interface Theme {
	id: string;
	label: string;
	dockviewTheme: DockviewTheme;
	cssClass?: string;
}

export const THEMES: Theme[] = [
	// Custom
	{ id: "whisper", label: "Whisper", dockviewTheme: themeDark, cssClass: "dv-theme-whisper" },
	{ id: "frost", label: "Frost", dockviewTheme: themeDark, cssClass: "dv-theme-frost" },
	{ id: "ember", label: "Ember", dockviewTheme: themeDark, cssClass: "dv-theme-ember" },
	{ id: "daylight", label: "Daylight", dockviewTheme: themeLight, cssClass: "dv-theme-daylight" },
	// Retro
	{ id: "aseprite", label: "Aseprite", dockviewTheme: themeDark, cssClass: "dv-theme-aseprite" },
	{ id: "gamemaker", label: "GameMaker", dockviewTheme: themeLight, cssClass: "dv-theme-gamemaker" },
	// Built-in
	{ id: "classic-dark", label: "Dark (Classic)", dockviewTheme: themeDark },
	{ id: "classic-light", label: "Light (Classic)", dockviewTheme: themeLight },
	{ id: "vscode", label: "VS Code", dockviewTheme: themeVisualStudio },
	{ id: "dracula", label: "Dracula", dockviewTheme: themeDracula },
];

const THEME_MAP = new Map(THEMES.map((t) => [t.id, t]));

export function getTheme(id: string): Theme {
	return THEME_MAP.get(id) ?? THEMES[0];
}

export function getDefaultTheme(): Theme {
	return THEMES[0];
}

export const THEME_STORAGE_KEY = "span-theme";
