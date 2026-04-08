import type { Ref } from "vue";

export interface FileFilter {
	name: string;
	extensions: string[];
}

export interface PlatformAdapter {
	// File dialogs
	showSaveDialog(defaultName: string, filters: FileFilter[]): Promise<string | null>;
	showOpenDialog(filters: FileFilter[]): Promise<string | null>;
	showOpenDirectoryDialog(prompt?: string): Promise<string | null>;
	importImageDirectory(prompt?: string): Promise<void>;
	pickImageDirectory(prompt?: string): Promise<{ directory: string; paths: string[] } | null>;
	debugLog(message: string): Promise<void>;

	// File I/O
	readFile(path: string): Promise<string>;
	listImageFiles(directory: string): Promise<string[]>;
	writeFile(path: string, contents: string): Promise<{ ok: boolean }>;
	writeImageDataUrl(path: string, dataUrl: string): Promise<{ ok: boolean }>;
	deleteFile(path: string): Promise<{ ok: boolean }>;
	readImageAsDataUrl(path: string): Promise<string>;

	// Register a dropped/selected File for later reads (web only, no-op on desktop)
	registerFile?(name: string, file: File): void;

	// OS integration
	revealFile(path: string): Promise<void>;

	// Layout persistence
	saveLayout(layout: object): Promise<{ ok: boolean }>;
	loadLayout(): Promise<object | null>;

	// Capabilities
	canSave: Ref<boolean>;
}
