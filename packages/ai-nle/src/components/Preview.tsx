import Konva from "konva";
import React, {
	useCallback,
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
import { TimelineStoreContext, useTimelineRef } from "./TimelineContext";
import { testTimeline } from "./timeline";

/**
 * Compute visible elements based on current time.
 * This is a pure function that doesn't trigger React re-renders.
 */
function computeVisibleElements(
	elements: EditorElement[],
	currentTime: number,
): EditorElement[] {
	return elements.filter((el) => {
		const { start = 0, end = Infinity } = el.props;
		const visible =
			currentTime >= parseStartEndSchema(start) &&
			currentTime < parseStartEndSchema(end);
		return visible;
	});
}

interface PinchState {
	isPinching: boolean;
	centerX: number;
	centerY: number;
	initialZoom: number;
	currentZoom: number;
}

// LabelLayer 组件：从 Konva 节点获取实际位置来显示 label
interface LabelLayerProps {
	elements: EditorElement[];
	selectedIds: string[];
	stageRef: React.RefObject<Konva.Stage | null>;
	canvasConvertOptions: {
		picture: { width: number; height: number };
		canvas: { width: number; height: number };
	};
	offsetX: number;
	offsetY: number;
	zoomLevel: number;
	pinchState: PinchState;
}

const LabelLayer: React.FC<LabelLayerProps> = ({
	elements,
	selectedIds,
	stageRef,
	canvasConvertOptions,
	offsetX,
	offsetY,
	zoomLevel,
	pinchState,
}) => {
	const [labelPositions, setLabelPositions] = useState<
		Record<
			string,
			{
				screenX: number; // 屏幕坐标（用于定位）
				screenY: number;
				screenWidth: number; // 屏幕尺寸（用于计算 translateY）
				screenHeight: number;
				canvasWidth: number; // 画布尺寸（用于显示）
				canvasHeight: number;
				rotation: number;
			}
		>
	>({});

	const effectiveZoom = pinchState.isPinching
		? pinchState.currentZoom
		: zoomLevel;

	// 更新 label 位置的函数
	const updateLabelPositions = useCallback(() => {
		const stage = stageRef.current;
		const positions: Record<
			string,
			{
				screenX: number;
				screenY: number;
				screenWidth: number;
				screenHeight: number;
				canvasWidth: number;
				canvasHeight: number;
				rotation: number;
			}
		> = {};

		elements.forEach((el) => {
			if (!selectedIds.length) return;
			if (!selectedIds.includes(el.props.id)) return;

			const node = stage?.findOne(`.element-${el.props.id}`) as
				| Konva.Node
				| undefined;

			if (!node) {
				// 如果找不到节点，使用 layout 计算的位置并转换到屏幕坐标
				const { x, y, width, height } = converMetaLayoutToCanvasLayout(
					el.props,
					canvasConvertOptions.picture,
					canvasConvertOptions.canvas,
				);
				const screenX = x * effectiveZoom + offsetX;
				const screenY = y * effectiveZoom + offsetY;
				const screenWidth = width * effectiveZoom;
				const screenHeight = height * effectiveZoom;

				positions[el.props.id] = {
					screenX: screenX + screenWidth / 2,
					screenY: screenY + screenHeight / 2,
					screenWidth,
					screenHeight,
					canvasWidth: width,
					canvasHeight: height,
					rotation: 0,
				};
				return;
			}

			// 从 Konva 节点获取实际位置和尺寸（Stage/屏幕坐标系）
			const stageX = node.x();
			const stageY = node.y();
			const stageWidth = node.width() * node.scaleX();
			const stageHeight = node.height() * node.scaleY();
			const rotation = node.rotation();

			// 画布尺寸（用于显示）
			const canvasWidth = stageWidth / effectiveZoom;
			const canvasHeight = stageHeight / effectiveZoom;

			// 获取 offset
			const nodeOffsetX = node.offsetX() || 0;
			const nodeOffsetY = node.offsetY() || 0;

			// 计算旋转中心点 - Stage 坐标
			const rotationCenterX = stageX + nodeOffsetX;
			const rotationCenterY = stageY + nodeOffsetY;

			// 计算未旋转时中心点相对于旋转中心的偏移（Stage 尺寸）
			const centerOffsetX = stageWidth / 2 - nodeOffsetX;
			const centerOffsetY = stageHeight / 2 - nodeOffsetY;

			const rotationRad = (rotation * Math.PI) / 180;
			const cos = Math.cos(rotationRad);
			const sin = Math.sin(rotationRad);
			const rotatedCenterX =
				rotationCenterX + centerOffsetX * cos - centerOffsetY * sin;
			const rotatedCenterY =
				rotationCenterY + centerOffsetX * sin + centerOffsetY * cos;

			positions[el.props.id] = {
				screenX: rotatedCenterX,
				screenY: rotatedCenterY,
				screenWidth: stageWidth,
				screenHeight: stageHeight,
				canvasWidth,
				canvasHeight,
				rotation,
			};
		});

		setLabelPositions(positions);
	}, [
		elements,
		selectedIds,
		stageRef,
		canvasConvertOptions,
		effectiveZoom,
		offsetX,
		offsetY,
	]);

	useEffect(() => {
		updateLabelPositions();
	}, [updateLabelPositions]);

	return (
		<div
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				width: "100%",
				height: "100%",
				pointerEvents: "none",
			}}
		>
			{elements.map((el) => {
				const position = labelPositions[el.props.id];
				if (!position) return null;

				// 使用屏幕尺寸计算 translateY
				let translateY = 0;
				if (
					Math.abs(position.rotation % 180) > 45 &&
					Math.abs(position.rotation % 180) < 135
				) {
					translateY = position.screenWidth / 2 + 20;
				} else {
					translateY = position.screenHeight / 2 + 20;
				}

				let normalizedRotation = position.rotation % 90;
				if (position.rotation % 90 > 45) {
					normalizedRotation -= 90 * Math.ceil(normalizedRotation / 90);
				} else if (position.rotation % 90 < -45) {
					normalizedRotation -= 90 * Math.floor(normalizedRotation / 90);
				}

				return (
					<div
						key={el.props.id}
						className="absolute text-red-500 bg-black/80 border border-red-500/70 max-w-32 truncate font-medium backdrop-blur-sm backdrop-saturate-150 px-3 py-1 -top-8 rounded-full text-xs whitespace-nowrap pointer-events-none"
						style={{
							left: position.screenX,
							top: position.screenY,
							transform: `translate(-50%, -50%) rotate(${normalizedRotation}deg) translateY(${translateY}px)`,
						}}
					>
						{Math.round(position.canvasWidth)} &times;{" "}
						{Math.round(position.canvasHeight)}
					</div>
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

	// Use ref-based timeline access to avoid re-renders when time changes
	const { getCurrentTime, subscribeToTime } = useTimelineRef();

	// Use ref to store visible elements for Konva interaction layer
	// This doesn't trigger re-renders when time changes
	const renderElementsRef = useRef<EditorElement[]>([]);

	// Store current time in ref for non-reactive access
	const currentTimeRef = useRef(getCurrentTime());

	// For Konva layer, we need state to trigger re-renders for interaction updates
	// But this is only updated when elements visibility actually changes
	const [renderElements, setRenderElements] = useState<EditorElement[]>(() => {
		const initial = computeVisibleElements(elements, getCurrentTime());
		renderElementsRef.current = initial;
		return initial;
	});

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

	const {
		pictureWidth,
		pictureHeight,
		canvasWidth,
		canvasHeight,
		zoomLevel,
		setZoomLevel,
		zoomTransform,
		setContainerSize,
		offsetX,
		offsetY,
		// Pinch zoom
		pinchState,
		startPinchZoom,
		updatePinchZoom,
		endPinchZoom,
		// Pan
		panOffset,
		setPanOffset,
		resetPanOffset,
	} = usePreview();

	// Pinch zoom state - 记录初始双指距离
	const pinchStartDistanceRef = useRef<number | null>(null);

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

	// 将 Stage 坐标转换为画布坐标（考虑 offset 和缩放）
	// 新的坐标系：canvas = picture 尺寸，通过 CSS transform scale(zoomLevel) 显示
	const stageToCanvasCoords = useCallback(
		(stageX: number, stageY: number) => {
			// 计算当前的有效缩放比例
			// pinch 时使用 currentZoom，否则使用 zoomLevel
			const effectiveZoom = pinchState.isPinching
				? pinchState.currentZoom
				: zoomLevel;

			// Stage 坐标 → 减去偏移 → 除以缩放 → Canvas 坐标
			const canvasX = (stageX - offsetX) / effectiveZoom;
			const canvasY = (stageY - offsetY) / effectiveZoom;

			return { canvasX, canvasY };
		},
		[offsetX, offsetY, zoomLevel, pinchState],
	);

	// 将画布坐标转换为 Stage 坐标（考虑 offset 和缩放）
	const canvasToStageCoords = useCallback(
		(canvasX: number, canvasY: number) => {
			// 计算当前的有效缩放比例
			const effectiveZoom = pinchState.isPinching
				? pinchState.currentZoom
				: zoomLevel;

			// Canvas 坐标 → 乘以缩放 → 加上偏移 → Stage 坐标
			const stageX = canvasX * effectiveZoom + offsetX;
			const stageY = canvasY * effectiveZoom + offsetY;

			return { stageX, stageY };
		},
		[offsetX, offsetY, zoomLevel, pinchState],
	);

	const handleDrag = useCallback(
		(id: string, e: Konva.KonvaEventObject<DragEvent>) => {
			const node = e.target;
			const stageX = node.x();
			const stageY = node.y();

			// 将 Stage 坐标转换为画布坐标
			// 由于 canvas = picture 尺寸，canvas 坐标即 picture 坐标
			const { canvasX, canvasY } = stageToCanvasCoords(stageX, stageY);

			setElements((prev) =>
				prev.map((el) =>
					el.props.id === id
						? { ...el, props: { ...el.props, left: canvasX, top: canvasY } }
						: el,
				),
			);
		},
		[stageToCanvasCoords],
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

			const stageX = node.x();
			const stageY = node.y();
			// 缩放后的尺寸（在 Stage 坐标系中）
			const stageWidth_scaled = node.width() * scaleX;
			const stageHeight_scaled = node.height() * scaleY;

			// 将 Stage 坐标转换为画布/picture 坐标
			const { canvasX, canvasY } = stageToCanvasCoords(stageX, stageY);

			// 将 Stage 尺寸转换为画布/picture 尺寸
			const effectiveZoom = pinchState.isPinching
				? pinchState.currentZoom
				: zoomLevel;
			const pictureWidth_scaled = stageWidth_scaled / effectiveZoom;
			const pictureHeight_scaled = stageHeight_scaled / effectiveZoom;

			// 只更新元素状态，不修改节点（让 Transformer 继续工作）
			const rotationDegrees = node.rotation();
			const rotationRadians = (rotationDegrees * Math.PI) / 180;
			setElements((prev) =>
				prev.map((el) =>
					el.props.id === id
						? {
								...el,
								props: {
									...el.props,
									left: canvasX,
									top: canvasY,
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
		[stageToCanvasCoords, zoomLevel, pinchState],
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

			const stageX = node.x();
			const stageY = node.y();
			// 缩放后的尺寸（在 Stage 坐标系中）
			const stageWidth_scaled = node.width() * scaleX;
			const stageHeight_scaled = node.height() * scaleY;

			// 将 Stage 坐标转换为画布/picture 坐标
			const { canvasX, canvasY } = stageToCanvasCoords(stageX, stageY);

			// 将 Stage 尺寸转换为画布/picture 尺寸
			const effectiveZoom = pinchState.isPinching
				? pinchState.currentZoom
				: zoomLevel;
			const pictureWidth_scaled = stageWidth_scaled / effectiveZoom;
			const pictureHeight_scaled = stageHeight_scaled / effectiveZoom;

			// 更新节点的 width 和 height（使用 Stage 坐标系的尺寸）
			node.width(stageWidth_scaled);
			node.height(stageHeight_scaled);

			const rotationDegrees = node.rotation();
			const rotationRadians = (rotationDegrees * Math.PI) / 180;
			setElements((prev) =>
				prev.map((el) =>
					el.props.id === id
						? {
								...el,
								left: canvasX,
								top: canvasY,
								width: pictureWidth_scaled,
								height: pictureHeight_scaled,
								rotate: `${rotationDegrees}deg`,
								rotation: rotationRadians,
							}
						: el,
				),
			);
		},
		[stageToCanvasCoords, zoomLevel, pinchState],
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

			// 将 Stage 坐标转换为画布坐标用于选择框显示
			const { canvasX, canvasY } = stageToCanvasCoords(pos.x, pos.y);

			isSelecting.current = true;
			setSelectionRect({
				visible: true,
				x1: canvasX,
				y1: canvasY,
				x2: canvasX,
				y2: canvasY,
			});
		},
		[stageToCanvasCoords],
	);

	// 处理鼠标移动，更新选择框
	const handleStageMouseMove = useCallback(
		(e: Konva.KonvaEventObject<MouseEvent>) => {
			if (!isSelecting.current) {
				return;
			}

			const pos = e.target.getStage()?.getPointerPosition();
			if (!pos) return;

			// 将 Stage 坐标转换为画布坐标
			const { canvasX, canvasY } = stageToCanvasCoords(pos.x, pos.y);

			setSelectionRect((prev) => ({
				...prev,
				x2: canvasX,
				y2: canvasY,
			}));
		},
		[stageToCanvasCoords],
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

	const ContextBridge = useContextBridge(TimelineStoreContext);

	const skiaCanvasRef = useRef<CanvasRef>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerDimensions, setContainerDimensions] = useState({
		width: 0,
		height: 0,
	});

	// 监听容器尺寸变化（用于扩大 Konva Stage）
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateDimensions = () => {
			const rect = container.getBoundingClientRect();
			if (rect.width > 0 && rect.height > 0) {
				setContainerDimensions({
					width: rect.width,
					height: rect.height,
				});
				// 设置容器尺寸（用于居中计算）
				setContainerSize({
					width: rect.width,
					height: rect.height,
				});
			}
		};

		// 初始设置
		updateDimensions();

		// 监听窗口大小变化
		const resizeObserver = new ResizeObserver(updateDimensions);
		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
		};
	}, [setContainerSize]);

	// 处理 Mac trackpad pinch zoom（通过 wheel 事件）
	// Mac trackpad 的双指缩放会触发 wheel 事件，并且 ctrlKey 为 true
	const wheelZoomRef = useRef<{
		isZooming: boolean;
		timeoutId: ReturnType<typeof setTimeout> | null;
		initialZoom: number;
		accumulatedDelta: number;
	}>({
		isZooming: false,
		timeoutId: null,
		initialZoom: zoomLevel,
		accumulatedDelta: 0,
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleWheel = (e: WheelEvent) => {
			// Mac trackpad pinch zoom 会带有 ctrlKey
			if (e.ctrlKey) {
				e.preventDefault();
				e.stopPropagation(); // 阻止事件冒泡到 document 级别的处理器

				const rect = container.getBoundingClientRect();
				const centerX = e.clientX - rect.left;
				const centerY = e.clientY - rect.top;

				// 开始缩放
				if (!wheelZoomRef.current.isZooming) {
					wheelZoomRef.current.isZooming = true;
					wheelZoomRef.current.initialZoom = zoomLevel;
					wheelZoomRef.current.accumulatedDelta = 0;
					startPinchZoom(centerX, centerY);
				}

				// 清除之前的结束计时器
				if (wheelZoomRef.current.timeoutId) {
					clearTimeout(wheelZoomRef.current.timeoutId);
				}

				// 累积 delta 值（负值表示放大，正值表示缩小）
				wheelZoomRef.current.accumulatedDelta += e.deltaY;

				// 计算缩放比例（使用指数函数使缩放更平滑）
				const scale = Math.exp(-wheelZoomRef.current.accumulatedDelta * 0.01);
				updatePinchZoom(scale, centerX, centerY);

				// 设置结束计时器（wheel 事件停止后 150ms 结束缩放）
				wheelZoomRef.current.timeoutId = setTimeout(() => {
					wheelZoomRef.current.isZooming = false;
					wheelZoomRef.current.timeoutId = null;
					endPinchZoom();
				}, 150);
			} else {
				// 普通滚动 - 用于平移画布
				e.preventDefault();
				// shift + 滚动 = 水平滚动
				const deltaX = e.shiftKey ? e.deltaY : e.deltaX;
				const deltaY = e.shiftKey ? 0 : e.deltaY;

				setPanOffset({
					x: panOffset.x - deltaX,
					y: panOffset.y - deltaY,
				});
			}
		};

		container.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			container.removeEventListener("wheel", handleWheel);
			if (wheelZoomRef.current.timeoutId) {
				clearTimeout(wheelZoomRef.current.timeoutId);
			}
		};
	}, [
		zoomLevel,
		startPinchZoom,
		updatePinchZoom,
		endPinchZoom,
		panOffset,
		setPanOffset,
	]);

	// 处理 touch 事件实现 pinch zoom（触摸屏）
	// 使用 Konva 的事件类型（原生 TouchEvent）
	const handleTouchStart = useCallback(
		(e: Konva.KonvaEventObject<TouchEvent>) => {
			const nativeEvent = e.evt;
			if (nativeEvent.touches.length === 2) {
				nativeEvent.preventDefault();
				const touch1 = nativeEvent.touches[0];
				const touch2 = nativeEvent.touches[1];

				const container = containerRef.current;
				if (!container) return;
				const rect = container.getBoundingClientRect();

				const distance = Math.sqrt(
					Math.pow(touch1.clientX - touch2.clientX, 2) +
						Math.pow(touch1.clientY - touch2.clientY, 2),
				);
				const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
				const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

				pinchStartDistanceRef.current = distance;
				startPinchZoom(centerX, centerY);
			}
		},
		[startPinchZoom],
	);

	const handleTouchMove = useCallback(
		(e: Konva.KonvaEventObject<TouchEvent>) => {
			const nativeEvent = e.evt;
			if (
				nativeEvent.touches.length === 2 &&
				pinchStartDistanceRef.current !== null
			) {
				nativeEvent.preventDefault();
				const touch1 = nativeEvent.touches[0];
				const touch2 = nativeEvent.touches[1];

				const container = containerRef.current;
				if (!container) return;
				const rect = container.getBoundingClientRect();

				const distance = Math.sqrt(
					Math.pow(touch1.clientX - touch2.clientX, 2) +
						Math.pow(touch1.clientY - touch2.clientY, 2),
				);
				const centerX = (touch1.clientX + touch2.clientX) / 2 - rect.left;
				const centerY = (touch1.clientY + touch2.clientY) / 2 - rect.top;

				// 计算缩放比例
				const scale = distance / pinchStartDistanceRef.current;
				updatePinchZoom(scale, centerX, centerY);
			}
		},
		[updatePinchZoom],
	);

	const handleTouchEnd = useCallback(
		(e: Konva.KonvaEventObject<TouchEvent>) => {
			const nativeEvent = e.evt;
			// 只有当所有手指都离开时才结束 pinch
			if (
				nativeEvent.touches.length < 2 &&
				pinchStartDistanceRef.current !== null
			) {
				pinchStartDistanceRef.current = null;
				endPinchZoom();
			}
		},
		[endPinchZoom],
	);

	// Build Skia children for rendering
	const buildSkiaChildren = useCallback(
		(visibleElements: EditorElement[]) => {
			return (
				<ContextBridge>
					<Fill color="black" />
					{visibleElements.map((el) => {
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
			);
		},
		[ContextBridge, canvasConvertOptions],
	);

	// Refs for stable access in subscription callback
	const elementsRef = useRef(elements);
	elementsRef.current = elements;

	// Track if initial render has been done to avoid duplicate renders
	const initialRenderDoneRef = useRef(false);

	// Direct Skia rendering via subscription - completely bypasses React re-renders
	// This is the core performance optimization: time changes don't trigger Preview re-render
	useEffect(() => {
		const renderSkia = (time: number) => {
			currentTimeRef.current = time;
			const visibleElements = computeVisibleElements(elementsRef.current, time);
			const children = buildSkiaChildren(visibleElements);

			// Update Konva layer only if visible elements changed
			// Compare by length and element references for efficiency
			const prevElements = renderElementsRef.current;
			if (
				prevElements.length !== visibleElements.length ||
				visibleElements.some((el, i) => prevElements[i] !== el)
			) {
				renderElementsRef.current = visibleElements;
				setRenderElements(visibleElements);

				skiaCanvasRef.current?.getRoot()?.render(children);
			}
		};

		// Initial render - only do once
		if (!initialRenderDoneRef.current) {
			initialRenderDoneRef.current = true;
			// Delay initial render to ensure Canvas is mounted
			requestAnimationFrame(() => {
				renderSkia(getCurrentTime());
			});
		}

		// Subscribe to time changes
		return subscribeToTime(renderSkia);
	}, [getCurrentTime, subscribeToTime]);

	// Re-render Skia when elements change (not time)
	// Use a separate ref to track if this is the first render
	const elementsEffectInitRef = useRef(true);
	useEffect(() => {
		// Skip the initial run - the subscription effect handles it
		if (elementsEffectInitRef.current) {
			elementsEffectInitRef.current = false;
			return;
		}

		const root = skiaCanvasRef.current?.getRoot();
		if (!root) return;

		const time = currentTimeRef.current;
		const visibleElements = computeVisibleElements(elements, time);
		const children = buildSkiaChildren(visibleElements);
		root.render(children);

		// Update Konva layer
		renderElementsRef.current = visibleElements;
		setRenderElements(visibleElements);
	}, [elements]);

	// Stable Canvas component - only re-creates when size changes
	// Children are rendered directly via root.render() above
	const skiaCanvas = useMemo(() => {
		return (
			<Canvas
				style={{
					width: canvasWidth,
					height: canvasHeight,
					overflow: "hidden", // 必须要设置 overflow: "hidden"，否则高度无法缩小，原因未知
				}}
				ref={skiaCanvasRef}
			/>
		);
	}, [canvasWidth, canvasHeight]);

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
				currentTimeRef.current,
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
	]);

	const stageWidth = containerDimensions.width || canvasWidth;
	const stageHeight = containerDimensions.height || canvasHeight;

	return (
		<div
			ref={containerRef}
			className="w-full h-full overflow-hidden"
			style={{ touchAction: "none", position: "relative" }}
		>
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
					willChange: "transform",
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
			</div>

			{/* DOM 文字标签层 - 在变换 div 外面，使用屏幕坐标，pinch 过程中隐藏 */}
			{!pinchState.isPinching && (
				<LabelLayer
					elements={renderElements}
					selectedIds={selectedIds}
					stageRef={stageRef}
					canvasConvertOptions={canvasConvertOptions}
					offsetX={offsetX}
					offsetY={offsetY}
					zoomLevel={zoomLevel}
					pinchState={pinchState}
				/>
			)}

			{/* 上层：Konva 交互层 - 覆盖整个容器，pinch 过程中隐藏内容 */}
			<Stage
				ref={stageRef}
				width={stageWidth}
				height={stageHeight}
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					opacity: pinchState.isPinching ? 0 : 1,
				}}
				onClick={handleStageClick}
				onMouseDown={handleStageMouseDown}
				onMouseMove={handleStageMouseMove}
				onMouseUp={handleStageMouseUp}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
			>
				<Layer>
					{/* 选择框 */}
					{selectionRect.visible &&
						(() => {
							// 将画布坐标转换为 Stage 坐标
							const { stageX: x1, stageY: y1 } = canvasToStageCoords(
								selectionRect.x1,
								selectionRect.y1,
							);
							const { stageX: x2, stageY: y2 } = canvasToStageCoords(
								selectionRect.x2,
								selectionRect.y2,
							);
							return (
								<KonvaRect
									x={Math.min(x1, x2)}
									y={Math.min(y1, y2)}
									width={Math.abs(x2 - x1)}
									height={Math.abs(y2 - y1)}
									fill="rgba(100, 150, 255, 0.1)"
									stroke="rgba(100, 150, 255, 0.5)"
									strokeWidth={1}
									listening={false}
								/>
							);
						})()}
					{renderElements.map((el) => {
						const { id } = el.props;
						const isHovered = hoveredId === id;
						const isDragging = draggingId === id;
						const isSelected = selectedIds.includes(id);

						const {
							x: canvasX,
							y: canvasY,
							width: canvasWidth_el,
							height: canvasHeight_el,
							rotate,
						} = converMetaLayoutToCanvasLayout(
							el.props,
							canvasConvertOptions.picture,
							canvasConvertOptions.canvas,
						);

						// 将画布坐标转换为 Stage 坐标
						const { stageX, stageY } = canvasToStageCoords(canvasX, canvasY);

						// 将画布尺寸转换为 Stage 尺寸
						const effectiveZoom = pinchState.isPinching
							? pinchState.currentZoom
							: zoomLevel;
						const stageWidth = canvasWidth_el * effectiveZoom;
						const stageHeight = canvasHeight_el * effectiveZoom;

						// 将弧度转换为度数（Konva 使用度数）
						const rotationDegrees = (rotate * 180) / Math.PI;

						return (
							<React.Fragment key={id}>
								<KonvaRect
									x={stageX}
									y={stageY}
									width={stageWidth}
									height={stageHeight}
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
			<div
				style={{
					position: "absolute",
					bottom: 16,
					left: "50%",
					transform: "translateX(-50%)",
					display: "flex",
					alignItems: "center",
					gap: 8,
					background: "rgba(0,0,0,0.6)",
					padding: "6px 12px",
					borderRadius: 20,
					backdropFilter: "blur(8px)",
				}}
			>
				<button
					type="button"
					onClick={resetPanOffset}
					style={{
						background: "transparent",
						border: "none",
						color: "white",
						cursor: "pointer",
						padding: "4px 8px",
						borderRadius: 4,
						fontSize: 12,
					}}
					title="重置视图位置"
				>
					⟲
				</button>
				<input
					type="range"
					min={0.1}
					max={2}
					step={0.001}
					value={pinchState.isPinching ? pinchState.currentZoom : zoomLevel}
					onChange={(e) => {
						setZoomLevel(Number(e.target.value));
					}}
					style={{ width: 100 }}
				/>
				<span style={{ color: "white", fontSize: 12, minWidth: 40 }}>
					{Math.round(
						(pinchState.isPinching ? pinchState.currentZoom : zoomLevel) * 100,
					)}
					%
				</span>
			</div>
		</div>
	);
};

export default Preview;
