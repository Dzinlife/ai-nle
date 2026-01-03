import Konva from "konva";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Rect as KonvaRect, Layer, Stage, Transformer } from "react-konva";
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
	rotation?: number;
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
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [selectionRect, setSelectionRect] = useState({
		visible: false,
		x1: 0,
		y1: 0,
		x2: 0,
		y2: 0,
	});
	const stageRef = useRef<Konva.Stage>(null);
	const transformerRef = useRef<Konva.Transformer>(null);
	const timelineRef = useRef<React.ReactElement | null>(null);
	const isSelecting = useRef(false);

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

	// 更新 Transformer 的节点
	useEffect(() => {
		if (!transformerRef.current) return;

		const stage = transformerRef.current.getStage();
		if (!stage) return;

		const nodes = selectedIds
			.map((id) => {
				return stage.findOne(`.element-${id}`);
			})
			.filter((node) => node !== undefined);

		transformerRef.current.nodes(nodes);
	}, [selectedIds]);

	// 处理 transform 事件（实时更新）
	const handleTransform = useCallback(
		(id: string, e: Konva.KonvaEventObject<Event>) => {
			const node = e.target as Konva.Node;
			const scaleX = node.scaleX();
			const scaleY = node.scaleY();

			// 如果 scale 为 1，说明没有缩放，不需要更新
			if (scaleX === 1 && scaleY === 1) {
				return;
			}

			const canvasX = node.x();
			const canvasY = node.y();
			const canvasWidth_scaled = node.width() * scaleX;
			const canvasHeight_scaled = node.height() * scaleY;

			// 将 canvas 坐标转换为 picture 坐标
			const scaleX_ratio = canvasWidth / pictureWidth;
			const scaleY_ratio = canvasHeight / pictureHeight;
			const pictureX = canvasX / scaleX_ratio;
			const pictureY = canvasY / scaleY_ratio;
			const pictureWidth_scaled = canvasWidth_scaled / scaleX_ratio;
			const pictureHeight_scaled = canvasHeight_scaled / scaleY_ratio;

			// 只更新元素状态，不修改节点（让 Transformer 继续工作）
			// 这样底层 Skia Canvas 会实时更新显示
			const rotationDegrees = node.rotation(); // Konva 返回的是度数
			// 将度数转换为弧度保存（parseRotate 会将 "45deg" 转换为弧度）
			const rotationRadians = (rotationDegrees * Math.PI) / 180;
			setElements((prev) =>
				prev.map((el) =>
					el.id === id
						? {
								...el,
								left: pictureX,
								top: pictureY,
								width: pictureWidth_scaled,
								height: pictureHeight_scaled,
								rotate: `${rotationDegrees}deg`,
								rotation: rotationRadians,
							}
						: el,
				),
			);
		},
		[canvasWidth, canvasHeight, pictureWidth, pictureHeight],
	);

	// 处理 transform 结束事件
	const handleTransformEnd = useCallback(
		(id: string, e: Konva.KonvaEventObject<Event>) => {
			const node = e.target as Konva.Node;
			const scaleX = node.scaleX();
			const scaleY = node.scaleY();

			// 重置 scale，更新 width 和 height
			node.scaleX(1);
			node.scaleY(1);

			const canvasX = node.x();
			const canvasY = node.y();
			const canvasWidth_scaled = node.width() * scaleX;
			const canvasHeight_scaled = node.height() * scaleY;

			// 将 canvas 坐标转换为 picture 坐标（与 handleDrag 使用相同的转换逻辑）
			const scaleX_ratio = canvasWidth / pictureWidth;
			const scaleY_ratio = canvasHeight / pictureHeight;
			const pictureX = canvasX / scaleX_ratio;
			const pictureY = canvasY / scaleY_ratio;
			const pictureWidth_scaled = canvasWidth_scaled / scaleX_ratio;
			const pictureHeight_scaled = canvasHeight_scaled / scaleY_ratio;

			// 更新节点的 width 和 height
			node.width(canvasWidth_scaled);
			node.height(canvasHeight_scaled);

			const rotationDegrees = node.rotation(); // Konva 返回的是度数
			// 将度数转换为弧度保存（parseRotate 会将 "45deg" 转换为弧度）
			const rotationRadians = (rotationDegrees * Math.PI) / 180;
			setElements((prev) =>
				prev.map((el) =>
					el.id === id
						? {
								...el,
								left: pictureX,
								top: pictureY,
								width: pictureWidth_scaled,
								height: pictureHeight_scaled,
								rotate: `${rotationDegrees}deg`,
								rotation: rotationRadians,
							}
						: el,
				),
			);
		},
		[canvasWidth, canvasHeight, pictureWidth, pictureHeight],
	);

	// 处理点击事件，支持选择/取消选择
	const handleStageClick = useCallback(
		(e: Konva.KonvaEventObject<MouseEvent>) => {
			// 如果正在使用选择框，不处理点击
			if (
				selectionRect.visible &&
				selectionRect.x2 !== selectionRect.x1 &&
				selectionRect.y2 !== selectionRect.y1
			) {
				return;
			}

			// 点击空白区域，取消选择
			if (e.target === e.target.getStage()) {
				setSelectedIds([]);
				return;
			}

			// 检查是否点击了元素
			const clickedId = (e.target as Konva.Node).attrs["data-id"];
			if (!clickedId) {
				return;
			}

			// 检查是否按下了 Shift 或 Ctrl/Cmd
			const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
			const isSelected = selectedIds.includes(clickedId);

			if (!metaPressed && !isSelected) {
				// 没有按修饰键且元素未选中，只选择这一个
				setSelectedIds([clickedId]);
			} else if (metaPressed && isSelected) {
				// 按了修饰键且元素已选中，从选择中移除
				setSelectedIds((prev) => prev.filter((id) => id !== clickedId));
			} else if (metaPressed && !isSelected) {
				// 按了修饰键且元素未选中，添加到选择
				setSelectedIds((prev) => [...prev, clickedId]);
			}
		},
		[selectedIds, selectionRect],
	);

	// 处理鼠标按下，开始选择框
	const handleStageMouseDown = useCallback(
		(e: Konva.KonvaEventObject<MouseEvent>) => {
			// 如果点击的不是 stage，不处理
			if (e.target !== e.target.getStage()) {
				return;
			}

			const pos = e.target.getStage().getPointerPosition();
			if (!pos) return;

			isSelecting.current = true;
			setSelectionRect({
				visible: true,
				x1: pos.x,
				y1: pos.y,
				x2: pos.x,
				y2: pos.y,
			});
		},
		[],
	);

	// 处理鼠标移动，更新选择框
	const handleStageMouseMove = useCallback(
		(e: Konva.KonvaEventObject<MouseEvent>) => {
			if (!isSelecting.current) {
				return;
			}

			const pos = e.target.getStage()?.getPointerPosition();
			if (!pos) return;

			setSelectionRect((prev) => ({
				...prev,
				x2: pos.x,
				y2: pos.y,
			}));
		},
		[],
	);

	// 处理鼠标抬起，完成选择框
	const handleStageMouseUp = useCallback(() => {
		if (!isSelecting.current) {
			return;
		}

		isSelecting.current = false;

		// 延迟隐藏选择框，以便点击事件可以检查
		setTimeout(() => {
			setSelectionRect((prev) => ({ ...prev, visible: false }));
		}, 0);

		// 计算选择框区域
		const selBox = {
			x: Math.min(selectionRect.x1, selectionRect.x2),
			y: Math.min(selectionRect.y1, selectionRect.y2),
			width: Math.abs(selectionRect.x2 - selectionRect.x1),
			height: Math.abs(selectionRect.y2 - selectionRect.y1),
		};

		// 查找与选择框相交的元素
		if (!stageRef.current) return;

		const selected: string[] = [];
		elements.forEach((el) => {
			const { x, y, width, height } = converMetaLayoutToCanvasLayout(
				el,
				canvasConvertOptions.picture,
				canvasConvertOptions.canvas,
			);

			const elBox = {
				x,
				y,
				width,
				height,
			};

			// 检查是否相交
			if (
				selBox.x < elBox.x + elBox.width &&
				selBox.x + selBox.width > elBox.x &&
				selBox.y < elBox.y + elBox.height &&
				selBox.y + selBox.height > elBox.y
			) {
				selected.push(el.id);
			}
		});

		setSelectedIds(selected);
	}, [selectionRect, elements, canvasConvertOptions]);

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
					onClick={handleStageClick}
					onMouseDown={handleStageMouseDown}
					onMouseMove={handleStageMouseMove}
					onMouseUp={handleStageMouseUp}
				>
					<Layer>
						{elements.map((el) => {
							const isHovered = hoveredId === el.id;
							const isDragging = draggingId === el.id;
							const isSelected = selectedIds.includes(el.id);

							const { x, y, width, height, rotation } =
								converMetaLayoutToCanvasLayout(
									el,
									canvasConvertOptions.picture,
									canvasConvertOptions.canvas,
								);

							// 将弧度转换为度数（Konva 使用度数）
							const rotationDegrees = (rotation * 180) / Math.PI;

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
										rotation={rotationDegrees}
									/>
									<KonvaRect
										x={x}
										y={y}
										width={width}
										height={height}
										fill="transparent"
										stroke={
											isSelected
												? "rgba(59, 130, 246, 0.8)"
												: isDragging
													? "rgba(0,0,0,0.7)"
													: isHovered
														? "rgba(0,0,0,0.5)"
														: "transparent"
										}
										strokeWidth={isSelected ? 2 : 1}
										draggable
										data-id={el.id}
										name={`element-${el.id}`}
										rotation={rotationDegrees}
										onMouseDown={() => handleMouseDown(el.id)}
										onMouseUp={handleMouseUp}
										onDragStart={() => handleDragStart(el.id)}
										onDragMove={(e: Konva.KonvaEventObject<DragEvent>) =>
											handleDrag(el.id, e)
										}
										onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) =>
											handleDragEnd(el.id, e)
										}
										onTransform={(e: Konva.KonvaEventObject<Event>) =>
											handleTransform(el.id, e)
										}
										onTransformEnd={(e: Konva.KonvaEventObject<Event>) =>
											handleTransformEnd(el.id, e)
										}
										onMouseEnter={() => handleMouseEnter(el.id)}
										onMouseLeave={handleMouseLeave}
										cursor={isSelected ? "default" : "move"}
									/>
								</React.Fragment>
							);
						})}
						{/* Transformer 用于缩放和旋转 */}
						<Transformer
							ref={transformerRef}
							boundBoxFunc={(oldBox, newBox) => {
								// 限制最小尺寸
								if (newBox.width < 5 || newBox.height < 5) {
									return oldBox;
								}
								return newBox;
							}}
						/>
						{/* 选择框 */}
						{selectionRect.visible && (
							<KonvaRect
								x={Math.min(selectionRect.x1, selectionRect.x2)}
								y={Math.min(selectionRect.y1, selectionRect.y2)}
								width={Math.abs(selectionRect.x2 - selectionRect.x1)}
								height={Math.abs(selectionRect.y2 - selectionRect.y1)}
								fill="rgba(59, 130, 246, 0.1)"
								stroke="rgba(59, 130, 246, 0.8)"
								strokeWidth={1}
							/>
						)}
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
