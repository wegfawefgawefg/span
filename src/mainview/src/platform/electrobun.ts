import { ref } from "vue";
import { Electroview } from "electrobun/view";
import type { SpanRPC } from "../../../shared/rpc-schema";
import type { FileFilter, PlatformAdapter } from "./types";
import {
	getResetLayoutHandler,
	getAddPanelHandler,
	getSetThemeHandler,
} from "./adapter";

// --- Handler slots for desktop menu dispatch ---

let canCloseHandler: () => boolean = () => true;
let addSpriteHandler: () => void = () => {};
let duplicateSpriteHandler: () => void = () => {};
let deleteSpriteHandler: () => void = () => {};
let triggerSaveHandler: () => Promise<{ needsSaveAs: boolean }> = async () => ({ needsSaveAs: false });
let triggerSaveAsHandler: (path: string) => void = () => {};
let triggerOpenHandler: (path: string) => void = () => {};
let triggerExportHandler: (path: string) => void = () => {};
let triggerImportSpecHandler: (path: string) => void = () => {};
let triggerExportSpecHandler: (path: string) => void = () => {};
let triggerImportSheetHandler: (path: string) => void = () => {};
let openProjectDirectoryHandler: (workspacePath: string, paths: string[]) => void = () => {};
let closeProjectHandler: () => void = () => {};
let resizeCanvasHandler: () => void = () => {};

const rpc = Electroview.defineRPC<SpanRPC>({
	handlers: {
		requests: {
			canClose: () => canCloseHandler(),
			addSprite: () => addSpriteHandler(),
			duplicateSprite: () => duplicateSpriteHandler(),
			deleteSprite: () => deleteSpriteHandler(),
			triggerSave: () => triggerSaveHandler(),
			triggerSaveAs: ({ path }) => { setTimeout(() => triggerSaveAsHandler(path), 0); },
			triggerOpen: ({ path }) => { setTimeout(() => triggerOpenHandler(path), 0); },
			triggerExport: ({ path }) => { setTimeout(() => triggerExportHandler(path), 0); },
			triggerImportSpec: ({ path }) => { setTimeout(() => triggerImportSpecHandler(path), 0); },
			triggerExportSpec: ({ path }) => { setTimeout(() => triggerExportSpecHandler(path), 0); },
			triggerImportSheet: ({ path }) => { setTimeout(() => triggerImportSheetHandler(path), 0); },
			openProjectDirectory: ({ workspacePath, paths }) => { setTimeout(() => openProjectDirectoryHandler(workspacePath, paths), 0); },
			closeProject: () => { setTimeout(() => closeProjectHandler(), 0); },
			resizeCanvas: () => { setTimeout(() => resizeCanvasHandler(), 0); },
			resetLayout: () => getResetLayoutHandler()(),
			addPanel: ({ panelId }) => getAddPanelHandler()(panelId),
			setTheme: ({ themeId }) => getSetThemeHandler()(themeId),
		},
		messages: {},
	},
});

const electroview = new Electroview({ rpc });

export function createElectrobunAdapter(): PlatformAdapter {
	return {
		showSaveDialog: (defaultName: string, filters: FileFilter[]) =>
			electroview.rpc.request.showSaveDialog({ defaultName, filters }),
		showOpenDialog: (filters: FileFilter[]) =>
			electroview.rpc.request.showOpenDialog({ filters }),
		showOpenDirectoryDialog: (prompt?: string) =>
			electroview.rpc.request.showOpenDirectoryDialog({ prompt }),
		importImageDirectory: (prompt?: string) =>
			electroview.rpc.request.importImageDirectory({ prompt }),
		pickImageDirectory: (prompt?: string) =>
			electroview.rpc.request.pickImageDirectory({ prompt }),
		debugLog: (message: string) =>
			electroview.rpc.request.debugLog({ message }),
		readFile: (path: string) =>
			electroview.rpc.request.readFile({ path }),
		listImageFiles: (directory: string) =>
			electroview.rpc.request.listImageFiles({ directory }),
		writeFile: (path: string, contents: string) =>
			electroview.rpc.request.writeFile({ path, contents }),
		writeImageDataUrl: (path: string, dataUrl: string) =>
			electroview.rpc.request.writeImageDataUrl({ path, dataUrl }),
		deleteFile: (path: string) =>
			electroview.rpc.request.deleteFile({ path }),
		readImageAsDataUrl: (path: string) =>
			electroview.rpc.request.readImageAsDataUrl({ path }),
		readClipboardImageDataUrl: () =>
			electroview.rpc.request.readClipboardImageDataUrl({}),
		writeClipboardImageDataUrl: (dataUrl: string) =>
			electroview.rpc.request.writeClipboardImageDataUrl({ dataUrl }),
		revealFile: (path: string) =>
			electroview.rpc.request.revealFile({ path }),
		saveLayout: (layout: object) =>
			electroview.rpc.request.saveLayout({ layout }),
		loadLayout: () => electroview.rpc.request.loadLayout({}),
		canSave: ref(true),
	};
}

/**
 * Wire desktop menu handlers. Called once from main.ts after state module
 * is loaded so the action functions are available.
 */
export function wireDesktopMenuHandlers(handlers: {
	canClose: () => boolean;
	addSprite: () => void;
	duplicateSprite: () => void;
	deleteSprite: () => void;
	triggerSave: () => Promise<{ needsSaveAs: boolean }>;
	triggerSaveAs: (path: string) => void;
	triggerOpen: (path: string) => void;
	triggerExport: (path: string) => void;
	triggerImportSpec: (path: string) => void;
	triggerExportSpec: (path: string) => void;
	triggerImportSheet: (path: string) => void;
	openProjectDirectory: (workspacePath: string, paths: string[]) => void;
	closeProject: () => void;
	resizeCanvas: () => void;
}) {
	canCloseHandler = handlers.canClose;
	addSpriteHandler = handlers.addSprite;
	duplicateSpriteHandler = handlers.duplicateSprite;
	deleteSpriteHandler = handlers.deleteSprite;
	triggerSaveHandler = handlers.triggerSave;
	triggerSaveAsHandler = handlers.triggerSaveAs;
	triggerOpenHandler = handlers.triggerOpen;
	triggerExportHandler = handlers.triggerExport;
	triggerImportSpecHandler = handlers.triggerImportSpec;
	triggerExportSpecHandler = handlers.triggerExportSpec;
	triggerImportSheetHandler = handlers.triggerImportSheet;
	openProjectDirectoryHandler = handlers.openProjectDirectory;
	closeProjectHandler = handlers.closeProject;
	resizeCanvasHandler = handlers.resizeCanvas;
}
