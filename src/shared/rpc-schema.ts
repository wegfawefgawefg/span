import type { RPCSchema } from "electrobun/bun";

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

export type SpanRPC = {
	bun: RPCSchema<{
		requests: {
			getProjectAnnotations: {
				params: {};
				response: SheetWithAnnotations[];
			};
			saveAnnotations: {
				params: { sheet: string; annotations: Annotation[] };
				response: { ok: boolean };
			};
			getSheetImage: {
				params: { sheet: string };
				response: string;
			};
			pickProjectDirectory: {
				params: {};
				response: string | null;
			};
			saveLayout: {
				params: { layout: object };
				response: { ok: boolean };
			};
			loadLayout: {
				params: {};
				response: object | null;
			};
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {
			canClose: {
				params: {};
				response: boolean;
			};
			addSprite: {
				params: {};
				response: void;
			};
			duplicateSprite: {
				params: {};
				response: void;
			};
			deleteSprite: {
				params: {};
				response: void;
			};
			triggerSave: {
				params: {};
				response: void;
			};
			resetLayout: {
				params: {};
				response: void;
			};
			addPanel: {
				params: { panelId: string };
				response: void;
			};
		};
		messages: {
			projectLoaded: { projectPath: string };
		};
	}>;
};
