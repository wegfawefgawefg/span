import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig({
	plugins: [vue(), tailwindcss()],
	root: "src/mainview",
	build: {
		outDir: "../../dist-web",
		emptyOutDir: true,
		rollupOptions: {
			input: resolve(__dirname, "src/mainview/index-web.html"),
		},
	},
	base: "/span/",
	server: {
		port: 5174,
	},
});
