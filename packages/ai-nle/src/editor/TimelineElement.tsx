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
import {
	useAttachments,
	useDragging,
	useElements,
	useSelectedElement,
	useSnap,
	useTimelineStore,
	useTrackAssignments,
} from "./TimelineContext";
import {
	calculateDragResult,
	calculateFinalTrack,
	DEFAULT_ELEMENT_HEIGHT,
} from "./timeline/index";
import { applySnap, applySnapForDrag, collectSnapPoints } from "./utils/snap";

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
			className={`absolute ${isLeft ? "left-0 rounded-l-md" : "right-0 rounded-r-md"} top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/50 active:bg-blue-500 z-10`}
			style={{ touchAction: "none" }}
		>
			<div
				className={`absolute ${isLeft ? "left-0" : "right-0"} top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity`}
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

	if (definition?.Timeline) {
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
	const { setIsDragging, setActiveDropTarget } = useDragging();
	const { selectedElementId, setSelectedElementId } = useSelectedElement();
	const { snapEnabled, setActiveSnapPoint } = useSnap();
	const { elements } = useElements();
	const currentTime = useTimelineStore((state) => state.currentTime);
	const { attachments, autoAttach } = useAttachments();
	const { moveWithAttachments } = useTrackAssignments();

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

	// 计算显示值
	const startTime = localStartTime ?? timeline.start;
	const endTime = localEndTime ?? timeline.end;
	const displayY = localTrackY ?? trackY;

	// 同步当前值到 refs
	useEffect(() => {
		currentStartRef.current = startTime;
		currentEndRef.current = endTime;
	}, [startTime, endTime]);

	// 计算位置和尺寸
	const left = startTime * ratio;
	const width = (endTime - startTime) * ratio;

	// 样式计算
	const isSelected = selectedElementId === id;
	const currentDuration = endTime - startTime;
	const isAtMaxDuration =
		maxDuration !== undefined && Math.abs(currentDuration - maxDuration) < 0.01;

	// ========== 左边缘拖拽 ==========
	const bindLeftDrag = useDrag(
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
	const bindBodyDrag = useDrag(
		({ movement: [mx, my], first, last, event, tap }) => {
			if (tap) return;

			if (first) {
				event?.stopPropagation();
				isDraggingRef.current = true;
				setIsDragging(true);
				initialStartRef.current = currentStartRef.current;
				initialEndRef.current = currentEndRef.current;
				initialTrackRef.current = trackIndex;
			}

			// 使用统一的拖拽计算
			const dragResult = calculateDragResult({
				deltaX: mx,
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

			let { newStart, newEnd } = dragResult;
			const { newY, dropTarget, hasSignificantVerticalMove } = dragResult;

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
				setLocalTrackY(null);

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
			}
		},
		{ filterTaps: true },
	);

	// 点击选中
	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			setSelectedElementId(id);
		},
		[id, setSelectedElementId],
	);

	// 容器样式
	const containerClassName = useMemo(() => {
		const base = "absolute flex rounded-md group";
		if (isSelected) return `${base} ring-2 ring-blue-500 bg-blue-900/50`;
		if (isAtMaxDuration) return `${base} bg-amber-700 ring-1 ring-amber-500`;
		return `${base} bg-neutral-700`;
	}, [isSelected, isAtMaxDuration]);

	return (
		<div
			className={containerClassName}
			style={{ left, width, top: displayY, height: DEFAULT_ELEMENT_HEIGHT }}
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
