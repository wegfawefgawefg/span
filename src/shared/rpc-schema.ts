import type { RPCSchema } from "electrobun/bun";

export interface FileFilter {
	name: string;
	extensions: string[];
}

export type SpanRPC = {
	bun: RPCSchema<{
		requests: {
			showSaveDialog: {
				params: { defaultName: string; filters: FileFilter[] };
				response: string | null;
			};
			showOpenDialog: {
				params: { filters: FileFilter[] };
				response: string | null;
			};
			showOpenDirectoryDialog: {
				params: { prompt?: string };
				response: string | null;
			};
			importImageDirectory: {
				params: { prompt?: string };
				response: void;
			};
			pickImageDirectory: {
				params: { prompt?: string };
				response: { directory: string; paths: string[] } | null;
			};
			debugLog: {
				params: { message: string };
				response: void;
			};
			readFile: {
				params: { path: string };
				response: string;
			};
			listImageFiles: {
				params: { directory: string };
				response: string[];
			};
			writeFile: {
				params: { path: string; contents: string };
				response: { ok: boolean };
			};
			writeImageDataUrl: {
				params: { path: string; dataUrl: string };
				response: { ok: boolean };
			};
			deleteFile: {
				params: { path: string };
				response: { ok: boolean };
			};
			readImageAsDataUrl: {
				params: { path: string };
				response: string;
			};
			revealFile: {
				params: { path: string };
				response: void;
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
				response: { needsSaveAs: boolean };
			};
			triggerSaveAs: {
				params: { path: string };
				response: void;
			};
			triggerOpen: {
				params: { path: string };
				response: void;
			};
			triggerExport: {
				params: { path: string };
				response: void;
			};
			triggerImportSpec: {
				params: { path: string };
				response: void;
			};
			triggerExportSpec: {
				params: { path: string };
				response: void;
			};
			triggerImportSheet: {
				params: { path: string };
				response: void;
			};
			openProjectDirectory: {
				params: { workspacePath: string; paths: string[] };
				response: void;
			};
			closeProject: {
				params: {};
				response: void;
			};
			resizeCanvas: {
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
		messages: {};
	}>;
};
