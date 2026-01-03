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

	// 锚点（旋转或scale变换参考点）
	anchor?: "top-left" | "center" | "bottom-right";

	// Z序和可见性
	zIndex?: number;
	visible?: boolean;
}

export interface ICommonProps extends LayoutMeta {
	id: string;
	name: string;
}
