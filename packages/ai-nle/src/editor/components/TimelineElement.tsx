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
	useAttachments,
	useAutoScroll,
	useDragging,
	useElements,
	useMultiSelect,
	useSnap,
	useTimelineStore,
	useTrackAssignments,
} from "../contexts/TimelineContext";
import { DEFAULT_ELEMENT_HEIGHT } from "../timeline/index";
import { useTimelineElementDnd } from "../timeline/useTimelineElementDnd";

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
			<div className="size-full text-white">
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
	const { moveWithAttachments, trackAssignments } = useTrackAssignments();
	const {
		updateAutoScrollFromPosition,
		updateAutoScrollYFromPosition,
		stopAutoScroll,
	} = useAutoScroll();

	// 约束
	const maxDuration = useMaxDurationConstraint(id);

	// 本地拖拽状态
	const {
		localStartTime,
		localEndTime,
		localTrackY,
		setLocalStartTime,
		setLocalEndTime,
		setLocalTrackY,
	} = useLocalDragState(timeline.start, timeline.end, trackY);

	// Ref for DOM element (用于 clone)
	const elementRef = useRef<HTMLDivElement>(null);

	// 计算显示值
	const startTime = localStartTime ?? timeline.start;
	const endTime = localEndTime ?? timeline.end;
	// 显示 Y：主轨道元素在容器内固定为 0，其他轨道使用 trackY
	// localTrackY 在拖拽时会被设置，用于显示拖拽效果（ghost 处理）
	// 由于主轨道元素在拖拽时会被隐藏（显示 ghost），这里不需要特殊处理 localTrackY
	const displayY = trackIndex === 0 ? 0 : (localTrackY ?? trackY);

	// 计算位置和尺寸
	const left = startTime * ratio;
	const width = (endTime - startTime) * ratio;

	// 样式计算
	const isSelected = selectedIds.includes(id);
	const currentDuration = endTime - startTime;
	const isAtMaxDuration =
		maxDuration !== undefined && Math.abs(currentDuration - maxDuration) < 0.01;
	const elementHeight = Math.min(DEFAULT_ELEMENT_HEIGHT, trackHeight);

	const { bindLeftDrag, bindRightDrag, bindBodyDrag } = useTimelineElementDnd({
		element,
		trackIndex,
		trackY,
		ratio,
		trackHeight,
		trackCount,
		trackAssignments,
		maxDuration,
		elements,
		currentTime,
		snapEnabled,
		autoAttach,
		attachments,
		selectedIds,
		select,
		setSelection,
		updateTimeRange,
		moveWithAttachments,
		setElements,
		setIsDragging,
		setActiveSnapPoint,
		setActiveDropTarget,
		setDragGhosts,
		setLocalStartTime,
		setLocalEndTime,
		setLocalTrackY,
		stopAutoScroll,
		updateAutoScrollFromPosition,
		updateAutoScrollYFromPosition,
		elementRef,
	});

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
				height: elementHeight,
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
