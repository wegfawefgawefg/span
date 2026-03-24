// src/mainview/src/workspace.ts
import { ref, computed } from "vue";
import type { Annotation } from "./annotation";

export interface WorkspaceSheet {
	path: string;              // relative to root
	absolutePath: string;      // full path for loading
	annotations: Annotation[];
	status: "loaded" | "missing";
	imageUrl: string;          // blob URL or data URL
	width: number;
	height: number;
}

// --- State ---
export const sheets = ref<WorkspaceSheet[]>([]);
export const root = ref<string>("");
export const rootOverride = ref<string | null>(null);
export const spanFilePath = ref<string | null>(null); // null until first save
export const specFilePath = ref<string>("");

export const effectiveRoot = computed(() => rootOverride.value ?? root.value);
export const workspaceReady = computed(() => sheets.value.length > 0);

export const currentSheet = ref<WorkspaceSheet | null>(null);

// --- Root auto-detection ---
export function computeRoot(paths: string[]): string {
	if (paths.length === 0) return "";
	if (paths.length === 1) {
		const parts = paths[0].split("/");
		parts.pop(); // remove filename
		return parts.join("/");
	}
	const split = paths.map((p) => p.split("/"));
	const minLen = Math.min(...split.map((s) => s.length));
	let common = 0;
	for (let i = 0; i < minLen; i++) {
		if (split.every((s) => s[i] === split[0][i])) {
			common = i + 1;
		} else {
			break;
		}
	}
	return split[0].slice(0, common).join("/");
}

export function relativePath(absolutePath: string, rootPath: string): string {
	if (!rootPath) return absolutePath;
	const prefix = rootPath.endsWith("/") ? rootPath : rootPath + "/";
	if (absolutePath.startsWith(prefix)) {
		return absolutePath.slice(prefix.length);
	}
	return absolutePath;
}

// --- Actions ---
export function addSheet(sheet: WorkspaceSheet): void {
	// Dedupe by absolutePath
	if (sheets.value.some((s) => s.absolutePath === sheet.absolutePath)) return;
	sheets.value.push(sheet);
	updateRoot();
}

function updateRoot(): void {
	if (rootOverride.value) return;
	const paths = sheets.value.map((s) => s.absolutePath);
	root.value = computeRoot(paths);
	// Update relative paths
	for (const sheet of sheets.value) {
		sheet.path = relativePath(sheet.absolutePath, effectiveRoot.value);
	}
}

export function removeSheet(path: string): void {
	sheets.value = sheets.value.filter((s) => s.path !== path);
	if (currentSheet.value?.path === path) {
		currentSheet.value = sheets.value[0] ?? null;
	}
	updateRoot();
}

export function openSheetByPath(path: string): void {
	const sheet = sheets.value.find((s) => s.path === path);
	if (sheet) currentSheet.value = sheet;
}

export function resetWorkspace(): void {
	sheets.value = [];
	root.value = "";
	rootOverride.value = null;
	spanFilePath.value = null;
	specFilePath.value = "";
	currentSheet.value = null;
}
