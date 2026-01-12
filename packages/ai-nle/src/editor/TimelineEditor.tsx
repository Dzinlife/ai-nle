import React, {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import TimeIndicatorCanvas from "@/editor/TimeIndicatorCanvas";
import {
	useElements,
	usePlaybackControl,
	usePreviewTime,
	useTimelineStore,
} from "./TimelineContext";
import TimelineElement from "./TimelineElement";

const TimelineEditor = () => {
	const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
	const { setPreviewTime } = usePreviewTime();
	const { isPlaying } = usePlaybackControl();
	const { elements, setElements } = useElements();

	// 滚动位置状态
	const [scrollLeft, setScrollLeft] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollLeftRef = useRef(0);
	const touchStartXRef = useRef(0);

	// 左侧列宽度状态
	const [leftColumnWidth] = useState(176); // 默认 44 * 4 = 176px (w-44)

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

	// 点击时设置固定时间
	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
			const time = Math.max(0, (x - leftColumnWidth + scrollLeft) / ratio);
			setCurrentTime(time);
			setPreviewTime(null); // 清除预览时间
		},
		[ratio, scrollLeft, leftColumnWidth, setCurrentTime, setPreviewTime],
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

	const timeStamps = useMemo(() => {
		return (
			<div
				className="flex sticky top-0 z-10 bg-neutral-800/60 backdrop-blur-2xl"
				style={{
					transform: `translateX(-${scrollLeft}px)`,
				}}
			>
				{Array.from({ length: 100 }).map((_, index) => (
					<div
						key={index}
						className="flex items-center justify-center h-6 -translate-x-1/2 text-xs text-white shrink-0"
						style={{ left: index * ratio, width: ratio }}
					>
						{index}
					</div>
				))}
			</div>
		);
	}, [scrollLeft, ratio]);

	const timelineItems = useMemo(() => {
		return (
			<div
				className="relative pb-10 mt-1.5 box-content"
				style={{
					transform: `translateX(-${scrollLeft}px)`,
					height: 60 * elements.length,
				}}
			>
				{elements.map((element, i) => (
					<TimelineElement
						key={element.id}
						element={element}
						index={i}
						ratio={ratio}
						trackHeight={trackHeight}
						updateTimeRange={updateTimeRange}
					/>
				))}
			</div>
		);
	}, [elements, scrollLeft, ratio]);
	// console.log("TimelineEditor", currentTime);

	return (
		<div className="w-full h-full flex min-h-0 relative bg-neutral-800">
			{/* 左侧列，绝对定位覆盖在时间线上方 */}
			<div
				className="absolute top-0 left-0 h-full bg-neutral-800/80 text-white z-20 backdrop-blur-2xl border-r border-neutral-700"
				style={{ width: leftColumnWidth }}
			>
				left column
			</div>
			<TimeIndicatorCanvas
				leftColumnWidth={leftColumnWidth}
				ratio={ratio}
				scrollLeft={scrollLeft}
			/>
			{/* 时间线容器，占满整个屏幕，左侧留出 padding 给 left column */}
			<div
				ref={containerRef}
				className="relative w-full h-full overflow-y-auto overflow-x-hidden"
				style={{ paddingLeft: leftColumnWidth }}
				onMouseMove={handleMouseMove}
				onMouseLeave={handleMouseLeave}
				onClick={handleClick}
			>
				{timeStamps}
				{timelineItems}
			</div>
		</div>
	);
};

export default TimelineEditor;
