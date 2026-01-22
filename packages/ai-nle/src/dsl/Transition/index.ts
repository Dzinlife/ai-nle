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

export const TransitionDefinition: DSLComponentDefinition<TransitionProps> = {
	type: "Transition",
	createModel: createTransitionModel,
	Renderer: TransitionRenderer,
	Timeline: TransitionTimeline,
	meta: {
		name: "Transition",
		category: "transition",
		trackRole: "clip",
		description: "Transition between adjacent clips",
		defaultProps: {},
	},
};

componentRegistry.register(TransitionDefinition);

export default TransitionRenderer;
