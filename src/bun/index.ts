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

const DEV_SERVER_PORT_START = 5173;
const DEV_SERVER_PORT_END = 5183;

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
			revealSheet: ({ sheet }) => {
				const path = join(project.sheetsDir, sheet);
				Utils.showItemInFolder(path);
			},
		},
		messages: {},
	},
});

// --- Window ---
async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		for (let port = DEV_SERVER_PORT_START; port <= DEV_SERVER_PORT_END; port++) {
			try {
				const url = `http://localhost:${port}`;
				const res = await fetch(url, { method: "GET" });
				const text = await res.text();
				// Verify it's actually Vite (serves HTML with /src/main.ts)
				if (text.includes("/main.ts") || text.includes("vite")) {
					console.log(`HMR: Using Vite at ${url}`);
					return url;
				}
			} catch {
				// try next port
			}
		}
		console.log("No Vite dev server. Use 'bun run dev:hmr' for HMR.");
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
		label: "Span",
		submenu: [
			{ role: "about" },
			{ type: "separator" as const },
			{ role: "hide" },
			{ role: "hideOthers" },
			{ role: "showAll" },
			{ type: "separator" as const },
			{ role: "quit" },
		],
	},
	{
		label: "File",
		submenu: [
			{
				label: "Save",
				accelerator: "CommandOrControl+S",
				action: "triggerSave",
			},
			{ type: "separator" as const },
			{ label: "Refresh Sheets", action: "refreshSheets" },
		],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" as const },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "selectAll" },
			{ type: "separator" as const },
			{ label: "Add Sprite", action: "addSprite" },
			{
				label: "Duplicate Sprite",
				accelerator: "CommandOrControl+D",
				action: "duplicateSprite",
			},
			{
				label: "Delete Sprite",
				accelerator: "Backspace",
				action: "deleteSprite",
			},
		],
	},
	{
		label: "View",
		submenu: [
			{
				label: "Add Panel",
				submenu: [
					{ label: "Sheets", action: "addPanel:sheets" },
					{ label: "Canvas", action: "addPanel:sprite-canvas" },
					{ label: "Inspector", action: "addPanel:inspector" },
					{ label: "Sprites In Sheet", action: "addPanel:annotations" },
					{ label: "Gallery", action: "addPanel:gallery" },
				],
			},
			{ type: "separator" as const },
			{ label: "Reset Panel Layout", action: "resetLayout" },
			{ type: "separator" as const },
			{ role: "toggleFullScreen" },
		],
	},
	{
		label: "Window",
		submenu: [
			{ role: "minimize" },
			{ role: "zoom" },
			{ type: "separator" as const },
			{ role: "close" },
			{ role: "bringAllToFront" },
		],
	},
	{
		label: "Help",
		submenu: [
			{
				label: "Toggle Developer Tools",
				accelerator: "CommandOrControl+Alt+I",
				action: "toggleDevTools",
			},
		],
	},
]);

Electrobun.events.on("application-menu-clicked", async (e) => {
	const { action } = e.data as { action: string };
	switch (action) {
		case "triggerSave":
			mainWindow.webview.rpc.request.triggerSave({});
			break;
		case "refreshSheets":
			mainWindow.webview.rpc.request.triggerSave({});
			// TODO: add a dedicated refreshSheets RPC
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
		case "toggleDevTools":
			mainWindow.webview.openDevTools();
			break;
		default:
			if (action.startsWith("addPanel:")) {
				const panelId = action.slice("addPanel:".length);
				mainWindow.webview.rpc.request.addPanel({ panelId });
			}
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
