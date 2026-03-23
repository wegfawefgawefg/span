import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Span",
		identifier: "dev.span.annotator",
		version: "0.1.0",
	},
	build: {
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
			"example_project": "resources/example_project",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
