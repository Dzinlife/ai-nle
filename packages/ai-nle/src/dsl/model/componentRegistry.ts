import type React from "react";
import type { ComponentModelStore } from "./types";

/**
 * 组件定义接口
 */
export interface DSLComponentDefinition<Props = any> {
	// 组件类型名称
	type: string;

	// Model 工厂函数
	createModel: (id: string, props: Props) => ComponentModelStore<Props>;

	// 渲染组件（用于 Preview 和导出）
	Renderer: React.ComponentType<any>;

	// 时间线组件
	Timeline: React.ComponentType<any>;

	// 组件元数据
	meta: {
		name: string; // 显示名称
		category: string; // 分类
		icon?: React.ComponentType; // 图标组件
		description?: string; // 描述
		defaultProps?: Partial<Props>; // 默认 props
	};
}

/**
 * 组件注册表（单例）
 */
class ComponentRegistryClass {
	private components = new Map<string, DSLComponentDefinition>();

	/**
	 * 注册组件
	 */
	register<Props = any>(definition: DSLComponentDefinition<Props>): void {
		if (this.components.has(definition.type)) {
			console.warn(
				`Component type "${definition.type}" already registered, replacing...`,
			);
		}
		this.components.set(definition.type, definition);
	}

	/**
	 * 获取组件定义
	 */
	get(type: string): DSLComponentDefinition | undefined {
		return this.components.get(type);
	}

	/**
	 * 检查是否已注册
	 */
	has(type: string): boolean {
		return this.components.has(type);
	}

	/**
	 * 获取所有已注册的组件类型
	 */
	getTypes(): string[] {
		return Array.from(this.components.keys());
	}

	/**
	 * 获取所有组件定义
	 */
	getAll(): DSLComponentDefinition[] {
		return Array.from(this.components.values());
	}

	/**
	 * 按分类获取组件
	 */
	getByCategory(category: string): DSLComponentDefinition[] {
		return this.getAll().filter((def) => def.meta.category === category);
	}

	/**
	 * 获取所有分类
	 */
	getCategories(): string[] {
		const categories = new Set(
			this.getAll().map((def) => def.meta.category),
		);
		return Array.from(categories);
	}
}

// 导出单例
export const componentRegistry = new ComponentRegistryClass();
