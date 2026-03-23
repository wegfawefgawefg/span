export interface Annotation {
	id: string;
	name: string;
	type: "sprite" | "tile";
	frame: number;
	x: number;
	y: number;
	width: number;
	height: number;
	direction: string;
	variant: string;
	chroma_key: string;
	tags: string;
	notes: string;
}

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

export function normalizeAnnotation(
	raw: Record<string, unknown>,
): Annotation {
	return {
		id: typeof raw.id === "string" && raw.id ? raw.id : makeId(),
		name: typeof raw.name === "string" ? raw.name : "unnamed",
		type: raw.type === "tile" ? "tile" : "sprite",
		frame:
			typeof raw.frame === "number" &&
			Number.isFinite(raw.frame) &&
			raw.frame >= 0
				? raw.frame
				: 0,
		x: typeof raw.x === "number" && Number.isFinite(raw.x) ? raw.x : 0,
		y: typeof raw.y === "number" && Number.isFinite(raw.y) ? raw.y : 0,
		width:
			typeof raw.width === "number" &&
			Number.isFinite(raw.width) &&
			raw.width > 0
				? raw.width
				: 16,
		height:
			typeof raw.height === "number" &&
			Number.isFinite(raw.height) &&
			raw.height > 0
				? raw.height
				: 16,
		direction: typeof raw.direction === "string" ? raw.direction : "",
		variant: typeof raw.variant === "string" ? raw.variant : "",
		chroma_key: typeof raw.chroma_key === "string" ? raw.chroma_key : "",
		tags: typeof raw.tags === "string" ? raw.tags : "",
		notes: typeof raw.notes === "string" ? raw.notes : "",
	};
}
