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

const TimelineEditor = () => {
	const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
	const { setPreviewTime } = usePreviewTime();
	const { isPlaying } = usePlaybackControl();
	const { elements, setElements } = useElements();
	const { setSelectedElementId } = useSelectedElement();
	const { activeSnapPoint } = useSnap();
	const { trackAssignments, trackCount } = useTrackAssignments();

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
			const time = Math.max(0, (x - leftColumnWidth + scrollLeft) / ratio);
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
			const time = Math.max(0, (x - leftColumnWidth + scrollLeft) / ratio);
			setCurrentTime(time);
			setPreviewTime(null); // 清除预览时间
			setSelectedElementId(null); // 清除选中状态
		},
		[ratio, scrollLeft, leftColumnWidth, setCurrentTime, setPreviewTime, setSelectedElementId],
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
			className="flex pointer-events-none sticky top-0 left-0 z-50 bg-neutral-800/70 border border-white/10 rounded-full mx-4 backdrop-blur-2xl border-r overflow-hidden"
			style={{
				paddingLeft: leftColumnWidth - 34,
			}}
		>
			<div
				ref={rulerContainerRef}
				className="overflow-hidden border-l border-white/10 flex-1"
			>
				<TimelineRuler
					scrollLeft={scrollLeft}
					ratio={ratio}
					width={rulerWidth}
					paddingLeft={16}
					// fps={60}
				/>
			</div>
		</div>
	);

	const timelineItems = useMemo(() => {
		// 使用 trackCount 计算容器高度，确保至少有 1 个轨道的高度
		const containerHeight = Math.max(trackCount, 1) * trackHeight;

		// 生成轨道背景
		const trackBackgrounds = [];
		for (let i = 0; i < trackCount; i++) {
			const trackIndex = trackCount - 1 - i;
			const isMainTrack = trackIndex === 0;
			trackBackgrounds.push(
				<div
					key={`bg-${trackIndex}`}
					className={`absolute left-0 right-0 ${
						isMainTrack
							? "bg-blue-500/5 border-b border-blue-500/20"
							: "border-b border-white/5"
					}`}
					style={{
						top: i * trackHeight,
						height: trackHeight,
					}}
				/>
			);
		}

		return (
			<div
				className="relative mt-1.5"
				style={{
					transform: `translateX(-${scrollLeft}px)`,
					height: containerHeight,
				}}
			>
				{/* 轨道背景 */}
				<div
					className="absolute inset-0 pointer-events-none"
					style={{ transform: `translateX(${scrollLeft}px)` }}
				>
					{trackBackgrounds}
				</div>
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
	}, [elements, scrollLeft, ratio, updateTimeRange, trackAssignments, trackCount, trackHeight]);

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
						isMainTrack
							? "text-blue-400"
							: "text-neutral-400"
					}`}
					style={{ height: trackHeight }}
				>
					{isMainTrack ? "主轨道" : `轨道 ${trackIndex}`}
				</div>
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
				style={{ left }}
			/>
		);
	}, [activeSnapPoint, ratio, scrollLeft]);
	// console.log("TimelineEditor", currentTime);

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
			<div className="relative w-full flex-1 min-h-0 flex -mt-18">
				{/* 左侧列，轨道标签 */}
				<div
					className="pt-12 text-white z-10 pr-4 flex flex-col"
					style={{ width: leftColumnWidth }}
				>
					{/* 占位区域（对应时间刻度尺高度） */}
					<div className="h-7 shrink-0" />
					{/* 轨道标签容器 */}
					<div className="flex-1 overflow-hidden">
						<div className="mt-1.5">
							{trackLabels}
						</div>
					</div>
				</div>
				<TimeIndicatorCanvas
					className="top-12"
					leftColumnWidth={leftColumnWidth}
					ratio={ratio}
					scrollLeft={scrollLeft}
				/>
				{/* 时间线容器，占满整个屏幕，左侧留出 padding 给 left column */}
				<div
					ref={containerRef}
					className="relative pt-19 w-full overflow-y-auto overflow-x-hidden h-full pb-16"
					style={{ paddingLeft: leftColumnWidth, marginLeft: -leftColumnWidth }}
					onMouseMove={handleMouseMove}
					onMouseLeave={handleMouseLeave}
					onClick={handleClick}
				>
					{snapIndicator}
					{timelineItems}
				</div>
			</div>
		</div>
	);
};

export default TimelineEditor;
