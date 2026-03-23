import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
	plugins: [vue(), tailwindcss()],
	root: "src/mainview",
	build: {
		outDir: "../../dist-web",
		emptyOutDir: true,
		rollupOptions: {
			input: "index-web.html",
		},
	},
	base: "/span/",
	server: {
		port: 5174,
	},
});
