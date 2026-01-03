import Konva from "konva";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Rect as KonvaRect,
	Text as KonvaText,
	Layer,
	Stage,
} from "react-konva";
import { Canvas, Fill, Group as SkiaGroup } from "react-skia-lite";
import {
	Clip,
	converMetaLayoutToCanvasLayout,
	Group,
	Image,
	parseUnit,
	Timeline,
} from "@/dsl";
import { ICommonProps } from "@/dsl/types";

interface TimelineElement extends ICommonProps {
	type: "Group" | "Image" | "Clip";
	Component: React.ComponentType<any>;
}

const timeline = (
	<Timeline>
		<Group
			id="group1"
			name="group1"
			width={50}
			height={100}
			left={0}
			top={0}
		></Group>
		<Image
			id="image1"
			name="image1"
			width={100}
			height={50}
			left={50}
			top={50}
			src="https://via.placeholder.com/150"
		/>
		<Clip
			id="clip1"
			name="clip1"
			width={50}
			height={100}
			left={150}
			top={50}
		></Clip>
		<Image
			id="image2"
			name="image2"
			width={100}
			height={50}
			left={200}
			top={100}
			src="https://via.placeholder.com/150"
		/>
	</Timeline>
);

// 从 timeline JSX 中解析出初始状态
function parseTimeline(timelineElement: React.ReactElement): TimelineElement[] {
	const elements: TimelineElement[] = [];

	const children = (timelineElement.props as { children?: React.ReactNode })
		.children;

	React.Children.forEach(children, (child) => {
		if (React.isValidElement(child)) {
			const type = child.type as React.ComponentType;
			const props = child.props as ICommonProps;

			// 根据组件类型确定元素类型
			let elementType: "Group" | "Image" | "Clip";
			if (type === Group) {
				elementType = "Group";
			} else if (type === Image) {
				elementType = "Image";
			} else if (type === Clip) {
				elementType = "Clip";
			} else {
				return; // 跳过未知类型
			}

			// 提取 props
			const {
				id,
				name,
				width = 0,
				height = 0,
				left = 0,
				top = 0,
				...rest
			} = props;

			elements.push({
				id,
				name,
				type: elementType,
				Component: type,
				width,
				height,
				left,
				top,
				...rest,
			});
		}
	});

	return elements;
}

const Preview = () => {
	// 从 timeline JSX 中提取的初始状态
	const [elements, setElements] = useState<TimelineElement[]>(
		parseTimeline(timeline),
	);

	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const stageRef = useRef<Konva.Stage>(null);
	const timelineRef = useRef<React.ReactElement | null>(null);

	const canvasWidth = 600;
	const canvasHeight = 500;

	const handleDragStart = useCallback((id: string) => {
		setDraggingId(id);
	}, []);

	const handleDrag = useCallback(
		(id: string, e: Konva.KonvaEventObject<DragEvent>) => {
			const node = e.target;
			const newX = node.x();
			const newY = node.y();

			setElements((prev) =>
				prev.map((el) =>
					el.id === id ? { ...el, left: newX, top: newY } : el,
				),
			);
		},
		[],
	);

	const handleDragEnd = useCallback(
		(id: string, e: Konva.KonvaEventObject<DragEvent>) => {
			handleDrag(id, e);
			setDraggingId(null);
		},
		[handleDrag],
	);

	const handleMouseEnter = useCallback(
		(id: string) => {
			if (!draggingId) {
				setHoveredId(id);
			}
		},
		[draggingId],
	);

	const handleMouseLeave = useCallback(() => {
		if (!draggingId) {
			setHoveredId(null);
		}
	}, [draggingId]);

	// 根据更新后的状态动态生成 timeline JSX
	// 这个 timeline 可以根据需要用于渲染或导出
	const transformedTimeline = useMemo(() => {
		return (
			<Timeline>
				{elements.map(({ id, type, ...rest }) => {
					switch (type) {
						case "Group":
							// @ts-ignore
							return <Group key={id} {...rest} />;
						case "Image":
							// @ts-ignore
							return <Image key={id} {...rest} />;
						case "Clip":
							// @ts-ignore
							return <Clip key={id} {...rest} />;
						default:
							return null;
					}
				})}
			</Timeline>
		);
	}, [elements]);

	// 将更新后的 timeline 存储到 ref 中，便于外部访问
	useEffect(() => {
		timelineRef.current = transformedTimeline;
	}, [transformedTimeline]);

	return (
		<div className="preview-container" style={{ padding: "20px" }}>
			<h2>Timeline Preview</h2>
			<p style={{ marginBottom: "20px", color: "#666" }}>
				拖拽元素更新位置，timeline 会根据状态重新渲染
			</p>
			<div
				style={{
					position: "relative",
					width: canvasWidth,
					height: canvasHeight,
					border: "1px solid #ddd",
					borderRadius: "8px",
					overflow: "hidden",
					backgroundColor: "#f9fafb",
				}}
			>
				{/* 下层：Skia Canvas 渲染实际内容 */}
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						pointerEvents: "none",
					}}
				>
					<Canvas style={{ width: canvasWidth, height: canvasHeight }}>
						<Fill color="#f9fafb" />
						<SkiaGroup>
							{elements.map((el) => {
								const { x, y, width, height } =
									converMetaLayoutToCanvasLayout(el);
								return (
									<el.Component
										key={el.id}
										left={x}
										top={y}
										width={width}
										height={height}
										color={
											el.type === "Group"
												? "#3b82f6"
												: el.type === "Image"
													? "#10b981"
													: "#f59e0b"
										}
									/>
								);
							})}
						</SkiaGroup>
					</Canvas>
				</div>

				{/* 上层：Konva 交互层 */}
				<Stage
					ref={stageRef}
					width={canvasWidth}
					height={canvasHeight}
					style={{ position: "absolute", top: 0, left: 0 }}
				>
					<Layer>
						{elements.map((el) => {
							const isHovered = hoveredId === el.id;
							const isDragging = draggingId === el.id;

							const { x, y, width, height } =
								converMetaLayoutToCanvasLayout(el);

							return (
								<>
									{isHovered && (
										<KonvaText text={el.name} x={x - 2} y={y - 16} />
									)}
									<KonvaRect
										key={el.id}
										x={x}
										y={y}
										width={width}
										height={height}
										fill="transparent"
										stroke={isHovered || isDragging ? "#6366f1" : "transparent"}
										strokeWidth={isHovered || isDragging ? 3 : 0}
										dash={isHovered && !isDragging ? [5, 5] : undefined}
										draggable
										onDragStart={() => handleDragStart(el.id)}
										onDragMove={(e: Konva.KonvaEventObject<DragEvent>) =>
											handleDrag(el.id, e)
										}
										onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) =>
											handleDragEnd(el.id, e)
										}
										onMouseEnter={() => handleMouseEnter(el.id)}
										onMouseLeave={handleMouseLeave}
										cursor="move"
										shadowBlur={isDragging ? 10 : 0}
										shadowColor={isDragging ? "rgba(0,0,0,0.3)" : undefined}
										shadowOffsetX={isDragging ? 5 : 0}
										shadowOffsetY={isDragging ? 5 : 0}
									/>
								</>
							);
						})}
					</Layer>
				</Stage>
			</div>
		</div>
	);
};

export default Preview;
