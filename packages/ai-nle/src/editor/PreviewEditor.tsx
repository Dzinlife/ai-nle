import { QueryClientContext } from "@tanstack/react-query";
import Konva from "konva";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	Line as KonvaLine,
	Rect as KonvaRect,
	Layer,
	Stage,
	Transformer,
} from "react-konva";
import {
	Canvas,
	CanvasRef,
	Fill,
	Group as SkiaGroup,
	useContextBridge,
} from "react-skia-lite";
import {
	renderLayoutToTopLeft,
	transformMetaToRenderLayout,
} from "@/dsl/layout";
import { componentRegistry } from "@/dsl/model/componentRegistry";
import { TimelineElement } from "@/dsl/types";
import { usePreview } from "./contexts/PreviewProvider";
import {
	useMultiSelect,
	useSnap,
	useTimelineStore,
	useTrackAssignments,
} from "./contexts/TimelineContext";

/**
 * Compute visible elements based on current time.
 * This is a pure function that doesn't trigger React re-renders.
 */
function computeVisibleElements(
	elements: TimelineElement[],
	currentTime: number,
): TimelineElement[] {
	return elements.filter((el) => {
		const { start = 0, end = Infinity } = el.timeline;
		const visible = currentTime >= start && currentTime < end;
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

const SNAP_GUIDE_THRESHOLD = 6;

type SnapGuides = {
	vertical: number[];
	horizontal: number[];
};

type AxisSnapResult = {
	line: number | null;
	delta: number;
	distance: number;
};

type SnapComputeOptions = {
	movingX?: number[];
	movingY?: number[];
};

type TransformBase = {
	stageWidth: number;
	stageHeight: number;
	canvasWidth: number;
	canvasHeight: number;
	scaleX: number;
	scaleY: number;
	effectiveZoom: number;
};

const findNearestGuide = (
	movingValues: number[],
	guideValues: number[],
): AxisSnapResult => {
	let best: AxisSnapResult = {
		line: null,
		delta: 0,
		distance: Infinity,
	};

	movingValues.forEach((value) => {
		guideValues.forEach((guide) => {
			const distance = Math.abs(guide - value);
			if (distance < best.distance) {
				best = { line: guide, delta: guide - value, distance };
			}
		});
	});

	return best;
};

// LabelLayer 组件：从 Konva 节点获取实际位置来显示 label
interface LabelLayerProps {
	elements: TimelineElement[];
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

	// 更新 label 位置的函数
	const updateLabelPositions = useCallback(() => {
		const stage = stageRef.current;
		// 计算有效缩放比例（在回调内部计算，避免依赖问题）
		const effectiveZoom = pinchState.isPinching
			? pinchState.currentZoom
			: zoomLevel;

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
			if (!selectedIds.includes(el.id)) return;

			const node = stage?.findOne(`.element-${el.id}`) as
				| Konva.Node
				| undefined;

			if (!node) {
				// 如果找不到节点，使用 transform 计算的位置并转换到屏幕坐标
				const renderLayout = transformMetaToRenderLayout(
					el.transform,
					canvasConvertOptions.picture,
					canvasConvertOptions.canvas,
				);
				const { x, y, width, height } = renderLayoutToTopLeft(renderLayout);
				const screenX = x * effectiveZoom + offsetX;
				const screenY = y * effectiveZoom + offsetY;
				const screenWidth = width * effectiveZoom;
				const screenHeight = height * effectiveZoom;

				positions[el.id] = {
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

			positions[el.id] = {
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
		pinchState,
		zoomLevel,
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
				const position = labelPositions[el.id];
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
						key={el.id}
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

const Preview = () => {
	const renderElementsRef = useRef<TimelineElement[]>([]);

	const { getDisplayTime, getElements } = useMemo(
		() => useTimelineStore.getState(),
		[],
	);

	// For Konva layer, we need state to trigger re-renders for interaction updates
	// But this is only updated when elements visibility actually changes
	const [renderElements, setRenderElements] = useState<TimelineElement[]>([]);

	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const { selectedIds, select, toggleSelect, deselectAll, setSelection } =
		useMultiSelect();
	const { snapEnabled } = useSnap();
	const { trackAssignments } = useTrackAssignments();
	const [selectionRect, setSelectionRect] = useState({
		visible: false,
		x1: 0,
		y1: 0,
		x2: 0,
		y2: 0,
	});
	const stageRef = useRef<Konva.Stage>(null);
	const transformerRef = useRef<Konva.Transformer>(null);
	const transformBaseRef = useRef<Record<string, TransformBase>>({});
	const altPressedRef = useRef(false);
	const shiftPressedRef = useRef(false);
	const isSelecting = useRef(false);
	const selectionAdditiveRef = useRef(false);
	const initialSelectedIdsRef = useRef<string[]>([]);
	const selectionRectRef = useRef(selectionRect);
	const dragSelectedIdsRef = useRef<string[]>([]);
	const dragInitialPositionsRef = useRef<
		Record<string, { x: number; y: number }>
	>({});
	const [snapGuides, setSnapGuides] = useState<SnapGuides>({
		vertical: [],
		horizontal: [],
	});
	const clearSnapGuides = useCallback(() => {
		setSnapGuides({ vertical: [], horizontal: [] });
	}, []);

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
		// Canvas ref
		setCanvasRef,
	} = usePreview();

	const getTrackIndexForElement = useCallback(
		(el: TimelineElement) =>
			trackAssignments.get(el.id) ?? el.timeline.trackIndex ?? 0,
		[trackAssignments],
	);

	const sortByTrackIndex = useCallback(
		(items: TimelineElement[]) => {
			return items
				.map((el, index) => ({
					el,
					index,
					trackIndex: getTrackIndexForElement(el),
				}))
				.sort((a, b) => {
					if (a.trackIndex !== b.trackIndex) {
						return a.trackIndex - b.trackIndex;
					}
					return a.index - b.index;
				})
				.map(({ el }) => el);
		},
		[getTrackIndexForElement],
	);

	// Pinch zoom state - 记录初始双指距离
	const pinchStartDistanceRef = useRef<number | null>(null);

	const canvasConvertOptions = useMemo(
		() => ({
			picture: {
				width: pictureWidth,
				height: pictureHeight,
			},
			canvas: {
				width: canvasWidth,
				height: canvasHeight,
			},
		}),
		[pictureWidth, pictureHeight, canvasWidth, canvasHeight],
	);

	const handleMouseDown = useCallback((id: string) => {
		setDraggingId(id);
	}, []);

	const handleMouseUp = useCallback(() => {
		setDraggingId(null);
		clearSnapGuides();
	}, [clearSnapGuides]);

	const handleDragStart = useCallback(
		(id: string) => {
			const nextSelectedIds = selectedIds.includes(id) ? selectedIds : [id];
			if (!selectedIds.includes(id)) {
				setSelection([id], id);
			}

			const currentElements = useTimelineStore.getState().elements;
			const positions: Record<string, { x: number; y: number }> = {};
			for (const el of currentElements) {
				if (!nextSelectedIds.includes(el.id)) continue;
				const renderLayout = transformMetaToRenderLayout(
					el.transform,
					canvasConvertOptions.picture,
					canvasConvertOptions.canvas,
				);
				const { x, y } = renderLayoutToTopLeft(renderLayout);
				positions[el.id] = { x, y };
			}

			dragSelectedIdsRef.current = nextSelectedIds;
			dragInitialPositionsRef.current = positions;

			setDraggingId(id);
			setHoveredId(id); // 拖拽开始时保持 hover 状态
		},
		[selectedIds, setSelection, canvasConvertOptions],
	);

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

	const getEffectiveZoom = useCallback(
		() => (pinchState.isPinching ? pinchState.currentZoom : zoomLevel),
		[pinchState, zoomLevel],
	);

	const updateTransformerCenteredScaling = useCallback((centered: boolean) => {
		const transformer = transformerRef.current;
		if (!transformer) return;
		transformer.centeredScaling(centered);
		transformer.getLayer()?.batchDraw();
	}, []);

	const updateTransformerRotationSnaps = useCallback((enabled: boolean) => {
		const transformer = transformerRef.current;
		if (!transformer) return;
		if (enabled) {
			transformer.rotationSnaps([0, 45, 90, 135, 180, 225, 270, 315]);
			transformer.rotationSnapTolerance(5);
		} else {
			transformer.rotationSnaps([]);
		}
		transformer.getLayer()?.batchDraw();
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.altKey || altPressedRef.current) return;
			altPressedRef.current = true;
			updateTransformerCenteredScaling(true);
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.key !== "Alt" || !altPressedRef.current) return;
			altPressedRef.current = false;
			updateTransformerCenteredScaling(false);
		};

		const handleWindowBlur = () => {
			if (!altPressedRef.current) return;
			altPressedRef.current = false;
			updateTransformerCenteredScaling(false);
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("blur", handleWindowBlur);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [updateTransformerCenteredScaling]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.shiftKey || shiftPressedRef.current) return;
			shiftPressedRef.current = true;
			updateTransformerRotationSnaps(true);
		};

		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.key !== "Shift" || !shiftPressedRef.current) return;
			shiftPressedRef.current = false;
			updateTransformerRotationSnaps(false);
		};

		const handleWindowBlur = () => {
			if (!shiftPressedRef.current) return;
			shiftPressedRef.current = false;
			updateTransformerRotationSnaps(false);
		};

		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		window.addEventListener("blur", handleWindowBlur);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
			window.removeEventListener("blur", handleWindowBlur);
		};
	}, [updateTransformerRotationSnaps]);

	const getElementStageBox = useCallback(
		(el: TimelineElement) => {
			const renderLayout = transformMetaToRenderLayout(
				el.transform,
				canvasConvertOptions.picture,
				canvasConvertOptions.canvas,
			);
			const { x, y, width, height } = renderLayoutToTopLeft(renderLayout);
			const { stageX, stageY } = canvasToStageCoords(x, y);
			const effectiveZoom = getEffectiveZoom();

			return {
				x: stageX,
				y: stageY,
				width: width * effectiveZoom,
				height: height * effectiveZoom,
			};
		},
		[canvasConvertOptions, canvasToStageCoords, getEffectiveZoom],
	);

	const getCanvasStageRect = useCallback(() => {
		const effectiveZoom = getEffectiveZoom();
		const { stageX, stageY } = canvasToStageCoords(0, 0);
		return {
			x: stageX,
			y: stageY,
			width: canvasWidth * effectiveZoom,
			height: canvasHeight * effectiveZoom,
		};
	}, [canvasToStageCoords, canvasWidth, canvasHeight, getEffectiveZoom]);

	const computeSnapResult = useCallback(
		(
			movingBox: { x: number; y: number; width: number; height: number },
			excludeIds: string[],
			options?: SnapComputeOptions,
		) => {
			const guideX: number[] = [];
			const guideY: number[] = [];

			renderElementsRef.current.forEach((el) => {
				if (excludeIds.includes(el.id)) return;
				const box = getElementStageBox(el);
				guideX.push(box.x, box.x + box.width / 2, box.x + box.width);
				guideY.push(box.y, box.y + box.height / 2, box.y + box.height);
			});

			const canvasStageRect = getCanvasStageRect();
			guideX.push(
				canvasStageRect.x,
				canvasStageRect.x + canvasStageRect.width / 2,
				canvasStageRect.x + canvasStageRect.width,
			);
			guideY.push(
				canvasStageRect.y,
				canvasStageRect.y + canvasStageRect.height / 2,
				canvasStageRect.y + canvasStageRect.height,
			);

			const movingX = options?.movingX ?? [
				movingBox.x,
				movingBox.x + movingBox.width / 2,
				movingBox.x + movingBox.width,
			];
			const movingY = options?.movingY ?? [
				movingBox.y,
				movingBox.y + movingBox.height / 2,
				movingBox.y + movingBox.height,
			];

			const bestX = findNearestGuide(movingX, guideX);
			const bestY = findNearestGuide(movingY, guideY);

			return {
				deltaX:
					bestX.line !== null && bestX.distance <= SNAP_GUIDE_THRESHOLD
						? bestX.delta
						: 0,
				deltaY:
					bestY.line !== null && bestY.distance <= SNAP_GUIDE_THRESHOLD
						? bestY.delta
						: 0,
				guides: {
					vertical:
						bestX.line !== null && bestX.distance <= SNAP_GUIDE_THRESHOLD
							? [bestX.line]
							: [],
					horizontal:
						bestY.line !== null && bestY.distance <= SNAP_GUIDE_THRESHOLD
							? [bestY.line]
							: [],
				},
			};
		},
		[getElementStageBox, getCanvasStageRect],
	);

	const handleDrag = useCallback(
		(id: string, e: Konva.KonvaEventObject<DragEvent>) => {
			const node = e.target;
			const stageX = node.x();
			const stageY = node.y();
			const stageWidth = node.width() * node.scaleX();
			const stageHeight = node.height() * node.scaleY();

			const dragSelectedIds = dragSelectedIdsRef.current;
			const initialPositions = dragInitialPositionsRef.current;
			const isMultiDrag =
				dragSelectedIds.length > 1 && dragSelectedIds.includes(id);
			const draggedInitial = initialPositions[id];

			const currentElements = useTimelineStore.getState().elements;
			let adjustedStageX = stageX;
			let adjustedStageY = stageY;

			if (snapEnabled) {
				let movingBox = {
					x: stageX,
					y: stageY,
					width: stageWidth,
					height: stageHeight,
				};

				if (isMultiDrag && draggedInitial) {
					const effectiveZoom = getEffectiveZoom();
					let minX = Infinity;
					let minY = Infinity;
					let maxX = -Infinity;
					let maxY = -Infinity;

					dragSelectedIds.forEach((selectedId) => {
						const element = currentElements.find((el) => el.id === selectedId);
						if (!element) return;

						const renderLayout = transformMetaToRenderLayout(
							element.transform,
							canvasConvertOptions.picture,
							canvasConvertOptions.canvas,
						);
						const { x, y, width, height } = renderLayoutToTopLeft(renderLayout);
						const initial = initialPositions[selectedId];
						const baseX = initial?.x ?? x;
						const baseY = initial?.y ?? y;
						const { stageX: elementStageX, stageY: elementStageY } =
							canvasToStageCoords(baseX, baseY);
						const elementStageWidth = width * effectiveZoom;
						const elementStageHeight = height * effectiveZoom;

						minX = Math.min(minX, elementStageX);
						minY = Math.min(minY, elementStageY);
						maxX = Math.max(maxX, elementStageX + elementStageWidth);
						maxY = Math.max(maxY, elementStageY + elementStageHeight);
					});

					if (minX !== Infinity) {
						const {
							stageX: draggedInitialStageX,
							stageY: draggedInitialStageY,
						} = canvasToStageCoords(draggedInitial.x, draggedInitial.y);
						const deltaStageX = stageX - draggedInitialStageX;
						const deltaStageY = stageY - draggedInitialStageY;
						movingBox = {
							x: minX + deltaStageX,
							y: minY + deltaStageY,
							width: maxX - minX,
							height: maxY - minY,
						};
					}
				}

				const snapResult = computeSnapResult(movingBox, dragSelectedIds);
				adjustedStageX += snapResult.deltaX;
				adjustedStageY += snapResult.deltaY;
				setSnapGuides(snapResult.guides);
			} else {
				clearSnapGuides();
			}

			if (adjustedStageX !== stageX || adjustedStageY !== stageY) {
				node.position({ x: adjustedStageX, y: adjustedStageY });
			}

			// 将 Stage 坐标转换为画布坐标
			// 由于 canvas = picture 尺寸，canvas 坐标即 picture 坐标
			const { canvasX, canvasY } = stageToCanvasCoords(
				adjustedStageX,
				adjustedStageY,
			);

			// 直接使用 setState 确保更新被触发
			const newElements = currentElements.map((el) => {
				const initial = initialPositions[el.id];
				if (isMultiDrag && initial && draggedInitial) {
					const deltaX = canvasX - draggedInitial.x;
					const deltaY = canvasY - draggedInitial.y;
					const nextCanvasX = initial.x + deltaX;
					const nextCanvasY = initial.y + deltaY;

					const updatedTransform = {
						...el.transform,
						centerX: nextCanvasX + el.transform.width / 2 - pictureWidth / 2,
						centerY: nextCanvasY + el.transform.height / 2 - pictureHeight / 2,
					};

					return {
						...el,
						transform: updatedTransform,
						props: { ...el.props, left: nextCanvasX, top: nextCanvasY },
					};
				}

				// 使用 el.id 而不是 el.props.id
				if (el.id !== id) return el;

				const updatedTransform = {
					...el.transform,
					centerX: canvasX + el.transform.width / 2 - pictureWidth / 2,
					centerY: canvasY + el.transform.height / 2 - pictureHeight / 2,
				};

				return {
					...el,
					transform: updatedTransform,
					props: { ...el.props, left: canvasX, top: canvasY },
				};
			});

			useTimelineStore.setState({ elements: newElements });
		},
		[
			stageToCanvasCoords,
			pictureWidth,
			pictureHeight,
			snapEnabled,
			getEffectiveZoom,
			canvasConvertOptions,
			canvasToStageCoords,
			computeSnapResult,
			clearSnapGuides,
		],
	);

	const handleDragEnd = useCallback(
		(id: string, e: Konva.KonvaEventObject<DragEvent>) => {
			handleDrag(id, e);
			setDraggingId(null);
			clearSnapGuides();
		},
		[handleDrag, clearSnapGuides],
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

	// 更新 Transformer 的节点（时间变化时也需要刷新）
	useEffect(() => {
		if (!transformerRef.current) return;

		const stage = transformerRef.current.getStage();
		if (!stage) return;

		const nodes = selectedIds
			.map((id) => stage.findOne(`.element-${id}`))
			.filter((node): node is Konva.Node => Boolean(node));

		transformerRef.current.nodes(nodes);
		transformerRef.current.centeredScaling(altPressedRef.current);
		transformerRef.current.rotationSnaps(
			shiftPressedRef.current ? [0, 45, 90, 135, 180, 225, 270, 315] : [],
		);
		transformerRef.current.getLayer()?.batchDraw();
	}, [selectedIds, renderElements]);

	// 处理 transform 事件（实时更新）
	const handleTransformStart = useCallback(
		(id: string, e: Konva.KonvaEventObject<Event>) => {
			const node = e.target as Konva.Node;
			if ("altKey" in e.evt) {
				const eventAltPressed = Boolean((e.evt as MouseEvent).altKey);
				if (eventAltPressed !== altPressedRef.current) {
					altPressedRef.current = eventAltPressed;
					updateTransformerCenteredScaling(eventAltPressed);
				}
			}
			if ("shiftKey" in e.evt) {
				const eventShiftPressed = Boolean((e.evt as MouseEvent).shiftKey);
				if (eventShiftPressed !== shiftPressedRef.current) {
					shiftPressedRef.current = eventShiftPressed;
					updateTransformerRotationSnaps(eventShiftPressed);
				}
			}
			const effectiveZoom = getEffectiveZoom();
			const baseScaleX = node.scaleX() || 1;
			const baseScaleY = node.scaleY() || 1;
			const baseStageWidth = node.width() * baseScaleX;
			const baseStageHeight = node.height() * baseScaleY;

			transformBaseRef.current[id] = {
				stageWidth: baseStageWidth,
				stageHeight: baseStageHeight,
				canvasWidth: baseStageWidth / effectiveZoom,
				canvasHeight: baseStageHeight / effectiveZoom,
				scaleX: baseScaleX,
				scaleY: baseScaleY,
				effectiveZoom,
			};
		},
		[
			getEffectiveZoom,
			updateTransformerCenteredScaling,
			updateTransformerRotationSnaps,
		],
	);

	const handleTransform = useCallback(
		(id: string, e: Konva.KonvaEventObject<Event>) => {
			const node = e.target as Konva.Node;
			let base = transformBaseRef.current[id];
			if (!base) {
				const effectiveZoom = getEffectiveZoom();
				const baseScaleX = node.scaleX() || 1;
				const baseScaleY = node.scaleY() || 1;
				const baseStageWidth = node.width() * baseScaleX;
				const baseStageHeight = node.height() * baseScaleY;

				base = {
					stageWidth: baseStageWidth,
					stageHeight: baseStageHeight,
					canvasWidth: baseStageWidth / effectiveZoom,
					canvasHeight: baseStageHeight / effectiveZoom,
					scaleX: baseScaleX,
					scaleY: baseScaleY,
					effectiveZoom,
				};
				transformBaseRef.current[id] = base;
			}

			const scaleX = node.scaleX() / base.scaleX;
			const scaleY = node.scaleY() / base.scaleY;

			const stageX = node.x();
			const stageY = node.y();
			// 缩放后的尺寸（在 Stage 坐标系中）
			const stageWidth_scaled = base.stageWidth * scaleX;
			const stageHeight_scaled = base.stageHeight * scaleY;

			// 将 Stage 坐标转换为画布/picture 坐标
			const { canvasX, canvasY } = stageToCanvasCoords(stageX, stageY);

			// 将 Stage 尺寸转换为画布/picture 尺寸
			const pictureWidth_scaled = stageWidth_scaled / base.effectiveZoom;
			const pictureHeight_scaled = stageHeight_scaled / base.effectiveZoom;

			// 只更新元素状态，不修改节点（让 Transformer 继续工作）
			const rotationDegrees = node.rotation();
			const rotationRadians = (rotationDegrees * Math.PI) / 180;

			// 直接使用 setState 确保更新被触发
			const currentElements = useTimelineStore.getState().elements;
			const newElements = currentElements.map((el) => {
				// 使用 el.id 而不是 el.props.id
				if (el.id !== id) return el;

				// 更新 transform（使用画布中心坐标系统）
				// canvasX/Y 是左上角坐标（相对于画布左上角）
				// 需要转换为中心坐标（相对于画布中心）
				const updatedTransform = {
					centerX: canvasX + pictureWidth_scaled / 2 - pictureWidth / 2,
					centerY: canvasY + pictureHeight_scaled / 2 - pictureHeight / 2,
					width: pictureWidth_scaled,
					height: pictureHeight_scaled,
					rotation: rotationRadians,
				};

				return {
					...el,
					transform: updatedTransform,
					props: {
						...el.props,
						left: canvasX,
						top: canvasY,
						width: pictureWidth_scaled,
						height: pictureHeight_scaled,
						rotate: `${rotationDegrees}deg`,
						rotation: rotationRadians,
					},
				};
			});

			useTimelineStore.setState({ elements: newElements });
		},
		[stageToCanvasCoords, getEffectiveZoom, pictureWidth, pictureHeight],
	);

	// 处理 transform 结束事件
	const handleTransformEnd = useCallback(
		(id: string, e: Konva.KonvaEventObject<Event>) => {
			const node = e.target as Konva.Node;
			const base = transformBaseRef.current[id];
			const baseScaleX = base?.scaleX ?? 1;
			const baseScaleY = base?.scaleY ?? 1;
			const scaleX = node.scaleX() / baseScaleX;
			const scaleY = node.scaleY() / baseScaleY;

			// 重置 scale，更新 width 和 height
			node.scaleX(1);
			node.scaleY(1);

			const stageX = node.x();
			const stageY = node.y();
			// 缩放后的尺寸（在 Stage 坐标系中）
			const baseStageWidth = base?.stageWidth ?? node.width() * baseScaleX;
			const baseStageHeight = base?.stageHeight ?? node.height() * baseScaleY;
			const stageWidth_scaled = baseStageWidth * scaleX;
			const stageHeight_scaled = baseStageHeight * scaleY;

			// 将 Stage 坐标转换为画布/picture 坐标
			const { canvasX, canvasY } = stageToCanvasCoords(stageX, stageY);

			// 将 Stage 尺寸转换为画布/picture 尺寸
			const effectiveZoom = base?.effectiveZoom ?? getEffectiveZoom();
			const pictureWidth_scaled = stageWidth_scaled / effectiveZoom;
			const pictureHeight_scaled = stageHeight_scaled / effectiveZoom;

			// 更新节点的 width 和 height（使用 Stage 坐标系的尺寸）
			node.width(stageWidth_scaled);
			node.height(stageHeight_scaled);

			const rotationDegrees = node.rotation();
			const rotationRadians = (rotationDegrees * Math.PI) / 180;

			// 直接使用 setState 确保更新被触发
			const currentElements = useTimelineStore.getState().elements;
			const newElements = currentElements.map((el) => {
				// 使用 el.id 而不是 el.props.id
				if (el.id !== id) return el;

				// 更新 transform（使用画布中心坐标系统）
				// canvasX/Y 是左上角坐标（相对于画布左上角）
				// 需要转换为中心坐标（相对于画布中心）
				const updatedTransform = {
					centerX: canvasX + pictureWidth_scaled / 2 - pictureWidth / 2,
					centerY: canvasY + pictureHeight_scaled / 2 - pictureHeight / 2,
					width: pictureWidth_scaled,
					height: pictureHeight_scaled,
					rotation: rotationRadians,
				};

				return {
					...el,
					transform: updatedTransform,
				};
			});

			useTimelineStore.setState({ elements: newElements });

			delete transformBaseRef.current[id];
			clearSnapGuides();
		},
		[
			stageToCanvasCoords,
			getEffectiveZoom,
			pictureWidth,
			pictureHeight,
			clearSnapGuides,
		],
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
				deselectAll();
				return;
			}

			// 检查是否点击了元素
			const clickedId = (e.target as Konva.Node).attrs["data-id"];
			if (!clickedId) {
				return;
			}

			// 检查是否按下了 Shift 或 Ctrl/Cmd
			const metaPressed = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
			if (metaPressed) {
				toggleSelect(clickedId);
				return;
			}

			select(clickedId);
		},
		[selectionRect, deselectAll, toggleSelect, select],
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
			selectionAdditiveRef.current =
				e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;
			initialSelectedIdsRef.current = selectedIds;
			const nextRect = {
				visible: true,
				x1: canvasX,
				y1: canvasY,
				x2: canvasX,
				y2: canvasY,
			};
			selectionRectRef.current = nextRect;
			setSelectionRect(nextRect);
		},
		[stageToCanvasCoords, selectedIds],
	);

	const computeSelectedIdsInRect = useCallback(
		(rect: { x1: number; y1: number; x2: number; y2: number }) => {
			const selBox = {
				x: Math.min(rect.x1, rect.x2),
				y: Math.min(rect.y1, rect.y2),
				width: Math.abs(rect.x2 - rect.x1),
				height: Math.abs(rect.y2 - rect.y1),
			};

			const selected: string[] = [];
			renderElements.forEach((el) => {
				const renderLayout = transformMetaToRenderLayout(
					el.transform,
					canvasConvertOptions.picture,
					canvasConvertOptions.canvas,
				);
				const { x, y, width, height } = renderLayoutToTopLeft(renderLayout);

				const elBox = {
					x,
					y,
					width,
					height,
				};

				if (
					selBox.x < elBox.x + elBox.width &&
					selBox.x + selBox.width > elBox.x &&
					selBox.y < elBox.y + elBox.height &&
					selBox.y + selBox.height > elBox.y
				) {
					selected.push(el.id);
				}
			});

			return selected;
		},
		[renderElements, canvasConvertOptions],
	);

	const applyMarqueeSelection = useCallback(
		(nextRect: { x1: number; y1: number; x2: number; y2: number }) => {
			const selected = computeSelectedIdsInRect(nextRect);
			if (selectionAdditiveRef.current) {
				const merged = Array.from(
					new Set([...initialSelectedIdsRef.current, ...selected]),
				);
				const primary =
					selected[selected.length - 1] ??
					initialSelectedIdsRef.current[0] ??
					null;
				setSelection(merged, primary);
			} else {
				setSelection(selected, selected[0] ?? null);
			}
		},
		[computeSelectedIdsInRect, setSelection],
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

			const nextRect = {
				...selectionRectRef.current,
				x2: canvasX,
				y2: canvasY,
			};
			selectionRectRef.current = nextRect;
			setSelectionRect(nextRect);
			applyMarqueeSelection(nextRect);
		},
		[stageToCanvasCoords, applyMarqueeSelection],
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

		applyMarqueeSelection(selectionRectRef.current);
	}, [applyMarqueeSelection]);

	const selectionStageRect = useMemo(() => {
		if (!selectionRect.visible) return null;
		const { stageX: sx1, stageY: sy1 } = canvasToStageCoords(
			selectionRect.x1,
			selectionRect.y1,
		);
		const { stageX: sx2, stageY: sy2 } = canvasToStageCoords(
			selectionRect.x2,
			selectionRect.y2,
		);
		return {
			x: Math.min(sx1, sx2),
			y: Math.min(sy1, sy2),
			width: Math.abs(sx2 - sx1),
			height: Math.abs(sy2 - sy1),
		};
	}, [selectionRect, canvasToStageCoords]);

	const ContextBridge = useContextBridge(QueryClientContext);

	const skiaCanvasRef = useRef<CanvasRef>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [containerDimensions, setContainerDimensions] = useState({
		width: 0,
		height: 0,
	});

	// Sync canvas ref to context for export functionality
	useEffect(() => {
		setCanvasRef(skiaCanvasRef.current);
		return () => setCanvasRef(null);
	}, [setCanvasRef]);

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
		(visibleElements: TimelineElement[]) => {
			return (
				<ContextBridge>
					<Fill color="black" />
					{visibleElements.map((el) => {
						// 获取组件定义
						const componentDef = componentRegistry.get(el.type);
						if (!componentDef) {
							console.warn(
								`[PreviewEditor] Component type "${el.type}" not registered`,
							);
							console.warn(
								`[PreviewEditor] Available types:`,
								componentRegistry.getTypes(),
							);
							return null;
						}

						const Renderer = componentDef.Renderer;

						return (
							<SkiaGroup key={el.id}>
								<Renderer id={el.id} {...el.props} />
							</SkiaGroup>
						);
					})}
				</ContextBridge>
			);
		},
		[ContextBridge],
	);

	useEffect(() => {
		const renderSkia = () => {
			const state = useTimelineStore.getState();
			const displayTime = state.previewTime ?? state.currentTime;
			const visibleElements = computeVisibleElements(
				getElements(),
				displayTime,
			);
			const orderedElements = sortByTrackIndex(visibleElements);
			const children = buildSkiaChildren(orderedElements);

			const prevElements = renderElementsRef.current;
			if (
				prevElements.length !== orderedElements.length ||
				orderedElements.some((el, i) => prevElements[i] !== el)
			) {
				renderElementsRef.current = orderedElements;
				setRenderElements(orderedElements);

				skiaCanvasRef.current?.getRoot()?.render(children);
			}
		};

		// 同时监听 currentTime 和 previewTime
		const unsub1 = useTimelineStore.subscribe(
			(state) => state.currentTime,
			renderSkia,
		);
		const unsub2 = useTimelineStore.subscribe(
			(state) => state.previewTime,
			renderSkia,
		);
		return () => {
			unsub1();
			unsub2();
		};
	}, [buildSkiaChildren, getElements, sortByTrackIndex]);

	useEffect(() => {
		return useTimelineStore.subscribe(
			(state) => state.elements,
			(newElements) => {
				const root = skiaCanvasRef.current?.getRoot();
				if (!root) return;

				const time = getDisplayTime();
				const visibleElements = computeVisibleElements(newElements, time);
				const orderedElements = sortByTrackIndex(visibleElements);
				const children = buildSkiaChildren(orderedElements);
				root.render(children);

				// Update Konva layer
				renderElementsRef.current = orderedElements;
				setRenderElements(orderedElements);
			},
			{
				fireImmediately: true,
			},
		);
	}, [buildSkiaChildren]);

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

	const stageWidth = containerDimensions.width || canvasWidth;
	const stageHeight = containerDimensions.height || canvasHeight;

	return (
		<div
			ref={containerRef}
			className="w-full h-full overflow-hidden"
			style={{ touchAction: "none", position: "relative" }}
			data-preview-drop-zone
			data-zoom-level={zoomLevel}
			data-offset-x={offsetX}
			data-offset-y={offsetY}
			data-picture-width={pictureWidth}
			data-picture-height={pictureHeight}
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
					{selectionStageRect &&
						selectionStageRect.width > 0 &&
						selectionStageRect.height > 0 && (
							<KonvaRect
								x={selectionStageRect.x}
								y={selectionStageRect.y}
								width={selectionStageRect.width}
								height={selectionStageRect.height}
								fill="rgba(59,130,246,0.15)"
								stroke="rgba(59,130,246,0.8)"
								strokeWidth={1}
								dash={[6, 4]}
							/>
						)}
					{snapGuides.vertical.map((x, index) => (
						<KonvaLine
							key={`snap-v-${index}`}
							points={[x, 0, x, stageHeight]}
							stroke="rgba(59,130,246,0.8)"
							strokeWidth={1}
							dash={[4, 4]}
							listening={false}
						/>
					))}
					{snapGuides.horizontal.map((y, index) => (
						<KonvaLine
							key={`snap-h-${index}`}
							points={[0, y, stageWidth, y]}
							stroke="rgba(59,130,246,0.8)"
							strokeWidth={1}
							dash={[4, 4]}
							listening={false}
						/>
					))}
					{renderElements.map((el) => {
						const { id } = el;
						const isHovered = hoveredId === id;
						const isDragging = draggingId === id;
						const isSelected = selectedIds.includes(id);

						const renderLayout = transformMetaToRenderLayout(
							el.transform,
							canvasConvertOptions.picture,
							canvasConvertOptions.canvas,
						);
						const {
							x: canvasX,
							y: canvasY,
							width: canvasWidth_el,
							height: canvasHeight_el,
							rotation: rotate,
						} = renderLayoutToTopLeft(renderLayout);

						// 将画布坐标转换为 Stage 坐标
						const { stageX, stageY } = canvasToStageCoords(canvasX, canvasY);

						// 将画布尺寸转换为 Stage 尺寸
						const effectiveZoom = pinchState.isPinching
							? pinchState.currentZoom
							: zoomLevel;
						const baseTransform = transformBaseRef.current[id];
						const canvasWidth = baseTransform?.canvasWidth ?? canvasWidth_el;
						const canvasHeight = baseTransform?.canvasHeight ?? canvasHeight_el;
						const stageWidth = canvasWidth * effectiveZoom;
						const stageHeight = canvasHeight * effectiveZoom;

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
												? "rgba(255,0,0,0.8)"
												: isHovered
													? "rgba(255,0,0,0.6)"
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
									onTransformStart={(e: Konva.KonvaEventObject<Event>) =>
										handleTransformStart(id, e)
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
							const activeAnchor = transformerRef.current?.getActiveAnchor?.();
							if (activeAnchor === "rotater") {
								clearSnapGuides();
								return newBox;
							}

							const isCornerAnchor =
								activeAnchor === "top-left" ||
								activeAnchor === "top-right" ||
								activeAnchor === "bottom-left" ||
								activeAnchor === "bottom-right";

							const getFixedCorner = () => {
								switch (activeAnchor) {
									case "top-left":
										return {
											x: oldBox.x + oldBox.width,
											y: oldBox.y + oldBox.height,
										};
									case "top-right":
										return {
											x: oldBox.x,
											y: oldBox.y + oldBox.height,
										};
									case "bottom-left":
										return {
											x: oldBox.x + oldBox.width,
											y: oldBox.y,
										};
									case "bottom-right":
										return { x: oldBox.x, y: oldBox.y };
									default:
										return { x: oldBox.x, y: oldBox.y };
								}
							};

							const getMovingCorner = (box: {
								x: number;
								y: number;
								width: number;
								height: number;
							}) => {
								switch (activeAnchor) {
									case "top-left":
										return { x: box.x, y: box.y };
									case "top-right":
										return { x: box.x + box.width, y: box.y };
									case "bottom-left":
										return { x: box.x, y: box.y + box.height };
									case "bottom-right":
										return { x: box.x + box.width, y: box.y + box.height };
									default:
										return { x: box.x, y: box.y };
								}
							};

							const buildCornerBox = (
								desiredCorner: { x: number; y: number },
								snapAxis: "x" | "y" | null,
							) => {
								const ratio =
									oldBox.height === 0 ? 1 : oldBox.width / oldBox.height;
								const fixed = getFixedCorner();
								const widthFromCorner = Math.abs(desiredCorner.x - fixed.x);
								const heightFromCorner = Math.abs(desiredCorner.y - fixed.y);

								let width = 0;
								let height = 0;

								if (snapAxis === "x") {
									width = widthFromCorner;
									height = ratio === 0 ? 0 : width / ratio;
								} else if (snapAxis === "y") {
									height = heightFromCorner;
									width = height * ratio;
								} else {
									const denom =
										oldBox.width * oldBox.width + oldBox.height * oldBox.height;
									const scale =
										denom === 0
											? 1
											: (oldBox.width * widthFromCorner +
													oldBox.height * heightFromCorner) /
												denom;
									width = oldBox.width * scale;
									height = oldBox.height * scale;
								}

								switch (activeAnchor) {
									case "top-left":
										return {
											...newBox,
											x: fixed.x - width,
											y: fixed.y - height,
											width,
											height,
										};
									case "top-right":
										return {
											...newBox,
											x: fixed.x,
											y: fixed.y - height,
											width,
											height,
										};
									case "bottom-left":
										return {
											...newBox,
											x: fixed.x - width,
											y: fixed.y,
											width,
											height,
										};
									case "bottom-right":
										return {
											...newBox,
											x: fixed.x,
											y: fixed.y,
											width,
											height,
										};
									default:
										return newBox;
								}
							};

							let baseBox = newBox;
							if (isCornerAnchor) {
								baseBox = buildCornerBox(getMovingCorner(newBox), null);
							}

							// 限制最小尺寸
							if (baseBox.width < 5 || baseBox.height < 5) {
								return oldBox;
							}
							if (!snapEnabled) {
								clearSnapGuides();
								return baseBox;
							}

							if (isCornerAnchor) {
								const movingCorner = getMovingCorner(baseBox);
								const snapResult = computeSnapResult(baseBox, selectedIds, {
									movingX: [movingCorner.x],
									movingY: [movingCorner.y],
								});
								const snapX = snapResult.deltaX !== 0;
								const snapY = snapResult.deltaY !== 0;

								if (!snapX && !snapY) {
									setSnapGuides(snapResult.guides);
									return baseBox;
								}

								let snapAxis: "x" | "y";
								if (snapX && snapY) {
									snapAxis =
										Math.abs(snapResult.deltaX) <= Math.abs(snapResult.deltaY)
											? "x"
											: "y";
								} else {
									snapAxis = snapX ? "x" : "y";
								}

								const snappedCorner = {
									x:
										movingCorner.x + (snapAxis === "x" ? snapResult.deltaX : 0),
									y:
										movingCorner.y + (snapAxis === "y" ? snapResult.deltaY : 0),
								};

								const snappedBox = buildCornerBox(snappedCorner, snapAxis);
								if (snappedBox.width < 5 || snappedBox.height < 5) {
									return oldBox;
								}

								setSnapGuides({
									vertical: snapAxis === "x" ? snapResult.guides.vertical : [],
									horizontal:
										snapAxis === "y" ? snapResult.guides.horizontal : [],
								});
								return snappedBox;
							}

							const leftMoved = baseBox.x !== oldBox.x;
							const rightMoved =
								baseBox.x + baseBox.width !== oldBox.x + oldBox.width;
							const topMoved = baseBox.y !== oldBox.y;
							const bottomMoved =
								baseBox.y + baseBox.height !== oldBox.y + oldBox.height;

							const movingX: number[] = [];
							if (leftMoved && !rightMoved) {
								movingX.push(baseBox.x);
							} else if (rightMoved && !leftMoved) {
								movingX.push(baseBox.x + baseBox.width);
							} else if (leftMoved && rightMoved) {
								movingX.push(baseBox.x + baseBox.width / 2);
							}

							const movingY: number[] = [];
							if (topMoved && !bottomMoved) {
								movingY.push(baseBox.y);
							} else if (bottomMoved && !topMoved) {
								movingY.push(baseBox.y + baseBox.height);
							} else if (topMoved && bottomMoved) {
								movingY.push(baseBox.y + baseBox.height / 2);
							}

							const snapResult = computeSnapResult(baseBox, selectedIds, {
								movingX,
								movingY,
							});
							if (snapResult.deltaX === 0 && snapResult.deltaY === 0) {
								setSnapGuides(snapResult.guides);
								return baseBox;
							}

							const nextBox = { ...baseBox };

							if (snapResult.deltaX !== 0) {
								if (leftMoved && !rightMoved) {
									nextBox.x += snapResult.deltaX;
									nextBox.width -= snapResult.deltaX;
								} else if (rightMoved && !leftMoved) {
									nextBox.width += snapResult.deltaX;
								} else if (leftMoved && rightMoved) {
									nextBox.x += snapResult.deltaX;
								}
							}

							if (snapResult.deltaY !== 0) {
								if (topMoved && !bottomMoved) {
									nextBox.y += snapResult.deltaY;
									nextBox.height -= snapResult.deltaY;
								} else if (bottomMoved && !topMoved) {
									nextBox.height += snapResult.deltaY;
								} else if (topMoved && bottomMoved) {
									nextBox.y += snapResult.deltaY;
								}
							}

							if (nextBox.width < 5 || nextBox.height < 5) {
								return oldBox;
							}

							setSnapGuides(snapResult.guides);
							return nextBox;
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
