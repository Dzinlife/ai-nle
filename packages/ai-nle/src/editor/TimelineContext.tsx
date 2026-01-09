import { createContext, useEffect } from "react";
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
	// 初始化 store 状态（仅在挂载时或初始值变化时）
	useEffect(() => {
		useTimelineStore.setState({
			currentTime: initialCurrentTime ?? 0,
			elements: initialElements,
		});
	}, [initialCurrentTime, initialElements]);

	return <>{children}</>;
};
