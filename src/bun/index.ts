import Electrobun, {
	ApplicationMenu,
	BrowserView,
	BrowserWindow,
	Updater,
	Utils,
} from "electrobun/bun";
import type { SpanRPC } from "../shared/rpc-schema";
import { join } from "path";
import { writeFile, unlink, mkdir } from "fs/promises";

const DEV_SERVER_PORT_START = 5173;
const DEV_SERVER_PORT_END = 5183;

// --- Layout persistence helpers ---
function layoutPath(): string {
	const dir = typeof Utils.paths.userData === "function" ? Utils.paths.userData() : Utils.paths.userData;
	return join(dir, "layout.json");
}

async function showSaveAsDialog(): Promise<string | null> {
	const script = `set f to POSIX path of (choose file name with prompt "Save As" default name "workspace.span")\nreturn f`;
	try {
		const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe" });
		const out = await new Response(proc.stdout).text();
		const code = await proc.exited;
		if (code === 0 && out.trim()) return out.trim();
	} catch {}
	return null;
}

// --- RPC ---
const rpc = BrowserView.defineRPC<SpanRPC>({
	handlers: {
		requests: {
			showSaveDialog: async ({ defaultName, filters }) => {
				const exts = filters.flatMap(f => f.extensions).map(e => `"${e}"`).join(", ");
				const script = `
					set f to POSIX path of (choose file name with prompt "Save As" default name "${defaultName}")
					return f
				`;
				try {
					const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe" });
					const out = await new Response(proc.stdout).text();
					const code = await proc.exited;
					if (code !== 0) return null;
					return out.trim() || null;
				} catch {
					return null;
				}
			},
			showOpenDialog: async ({ filters }) => {
				const types = filters.flatMap(f => f.extensions);
				const typeList = types.map(t => `"${t}"`).join(", ");
				const script = `
					set f to POSIX path of (choose file of type {${typeList}} with prompt "Open")
					return f
				`;
				try {
					const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe" });
					const out = await new Response(proc.stdout).text();
					const code = await proc.exited;
					if (code !== 0) return null;
					return out.trim() || null;
				} catch {
					return null;
				}
			},
			readFile: async ({ path }) => {
				const file = Bun.file(path);
				return await file.text();
			},
			writeFile: async ({ path, contents }) => {
				await Bun.write(path, contents);
				return { ok: true };
			},
			readImageAsDataUrl: async ({ path }) => {
				const file = Bun.file(path);
				const buffer = await file.arrayBuffer();
				const base64 = Buffer.from(buffer).toString("base64");
				const mimeType = path.toLowerCase().endsWith(".jpg") || path.toLowerCase().endsWith(".jpeg")
					? "image/jpeg"
					: "image/png";
				return `data:${mimeType};base64,${base64}`;
			},
			// TODO: Verify the correct Electrobun API for revealing files in Finder.
			// Utils.showItemInFolder may be the right call — confirm against Electrobun docs.
			revealFile: ({ path }) => {
				Utils.showItemInFolder(path);
			},
			saveLayout: async ({ layout }) => {
				const path = layoutPath();
				const dir = path.replace(/\/[^/]+$/, "");
				await mkdir(dir, { recursive: true });
				await writeFile(path, JSON.stringify(layout, null, 2));
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
		for (let port = DEV_SERVER_PORT_START; port <= DEV_SERVER_PORT_END; port++) {
			try {
				const url = `http://localhost:${port}`;
				const res = await fetch(url, { method: "GET" });
				const text = await res.text();
				// Verify it's our Vite instance, not another project
				if (text.includes("Span Sprite Annotator")) {
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
				label: "Open...",
				accelerator: "CommandOrControl+O",
				action: "triggerOpen",
			},
			{ type: "separator" as const },
			{
				label: "Save",
				accelerator: "CommandOrControl+S",
				action: "triggerSave",
			},
			{
				label: "Save As...",
				accelerator: "CommandOrControl+Shift+S",
				action: "triggerSaveAs",
			},
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
		case "triggerSave": {
			const result = await mainWindow.webview.rpc.request.triggerSave({});
			if (result.needsSaveAs) {
				const path = await showSaveAsDialog();
				if (path) mainWindow.webview.rpc.request.triggerSaveAs({ path });
			}
			break;
		}
		case "triggerSaveAs": {
			const path = await showSaveAsDialog();
			if (path) mainWindow.webview.rpc.request.triggerSaveAs({ path });
			break;
		}
		case "triggerOpen": {
			const script = `set f to POSIX path of (choose file of type {"span"} with prompt "Open")\nreturn f`;
			try {
				const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe" });
				const out = await new Response(proc.stdout).text();
				const code = await proc.exited;
				if (code === 0 && out.trim()) {
					mainWindow.webview.rpc.request.triggerOpen({ path: out.trim() });
				}
			} catch {}
			break;
		}
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
