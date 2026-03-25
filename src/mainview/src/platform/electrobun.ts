import { ref } from "vue";
import { Electroview } from "electrobun/view";
import type { SpanRPC } from "../../../shared/rpc-schema";
import type { FileFilter, PlatformAdapter } from "./types";
import {
	getResetLayoutHandler,
	getAddPanelHandler,
} from "./adapter";

// --- Handler slots for desktop menu dispatch ---

let canCloseHandler: () => boolean = () => true;
let addSpriteHandler: () => void = () => {};
let duplicateSpriteHandler: () => void = () => {};
let deleteSpriteHandler: () => void = () => {};
let triggerSaveHandler: () => Promise<{ needsSaveAs: boolean }> = async () => ({ needsSaveAs: false });
let triggerSaveAsHandler: (path: string) => void = () => {};
let triggerOpenHandler: (path: string) => void = () => {};

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
			resetLayout: () => getResetLayoutHandler()(),
			addPanel: ({ panelId }) => getAddPanelHandler()(panelId),
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
		readFile: (path: string) =>
			electroview.rpc.request.readFile({ path }),
		writeFile: (path: string, contents: string) =>
			electroview.rpc.request.writeFile({ path, contents }),
		readImageAsDataUrl: (path: string) =>
			electroview.rpc.request.readImageAsDataUrl({ path }),
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
}) {
	canCloseHandler = handlers.canClose;
	addSpriteHandler = handlers.addSprite;
	duplicateSpriteHandler = handlers.duplicateSprite;
	deleteSpriteHandler = handlers.deleteSprite;
	triggerSaveHandler = handlers.triggerSave;
	triggerSaveAsHandler = handlers.triggerSaveAs;
	triggerOpenHandler = handlers.triggerOpen;
}
