import { usePinch } from "@use-gesture/react";
import Konva from "konva";
import React, {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Rect as KonvaRect, Layer, Stage, Transformer } from "react-konva";
import {
	Canvas,
	CanvasRef,
	Fill,
	ImageFormat,
	Group as SkiaGroup,
	useContextBridge,
} from "react-skia-lite";
import { converMetaLayoutToCanvasLayout } from "@/dsl";
import { parseStartEndSchema } from "@/dsl/startEndSchema";
import { EditorElement } from "@/dsl/types";
import { renderElementsOffscreenAsImage } from "../utils/offscreen";
import { usePreview } from "./PreviewProvider";
import { TimelineContext, useTimeline } from "./TimelineContext";
import { testTimeline } from "./timeline";

// LabelLayer 组件：从 Konva 节点获取实际位置来显示 label
interface LabelLayerProps {
	elements: EditorElement[];
	hoveredId: string | null;
	selectedIds: string[];
	stageRef: React.RefObject<Konva.Stage | null>;
	canvasConvertOptions: {
		picture: { width: number; height: number };
		canvas: { width: number; height: number };
	};
}

const LabelLayer: React.FC<LabelLayerProps> = ({
	elements,
	hoveredId,
	selectedIds,
	stageRef,
	canvasConvertOptions,
}) => {
	const [labelPositions, setLabelPositions] = useState<
		Record<
			string,
			{ x: number; y: number; rotation: number; height: number; width: number }
		>
	>({});

	// 更新 label 位置的函数
	const updateLabelPositions = useCallback(() => {
		// if (!stageRef.current || !hoveredId) {
		// 	setLabelPositions({});
		// 	return;
		// }

		const stage = stageRef.current;
		const positions: Record<
			string,
			{ x: number; y: number; rotation: number; height: number; width: number }
		> = {};

		elements.forEach((el) => {
			if (!selectedIds.length) return;

			if (!selectedIds.includes(el.props.id)) return;

			const node = stage?.findOne(`.element-${el.props.id}`) as
				| Konva.Node
				| undefined;
			if (!node) {
				// 如果找不到节点，使用 layout 计算的位置
				const { x, y, width, height } = converMetaLayoutToCanvasLayout(
					el.props,
					canvasConvertOptions.picture,
					canvasConvertOptions.canvas,
				);
				positions[el.props.id] = {
					x: x + width / 2,
					y: y + height / 2,
					rotation: 0,
					height: height,
					width: width,
				};
				return;
			}

			// 从 Konva 节点获取实际位置和尺寸
			const x = node.x();
			const y = node.y();
			const width = node.width() * node.scaleX();
			const height = node.height() * node.scaleY();
			const rotation = node.rotation(); // 度数

			// 获取 offset（如果没有设置，默认为 0, 0，即左上角）
			const offsetX = node.offsetX() || 0;
			const offsetY = node.offsetY() || 0;

			// 计算旋转中心点（offset 点）
			const rotationCenterX = x + offsetX;
			const rotationCenterY = y + offsetY;

			// 计算未旋转时中心点相对于旋转中心的偏移
			const centerOffsetX = width / 2 - offsetX;
			const centerOffsetY = height / 2 - offsetY;

			// 将偏移转换为弧度
			const rotationRad = (rotation * Math.PI) / 180;

			// 计算旋转后的中心点位置
			const cos = Math.cos(rotationRad);
			const sin = Math.sin(rotationRad);
			const rotatedCenterX =
				rotationCenterX + centerOffsetX * cos - centerOffsetY * sin;
			const rotatedCenterY =
				rotationCenterY + centerOffsetX * sin + centerOffsetY * cos;

			positions[el.props.id] = {
				x: rotatedCenterX,
				y: rotatedCenterY,
				height: height,
				width: width,
				rotation: rotation,
			};
		});

		setLabelPositions(positions);
	}, [elements, hoveredId, stageRef, canvasConvertOptions]);

	// 初始更新和 hover 变化时更新
	useEffect(() => {
		updateLabelPositions();
	}, [updateLabelPositions]);

	const canvasWidth = canvasConvertOptions.canvas.width;
	const canvasHeight = canvasConvertOptions.canvas.height;

	return (
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
				// const isHovered = hoveredId === el.id;
				// if (!isHovered) return null;

				const position = labelPositions[el.props.id];
				if (!position) return null;

				let translateY = 0;

				if (
					Math.abs(position.rotation % 180) > 45 &&
					Math.abs(position.rotation % 180) < 135
				)
					translateY = position.width / 2 + 20;
				else {
					translateY = position.height / 2 + 20;
				}

				let normalizedRotation = position.rotation % 90;

				if (position.rotation % 90 > 45) {
					normalizedRotation -= 90 * Math.ceil(normalizedRotation / 90);
				} else if (position.rotation % 90 < -45) {
					normalizedRotation -= 90 * Math.floor(normalizedRotation / 90);
				}

				return (
					<>
						<div
							key={el.props.id}
							className="absolute text-red-500 bg-black/80 border border-red-500/70 max-w-32 truncate font-medium backdrop-blur-sm backdrop-saturate-150 px-3 py-1 -top-8 rounded-full text-xs whitespace-nowrap pointer-events-none"
							style={{
								left: position.x,
								top: position.y,
								transform: `translate(-50%, -50%) rotate(${normalizedRotation}deg) translateY(${translateY}px)`,
							}}
						>
							{Math.round(position.width)} &times; {Math.round(position.height)}
						</div>
					</>
				);
			})}
		</div>
	);
};

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

