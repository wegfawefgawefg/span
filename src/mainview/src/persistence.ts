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
	spec: SpanFileSpec | null;
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
	};
}

export function serializeWorkspace(
	sheets: WorkspaceSheet[],
	spec: SpanFileSpec | null,
	specPath?: string | null,
): string {
	const data: SpanFile = {
		version: 4,
		...(specPath ? { specPath } : {}),
		spec: specPath ? null : spec,
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
	if (data.version > 4) {
		throw new Error(
			`Unsupported .span file version: ${data.version}. This version of Span supports version 4.`,
		);
	}

	let spec: SpanFileSpec | null = null;
	if (data.spec && typeof data.spec === "object" && data.spec.raw) {
		spec = { format: data.spec.format ?? "yaml", raw: data.spec.raw };
	}

	return {
		version: data.version,
		specPath: typeof data.specPath === "string" ? data.specPath : null,
		spec,
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
