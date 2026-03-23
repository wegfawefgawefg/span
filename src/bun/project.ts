import { readdir, mkdir, rename } from "fs/promises";
import { join, parse as parsePath } from "path";
import type { Annotation, SheetWithAnnotations } from "../shared/rpc-schema";

export class Project {
	readonly root: string;
	readonly sheetsDir: string;
	readonly annotationsDir: string;
	readonly manifestPath: string;

	constructor(projectDir: string) {
		this.root = projectDir;
		this.sheetsDir = join(projectDir, "sheets");
		this.annotationsDir = join(projectDir, "annotations");
		this.manifestPath = join(projectDir, "manifest.json");
	}

	async ensureAnnotationsDir(): Promise<void> {
		await mkdir(this.annotationsDir, { recursive: true });
	}

	async listSheetFiles(): Promise<string[]> {
		try {
			const entries = await readdir(this.sheetsDir);
			return entries
				.filter((f) => f.toLowerCase().endsWith(".png"))
				.sort();
		} catch {
			return [];
		}
	}

	annotationPathForSheet(sheetName: string): string {
		const stem = parsePath(sheetName).name;
		return join(this.annotationsDir, `${stem}.annotations.json`);
	}

	async loadAnnotations(
		sheetName: string,
	): Promise<{ image: string; annotations: Annotation[] }> {
		const path = this.annotationPathForSheet(sheetName);
		try {
			const file = Bun.file(path);
			if (!(await file.exists())) {
				return { image: sheetName, annotations: [] };
			}
			return await file.json();
		} catch {
			return { image: sheetName, annotations: [] };
		}
	}

	async saveAnnotations(
		sheetName: string,
		annotations: Annotation[],
	): Promise<void> {
		await this.ensureAnnotationsDir();
		const path = this.annotationPathForSheet(sheetName);
		const payload = { image: sheetName, annotations };
		const tmpPath = path + ".tmp";
		await Bun.write(tmpPath, JSON.stringify(payload, null, 2) + "\n");
		await rename(tmpPath, path);
	}

	async loadManifest(): Promise<Map<string, Record<string, unknown>>> {
		const result = new Map<string, Record<string, unknown>>();
		try {
			const file = Bun.file(this.manifestPath);
			if (!(await file.exists())) return result;
			const data = await file.json();
			for (const asset of data.assets ?? []) {
				if (typeof asset.file === "string") {
					result.set(asset.file, asset);
				}
			}
		} catch {
			// ignore
		}
		return result;
	}

	async getSheetImageBase64(sheetName: string): Promise<string> {
		const path = join(this.sheetsDir, sheetName);
		const file = Bun.file(path);
		const buffer = await file.arrayBuffer();
		const base64 = Buffer.from(buffer).toString("base64");
		return `data:image/png;base64,${base64}`;
	}

	async loadProjectAnnotations(): Promise<SheetWithAnnotations[]> {
		const manifest = await this.loadManifest();
		const files = await this.listSheetFiles();
		const sheets: SheetWithAnnotations[] = [];

		for (const file of files) {
			const asset = manifest.get(file) ?? {};
			const { annotations } = await this.loadAnnotations(file);
			const annotationFile = parsePath(
				this.annotationPathForSheet(file),
			).base;

			sheets.push({
				file,
				name: (asset.name as string) ?? parsePath(file).name,
				imageUrl: "",
				annotationFile: `annotations/${annotationFile}`,
				annotations,
			});
		}

		return sheets;
	}
}
