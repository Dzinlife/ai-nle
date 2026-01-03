// src/reconciler/HostConfig.ts

import type React from "react";
import { createContext } from "react";
import type { HostConfig } from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";

interface SkiaInstance {
	draw: () => void;
	children?: SkiaInstance[];
}

interface SkiaContainer {
	surface: ReturnType<typeof CanvasKit.MakeWebGLCanvasSurface>;
	CanvasKit: typeof CanvasKit;
	rootNode?: SkiaInstance;
}

type Type = string | React.ComponentType<Record<string, unknown>>;
type Props = Record<string, unknown>;
type Container = SkiaContainer;
type Instance = SkiaInstance;
type TextInstance = never;
type SuspenseInstance = Instance;
type HydratableInstance = Instance;
type PublicInstance = Instance;
type HostContext = object;
type UpdatePayload = unknown;
type ChildSet = Instance[];
type TimeoutHandle = ReturnType<typeof setTimeout>;
type NoTimeout = -1;
type TransitionStatus = unknown;

export const hostConfig: HostConfig<
	Type,
	Props,
	Container,
	Instance,
	TextInstance,
	SuspenseInstance,
	HydratableInstance,
	PublicInstance,
	HostContext,
	UpdatePayload,
	ChildSet,
	TimeoutHandle,
	NoTimeout,
	TransitionStatus
