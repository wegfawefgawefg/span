import Electrobun, {
	ApplicationMenu,
	BrowserView,
	BrowserWindow,
	Updater,
	Utils,
} from "electrobun/bun";
import type { FileFilter, SpanRPC } from "../shared/rpc-schema";
import { dirname, join } from "path";
import { writeFile, unlink, mkdir, readdir } from "fs/promises";

const DEV_SERVER_PORT_START = 5173;
const DEV_SERVER_PORT_END = 5183;

// --- Layout persistence helpers ---
function layoutPath(): string {
	const dir = typeof Utils.paths.userData === "function" ? Utils.paths.userData() : Utils.paths.userData;
	return join(dir, "layout.json");
}

function lastWorkspacePath(): string {
	const dir = typeof Utils.paths.userData === "function" ? Utils.paths.userData() : Utils.paths.userData;
	return join(dir, "last-workspace.txt");
}

function projectWorkspacePath(directory: string): string {
	return join(directory, ".span", "workspace.span");
}

async function rememberLastWorkspace(path: string) {
	try {
		const dir = dirname(lastWorkspacePath());
		await mkdir(dir, { recursive: true });
		await writeFile(lastWorkspacePath(), path);
	} catch (e) {
		console.error("Failed to save last workspace path:", e);
	}
}

async function runDialogCommand(cmd: string[]): Promise<string | null> {
	console.log("[dialog] running:", cmd.join(" "));
	try {
		const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
		const out = await new Response(proc.stdout).text();
		const err = proc.stderr ? await new Response(proc.stderr).text() : "";
		const code = await proc.exited;
		if (code !== 0) {
			console.warn("[dialog] command exited non-zero:", code, err.trim());
			return null;
		}
		const result = out.trim() || null;
		console.log("[dialog] result:", result);
		return result;
	} catch (error) {
		console.error("Dialog command failed:", error);
	}
	return null;
}

function buildZenityFilterArgs(filters: FileFilter[]): string[] {
	return filters.flatMap((filter) => {
		const patterns = filter.extensions.map((ext) => `*.${ext}`);
		if (patterns.length === 0) return [];
		return [`--file-filter=${filter.name} | ${patterns.join(" ")}`];
	});
}

async function showSaveDialog(
	defaultName: string,
	filters: FileFilter[],
	prompt = "Save As",
): Promise<string | null> {
	if (process.platform === "darwin") {
		const script = `set f to POSIX path of (choose file name with prompt "${prompt}" default name "${defaultName}")\nreturn f`;
		return runDialogCommand(["osascript", "-e", script]);
	}

	if (process.platform === "linux") {
		const defaultPath = join(process.env.HOME ?? "/tmp", defaultName);
		const args = [
			"zenity",
			"--file-selection",
			"--save",
			"--confirm-overwrite",
			`--title=${prompt}`,
			`--filename=${defaultPath}`,
			...buildZenityFilterArgs(filters),
		];
		return runDialogCommand(args);
	}

	return null;
}

async function showOpenDialog(
	filters: FileFilter[],
	prompt = "Open",
): Promise<string | null> {
	if (process.platform === "darwin") {
		const typeList = filters.flatMap((filter) => filter.extensions).map((ext) => `"${ext}"`).join(", ");
		const script = `set f to POSIX path of (choose file of type {${typeList}} with prompt "${prompt}")\nreturn f`;
		return runDialogCommand(["osascript", "-e", script]);
	}

	if (process.platform === "linux") {
		const args = [
			"zenity",
			"--file-selection",
			`--title=${prompt}`,
			...buildZenityFilterArgs(filters),
		];
		return runDialogCommand(args);
	}

	return null;
}

