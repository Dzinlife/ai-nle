import { useEffect, useRef } from "react";
import { useElements } from "@/editor/TimelineContext";
import { createClipModel } from "../Clip/model";
import type { EditorElement } from "../types";
import { modelRegistry } from "./registry";

// 组件类型到 model 创建函数的映射
const modelFactories: Record<
	string,
	(id: string, props: any) => ReturnType<typeof createClipModel>
> = {
	Clip: createClipModel,
	// 其他组件的 model 工厂函数将在这里添加
};

/**
 * ModelManager - 管理所有 DSL 组件的 Model 生命周期
 *
 * 职责：
 * 1. 监听 elements 变化
 * 2. 为新增的元素创建 Model 并初始化
 * 3. 为删除的元素销毁 Model
 * 4. 同步 elements props 到 Model（外部编辑场景）
 */
export const ModelManager: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const { elements } = useElements();
	const prevElementsRef = useRef<EditorElement[]>([]);
	const initializedRef = useRef(false);

	console.log(`[ModelManager] Render - elements count: ${elements.length}`);
	elements.forEach((e) => {
		console.log(
			`[ModelManager] Element: ${e.props.id}, type:`,
			(e.type as any).displayName || (e.type as any).name,
		);
	});

	// 首次渲染时直接初始化所有 model
	if (!initializedRef.current && elements.length > 0) {
		console.log(`[ModelManager] First render - initializing models`);
		initializedRef.current = true;

		for (const element of elements) {
			const id = element.props.id;
			const componentType =
				(element.type as any).displayName ||
				(element.type as any).name ||
				"Unknown";

			console.log(
				`[ModelManager] Creating model for element ${id}, type: ${componentType}`,
			);

			const factory = modelFactories[componentType];

			if (factory) {
				const store = factory(id, element.props);
				modelRegistry.register(id, store);
				store.getState().init();
				console.log(`[ModelManager] Model created and initialized for ${id}`);
			} else {
				console.log(
					`[ModelManager] No factory found for component type: ${componentType}`,
				);
			}
		}

		prevElementsRef.current = elements;
	}

	useEffect(() => {
		console.log(
			`[ModelManager] useEffect triggered - elements count: ${elements.length}`,
		);

		// 跳过首次渲染（已在上面处理）
		if (!initializedRef.current) {
			return;
		}

		const prevIds = new Set(prevElementsRef.current.map((e) => e.props.id));
		const currIds = new Set(elements.map((e) => e.props.id));

		// 新增的元素：创建 model
		for (const element of elements) {
			const id = element.props.id;

			if (!prevIds.has(id) && !modelRegistry.has(id)) {
				// 获取组件类型名
				const componentType =
					(element.type as any).displayName ||
					(element.type as any).name ||
					"Unknown";

				console.log(
					`[ModelManager] Creating model for element ${id}, type: ${componentType}`,
				);

				const factory = modelFactories[componentType];

				if (factory) {
					// 创建 model
					const store = factory(id, element.props);
					modelRegistry.register(id, store);

					// 初始化
					store.getState().init();
					console.log(`[ModelManager] Model created and initialized for ${id}`);
				} else {
					console.log(
						`[ModelManager] No factory found for component type: ${componentType}`,
					);
				}
			}
		}

		// 删除的元素：销毁 model
		for (const element of prevElementsRef.current) {
			const id = element.props.id;

			if (!currIds.has(id)) {
				modelRegistry.unregister(id);
			}
		}

		// 更新现有 model 的 props（处理外部编辑场景）
		for (const element of elements) {
			const id = element.props.id;
			const store = modelRegistry.get(id);

			if (store) {
				const currentProps = store.getState().props;
				const newProps = element.props;

				// 只同步时间相关的 props（start, end）
				// 避免完全覆盖导致的问题
				if (
					currentProps.start !== newProps.start ||
					currentProps.end !== newProps.end
				) {
					// 使用 validate 确保值合法
					const result = store.getState().validate({
						start: newProps.start,
						end: newProps.end,
					});

					if (result.valid) {
						store.setState((state) => ({
							...state,
							props: {
								...state.props,
								start: newProps.start,
								end: newProps.end,
							},
						}));
					}
				}
			}
		}

		prevElementsRef.current = elements;
	}, [elements]);

	// 组件卸载时清理所有 model
	useEffect(() => {
		return () => {
			for (const id of modelRegistry.getIds()) {
				modelRegistry.unregister(id);
			}
		};
	}, []);

	return <>{children}</>;
};
