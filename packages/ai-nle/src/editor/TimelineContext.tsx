import { useCallback, createContext, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { TimelineElement } from "@/dsl/types";
import { SnapPoint } from "./utils/snap";
import { assignTracks, getTrackCount, normalizeTrackAssignments, findAvailableTrack, getYFromTrack, getTrackFromY, getDropTarget, insertTrackAt, hasOverlapOnStoredTrack, DropTarget } from "./utils/trackAssignment";
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
	// 拖拽目标指示状态
	activeDropTarget: (DropTarget & { elementId: string; start: number; end: number; finalTrackIndex: number }) | null;
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
	// 拖拽目标指示方法
	setActiveDropTarget: (target: (DropTarget & { elementId: string; start: number; end: number; finalTrackIndex: number }) | null) => void;
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
		// 拖拽目标指示状态初始值
		activeDropTarget: null,

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

		// 拖拽目标指示方法
		setActiveDropTarget: (target: (DropTarget & { elementId: string; start: number; end: number; finalTrackIndex: number }) | null) => {
			set({ activeDropTarget: target });
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
	const activeDropTarget = useTimelineStore((state) => state.activeDropTarget);
	const setActiveDropTarget = useTimelineStore((state) => state.setActiveDropTarget);

	return {
		isDragging,
		setIsDragging,
		activeDropTarget,
		setActiveDropTarget,
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
					// 间隙模式：使用存储的 trackIndex 检查重叠，避免级联重分配问题
					const gapTrackIndex = dropTarget.trackIndex;
					const belowTrack = gapTrackIndex - 1; // 缝隙下方的轨道
					const aboveTrack = gapTrackIndex; // 缝隙上方的轨道

					// 获取元素的原始轨道
					const originalElement = prev.find((el) => el.id === elementId);
					const originalTrack = originalElement?.timeline.trackIndex ?? 0;

					// 创建临时元素列表用于检查重叠
					const tempUpdated = prev.map((el) => {
						if (el.id === elementId) {
							return {
								...el,
								timeline: { ...el.timeline, start, end },
							};
						}
						return el;
					});

					// 计算基于存储 trackIndex 的最大轨道
					const maxStoredTrack = Math.max(
						0,
						...tempUpdated.map((el) => el.timeline.trackIndex ?? 0)
					);

					// 检查相邻轨道是否可作为新目标（排除原始轨道，因为用户拖到缝隙意味着想移动）
					const belowIsDestination = belowTrack >= 0 &&
						belowTrack !== originalTrack &&
						!hasOverlapOnStoredTrack(start, end, belowTrack, tempUpdated, elementId);

					const aboveIsDestination = aboveTrack <= maxStoredTrack &&
						aboveTrack !== originalTrack &&
						!hasOverlapOnStoredTrack(start, end, aboveTrack, tempUpdated, elementId);

					if (belowIsDestination) {
						// 移动到下方轨道
						finalTrack = belowTrack;
						updatedAssignments = currentAssignments;
					} else if (aboveIsDestination) {
						// 移动到上方轨道
						finalTrack = aboveTrack;
						updatedAssignments = currentAssignments;
					} else {
						// 没有可用的新目标轨道，检查能否留在原始轨道
						const canStayOnOriginal = !hasOverlapOnStoredTrack(
							start, end, originalTrack, tempUpdated, elementId
						);

						if (canStayOnOriginal) {
							// 留在原始轨道（只是时间位置变化）
							finalTrack = originalTrack;
							updatedAssignments = currentAssignments;
						} else {
							// 原始轨道也有重叠，必须新建轨道
							updatedAssignments = insertTrackAt(gapTrackIndex, currentAssignments);
							finalTrack = gapTrackIndex;
						}
					}
				} else {
					// 普通模式：使用与 gap 模式一致的逻辑
					// 只检查当前轨道和上方一级，避免与 gap 模式行为不一致
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

					const targetTrack = dropTarget.trackIndex;
					const maxStoredTrack = Math.max(
						0,
						...tempUpdated.map((el) => el.timeline.trackIndex ?? 0)
					);

					// 检查目标轨道是否有重叠
					const targetHasOverlap = hasOverlapOnStoredTrack(
						start,
						end,
						targetTrack,
						tempUpdated,
						elementId,
					);

					if (!targetHasOverlap) {
						// 目标轨道没有重叠，直接放入
						finalTrack = targetTrack;
						updatedAssignments = currentAssignments;
					} else {
						// 目标轨道有重叠，检查上方一级
						const aboveTrack = targetTrack + 1;
						const aboveHasOverlap = aboveTrack <= maxStoredTrack && hasOverlapOnStoredTrack(
							start,
							end,
							aboveTrack,
							tempUpdated,
							elementId,
						);

						if (!aboveHasOverlap && aboveTrack <= maxStoredTrack) {
							// 上方轨道有空位，移动到上方
							finalTrack = aboveTrack;
							updatedAssignments = currentAssignments;
						} else {
							// 上方也没有空位或不存在，在目标轨道上方创建新轨道
							// 与 gap 模式一致，只向上查一级
							updatedAssignments = insertTrackAt(targetTrack + 1, currentAssignments);
							finalTrack = targetTrack + 1;
						}
					}
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

				// 直接基于存储的 trackIndex 压缩空轨道（不重新分配）
				const usedTracks = new Set<number>();
				for (const el of updated) {
					usedTracks.add(el.timeline.trackIndex ?? 0);
				}
				usedTracks.add(0); // 主轨道始终存在

				const sortedTracks = [...usedTracks].sort((a, b) => a - b);
				const trackMapping = new Map<number, number>();
				sortedTracks.forEach((oldTrack, newIndex) => {
					trackMapping.set(oldTrack, newIndex);
				});

				return updated.map((el) => ({
					...el,
					timeline: {
						...el.timeline,
						trackIndex: trackMapping.get(el.timeline.trackIndex ?? 0) ?? el.timeline.trackIndex,
					},
				}));
			});
		},
		[setElements],
	);

	// 移动元素及其附属元素（用于拖拽结束，处理层叠关联）
	const moveWithAttachments = useCallback(
		(
			elementId: string,
			start: number,
			end: number,
			dropTarget: DropTarget,
			attachedChildren: { id: string; start: number; end: number }[],
		) => {
			setElements((prev) => {
				// 计算当前的轨道分配
				const currentAssignments = assignTracks(prev);

				let finalTrack: number;
				let updatedAssignments: Map<string, number>;

				if (dropTarget.type === "gap") {
					// 间隙模式：使用存储的 trackIndex 检查重叠，避免级联重分配问题
					const gapTrackIndex = dropTarget.trackIndex;
					const belowTrack = gapTrackIndex - 1; // 缝隙下方的轨道
					const aboveTrack = gapTrackIndex; // 缝隙上方的轨道

					// 获取元素的原始轨道
					const originalElement = prev.find((el) => el.id === elementId);
					const originalTrack = originalElement?.timeline.trackIndex ?? 0;

					// 创建临时元素列表用于检查重叠
					const tempUpdated = prev.map((el) => {
						if (el.id === elementId) {
							return {
								...el,
								timeline: { ...el.timeline, start, end },
							};
						}
						return el;
					});

					// 计算基于存储 trackIndex 的最大轨道
					const maxStoredTrack = Math.max(
						0,
						...tempUpdated.map((el) => el.timeline.trackIndex ?? 0)
					);

					// 检查相邻轨道是否可作为新目标（排除原始轨道，因为用户拖到缝隙意味着想移动）
					const belowIsDestination = belowTrack >= 0 &&
						belowTrack !== originalTrack &&
						!hasOverlapOnStoredTrack(start, end, belowTrack, tempUpdated, elementId);

					const aboveIsDestination = aboveTrack <= maxStoredTrack &&
						aboveTrack !== originalTrack &&
						!hasOverlapOnStoredTrack(start, end, aboveTrack, tempUpdated, elementId);

					if (belowIsDestination) {
						// 移动到下方轨道
						finalTrack = belowTrack;
						updatedAssignments = currentAssignments;
					} else if (aboveIsDestination) {
						// 移动到上方轨道
						finalTrack = aboveTrack;
						updatedAssignments = currentAssignments;
					} else {
						// 没有可用的新目标轨道，检查能否留在原始轨道
						const canStayOnOriginal = !hasOverlapOnStoredTrack(
							start, end, originalTrack, tempUpdated, elementId
						);

						if (canStayOnOriginal) {
							// 留在原始轨道（只是时间位置变化）
							finalTrack = originalTrack;
							updatedAssignments = currentAssignments;
						} else {
							// 原始轨道也有重叠，必须新建轨道
							updatedAssignments = insertTrackAt(gapTrackIndex, currentAssignments);
							finalTrack = gapTrackIndex;
						}
					}
				} else {
					// 普通模式：使用与 gap 模式一致的逻辑
					const tempUpdated = prev.map((el) => {
						if (el.id === elementId) {
							return {
								...el,
								timeline: { ...el.timeline, start, end },
							};
						}
						return el;
					});

					const targetTrack = dropTarget.trackIndex;
					const maxStoredTrack = Math.max(
						0,
						...tempUpdated.map((el) => el.timeline.trackIndex ?? 0)
					);

					// 检查目标轨道是否有重叠
					const targetHasOverlap = hasOverlapOnStoredTrack(
						start,
						end,
						targetTrack,
						tempUpdated,
						elementId,
					);

					if (!targetHasOverlap) {
						// 目标轨道没有重叠，直接放入
						finalTrack = targetTrack;
						updatedAssignments = currentAssignments;
					} else {
						// 目标轨道有重叠，检查上方一级
						const aboveTrack = targetTrack + 1;
						const aboveHasOverlap = aboveTrack <= maxStoredTrack && hasOverlapOnStoredTrack(
							start,
							end,
							aboveTrack,
							tempUpdated,
							elementId,
						);

						if (!aboveHasOverlap && aboveTrack <= maxStoredTrack) {
							// 上方轨道有空位，移动到上方
							finalTrack = aboveTrack;
							updatedAssignments = currentAssignments;
						} else {
							// 上方也没有空位或不存在，在目标轨道上方创建新轨道
							updatedAssignments = insertTrackAt(targetTrack + 1, currentAssignments);
							finalTrack = targetTrack + 1;
						}
					}
				}

				// 第一步：更新主元素的时间和轨道
				let updated = prev.map((el) => {
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

				// 第二步：更新附属元素的时间（保持原轨道）
				updated = updated.map((el) => {
					const childMove = attachedChildren.find((c) => c.id === el.id);
					if (childMove) {
						return {
							...el,
							timeline: {
								...el.timeline,
								start: childMove.start,
								end: childMove.end,
							},
						};
					}
					return el;
				});

				// 第三步：为附属元素重新计算轨道位置（处理重叠）
				// 按照原轨道顺序逐个处理，如果有重叠则向上查找
				for (const childMove of attachedChildren) {
					const child = updated.find((el) => el.id === childMove.id);
					if (!child) continue;

					const currentTrack = child.timeline.trackIndex ?? 1;
					const childAssignments = assignTracks(updated);
					const childCount = getTrackCount(childAssignments);

					// 检查当前轨道是否有重叠，如果有则向上查找
					const availableTrack = findAvailableTrack(
						childMove.start,
						childMove.end,
						currentTrack,
						updated,
						childAssignments,
						childMove.id,
						childCount,
					);

					// 如果需要移动到新轨道
					if (availableTrack !== currentTrack) {
						updated = updated.map((el) => {
							if (el.id === childMove.id) {
								return {
									...el,
									timeline: {
										...el.timeline,
										trackIndex: availableTrack,
									},
								};
							}
							return el;
						});
					}
				}

				// 直接基于存储的 trackIndex 压缩空轨道（不重新分配）
				const usedTracks = new Set<number>();
				for (const el of updated) {
					usedTracks.add(el.timeline.trackIndex ?? 0);
				}
				usedTracks.add(0); // 主轨道始终存在

				const sortedTracks = [...usedTracks].sort((a, b) => a - b);
				const trackMapping = new Map<number, number>();
				sortedTracks.forEach((oldTrack, newIndex) => {
					trackMapping.set(oldTrack, newIndex);
				});

				return updated.map((el) => ({
					...el,
					timeline: {
						...el.timeline,
						trackIndex: trackMapping.get(el.timeline.trackIndex ?? 0) ?? el.timeline.trackIndex,
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
		moveWithAttachments,
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
