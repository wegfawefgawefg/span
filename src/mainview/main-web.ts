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
import { createWebAdapter } from "./src/platform/web";
import { dirty } from "./src/state";

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

app.mount("#app");
