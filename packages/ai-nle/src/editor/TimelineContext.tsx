import { createContext, useEffect, useLayoutEffect } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { EditorElement } from "@/dsl/types";

interface TimelineStore {
	currentTime: number;
	elements: EditorElement[];
	setCurrentTime: (time: number) => void;
	setElements: (
		elements: EditorElement[] | ((prev: EditorElement[]) => EditorElement[]),
	) => void;
	getCurrentTime: () => number;
	getElements: () => EditorElement[];
}

export const useTimelineStore = create<TimelineStore>()(
	subscribeWithSelector((set, get) => ({
		currentTime: 0,
		elements: [],

		setCurrentTime: (time: number) => {
			const currentTime = get().currentTime;
			if (currentTime !== time) {
				set({ currentTime: time });
			}
		},

		setElements: (
			elements: EditorElement[] | ((prev: EditorElement[]) => EditorElement[]),
		) => {
			const currentElements = get().elements;
			const newElements =
				typeof elements === "function" ? elements(currentElements) : elements;
			if (currentElements !== newElements) {
				set({ elements: newElements });
			}
		},

		getCurrentTime: () => {
			return get().currentTime;
		},

		getElements: () => {
			return get().elements;
		},
	})),
);

export const useTimeline = () => {
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
}: {
	children: React.ReactNode;
	currentTime?: number;
	elements?: EditorElement[];
}) => {
	// 在首次渲染前同步设置初始状态
	// 使用 useLayoutEffect 确保在子组件渲染前执行
	useLayoutEffect(() => {
		if (initialElements) {
			console.log(
				`[TimelineProvider] Setting initial elements:`,
				initialElements.length,
			);
			useTimelineStore.setState({
				currentTime: initialCurrentTime ?? 0,
				elements: initialElements,
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

	return <>{children}</>;
};
