import React, {
	startTransition,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { parseStartEndSchema } from "@/dsl/startEndSchema";
import { EditorElement } from "@/dsl/types";
import { useTimeline } from "./TimelineContext";
import { testTimeline } from "./timeline";

// 从 timeline JSX 中解析出初始状态
function parseTimeline(timelineElement: React.ReactElement): EditorElement[] {
	const elements: EditorElement[] = [];

	const children = (timelineElement.props as { children?: React.ReactNode })
		.children;

	React.Children.forEach(children, (child) => {
		if (React.isValidElement(child)) {
			elements.push(child as EditorElement);
		}
	});

	return elements;
}

const TimelineEditor = () => {
	const { currentTime, setCurrentTime } = useTimeline();

	// 从 timeline JSX 中提取的初始状态
	const [elements, setElements] = useState<EditorElement[]>(
		parseTimeline(testTimeline),
	);

	// 滚动位置状态
	const [scrollLeft, setScrollLeft] = useState(0);
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollLeftRef = useRef(0);
	const touchStartXRef = useRef(0);

	// 左侧列宽度状态
	const [leftColumnWidth, setLeftColumnWidth] = useState(176); // 默认 44 * 4 = 176px (w-44)

	const ratio = 50;

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
			// 减去 leftColumnWidth 的 offset，得到相对于时间线内容区域的坐标
			const time = (x - leftColumnWidth + scrollLeft) / ratio;
			startTransition(() => {
				setCurrentTime(time);
			});
		},
		[ratio, scrollLeft, leftColumnWidth],
	);

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

	return (
		<div className="w-full h-full bg-neutral-100 flex-1 relative">
			{/* 左侧列，绝对定位覆盖在时间线上方 */}
			<div
				className="absolute top-0 left-0 h-full bg-neutral/50 z-10 backdrop-blur-2xl"
				style={{ width: leftColumnWidth }}
			>
				left column
			</div>
			{/* 时间线容器，占满整个屏幕，左侧留出 padding 给 left column */}
			<div
				ref={containerRef}
				className="relative w-full h-full overflow-hidden"
				style={{ paddingLeft: leftColumnWidth }}
				onMouseMove={handleMouseMove}
			>
				<div
					className="flex"
					style={{
						transform: `translateX(-${scrollLeft}px)`,
					}}
				>
					{Array.from({ length: 100 }).map((_, index) => (
						<div
							key={index}
							className="w-full h-10 bg-blue-200 shrink-0"
							style={{ left: index * ratio, width: ratio }}
						>
							{index}
						</div>
					))}
				</div>
				<div
					className="relative"
					style={{
						transform: `translateX(-${scrollLeft}px)`,
					}}
				>
					{elements.map((element, i) => {
						const { type, props } = element;

						const { start = 0, end = 1 } = props;

						const left = parseStartEndSchema(start) * ratio;
						const width =
							(parseStartEndSchema(end) - parseStartEndSchema(start)) * ratio;

						return (
							<div
								key={props.id}
								className="absolute bg-red-200 flex rounded-md "
								style={{
									left,
									width,
									top: i * 60,
									height: 54,
								}}
							>
								<div className="p-1 size-full">
									{type.timelineComponent ? (
										<div className="size-full">
											<type.timelineComponent key={props.id} {...props} />
										</div>
									) : (
										<div className="bg-red-200 rounded w-full">
											{type.displayName || type.name}
										</div>
									)}
								</div>
							</div>
						);
					})}
				</div>

				<div
					className="absolute top-0 left-0 w-full h-full bg-red-500 pointer-events-none"
					style={{
						transform: `translateX(${leftColumnWidth + currentTime * ratio - scrollLeft}px)`,
						width: 2,
						height: "100%",
					}}
				></div>
			</div>
		</div>
	);
};

export default TimelineEditor;
