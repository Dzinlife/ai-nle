import type { DSLComponentDefinition } from "../model/componentRegistry";
import { componentRegistry } from "../model/componentRegistry";
import { type ClipProps, createClipModel } from "./model";
import ClipRenderer from "./renderer";
import { ClipTimeline } from "./timeline";

// 组件定义
export const ClipDefinition: DSLComponentDefinition<ClipProps> = {
	type: "Clip",
	createModel: createClipModel,
	Renderer: ClipRenderer,
	Timeline: ClipTimeline,
	meta: {
		name: "Video Clip",
		category: "media",
		trackRole: "clip",
		description: "Video clip with support for trimming and playback",
		defaultProps: {
			reversed: false,
			start: 0,
			end: 5,
		},
	},
};

// 注册到全局组件注册表
componentRegistry.register(ClipDefinition);

export default ClipRenderer;
