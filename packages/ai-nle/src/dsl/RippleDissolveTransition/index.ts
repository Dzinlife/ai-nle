import type { DSLComponentDefinition } from "../model/componentRegistry";
import { componentRegistry } from "../model/componentRegistry";
import { createTransitionModel, type TransitionProps } from "../Transition/model";
import { prepareSyncPicture } from "../Transition/picture";
import { TransitionTimeline } from "../Transition/timeline";
import RippleDissolveTransitionRenderer from "./renderer";

export const RippleDissolveTransitionDefinition: DSLComponentDefinition<
	TransitionProps
> = {
	type: "Transition",
	component: "transition/ripple-dissolve",
	createModel: createTransitionModel,
	Renderer: RippleDissolveTransitionRenderer,
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
		name: "Ripple Dissolve",
		category: "transition",
		trackRole: "clip",
		description: "Ripple dissolve shader transition",
		defaultProps: {},
	},
};

componentRegistry.register(RippleDissolveTransitionDefinition);

export default RippleDissolveTransitionDefinition;
