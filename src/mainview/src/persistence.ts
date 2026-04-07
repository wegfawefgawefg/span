// src/mainview/src/persistence.ts
import type { Annotation } from "./annotation";

export interface WorkspaceSheet {
	path: string;
	annotations: Annotation[];
	[key: string]: unknown;
}

export interface SpanFile {
	version: number;
	specPath?: string | null;
	exportPath?: string | null;
	spec: SpanFileSpec | null;
	palettes?: SpanFilePalette[];
	activePaletteId?: string | null;
	lastOpenSheetPath?: string | null;
	selectedAnnotationId?: string | null;
	sheets: SpanFileSheet[];
}

export interface SpanFileSpec {
	format: "json" | "yaml";
	raw: string;
}

export interface SpanFileSheet {
	path: string;
	annotations: Annotation[];
	view?: {
		gridEnabled: boolean;
		gridWidth: number;
		gridHeight: number;
		zoom: number;
		centerX?: number | null;
		centerY?: number | null;
	};
}

export interface SpanFilePalette {
	id: string;
	name: string;
	colors: string[];
}

export function serializeWorkspace(
	sheets: WorkspaceSheet[],
	spec: SpanFileSpec | null,
	palettes: SpanFilePalette[],
	activePaletteId?: string | null,
	specPath?: string | null,
	exportPath?: string | null,
	lastOpenSheetPath?: string | null,
	selectedAnnotationId?: string | null,
): string {
	const data: SpanFile = {
		version: 5,
		...(specPath ? { specPath } : {}),
		...(exportPath ? { exportPath } : {}),
		spec: specPath ? null : spec,
		palettes: palettes.map((palette) => ({
			id: palette.id,
			name: palette.name,
			colors: [...palette.colors],
		})),
		activePaletteId: activePaletteId ?? null,
		lastOpenSheetPath: lastOpenSheetPath ?? null,
		selectedAnnotationId: selectedAnnotationId ?? null,
		sheets: sheets.map((s) => ({
			path: s.path,
			annotations: s.annotations.map((a) => ({
				id: a.id,
				entityType: a.entityType,
				aabb: a.aabb ? { ...a.aabb } : null,
				point: a.point ? { ...a.point } : null,
				chromaKey: a.chromaKey ?? null,
				properties: JSON.parse(JSON.stringify(a.properties)),
				...(a._stash && Object.keys(a._stash).length > 0
					? { _stash: { ...a._stash } }
					: {}),
			})),
			...(s.view ? { view: { ...s.view } } : {}),
		})),
	};

	return JSON.stringify(data, null, 2) + "\n";
}

export function deserializeWorkspace(raw: string): SpanFile {
	const data = JSON.parse(raw);

	if (typeof data.version !== "number") {
		throw new Error("Invalid .span file: missing version");
	}
	if (data.version > 5) {
		throw new Error(
			`Unsupported .span file version: ${data.version}. This version of Span supports version 5.`,
		);
	}

	let spec: SpanFileSpec | null = null;
	if (data.spec && typeof data.spec === "object" && data.spec.raw) {
		spec = { format: data.spec.format ?? "yaml", raw: data.spec.raw };
	}

	return {
		version: data.version,
		specPath: typeof data.specPath === "string" ? data.specPath : null,
		exportPath: typeof data.exportPath === "string" ? data.exportPath : null,
		spec,
		palettes: (data.palettes ?? []).map((palette: any) => ({
			id: palette?.id ?? "",
			name: palette?.name ?? "",
			colors: Array.isArray(palette?.colors) ? palette.colors.filter((c: unknown) => typeof c === "string") : [],
		})).filter((palette: SpanFilePalette) => palette.id && palette.name && palette.colors.length > 0),
		activePaletteId: typeof data.activePaletteId === "string" ? data.activePaletteId : null,
		lastOpenSheetPath: typeof data.lastOpenSheetPath === "string" ? data.lastOpenSheetPath : null,
		selectedAnnotationId: typeof data.selectedAnnotationId === "string" ? data.selectedAnnotationId : null,
		sheets: (data.sheets ?? []).map((s: any) => ({
			path: s.path ?? "",
			annotations: (s.annotations ?? []).map((a: any) => ({
				id: a.id ?? "",
				entityType: a.entityType ?? "",
				aabb: a.aabb ?? null,
				point: a.point ?? null,
				chromaKey: a.chromaKey ?? null,
				properties: a.properties ?? {},
				...(a._stash ? { _stash: a._stash } : {}),
			})),
			...(s.view ? { view: s.view } : {}),
		})),
	};
}

// --- Autosave debouncing ---
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(fn: () => void, delay: number = 500): void {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(fn, delay);
}
