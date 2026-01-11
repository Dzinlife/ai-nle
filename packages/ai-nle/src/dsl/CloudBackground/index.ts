import type { DSLComponentDefinition } from "../model/componentRegistry";
import { componentRegistry } from "../model/componentRegistry";
import {
	type CloudBackgroundProps,
	createCloudBackgroundModel,
} from "./model";
import CloudBackgroundRenderer from "./renderer";
import { CloudBackgroundTimeline } from "./timeline";

export {
	type CloudBackgroundInternal,
	type CloudBackgroundProps,
	createCloudBackgroundModel,
} from "./model";
export { CloudBackgroundTimeline } from "./timeline";

// 组件定义
export const CloudBackgroundDefinition: DSLComponentDefinition<CloudBackgroundProps> =
	{
		type: "CloudBackground",
		createModel: createCloudBackgroundModel,
		Renderer: CloudBackgroundRenderer,
		Timeline: CloudBackgroundTimeline,
		meta: {
			name: "Cloud Background",
			category: "background",
			description: "Animated cloud background with shader effects",
			defaultProps: {
				speed: 1.0,
				cloudDensity: 1.0,
				skyColor: "#87CEEB",
				cloudColor: "#FFFFFF",
				start: 0,
				end: 10,
			},
		},
	};

// 注册到全局组件注册表
componentRegistry.register(CloudBackgroundDefinition);

// 设置 displayName
CloudBackgroundRenderer.displayName = "CloudBackground";

export default CloudBackgroundRenderer;
