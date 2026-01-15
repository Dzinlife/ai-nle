/**
 * 时间线元素组件
 * 负责单个元素的渲染和交互
 */

import { useDrag } from "@use-gesture/react";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { componentRegistry } from "@/dsl/model/componentRegistry";
import { modelRegistry, useModelExists } from "@/dsl/model/registry";
import { TimelineElement as TimelineElementType } from "@/dsl/types";
import { cn } from "@/lib/utils";
import {
	DragGhostState,
	useAttachments,
	useAutoScroll,
	useDragging,
	useElements,
	useMultiSelect,
	useSnap,
	useTimelineStore,
	useTrackAssignments,
} from "../contexts/TimelineContext";
import {
	calculateDragResult,
	calculateFinalTrack,
	DEFAULT_ELEMENT_HEIGHT,
} from "../timeline/index";
import { applySnap, applySnapForDrag, collectSnapPoints } from "../utils/snap";

// ============================================================================
// 类型定义
// ============================================================================

interface TimelineElementProps {
	element: TimelineElementType;
	trackIndex: number;
	trackY: number;
	ratio: number;
	trackHeight: number;
	trackCount: number;
	updateTimeRange: (elementId: string, start: number, end: number) => void;
}

// ============================================================================
// 子组件：拖拽手柄
// ============================================================================

interface DragHandleProps {
	position: "left" | "right";
	onDrag: ReturnType<typeof useDrag>;
}

const DragHandle: React.FC<DragHandleProps> = ({ position, onDrag }) => {
	const isLeft = position === "left";
	return (
		<div
			{...onDrag()}
			className={cn(
				"absolute",
				isLeft ? "left-0 rounded-l-md" : "right-0 rounded-r-md",
				"top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/50 active:bg-blue-500 z-10",
			)}
			style={{ touchAction: "none" }}
		>
			<div
				className={cn(
					"absolute",
					isLeft ? "left-0" : "right-0",
					"top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity",
				)}
			/>
		</div>
	);
};

// ============================================================================
// 子组件：元素内容
// ============================================================================

interface ElementContentProps {
	element: TimelineElementType;
	startTime: number;
	endTime: number;
}

const ElementContent: React.FC<ElementContentProps> = ({
	element,
	startTime,
	endTime,
}) => {
	const { id, type, props } = element;
	const definition = componentRegistry.get(type);
	const hasModel = useModelExists(id);

	// 如果 model 还未创建，显示加载状态或基础信息
	if (definition?.Timeline && hasModel) {
		const TimelineComponent = definition.Timeline;
		return (
			<div className="size-full h-8 mt-auto text-white">
				<TimelineComponent id={id} {...props} start={startTime} end={endTime} />
			</div>
		);
	}

	return (
		<div className="text-white rounded w-full">{element.name || type}</div>
	);
};

// ============================================================================
// Hooks：最大时长约束
// ============================================================================

function useMaxDurationConstraint(elementId: string) {
	const hasModel = useModelExists(elementId);
	const [maxDuration, setMaxDuration] = useState<number | undefined>(undefined);

	useEffect(() => {
		if (!hasModel) {
			setMaxDuration(undefined);
			return;
		}

		const store = modelRegistry.get(elementId);
		if (!store) {
			setMaxDuration(undefined);
			return;
		}

		setMaxDuration(store.getState().constraints.maxDuration);

		const unsubscribe = store.subscribe((state) => {
			setMaxDuration(state.constraints.maxDuration);
		});

		return unsubscribe;
	}, [hasModel, elementId]);

	return maxDuration;
}

// ============================================================================
// Hooks：本地拖拽状态
// ============================================================================

interface LocalDragState {
	startTime: number | null;
	endTime: number | null;
	trackY: number | null;
}

