import "dockview-vue/dist/styles/dockview.css";
import "./src/style.css";
import App from "./src/App.vue";
import SheetSidebar from "./src/components/SheetSidebar.vue";
import CanvasView from "./src/components/CanvasView.vue";
import Inspector from "./src/components/Inspector.vue";
import AnnotationList from "./src/components/AnnotationList.vue";
import GalleryPanel from "./src/components/GalleryPanel.vue";
import { createApp } from "vue";
import { setAdapter, projectOpen } from "./src/platform/adapter";
import {
	createElectrobunAdapter,
	wireDesktopMenuHandlers,
} from "./src/platform/electrobun";
import {
	dirty,
	addAnnotationAtViewportCenter,
	duplicateSelected,
	deleteSelected,
	saveCurrentAnnotations,
	statusText,
} from "./src/state";

// Initialize platform
const adapter = createElectrobunAdapter();
setAdapter(adapter, "desktop");
projectOpen.value = true; // Desktop always has a project loaded via CLI

// Wire desktop-only menu handlers
wireDesktopMenuHandlers({
	canClose: () => {
		if (!dirty.value) return true;
		return window.confirm("You have unsaved changes. Quit without saving?");
	},
	addSprite: () => addAnnotationAtViewportCenter(),
	duplicateSprite: () => duplicateSelected(),
	deleteSprite: () => deleteSelected(),
	triggerSave: () => {
		saveCurrentAnnotations().catch((e) => {
			console.error(e);
			statusText.value = "Save failed — check disk permissions";
		});
	},
});

const app = createApp(App);

// Register components globally so Dockview can find them by name
app.component("sheets", SheetSidebar);
app.component("sprite-canvas", CanvasView);
app.component("inspector", Inspector);
app.component("annotations", AnnotationList);
app.component("gallery", GalleryPanel);

app.mount("#app");
