import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import consoleForward from "./vite-plugin-console-forward";

export default defineConfig({
	plugins: [vue(), tailwindcss(), consoleForward()],
	root: "src/mainview",
	build: {
		outDir: "../../dist",
		emptyOutDir: process.env.VITE_EMPTY_OUT_DIR !== "false",
	},
	server: {
		port: 5173,
		strictPort: true,
	},
});