function useLocalDragState(
	baseStartTime: number,
	baseEndTime: number,
	baseTrackY: number,
) {
	const isDraggingRef = useRef(false);
	const [localState, setLocalState] = useState<LocalDragState>({
		startTime: null,
		endTime: null,
		trackY: null,
	});

	// 当基础值变化且不在拖拽时，重置本地状态
	useEffect(() => {
		if (!isDraggingRef.current) {
			setLocalState({ startTime: null, endTime: null, trackY: null });
		}
	}, [baseStartTime, baseEndTime, baseTrackY]);

	const setLocalStartTime = useCallback((time: number | null) => {
		setLocalState((prev) => ({ ...prev, startTime: time }));
	}, []);

	const setLocalEndTime = useCallback((time: number | null) => {
		setLocalState((prev) => ({ ...prev, endTime: time }));
	}, []);

	const setLocalTrackY = useCallback((y: number | null) => {
		setLocalState((prev) => ({ ...prev, trackY: y }));
	}, []);

	const resetLocalState = useCallback(() => {
		setLocalState({ startTime: null, endTime: null, trackY: null });
	}, []);

	return {
		isDraggingRef,
		localStartTime: localState.startTime,
		localEndTime: localState.endTime,
		localTrackY: localState.trackY,
		setLocalStartTime,
		setLocalEndTime,
		setLocalTrackY,
		resetLocalState,
	};
}

// ============================================================================
// 主组件
// ============================================================================

