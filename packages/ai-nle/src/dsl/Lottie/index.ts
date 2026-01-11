import type { DSLComponentDefinition } from "../model/componentRegistry";
import { componentRegistry } from "../model/componentRegistry";
import { createLottieModel, type LottieProps } from "./model";
import Lottie from "./renderer";
import { LottieTimeline } from "./timeline";

export { createLottieModel, type LottieProps } from "./model";
export { LottieTimeline } from "./timeline";

// 组件定义
export const LottieDefinition: DSLComponentDefinition<LottieProps> = {
	type: "Lottie",
	createModel: createLottieModel,
	Renderer: Lottie,
	Timeline: LottieTimeline,
	meta: {
		name: "Lottie Animation",
		category: "animation",
		description: "Lottie animation playback",
		defaultProps: {
			start: 0,
			end: 5,
		},
	},
};

// 注册到全局组件注册表
componentRegistry.register(LottieDefinition);

// 设置 displayName
Lottie.displayName = "Lottie";

export default Lottie;
