import type { StoreApi } from "zustand";
import type { LayoutRendererMeta } from "../types";

// 组件约束信息
export interface ComponentConstraints {
	// 时间约束
	minDuration?: number;
	maxDuration?: number;
	canTrimStart?: boolean;
	canTrimEnd?: boolean;

	// 布局约束
	aspectRatio?: number;
	minWidth?: number;
	maxWidth?: number;

	// 状态
	isLoading?: boolean;
	hasError?: boolean;
	errorMessage?: string;
}

// 验证结果
export interface ValidationResult {
	valid: boolean;
	errors: string[];
	// 修正后的值（当验证失败时，提供一个合法的替代值）
	corrected?: Record<string, unknown>;
}

// Model State 基础类型
export interface ComponentModelState<Props = Record<string, unknown>> {
	id: string;
	type: string;
	props: Props;
	constraints: ComponentConstraints;
	// 内部状态（组件特有的，如解码器实例等）
	internal: Record<string, unknown>;
}

// Model Actions 基础类型
export interface ComponentModelActions<Props = Record<string, unknown>> {
	setProps: (partial: Partial<Props>) => ValidationResult;
	setConstraints: (partial: Partial<ComponentConstraints>) => void;
	setInternal: (partial: Record<string, unknown>) => void;

	// 验证
	validate: (newProps: Partial<Props>) => ValidationResult;

	// 生命周期
	init: () => Promise<void> | void;
	dispose: () => void;
}

// 完整 Model 类型
export type ComponentModel<Props = Record<string, unknown>> =
	ComponentModelState<Props> & ComponentModelActions<Props>;

// Model Store 类型
export type ComponentModelStore<Props = Record<string, unknown>> = StoreApi<
	ComponentModel<Props>
>;

// 渲染 Props（传递给 Preview 组件）
export interface RenderProps {
	__renderLayout: LayoutRendererMeta;
	__currentTime: number;
}

// 时间线 Props（传递给 Timeline 组件）
export interface TimelineProps {
	start: number;
	end: number;
}

// DSL 组件定义
export interface DSLComponentDefinition<Props = Record<string, unknown>> {
	// 创建 model store 的工厂函数
	createModel: (id: string, initialProps: Props) => ComponentModelStore<Props>;

	// View 组件
	Preview: React.ComponentType<{ id: string } & RenderProps>;
	Timeline: React.ComponentType<{ id: string } & TimelineProps>;
	Panel?: React.ComponentType<{ id: string }>;

	// 元信息
	meta: {
		name: string;
		icon?: string;
		category: "media" | "effect" | "text" | "shape" | "container";
		defaultProps: Partial<Props>;
	};
}
