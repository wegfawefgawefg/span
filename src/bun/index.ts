import Electrobun, {
	BrowserView,
	BrowserWindow,
	Updater,
} from "electrobun/bun";
import type { SpanRPC } from "../shared/rpc-schema";
import { Project } from "./project";

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
		// In dev, walk up from the app bundle to find the repo root.
		// The bundled main.js lives at:
		//   <repo>/build/dev-<platform>/Span-dev.app/Contents/Resources/main.js
		const { resolve, join } = await import("path");
		const resourcesDir = new URL(".", import.meta.url).pathname;
		const repoRoot = resolve(resourcesDir, "../../../../../../..");
		return join(repoRoot, "example_project");
	}

	// Production: bundled in resources
	return "resources://example_project";
}

const resolvedPath = await resolveProjectPath();
const project = new Project(resolvedPath);
await project.ensureAnnotationsDir();
console.log(`Project: ${resolvedPath}`);

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
