import { componentRegistry } from "../model/componentRegistry";
import type { DSLComponentDefinition } from "../model/componentRegistry";
import { createImageModel, type ImageProps } from "./model";
import ImageRenderer from "./renderer";
import { ImageTimeline } from "./timeline";

export { type ImageInternal, type ImageProps, createImageModel } from "./model";
export { ImageTimeline } from "./timeline";

// 组件定义
export const ImageDefinition: DSLComponentDefinition<ImageProps> = {
	type: "Image",
	createModel: createImageModel,
	Renderer: ImageRenderer,
	Timeline: ImageTimeline,
	meta: {
		name: "Image",
		category: "media",
		description: "Static image component",
		defaultProps: {
			start: 0,
			end: 5,
		},
	},
};

// 注册到全局组件注册表
componentRegistry.register(ImageDefinition);

// 设置 displayName
ImageRenderer.displayName = "Image";

export default ImageRenderer;