const Preview = () => {
	// 从 timeline JSX 中提取的初始状态
	const [elements, setElements] = useState<EditorElement[]>(
		parseTimeline(testTimeline),
	);

	const { currentTime: _currentTime } = useTimeline();

	const currentTime = useDeferredValue(_currentTime);

	const [renderElements, setRenderElements] = useState<EditorElement[]>([]);

	useEffect(() => {
		setRenderElements((prev) => {
			let dirty = false;

			let index = 0;

			const newElements = elements
				.map((el) => {
					const { start = 0, end = Infinity } = el.props;

					const visible =
						currentTime >= parseStartEndSchema(start) &&
						currentTime < parseStartEndSchema(end)
							? true
							: false;

					if (!visible) return null;

					if (!dirty || prev[index++] !== el) {
						dirty = true;
					}

					return el;
				})
				.filter((el) => el !== null);

			return dirty ? newElements : elements;
		});
	}, [elements, currentTime]);

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
					el.props.id === id
						? { ...el, props: { ...el.props, left: pictureX, top: pictureY } }
						: el,
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

	// 当 renderElements 变化时，清理已消失元素的选中状态
	useEffect(() => {
		setSelectedIds((prevSelectedIds) => {
			const renderElementIds = new Set(renderElements.map((el) => el.props.id));
			const validSelectedIds = prevSelectedIds.filter((id) =>
				renderElementIds.has(id),
			);

			// 如果有元素被移除，返回新的数组；否则返回原数组以保持引用稳定
			return validSelectedIds.length !== prevSelectedIds.length
				? validSelectedIds
				: prevSelectedIds;
		});
	}, [renderElements]);

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
					el.props.id === id
						? {
								...el,
								props: {
									...el.props,
									left: pictureX,
									top: pictureY,
									width: pictureWidth_scaled,
									height: pictureHeight_scaled,
									rotate: `${rotationDegrees}deg`,
									rotation: rotationRadians,
								},
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
					el.props.id === id
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
		renderElements.forEach((el) => {
			const { x, y, width, height } = converMetaLayoutToCanvasLayout(
				el.props,
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
				selected.push(el.props.id);
			}
		});

		setSelectedIds(selected);
	}, [selectionRect, renderElements, canvasConvertOptions]);

	const {
		zoomLevel,
		isDraggingZoom,
		tempZoomLevel,
		startZoomDrag,
		updateZoomDrag,
		endZoomDrag,
		zoomTransform,
	} = usePreview();

	const ContextBridge = useContextBridge(TimelineContext);

	const skiaCanvasRef = useRef<CanvasRef>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const skiaCanvas = useMemo(() => {
		return (
			<Canvas
				style={{
					width: canvasWidth,
					height: canvasHeight,
					overflow: "hidden", // 必须要设置 overflow: "hidden"，否则高度无法缩小，原因未知
				}}
				ref={skiaCanvasRef}
			>
				<ContextBridge>
					<Fill color="black" />
					{renderElements.map((el) => {
						const { x, y, width, height, rotate } =
							converMetaLayoutToCanvasLayout(
								el.props,
								canvasConvertOptions.picture,
								canvasConvertOptions.canvas,
							);

						return (
							<SkiaGroup key={el.props.id}>
								<el.type
									{...el.props}
									__renderLayout={{ x, y, w: width, h: height, r: rotate }}
								/>
							</SkiaGroup>
						);
					})}
				</ContextBridge>
			</Canvas>
		);
	}, [renderElements, canvasWidth, canvasHeight, canvasConvertOptions]);

	const handleDownload = useCallback(() => {
		const image = skiaCanvasRef.current?.makeImageSnapshot();
		if (!image) {
			console.error("Failed to create image snapshot");
			return;
		}

		try {
			// 将 SkImage 编码为 JPEG
			const buffer = image.encodeToBytes(ImageFormat.JPEG, 90);

			// 创建新的 Uint8Array 副本以确保使用 ArrayBuffer（而非 SharedArrayBuffer）
			const arrayBuffer = new Uint8Array(buffer).buffer;
			const blob = new Blob([arrayBuffer], { type: "image/jpeg" });

			// 创建下载链接
			const link = document.createElement("a");
			const url = URL.createObjectURL(blob);
			link.href = url;
			link.download = `canvas-${Date.now()}.jpeg`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			// 清理对象 URL 以释放内存
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Failed to download image:", error);
		}
	}, []);

	const handleDownloadWithoutBackground = useCallback(async () => {
		try {
			// 准备要渲染的元素（不包含 Fill 背景色）
			const elementsToRender = renderElements.map((el) => {
				const { x, y, width, height, rotate } = converMetaLayoutToCanvasLayout(
					el.props,
					canvasConvertOptions.picture,
					canvasConvertOptions.canvas,
				);

				return (
					<SkiaGroup key={el.props.id}>
						<el.type
							{...el.props}
							__renderLayout={{ x, y, w: width, h: height, r: rotate }}
						/>
					</SkiaGroup>
				);
			});

			// 离屏渲染为 Image（不包含背景色），使用当前时间点
			const image = await renderElementsOffscreenAsImage(
				elementsToRender,
				{
					width: canvasWidth,
					height: canvasHeight,
				},
				currentTime,
			);

			// 将 SkImage 编码为 PNG（支持透明背景）
			const buffer = image.encodeToBytes(ImageFormat.PNG, 100);

			// 创建新的 Uint8Array 副本以确保使用 ArrayBuffer（而非 SharedArrayBuffer）
			const arrayBuffer = new Uint8Array(buffer).buffer;
			const blob = new Blob([arrayBuffer], { type: "image/png" });

			// 创建下载链接
			const link = document.createElement("a");
			const url = URL.createObjectURL(blob);
			link.href = url;
			link.download = `canvas-no-background-${Date.now()}.png`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			// 清理对象 URL 以释放内存
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Failed to download image without background:", error);
		}
	}, [
		renderElements,
		canvasConvertOptions,
		canvasWidth,
		canvasHeight,
		renderElementsOffscreenAsImage,
		currentTime,
	]);

	return (
		<div ref={containerRef} className="w-full h-full overflow-hidden">
			{/* <button onClick={handleDownload}>download image</button>
			<button onClick={handleDownloadWithoutBackground}>
				download image without background
			</button> */}
			<div
				style={{
					position: "relative",
					width: canvasWidth,
					height: canvasHeight,
					transform: zoomTransform,
					transformOrigin: "top left",
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
					{skiaCanvas}
				</div>

				{/* 上层：Konva 交互层 */}
				<Stage
					ref={stageRef}
					width={canvasWidth}
					height={canvasHeight}
					className="absolute top-0 left-0"
					onClick={handleStageClick}
					onMouseDown={handleStageMouseDown}
					onMouseMove={handleStageMouseMove}
					onMouseUp={handleStageMouseUp}
				>
					<Layer>
						{renderElements.map((el) => {
							const { id } = el.props;
							const isHovered = hoveredId === id;
							const isDragging = draggingId === id;
							const isSelected = selectedIds.includes(id);

							const { x, y, width, height, rotate } =
								converMetaLayoutToCanvasLayout(
									el.props,
									canvasConvertOptions.picture,
									canvasConvertOptions.canvas,
								);

							// 将弧度转换为度数（Konva 使用度数）
							const rotationDegrees = (rotate * 180) / Math.PI;

							return (
								<React.Fragment key={id}>
									<KonvaRect
										x={x}
										y={y}
										width={width}
										height={height}
										fill="transparent"
										stroke={
											isSelected
												? "rgba(255,0,0,1)"
												: isDragging
													? "rgba(255,0,0,0.7)"
													: isHovered
														? "rgba(0,0,0,0.5)"
														: "transparent"
										}
										strokeWidth={isSelected ? 1 : 1}
										draggable
										data-id={id}
										name={`element-${id}`}
										rotation={rotationDegrees}
										onMouseDown={() => handleMouseDown(id)}
										onMouseUp={handleMouseUp}
										onDragStart={() => handleDragStart(id)}
										onDragMove={(e: Konva.KonvaEventObject<DragEvent>) =>
											handleDrag(id, e)
										}
										onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) =>
											handleDragEnd(id, e)
										}
										onTransform={(e: Konva.KonvaEventObject<Event>) =>
											handleTransform(id, e)
										}
										onTransformEnd={(e: Konva.KonvaEventObject<Event>) =>
											handleTransformEnd(id, e)
										}
										onMouseEnter={() => handleMouseEnter(id)}
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
							anchorFill="black"
							anchorStroke="rgba(255,0,0,1)"
							anchorStrokeWidth={1.25}
							anchorSize={7}
							borderStroke="rgba(255,0,0,0.7)"
						/>
					</Layer>
				</Stage>

				{/* DOM 文字标签层 */}
				<LabelLayer
					elements={renderElements}
					hoveredId={hoveredId}
					selectedIds={selectedIds}
					stageRef={stageRef}
					canvasConvertOptions={canvasConvertOptions}
				/>
			</div>
			<input
				type="range"
				min={0.1}
				max={1}
				step={0.001}
				value={isDraggingZoom ? tempZoomLevel : zoomLevel}
				onMouseDown={startZoomDrag}
				onChange={(e) => {
					updateZoomDrag(Number(e.target.value));
				}}
				onMouseUp={(e) => {
					endZoomDrag(Number((e.target as HTMLInputElement).value));
				}}
			/>
		</div>
	);
};

export default Preview;
