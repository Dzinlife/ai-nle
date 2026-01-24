import type { DSLComponentDefinition } from "../model/componentRegistry";
import { componentRegistry } from "../model/componentRegistry";
import {
	type TransitionProps,
	createTransitionModel,
} from "./model";
import TransitionRenderer from "./renderer";
import { TransitionTimeline } from "./timeline";

export { type TransitionProps, createTransitionModel } from "./model";
export { TransitionTimeline } from "./timeline";
export { renderNodeToPicture, useSkPictureFromNode } from "./picture";

export const TransitionDefinition: DSLComponentDefinition<TransitionProps> = {
	type: "Transition",
	component: "transition/crossfade",
	createModel: createTransitionModel,
	Renderer: TransitionRenderer,
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
