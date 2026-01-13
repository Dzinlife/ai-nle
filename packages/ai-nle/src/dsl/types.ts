// ============================================================================
// 新架构：分离的属性系统
// ============================================================================

/**
 * 空间变换属性 (画布中心坐标系统)
 * 独立于组件 props，描述元素的空间位置和变换
 * 坐标系原点在画布中心，centerX=0, centerY=0 表示元素中心在画布中心
 */
export interface TransformMeta {
	centerX: number; // 中心点 X 坐标（相对于画布中心，正值向右）
	centerY: number; // 中心点 Y 坐标（相对于画布中心，正值向下）
	width: number; // 宽度（像素）
	height: number; // 高度（像素）
	rotation: number; // 旋转角度（弧度）
}

/**
 * 轨道角色类型
 * 为 agent 操作提供语义基础
 */
export type TrackRole =
	| 'main'      // 主轨道：主要内容（视频、音频主体）
	| 'overlay'   // 叠加层：贴纸、字幕、水印等
	| 'effect'    // 效果层：滤镜、转场、特效等
	| 'audio';    // 音频轨：背景音乐、音效等

/**
 * 时间线属性
 * 独立于组件 props，描述元素的时间范围和轨道位置
 */
export interface TimelineMeta {
	start: number; // 开始时间（秒）
	end: number; // 结束时间（秒）
	trackIndex?: number; // 轨道索引（0 为主轨道，在底部）
	role?: TrackRole; // 轨道角色（语义标识，用于 agent 理解）
}

/**
 * 渲染属性
 * 控制元素的渲染行为
 */
export interface RenderMeta {
	zIndex?: number; // Z 序
	visible?: boolean; // 可见性
	opacity?: number; // 透明度 (0-1)
}

/**
 * 渲染布局（传递给渲染器的布局信息）
 * 使用中心坐标系统
 */
export interface RenderLayout {
	cx: number; // 中心点 X
	cy: number; // 中心点 Y
	w: number; // 宽度
	h: number; // 高度
	rotation: number; // 旋转（弧度）
}

/**
 * 时间线元素（纯数据结构）
 * 不再是 React.ReactElement，而是纯 JSON 可序列化的数据对象
 */
export interface TimelineElement<Props = Record<string, any>> {
	id: string; // 唯一标识符
	type: string; // 组件类型 ("Image" | "Clip" | "Lottie" | ...)
	name: string; // 显示名称

	transform: TransformMeta; // 空间属性
	timeline: TimelineMeta; // 时间属性
	render: RenderMeta; // 渲染属性

	props: Props; // 组件特定属性（仅业务逻辑）
}

// ============================================================================
// 向后兼容：旧的接口保留用于渐进式迁移
// ============================================================================

/**
 * @deprecated 使用 TransformMeta 替代
 * 保留用于渐进式迁移
 */
export interface LayoutMeta {
	width?: number | "auto" | string;
	height?: number | "auto" | string;
	left?: number | string;
	right?: number | string;
	top?: number | string;
	bottom?: number | string;
	constraints?: {
		horizontal: "LEFT" | "RIGHT" | "CENTER" | "LEFT_RIGHT" | "SCALE";
		vertical: "TOP" | "BOTTOM" | "CENTER" | "TOP_BOTTOM" | "SCALE";
	};
	rotate?: string;
	anchor?: "top-left" | "center" | "bottom-right";
	zIndex?: number;
	visible?: boolean;
}

/**
 * @deprecated 使用 RenderLayout 替代
 */
export interface LayoutRendererMeta {
	x: number;
	y: number;
	w: number;
	h: number;
	r?: number;
}

/**
 * 组件 Props 基础接口
 * 仅包含渲染所需的基本信息
 */
export interface ComponentProps {
	id: string;
	name: string;
	__renderLayout: RenderLayout; // 渲染布局（由编辑器注入）
	__timeline?: TimelineMeta; // 时间线属性（由编辑器注入，可选）
}

/**
 * 时间线组件 Props
 */
export interface ComponentTimelineProps {
	id: string;
	name: string;
	transform: TransformMeta;
	timeline: TimelineMeta;
	render: RenderMeta;
}

/**
 * @deprecated 旧的 EditorElement，使用 TimelineElement 替代
 */
export interface EditorElement
	extends React.ReactElement<any> {
	type: EditorComponent;
}

/**
 * 组件定义类型
 */
export type EditorComponent<T extends Record<string, any> = {}> =
	React.ComponentType<T & ComponentProps> & {
		timelineComponent?: React.ComponentType<T & ComponentTimelineProps>;
	};
