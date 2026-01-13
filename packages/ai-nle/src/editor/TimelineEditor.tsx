import React, {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
	const { activeDropTarget } = useDragging();

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

	const timelineItems = useMemo(() => {
		// 使用 trackCount 计算容器高度，确保至少有 1 个轨道的高度
		const containerHeight = Math.max(trackCount, 1) * trackHeight;

		return (
			<div
				className="relative"
				style={{
					transform: `translateX(-${scrollLeft}px)`,
					height: containerHeight,
				}}
			>
				{/* 元素 */}
				{elements.map((element) => {
					const trackIndex = trackAssignments.get(element.id) ?? 0;
					// 计算 Y 坐标：主轨道(0)在底部，轨道号越大越靠上
					const y = (trackCount - 1 - trackIndex) * trackHeight;
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
		elements,
		scrollLeft,
		ratio,
		updateTimeRange,
		trackAssignments,
		trackCount,
		trackHeight,
	]);

	// 轨道标签
	const trackLabels = useMemo(() => {
		const labels = [];
		for (let i = 0; i < trackCount; i++) {
			// 轨道 0 在底部，所以需要反转渲染顺序
			const trackIndex = trackCount - 1 - i;
			const isMainTrack = trackIndex === 0;
			labels.push(
				<div
					key={trackIndex}
					className={`flex items-center justify-end pr-3 text-xs font-medium ${
						isMainTrack ? "text-blue-400" : "text-neutral-400"
					}`}
					style={{ height: trackHeight }}
				>
					{isMainTrack ? "主轨道" : `轨道 ${trackIndex}`}
				</div>,
			);
		}
		return labels;
	}, [trackCount, trackHeight]);

	// 吸附指示线
	const snapIndicator = useMemo(() => {
		if (!activeSnapPoint) return null;
		const left = activeSnapPoint.time * ratio - scrollLeft;
		return (
			<div
				className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-50 pointer-events-none"
				style={{ left, marginLeft: leftColumnWidth }}
			/>
		);
	}, [activeSnapPoint, ratio, scrollLeft]);

	// 拖拽目标指示器
	const dropIndicator = useMemo(() => {
		if (!activeDropTarget) return null;

		// 使用拖拽后的新时间范围
		const elementLeft = activeDropTarget.start * ratio - scrollLeft;
		const elementWidth =
			(activeDropTarget.end - activeDropTarget.start) * ratio;

		if (activeDropTarget.type === "gap") {
			// 间隙插入模式 - 显示横向高亮线
			// gap 的 trackIndex 表示新轨道将插入到该位置
			// 视觉上应该显示在 trackIndex 和 trackIndex-1 之间的线
			const gapY = (trackCount - activeDropTarget.trackIndex) * trackHeight;
			return (
				<div
					className="absolute left-0 right-0 h-1 bg-green-500 z-40 pointer-events-none rounded-full shadow-lg shadow-green-500/50"
					style={{
						top: gapY - 2,
					}}
				/>
			);
		}
		// track 模式 - 显示矩形占位符，使用 finalTrackIndex（考虑重叠后的实际位置）
		const trackY =
			(trackCount - 1 - activeDropTarget.finalTrackIndex) * trackHeight;

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
	}, [activeDropTarget, ratio, scrollLeft, trackCount, trackHeight]);

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
			<div className="relative w-full flex-1 min-h-0 flex -mt-18 overflow-hidden">
				<TimeIndicatorCanvas
					className="top-12"
					leftOffset={leftColumnWidth + timelinePaddingLeft}
					ratio={ratio}
					scrollLeft={scrollLeft}
				/>
				{/* 时间线容器，左右列共用垂直滚动 */}
				<div className="flex items-start pt-18 w-full flex-1 min-h-0 overflow-y-auto [&>div]:pb-18">
					{/* 左侧列，轨道标签 */}
					<div
						className="text-white z-20 pr-4 flex flex-col bg-neutral-800/80 backdrop-blur-3xl backdrop-saturate-150 border-r border-white/10 pt-10 -mt-10"
						style={{ width: leftColumnWidth }}
					>
						{/* 轨道标签容器 */}
						<div className="flex-1">
							<div className="mt-1.5">{trackLabels}</div>
						</div>
					</div>
					{/* 右侧时间线内容 */}
					<div
						ref={containerRef}
						className="relative flex-1 overflow-x-hidden pt-1.5 "
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
								{snapIndicator}
								{dropIndicator}
								{timelineItems}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default TimelineEditor;
