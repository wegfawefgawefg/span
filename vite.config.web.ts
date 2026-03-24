import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import consoleForward from "./vite-plugin-console-forward";
import { resolve } from "path";

/** Redirect / to /index-web.html so the dev server serves the web entry instead of the desktop index.html */
function serveWebEntry(): Plugin {
	return {
		name: "serve-web-entry",
		configureServer(server) {
			server.middlewares.use((req, _res, next) => {
				if (req.url === "/span/" || req.url === "/span") {
					req.url = "/span/index-web.html";
				}
				next();
			});
		},
	};
}

export default defineConfig({
	plugins: [serveWebEntry(), vue(), tailwindcss(), consoleForward()],
	root: "src/mainview",
	build: {
		outDir: "../../dist-web",
		emptyOutDir: true,
		rollupOptions: {
			input: resolve(__dirname, "src/mainview/index-web.html"),
		},
	},
	base: "/span/",
	optimizeDeps: {
		exclude: ["electrobun"],
	},
	server: {
		port: 5174,
	},
});
