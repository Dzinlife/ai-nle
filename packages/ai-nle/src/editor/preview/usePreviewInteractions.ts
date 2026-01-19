import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	renderLayoutToTopLeft,
	transformMetaToRenderLayout,
} from "@/dsl/layout";
import type { TimelineElement } from "@/dsl/types";
import {
	useMultiSelect,
	useSnap,
	useTimelineStore,
	useTrackAssignments,
} from "../contexts/TimelineContext";
import {
	assignTracks,
	normalizeTrackAssignments,
} from "../utils/trackAssignment";
import type { CanvasConvertOptions } from "./utils";

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

type SelectionRect = {
	visible: boolean;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
};

type TransformerBox = {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
};

export interface UsePreviewInteractionsOptions {
	renderElements: TimelineElement[];
	renderElementsRef: React.MutableRefObject<TimelineElement[]>;
	canvasConvertOptions: CanvasConvertOptions;
	pictureWidth: number;
	pictureHeight: number;
	canvasWidth: number;
	canvasHeight: number;
	getEffectiveZoom: () => number;
	stageToCanvasCoords: (
		stageX: number,
		stageY: number,
	) => {
		canvasX: number;
		canvasY: number;
	};
	canvasToStageCoords: (
		canvasX: number,
		canvasY: number,
	) => {
		stageX: number;
		stageY: number;
	};
}

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

