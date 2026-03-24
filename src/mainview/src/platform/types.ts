import type { Ref } from "vue";

export interface FileFilter {
	name: string;
	extensions: string[];
}

export interface PlatformAdapter {
	// File dialogs
	showSaveDialog(defaultName: string, filters: FileFilter[]): Promise<string | null>;
	showOpenDialog(filters: FileFilter[]): Promise<string | null>;

	// File I/O
	readFile(path: string): Promise<string>;
	writeFile(path: string, contents: string): Promise<{ ok: boolean }>;
	readImageAsDataUrl(path: string): Promise<string>;

	// OS integration
	revealFile(path: string): Promise<void>;

	// Layout persistence
	saveLayout(layout: object): Promise<{ ok: boolean }>;
	loadLayout(): Promise<object | null>;

	// Capabilities
	canSave: Ref<boolean>;
}