const TimelineElement: React.FC<TimelineElementProps> = ({
	element,
	trackIndex,
	trackY,
	ratio,
	trackHeight,
	trackCount,
	updateTimeRange,
}) => {
	const { id, timeline } = element;

	// Context hooks
	const { setIsDragging, setActiveDropTarget, setDragGhosts, dragGhosts } =
		useDragging();
	const { selectedIds, select, toggleSelect, setSelection } = useMultiSelect();
	const { snapEnabled, setActiveSnapPoint } = useSnap();
	const { elements, setElements } = useElements();
	const currentTime = useTimelineStore((state) => state.currentTime);
	const { attachments, autoAttach } = useAttachments();
	const { moveWithAttachments } = useTrackAssignments();
	const {
		updateAutoScrollFromPosition,
		updateAutoScrollYFromPosition,
		stopAutoScroll,
	} = useAutoScroll();

	// 约束
	const maxDuration = useMaxDurationConstraint(id);

	// 本地拖拽状态
	const {
		isDraggingRef,
		localStartTime,
		localEndTime,
		localTrackY,
		setLocalStartTime,
		setLocalEndTime,
		setLocalTrackY,
	} = useLocalDragState(timeline.start, timeline.end, trackY);

	// Refs for drag calculations
	const initialStartRef = useRef(0);
	const initialEndRef = useRef(0);
	const initialTrackRef = useRef(0);
	const currentStartRef = useRef(timeline.start);
	const currentEndRef = useRef(timeline.end);
	const dragSelectedIdsRef = useRef<string[]>([]);
	const dragInitialElementsRef = useRef<
		Map<string, { start: number; end: number; trackIndex: number }>
	>(new Map());
	const dragMinStartRef = useRef(0);
	const initialElementsSnapshotRef = useRef<TimelineElementType[]>([]);
	const initialGhostsRef = useRef<DragGhostState[]>([]);
	// Ref for DOM element (用于 clone)
	const elementRef = useRef<HTMLDivElement>(null);

	// 计算显示值
	const startTime = localStartTime ?? timeline.start;
	const endTime = localEndTime ?? timeline.end;
	// 显示 Y：主轨道元素在容器内固定为 0，其他轨道使用 trackY
	// localTrackY 在拖拽时会被设置，用于显示拖拽效果（ghost 处理）
	// 由于主轨道元素在拖拽时会被隐藏（显示 ghost），这里不需要特殊处理 localTrackY
	const displayY = trackIndex === 0 ? 0 : (localTrackY ?? trackY);

	// 同步当前值到 refs
	useEffect(() => {
		currentStartRef.current = startTime;
		currentEndRef.current = endTime;
	}, [startTime, endTime]);

	// 计算位置和尺寸
	const left = startTime * ratio;
	const width = (endTime - startTime) * ratio;

	// 样式计算
	const isSelected = selectedIds.includes(id);
	const currentDuration = endTime - startTime;
	const isAtMaxDuration =
		maxDuration !== undefined && Math.abs(currentDuration - maxDuration) < 0.01;

	// ========== 左边缘拖拽 ==========
	const bindLeftDrag = useDrag(
		({ movement: [mx], first, last, event, tap }) => {
			if (tap) return;

			if (first) {
				event?.stopPropagation();
				if (!selectedIds.includes(id)) {
					select(id);
				}
				isDraggingRef.current = true;
				setIsDragging(true);
				initialStartRef.current = currentStartRef.current;
				initialEndRef.current = currentEndRef.current;
			}

			const deltaTime = mx / ratio;
			let newStart = Math.max(
				0,
				Math.min(
					initialStartRef.current + deltaTime,
					initialEndRef.current - 0.1,
				),
			);

			if (maxDuration !== undefined) {
				newStart = Math.max(newStart, initialEndRef.current - maxDuration);
			}

			let snapPoint = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, id);
				const snapped = applySnap(newStart, snapPoints, ratio);
				if (
					snapped.snapPoint &&
					snapped.time >= 0 &&
					snapped.time < initialEndRef.current - 0.1
				) {
					newStart = snapped.time;
					snapPoint = snapped.snapPoint;
				}
			}

			if (last) {
				isDraggingRef.current = false;
				setIsDragging(false);
				setActiveSnapPoint(null);
				if (Math.abs(mx) > 0) {
					updateTimeRange(id, newStart, initialEndRef.current);
				}
			} else {
				setLocalStartTime(newStart);
				setActiveSnapPoint(snapPoint);
			}
		},
		{ axis: "x", filterTaps: true },
	);

	// ========== 右边缘拖拽 ==========
	const bindRightDrag = useDrag(
		({ movement: [mx], first, last, event, tap }) => {
			if (tap) return;

			if (first) {
				event?.stopPropagation();
				isDraggingRef.current = true;
				setIsDragging(true);
				initialStartRef.current = currentStartRef.current;
				initialEndRef.current = currentEndRef.current;
			}

			const deltaTime = mx / ratio;
			let newEnd = Math.max(
				initialStartRef.current + 0.1,
				initialEndRef.current + deltaTime,
			);

			if (maxDuration !== undefined) {
				newEnd = Math.min(newEnd, initialStartRef.current + maxDuration);
			}

			let snapPoint = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, id);
				const snapped = applySnap(newEnd, snapPoints, ratio);
				if (snapped.snapPoint && snapped.time > initialStartRef.current + 0.1) {
					newEnd = snapped.time;
					snapPoint = snapped.snapPoint;
				}
			}

			if (last) {
				isDraggingRef.current = false;
				setIsDragging(false);
				setActiveSnapPoint(null);
				if (Math.abs(mx) > 0) {
					updateTimeRange(id, initialStartRef.current, newEnd);
				}
			} else {
				setLocalEndTime(newEnd);
				setActiveSnapPoint(snapPoint);
			}
		},
		{ axis: "x", filterTaps: true },
	);

	// ========== 整体拖拽 ==========
	// 记录初始鼠标位置和元素位置的偏移
	const initialMouseOffsetRef = useRef({ x: 0, y: 0 });
	// 记录拖拽开始时的滚动位置
	const initialScrollLeftRef = useRef(0);
	// 记录克隆的 HTML（拖拽过程中不变）
	const clonedHtmlRef = useRef("");

	const bindBodyDrag = useDrag(
		({ movement: [mx, my], first, last, event, tap, xy }) => {
			if (tap) return;

			// 获取当前滚动位置
			const currentScrollLeft = useTimelineStore.getState().scrollLeft;

			if (first) {
				event?.stopPropagation();
				isDraggingRef.current = true;
				setIsDragging(true);
				const nextSelectedIds = selectedIds.includes(id) ? selectedIds : [id];
				if (!selectedIds.includes(id)) {
					setSelection([id], id);
				}
				dragSelectedIdsRef.current = nextSelectedIds;

				const initialMap = new Map<
					string,
					{ start: number; end: number; trackIndex: number }
				>();
				let minStart = Infinity;
				for (const el of elements) {
					if (!nextSelectedIds.includes(el.id)) continue;
					const trackIndexValue = el.timeline.trackIndex ?? 0;
					initialMap.set(el.id, {
						start: el.timeline.start,
						end: el.timeline.end,
						trackIndex: trackIndexValue,
					});
					minStart = Math.min(minStart, el.timeline.start);
				}
				dragInitialElementsRef.current = initialMap;
				dragMinStartRef.current = Number.isFinite(minStart) ? minStart : 0;
				initialElementsSnapshotRef.current = elements;

				initialStartRef.current = currentStartRef.current;
				initialEndRef.current = currentEndRef.current;
				initialTrackRef.current = trackIndex;
				initialScrollLeftRef.current = currentScrollLeft;

				// 计算鼠标相对于元素左上角的偏移
				const target = event?.target as HTMLElement;
				const rect = target
					?.closest("[data-timeline-element]")
					?.getBoundingClientRect();
				if (rect) {
					initialMouseOffsetRef.current = {
						x: xy[0] - rect.left,
						y: xy[1] - rect.top,
					};
				}

				const isMultiDrag = nextSelectedIds.length > 1;
				if (!isMultiDrag) {
					// 克隆元素 DOM
					if (elementRef.current) {
						const clone = elementRef.current.cloneNode(true) as HTMLElement;
						// 移除拖拽相关的 data 属性避免冲突
						clone.removeAttribute("data-timeline-element");
						// 重置位置相关样式（将在 ghost 容器中设置）
						clone.style.position = "relative";
						clone.style.left = "0";
						clone.style.top = "0";
						clone.style.opacity = "1";
						clonedHtmlRef.current = clone.outerHTML;
					}

					// 设置初始 ghost（使用屏幕坐标）
					const ghostWidth =
						(currentEndRef.current - currentStartRef.current) * ratio;
				setDragGhosts([
					{
						elementId: id,
						element,
						screenX: xy[0] - initialMouseOffsetRef.current.x,
						screenY: xy[1] - initialMouseOffsetRef.current.y,
						width: ghostWidth,
						height: DEFAULT_ELEMENT_HEIGHT,
						clonedHtml: clonedHtmlRef.current,
					},
				]);
				} else {
				const ghosts: DragGhostState[] = [];
				for (const selectedId of nextSelectedIds) {
					const ghostSource = document.querySelector<HTMLElement>(
						`[data-element-id="${selectedId}"]`,
					);
					if (!ghostSource) continue;
					const rect = ghostSource.getBoundingClientRect();
					const clone = ghostSource.cloneNode(true) as HTMLElement;
					clone.removeAttribute("data-timeline-element");
					clone.style.position = "relative";
					clone.style.left = "0";
					clone.style.top = "0";
					clone.style.opacity = "1";

					const selectedElement = elements.find((el) => el.id === selectedId);
					if (!selectedElement) continue;

					ghosts.push({
						elementId: selectedId,
						element: selectedElement,
						screenX: rect.left,
						screenY: rect.top,
						width: rect.width,
						height: rect.height,
						clonedHtml: clone.outerHTML,
					});
				}
				initialGhostsRef.current = ghosts;
				setDragGhosts(ghosts);
				}
			}

			// 计算滚动偏移量（自动滚动导致的额外位移）
			const scrollDelta = currentScrollLeft - initialScrollLeftRef.current;
			// 将滚动偏移加入到水平移动量中
			const adjustedDeltaX = mx + scrollDelta;

			// 通用的拖拽目标检测（基于实际 DOM 测量，不依赖 hardcode）
			const findDropTargetFromScreenPosition = (
				mouseX: number,
				mouseY: number,
			): { trackIndex: number; type: "track" | "gap" } => {
				// 查找所有 drop zone
				const mainZone = document.querySelector<HTMLElement>(
					'[data-track-drop-zone="main"]',
				);
				const otherZone = document.querySelector<HTMLElement>(
					'[data-track-drop-zone="other"]',
				);

				// 检查主轨道区域
				if (mainZone) {
					const rect = mainZone.getBoundingClientRect();
					if (
						mouseY >= rect.top &&
						mouseY <= rect.bottom &&
						mouseX >= rect.left &&
						mouseX <= rect.right
					) {
						return { trackIndex: 0, type: "track" };
					}
				}

				// 检查其他轨道区域
				if (otherZone) {
					const rect = otherZone.getBoundingClientRect();
					const otherTrackCount = parseInt(
						otherZone.dataset.trackCount || "0",
						10,
					);
					const zoneTrackHeight = parseInt(
						otherZone.dataset.trackHeight || "60",
						10,
					);

					if (
						mouseY >= rect.top &&
						mouseY <= rect.bottom &&
						mouseX >= rect.left &&
						mouseX <= rect.right &&
						otherTrackCount > 0
					) {
						// 查找内容容器来确定精确的内容区域位置
						const contentArea = otherZone.querySelector<HTMLElement>(
							'[data-track-content-area="other"]',
						);

						let contentTop = rect.top;
						if (contentArea) {
							const contentRect = contentArea.getBoundingClientRect();
							contentTop = contentRect.top;
						}

						// 计算相对于内容区域顶部的位置
						const contentRelativeY = mouseY - contentTop;

						if (contentRelativeY < 0) {
							// 在内容区域上方（padding 区域），返回最高的轨道
							return { trackIndex: otherTrackCount, type: "track" };
						}

						// 计算目标轨道（从上到下是 otherTrackCount, otherTrackCount-1, ..., 1）
						const trackFromTop = Math.floor(contentRelativeY / zoneTrackHeight);
						const targetTrackIndex = Math.max(
							1,
							Math.min(otherTrackCount, otherTrackCount - trackFromTop),
						);

						return { trackIndex: targetTrackIndex, type: "track" };
					}
				}

				// 如果鼠标在两个区域之外，根据 Y 位置判断最近的区域
				if (mainZone && otherZone) {
					const mainRect = mainZone.getBoundingClientRect();
					const otherRect = otherZone.getBoundingClientRect();

					// 如果在主轨道下方或更靠近主轨道
					if (mouseY > mainRect.top) {
						return { trackIndex: 0, type: "track" };
					}

					// 如果在其他轨道上方
					if (mouseY < otherRect.top) {
						const otherTrackCount = parseInt(
							otherZone.dataset.trackCount || "0",
							10,
						);
						return {
							trackIndex: Math.max(1, otherTrackCount),
							type: "track",
						};
					}
				}

				// 最终 fallback
				return { trackIndex: trackIndex, type: "track" };
			};

			const isMultiDrag =
				dragSelectedIdsRef.current.length > 1 &&
				dragSelectedIdsRef.current.includes(id);
			if (isMultiDrag) {
				let deltaTime = adjustedDeltaX / ratio;
				const minStart = dragMinStartRef.current;
				if (deltaTime < -minStart) {
					deltaTime = -minStart;
				}

				let snapPoint = null;
				if (snapEnabled) {
					const baseElements =
						initialElementsSnapshotRef.current.length > 0
							? initialElementsSnapshotRef.current
							: elements;
					let bestDelta = deltaTime;
					let bestSnapPoint = null;
					let bestDistance = Infinity;

					for (const selectedId of dragSelectedIdsRef.current) {
						const initial = dragInitialElementsRef.current.get(selectedId);
						if (!initial) continue;
						const snapPoints = collectSnapPoints(
							baseElements,
							currentTime,
							selectedId,
						);
						const snapped = applySnapForDrag(
							initial.start + deltaTime,
							initial.end + deltaTime,
							snapPoints,
							ratio,
						);
						if (!snapped.snapPoint) continue;
						const snappedDelta = snapped.start - initial.start;
						if (snappedDelta < -minStart) continue;
						const distance = Math.abs(snappedDelta - deltaTime);
						if (distance < bestDistance) {
							bestDistance = distance;
							bestDelta = snappedDelta;
							bestSnapPoint = snapped.snapPoint;
						}
					}

					deltaTime = bestDelta;
					snapPoint = bestSnapPoint;
				}

				const initialMap = dragInitialElementsRef.current;
				const draggedInitial = initialMap.get(id);
				const screenDropTarget = findDropTargetFromScreenPosition(xy[0], xy[1]);
				const dropTarget = screenDropTarget;
				const baseElements =
					initialElementsSnapshotRef.current.length > 0
						? initialElementsSnapshotRef.current
						: elements;
				const baseStart = draggedInitial?.start ?? initialStartRef.current;
				const baseEnd = draggedInitial?.end ?? initialEndRef.current;
				const nextStart = baseStart + deltaTime;
				const nextEnd = baseEnd + deltaTime;
				const timeRange = {
					start: nextStart,
					end: nextEnd,
				};

				const tempElements = baseElements.map((el) => {
					const initial = initialMap.get(el.id);
					if (!initial) return el;
					return {
						...el,
						timeline: {
							...el.timeline,
							start: initial.start + deltaTime,
							end: initial.end + deltaTime,
							trackIndex: initial.trackIndex,
						},
					};
				});

				const finalTrackResult = calculateFinalTrack(
					dropTarget,
					timeRange,
					tempElements,
					id,
					draggedInitial?.trackIndex ?? initialTrackRef.current,
				);
				const trackDelta =
					finalTrackResult.trackIndex -
					(draggedInitial?.trackIndex ?? initialTrackRef.current);
				const snapShift = deltaTime * ratio - adjustedDeltaX;
				const ghostDeltaX = mx + snapShift;
				const ghostDeltaY = my;

				if (!last) {
					setDragGhosts(
						initialGhostsRef.current.map((ghost) => ({
							...ghost,
							screenX: ghost.screenX + ghostDeltaX,
							screenY: ghost.screenY + ghostDeltaY,
						})),
					);
				}

				if (last) {
					const selectedSet = new Set(dragSelectedIdsRef.current);
					const baseElementMap = new Map(
						baseElements.map((el) => [el.id, el]),
					);
					const movedChildren = new Map<string, { start: number; end: number }>();

					if (autoAttach && deltaTime !== 0) {
						for (const parentId of selectedSet) {
							const parentInitial = initialMap.get(parentId);
							if (!parentInitial) continue;
							const isLeavingMainTrack =
								parentInitial.trackIndex === 0 &&
								trackDelta !== 0 &&
								(dropTarget.type === "gap" ||
									finalTrackResult.trackIndex > 0);
							if (isLeavingMainTrack) continue;
							const childIds = attachments.get(parentId) ?? [];
							for (const childId of childIds) {
								if (selectedSet.has(childId)) continue;
								const childBase = baseElementMap.get(childId);
								if (!childBase) continue;
								const childNewStart = childBase.timeline.start + deltaTime;
								const childNewEnd = childBase.timeline.end + deltaTime;
								if (childNewStart >= 0) {
									movedChildren.set(childId, {
										start: childNewStart,
										end: childNewEnd,
									});
								}
							}
						}
					}

					setElements((prev) =>
						prev.map((el) => {
							if (selectedSet.has(el.id)) {
								const initial = initialMap.get(el.id);
								if (!initial) return el;
								return {
									...el,
									timeline: {
										...el.timeline,
										start: initial.start + deltaTime,
										end: initial.end + deltaTime,
										trackIndex: Math.max(0, initial.trackIndex + trackDelta),
									},
								};
							}

							const childMove = movedChildren.get(el.id);
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
						}),
					);
					isDraggingRef.current = false;
					setIsDragging(false);
					setActiveSnapPoint(null);
					setActiveDropTarget(null);
					setDragGhosts([]);
					setLocalTrackY(null);
					stopAutoScroll();
				} else {
					setActiveSnapPoint(snapPoint);
					setActiveDropTarget({
						type: finalTrackResult.displayType,
						trackIndex: finalTrackResult.trackIndex,
						elementId: id,
						start: timeRange.start,
						end: timeRange.end,
						finalTrackIndex: finalTrackResult.trackIndex,
					});

					// 自动滚动：检查鼠标是否靠近边缘
					const scrollArea = document.querySelector<HTMLElement>(
						"[data-timeline-scroll-area]",
					);
					if (scrollArea) {
						const scrollRect = scrollArea.getBoundingClientRect();
						updateAutoScrollFromPosition(
							xy[0],
							scrollRect.left,
							scrollRect.right,
						);
					}

					// 垂直自动滚动：检查鼠标是否靠近上下边缘
					const verticalScrollArea = document.querySelector<HTMLElement>(
						"[data-vertical-scroll-area]",
					);
					if (verticalScrollArea) {
						const verticalRect = verticalScrollArea.getBoundingClientRect();
						updateAutoScrollYFromPosition(
							xy[1],
							verticalRect.top,
							verticalRect.bottom,
						);
					}
				}

				return;
			}

			// 先计算基础的拖拽结果（用于时间计算和 fallback）
			const dragResult = calculateDragResult({
				deltaX: adjustedDeltaX,
				deltaY: my,
				ratio,
				initialStart: initialStartRef.current,
				initialEnd: initialEndRef.current,
				initialTrackY: trackY,
				initialTrackIndex: initialTrackRef.current,
				trackHeight,
				trackCount,
				elementHeight: DEFAULT_ELEMENT_HEIGHT,
			});

			const screenDropTarget = findDropTargetFromScreenPosition(xy[0], xy[1]);
			const dropTarget = screenDropTarget;
			const hasSignificantVerticalMove =
				screenDropTarget.trackIndex !== trackIndex;

			// 使用基础拖拽结果的时间计算
			let { newStart, newEnd } = dragResult;
			const { newY } = dragResult;

			// 吸附处理
			let snapPoint = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, id);
				const snapped = applySnapForDrag(newStart, newEnd, snapPoints, ratio);
				newStart = snapped.start;
				newEnd = snapped.end;
				snapPoint = snapped.snapPoint;
			}

			if (last) {
				isDraggingRef.current = false;
				setIsDragging(false);
				setActiveSnapPoint(null);
				setActiveDropTarget(null);
				setDragGhosts([]);
				setLocalTrackY(null);
				stopAutoScroll();

				if (Math.abs(mx) > 0 || Math.abs(my) > 0) {
					const actualDelta = newStart - initialStartRef.current;
					const originalTrackIndex = timeline.trackIndex ?? 0;

					const isLeavingMainTrack =
						originalTrackIndex === 0 &&
						hasSignificantVerticalMove &&
						(dropTarget.type === "gap" || dropTarget.trackIndex > 0);

					// 收集关联子元素
					const attachedChildren: { id: string; start: number; end: number }[] =
						[];
					if (autoAttach && actualDelta !== 0 && !isLeavingMainTrack) {
						const childIds = attachments.get(id) ?? [];
						for (const childId of childIds) {
							const child = elements.find((el) => el.id === childId);
							if (child) {
								const childNewStart = child.timeline.start + actualDelta;
								const childNewEnd = child.timeline.end + actualDelta;
								if (childNewStart >= 0) {
									attachedChildren.push({
										id: childId,
										start: childNewStart,
										end: childNewEnd,
									});
								}
							}
						}
					}

					moveWithAttachments(
						id,
						newStart,
						newEnd,
						dropTarget,
						attachedChildren,
					);
				}
			} else {
				setLocalStartTime(newStart);
				setLocalEndTime(newEnd);
				setLocalTrackY(newY);
				setActiveSnapPoint(snapPoint);

				// 更新 ghost 位置（使用屏幕坐标）
				const ghostWidth = (newEnd - newStart) * ratio;
				setDragGhosts([
					{
						elementId: id,
						element,
						screenX: xy[0] - initialMouseOffsetRef.current.x,
						screenY: xy[1] - initialMouseOffsetRef.current.y,
						width: ghostWidth,
						height: DEFAULT_ELEMENT_HEIGHT,
						clonedHtml: clonedHtmlRef.current,
					},
				]);

				// 计算最终轨道位置用于显示
				const tempElements = elements.map((el) =>
					el.id === id
						? {
								...el,
								timeline: { ...el.timeline, start: newStart, end: newEnd },
							}
						: el,
				);

				const finalTrackResult = calculateFinalTrack(
					dropTarget,
					{ start: newStart, end: newEnd },
					tempElements,
					id,
					timeline.trackIndex ?? 0,
				);

				setActiveDropTarget({
					type: finalTrackResult.displayType,
					trackIndex:
						finalTrackResult.displayType === "gap"
							? finalTrackResult.trackIndex
							: dropTarget.trackIndex,
					elementId: id,
					start: newStart,
					end: newEnd,
					finalTrackIndex: finalTrackResult.trackIndex,
				});

				// 自动滚动：检查鼠标是否靠近边缘
				const scrollArea = document.querySelector<HTMLElement>(
					"[data-timeline-scroll-area]",
				);
				if (scrollArea) {
					const scrollRect = scrollArea.getBoundingClientRect();
					updateAutoScrollFromPosition(
						xy[0],
						scrollRect.left,
						scrollRect.right,
					);
				}

				// 垂直自动滚动：检查鼠标是否靠近上下边缘
				const verticalScrollArea = document.querySelector<HTMLElement>(
					"[data-vertical-scroll-area]",
				);
				if (verticalScrollArea) {
					const verticalRect = verticalScrollArea.getBoundingClientRect();
					updateAutoScrollYFromPosition(
						xy[1],
						verticalRect.top,
						verticalRect.bottom,
					);
				}
			}
		},
		{ filterTaps: true },
	);

	// 点击选中
	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			const metaPressed = e.shiftKey || e.ctrlKey || e.metaKey;
			if (metaPressed) {
				toggleSelect(id);
				return;
			}
			select(id);
		},
		[id, select, toggleSelect],
	);

	// 判断当前元素是否正在被拖拽
	const isBeingDragged = dragGhosts.some((ghost) => ghost.elementId === id);
	const isMultiDragging = dragGhosts.length > 1;

	// 容器样式
	const containerClassName = useMemo(() => {
		const base = "absolute flex rounded-md group";
		if (isSelected) return `${base} ring-2 ring-blue-500 bg-blue-900/50`;
		if (isAtMaxDuration) return `${base} bg-amber-700 ring-1 ring-amber-500`;
		return `${base} bg-neutral-700`;
	}, [isSelected, isAtMaxDuration]);

	return (
		<div
			ref={elementRef}
			data-timeline-element
			data-element-id={id}
			className={containerClassName}
			style={{
				left,
				width: width - 1,
				top: displayY,
				height: DEFAULT_ELEMENT_HEIGHT,
				// 拖拽时降低透明度，但保持在 DOM 中以维持拖拽手势
				opacity: isBeingDragged ? (isMultiDragging ? 0.5 : 0) : 1,
			}}
			onClick={handleClick}
		>
			<DragHandle position="left" onDrag={bindLeftDrag} />

			<div
				{...bindBodyDrag()}
				className="relative p-1 size-full flex flex-col cursor-move text-xs"
				style={{ touchAction: "none" }}
			>
				<ElementContent
					element={element}
					startTime={startTime}
					endTime={endTime}
				/>
			</div>

			<DragHandle position="right" onDrag={bindRightDrag} />
		</div>
	);
};

export default TimelineElement;
