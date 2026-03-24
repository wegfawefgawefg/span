// src/mainview/src/persistence.ts
import type { Annotation } from "./annotation";

export interface WorkspaceSheet {
	path: string;
	annotations: Annotation[];
	[key: string]: unknown;
}

export interface SpanFile {
	version: number;
	spec: string;
	root: string;
	sheets: SpanFileSheet[];
}

export interface SpanFileSheet {
	path: string;
	annotations: Annotation[];
}

export function serializeWorkspace(
	sheets: WorkspaceSheet[],
	specPath: string,
	root: string,
	spanFileDir?: string,
): string {
	// Make spec path relative to .span file directory if possible
	let relativeSpecPath = specPath;
	if (spanFileDir) {
		const prefix = spanFileDir.endsWith("/") ? spanFileDir : spanFileDir + "/";
		if (specPath.startsWith(prefix)) {
			relativeSpecPath = specPath.slice(prefix.length);
		}
	}

	const data: SpanFile = {
		version: 1,
		spec: relativeSpecPath,
		root,
		sheets: sheets.map((s) => ({
			path: s.path,
			annotations: s.annotations.map((a) => ({
				id: a.id,
				entityType: a.entityType,
				shapeData: { ...a.shapeData },
				propertyData: { ...a.propertyData },
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
	if (data.version > 1) {
		throw new Error(
			`Unsupported .span file version: ${data.version}. This version of Span supports version 1.`,
		);
	}

	return {
		version: data.version,
		spec: data.spec ?? "",
		root: data.root ?? "",
		sheets: (data.sheets ?? []).map((s: any) => ({
			path: s.path ?? "",
			annotations: (s.annotations ?? []).map((a: any) => ({
				id: a.id ?? "",
				entityType: a.entityType ?? "",
				shapeData: a.shapeData ?? {},
				propertyData: a.propertyData ?? {},
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
