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
import { createWebAdapter } from "./src/platform/web";
import { dirty, restoreWorkspace, fulfillSheet, sheets } from "./src/state";
import { loadImage } from "./src/platform/image-store";

// Initialize platform
const adapter = createWebAdapter();
setAdapter(adapter, "web");

// Warn on unsaved changes before closing tab
window.addEventListener("beforeunload", (e) => {
	if (dirty.value) {
		e.preventDefault();
	}
});

const app = createApp(App);

app.component("sheets", SheetSidebar);
app.component("sprite-canvas", CanvasView);
app.component("inspector", Inspector);
app.component("annotations", AnnotationList);
app.component("gallery", GalleryPanel);
app.component("spec-editor", SpecEditor);

app.mount("#app");

// --- Auto-restore workspace from localStorage + IndexedDB ---
async function autoRestore() {
	try {
		const raw = localStorage.getItem("span-workspace");
		if (!raw) return;

		await restoreWorkspace(raw);

		// Fulfill missing sheets from IndexedDB
		for (const sheet of sheets.value) {
			if (sheet.status !== "missing") continue;
			const dataUrl = await loadImage(sheet.path);
			if (!dataUrl) continue;

			const dims = await new Promise<{ width: number; height: number }>((resolve) => {
				const img = new Image();
				img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
				img.onerror = () => resolve({ width: 0, height: 0 });
				img.src = dataUrl;
			});

			if (dims.width > 0) {
				fulfillSheet(sheet, dataUrl, dims.width, dims.height);
			}
		}
	} catch (e) {
		console.error("Auto-restore failed:", e);
	}
}

autoRestore();
