import { Electroview } from "electrobun/view";
import type { SpanRPC } from "../../shared/rpc-schema";
import type { Annotation } from "./types";
import { ref } from "vue";

export const projectPath = ref<string>("");

let canCloseHandler: () => boolean = () => true;

export function setCanCloseHandler(handler: () => boolean) {
	canCloseHandler = handler;
}

const rpc = Electroview.defineRPC<SpanRPC>({
	handlers: {
		requests: {
			canClose: () => canCloseHandler(),
		},
		messages: {
			projectLoaded: ({ projectPath: path }) => {
				projectPath.value = path;
				console.log("Project loaded:", path);
			},
		},
	},
});

const electroview = new Electroview({ rpc });

export const api = {
	getProjectAnnotations: () =>
		electroview.rpc.request.getProjectAnnotations({}),
	saveAnnotations: (sheet: string, annotations: Annotation[]) =>
		electroview.rpc.request.saveAnnotations({ sheet, annotations }),
	getSheetImage: (sheet: string) =>
		electroview.rpc.request.getSheetImage({ sheet }),
	pickProjectDirectory: () =>
		electroview.rpc.request.pickProjectDirectory({}),
};
