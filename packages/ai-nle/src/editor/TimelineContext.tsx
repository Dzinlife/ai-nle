import { createContext, useEffect, useLayoutEffect } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { TimelineElement } from "@/dsl/types";

interface TimelineStore {
	currentTime: number;
	elements: TimelineElement[];
	canvasSize: { width: number; height: number };
	setCurrentTime: (time: number) => void;
	setElements: (
		elements:
			| TimelineElement[]
			| ((prev: TimelineElement[]) => TimelineElement[]),
	) => void;
	setCanvasSize: (size: { width: number; height: number }) => void;
	getCurrentTime: () => number;
	getElements: () => TimelineElement[];
	getCanvasSize: () => { width: number; height: number };
}

export const useTimelineStore = create<TimelineStore>()(
	subscribeWithSelector((set, get) => ({
		currentTime: 0,
		elements: [],
		canvasSize: { width: 1920, height: 1080 },

		setCurrentTime: (time: number) => {
			const currentTime = get().currentTime;
			if (currentTime !== time) {
				set({ currentTime: time });
			}
		},

		setElements: (
			elements:
				| TimelineElement[]
				| ((prev: TimelineElement[]) => TimelineElement[]),
		) => {
			const currentElements = get().elements;
			const newElements =
				typeof elements === "function" ? elements(currentElements) : elements;
			if (currentElements !== newElements) {
				set({ elements: newElements });
			}
		},

		setCanvasSize: (size: { width: number; height: number }) => {
			set({ canvasSize: size });
		},

		getCurrentTime: () => {
			return get().currentTime;
		},

		getElements: () => {
			return get().elements;
		},

		getCanvasSize: () => {
			return get().canvasSize;
		},
	})),
);

export const useCurrentTime = () => {
	const currentTime = useTimelineStore((state) => state.currentTime);
	const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);

	return {
		currentTime,
		setCurrentTime,
	};
};

export const useElements = () => {
	const elements = useTimelineStore((state) => state.elements);
	const setElements = useTimelineStore((state) => state.setElements);

	return {
		elements,
		setElements,
	};
};

export const TimelineContext = createContext<{
	currentTime: number;
	setCurrentTime: (time: number) => void;
}>({
	currentTime: 0,
	setCurrentTime: () => {},
});

export const TimelineProvider = ({
	children,
	currentTime: initialCurrentTime,
	elements: initialElements,
	canvasSize: initialCanvasSize,
}: {
	children: React.ReactNode;
	currentTime?: number;
	elements?: TimelineElement[];
	canvasSize?: { width: number; height: number };
}) => {
	// 在首次渲染前同步设置初始状态
	// 使用 useLayoutEffect 确保在子组件渲染前执行
	useLayoutEffect(() => {
		if (initialElements) {
			useTimelineStore.setState({
				currentTime: initialCurrentTime ?? 0,
				elements: initialElements,
				canvasSize: initialCanvasSize ?? { width: 1920, height: 1080 },
			});
		}
	}, []);

	// 后续更新
	useEffect(() => {
		if (initialElements) {
			useTimelineStore.setState({
				elements: initialElements,
			});
		}
	}, [initialElements]);

	useEffect(() => {
		if (initialCurrentTime !== undefined) {
			useTimelineStore.setState({
				currentTime: initialCurrentTime,
			});
		}
	}, [initialCurrentTime]);

	useEffect(() => {
		if (initialCanvasSize !== undefined) {
			useTimelineStore.setState({
				canvasSize: initialCanvasSize,
			});
		}
	}, [initialCanvasSize]);

	return <>{children}</>;
};
