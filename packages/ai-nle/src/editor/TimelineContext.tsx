import { useCallback, createContext, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { TimelineElement } from "@/dsl/types";
import { SnapPoint } from "./utils/snap";
import { assignTracks, getTrackCount, normalizeTrackAssignments, findAvailableTrack, getYFromTrack, getTrackFromY, getDropTarget, insertTrackAt, DropTarget } from "./utils/trackAssignment";
import { findAttachments } from "./utils/attachments";

interface TimelineStore {
	currentTime: number;
	previewTime: number | null; // hover 时的临时预览时间
	elements: TimelineElement[];
	canvasSize: { width: number; height: number };
	isPlaying: boolean;
	isDragging: boolean; // 是否正在拖拽元素
	selectedElementId: string | null; // 当前选中的元素 ID
	// 吸附相关状态
	snapEnabled: boolean;
	activeSnapPoint: SnapPoint | null;
	// 层叠关联相关状态
	autoAttach: boolean;
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
	setIsDragging: (isDragging: boolean) => void;
	setSelectedElementId: (id: string | null) => void;
	// 吸附相关方法
	setSnapEnabled: (enabled: boolean) => void;
	setActiveSnapPoint: (point: SnapPoint | null) => void;
	// 层叠关联相关方法
	setAutoAttach: (enabled: boolean) => void;
}

export const useTimelineStore = create<TimelineStore>()(
	subscribeWithSelector((set, get) => ({
		currentTime: 0,
		previewTime: null,
		elements: [],
		canvasSize: { width: 1920, height: 1080 },
		isPlaying: false,
		isDragging: false,
		selectedElementId: null,
		// 吸附相关状态初始值
		snapEnabled: true,
		activeSnapPoint: null,
		// 层叠关联相关状态初始值
		autoAttach: true,

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

		setIsDragging: (isDragging: boolean) => {
			set({ isDragging });
		},

		setSelectedElementId: (id: string | null) => {
			set({ selectedElementId: id });
		},

		// 吸附相关方法
		setSnapEnabled: (enabled: boolean) => {
			set({ snapEnabled: enabled });
		},

		setActiveSnapPoint: (point: SnapPoint | null) => {
			set({ activeSnapPoint: point });
		},

		// 层叠关联相关方法
		setAutoAttach: (enabled: boolean) => {
			set({ autoAttach: enabled });
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

export const useDragging = () => {
	const isDragging = useTimelineStore((state) => state.isDragging);
	const setIsDragging = useTimelineStore((state) => state.setIsDragging);

	return {
		isDragging,
		setIsDragging,
	};
};

export const useSelectedElement = () => {
	const selectedElementId = useTimelineStore((state) => state.selectedElementId);
	const setSelectedElementId = useTimelineStore((state) => state.setSelectedElementId);
	const elements = useTimelineStore((state) => state.elements);

	const selectedElement = selectedElementId
		? elements.find(el => el.id === selectedElementId) ?? null
		: null;

	return {
		selectedElementId,
		selectedElement,
		setSelectedElementId,
	};
};

export const useSnap = () => {
	const snapEnabled = useTimelineStore((state) => state.snapEnabled);
	const activeSnapPoint = useTimelineStore((state) => state.activeSnapPoint);
	const setSnapEnabled = useTimelineStore((state) => state.setSnapEnabled);
	const setActiveSnapPoint = useTimelineStore((state) => state.setActiveSnapPoint);

	return {
		snapEnabled,
		activeSnapPoint,
		setSnapEnabled,
		setActiveSnapPoint,
	};
};

export const useTrackAssignments = () => {
	const elements = useTimelineStore((state) => state.elements);
	const setElements = useTimelineStore((state) => state.setElements);

	// 基于 elements 计算轨道分配
	const trackAssignments = useMemo(() => {
		return assignTracks(elements);
	}, [elements]);

	const trackCount = useMemo(() => {
		return getTrackCount(trackAssignments);
	}, [trackAssignments]);

	// 更新元素的轨道位置
	const updateElementTrack = useCallback(
		(elementId: string, targetTrack: number) => {
			setElements((prev) => {
				const element = prev.find((el) => el.id === elementId);
				if (!element) return prev;

				// 计算最终轨道位置（如果有重叠则向上寻找）
				const finalTrack = findAvailableTrack(
					element.timeline.start,
					element.timeline.end,
					targetTrack,
					prev,
					trackAssignments,
					elementId,
					trackCount,
				);

				// 更新元素的 trackIndex
				const updated = prev.map((el) => {
					if (el.id === elementId) {
						return {
							...el,
							timeline: {
								...el.timeline,
								trackIndex: finalTrack,
							},
						};
					}
					return el;
				});

				// 规范化轨道（移除空轨道）
				const newAssignments = assignTracks(updated);
				const normalized = normalizeTrackAssignments(newAssignments);

				// 应用规范化后的轨道索引
				return updated.map((el) => ({
					...el,
					timeline: {
						...el.timeline,
						trackIndex: normalized.get(el.id) ?? el.timeline.trackIndex,
					},
				}));
			});
		},
		[setElements, trackAssignments, trackCount],
	);

	// 更新元素的时间和轨道位置（用于拖拽结束）
	const updateElementTimeAndTrack = useCallback(
		(elementId: string, start: number, end: number, dropTarget: DropTarget) => {
			setElements((prev) => {
				// 计算当前的轨道分配
				const currentAssignments = assignTracks(prev);

				let finalTrack: number;
				let updatedAssignments: Map<string, number>;

				if (dropTarget.type === "gap") {
					// 插入模式：在间隙位置插入新轨道
					const insertAt = dropTarget.trackIndex;

					// 将 insertAt 及以上的轨道向上移动
					updatedAssignments = insertTrackAt(insertAt, currentAssignments);

					// 新元素放入插入位置
					finalTrack = insertAt;
				} else {
					// 普通模式：智能放置到目标轨道（如有重叠则向上寻找）
					// 先创建一个临时的更新后元素列表
					const tempUpdated = prev.map((el) => {
						if (el.id === elementId) {
							return {
								...el,
								timeline: {
									...el.timeline,
									start,
									end,
								},
							};
						}
						return el;
					});

					// 计算新的轨道分配
					const tempAssignments = assignTracks(tempUpdated);
					const tempCount = getTrackCount(tempAssignments);

					// 计算最终轨道位置
					finalTrack = findAvailableTrack(
						start,
						end,
						dropTarget.trackIndex,
						tempUpdated,
						tempAssignments,
						elementId,
						tempCount,
					);

					updatedAssignments = currentAssignments;
				}

				// 应用时间和轨道更新
				const updated = prev.map((el) => {
					if (el.id === elementId) {
						return {
							...el,
							timeline: {
								...el.timeline,
								start,
								end,
								trackIndex: finalTrack,
							},
						};
					}
					// 应用可能的轨道移动（插入模式时其他元素的轨道会变化）
					const newTrack = updatedAssignments.get(el.id);
					if (newTrack !== undefined && newTrack !== el.timeline.trackIndex) {
						return {
							...el,
							timeline: {
								...el.timeline,
								trackIndex: newTrack,
							},
						};
					}
					return el;
				});

				// 规范化轨道（移除空轨道）
				const newAssignments = assignTracks(updated);
				const normalized = normalizeTrackAssignments(newAssignments);

				// 应用规范化后的轨道索引
				return updated.map((el) => ({
					...el,
					timeline: {
						...el.timeline,
						trackIndex: normalized.get(el.id) ?? el.timeline.trackIndex,
					},
				}));
			});
		},
		[setElements],
	);

	return {
		trackAssignments,
		trackCount,
		updateElementTrack,
		updateElementTimeAndTrack,
		getYFromTrack,
		getTrackFromY,
		getDropTarget,
	};
};

export const useAttachments = () => {
	const elements = useTimelineStore((state) => state.elements);
	const autoAttach = useTimelineStore((state) => state.autoAttach);
	const setAutoAttach = useTimelineStore((state) => state.setAutoAttach);

	// 基于 elements 计算关联关系
	const attachments = useMemo(() => {
		return findAttachments(elements);
	}, [elements]);

	return {
		attachments,
		autoAttach,
		setAutoAttach,
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
