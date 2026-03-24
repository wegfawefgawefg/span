import { ref } from "vue";
import type { PlatformAdapter } from "./types";

export const platform = ref<"desktop" | "web">("desktop");

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
	showSaveDialog: (defaultName, filters) =>
		getAdapter().showSaveDialog(defaultName, filters),
	showOpenDialog: (filters) => getAdapter().showOpenDialog(filters),
	readFile: (path) => getAdapter().readFile(path),
	writeFile: (path, contents) => getAdapter().writeFile(path, contents),
	readImageAsDataUrl: (path) => getAdapter().readImageAsDataUrl(path),
	revealFile: (path) => getAdapter().revealFile(path),
	saveLayout: (layout) => getAdapter().saveLayout(layout),
	loadLayout: () => getAdapter().loadLayout(),
	get canSave() {
		return getAdapter().canSave;
	},
};
