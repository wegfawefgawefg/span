import { Electroview } from "electrobun/view";
import type { SpanRPC } from "../../shared/rpc-schema";
import type { Annotation } from "./types";
import { ref } from "vue";

export const projectPath = ref<string>("");

// --- Handler slots (set by state.ts and App.vue) ---

let canCloseHandler: () => boolean = () => true;
let addSpriteHandler: () => void = () => {};
let duplicateSpriteHandler: () => void = () => {};
let deleteSpriteHandler: () => void = () => {};
let triggerSaveHandler: () => void = () => {};
let resetLayoutHandler: () => void = () => {};
let addPanelHandler: (panelId: string) => void = () => {};

export function setCanCloseHandler(handler: () => boolean) {
	canCloseHandler = handler;
}

export function setMenuHandlers(handlers: {
	addSprite: () => void;
	duplicateSprite: () => void;
	deleteSprite: () => void;
	triggerSave: () => void;
}) {
	addSpriteHandler = handlers.addSprite;
	duplicateSpriteHandler = handlers.duplicateSprite;
	deleteSpriteHandler = handlers.deleteSprite;
	triggerSaveHandler = handlers.triggerSave;
}

export function setResetLayoutHandler(handler: () => void) {
	resetLayoutHandler = handler;
}

export function setAddPanelHandler(handler: (panelId: string) => void) {
	addPanelHandler = handler;
}

// --- RPC ---

const rpc = Electroview.defineRPC<SpanRPC>({
	handlers: {
		requests: {
			canClose: () => canCloseHandler(),
			addSprite: () => {
				addSpriteHandler();
			},
			duplicateSprite: () => {
				duplicateSpriteHandler();
			},
			deleteSprite: () => {
				deleteSpriteHandler();
			},
			triggerSave: () => {
				triggerSaveHandler();
			},
			resetLayout: () => {
				resetLayoutHandler();
			},
			addPanel: ({ panelId }) => {
				addPanelHandler(panelId);
			},
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

// --- API wrappers ---

export const api = {
	getProjectAnnotations: () =>
		electroview.rpc.request.getProjectAnnotations({}),
	saveAnnotations: (sheet: string, annotations: Annotation[]) =>
		electroview.rpc.request.saveAnnotations({ sheet, annotations }),
	getSheetImage: (sheet: string) =>
		electroview.rpc.request.getSheetImage({ sheet }),
	pickProjectDirectory: () =>
		electroview.rpc.request.pickProjectDirectory({}),
	saveLayout: (layout: object) =>
		electroview.rpc.request.saveLayout({ layout }),
	loadLayout: () => electroview.rpc.request.loadLayout({}),
};
