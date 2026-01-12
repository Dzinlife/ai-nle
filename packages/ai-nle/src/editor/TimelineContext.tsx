import { createContext, useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { TimelineElement } from "@/dsl/types";

interface TimelineStore {
	currentTime: number;
	previewTime: number | null; // hover 时的临时预览时间
	elements: TimelineElement[];
	canvasSize: { width: number; height: number };
	isPlaying: boolean;
	setCurrentTime: (time: number) => void;
	setPreviewTime: (time: number | null) => void;
	setElements: (
		elements:
			| TimelineElement[]
			| ((prev: TimelineElement[]) => TimelineElement[]),
	) => void;
	setCanvasSize: (size: { width: number; height: number }) => void;
	getCurrentTime: () => number;
	getDisplayTime: () => number; // 返回 previewTime ?? currentTime
	getElements: () => TimelineElement[];
	getCanvasSize: () => { width: number; height: number };
	play: () => void;
	pause: () => void;
	togglePlay: () => void;
}

export const useTimelineStore = create<TimelineStore>()(
	subscribeWithSelector((set, get) => ({
		currentTime: 0,
		previewTime: null,
		elements: [],
		canvasSize: { width: 1920, height: 1080 },
		isPlaying: false,

		setCurrentTime: (time: number) => {
			const currentTime = get().currentTime;
			if (currentTime !== time) {
				set({ currentTime: time });
			}
		},

		setPreviewTime: (time: number | null) => {
			set({ previewTime: time });
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

		getDisplayTime: () => {
			const { previewTime, currentTime } = get();
			return previewTime ?? currentTime;
		},

		getElements: () => {
			return get().elements;
		},

		getCanvasSize: () => {
			return get().canvasSize;
		},

		play: () => {
			set({ isPlaying: true });
		},

		pause: () => {
			set({ isPlaying: false });
		},

		togglePlay: () => {
			set((state) => ({ isPlaying: !state.isPlaying }));
		},
	})),
);

export const useCurrentTime = () => {
	const currentTime = useTimelineStore((state) => state.currentTime);
	const previewTime = useTimelineStore((state) => state.previewTime);
	const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);

	return {
		currentTime: previewTime ?? currentTime,
		setCurrentTime,
	};
};

export const useDisplayTime = () => {
	const currentTime = useTimelineStore((state) => state.currentTime);
	const previewTime = useTimelineStore((state) => state.previewTime);
	return previewTime ?? currentTime;
};

export const usePreviewTime = () => {
	const previewTime = useTimelineStore((state) => state.previewTime);
	const setPreviewTime = useTimelineStore((state) => state.setPreviewTime);

	return {
		previewTime,
		setPreviewTime,
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

export const usePlaybackControl = () => {
	const isPlaying = useTimelineStore((state) => state.isPlaying);
	const play = useTimelineStore((state) => state.play);
	const pause = useTimelineStore((state) => state.pause);
	const togglePlay = useTimelineStore((state) => state.togglePlay);

	return {
		isPlaying,
		play,
		pause,
		togglePlay,
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
	const lastTimeRef = useRef<number | null>(null);

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

	// 播放循环
	useEffect(() => {
		const unsubscribe = useTimelineStore.subscribe(
			(state) => state.isPlaying,
			(isPlaying) => {
				if (isPlaying) {
					lastTimeRef.current = performance.now();
					const animate = (now: number) => {
						const state = useTimelineStore.getState();
						if (!state.isPlaying) return;

						if (lastTimeRef.current !== null) {
							const delta = (now - lastTimeRef.current) / 1000; // 转换为秒
							const newTime = state.currentTime + delta;
							state.setCurrentTime(newTime);
						}
						lastTimeRef.current = now;
						requestAnimationFrame(animate);
					};
					requestAnimationFrame(animate);
				} else {
					lastTimeRef.current = null;
				}
			},
			{ fireImmediately: true },
		);

		return () => unsubscribe();
	}, []);

	return <>{children}</>;
};
