import type { DSLComponentDefinition } from "../model/types";
import { createClipModel, type ClipProps } from "./model";
import { ClipRenderer } from "./renderer";
import { ClipTimeline } from "./timeline";

export { createClipModel, type ClipProps, type ClipInternal } from "./model";
export { ClipRenderer } from "./renderer";
export { ClipTimeline } from "./timeline";

// 导出组件（使用命名导出以避免循环依赖）
export { default } from "./component";

// Clip 组件定义
export const ClipDefinition: DSLComponentDefinition<ClipProps> = {
	createModel: createClipModel,
	Preview: ClipRenderer as any, // 用于预览和导出渲染
	Timeline: ClipTimeline,
	meta: {
		name: "Video Clip",
		category: "media",
		defaultProps: {
			reversed: false,
			start: 0,
			end: 5,
		},
	},
};
