export interface LayoutMeta {
	// 尺寸
	width?: number | "auto" | string; // 可为数值或百分比
	height?: number | "auto" | string;

	// 边距约束
	left?: number | string;
	right?: number | string;
	top?: number | string;
	bottom?: number | string;

	// 约束模式（Figma 同款）
	constraints?: {
		horizontal: "LEFT" | "RIGHT" | "CENTER" | "LEFT_RIGHT" | "SCALE";
		vertical: "TOP" | "BOTTOM" | "CENTER" | "TOP_BOTTOM" | "SCALE";
	};

	rotate?: string; // 度数 eg: "45deg"

	// 锚点（旋转或scale变换参考点）
	anchor?: "top-left" | "center" | "bottom-right";

	// Z序和可见性
	zIndex?: number;
	visible?: boolean;
}

export interface LayoutRendererMeta {
	x: number;
	y: number;
	w: number;
	h: number;
	r?: number;
}

export interface TimelineMeta {
	start: number | string;
	end: number | string;
}

export interface CommonMeta {
	id: string;
	name: string;
}

export interface ComponentProps extends CommonMeta, LayoutMeta, TimelineMeta {
	__renderLayout: LayoutRendererMeta;
}

export interface ComponentTimelineProps
	extends CommonMeta,
		LayoutMeta,
		TimelineMeta {}

export interface EditorElement
	extends React.ReactElement<CommonMeta & LayoutMeta & TimelineMeta> {
	type: EditorComponent;
}

export type EditorComponent<T extends Record<string, any> = {}> =
	React.ComponentType<T & ComponentProps> & {
		timelineComponent?: React.ComponentType<T & ComponentTimelineProps>;
	};