async function showOpenDirectoryDialog(prompt = "Select Folder"): Promise<string | null> {
	if (process.platform === "darwin") {
		const script = `set f to POSIX path of (choose folder with prompt "${prompt}")\nreturn f`;
		return runDialogCommand(["osascript", "-e", script]);
	}

	if (process.platform === "linux") {
		return runDialogCommand([
			"zenity",
			"--file-selection",
			"--directory",
			`--title=${prompt}`,
		]);
	}

	return null;
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

async function listImageFilesRecursive(directory: string): Promise<string[]> {
	console.log("[images] scanning directory:", directory);
	const entries = await readdir(directory, { withFileTypes: true });
	const results: string[] = [];

	for (const entry of entries) {
		const fullPath = join(directory, entry.name);
		if (entry.isDirectory()) {
			results.push(...(await listImageFilesRecursive(fullPath)));
			continue;
		}

		const lower = entry.name.toLowerCase();
		const dot = lower.lastIndexOf(".");
		const ext = dot >= 0 ? lower.slice(dot) : "";
		if (IMAGE_EXTENSIONS.has(ext)) {
			results.push(fullPath);
		}
	}

	const sorted = results.sort();
	console.log("[images] found image files:", sorted.length);
	return sorted;
}

async function showSaveAsDialog(): Promise<string | null> {
	return showSaveDialog("workspace.span", [{ name: "Span files", extensions: ["span"] }], "Save As");
}

async function openProjectFolder(prompt = "Select image folder") {
	const directory = await showOpenDirectoryDialog(prompt);
	if (!directory) {
		console.log("[project] openProjectFolder cancelled");
		return;
	}
	const workspacePath = projectWorkspacePath(directory);
	const workspaceFile = Bun.file(workspacePath);
	if (await workspaceFile.exists()) {
		await rememberLastWorkspace(workspacePath);
		await mainWindow.webview.rpc.request.triggerOpen({ path: workspacePath });
		return;
	}
	const paths = await listImageFilesRecursive(directory);
	console.log("[project] opening folder paths:", paths.length);
	await mainWindow.webview.rpc.request.openProjectDirectory({ workspacePath, paths });
	await rememberLastWorkspace(workspacePath);
}

// --- RPC ---
const rpc = BrowserView.defineRPC<SpanRPC>({
	handlers: {
		requests: {
			showSaveDialog: ({ defaultName, filters }) => showSaveDialog(defaultName, filters),
			showOpenDialog: ({ filters }) => showOpenDialog(filters),
			showOpenDirectoryDialog: async ({ prompt }) => {
				console.log("[rpc] showOpenDirectoryDialog prompt:", prompt ?? "Select Folder");
				return showOpenDirectoryDialog(prompt);
			},
			importImageDirectory: async ({ prompt }) => {
				console.log("[rpc] importImageDirectory prompt:", prompt ?? "Select image folder");
				await openProjectFolder(prompt ?? "Select image folder");
			},
			pickImageDirectory: async ({ prompt }) => {
				console.log("[rpc] pickImageDirectory prompt:", prompt ?? "Select image folder");
				const directory = await showOpenDirectoryDialog(prompt ?? "Select image folder");
				if (!directory) {
					console.log("[rpc] pickImageDirectory cancelled");
					return null;
				}
				const paths = await listImageFilesRecursive(directory);
				console.log("[rpc] pickImageDirectory returning paths:", paths.length);
				return { directory, paths };
			},
			debugLog: ({ message }) => {
				console.log("[webview]", message);
			},
			readFile: async ({ path }) => {
				const file = Bun.file(path);
				return await file.text();
			},
			listImageFiles: async ({ directory }) => {
				console.log("[rpc] listImageFiles directory:", directory);
				return listImageFilesRecursive(directory);
			},
			writeFile: async ({ path, contents }) => {
				console.log("[writeFile] path:", path, "length:", contents.length);
				await mkdir(dirname(path), { recursive: true });
				await Bun.write(path, contents);
				console.log("[writeFile] done:", path);
				// Remember last .span file for auto-reopen
				if (path.endsWith(".span")) {
					await rememberLastWorkspace(path);
				}
				return { ok: true };
			},
			readImageAsDataUrl: async ({ path }) => {
				console.log("[images] reading image:", path);
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
				label: "Open Folder...",
				accelerator: "CommandOrControl+O",
				action: "openFolder",
			},
			{
				label: "Close Project",
				action: "closeProject",
			},
			{ type: "separator" as const },
			{
				label: "Import Spec...",
				action: "importSpec",
			},
			{
				label: "Export Spec...",
				action: "triggerExportSpec",
			},
			{
				label: "Import Sheet...",
				action: "importSheet",
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
			{ type: "separator" as const },
			{
				label: "Export...",
				accelerator: "CommandOrControl+E",
				action: "triggerExport",
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
			{ label: "Add Annotation", action: "addSprite" },
			{
				label: "Duplicate Annotation",
				accelerator: "CommandOrControl+D",
				action: "duplicateSprite",
			},
			{
				label: "Delete Annotation",
				accelerator: "Backspace",
				action: "deleteSprite",
			},
		],
	},
	{
		label: "View",
		submenu: [
			{ label: "Sheets", action: "addPanel:sheets" },
			{ label: "Canvas", action: "addPanel:sprite-canvas" },
			{ label: "Inspector", action: "addPanel:inspector" },
			{ label: "Sprites In Sheet", action: "addPanel:annotations" },
			{ label: "Gallery", action: "addPanel:gallery" },
			{ label: "Spec Editor", action: "addPanel:spec-editor" },
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
		case "openFolder": {
			await openProjectFolder("Select image folder");
			break;
		}
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
			const path = await showOpenDialog(
				[{ name: "Span files", extensions: ["span"] }],
				"Open Workspace",
			);
			if (path) {
				await rememberLastWorkspace(path);
				mainWindow.webview.rpc.request.triggerOpen({ path });
			}
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
		case "triggerExport": {
			const path = await showSaveDialog(
				"annotations.yaml",
				[
					{ name: "YAML files", extensions: ["yaml", "yml"] },
					{ name: "JSON files", extensions: ["json"] },
				],
				"Export",
			);
			if (path) {
				mainWindow.webview.rpc.request.triggerExport({ path });
			}
			break;
		}
		case "importSpec": {
			const path = await showOpenDialog(
				[{ name: "Spec files", extensions: ["yaml", "yml", "json"] }],
				"Import Spec",
			);
			if (path) {
				mainWindow.webview.rpc.request.triggerImportSpec({ path });
			}
			break;
		}
		case "triggerExportSpec": {
			const path = await showSaveDialog(
				"spec.yaml",
				[
					{ name: "YAML files", extensions: ["yaml", "yml"] },
					{ name: "JSON files", extensions: ["json"] },
				],
				"Export Spec",
			);
			if (path) {
				mainWindow.webview.rpc.request.triggerExportSpec({ path });
			}
			break;
		}
		case "importSheet": {
			const path = await showOpenDialog(
				[{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
				"Import Sheet",
			);
			if (path) {
				mainWindow.webview.rpc.request.triggerImportSheet({ path });
			}
			break;
		}
		case "closeProject":
			mainWindow.webview.rpc.request.closeProject({});
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

// --- Auto-reopen last workspace ---
(async () => {
	try {
		const lwp = lastWorkspacePath();
		const file = Bun.file(lwp);
		if (!(await file.exists())) return;
		const savedPath = (await file.text()).trim();
		if (!savedPath) return;
		const spanFile = Bun.file(savedPath);
		if (!(await spanFile.exists())) return;
		// Wait a moment for the window to be ready
		setTimeout(() => {
			mainWindow.webview.rpc.request.triggerOpen({ path: savedPath });
		}, 500);
	} catch (e) {
		console.error("Auto-reopen failed:", e);
	}
})();
