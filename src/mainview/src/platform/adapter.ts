import { ref } from "vue";
import type { PlatformAdapter } from "./types";

export const platform = ref<"desktop" | "web">("desktop");
export const projectPath = ref<string>("");
export const projectOpen = ref(false);

// --- Layout handler slots (used by App.vue on both platforms) ---

let resetLayoutHandler: () => void = () => {};
let addPanelHandler: (panelId: string) => void = () => {};

export function setResetLayoutHandler(handler: () => void) {
	resetLayoutHandler = handler;
}

export function setAddPanelHandler(handler: (panelId: string) => void) {
	addPanelHandler = handler;
}

export function getResetLayoutHandler() {
	return () => resetLayoutHandler();
}

export function getAddPanelHandler() {
	return (panelId: string) => addPanelHandler(panelId);
}

// --- Adapter proxy ---

let _adapter: PlatformAdapter | null = null;

function getAdapter(): PlatformAdapter {
	if (!_adapter) throw new Error("Platform adapter not initialized");
	return _adapter;
}

export function setAdapter(
	adapter: PlatformAdapter,
	p: "desktop" | "web",
) {
	_adapter = adapter;
	platform.value = p;
}

/** Get the raw adapter instance (use when you need platform-specific methods like setFallbackFiles) */
export function getRawAdapter<T extends PlatformAdapter = PlatformAdapter>(): T {
	return getAdapter() as T;
}

export const api: PlatformAdapter = {
	getProjectAnnotations: () => getAdapter().getProjectAnnotations(),
	saveAnnotations: (sheet, annotations) =>
		getAdapter().saveAnnotations(sheet, annotations),
	getSheetImage: (sheet) => getAdapter().getSheetImage(sheet),
	pickProjectDirectory: () => getAdapter().pickProjectDirectory(),
	revealSheet: (sheet) => getAdapter().revealSheet(sheet),
	saveLayout: (layout) => getAdapter().saveLayout(layout),
	loadLayout: () => getAdapter().loadLayout(),
	get canSave() {
		return getAdapter().canSave;
	},
};
