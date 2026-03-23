import Electrobun, {
	ApplicationMenu,
	BrowserView,
	BrowserWindow,
	Updater,
	Utils,
} from "electrobun/bun";
import type { SpanRPC } from "../shared/rpc-schema";
import { Project } from "./project";
import { join } from "path";
import { writeFile, unlink } from "fs/promises";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// --- CLI args ---
const args = process.argv.slice(2);
let projectPath: string | null = null;
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--project" && args[i + 1]) {
		projectPath = args[i + 1];
		break;
	}
}

// --- Resolve project directory ---
async function resolveProjectPath(): Promise<string> {
	if (projectPath) return projectPath;

	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		const { resolve } = await import("path");
		const resourcesDir = new URL(".", import.meta.url).pathname;
		const repoRoot = resolve(resourcesDir, "../../../../../../..");
		return join(repoRoot, "example_project");
	}

	return "resources://example_project";
}

const resolvedPath = await resolveProjectPath();
const project = new Project(resolvedPath);
await project.ensureAnnotationsDir();
console.log(`Project: ${resolvedPath}`);

// --- Layout persistence helpers ---
function layoutPath(): string {
	return join(Utils.paths.userData(), "layout.json");
}

// --- RPC ---
const rpc = BrowserView.defineRPC<SpanRPC>({
	handlers: {
		requests: {
			getProjectAnnotations: async () => {
				return await project.loadProjectAnnotations();
			},
			saveAnnotations: async ({ sheet, annotations }) => {
				await project.saveAnnotations(sheet, annotations);
				return { ok: true };
			},
			getSheetImage: async ({ sheet }) => {
				return await project.getSheetImageBase64(sheet);
			},
			pickProjectDirectory: async () => {
				return null;
			},
			saveLayout: async ({ layout }) => {
				await writeFile(
					layoutPath(),
					JSON.stringify(layout, null, 2),
				);
				return { ok: true };
			},
			loadLayout: async () => {
				try {
					const file = Bun.file(layoutPath());
					if (!(await file.exists())) return null;
					return await file.json();
				} catch {
					return null;
				}
			},
		},
		messages: {},
	},
});

// --- Window ---
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR: Using Vite at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log("No Vite dev server. Use 'bun run dev:hmr' for HMR.");
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const mainWindow = new BrowserWindow({
	title: "Span Sprite Annotator",
	url,
	rpc,
	frame: {
		width: 1400,
		height: 900,
		x: 100,
		y: 100,
	},
});

// --- Native menus ---
ApplicationMenu.setApplicationMenu([
	{
		label: "File",
		submenu: [
			{
				label: "Save",
				accelerator: "CommandOrControl+S",
				action: "triggerSave",
			},
		],
	},
	{
		label: "Edit",
		submenu: [
			{ label: "Add Sprite", action: "addSprite" },
			{
				label: "Duplicate",
				accelerator: "CommandOrControl+D",
				action: "duplicateSprite",
			},
			{
				label: "Delete",
				accelerator: "Backspace",
				action: "deleteSprite",
			},
		],
	},
	{
		label: "View",
		submenu: [{ label: "Reset Layout", action: "resetLayout" }],
	},
]);

Electrobun.events.on("application-menu-clicked", async (e) => {
	const { action } = e.data as { action: string };
	switch (action) {
		case "triggerSave":
			mainWindow.webview.rpc.request.triggerSave({});
			break;
		case "addSprite":
			mainWindow.webview.rpc.request.addSprite({});
			break;
		case "duplicateSprite":
			mainWindow.webview.rpc.request.duplicateSprite({});
			break;
		case "deleteSprite":
			mainWindow.webview.rpc.request.deleteSprite({});
			break;
		case "resetLayout":
			try {
				await unlink(layoutPath());
			} catch {
				// ignore if not found
			}
			mainWindow.webview.rpc.request.resetLayout({});
			break;
	}
});

// --- Quit handling ---
Electrobun.events.on("before-quit", async (e) => {
	try {
		const canClose = await mainWindow.webview.rpc.request.canClose({});
		if (!canClose) {
			e.response = { allow: false };
		}
	} catch {
		// If RPC fails, allow close
	}
});

console.log("Span started!");