> = {
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	isPrimaryRenderer: false,
	noTimeout: -1,
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,

	getRootHostContext(_rootContainer: Container): HostContext {
		return {};
	},

	getChildHostContext(
		_parentHostContext: HostContext,
		_type: Type,
		_rootContainer: Container,
	): HostContext {
		console.log("🟡 getChildHostContext called with type:", _type);
		return {};
	},

	shouldSetTextContent(_type: Type, _props: Props): boolean {
		console.log("🟡 shouldSetTextContent called with type:", _type);
		return false;
	},

	createTextInstance(
		_text: string,
		_rootContainer: Container,
		_hostContext: HostContext,
	): TextInstance {
		throw new Error("Text nodes are not supported");
	},

	getPublicInstance(instance: Instance | TextInstance) {
		return instance;
	},

	commitTextUpdate(
		_textInstance: TextInstance,
		_oldText: string,
		_newText: string,
	): void {
		// 文本节点不支持
	},

	clearContainer(_container: Container): void {
		console.log("🟢 clearContainer called");
		// 清空容器
		if (_container.rootNode) {
			_container.rootNode = undefined;
		}
	},

	prepareUpdate(
		_instance: Instance,
		_type: Type,
		oldProps: Props,
		newProps: Props,
		_container: Container,
		_hostContext: HostContext,
	): UpdatePayload | null {
		console.log("🟢 prepareUpdate called");
		// 简单比较 props，如果相同返回 null（不需要更新）
		if (JSON.stringify(oldProps) === JSON.stringify(newProps)) {
			return null;
		}
		// 返回更新负载
		return _container;
	},

	prepareForCommit(_container: Container): Record<string, unknown> | null {
		console.log("🟢 prepareForCommit called");
		return null;
	},

	resetAfterCommit(container: Container): void {
		console.log("🟢 resetAfterCommit called");
		// 在 commit 完成后刷新 surface
		if (container.surface) {
			container.surface.flush();
		}
	},

	createInstance(
		type: Type,
		props: Props,
		rootContainer: Container,
		_hostContext: HostContext,
		_internalHandle: unknown,
	): Instance {
		console.log("🔵 createInstance called with type:", type);
		console.log("🔵 type is string?", typeof type === "string");
		console.log("🔵 type is function?", typeof type === "function");
		console.log("🔵 type value:", type);
		console.log("🔵 props:", props);

		// 检查 type 是否是函数组件，如果是，尝试获取其名称
		const typeName =
			typeof type === "function"
				? (type as React.ComponentType).name
				: String(type);
		console.log("🔵 typeName:", typeName);

		// 支持字符串 "skRect" (host component) 或 "Rect" (legacy)
		if (type === "skRect" || type === "Rect" || typeName === "Rect") {
			// 创建一个矩形节点
			// props.color 是 [r, g, b, a] 格式，需要转换为 0-1 范围
			const color = (props.color as number[]) || [0, 0, 0, 255];
			const colorRGBA = [
				color[0] / 255,
				color[1] / 255,
				color[2] / 255,
				color[3] / 255,
			];
			const rectObj = props.rect as {
				x: number;
				y: number;
				width: number;
				height: number;
			};
			const rect = rootContainer.CanvasKit.XYWHRect(
				rectObj.x,
				rectObj.y,
				rectObj.width,
				rectObj.height,
			);
			return {
				draw: () => {
					if (!rootContainer.surface) {
						return;
					}
					const paint = new rootContainer.CanvasKit.Paint();
					paint.setColor(
						rootContainer.CanvasKit.Color(
							colorRGBA[0],
							colorRGBA[1],
							colorRGBA[2],
							colorRGBA[3],
						),
					);
					const canvas = rootContainer.surface.getCanvas();
					canvas.drawRect(rect, paint);
				},
			};
		}
		// 返回一个默认实例，避免返回 null
		return {
			draw: () => {
				// 空实现
			},
		};
	},

	appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
		if (!parent.children) {
			parent.children = [];
		}
		parent.children.push(child as Instance);
	},

	appendChild(parent: Instance, child: Instance | TextInstance): void {
		if (!parent.children) {
			parent.children = [];
		}
		parent.children.push(child as Instance);
	},

	removeChild(
		parent: Instance,
		child: Instance | TextInstance | SuspenseInstance,
	): void {
		if (parent.children) {
			parent.children = parent.children.filter((c: Instance) => c !== child);
		}
	},

	insertBefore(
		parent: Instance,
		child: Instance | TextInstance,
		beforeChild: Instance | TextInstance | SuspenseInstance,
	): void {
		if (!parent.children) {
			parent.children = [];
		}
		const index = parent.children.indexOf(beforeChild as Instance);
		if (index >= 0) {
			parent.children.splice(index, 0, child as Instance);
		} else {
			parent.children.push(child as Instance);
		}
	},

	appendChildToContainer(
		container: Container,
		child: Instance | TextInstance,
	): void {
		console.log("🟢 appendChildToContainer called", child);
		container.rootNode = child as Instance;
	},

	removeChildFromContainer(
		container: Container,
		child: Instance | TextInstance | SuspenseInstance,
	): void {
		if (container.rootNode === child) {
			container.rootNode = undefined;
		}
	},

	commitMount(instance: Instance): void {
		console.log("🟢 commitMount called", instance);
		// 当节点首次挂载到树中时调用
		instance.draw?.();
	},

	commitUpdate(
		instance: Instance,
		_type: Type,
		_oldProps: Props,
		_newProps: Props,
		_internalHandle: unknown,
	): void {
		// 更新实例时重新绘制
		instance.draw?.();
	},

	finalizeInitialChildren(
		_instance: Instance,
		_type: Type,
		_props: Props,
	): boolean {
		// 返回 true 表示需要在 commitMount 中处理
		return true;
	},

	getCurrentUpdatePriority() {
		return 0;
	},

	resolveUpdatePriority() {
		return DefaultEventPriority;
	},

	setCurrentUpdatePriority(_priority: number): void {
		// 空实现
	},

	preparePortalMount(_container: Container): void {
		// 空实现
	},

	getInstanceFromNode(_node: unknown): null {
		return null;
	},

	beforeActiveInstanceBlur(): void {
		// 空实现
	},

	afterActiveInstanceBlur(): void {
		// 空实现
	},

	prepareScopeUpdate(_scopeInstance: unknown, _instance: unknown): void {
		// 空实现
	},

	getInstanceFromScope(_scopeInstance: unknown): null {
		return null;
	},

	detachDeletedInstance(_node: Instance): void {
		// 空实现
	},

	NotPendingTransition: null,
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-expect-error - HostTransitionContext type mismatch
	HostTransitionContext: createContext(null),
	shouldAttemptEagerTransition: () => false,
	trackSchedulerEvent: () => {},
	resolveEventType: () => null,
	resolveEventTimeStamp: () => -1.1,
	requestPostPaintCallback: () => {},
	maySuspendCommit: () => false,
	preloadInstance: () => true,
	startSuspendingCommit: () => {},
	suspendInstance: () => {},
	waitForCommitToBeReady: () => null,
	resetFormInstance: () => {},

	// 其余方法可设置为空或默认实现
};
