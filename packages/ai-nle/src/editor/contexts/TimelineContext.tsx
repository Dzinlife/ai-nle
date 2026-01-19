import {
	createContext,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { TimelineElement } from "@/dsl/types";
import { clampFrame } from "@/utils/timecode";
import { DropTarget, ExtendedDropTarget } from "../timeline/types";
import { findAttachments } from "../utils/attachments";
import { finalizeTimelineElements } from "../utils/mainTrackMagnet";
import { SnapPoint } from "../utils/snap";
import { updateElementTime } from "../utils/timelineTime";
import {
	assignTracks,
	findAvailableTrack,
	getDropTarget,
	getElementRole,
	getTrackCount,
	getTrackFromY,
	getYFromTrack,
	hasOverlapOnStoredTrack,
	hasRoleConflictOnStoredTrack,
	insertTrackAt,
	normalizeTrackAssignments,
	resolveDropTargetForRole,
} from "../utils/trackAssignment";

// Ghost 元素状态类型
export interface DragGhostState {
	elementId: string;
	element: TimelineElement;
	// 屏幕坐标（用于 fixed 定位）
	screenX: number;
	screenY: number;
	width: number;
	height: number;
	// 克隆的元素 HTML（用于渲染半透明影子）
	clonedHtml: string;
}

// 自动滚动配置
export interface AutoScrollConfig {
	/** 边缘检测阈值（像素） */
	edgeThreshold: number;
	/** 最大滚动速度（像素/帧） */
	maxSpeed: number;
}

export const DEFAULT_AUTO_SCROLL_CONFIG: AutoScrollConfig = {
	edgeThreshold: 80,
	maxSpeed: 12,
};

const DEFAULT_FPS = 30;
const normalizeFps = (value: number): number => {
	if (!Number.isFinite(value) || value <= 0) return DEFAULT_FPS;
	return Math.round(value);
};

interface TimelineStore {
	fps: number;
	timelineScale: number;
	currentTime: number;
	previewTime: number | null; // hover 时的临时预览时间
	elements: TimelineElement[];
	canvasSize: { width: number; height: number };
	isPlaying: boolean;
	isDragging: boolean; // 是否正在拖拽元素
	selectedIds: string[]; // 当前选中的元素 ID 列表
	primarySelectedId: string | null; // 主选中元素 ID
	// 吸附相关状态
	snapEnabled: boolean;
	activeSnapPoint: SnapPoint | null;
	// 层叠关联相关状态
	autoAttach: boolean;
	// 主轨道磁吸模式
	mainTrackMagnetEnabled: boolean;
	// 拖拽目标指示状态
	activeDropTarget: ExtendedDropTarget | null;
	// 拖拽 Ghost 状态
	dragGhosts: DragGhostState[];
	// 自动滚动状态
	autoScrollSpeed: number; // -1 到 1，负数向左，正数向右，0 停止
	autoScrollSpeedY: number; // 垂直滚动速度，负数向上，正数向下
	// 时间线滚动位置
	scrollLeft: number;
	setFps: (fps: number) => void;
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
	setSelectedIds: (ids: string[], primaryId?: string | null) => void;
	// 吸附相关方法
	setSnapEnabled: (enabled: boolean) => void;
	setActiveSnapPoint: (point: SnapPoint | null) => void;
	// 层叠关联相关方法
	setAutoAttach: (enabled: boolean) => void;
	// 主轨道磁吸模式方法
	setMainTrackMagnetEnabled: (enabled: boolean) => void;
	// 拖拽目标指示方法
	setActiveDropTarget: (target: ExtendedDropTarget | null) => void;
	// 拖拽 Ghost 方法
	setDragGhosts: (ghosts: DragGhostState[]) => void;
	// 自动滚动方法
	setAutoScrollSpeed: (speed: number) => void;
	setAutoScrollSpeedY: (speed: number) => void;
	// 滚动位置方法
	setScrollLeft: (scrollLeft: number) => void;
	setTimelineScale: (scale: number) => void;
}

export const useTimelineStore = create<TimelineStore>()(
	subscribeWithSelector((set, get) => ({
		fps: DEFAULT_FPS,
		timelineScale: 1,
		currentTime: 0,
		previewTime: null,
		elements: [],
		canvasSize: { width: 1920, height: 1080 },
		isPlaying: false,
		isDragging: false,
		selectedIds: [],
		primarySelectedId: null,
		// 吸附相关状态初始值
		snapEnabled: true,
		activeSnapPoint: null,
		// 层叠关联相关状态初始值
		autoAttach: true,
		// 主轨道磁吸模式初始值
		mainTrackMagnetEnabled: false,
		// 拖拽目标指示状态初始值
		activeDropTarget: null,
		// 拖拽 Ghost 状态初始值
		dragGhosts: [],
		// 自动滚动状态初始值
		autoScrollSpeed: 0,
		autoScrollSpeedY: 0,
		// 滚动位置初始值
		scrollLeft: 0,

		setFps: (fps: number) => {
			set({ fps: normalizeFps(fps) });
		},

		setTimelineScale: (scale: number) => {
			const nextScale = Number.isFinite(scale) ? scale : 1;
			set({ timelineScale: nextScale });
		},

		setCurrentTime: (time: number) => {
			const currentTime = get().currentTime;
			const nextTime = clampFrame(time);
			if (currentTime !== nextTime) {
				set({ currentTime: nextTime });
			}
		},

		setPreviewTime: (time: number | null) => {
			set({ previewTime: time === null ? null : clampFrame(time) });
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
			if (!id) {
				set({ selectedIds: [], primarySelectedId: null });
				return;
			}
			set({ selectedIds: [id], primarySelectedId: id });
		},

		setSelectedIds: (ids: string[], primaryId?: string | null) => {
			const uniqueIds = Array.from(new Set(ids));
			const resolvedPrimary =
				uniqueIds.length === 0
					? null
					: primaryId && uniqueIds.includes(primaryId)
						? primaryId
						: uniqueIds[uniqueIds.length - 1];
			set({ selectedIds: uniqueIds, primarySelectedId: resolvedPrimary });
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

		// 主轨道磁吸模式方法
		setMainTrackMagnetEnabled: (enabled: boolean) => {
			set({ mainTrackMagnetEnabled: enabled });
		},

		// 拖拽目标指示方法
		setActiveDropTarget: (target: ExtendedDropTarget | null) => {
			set({ activeDropTarget: target });
		},

		// 拖拽 Ghost 方法
		setDragGhosts: (ghosts: DragGhostState[]) => {
			set({ dragGhosts: ghosts });
		},

		// 自动滚动方法
		setAutoScrollSpeed: (speed: number) => {
			set({ autoScrollSpeed: speed });
		},

		setAutoScrollSpeedY: (speed: number) => {
			set({ autoScrollSpeedY: speed });
		},

		// 滚动位置方法
		setScrollLeft: (scrollLeft: number) => {
			set({ scrollLeft });
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

export const useFps = () => {
	const fps = useTimelineStore((state) => state.fps);
	const setFps = useTimelineStore((state) => state.setFps);
	return { fps, setFps };
};

export const useTimelineScale = () => {
	const timelineScale = useTimelineStore((state) => state.timelineScale);
	const setTimelineScale = useTimelineStore((state) => state.setTimelineScale);
	return { timelineScale, setTimelineScale };
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
	const setActiveDropTarget = useTimelineStore(
		(state) => state.setActiveDropTarget,
	);
	const dragGhosts = useTimelineStore((state) => state.dragGhosts);
	const setDragGhosts = useTimelineStore((state) => state.setDragGhosts);

	return {
		isDragging,
		setIsDragging,
		activeDropTarget,
		setActiveDropTarget,
		dragGhosts,
		setDragGhosts,
	};
};

export const useAutoScroll = () => {
	const autoScrollSpeed = useTimelineStore((state) => state.autoScrollSpeed);
	const autoScrollSpeedY = useTimelineStore((state) => state.autoScrollSpeedY);
	const setAutoScrollSpeed = useTimelineStore(
		(state) => state.setAutoScrollSpeed,
	);
	const setAutoScrollSpeedY = useTimelineStore(
		(state) => state.setAutoScrollSpeedY,
	);

	/**
	 * 根据鼠标位置计算并设置水平自动滚动速度
	 */
	const updateAutoScrollFromPosition = useCallback(
		(
			screenX: number,
			containerLeft: number,
			containerRight: number,
			config: AutoScrollConfig = DEFAULT_AUTO_SCROLL_CONFIG,
		) => {
			const { edgeThreshold, maxSpeed } = config;

			// 检查左边缘
			const distanceFromLeft = screenX - containerLeft;
			if (distanceFromLeft < edgeThreshold && distanceFromLeft >= 0) {
				const intensity = 1 - distanceFromLeft / edgeThreshold;
				setAutoScrollSpeed(-intensity * maxSpeed);
				return;
			}

			// 检查右边缘
			const distanceFromRight = containerRight - screenX;
			if (distanceFromRight < edgeThreshold && distanceFromRight >= 0) {
				const intensity = 1 - distanceFromRight / edgeThreshold;
				setAutoScrollSpeed(intensity * maxSpeed);
				return;
			}

			// 不在边缘区域，停止水平滚动
			if (autoScrollSpeed !== 0) {
				setAutoScrollSpeed(0);
			}
		},
		[autoScrollSpeed, setAutoScrollSpeed],
	);

	/**
	 * 根据鼠标位置计算并设置垂直自动滚动速度
	 */
	const updateAutoScrollYFromPosition = useCallback(
		(
			screenY: number,
			containerTop: number,
			containerBottom: number,
			config: AutoScrollConfig = DEFAULT_AUTO_SCROLL_CONFIG,
		) => {
			const { edgeThreshold, maxSpeed } = config;

			// 检查上边缘
			const distanceFromTop = screenY - containerTop;
			if (distanceFromTop < edgeThreshold && distanceFromTop >= 0) {
				const intensity = 1 - distanceFromTop / edgeThreshold;
				setAutoScrollSpeedY(-intensity * maxSpeed);
				return;
			}

			// 检查下边缘
			const distanceFromBottom = containerBottom - screenY;
			if (distanceFromBottom < edgeThreshold && distanceFromBottom >= 0) {
				const intensity = 1 - distanceFromBottom / edgeThreshold;
				setAutoScrollSpeedY(intensity * maxSpeed);
				return;
			}

			// 不在边缘区域，停止垂直滚动
			if (autoScrollSpeedY !== 0) {
				setAutoScrollSpeedY(0);
			}
		},
		[autoScrollSpeedY, setAutoScrollSpeedY],
	);

	// 停止自动滚动（水平和垂直）
	const stopAutoScroll = useCallback(() => {
		setAutoScrollSpeed(0);
		setAutoScrollSpeedY(0);
	}, [setAutoScrollSpeed, setAutoScrollSpeedY]);

	return {
		autoScrollSpeed,
		autoScrollSpeedY,
		setAutoScrollSpeed,
		setAutoScrollSpeedY,
		updateAutoScrollFromPosition,
		updateAutoScrollYFromPosition,
		stopAutoScroll,
	};
};

export const useSelectedElement = () => {
	const selectedElementId = useTimelineStore(
		(state) => state.primarySelectedId,
	);
	const setSelectedElementId = useTimelineStore(
		(state) => state.setSelectedElementId,
	);
	const elements = useTimelineStore((state) => state.elements);

	const selectedElement = selectedElementId
		? (elements.find((el) => el.id === selectedElementId) ?? null)
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
	const setActiveSnapPoint = useTimelineStore(
		(state) => state.setActiveSnapPoint,
	);

	return {
		snapEnabled,
		activeSnapPoint,
		setSnapEnabled,
		setActiveSnapPoint,
	};
};

export const useMainTrackMagnet = () => {
	const mainTrackMagnetEnabled = useTimelineStore(
		(state) => state.mainTrackMagnetEnabled,
	);
	const setMainTrackMagnetEnabled = useTimelineStore(
		(state) => state.setMainTrackMagnetEnabled,
	);

	return {
		mainTrackMagnetEnabled,
		setMainTrackMagnetEnabled,
	};
};

export const useTrackAssignments = () => {
	const elements = useTimelineStore((state) => state.elements);
	const setElements = useTimelineStore((state) => state.setElements);
	const fps = useTimelineStore((state) => state.fps);
	const mainTrackMagnetEnabled = useTimelineStore(
		(state) => state.mainTrackMagnetEnabled,
	);
	const { attachments, autoAttach } = useAttachments();

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
				const elementRole = getElementRole(element);
				const resolvedDropTarget = resolveDropTargetForRole(
					{ type: "track", trackIndex: targetTrack },
					elementRole,
					prev,
					trackAssignments,
				);
				const resolvedTargetTrack = resolvedDropTarget.trackIndex;

				// 计算最终轨道位置（如果有重叠则向上寻找）
				const finalTrack = findAvailableTrack(
					element.timeline.start,
					element.timeline.end,
					resolvedTargetTrack,
					elementRole,
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
				const originalElement = prev.find((el) => el.id === elementId);
				const elementRole = originalElement
					? getElementRole(originalElement)
					: "overlay";
				const resolvedDropTarget = resolveDropTargetForRole(
					dropTarget,
					elementRole,
					prev,
					currentAssignments,
				);

				let finalTrack: number;
				let updatedAssignments: Map<string, number>;

				if (resolvedDropTarget.type === "gap") {
					// 间隙模式：使用存储的 trackIndex 检查重叠，避免级联重分配问题
					const gapTrackIndex = resolvedDropTarget.trackIndex;
					const belowTrack = gapTrackIndex - 1; // 缝隙下方的轨道
					const aboveTrack = gapTrackIndex; // 缝隙上方的轨道

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
						...tempUpdated.map((el) => el.timeline.trackIndex ?? 0),
					);

					// 检查相邻轨道是否可作为新目标（排除原始轨道，因为用户拖到缝隙意味着想移动）
					const belowIsDestination =
						belowTrack >= 0 &&
						belowTrack !== originalTrack &&
						!hasRoleConflictOnStoredTrack(
							elementRole,
							belowTrack,
							tempUpdated,
							elementId,
						) &&
						!hasOverlapOnStoredTrack(
							start,
							end,
							belowTrack,
							tempUpdated,
							elementId,
						);

					const aboveIsDestination =
						aboveTrack <= maxStoredTrack &&
						aboveTrack !== originalTrack &&
						!hasRoleConflictOnStoredTrack(
							elementRole,
							aboveTrack,
							tempUpdated,
							elementId,
						) &&
						!hasOverlapOnStoredTrack(
							start,
							end,
							aboveTrack,
							tempUpdated,
							elementId,
						);

					if (belowIsDestination) {
						// 移动到下方轨道
						finalTrack = belowTrack;
						updatedAssignments = currentAssignments;
					} else if (aboveIsDestination) {
						// 移动到上方轨道
						finalTrack = aboveTrack;
						updatedAssignments = currentAssignments;
					} else {
						// 间隙模式下没有可用轨道，强制插入新轨道
						updatedAssignments = insertTrackAt(
							gapTrackIndex,
							currentAssignments,
						);
						finalTrack = gapTrackIndex;
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

					const targetTrack = resolvedDropTarget.trackIndex;
					const maxStoredTrack = Math.max(
						0,
						...tempUpdated.map((el) => el.timeline.trackIndex ?? 0),
					);

					// 检查目标轨道是否有重叠
					const targetHasOverlap =
						hasRoleConflictOnStoredTrack(
							elementRole,
							targetTrack,
							tempUpdated,
							elementId,
						) ||
						hasOverlapOnStoredTrack(
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
						const aboveHasOverlap =
							aboveTrack <= maxStoredTrack &&
							(hasRoleConflictOnStoredTrack(
								elementRole,
								aboveTrack,
								tempUpdated,
								elementId,
							) ||
								hasOverlapOnStoredTrack(
									start,
									end,
									aboveTrack,
									tempUpdated,
									elementId,
								));

						if (!aboveHasOverlap && aboveTrack <= maxStoredTrack) {
							// 上方轨道有空位，移动到上方
							finalTrack = aboveTrack;
							updatedAssignments = currentAssignments;
						} else {
							// 上方也没有空位或不存在，在目标轨道上方创建新轨道
							// 与 gap 模式一致，只向上查一级
							updatedAssignments = insertTrackAt(
								targetTrack + 1,
								currentAssignments,
							);
							finalTrack = targetTrack + 1;
						}
					}
				}

				// 应用时间和轨道更新
				const updated = prev.map((el) => {
					if (el.id === elementId) {
						const updatedElement = updateElementTime(el, start, end, fps);
						return {
							...updatedElement,
							timeline: {
								...updatedElement.timeline,
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

				return finalizeTimelineElements(updated, {
					mainTrackMagnetEnabled,
					attachments,
					autoAttach,
					fps,
				});
			});
		},
		[setElements, mainTrackMagnetEnabled, attachments, autoAttach, fps],
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
				const originalElement = prev.find((el) => el.id === elementId);
				const elementRole = originalElement
					? getElementRole(originalElement)
					: "overlay";
				const resolvedDropTarget = resolveDropTargetForRole(
					dropTarget,
					elementRole,
					prev,
					currentAssignments,
				);

				let finalTrack: number;
				let updatedAssignments: Map<string, number>;

				if (resolvedDropTarget.type === "gap") {
					// 间隙模式：使用存储的 trackIndex 检查重叠，避免级联重分配问题
					const gapTrackIndex = resolvedDropTarget.trackIndex;
					const belowTrack = gapTrackIndex - 1; // 缝隙下方的轨道
					const aboveTrack = gapTrackIndex; // 缝隙上方的轨道

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
						...tempUpdated.map((el) => el.timeline.trackIndex ?? 0),
					);

					// 检查相邻轨道是否可作为新目标（排除原始轨道，因为用户拖到缝隙意味着想移动）
					const belowIsDestination =
						belowTrack >= 0 &&
						belowTrack !== originalTrack &&
						!hasRoleConflictOnStoredTrack(
							elementRole,
							belowTrack,
							tempUpdated,
							elementId,
						) &&
						!hasOverlapOnStoredTrack(
							start,
							end,
							belowTrack,
							tempUpdated,
							elementId,
						);

					const aboveIsDestination =
						aboveTrack <= maxStoredTrack &&
						aboveTrack !== originalTrack &&
						!hasRoleConflictOnStoredTrack(
							elementRole,
							aboveTrack,
							tempUpdated,
							elementId,
						) &&
						!hasOverlapOnStoredTrack(
							start,
							end,
							aboveTrack,
							tempUpdated,
							elementId,
						);

					if (belowIsDestination) {
						// 移动到下方轨道
						finalTrack = belowTrack;
						updatedAssignments = currentAssignments;
					} else if (aboveIsDestination) {
						// 移动到上方轨道
						finalTrack = aboveTrack;
						updatedAssignments = currentAssignments;
					} else {
						// 间隙模式下没有可用轨道，强制插入新轨道
						updatedAssignments = insertTrackAt(
							gapTrackIndex,
							currentAssignments,
						);
						finalTrack = gapTrackIndex;
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

					const targetTrack = resolvedDropTarget.trackIndex;
					const maxStoredTrack = Math.max(
						0,
						...tempUpdated.map((el) => el.timeline.trackIndex ?? 0),
					);

					// 检查目标轨道是否有重叠
					const targetHasOverlap =
						hasRoleConflictOnStoredTrack(
							elementRole,
							targetTrack,
							tempUpdated,
							elementId,
						) ||
						hasOverlapOnStoredTrack(
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
						const aboveHasOverlap =
							aboveTrack <= maxStoredTrack &&
							(hasRoleConflictOnStoredTrack(
								elementRole,
								aboveTrack,
								tempUpdated,
								elementId,
							) ||
								hasOverlapOnStoredTrack(
									start,
									end,
									aboveTrack,
									tempUpdated,
									elementId,
								));

						if (!aboveHasOverlap && aboveTrack <= maxStoredTrack) {
							// 上方轨道有空位，移动到上方
							finalTrack = aboveTrack;
							updatedAssignments = currentAssignments;
						} else {
							// 上方也没有空位或不存在，在目标轨道上方创建新轨道
							updatedAssignments = insertTrackAt(
								targetTrack + 1,
								currentAssignments,
							);
							finalTrack = targetTrack + 1;
						}
					}
				}

				// 第一步：更新主元素的时间和轨道
				let updated = prev.map((el) => {
					if (el.id === elementId) {
						const updatedElement = updateElementTime(el, start, end, fps);
						return {
							...updatedElement,
							timeline: {
								...updatedElement.timeline,
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
						return updateElementTime(el, childMove.start, childMove.end, fps);
					}
					return el;
				});

				// 第三步：为附属元素重新计算轨道位置（处理重叠）
				// 按照原轨道顺序逐个处理，如果有重叠则向上查找
				for (const childMove of attachedChildren) {
					const child = updated.find((el) => el.id === childMove.id);
					if (!child) continue;

					const currentTrack = child.timeline.trackIndex ?? 1;
					const childRole = getElementRole(child);
					const childAssignments = assignTracks(updated);
					const childCount = getTrackCount(childAssignments);

					// 检查当前轨道是否有重叠，如果有则向上查找
					const availableTrack = findAvailableTrack(
						childMove.start,
						childMove.end,
						currentTrack,
						childRole,
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

				return finalizeTimelineElements(updated, {
					mainTrackMagnetEnabled,
					attachments,
					autoAttach,
					fps,
				});
			});
		},
		[setElements, mainTrackMagnetEnabled, attachments, autoAttach, fps],
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

// ============================================================================
// 多选支持 (Multi-select)
// ============================================================================
/**
 * 多选 Hook - 统一 Timeline/Preview 的选择状态
 *
 * 相关类型已在 timeline/types.ts 中定义：
 * - SelectionState: 完整的选择状态结构
 * - SelectionAction: 选择操作类型
 * - DragState: 支持 draggedElementIds 数组
 */
export const useMultiSelect = () => {
	const selectedIds = useTimelineStore((state) => state.selectedIds);
	const primaryId = useTimelineStore((state) => state.primarySelectedId);
	const setSelectedIds = useTimelineStore((state) => state.setSelectedIds);
	const elements = useTimelineStore((state) => state.elements);

	// 获取选中的元素列表
	const selectedElements = useMemo(() => {
		return elements.filter((el) => selectedIds.includes(el.id));
	}, [elements, selectedIds]);

	// 选择单个元素（未来可扩展为 additive 模式）
	const select = useCallback(
		(id: string, additive = false) => {
			if (additive) {
				setSelectedIds([...selectedIds, id], id);
				return;
			}
			setSelectedIds([id], id);
		},
		[setSelectedIds, selectedIds],
	);

	// 取消选择
	const deselect = useCallback(
		(id: string) => {
			setSelectedIds(
				selectedIds.filter((selectedId) => selectedId !== id),
				primaryId === id ? null : primaryId,
			);
		},
		[primaryId, selectedIds, setSelectedIds],
	);

	// 清空选择
	const deselectAll = useCallback(() => {
		setSelectedIds([], null);
	}, [setSelectedIds]);

	// 切换选择状态
	const toggleSelect = useCallback(
		(id: string) => {
			if (selectedIds.includes(id)) {
				setSelectedIds(
					selectedIds.filter((selectedId) => selectedId !== id),
					primaryId === id ? null : primaryId,
				);
				return;
			}
			setSelectedIds([...selectedIds, id], id);
		},
		[primaryId, selectedIds, setSelectedIds],
	);

	const setSelection = useCallback(
		(ids: string[], nextPrimaryId?: string | null) => {
			setSelectedIds(ids, nextPrimaryId);
		},
		[setSelectedIds],
	);

	return {
		selectedIds,
		selectedElements,
		primaryId,
		select,
		deselect,
		deselectAll,
		toggleSelect,
		setSelection,
		// 框选相关（预留）
		isMarqueeSelecting: false,
		marqueeRect: null as {
			startX: number;
			startY: number;
			endX: number;
			endY: number;
		} | null,
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
	fps: initialFps,
}: {
	children: React.ReactNode;
	currentTime?: number;
	elements?: TimelineElement[];
	canvasSize?: { width: number; height: number };
	fps?: number;
}) => {
	const lastTimeRef = useRef<number | null>(null);
	const frameRemainderRef = useRef(0);
	const applyInitialTrackAssignments = useCallback(
		(elements: TimelineElement[]) => {
			if (elements.length === 0) return elements;
			const assignments = assignTracks(elements);
			let changed = false;
			const updated = elements.map((el) => {
				const assignedTrack = assignments.get(el.id);
				if (assignedTrack === undefined) return el;
				if (el.timeline.trackIndex === assignedTrack) return el;
				changed = true;
				return {
					...el,
					timeline: {
						...el.timeline,
						trackIndex: assignedTrack,
					},
				};
			});
			return changed ? updated : elements;
		},
		[],
	);

	// 在首次渲染前同步设置初始状态
	// 使用 useLayoutEffect 确保在子组件渲染前执行
	useLayoutEffect(() => {
		if (initialElements) {
			const normalizedElements = applyInitialTrackAssignments(initialElements);
			useTimelineStore.setState({
				currentTime: clampFrame(initialCurrentTime ?? 0),
				elements: normalizedElements,
				canvasSize: initialCanvasSize ?? { width: 1920, height: 1080 },
				fps: normalizeFps(initialFps ?? DEFAULT_FPS),
			});
		}
	}, []);

	// 后续更新
	useEffect(() => {
		if (initialElements) {
			const normalizedElements = applyInitialTrackAssignments(initialElements);
			useTimelineStore.setState({
				elements: normalizedElements,
			});
		}
	}, [applyInitialTrackAssignments, initialElements]);

	useEffect(() => {
		if (initialCurrentTime !== undefined) {
			useTimelineStore.setState({
				currentTime: clampFrame(initialCurrentTime),
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

	useEffect(() => {
		if (initialFps !== undefined) {
			useTimelineStore.setState({
				fps: normalizeFps(initialFps),
			});
		}
	}, [initialFps]);

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
							const deltaSeconds = (now - lastTimeRef.current) / 1000;
							frameRemainderRef.current += deltaSeconds * state.fps;
							const stepFrames = Math.floor(frameRemainderRef.current);
							if (stepFrames > 0) {
								const newTime = state.currentTime + stepFrames;
								state.setCurrentTime(newTime);
								frameRemainderRef.current -= stepFrames;
							}
						}
						lastTimeRef.current = now;
						requestAnimationFrame(animate);
					};
					requestAnimationFrame(animate);
				} else {
					lastTimeRef.current = null;
					frameRemainderRef.current = 0;
				}
			},
			{ fireImmediately: true },
		);

		return () => unsubscribe();
	}, []);

	return <>{children}</>;
};