const createCopySeed = () =>
	`${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const cloneValue = <T>(value: T): T => {
	if (value === null || value === undefined) {
		return value;
	}
	if (typeof structuredClone === "function") {
		try {
			return structuredClone(value);
		} catch {
			// fall through to JSON clone
		}
	}
	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch {
		return value;
	}
};

const createCopyElement = (source: TimelineElement, copyId: string) => ({
	...source,
	id: copyId,
	props: cloneValue(source.props),
	transform: cloneValue(source.transform),
	render: cloneValue(source.render),
	timeline: { ...source.timeline },
	...(source.clip ? { clip: cloneValue(source.clip) } : {}),
});

export const usePreviewInteractions = ({
	renderElements,
	renderElementsRef,
	canvasConvertOptions,
	pictureWidth,
	pictureHeight,
	canvasWidth,
	canvasHeight,
	getEffectiveZoom,
	stageToCanvasCoords,
	canvasToStageCoords,
}: UsePreviewInteractionsOptions) => {
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const { selectedIds, select, toggleSelect, deselectAll, setSelection } =
		useMultiSelect();
	const { snapEnabled } = useSnap();
	const { trackAssignments } = useTrackAssignments();
	const [selectionRect, setSelectionRect] = useState<SelectionRect>({
		visible: false,
		x1: 0,
		y1: 0,
		x2: 0,
		y2: 0,
	});
	const stageRef = useRef<Konva.Stage | null>(null);
	const transformerRef = useRef<Konva.Transformer | null>(null);
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
	const copyModeRef = useRef(false);
	const copyIdMapRef = useRef<Map<string, string>>(new Map());
	const copySourceIdsRef = useRef<string[]>([]);
	const copySourceSnapshotsRef = useRef<Map<string, TimelineElement>>(
		new Map(),
	);
	const dragAnchorIdRef = useRef<string | null>(null);
	const suppressDragStartRef = useRef(false);
	const suppressDragEndRef = useRef<Set<string>>(new Set());
	const dragHasMovedRef = useRef(false);

	const clearSnapGuides = useCallback(() => {
		setSnapGuides({ vertical: [], horizontal: [] });
	}, []);

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
		[getElementStageBox, getCanvasStageRect, renderElementsRef],
	);

	const getTrackIndexForElement = useCallback(
		(el: TimelineElement) =>
			trackAssignments.get(el.id) ?? el.timeline.trackIndex ?? 0,
		[trackAssignments],
	);

	const clearCopyState = useCallback(() => {
		copyModeRef.current = false;
		copyIdMapRef.current = new Map();
		copySourceIdsRef.current = [];
		copySourceSnapshotsRef.current = new Map();
		dragAnchorIdRef.current = null;
		suppressDragStartRef.current = false;
		suppressDragEndRef.current.clear();
		dragHasMovedRef.current = false;
	}, []);

	const applyTrackAssignments = useCallback(
		(nextElements: TimelineElement[]) => {
			if (nextElements.length === 0) return nextElements;
			const normalized = normalizeTrackAssignments(assignTracks(nextElements));
			let didChange = false;
			const withTracks = nextElements.map((el) => {
				const nextTrack = normalized.get(el.id);
				const currentTrack = el.timeline.trackIndex ?? 0;
				if (nextTrack === undefined || nextTrack === currentTrack) return el;
				didChange = true;
				return { ...el, timeline: { ...el.timeline, trackIndex: nextTrack } };
			});
			return didChange ? withTracks : nextElements;
		},
		[],
	);

	const handleMouseDown = useCallback((id: string) => {
		setDraggingId(id);
	}, []);

	const handleMouseUp = useCallback(() => {
		setDraggingId(null);
		clearSnapGuides();
	}, [clearSnapGuides]);

	const handleDragStart = useCallback(
		(id: string, e: Konva.KonvaEventObject<DragEvent>) => {
			if (suppressDragStartRef.current) {
				suppressDragStartRef.current = false;
				return;
			}
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

			const isCopyDragStart = Boolean(
				(e.evt as MouseEvent | undefined)?.altKey,
			);
			copyModeRef.current = isCopyDragStart;
			dragHasMovedRef.current = false;

			let dragSelectedIds = nextSelectedIds;
			let dragPositions: Record<string, { x: number; y: number }> = {};
			let draggingIndicatorId = id;

			if (isCopyDragStart) {
				copySourceIdsRef.current = nextSelectedIds;
				const sourceSnapshots = new Map<string, TimelineElement>();
				nextSelectedIds.forEach((sourceId) => {
					const source = currentElements.find((el) => el.id === sourceId);
					if (source) sourceSnapshots.set(sourceId, source);
				});
				copySourceSnapshotsRef.current = sourceSnapshots;

				const seed = createCopySeed();
				const nextMap = new Map<string, string>();
				nextSelectedIds.forEach((sourceId, index) => {
					nextMap.set(sourceId, `element-${seed}-${index}`);
				});
				copyIdMapRef.current = nextMap;

				const copyIds = nextSelectedIds
					.map((sourceId) => nextMap.get(sourceId))
					.filter((copyId): copyId is string => Boolean(copyId));

				const copies = currentElements
					.map((el) => {
						const copyId = nextMap.get(el.id);
						if (!copyId || !nextSelectedIds.includes(el.id)) return null;
						return createCopyElement(el, copyId);
					})
					.filter(Boolean) as TimelineElement[];

				if (copies.length > 0) {
					useTimelineStore.setState({
						elements: [...currentElements, ...copies],
					});
				}

				// 在 alt 复制模式下，我们继续拖拽源元素，但将位移应用到副本上
				// 保持选中源元素，这样 Transformer 可以正确绑定到现有的源节点
				// 拖拽结束后再切换选择到副本
				// dragSelectedIds 存储副本 ID，用于在 handleDrag 中更新副本元素
				dragSelectedIds = [...copyIds];
				// dragPositions 存储副本 ID -> 源元素初始位置的映射
				nextSelectedIds.forEach((sourceId) => {
					const copyId = nextMap.get(sourceId);
					const position = positions[sourceId];
					if (!copyId || !position) return;
					dragPositions[copyId] = position;
				});

				// 不切换选择，保持源元素被选中（Transformer 绑定到源节点）
				draggingIndicatorId = id; // 继续使用源元素 ID
				// dragAnchorId 使用被点击源元素对应的副本 ID
				const primaryCopyId = nextMap.get(id) ?? copyIds[0] ?? id;
				dragAnchorIdRef.current = primaryCopyId;
			} else {
				copyIdMapRef.current = new Map();
				copySourceIdsRef.current = [];
				copySourceSnapshotsRef.current = new Map();
				dragAnchorIdRef.current = id;
				dragPositions = positions;
			}

			dragSelectedIdsRef.current = dragSelectedIds;
			dragInitialPositionsRef.current = dragPositions;

			setDraggingId(draggingIndicatorId);
			setHoveredId(draggingIndicatorId); // 拖拽开始时保持 hover 状态
		},
		[selectedIds, setSelection, canvasConvertOptions],
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
			const dragAnchorId = dragAnchorIdRef.current ?? id;
			const isMultiDrag =
				dragSelectedIds.length > 1 && dragSelectedIds.includes(dragAnchorId);
			const draggedInitial = initialPositions[dragAnchorId];

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

				const snapExcludeIds = copyModeRef.current
					? [...dragSelectedIds, ...copySourceIdsRef.current]
					: dragSelectedIds;
				const snapResult = computeSnapResult(movingBox, snapExcludeIds);
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

			if (draggedInitial) {
				const deltaX = canvasX - draggedInitial.x;
				const deltaY = canvasY - draggedInitial.y;
				if (deltaX !== 0 || deltaY !== 0) {
					dragHasMovedRef.current = true;
				}
			}

			// 在多选拖拽时，直接更新所有选中节点的 Konva 位置
			// 这可以防止 Transformer 与元素位置不同步导致的抖动
			// 注意：在 alt 复制模式下跳过此逻辑，因为副本节点可能还不存在
			// 我们依赖 React 重新渲染来更新副本节点的位置
			if (isMultiDrag && draggedInitial && !copyModeRef.current) {
				const stage = node.getStage();
				const deltaCanvasX = canvasX - draggedInitial.x;
				const deltaCanvasY = canvasY - draggedInitial.y;

				dragSelectedIds.forEach((selectedId) => {
					if (selectedId === dragAnchorId) return; // 锚点节点已经更新
					const initial = initialPositions[selectedId];
					if (!initial) return;

					const otherNode = stage?.findOne(
						`.element-${selectedId}`,
					) as Konva.Node | null;
					if (!otherNode) return;

					const nextCanvasX = initial.x + deltaCanvasX;
					const nextCanvasY = initial.y + deltaCanvasY;
					const { stageX: nextStageX, stageY: nextStageY } =
						canvasToStageCoords(nextCanvasX, nextCanvasY);
					otherNode.position({ x: nextStageX, y: nextStageY });
				});
			}

			// 直接使用 setState 确保更新被触发
			const newElements = currentElements.map((el) => {
				const isDragged = dragSelectedIds.includes(el.id);
				const initial = initialPositions[el.id];
				if (isMultiDrag && isDragged && initial && draggedInitial) {
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
				if (!isDragged || el.id !== dragAnchorId) return el;

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
			if (suppressDragEndRef.current.has(id)) {
				suppressDragEndRef.current.delete(id);
				return;
			}
			handleDrag(id, e);
			setDraggingId(null);
			clearSnapGuides();

			if (copyModeRef.current) {
				// Always restore original elements to their pre-copy snapshot.
				const snapshots = copySourceSnapshotsRef.current;
				if (snapshots.size > 0) {
					const currentElements = useTimelineStore.getState().elements;
					const restored = currentElements.map(
						(el) => snapshots.get(el.id) ?? el,
					);
					useTimelineStore.setState({ elements: restored });
				}

				// If there was no movement, treat it as a cancelled copy-drag.
				if (!dragHasMovedRef.current) {
					const copyIds = new Set(copyIdMapRef.current.values());
					if (copyIds.size > 0) {
						const currentElements = useTimelineStore.getState().elements;
						const nextElements = currentElements.filter(
							(el) => !copyIds.has(el.id),
						);
						useTimelineStore.setState({ elements: nextElements });
					}

					const sources = copySourceIdsRef.current;
					if (sources.length > 0) {
						const primaryId = sources.includes(id) ? id : (sources[0] ?? null);
						setSelection(sources, primaryId);
					}
				} else {
					// 复制成功，切换选择到副本元素
					const copyIds = Array.from(copyIdMapRef.current.values());
					if (copyIds.length > 0) {
						const primaryCopyId = copyIdMapRef.current.get(id) ?? copyIds[0];
						setSelection(copyIds, primaryCopyId ?? null);
					}

					// Align stored trackIndex with TimelineEditor's post-drop behavior.
					const currentElements = useTimelineStore.getState().elements;
					useTimelineStore.setState({
						elements: applyTrackAssignments(currentElements),
					});
				}
			}

			clearCopyState();
		},
		[
			handleDrag,
			clearSnapGuides,
			clearCopyState,
			setSelection,
			applyTrackAssignments,
		],
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

		const visibleSelectedIds = selectedIds.filter((id) =>
			renderElements.some((el) => el.id === id),
		);
		const nodes = visibleSelectedIds
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

	const transformerBoundBoxFunc = useCallback(
		(oldBox: TransformerBox, newBox: TransformerBox): TransformerBox => {
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
				const ratio = oldBox.height === 0 ? 1 : oldBox.width / oldBox.height;
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
					x: movingCorner.x + (snapAxis === "x" ? snapResult.deltaX : 0),
					y: movingCorner.y + (snapAxis === "y" ? snapResult.deltaY : 0),
				};

				const snappedBox = buildCornerBox(snappedCorner, snapAxis);
				if (snappedBox.width < 5 || snappedBox.height < 5) {
					return oldBox;
				}

				setSnapGuides({
					vertical: snapAxis === "x" ? snapResult.guides.vertical : [],
					horizontal: snapAxis === "y" ? snapResult.guides.horizontal : [],
				});
				return snappedBox;
			}

			const leftMoved = baseBox.x !== oldBox.x;
			const rightMoved = baseBox.x + baseBox.width !== oldBox.x + oldBox.width;
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
		},
		[clearSnapGuides, computeSnapResult, snapEnabled, selectedIds],
	);

	return {
		stageRef,
		transformerRef,
		selectedIds,
		hoveredId,
		draggingId,
		snapGuides,
		selectionRect,
		selectionStageRect,
		getTrackIndexForElement,
		transformerBoundBoxFunc,
		handleMouseDown,
		handleMouseUp,
		handleDragStart,
		handleDrag,
		handleDragEnd,
		handleTransformStart,
		handleTransform,
		handleTransformEnd,
		handleMouseEnter,
		handleMouseLeave,
		handleStageClick,
		handleStageMouseDown,
		handleStageMouseMove,
		handleStageMouseUp,
		transformBaseRef,
	};
};
