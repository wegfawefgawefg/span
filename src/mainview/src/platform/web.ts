import { ref } from "vue";
import type { PlatformAdapter } from "./types";
import type { Annotation, SheetWithAnnotations } from "../types";
import { normalizeAnnotation } from "../types";
import { projectPath, projectOpen } from "./adapter";

const LAYOUT_KEY = "span-layout";

export interface WebPlatformAdapter extends PlatformAdapter {
	/** Set files from a file input (fallback mode). Call loadProjectData after. */
	setFallbackFiles(files: FileList): { ok: boolean; error?: string };
	/** Open project from a pre-obtained directory handle (from drag-and-drop). Call loadProjectData after. */
	openWithHandle(handle: FileSystemDirectoryHandle): Promise<{ ok: boolean; error?: string }>;
}

export function createWebAdapter(): WebPlatformAdapter {
	let dirHandle: FileSystemDirectoryHandle | null = null;
	let fallbackFiles: Map<string, File> | null = null;
	let lastBlobUrl: string | null = null;
	const canSave = ref(false);

	async function readSubDir(
		name: string,
	): Promise<FileSystemDirectoryHandle | null> {
		if (!dirHandle) return null;
		try {
			return await dirHandle.getDirectoryHandle(name);
		} catch {
			return null;
		}
	}

	async function readJsonFile(
		dir: FileSystemDirectoryHandle,
		name: string,
	): Promise<unknown | null> {
		try {
			const fh = await dir.getFileHandle(name);
			const file = await fh.getFile();
			return JSON.parse(await file.text());
		} catch {
			return null;
		}
	}

	async function loadManifest(): Promise<Map<string, Record<string, unknown>>> {
		const result = new Map<string, Record<string, unknown>>();
		if (!dirHandle) return result;
		try {
			const data = (await readJsonFile(dirHandle, "manifest.json")) as any;
			for (const asset of data?.assets ?? []) {
				if (typeof asset.file === "string") result.set(asset.file, asset);
			}
		} catch {}
		return result;
	}

	async function loadFromHandle(): Promise<SheetWithAnnotations[]> {
		const sheetsDir = await readSubDir("sheets");
		if (!sheetsDir) return [];
		const annDir = await readSubDir("annotations");
		const manifest = await loadManifest();

		const pngs: string[] = [];
		for await (const e of sheetsDir.values()) {
			if (e.kind === "file" && e.name.toLowerCase().endsWith(".png"))
				pngs.push(e.name);
		}
		pngs.sort();

		const sheets: SheetWithAnnotations[] = [];
		for (const file of pngs) {
			const stem = file.replace(/\.png$/i, "");
			const annFile = `${stem}.annotations.json`;
			let annotations: Annotation[] = [];
			if (annDir) {
				const data = (await readJsonFile(annDir, annFile)) as any;
				if (Array.isArray(data?.annotations)) {
					annotations = data.annotations.map(
						(a: Record<string, unknown>) => normalizeAnnotation(a),
					);
				}
			}
			const asset = manifest.get(file) ?? {};
			sheets.push({
				file,
				name: (asset.name as string) ?? stem,
				imageUrl: "",
				annotationFile: `annotations/${annFile}`,
				annotations,
			});
		}
		return sheets;
	}

	async function loadFromFallback(): Promise<SheetWithAnnotations[]> {
		if (!fallbackFiles) return [];
		const pngs: string[] = [];
		const annFiles = new Map<string, File>();

		for (const [path, file] of fallbackFiles) {
			if (path.startsWith("sheets/") && path.toLowerCase().endsWith(".png"))
				pngs.push(path.replace("sheets/", ""));
			else if (
				path.startsWith("annotations/") &&
				path.endsWith(".annotations.json")
			)
				annFiles.set(path.replace("annotations/", ""), file);
		}
		pngs.sort();

		const sheets: SheetWithAnnotations[] = [];
		for (const file of pngs) {
			const stem = file.replace(/\.png$/i, "");
			const annFile = `${stem}.annotations.json`;
			let annotations: Annotation[] = [];
			const af = annFiles.get(annFile);
			if (af) {
				try {
					const data = JSON.parse(await af.text());
					if (Array.isArray(data?.annotations)) {
						annotations = data.annotations.map(
							(a: Record<string, unknown>) => normalizeAnnotation(a),
						);
					}
				} catch {}
			}
			sheets.push({
				file,
				name: stem,
				imageUrl: "",
				annotationFile: `annotations/${annFile}`,
				annotations,
			});
		}
		return sheets;
	}

	return {
		canSave,

		async getProjectAnnotations() {
			if (dirHandle) return loadFromHandle();
			if (fallbackFiles) return loadFromFallback();
			return [];
		},

		async saveAnnotations(sheet, annotations) {
			const stem = sheet.replace(/\.png$/i, "");
			const filename = `${stem}.annotations.json`;
			const payload =
				JSON.stringify({ image: sheet, annotations }, null, 2) + "\n";

			if (dirHandle && canSave.value) {
				try {
					const annDir = await dirHandle.getDirectoryHandle(
						"annotations",
						{ create: true },
					);
					const fh = await annDir.getFileHandle(filename, {
						create: true,
					});
					const w = await fh.createWritable();
					await w.write(payload);
					await w.close();
					return { ok: true };
				} catch {
					canSave.value = false;
				}
			}

			// Download fallback
			const blob = new Blob([payload], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
			return { ok: true };
		},

		async getSheetImage(sheet) {
			if (lastBlobUrl) {
				URL.revokeObjectURL(lastBlobUrl);
				lastBlobUrl = null;
			}

			if (dirHandle) {
				const sheetsDir = await readSubDir("sheets");
				if (sheetsDir) {
					const fh = await sheetsDir.getFileHandle(sheet);
					const file = await fh.getFile();
					const url = URL.createObjectURL(file);
					lastBlobUrl = url;
					return url;
				}
			}

			if (fallbackFiles) {
				const file = fallbackFiles.get(`sheets/${sheet}`);
				if (file) {
					const url = URL.createObjectURL(file);
					lastBlobUrl = url;
					return url;
				}
			}

			return "";
		},

		async pickProjectDirectory() {
			if (!("showDirectoryPicker" in window)) return null;

			try {
				dirHandle = await (window as any).showDirectoryPicker({
					mode: "readwrite",
				});
				if (!dirHandle) return null;

				const sheetsDir = await readSubDir("sheets");
				if (!sheetsDir) {
					dirHandle = null;
					throw new Error("no-sheets");
				}

				let hasPng = false;
				for await (const e of sheetsDir.values()) {
					if (
						e.kind === "file" &&
						e.name.toLowerCase().endsWith(".png")
					) {
						hasPng = true;
						break;
					}
				}
				if (!hasPng) {
					dirHandle = null;
					throw new Error("no-png");
				}

				canSave.value = true;
				projectPath.value = dirHandle.name;
				projectOpen.value = true;
				return dirHandle.name;
			} catch (e: any) {
				if (e?.message === "no-sheets" || e?.message === "no-png")
					throw e;
				if (e?.name === "AbortError") return null;
				throw e;
			}
		},

		async revealSheet() {},

		async saveLayout(layout) {
			try {
				localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
				return { ok: true };
			} catch {
				return { ok: false };
			}
		},

		async loadLayout() {
			try {
				const raw = localStorage.getItem(LAYOUT_KEY);
				return raw ? JSON.parse(raw) : null;
			} catch {
				return null;
			}
		},

		setFallbackFiles(files: FileList) {
			const fileMap = new Map<string, File>();
			for (const file of files) {
				const parts = file.webkitRelativePath.split("/");
				if (parts.length < 2) continue;
				fileMap.set(parts.slice(1).join("/"), file);
			}

			let hasPng = false;
			for (const path of fileMap.keys()) {
				if (
					path.startsWith("sheets/") &&
					path.toLowerCase().endsWith(".png")
				) {
					hasPng = true;
					break;
				}
			}
			if (!hasPng) {
				return {
					ok: false,
					error: "No spritesheet files found in this folder",
				};
			}

			fallbackFiles = fileMap;
			canSave.value = false;
			projectPath.value =
				files[0]?.webkitRelativePath.split("/")[0] ?? "project";
			projectOpen.value = true;
			return { ok: true };
		},

		async openWithHandle(handle: FileSystemDirectoryHandle) {
			dirHandle = handle;

			const sheetsDir = await readSubDir("sheets");
			if (!sheetsDir) {
				dirHandle = null;
				return { ok: false, error: "No sheets/ directory found" };
			}

			let hasPng = false;
			for await (const e of sheetsDir.values()) {
				if (e.kind === "file" && e.name.toLowerCase().endsWith(".png")) {
					hasPng = true;
					break;
				}
			}
			if (!hasPng) {
				dirHandle = null;
				return { ok: false, error: "No spritesheet files found in this folder" };
			}

			canSave.value = true;
			projectPath.value = handle.name;
			projectOpen.value = true;
			return { ok: true };
		},
	};
}
