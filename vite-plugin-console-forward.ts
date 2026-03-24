import type { Plugin } from "vite";

const LEVEL_COLORS: Record<string, string> = {
	log: "\x1b[36m",    // cyan
	warn: "\x1b[33m",   // yellow
	error: "\x1b[31m",  // red
	info: "\x1b[34m",   // blue
	debug: "\x1b[90m",  // gray
};
const RESET = "\x1b[0m";
const LABEL = "\x1b[35m[browser]\x1b[0m"; // magenta label

function formatArgs(args: unknown[]): string {
	return args
		.map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
		.join(" ");
}

export default function consoleForward(): Plugin {
	return {
		name: "console-forward",
		apply: "serve",

		configureServer(server) {
			server.ws.on("console-forward", (data: { level: string; args: unknown[] }) => {
				const color = LEVEL_COLORS[data.level] ?? "";
				const tag = `${color}${data.level.toUpperCase()}${RESET}`;
				console.log(`${LABEL} ${tag} ${formatArgs(data.args)}`);
			});
		},

		transformIndexHtml() {
			return [
				{
					tag: "script",
					attrs: { type: "module" },
					children: `
if (import.meta.hot) {
	const _levels = ["log", "warn", "error", "info", "debug"];
	for (const _level of _levels) {
		const _orig = console[_level];
		console[_level] = function (...args) {
			_orig.apply(console, args);
			try {
				const safe = args.map(a => {
					try { return JSON.parse(JSON.stringify(a)); }
					catch { return String(a); }
				});
				import.meta.hot.send("console-forward", { level: _level, args: safe });
			} catch {}
		};
	}
}`,
					injectTo: "head-prepend",
				},
			];
		},
	};
}
