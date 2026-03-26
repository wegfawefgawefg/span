// src/mainview/src/persistence.ts
import type { Annotation } from "./annotation";

export interface WorkspaceSheet {
	path: string;
	annotations: Annotation[];
	[key: string]: unknown;
}

export interface SpanFile {
	version: number;
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
}

export function serializeWorkspace(
	sheets: WorkspaceSheet[],
	spec: SpanFileSpec | null,
): string {
	const data: SpanFile = {
		version: 2,
		spec,
		sheets: sheets.map((s) => ({
			path: s.path,
			annotations: s.annotations.map((a) => ({
				id: a.id,
				entityType: a.entityType,
				aabb: a.aabb ? { ...a.aabb } : null,
				point: a.point ? { ...a.point } : null,
				properties: JSON.parse(JSON.stringify(a.properties)),
				...(a._stash && Object.keys(a._stash).length > 0
					? { _stash: { ...a._stash } }
					: {}),
			})),
		})),
	};

	return JSON.stringify(data, null, 2) + "\n";
}

export function deserializeWorkspace(raw: string): SpanFile {
	const data = JSON.parse(raw);

	if (typeof data.version !== "number") {
		throw new Error("Invalid .span file: missing version");
	}
	if (data.version > 2) {
		throw new Error(
			`Unsupported .span file version: ${data.version}. This version of Span supports version 2.`,
		);
	}

	let spec: SpanFileSpec | null = null;
	if (data.spec && typeof data.spec === "object" && data.spec.raw) {
		spec = { format: data.spec.format ?? "yaml", raw: data.spec.raw };
	}

	return {
		version: data.version,
		spec,
		sheets: (data.sheets ?? []).map((s: any) => ({
			path: s.path ?? "",
			annotations: (s.annotations ?? []).map((a: any) => ({
				id: a.id ?? "",
				entityType: a.entityType ?? "",
				aabb: a.aabb ?? null,
				point: a.point ?? null,
				properties: a.properties ?? {},
				...(a._stash ? { _stash: a._stash } : {}),
			})),
		})),
	};
}

// --- Autosave debouncing ---
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export function debouncedSave(fn: () => void, delay: number = 500): void {
	if (saveTimeout) clearTimeout(saveTimeout);
	saveTimeout = setTimeout(fn, delay);
}
