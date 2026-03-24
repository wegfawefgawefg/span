// src/mainview/src/types.ts
import type { Annotation } from "./annotation";

export type { Annotation };

export interface Sheet {
	file: string;
	name: string;
	imageUrl: string;
	annotationFile: string;
}

export interface SheetWithAnnotations extends Sheet {
	annotations: Annotation[];
}

export function makeId(): string {
	if (globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	return `annotation-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}
