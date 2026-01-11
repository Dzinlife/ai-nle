import { useEffect, useRef } from "react";
import { useElements } from "@/editor/TimelineContext";
import type { EditorElement } from "../types";
import { componentRegistry } from "./componentRegistry";
import { modelRegistry } from "./registry";

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

	// 首次渲染时直接初始化所有 model
	if (!initializedRef.current && elements.length > 0) {
		initializedRef.current = true;

		for (const element of elements) {
			const id = element.props.id;
			const componentType =
				(element.type as any).displayName ||
				(element.type as any).name ||
				"Unknown";

			const definition = componentRegistry.get(componentType);

			if (definition) {
				const store = definition.createModel(id, element.props);
				modelRegistry.register(id, store);
				store.getState().init();
			}
		}

		prevElementsRef.current = elements;
	}

	useEffect(() => {
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

				const definition = componentRegistry.get(componentType);

				if (definition) {
					// 创建 model
					const store = definition.createModel(id, element.props);
					modelRegistry.register(id, store);

					// 初始化
					store.getState().init();
					console.log(`[ModelManager] Model created and initialized for ${id}`);
				} else {
					console.log(
						`[ModelManager] No definition found for component type: ${componentType}`,
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
				const state = store.getState();
				const currentProps = state.props as any;
				const newProps = element.props;

				// 只同步时间相关的 props（start, end）
				// 避免完全覆盖导致的问题
				if (
					currentProps.start !== newProps.start ||
					currentProps.end !== newProps.end
				) {
					// 使用 validate 确保值合法
					const result = state.validate({
						start: newProps.start,
						end: newProps.end,
					});

					if (result.valid) {
						store.setState((state) => ({
							...state,
							props: {
								...(state.props as any),
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
