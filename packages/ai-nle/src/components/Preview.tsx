import Konva from "konva";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Rect as KonvaRect, Layer, Stage } from "react-konva";
import { Canvas, Fill, Group as SkiaGroup } from "react-skia-lite";
import {
	Clip,
	converMetaLayoutToCanvasLayout,
	Group,
	Image,
	Timeline,
} from "@/dsl";
import { ICommonProps } from "@/dsl/types";
import { usePreview } from "./PreviewProvider";

interface TimelineElement extends ICommonProps {
	__type: "Group" | "Image" | "Clip";
	__Component: React.ComponentType<any>;
}

const timeline = (
	<Timeline>
		<Group
			id="group1"
			name="group1group1group1group1"
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
			uri="/logo512.png"
		/>
		<Clip
			id="clip1"
			name="clip1"
			width={50}
			height={100}
			left={150}
			top={50}
			uri="/intro.mp4"
		/>
		<Image
			id="image2"
			name="image2"
			width={100}
			height={50}
			left={200}
			top={100}
			uri="/photo.jpeg"
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

			elements.push({
				...props,
				__type: elementType,
				__Component: type,
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

	const { pictureWidth, pictureHeight, canvasWidth, canvasHeight } =
		usePreview();

	const canvasConvertOptions = {
		picture: {
			width: pictureWidth,
			height: pictureHeight,
		},
		canvas: {
			width: canvasWidth,
			height: canvasHeight,
		},
	};

	const handleMouseDown = useCallback((id: string) => {
		setDraggingId(id);
	}, []);

	const handleMouseUp = useCallback(() => {
		setDraggingId(null);
	}, []);

	const handleDragStart = useCallback((id: string) => {
		setDraggingId(id);
		setHoveredId(id); // 拖拽开始时保持 hover 状态
	}, []);

	const handleDrag = useCallback(
		(id: string, e: Konva.KonvaEventObject<DragEvent>) => {
			const node = e.target;
			const canvasX = node.x();
			const canvasY = node.y();

			// 将 canvas 坐标转换为 picture 坐标
			const scaleX = canvasWidth / pictureWidth;
			const scaleY = canvasHeight / pictureHeight;
			const pictureX = canvasX / scaleX;
			const pictureY = canvasY / scaleY;

			setElements((prev) =>
				prev.map((el) =>
					el.id === id ? { ...el, left: pictureX, top: pictureY } : el,
				),
			);
		},
		[canvasWidth, canvasHeight, pictureWidth, pictureHeight],
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
				{elements.map(({ id, __type, ...rest }) => {
					switch (__type) {
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
								const { id, __type, __Component, ...rest } = el;

								const { x, y, width, height } = converMetaLayoutToCanvasLayout(
									el,
									canvasConvertOptions.picture,
									canvasConvertOptions.canvas,
								);
								return (
									<el.__Component
										key={id}
										{...rest}
										left={x}
										top={y}
										width={width}
										height={height}
										color={
											el.__type === "Group"
												? "#3b82f6"
												: el.__type === "Image"
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
					className="absolute top-0 left-0 mix-blend-hard-light"
				>
					<Layer>
						{elements.map((el) => {
							const isHovered = hoveredId === el.id;
							const isDragging = draggingId === el.id;

							const { x, y, width, height } = converMetaLayoutToCanvasLayout(
								el,
								canvasConvertOptions.picture,
								canvasConvertOptions.canvas,
							);

							return (
								<React.Fragment key={el.id}>
									<KonvaRect
										x={x}
										y={y}
										width={width}
										height={height}
										fill="transparent"
										stroke={
											isDragging
												? "rgba(255,255,255,0.5)"
												: isHovered
													? "rgba(255,255,255,0.5)"
													: "transparent"
										}
										strokeWidth={3}
									/>
									<KonvaRect
										x={x}
										y={y}
										width={width}
										height={height}
										fill="transparent"
										stroke={
											isDragging
												? "rgba(0,0,0,0.7)"
												: isHovered
													? "rgba(0,0,0,0.5)"
													: "transparent"
										}
										strokeWidth={1}
										draggable
										onMouseDown={() => handleMouseDown(el.id)}
										onMouseUp={handleMouseUp}
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
									/>
								</React.Fragment>
							);
						})}
					</Layer>
				</Stage>

				{/* DOM 文字标签层 */}
				<div
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: canvasWidth,
						height: canvasHeight,
						pointerEvents: "none",
					}}
				>
					{elements.map((el) => {
						const isHovered = hoveredId === el.id;
						if (!isHovered) return null;

						const { x, y, width } = converMetaLayoutToCanvasLayout(
							el,
							canvasConvertOptions.picture,
							canvasConvertOptions.canvas,
						);
						const center = x + width / 2;

						return (
							<div
								key={el.id}
								className="absolute text-black/60 bg-white/70 border border-black/10 max-w-32 truncate font-medium backdrop-blur-sm backdrop-saturate-150 px-3 py-1 -top-8 translate-x-[-50%] rounded-full text-xs whitespace-nowrap pointer-events-none"
								style={{
									left: center,
									top: y - 30,
								}}
							>
								{el.name}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
};

export default Preview;
