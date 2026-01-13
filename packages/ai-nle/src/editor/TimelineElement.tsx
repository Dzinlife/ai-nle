import { useDrag } from "@use-gesture/react";
import React, { useEffect, useRef, useState } from "react";
import { componentRegistry } from "@/dsl/model/componentRegistry";
import { modelRegistry, useModelExists } from "@/dsl/model/registry";
import { TimelineElement as TimelineElementType } from "@/dsl/types";
import { useDragging, useElements, useSelectedElement, useSnap, useTimelineStore, useAttachments, useTrackAssignments } from "./TimelineContext";
import { applySnap, applySnapForDrag, collectSnapPoints } from "./utils/snap";
import { findAvailableTrack, assignTracks, getTrackCount, hasOverlapOnStoredTrack } from "./utils/trackAssignment";

interface TimelineElementProps {
	element: TimelineElementType;
	trackIndex: number;
	trackY: number;
	ratio: number;
	trackHeight: number;
	trackCount: number;
	updateTimeRange: (elementId: string, start: number, end: number) => void;
}

const TimelineElement: React.FC<TimelineElementProps> = ({
	element,
	trackIndex,
	trackY,
	ratio,
	trackHeight,
	trackCount,
	updateTimeRange,
}) => {
	const { id, type, timeline, props } = element;
	const containerRef = useRef<HTMLDivElement>(null);
	const initialStartRef = useRef<number>(0);
	const initialEndRef = useRef<number>(0);
	const initialTrackRef = useRef<number>(0);
	const isDraggingRef = useRef<boolean>(false);
	const currentStartTimeRef = useRef<number>(0);
	const currentEndTimeRef = useRef<number>(0);
	const { setIsDragging, setActiveDropTarget } = useDragging();
	const { selectedElementId, setSelectedElementId } = useSelectedElement();
	const { snapEnabled, setActiveSnapPoint } = useSnap();
	const { elements } = useElements();
	const currentTime = useTimelineStore((state) => state.currentTime);
	const { attachments, autoAttach } = useAttachments();
	const { getDropTarget, moveWithAttachments } = useTrackAssignments();

	// 本地状态用于拖拽时的临时 Y 位置显示
	const [localTrackY, setLocalTrackY] = useState<number | null>(null);

	const isSelected = selectedElementId === id;

	const { start, end } = timeline;

	const baseStartTime = start;
	const baseEndTime = end;

	// 获取 model 约束（如果存在）
	const hasModel = useModelExists(id);
	const [maxDuration, setMaxDuration] = useState<number | undefined>(undefined);

	// 订阅 constraints 变化
	useEffect(() => {
		if (!hasModel) {
			setMaxDuration(undefined);
			return;
		}

		const store = modelRegistry.get(id);
		if (!store) {
			setMaxDuration(undefined);
			return;
		}

		// 立即设置当前值
		const currentMaxDuration = store.getState().constraints.maxDuration;
		setMaxDuration(currentMaxDuration);

		// 订阅后续变化
		const unsubscribe = store.subscribe((state) => {
			const newMaxDuration = state.constraints.maxDuration;
			setMaxDuration(newMaxDuration);
		});

		return unsubscribe;
	}, [hasModel, id]);

	// 本地状态用于拖拽时的临时显示
	const [localStartTime, setLocalStartTime] = useState<number | null>(null);
	const [localEndTime, setLocalEndTime] = useState<number | null>(null);

	// 当 props 变化且不在拖拽时，重置本地状态
	useEffect(() => {
		if (!isDraggingRef.current) {
			setLocalStartTime(null);
			setLocalEndTime(null);
			setLocalTrackY(null);
		}
	}, [baseStartTime, baseEndTime, trackY]);

	// 使用本地状态或基础值
	const startTime = localStartTime ?? baseStartTime;
	const endTime = localEndTime ?? baseEndTime;

	// 同步当前实际显示的值到 ref，确保拖动开始时能获取到最新值
	useEffect(() => {
		currentStartTimeRef.current = startTime;
		currentEndTimeRef.current = endTime;
	}, [startTime, endTime]);

	const left = startTime * ratio;
	const width = (endTime - startTime) * ratio;

	// 左拖拽手柄 - 调整 start
	const bindLeftDrag = useDrag(
		({ movement: [mx], first, last, event, tap }) => {
			// 如果是点击（没有移动），直接返回，不执行任何操作
			if (tap) {
				return;
			}

			if (first) {
				event?.stopPropagation();
				isDraggingRef.current = true;
				setIsDragging(true);
				// 保存拖拽开始时的初始值（从 ref 读取当前实际显示的值）
				// 这样即使有本地状态，也能正确计算偏移，避免闭包问题
				initialStartRef.current = currentStartTimeRef.current;
				initialEndRef.current = currentEndTimeRef.current;
			}

			// 计算新的 start 时间
			// mx 是相对于拖动开始时的移动距离（像素），每次拖动开始时自动重置为 0
			// 需要转换为时间单位
			const deltaTime = mx / ratio;
			let newStart = Math.max(
				0,
				Math.min(
					initialStartRef.current + deltaTime,
					initialEndRef.current - 0.1,
				),
			);

			// 如果有最大时长约束，限制 start 不能让 duration 超过 maxDuration
			if (maxDuration !== undefined) {
				const minStart = initialEndRef.current - maxDuration;
				newStart = Math.max(newStart, minStart);
			}

			// 吸附处理
			let activeSnap = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, id);
				const snapped = applySnap(newStart, snapPoints, ratio);
				if (snapped.snapPoint) {
					// 检查吸附后的位置是否仍然有效
					const snappedStart = snapped.time;
					if (snappedStart >= 0 && snappedStart < initialEndRef.current - 0.1) {
						newStart = snappedStart;
						activeSnap = snapped.snapPoint;
					}
				}
			}

			if (last) {
				// 拖拽结束时，更新全局状态（只改变 start，end 保持不变）
				isDraggingRef.current = false;
				setIsDragging(false);
				setActiveSnapPoint(null);
				// 只有在真正有移动时才更新（防止点击误触发）
				if (Math.abs(mx) > 0) {
					updateTimeRange(id, newStart, initialEndRef.current);
				}
				// 不立即清除本地状态，让 useEffect 在全局状态更新后自动清除
				// 这样可以确保在全局状态更新完成之前，本地状态保持最新值
			} else {
				// 拖拽过程中，只更新本地状态（只改变 start，end 保持不变）
				setLocalStartTime(newStart);
				setActiveSnapPoint(activeSnap);
			}
		},
		{
			axis: "x",
			filterTaps: true,
		},
	);

	// 右拖拽手柄 - 调整 end
	const bindRightDrag = useDrag(
		({ movement: [mx], first, last, event, tap }) => {
			// 如果是点击（没有移动），直接返回，不执行任何操作
			if (tap) {
				return;
			}

			if (first) {
				event?.stopPropagation();
				isDraggingRef.current = true;
				setIsDragging(true);
				// 保存拖拽开始时的初始值（从 ref 读取当前实际显示的值）
				// 这样即使有本地状态，也能正确计算偏移，避免闭包问题
				initialStartRef.current = currentStartTimeRef.current;
				initialEndRef.current = currentEndTimeRef.current;
			}

			// 计算新的 end 时间
			// mx 是相对于拖动开始时的移动距离（像素），每次拖动开始时自动重置为 0
			const deltaTime = mx / ratio;
			let newEnd = Math.max(
				initialStartRef.current + 0.1,
				initialEndRef.current + deltaTime,
			);

			// 如果有最大时长约束，限制 end 不超过 start + maxDuration
			if (maxDuration !== undefined) {
				const maxEnd = initialStartRef.current + maxDuration;
				newEnd = Math.min(newEnd, maxEnd);
			}

			// 吸附处理
			let activeSnap = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, id);
				const snapped = applySnap(newEnd, snapPoints, ratio);
				if (snapped.snapPoint) {
					// 检查吸附后的位置是否仍然有效
					const snappedEnd = snapped.time;
					if (snappedEnd > initialStartRef.current + 0.1) {
						newEnd = snappedEnd;
						activeSnap = snapped.snapPoint;
					}
				}
			}

			if (last) {
				// 拖拽结束时，更新全局状态
				isDraggingRef.current = false;
				setIsDragging(false);
				setActiveSnapPoint(null);
				// 只有在真正有移动时才更新（防止点击误触发）
				if (Math.abs(mx) > 0) {
					updateTimeRange(id, initialStartRef.current, newEnd);
				}
				// 不立即清除本地状态，让 useEffect 在全局状态更新后自动清除
				// 这样可以确保在全局状态更新完成之前，本地状态保持最新值
			} else {
				// 拖拽过程中，只更新本地状态
				setLocalEndTime(newEnd);
				setActiveSnapPoint(activeSnap);
			}
		},
		{
			axis: "x",
			filterTaps: true,
		},
	);

	// 整体拖动 - 同步改变 start、end 和轨道
	const bindBodyDrag = useDrag(
		({ movement: [mx, my], first, last, event, tap }) => {
			// 如果是点击（没有移动），直接返回，不执行任何操作
			if (tap) {
				return;
			}

			if (first) {
				event?.stopPropagation();
				isDraggingRef.current = true;
				setIsDragging(true);
				// 保存拖拽开始时的初始值（从 ref 读取当前实际显示的值）
				initialStartRef.current = currentStartTimeRef.current;
				initialEndRef.current = currentEndTimeRef.current;
				initialTrackRef.current = trackIndex;
			}

			// 计算新的 start 和 end 时间（保持 duration 不变）
			const deltaTime = mx / ratio;
			const duration = initialEndRef.current - initialStartRef.current;
			let newStart = Math.max(0, initialStartRef.current + deltaTime);
			let newEnd = newStart + duration;

			// 计算新的 Y 位置
			const newY = trackY + my;

			// 吸附处理 - 整体拖动时考虑 start 和 end 两个边缘
			let activeSnap = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, id);
				const snapped = applySnapForDrag(newStart, newEnd, snapPoints, ratio);
				newStart = snapped.start;
				newEnd = snapped.end;
				activeSnap = snapped.snapPoint;
			}

			if (last) {
				// 拖拽结束时，更新全局状态
				isDraggingRef.current = false;
				setIsDragging(false);
				setActiveSnapPoint(null);
				setActiveDropTarget(null);
				setLocalTrackY(null);

				// 只有在真正有移动时才更新（防止点击误触发）
				if (Math.abs(mx) > 0 || Math.abs(my) > 0) {
					// 计算实际移动的时间偏移量
					const actualDelta = newStart - initialStartRef.current;

					// 根据拖拽位置判断是放到轨道还是插入间隙
					const dropTarget = getDropTarget(Math.max(0, newY), trackHeight, trackCount);

					// 收集需要同步移动的附属元素
					const attachedChildren: { id: string; start: number; end: number }[] = [];
					if (autoAttach && actualDelta !== 0) {
						const childIds = attachments.get(id) ?? [];
						for (const childId of childIds) {
							const child = elements.find((el) => el.id === childId);
							if (child) {
								const childNewStart = child.timeline.start + actualDelta;
								const childNewEnd = child.timeline.end + actualDelta;
								// 确保子元素不会移动到负数时间
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

					// 使用统一函数移动主元素和附属元素，自动处理轨道重叠
					moveWithAttachments(id, newStart, newEnd, dropTarget, attachedChildren);
				}
				// 不立即清除本地状态，让 useEffect 在全局状态更新后自动清除
			} else {
				// 拖拽过程中，只更新本地状态
				setLocalStartTime(newStart);
				setLocalEndTime(newEnd);
				setLocalTrackY(newY);
				setActiveSnapPoint(activeSnap);

				// 计算并更新拖拽目标指示
				const dropTarget = getDropTarget(Math.max(0, newY), trackHeight, trackCount);

				// 创建临时元素列表（更新当前元素的时间范围）
				const tempElements = elements.map((el) => {
					if (el.id === id) {
						return {
							...el,
							timeline: { ...el.timeline, start: newStart, end: newEnd },
						};
					}
					return el;
				});

				// 计算基于存储 trackIndex 的最大轨道（用于 gap 检测）
				const maxStoredTrack = Math.max(
					0,
					...tempElements.map((el) => el.timeline.trackIndex ?? 0)
				);

				// 计算实际的最终轨道位置和显示类型
				let finalTrackIndex: number;
				let displayType: "track" | "gap" = dropTarget.type;

				if (dropTarget.type === "gap") {
					// 间隙模式：使用存储的 trackIndex 检查重叠，避免级联重分配问题
					const gapTrackIndex = dropTarget.trackIndex;
					const belowTrack = gapTrackIndex - 1; // 缝隙下方的轨道
					const aboveTrack = gapTrackIndex; // 缝隙上方的轨道

					// 检查下方轨道是否有空位（基于存储的 trackIndex）
					const belowHasSpace = belowTrack >= 0 && !hasOverlapOnStoredTrack(
						newStart,
						newEnd,
						belowTrack,
						tempElements,
						id,
					);

					// 检查上方轨道是否有空位（基于存储的 trackIndex）
					const aboveHasSpace = aboveTrack <= maxStoredTrack && !hasOverlapOnStoredTrack(
						newStart,
						newEnd,
						aboveTrack,
						tempElements,
						id,
					);

					if (belowHasSpace) {
						// 当前轨道（下方）有空位，放入下方轨道
						displayType = "track";
						finalTrackIndex = belowTrack;
					} else if (aboveHasSpace) {
						// 上方轨道有空位，放入上方轨道
						displayType = "track";
						finalTrackIndex = aboveTrack;
					} else {
						// 两边都没有空位，保持 gap 模式（插入新轨道）
						// 只查一级，不继续向上查找，让用户可以主动插入新轨道
						finalTrackIndex = gapTrackIndex;
					}
				} else {
					// 轨道模式：使用原有逻辑（基于 assignTracks 的分配）
					const tempAssignments = assignTracks(tempElements);
					const tempCount = getTrackCount(tempAssignments);
					finalTrackIndex = findAvailableTrack(
						newStart,
						newEnd,
						dropTarget.trackIndex,
						tempElements,
						tempAssignments,
						id,
						tempCount,
					);
				}

				setActiveDropTarget({
					type: displayType,
					trackIndex: dropTarget.trackIndex,
					elementId: id,
					start: newStart,
					end: newEnd,
					finalTrackIndex,
				});
			}
		},
		{
			filterTaps: true,
		},
	);

	// 检查是否达到最大时长
	const currentDuration = endTime - startTime;
	const isAtMaxDuration =
		maxDuration !== undefined && Math.abs(currentDuration - maxDuration) < 0.01;

	// 点击选中元素
	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		setSelectedElementId(id);
	};

	// 计算显示位置
	const displayY = localTrackY ?? trackY;

	return (
		<div
			ref={containerRef}
			key={id}
			className={`absolute flex rounded-md group ${
				isSelected
					? "ring-2 ring-blue-500 bg-blue-900/50"
					: isAtMaxDuration
						? "bg-amber-700 ring-1 ring-amber-500"
						: "bg-neutral-700"
			}`}
			style={{
				left,
				width,
				top: displayY,
				height: 54,
			}}
			onClick={handleClick}
		>
			{/* 左拖拽手柄 */}
			<div
				{...bindLeftDrag()}
				className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/50 active:bg-blue-500 z-10 rounded-l-md"
				style={{
					touchAction: "none",
				}}
			>
				<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
			</div>

			{/* 内容区域 - 可整体拖动 */}
			<div
				{...bindBodyDrag()}
				className="relative p-1 size-full flex flex-col cursor-move text-xs"
				style={{
					touchAction: "none",
				}}
			>
				{(() => {
					// 从 registry 获取 Timeline 组件
					const definition = componentRegistry.get(type);

					if (definition?.Timeline) {
						const TimelineComponent = definition.Timeline;
						return (
							<div className="size-full h-8 mt-auto text-white">
								<TimelineComponent
									id={id}
									{...props}
									start={startTime}
									end={endTime}
								/>
							</div>
						);
					}

					// Fallback: 仅显示组件名称
					return (
						<div className="text-white rounded w-full">
							{element.name || type}
						</div>
					);
				})()}
			</div>

			{/* 右拖拽手柄 */}
			<div
				{...bindRightDrag()}
				className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-blue-500/50 active:bg-blue-500 z-10 rounded-r-md"
				style={{
					touchAction: "none",
				}}
			>
				<div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-blue-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
			</div>
		</div>
	);
};

export default TimelineElement;
