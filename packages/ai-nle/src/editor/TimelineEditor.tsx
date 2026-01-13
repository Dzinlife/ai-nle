import React, {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";
import TimeIndicatorCanvas from "@/editor/TimeIndicatorCanvas";
import PlaybackToolbar from "./PlaybackToolbar";
import {
	useDragging,
	useElements,
	usePlaybackControl,
	usePreviewTime,
	useSelectedElement,
	useSnap,
	useTimelineStore,
	useTrackAssignments,
} from "./TimelineContext";
import TimelineElement from "./TimelineElement";
import TimelineRuler from "./TimelineRuler";
import { DEFAULT_ELEMENT_HEIGHT } from "./timeline/trackConfig";

const TimelineEditor = () => {
	const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
	const { setPreviewTime } = usePreviewTime();
	const { isPlaying } = usePlaybackControl();
	const { elements, setElements } = useElements();
	const { setSelectedElementId } = useSelectedElement();
	const { activeSnapPoint } = useSnap();
	const { trackAssignments, trackCount } = useTrackAssignments();
	const { activeDropTarget, dragGhost } = useDragging();

	// 滚动位置状态
	const [scrollLeft, setScrollLeft] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollLeftRef = useRef(0);
	const touchStartXRef = useRef(0);

	// 左侧列宽度状态
	const [leftColumnWidth] = useState(200); // 默认 44 * 4 = 176px (w-44)

	// 时间刻度尺宽度
	const [rulerWidth, setRulerWidth] = useState(800);
	const observerRef = useRef<ResizeObserver | null>(null);

	// 使用 callback ref 来监听容器宽度
	const rulerContainerRef = useCallback((node: HTMLDivElement | null) => {
		if (observerRef.current) {
			observerRef.current.disconnect();
			observerRef.current = null;
		}

		if (node) {
			const observer = new ResizeObserver((entries) => {
				for (const entry of entries) {
					setRulerWidth(entry.contentRect.width);
				}
			});
			observer.observe(node);
			observerRef.current = observer;
			setRulerWidth(node.clientWidth);
		}
	}, []);

	const ratio = 50;

	const timelinePaddingLeft = 48;

	// 更新元素的时间范围（start 和 end）
	const updateTimeRange = useCallback(
		(elementId: string, start: number, end: number) => {
			setElements((prev) =>
				prev.map((el) => {
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
				}),
			);
		},
		[setElements],
	);

	// hover 时设置预览时间（临时）
	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (isPlaying) return;
			const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
			const time = Math.max(
				0,
				(x - leftColumnWidth - timelinePaddingLeft + scrollLeft) / ratio,
			);
			startTransition(() => {
				setPreviewTime(time);
			});
		},
		[ratio, scrollLeft, leftColumnWidth, isPlaying, setPreviewTime],
	);

	// 点击时设置固定时间，并清除选中状态
	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
			const time = Math.max(
				0,
				(x - leftColumnWidth - timelinePaddingLeft + scrollLeft) / ratio,
			);
			setCurrentTime(time);
			setPreviewTime(null); // 清除预览时间
			setSelectedElementId(null); // 清除选中状态
		},
		[
			ratio,
			scrollLeft,
			leftColumnWidth,
			timelinePaddingLeft,
			setCurrentTime,
			setPreviewTime,
			setSelectedElementId,
		],
	);

	// 鼠标离开时清除预览时间，回到固定时间
	const handleMouseLeave = useCallback(() => {
		setPreviewTime(null);
	}, [setPreviewTime]);

	// 同步 scrollLeft 到 ref
	useEffect(() => {
		scrollLeftRef.current = scrollLeft;
	}, [scrollLeft]);

	// 使用原生事件监听器来正确处理滚动，防止触发窗口滚动
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleWheel = (e: WheelEvent) => {
			// 只在有水平滚动时才处理，垂直滚动不处理
			if (Math.abs(e.deltaX) > 0) {
				// 阻止水平滚动事件的默认行为，防止触发窗口滚动
				e.preventDefault();
				e.stopPropagation();

				// 修复方向：向右滚动（deltaX > 0）应该增加 scrollLeft
				setScrollLeft((prev) => {
					const newScrollLeft = prev + e.deltaX;
					return Math.max(0, newScrollLeft);
				});
			}
			// 如果是纯垂直滚动（只有 deltaY），不阻止默认行为，让页面正常滚动
		};

		// 阻止触摸手势（防止后退）
		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 1) {
				const touch = e.touches[0];
				const rect = container.getBoundingClientRect();
				// 如果触摸点在容器内，阻止默认行为（防止后退手势）
				if (
					touch.clientX >= rect.left &&
					touch.clientX <= rect.right &&
					touch.clientY >= rect.top &&
					touch.clientY <= rect.bottom
				) {
					e.preventDefault();
					e.stopPropagation();
					touchStartXRef.current = touch.clientX;
				}
			}
		};

		const handleTouchMove = (e: TouchEvent) => {
			if (e.touches.length === 1) {
				e.preventDefault();
				e.stopPropagation();
				const touch = e.touches[0];
				const deltaX = touchStartXRef.current - touch.clientX;
				setScrollLeft(Math.max(0, scrollLeftRef.current + deltaX));
			}
		};

		// 使用 { passive: false } 来确保可以调用 preventDefault
		container.addEventListener("wheel", handleWheel, { passive: false });
		container.addEventListener("touchstart", handleTouchStart, {
			passive: false,
		});
		container.addEventListener("touchmove", handleTouchMove, {
			passive: false,
		});

		return () => {
			container.removeEventListener("wheel", handleWheel);
			container.removeEventListener("touchstart", handleTouchStart);
			container.removeEventListener("touchmove", handleTouchMove);
		};
	}, []);

	const trackHeight = 60;

	const timeStamps = (
		<div
			className="flex pointer-events-none sticky top-0 left-0 z-50 bg-neutral-800/10 border border-white/10 rounded-full mx-4 backdrop-blur-2xl border-r overflow-hidden"
			style={{
				paddingLeft: leftColumnWidth - 16 - 2,
			}}
		>
			<div
				ref={rulerContainerRef}
				className="overflow-hidden border-l border-white/10 bg-neutral-800/30 flex-1"
			>
				<TimelineRuler
					scrollLeft={scrollLeft}
					ratio={ratio}
					width={rulerWidth}
					paddingLeft={timelinePaddingLeft}
					// fps={60}
				/>
			</div>
		</div>
	);

	// 分离主轨道元素和其他轨道元素
	const { mainTrackElements, otherTrackElements } = useMemo(() => {
		const main: typeof elements = [];
		const other: typeof elements = [];
		for (const element of elements) {
			const trackIndex = trackAssignments.get(element.id) ?? 0;
			if (trackIndex === 0) {
				main.push(element);
			} else {
				other.push(element);
			}
		}
		return { mainTrackElements: main, otherTrackElements: other };
	}, [elements, trackAssignments]);

	// 其他轨道数量（不包括主轨道）
	const otherTrackCount = Math.max(trackCount - 1, 0);

	// 其他轨道的时间线项目
	const otherTimelineItems = useMemo(() => {
		if (otherTrackCount === 0) return null;

		const containerHeight = otherTrackCount * trackHeight;

		return (
			<div
				className="relative"
				style={{
					transform: `translateX(-${scrollLeft}px)`,
					height: containerHeight,
				}}
			>
				{otherTrackElements.map((element) => {
					const trackIndex = trackAssignments.get(element.id) ?? 0;
					// 计算 Y 坐标：在其他轨道区域内，轨道 1 在底部，轨道号越大越靠上
					// trackIndex 1 -> y = (otherTrackCount - 1) * trackHeight
					// trackIndex 2 -> y = (otherTrackCount - 2) * trackHeight
					const y = (otherTrackCount - trackIndex) * trackHeight;
					return (
						<TimelineElement
							key={element.id}
							element={element}
							trackIndex={trackIndex}
							trackY={y}
							ratio={ratio}
							trackHeight={trackHeight}
							trackCount={trackCount}
							updateTimeRange={updateTimeRange}
						/>
					);
				})}
			</div>
		);
	}, [
		otherTrackElements,
		scrollLeft,
		ratio,
		updateTimeRange,
		trackAssignments,
		trackCount,
		otherTrackCount,
		trackHeight,
	]);

	// 主轨道的时间线项目
	const mainTimelineItems = useMemo(() => {
		// 主轨道在整体布局中的 Y 坐标（用于拖拽计算）
		const mainTrackYInGlobalLayout = (trackCount - 1) * trackHeight;

		return (
			<div
				className="relative"
				style={{
					transform: `translateX(-${scrollLeft}px)`,
					height: trackHeight,
				}}
			>
				{mainTrackElements.map((element) => {
					return (
						<TimelineElement
							key={element.id}
							element={element}
							trackIndex={0}
							trackY={mainTrackYInGlobalLayout}
							ratio={ratio}
							trackHeight={trackHeight}
							trackCount={trackCount}
							updateTimeRange={updateTimeRange}
						/>
					);
				})}
			</div>
		);
	}, [
		mainTrackElements,
		scrollLeft,
		ratio,
		updateTimeRange,
		trackCount,
		trackHeight,
	]);

	// 其他轨道标签（不包括主轨道）
	const otherTrackLabels = useMemo(() => {
		if (otherTrackCount === 0) return null;
		const labels = [];
		for (let i = 0; i < otherTrackCount; i++) {
			// 轨道 1 在底部，轨道号越大越靠上
			const trackIndex = otherTrackCount - i;
			labels.push(
				<div
					key={trackIndex}
					className="flex items-center justify-end pr-3 text-xs font-medium text-neutral-400"
					style={{ height: trackHeight }}
				>
					{`轨道 ${trackIndex}`}
				</div>,
			);
		}
		return labels;
	}, [otherTrackCount, trackHeight]);

	// 主轨道标签
	const mainTrackLabel = useMemo(() => {
		return (
			<div
				className="flex items-center justify-end pr-3 text-xs font-medium text-blue-400"
				style={{ height: trackHeight }}
			>
				主轨道
			</div>
		);
	}, [trackHeight]);

	// 吸附指示线（其他轨道区域）
	const otherSnapIndicator = useMemo(() => {
		if (!activeSnapPoint || otherTrackCount === 0) return null;
		const left = activeSnapPoint.time * ratio - scrollLeft;
		return (
			<div
				className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-50 pointer-events-none"
				style={{ left }}
			/>
		);
	}, [activeSnapPoint, ratio, scrollLeft, otherTrackCount]);

	// 吸附指示线（主轨道区域）
	const mainSnapIndicator = useMemo(() => {
		if (!activeSnapPoint) return null;
		const left = activeSnapPoint.time * ratio - scrollLeft;
		return (
			<div
				className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-50 pointer-events-none"
				style={{ left }}
			/>
		);
	}, [activeSnapPoint, ratio, scrollLeft]);

	// 拖拽目标指示器（其他轨道区域）
	const otherDropIndicator = useMemo(() => {
		if (!activeDropTarget || activeDropTarget.finalTrackIndex === 0)
			return null;

		// 使用拖拽后的新时间范围
		const elementLeft = activeDropTarget.start * ratio - scrollLeft;
		const elementWidth =
			(activeDropTarget.end - activeDropTarget.start) * ratio;

		if (activeDropTarget.type === "gap") {
			// 间隙插入模式 - 显示横向高亮线
			// gap 的 trackIndex 表示新轨道将插入到该位置
			// 在其他轨道区域，trackIndex 1 在底部
			const gapY =
				(otherTrackCount - activeDropTarget.trackIndex + 1) * trackHeight;
			return (
				<div
					className="absolute left-0 right-0 h-1 bg-green-500 z-40 pointer-events-none rounded-full shadow-lg shadow-green-500/50"
					style={{
						top: gapY - 2,
					}}
				/>
			);
		}
		// track 模式 - 显示矩形占位符
		// 在其他轨道区域，需要计算相对位置
		const trackY =
			(otherTrackCount - activeDropTarget.finalTrackIndex) * trackHeight;

		return (
			<div
				className="absolute bg-blue-500/20 border-2 border-blue-500 border-dashed z-40 pointer-events-none rounded-md box-border"
				style={{
					top: trackY,
					left: elementLeft,
					width: elementWidth,
					height: DEFAULT_ELEMENT_HEIGHT,
				}}
			/>
		);
	}, [activeDropTarget, ratio, scrollLeft, otherTrackCount, trackHeight]);

	// 拖拽目标指示器（主轨道区域）
	const mainDropIndicator = useMemo(() => {
		if (!activeDropTarget || activeDropTarget.finalTrackIndex !== 0)
			return null;

		// 使用拖拽后的新时间范围
		const elementLeft = activeDropTarget.start * ratio - scrollLeft;
		const elementWidth =
			(activeDropTarget.end - activeDropTarget.start) * ratio;

		// 主轨道模式 - 显示矩形占位符
		return (
			<div
				className="absolute bg-blue-500/20 border-2 border-blue-500 border-dashed z-40 pointer-events-none rounded-md box-border"
				style={{
					top: 0,
					left: elementLeft,
					width: elementWidth,
					height: DEFAULT_ELEMENT_HEIGHT,
				}}
			/>
		);
	}, [activeDropTarget, ratio, scrollLeft]);

	// 拖拽 Ghost 元素（使用 Portal 渲染到 body）
	const ghostElement = useMemo(() => {
		if (!dragGhost) return null;

		const ghost = (
			<div
				className="fixed bg-blue-500/30 border-2 border-blue-500 rounded-md pointer-events-none shadow-lg shadow-blue-500/20"
				style={{
					left: dragGhost.screenX,
					top: dragGhost.screenY,
					width: dragGhost.width,
					height: dragGhost.height,
					zIndex: 9999,
				}}
			>
				<div className="p-1 text-xs text-white truncate">
					{dragGhost.element.name || dragGhost.element.type}
				</div>
			</div>
		);

		return createPortal(ghost, document.body);
	}, [dragGhost]);

	return (
		<div className="relative bg-neutral-800 h-full flex flex-col min-h-0 w-full overflow-hidden">
			<div className="pointer-events-none absolute top-0 left-0 w-full h-19 z-50 bg-linear-to-b from-neutral-800 via-neutral-800 via-70% to-transparent"></div>
			<ProgressiveBlur
				position="top"
				className="absolute top-0 w-full h-20 z-50 "
				blurLevels={[0.5, 4, 16, 16, 16, 16, 16, 16]}
			/>
			<PlaybackToolbar className="h-12 z-50" />
			{timeStamps}
			<div className="relative w-full flex-1 min-h-0 flex flex-col -mt-18 overflow-hidden">
				<TimeIndicatorCanvas
					className="top-12"
					leftOffset={leftColumnWidth + timelinePaddingLeft}
					ratio={ratio}
					scrollLeft={scrollLeft}
				/>
				{/* 其他轨道区域（可滚动） */}
				<div className="flex items-start pt-18 w-full flex-1 min-h-0 overflow-y-auto">
					{/* 左侧列，其他轨道标签 */}
					<div
						className="text-white z-20 pr-4 flex flex-col bg-neutral-800/80 backdrop-blur-3xl backdrop-saturate-150 border-r border-white/10 pt-10 -mt-10 sticky top-0"
						style={{ width: leftColumnWidth }}
					>
						<div className="flex-1">
							<div className="mt-1.5">{otherTrackLabels}</div>
						</div>
					</div>
					{/* 右侧其他轨道时间线内容 */}
					<div
						ref={containerRef}
						data-track-drop-zone="other"
						data-track-count={otherTrackCount}
						data-track-height={trackHeight}
						className="relative flex-1 overflow-x-hidden pt-1.5"
						onMouseMove={handleMouseMove}
						onMouseLeave={handleMouseLeave}
						onClick={handleClick}
						style={{
							paddingLeft: leftColumnWidth,
							marginLeft: -leftColumnWidth,
						}}
					>
						<div style={{ paddingLeft: timelinePaddingLeft }}>
							<div
								className="relative"
								data-track-content-area="other"
								data-content-height={otherTrackCount * trackHeight}
							>
								{otherSnapIndicator}
								{otherDropIndicator}
								{otherTimelineItems}
							</div>
						</div>
					</div>
				</div>
				{/* 主轨道区域（sticky 底部） */}
				<div className="flex items-start w-full shrink-0 border-t border-white/10 bg-neutral-800">
					{/* 左侧主轨道标签 */}
					<div
						className="text-white z-20 pr-4 flex flex-col bg-neutral-800/80 backdrop-blur-3xl backdrop-saturate-150 border-r border-white/10"
						style={{ width: leftColumnWidth }}
					>
						{mainTrackLabel}
					</div>
					{/* 右侧主轨道时间线内容 */}
					<div
						data-track-drop-zone="main"
						data-track-index="0"
						className="relative flex-1 overflow-x-hidden"
						onMouseMove={handleMouseMove}
						onMouseLeave={handleMouseLeave}
						onClick={handleClick}
						style={{
							paddingLeft: leftColumnWidth,
							marginLeft: -leftColumnWidth,
						}}
					>
						<div style={{ paddingLeft: timelinePaddingLeft }}>
							<div className="relative">
								{mainSnapIndicator}
								{mainDropIndicator}
								{mainTimelineItems}
							</div>
						</div>
					</div>
				</div>
				{/* 拖拽 Ghost 层 */}
				{ghostElement}
			</div>
		</div>
	);
};

export default TimelineEditor;
