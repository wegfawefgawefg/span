import type { Ref } from "vue";
import type { Annotation, SheetWithAnnotations } from "../types";

export interface PlatformAdapter {
	getProjectAnnotations(): Promise<SheetWithAnnotations[]>;
	saveAnnotations(
		sheet: string,
		annotations: Annotation[],
	): Promise<{ ok: boolean }>;
	getSheetImage(sheet: string): Promise<string>;
	pickProjectDirectory(): Promise<string | null>;
	revealSheet(sheet: string): Promise<void>;
	saveLayout(layout: object): Promise<{ ok: boolean }>;
	loadLayout(): Promise<object | null>;
	/** Whether direct save-back to disk is available */
	canSave: Ref<boolean>;
}
