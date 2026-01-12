import { useDrag } from "@use-gesture/react";
import React, { useEffect, useRef, useState } from "react";
import { componentRegistry } from "@/dsl/model/componentRegistry";
import { modelRegistry, useModelExists } from "@/dsl/model/registry";
import { TimelineElement as TimelineElementType } from "@/dsl/types";

interface TimelineElementProps {
	element: TimelineElementType;
	index: number;
	ratio: number;
	trackHeight: number;
	updateTimeRange: (elementId: string, start: number, end: number) => void;
}

const TimelineElement: React.FC<TimelineElementProps> = ({
	element,
	index,
	ratio,
	trackHeight,
	updateTimeRange,
}) => {
	const { id, type, timeline, props } = element;
	const containerRef = useRef<HTMLDivElement>(null);
	const initialStartRef = useRef<number>(0);
	const initialEndRef = useRef<number>(0);
	const isDraggingRef = useRef<boolean>(false);
	const currentStartTimeRef = useRef<number>(0);
	const currentEndTimeRef = useRef<number>(0);

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
		}
	}, [baseStartTime, baseEndTime]);

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

			if (last) {
				// 拖拽结束时，更新全局状态（只改变 start，end 保持不变）
				isDraggingRef.current = false;
				// 只有在真正有移动时才更新（防止点击误触发）
				if (Math.abs(mx) > 0) {
					updateTimeRange(id, newStart, initialEndRef.current);
				}
				// 不立即清除本地状态，让 useEffect 在全局状态更新后自动清除
				// 这样可以确保在全局状态更新完成之前，本地状态保持最新值
			} else {
				// 拖拽过程中，只更新本地状态（只改变 start，end 保持不变）
				setLocalStartTime(newStart);
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

			if (last) {
				// 拖拽结束时，更新全局状态
				isDraggingRef.current = false;
				// 只有在真正有移动时才更新（防止点击误触发）
				if (Math.abs(mx) > 0) {
					updateTimeRange(id, initialStartRef.current, newEnd);
				}
				// 不立即清除本地状态，让 useEffect 在全局状态更新后自动清除
				// 这样可以确保在全局状态更新完成之前，本地状态保持最新值
			} else {
				// 拖拽过程中，只更新本地状态
				setLocalEndTime(newEnd);
			}
		},
		{
			axis: "x",
			filterTaps: true,
		},
	);

	// 整体拖动 - 同步改变 start 和 end
	const bindBodyDrag = useDrag(
		({ movement: [mx], first, last, event, tap }) => {
			// 如果是点击（没有移动），直接返回，不执行任何操作
			if (tap) {
				return;
			}

			if (first) {
				event?.stopPropagation();
				isDraggingRef.current = true;
				// 保存拖拽开始时的初始值（从 ref 读取当前实际显示的值）
				initialStartRef.current = currentStartTimeRef.current;
				initialEndRef.current = currentEndTimeRef.current;
			}

			// 计算新的 start 和 end 时间（保持 duration 不变）
			const deltaTime = mx / ratio;
			const duration = initialEndRef.current - initialStartRef.current;
			const newStart = Math.max(0, initialStartRef.current + deltaTime);
			const newEnd = newStart + duration;

			if (last) {
				// 拖拽结束时，更新全局状态
				isDraggingRef.current = false;
				// 只有在真正有移动时才更新（防止点击误触发）
				if (Math.abs(mx) > 0) {
					updateTimeRange(id, newStart, newEnd);
				}
				// 不立即清除本地状态，让 useEffect 在全局状态更新后自动清除
			} else {
				// 拖拽过程中，只更新本地状态
				setLocalStartTime(newStart);
				setLocalEndTime(newEnd);
			}
		},
		{
			axis: "x",
			filterTaps: true,
		},
	);

	// 检查是否达到最大时长
	const currentDuration = endTime - startTime;
	const isAtMaxDuration =
		maxDuration !== undefined && Math.abs(currentDuration - maxDuration) < 0.01;

	return (
		<div
			ref={containerRef}
			key={id}
			className={`absolute flex rounded-md group ${
				isAtMaxDuration
					? "bg-amber-700 ring-1 ring-amber-500"
					: "bg-neutral-700"
			}`}
			style={{
				left,
				width,
				top: index * trackHeight,
				height: 54,
			}}
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
