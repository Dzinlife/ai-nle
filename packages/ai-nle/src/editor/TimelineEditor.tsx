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
import TimeIndicatorCanvas from "@/editor/components/TimeIndicatorCanvas";
import TimelineElement from "./components/TimelineElement";
import TimelineRuler from "./components/TimelineRuler";
import TimelineToolbar from "./components/TimelineToolbar";
import {
	useAutoScroll,
	useDragging,
	useElements,
	usePlaybackControl,
	usePreviewTime,
	useSelectedElement,
	useSnap,
	useTimelineStore,
	useTrackAssignments,
} from "./contexts/TimelineContext";
import { useDragStore } from "./drag";
import { DEFAULT_ELEMENT_HEIGHT } from "./timeline/trackConfig";

const TimelineEditor = () => {
	const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
	const scrollLeft = useTimelineStore((state) => state.scrollLeft);
	const setScrollLeft = useTimelineStore((state) => state.setScrollLeft);
	const { setPreviewTime } = usePreviewTime();
	const { isPlaying } = usePlaybackControl();
	const { elements, setElements } = useElements();
	const { setSelectedElementId } = useSelectedElement();
	const { activeSnapPoint } = useSnap();
	const { trackAssignments, trackCount } = useTrackAssignments();
	const { activeDropTarget, dragGhost } = useDragging();
	const { autoScrollSpeed, autoScrollSpeedY } = useAutoScroll();

	// 滚动位置 refs
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const verticalScrollRef = useRef<HTMLDivElement>(null);
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

	// 同步 scrollLeft 到全局拖拽 store
	const setTimelineScrollLeft = useDragStore(
		(state) => state.setTimelineScrollLeft,
	);
	useEffect(() => {
		setTimelineScrollLeft(scrollLeft);
	}, [scrollLeft, setTimelineScrollLeft]);

	// 全局拖拽 store 的自动滚动
	const globalAutoScrollSpeedX = useDragStore(
		(state) => state.autoScrollSpeedX,
	);
	const globalAutoScrollSpeedY = useDragStore(
		(state) => state.autoScrollSpeedY,
	);

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
		const scrollArea = scrollAreaRef.current;
		if (!scrollArea) return;

		const handleWheel = (e: WheelEvent) => {
			// 只在有水平滚动时才处理，垂直滚动不处理
			if (Math.abs(e.deltaX) > 0) {
				// 阻止水平滚动事件的默认行为，防止触发窗口滚动
				e.preventDefault();
				e.stopPropagation();

				// 修复方向：向右滚动（deltaX > 0）应该增加 scrollLeft
				const currentScrollLeft = useTimelineStore.getState().scrollLeft;
				const newScrollLeft = Math.max(0, currentScrollLeft + e.deltaX);
				setScrollLeft(newScrollLeft);
			}
			// 如果是纯垂直滚动（只有 deltaY），不阻止默认行为，让页面正常滚动
		};

		// 阻止触摸手势（防止后退）
		const handleTouchStart = (e: TouchEvent) => {
			if (e.touches.length === 1) {
				const touch = e.touches[0];
				const rect = scrollArea.getBoundingClientRect();
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
		scrollArea.addEventListener("wheel", handleWheel, { passive: false });
		scrollArea.addEventListener("touchstart", handleTouchStart, {
			passive: false,
		});
		scrollArea.addEventListener("touchmove", handleTouchMove, {
			passive: false,
		});

		return () => {
			scrollArea.removeEventListener("wheel", handleWheel);
			scrollArea.removeEventListener("touchstart", handleTouchStart);
			scrollArea.removeEventListener("touchmove", handleTouchMove);
		};
	}, []);

	// 自动滚动效果（拖拽到边缘时触发）
	useEffect(() => {
		if (autoScrollSpeed === 0) return;

		let animationFrameId: number;

		const animate = () => {
			const currentScrollLeft = useTimelineStore.getState().scrollLeft;
			const newScrollLeft = Math.max(0, currentScrollLeft + autoScrollSpeed);
			setScrollLeft(newScrollLeft);
			animationFrameId = requestAnimationFrame(animate);
		};

		animationFrameId = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, [autoScrollSpeed, setScrollLeft]);

	// 垂直自动滚动效果（拖拽到上下边缘时触发）
	useEffect(() => {
		if (autoScrollSpeedY === 0) return;

		const scrollContainer = verticalScrollRef.current;
		if (!scrollContainer) return;

		let animationFrameId: number;

		const animate = () => {
			const currentScrollTop = scrollContainer.scrollTop;
			const maxScrollTop =
				scrollContainer.scrollHeight - scrollContainer.clientHeight;
			const newScrollTop = Math.max(
				0,
				Math.min(maxScrollTop, currentScrollTop + autoScrollSpeedY),
			);
			scrollContainer.scrollTop = newScrollTop;
			animationFrameId = requestAnimationFrame(animate);
		};

		animationFrameId = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, [autoScrollSpeedY]);

	// 素材库拖拽时的水平自动滚动
	useEffect(() => {
		if (globalAutoScrollSpeedX === 0) return;

		let animationFrameId: number;

		const animate = () => {
			const currentScrollLeft = useTimelineStore.getState().scrollLeft;
			const newScrollLeft = Math.max(
				0,
				currentScrollLeft + globalAutoScrollSpeedX,
			);
			setScrollLeft(newScrollLeft);
			animationFrameId = requestAnimationFrame(animate);
		};

		animationFrameId = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, [globalAutoScrollSpeedX, setScrollLeft]);

	// 素材库拖拽时的垂直自动滚动
	useEffect(() => {
		if (globalAutoScrollSpeedY === 0) return;

		const scrollContainer = verticalScrollRef.current;
		if (!scrollContainer) return;

		let animationFrameId: number;

		const animate = () => {
			const currentScrollTop = scrollContainer.scrollTop;
			const maxScrollTop =
				scrollContainer.scrollHeight - scrollContainer.clientHeight;
			const newScrollTop = Math.max(
				0,
				Math.min(maxScrollTop, currentScrollTop + globalAutoScrollSpeedY),
			);
			scrollContainer.scrollTop = newScrollTop;
			animationFrameId = requestAnimationFrame(animate);
		};

		animationFrameId = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(animationFrameId);
		};
	}, [globalAutoScrollSpeedY]);

	const trackHeight = 60;

	const timeStamps = useMemo(() => {
		return (
			<div
				key="time-stamps"
				className="sticky top-0 left-0 z-60"
				onMouseMove={handleMouseMove}
				onClick={handleClick}
			>
				<div
					className="bg-neutral-800/10 border border-white/10 rounded-full mx-4 backdrop-blur-2xl border-r overflow-hidden"
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
			</div>
		);
	}, [
		handleMouseMove,
		handleClick,
		leftColumnWidth,
		scrollLeft,
		ratio,
		rulerWidth,
		timelinePaddingLeft,
	]);

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

	// 吸附指示线
	const snapIndicator = useMemo(() => {
		if (!activeSnapPoint || otherTrackCount === 0) return null;
		const left = activeSnapPoint.time * ratio - scrollLeft;
		return (
			<div
				className="absolute top-12 bottom-0 w-0.5 bg-green-500 pointer-events-none"
				style={{ left: left + timelinePaddingLeft }}
			/>
		);
	}, [
		activeSnapPoint,
		ratio,
		scrollLeft,
		otherTrackCount,
		timelinePaddingLeft,
	]);

	// 拖拽目标指示器（渲染到 body，跨区域显示）
	const dropIndicatorPortal = useMemo(() => {
		if (!activeDropTarget) return null;

		const elementWidth =
			(activeDropTarget.end - activeDropTarget.start) * ratio;

		// 查找目标区域的 DOM 元素来计算屏幕坐标
		let targetZone: HTMLElement | null = null;
		let screenX = 0;
		let screenY = 0;

		if (activeDropTarget.finalTrackIndex === 0) {
			// 主轨道
			targetZone = document.querySelector<HTMLElement>(
				'[data-track-drop-zone="main"]',
			);
			if (targetZone) {
				const contentArea = targetZone.querySelector<HTMLElement>(
					'[data-track-content-area="main"]',
				);
				if (contentArea) {
					const contentRect = contentArea.getBoundingClientRect();
					// 计算屏幕坐标
					screenX =
						contentRect.left + activeDropTarget.start * ratio - scrollLeft;
					screenY = contentRect.top;
				}
			}
		} else {
			// 其他轨道
			targetZone = document.querySelector<HTMLElement>(
				'[data-track-drop-zone="other"]',
			);
			if (targetZone) {
				const contentArea = targetZone.querySelector<HTMLElement>(
					'[data-track-content-area="other"]',
				);
				if (contentArea) {
					const contentRect = contentArea.getBoundingClientRect();

					if (activeDropTarget.type === "gap") {
						// gap 模式 - 显示水平线
						const gapY =
							(otherTrackCount - activeDropTarget.trackIndex + 1) * trackHeight;
						screenX = contentRect.left;
						screenY = contentRect.top + gapY - 2;

						const indicator = (
							<div
								className="fixed h-1 bg-green-500 z-[9998] pointer-events-none rounded-full shadow-lg shadow-green-500/50"
								style={{
									left: screenX,
									top: screenY,
									width: contentRect.width,
								}}
							/>
						);
						return createPortal(indicator, document.body);
					}

					// track 模式
					const trackY =
						(otherTrackCount - activeDropTarget.finalTrackIndex) * trackHeight;
					screenX =
						contentRect.left + activeDropTarget.start * ratio - scrollLeft;
					screenY = contentRect.top + trackY;
				}
			}
		}

		if (!targetZone) return null;

		const indicator = (
			<div
				className="fixed bg-blue-500/20 border-2 border-blue-500 border-dashed z-9998 pointer-events-none rounded-md box-border"
				style={{
					left: screenX,
					top: screenY,
					width: elementWidth,
					height: DEFAULT_ELEMENT_HEIGHT,
				}}
			/>
		);

		return createPortal(indicator, document.body);
	}, [activeDropTarget, ratio, scrollLeft, otherTrackCount, trackHeight]);

	// 拖拽 Ghost 元素（使用 Portal 渲染到 body）
	const ghostElement = useMemo(() => {
		if (!dragGhost) return null;

		const ghost = (
			<div
				className="fixed pointer-events-none"
				style={{
					left: dragGhost.screenX,
					top: dragGhost.screenY,
					width: dragGhost.width,
					height: dragGhost.height,
					zIndex: 9999,
				}}
			>
				{/* 半透明的元素克隆 */}
				<div
					className="absolute inset-0 opacity-60"
					dangerouslySetInnerHTML={{ __html: dragGhost.clonedHtml }}
				/>
				{/* 蓝色实线边框指示器 */}
				<div className="absolute inset-0 border-2 border-blue-500 rounded-md shadow-lg shadow-blue-500/30" />
			</div>
		);

		return createPortal(ghost, document.body);
	}, [dragGhost]);

	return (
		<div className="relative bg-neutral-800 h-full flex flex-col min-h-0 w-full overflow-hidden">
			<div className="pointer-events-none absolute top-0 left-0 w-full h-19 z-50 bg-linear-to-b from-neutral-800 via-neutral-800 via-70% to-transparent"></div>
			<ProgressiveBlur
				position="top"
				className="absolute top-0 w-full h-20 z-60 "
				blurLevels={[0.5, 4, 16, 16, 16, 16, 16, 16]}
			/>
			<TimelineToolbar className="h-12 z-60" />
			{timeStamps}
			<div
				ref={scrollAreaRef}
				data-timeline-scroll-area
				className="relative w-full flex-1 min-h-0 flex flex-col -mt-18 overflow-hidden"
				onMouseMove={handleMouseMove}
				onClick={handleClick}
			>
				<div
					className="h-full w-full absolute top-0 left-0 pointer-events-none z-60"
					style={{ marginLeft: leftColumnWidth }}
				>
					<TimeIndicatorCanvas
						className="top-12 z-50"
						leftOffset={timelinePaddingLeft}
						ratio={ratio}
						scrollLeft={scrollLeft}
					/>
				</div>
				<div
					className="h-full w-full absolute top-0 left-0 pointer-events-none z-50"
					style={{ marginLeft: leftColumnWidth }}
				>
					{snapIndicator}
				</div>

				{/* 轨道区域（可滚动） */}
				<div
					ref={verticalScrollRef}
					data-vertical-scroll-area
					className="flex flex-col pt-18 w-full flex-1 min-h-0 overflow-y-auto"
				>
					{/* 其他轨道区域 */}
					<div className="flex w-full flex-1">
						{/* 左侧列，其他轨道标签 */}
						<div
							className="text-white z-10 pr-4 flex flex-col bg-neutral-800/80 backdrop-blur-3xl backdrop-saturate-150 border-r border-white/10 pt-10 -mt-10 sticky top-0"
							style={{ width: leftColumnWidth }}
						>
							<div className="flex-1 flex flex-col justify-end">
								<div className="mt-1.5">{otherTrackLabels}</div>
							</div>
						</div>
						{/* 右侧其他轨道时间线内容 */}
						<div
							ref={containerRef}
							data-track-drop-zone="other"
							data-track-count={otherTrackCount}
							data-track-height={trackHeight}
							className="relative flex-1 overflow-x-hidden pt-1.5 flex flex-col justify-end"
							onMouseLeave={handleMouseLeave}
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
									{otherTimelineItems}
								</div>
							</div>
						</div>
					</div>
					{/* 主轨道区域（sticky 底部） */}
					<div className="z-10 flex items-start w-full shrink-0 border-t border-b border-white/10 sticky bottom-0 mt-auto *:pt-1.5">
						{/* 左侧主轨道标签 */}
						<div
							className="text-white z-10 pr-4 flex flex-col bg-neutral-900/90 backdrop-blur-2xl border-r border-white/10"
							style={{ width: leftColumnWidth }}
						>
							{mainTrackLabel}
						</div>
						{/* 右侧主轨道时间线内容 */}
						<div
							data-track-drop-zone="main"
							data-track-index="0"
							className="relative flex-1 overflow-x-hidden bg-neutral-900/90 backdrop-blur-2xl"
							onMouseMove={handleMouseMove}
							onMouseLeave={handleMouseLeave}
							onClick={handleClick}
							style={{
								paddingLeft: leftColumnWidth,
								marginLeft: -leftColumnWidth,
							}}
						>
							<div style={{ paddingLeft: timelinePaddingLeft }}>
								<div className="relative" data-track-content-area="main">
									{mainTimelineItems}
								</div>
							</div>
						</div>
					</div>
					{/* 音频轨道区域 */}
					<div className="min-h-12">
						{/* 左侧音频轨道标签 */}
						<div
							className="h-full text-white pr-4 flex flex-col bg-neutral-800/80 backdrop-blur-3xl backdrop-saturate-150 border-r border-white/10"
							style={{ width: leftColumnWidth }}
						>
							<div className="h-12 flex items-center justify-end pr-3 text-xs font-medium text-neutral-400">
								音频轨道
							</div>
						</div>
						{/* TODO: 右侧音频轨道时间线内容 */}
					</div>
				</div>
				{/* 拖拽 Ghost 层 */}
				{ghostElement}
				{dropIndicatorPortal}
			</div>
		</div>
	);
};

export default TimelineEditor;
