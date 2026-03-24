import { ref } from "vue";
import type { PlatformAdapter, FileFilter } from "./types";

const LAYOUT_KEY = "span-layout";
const WORKSPACE_KEY = "span-workspace";

export interface WebPlatformAdapter extends PlatformAdapter {
	/** Register a dropped/selected File for later readFile/readImageAsDataUrl access */
	registerFile(name: string, file: File): void;
	/** Save workspace JSON to localStorage */
	saveWorkspaceToLocalStorage(data: string): void;
	/** Load workspace JSON from localStorage */
	loadWorkspaceFromLocalStorage(): string | null;
}

export function createWebAdapter(): WebPlatformAdapter {
	const canSave = ref(false); // Web can't save to arbitrary paths
	const fileRegistry = new Map<string, File>();

	return {
		canSave,

		registerFile(name: string, file: File) {
			fileRegistry.set(name, file);
		},

		async showSaveDialog(): Promise<string | null> {
			return null; // Web uses downloads instead
		},

		async showOpenDialog(filters: FileFilter[]): Promise<string | null> {
			// Create a temporary file input
			return new Promise((resolve) => {
				const input = document.createElement("input");
				input.type = "file";
				const exts = filters.flatMap(f => f.extensions);
				if (exts.length > 0) {
					input.accept = exts.map(e => `.${e}`).join(",");
				}
				input.onchange = () => {
					const file = input.files?.[0];
					if (file) {
						fileRegistry.set(file.name, file);
						resolve(file.name);
					} else {
						resolve(null);
					}
				};
				input.click();
			});
		},

		async readFile(path: string): Promise<string> {
			const file = fileRegistry.get(path);
			if (!file) throw new Error(`File not found: ${path}`);
			return await file.text();
		},

		async writeFile(_path: string, contents: string): Promise<{ ok: boolean }> {
			// Trigger download
			const blob = new Blob([contents], { type: "application/octet-stream" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = _path.split("/").pop() ?? "export";
			a.click();
			URL.revokeObjectURL(url);
			return { ok: true };
		},

		async readImageAsDataUrl(path: string): Promise<string> {
			const file = fileRegistry.get(path);
			if (!file) return "";
			return new Promise((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () => resolve("");
				reader.readAsDataURL(file);
			});
		},

		async revealFile(): Promise<void> {
			// No-op on web
		},

		async saveLayout(layout: object): Promise<{ ok: boolean }> {
			try {
				localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},

		async loadLayout(): Promise<object | null> {
			try {
				const raw = localStorage.getItem(LAYOUT_KEY);
				return raw ? JSON.parse(raw) : null;
			} catch {
				return null;
			}
		},

		saveWorkspaceToLocalStorage(data: string) {
			try {
				localStorage.setItem(WORKSPACE_KEY, data);
			} catch {
				console.error("Failed to save workspace to localStorage");
			}
		},

		loadWorkspaceFromLocalStorage(): string | null {
			try {
				return localStorage.getItem(WORKSPACE_KEY);
			} catch {
				return null;
			}
		},
	};
}
