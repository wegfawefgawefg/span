import "dockview-vue/dist/styles/dockview.css";
import "./src/style.css";
import App from "./src/App.vue";
import SheetSidebar from "./src/components/SheetSidebar.vue";
import CanvasView from "./src/components/CanvasView.vue";
import Inspector from "./src/components/Inspector.vue";
import AnnotationList from "./src/components/AnnotationList.vue";
import GalleryPanel from "./src/components/GalleryPanel.vue";
import { createApp } from "vue";
import { setAdapter } from "./src/platform/adapter";
import {
	createElectrobunAdapter,
	wireDesktopMenuHandlers,
} from "./src/platform/electrobun";
import {
	dirty,
	addAnnotationAtViewportCenter,
	duplicateSelected,
	deleteSelected,
	saveWorkspace,
	saveWorkspaceAs,
	openWorkspace,
} from "./src/state";

// Initialize platform
const adapter = createElectrobunAdapter();
setAdapter(adapter, "desktop");

// Wire desktop-only menu handlers
wireDesktopMenuHandlers({
	canClose: () => {
		if (!dirty.value) return true;
		return window.confirm("You have unsaved changes. Quit without saving?");
	},
	addSprite: () => addAnnotationAtViewportCenter(),
	duplicateSprite: () => duplicateSelected(),
	deleteSprite: () => deleteSelected(),
	triggerSave: () => saveWorkspace(),
	triggerSaveAs: () => saveWorkspaceAs(),
	triggerOpen: () => openWorkspace(),
});

const app = createApp(App);

// Register components globally so Dockview can find them by name
app.component("sheets", SheetSidebar);
app.component("sprite-canvas", CanvasView);
app.component("inspector", Inspector);
app.component("annotations", AnnotationList);
app.component("gallery", GalleryPanel);

app.mount("#app");
