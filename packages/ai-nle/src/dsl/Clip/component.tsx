import { useModel, useModelExists } from "../model/registry";
import type { EditorComponent } from "../types";
import type { ClipModelStore, ClipProps } from "./model";
import { ClipRenderer } from "./renderer";
import { ClipTimeline } from "./timeline";

/**
 * Clip 组件 - 用于在 Timeline DSL 中使用
 * 内部使用新的 Model 系统
 */
const ClipComponent: EditorComponent<ClipProps> = (props) => {
	const hasModel = useModelExists(props.id);

	console.log(`[ClipComponent] Rendering clip ${props.id}, hasModel: ${hasModel}`);

	// Model 还未创建时，返回空组件
	// ModelManager 会在 mount 后创建 Model
	if (!hasModel) {
		console.log(`[ClipComponent] Model not found for ${props.id}, returning null`);
		return null;
	}

	// 获取 store 实例
	const store = useModel<ClipProps>(props.id) as ClipModelStore;

	console.log(`[ClipComponent] Rendering ClipRenderer for ${props.id}`);
	// 使用 ClipRenderer 进行预览渲染
	return <ClipRenderer store={store} {...props} />;
};

// 设置 displayName 用于识别
ClipComponent.displayName = "Clip";

// 设置 timelineComponent 用于时间线渲染
ClipComponent.timelineComponent = ClipTimeline as any;

export default ClipComponent;
