import type { DSLComponentDefinition } from "../model/componentRegistry";
import { componentRegistry } from "../model/componentRegistry";
import { createTransitionModel, type TransitionProps } from "./model";
import { prepareSyncPicture } from "./picture";
import TransitionRenderer from "./renderer";
import { TransitionTimeline } from "./timeline";

export { createTransitionModel, type TransitionProps } from "./model";
export { renderNodeToPicture, useSkPictureFromNode } from "./picture";
export { TransitionTimeline } from "./timeline";

export const TransitionDefinition: DSLComponentDefinition<TransitionProps> = {
	type: "Transition",
	component: "transition/crossfade",
	createModel: createTransitionModel,
	Renderer: TransitionRenderer,
	prepareRenderFrame: async ({
		element,
		displayTime,
		fromNode,
		toNode,
		canvasSize,
	}) => {
		if (!canvasSize) return;
		const { width, height } = canvasSize;
		if (width <= 0 || height <= 0) return;
		if (fromNode) {
			await prepareSyncPicture(`${element.id}:from`, displayTime, fromNode, {
				width,
				height,
			});
		}
		if (toNode) {
			await prepareSyncPicture(`${element.id}:to`, displayTime, toNode, {
				width,
				height,
			});
		}
	},
	Timeline: TransitionTimeline,
	meta: {
		name: "Crossfade",
		category: "transition",
		trackRole: "clip",
		description: "Crossfade between adjacent clips",
		defaultProps: {},
	},
};

componentRegistry.register(TransitionDefinition);

export default TransitionRenderer;
