import { ref } from "vue";
import { Electroview } from "electrobun/view";
import type { SpanRPC } from "../../../shared/rpc-schema";
import type { PlatformAdapter } from "./types";
import type { Annotation } from "../types";
import {
	projectPath,
	getResetLayoutHandler,
	getAddPanelHandler,
} from "./adapter";

// --- Handler slots for desktop menu dispatch ---

let canCloseHandler: () => boolean = () => true;
let addSpriteHandler: () => void = () => {};
let duplicateSpriteHandler: () => void = () => {};
let deleteSpriteHandler: () => void = () => {};
let triggerSaveHandler: () => void = () => {};

const rpc = Electroview.defineRPC<SpanRPC>({
	handlers: {
		requests: {
			canClose: () => canCloseHandler(),
			addSprite: () => addSpriteHandler(),
			duplicateSprite: () => duplicateSpriteHandler(),
			deleteSprite: () => deleteSpriteHandler(),
			triggerSave: () => triggerSaveHandler(),
			resetLayout: () => getResetLayoutHandler()(),
			addPanel: ({ panelId }) => getAddPanelHandler()(panelId),
		},
		messages: {
			projectLoaded: ({ projectPath: path }) => {
				projectPath.value = path;
				console.log("Project loaded:", path);
			},
		},
	},
});

const electroview = new Electroview({ rpc });

export function createElectrobunAdapter(): PlatformAdapter {
	return {
		getProjectAnnotations: () =>
			electroview.rpc.request.getProjectAnnotations({}),
		saveAnnotations: (sheet: string, annotations: Annotation[]) =>
			electroview.rpc.request.saveAnnotations({ sheet, annotations }),
		getSheetImage: (sheet: string) =>
			electroview.rpc.request.getSheetImage({ sheet }),
		pickProjectDirectory: () =>
			electroview.rpc.request.pickProjectDirectory({}),
		revealSheet: (sheet: string) =>
			electroview.rpc.request.revealSheet({ sheet }),
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
	triggerSave: () => void;
}) {
	canCloseHandler = handlers.canClose;
	addSpriteHandler = handlers.addSprite;
	duplicateSpriteHandler = handlers.duplicateSprite;
	deleteSpriteHandler = handlers.deleteSprite;
	triggerSaveHandler = handlers.triggerSave;
}
