import "dockview-vue/dist/styles/dockview.css";
import "./src/style.css";
import App from "./src/App.vue";
import SheetSidebar from "./src/components/SheetSidebar.vue";
import CanvasView from "./src/components/CanvasView.vue";
import Inspector from "./src/components/Inspector.vue";
import AnnotationList from "./src/components/AnnotationList.vue";
import GalleryPanel from "./src/components/GalleryPanel.vue";
import SpecEditor from "./src/components/SpecEditor.vue";
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
	sheets,
	closeProject,
	saveWorkspace,
	saveWorkspaceAs,
	openWorkspace,
	exportWorkspace,
	exportSpec,
	doExportWrite,
	importSpecFromPath,
	importSheetFromPath,
	openProjectDirectory,
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
	triggerSaveAs: (path: string) => saveWorkspaceAs(path),
	triggerOpen: (path: string) => openWorkspace(path),
	triggerExport: (path: string) => exportWorkspace(path),
	triggerImportSpec: (path: string) => importSpecFromPath(path),
	triggerExportSpec: (path: string) => exportSpec(path),
	triggerImportSheet: (path: string) => importSheetFromPath(path),
	openProjectDirectory: (workspacePath: string, paths: string[]) => { void openProjectDirectory(workspacePath, paths); },
	closeProject: () => {
		if (sheets.value.length === 0) return;
		const confirmed = dirty.value
			? window.confirm("Close the current project? Unsaved changes may be lost.")
			: window.confirm("Close the current project?");
		if (!confirmed) return;
		closeProject();
	},
});

const app = createApp(App);

// Register components globally so Dockview can find them by name
app.component("sheets", SheetSidebar);
app.component("sprite-canvas", CanvasView);
app.component("inspector", Inspector);
app.component("annotations", AnnotationList);
app.component("gallery", GalleryPanel);
app.component("spec-editor", SpecEditor);

app.mount("#app");
