export interface ChromaColor {
	r: number;
	g: number;
	b: number;
}

export function parseHexColor(value: string): ChromaColor | null {
	const match = value
		.trim()
		.toLowerCase()
		.match(/^#?([0-9a-f]{6})$/);
	if (!match) return null;
	const hex = match[1];
	return {
		r: parseInt(hex.slice(0, 2), 16),
		g: parseInt(hex.slice(2, 4), 16),
		b: parseInt(hex.slice(4, 6), 16),
	};
}

export function applyChromaKey(
	imageData: ImageData,
	chroma: ChromaColor,
): void {
	const data = imageData.data;
	for (let i = 0; i < data.length; i += 4) {
		if (
			data[i] === chroma.r &&
			data[i + 1] === chroma.g &&
			data[i + 2] === chroma.b
		) {
			data[i + 3] = 0;
		}
	}
}
