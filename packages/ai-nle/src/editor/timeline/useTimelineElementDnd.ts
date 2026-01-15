/**
 * Timeline element drag-and-drop behavior (single + multi).
 */
import { useRef } from "react";
import { useDrag } from "@use-gesture/react";
import { TimelineElement } from "@/dsl/types";
import {
	DragGhostState,
	ExtendedDropTarget,
	SnapPoint,
} from "./types";
import {
	calculateDragResult,
	calculateFinalTrack,
	DEFAULT_ELEMENT_HEIGHT,
} from "./index";
import { applySnap, applySnapForDrag, collectSnapPoints } from "../utils/snap";
import { useTimelineStore } from "../contexts/TimelineContext";

interface UseTimelineElementDndOptions {
	element: TimelineElement;
	trackIndex: number;
	trackY: number;
	ratio: number;
	trackHeight: number;
	trackCount: number;
	maxDuration?: number;
	elements: TimelineElement[];
	currentTime: number;
	snapEnabled: boolean;
	autoAttach: boolean;
	attachments: Map<string, string[]>;
	selectedIds: string[];
	select: (id: string, additive?: boolean) => void;
	setSelection: (ids: string[], primaryId?: string | null) => void;
	updateTimeRange: (elementId: string, start: number, end: number) => void;
	moveWithAttachments: (
		elementId: string,
		start: number,
		end: number,
		dropTarget: { trackIndex: number; type: "track" | "gap" },
		attachedChildren: { id: string; start: number; end: number }[],
	) => void;
	setElements: (
		elements:
			| TimelineElement[]
			| ((prev: TimelineElement[]) => TimelineElement[]),
	) => void;
	setIsDragging: (isDragging: boolean) => void;
	setActiveSnapPoint: (point: SnapPoint | null) => void;
	setActiveDropTarget: (target: ExtendedDropTarget | null) => void;
	setDragGhosts: (ghosts: DragGhostState[]) => void;
	setLocalStartTime: (time: number | null) => void;
	setLocalEndTime: (time: number | null) => void;
	setLocalTrackY: (y: number | null) => void;
	stopAutoScroll: () => void;
	updateAutoScrollFromPosition: (
		screenX: number,
		containerLeft: number,
		containerRight: number,
	) => void;
	updateAutoScrollYFromPosition: (
		screenY: number,
		containerTop: number,
		containerBottom: number,
	) => void;
	elementRef: React.RefObject<HTMLDivElement | null>;
}

interface DragRefs {
	initialStart: number;
	initialEnd: number;
	initialTrack: number;
	currentStart: number;
	currentEnd: number;
}

const findDropTargetFromScreenPosition = (
	mouseX: number,
	mouseY: number,
	otherTrackCountFallback: number,
	trackHeightFallback: number,
): { trackIndex: number; type: "track" | "gap" } => {
	const mainZone = document.querySelector<HTMLElement>(
		'[data-track-drop-zone="main"]',
	);
	const otherZone = document.querySelector<HTMLElement>(
		'[data-track-drop-zone="other"]',
	);

	if (mainZone) {
		const rect = mainZone.getBoundingClientRect();
		if (
			mouseY >= rect.top &&
			mouseY <= rect.bottom &&
			mouseX >= rect.left &&
			mouseX <= rect.right
		) {
			return { trackIndex: 0, type: "track" };
		}
	}

	if (otherZone) {
		const rect = otherZone.getBoundingClientRect();
		const datasetTrackCount = parseInt(
			otherZone.dataset.trackCount || "0",
			10,
		);
		const otherTrackCount =
			datasetTrackCount > 0
				? datasetTrackCount
				: Math.max(otherTrackCountFallback, 0);
		const datasetTrackHeight = parseInt(
			otherZone.dataset.trackHeight || "0",
			10,
		);
		const zoneTrackHeight =
			datasetTrackHeight > 0 ? datasetTrackHeight : trackHeightFallback;

		if (
			mouseY >= rect.top &&
			mouseY <= rect.bottom &&
			mouseX >= rect.left &&
			mouseX <= rect.right &&
			otherTrackCount > 0
		) {
			const contentArea = otherZone.querySelector<HTMLElement>(
				'[data-track-content-area="other"]',
			);
			let contentTop = rect.top;
			if (contentArea) {
				const contentRect = contentArea.getBoundingClientRect();
				contentTop = contentRect.top;
			}

			const contentRelativeY = mouseY - contentTop;
			if (contentRelativeY < 0) {
				return { trackIndex: otherTrackCount, type: "track" };
			}

			const trackFromTop = Math.floor(contentRelativeY / zoneTrackHeight);
			const targetTrackIndex = Math.max(
				1,
				Math.min(otherTrackCount, otherTrackCount - trackFromTop),
			);
			return { trackIndex: targetTrackIndex, type: "track" };
		}
	}

	if (mainZone && otherZone) {
		const mainRect = mainZone.getBoundingClientRect();
		const otherRect = otherZone.getBoundingClientRect();

		if (mouseY > mainRect.top) {
			return { trackIndex: 0, type: "track" };
		}

		if (mouseY < otherRect.top) {
			const datasetTrackCount = parseInt(
				otherZone.dataset.trackCount || "0",
				10,
			);
			const otherTrackCount =
				datasetTrackCount > 0
					? datasetTrackCount
					: Math.max(otherTrackCountFallback, 0);
			return { trackIndex: Math.max(1, otherTrackCount), type: "track" };
		}
	}

	return { trackIndex: 0, type: "track" };
};

const createGhostFromNode = (
	ghostSource: HTMLElement,
	element: TimelineElement,
): DragGhostState => {
	const rect = ghostSource.getBoundingClientRect();
	const clone = ghostSource.cloneNode(true) as HTMLElement;
	clone.removeAttribute("data-timeline-element");
	clone.style.position = "relative";
	clone.style.left = "0";
	clone.style.top = "0";
	clone.style.opacity = "1";

	return {
		elementId: element.id,
		element,
		screenX: rect.left,
		screenY: rect.top,
		width: rect.width,
		height: rect.height,
		clonedHtml: clone.outerHTML,
	};
};

export const useTimelineElementDnd = ({
	element,
	trackIndex,
	trackY,
	ratio,
	trackHeight,
	trackCount,
	maxDuration,
	elements,
	currentTime,
	snapEnabled,
	autoAttach,
	attachments,
	selectedIds,
	select,
	setSelection,
	updateTimeRange,
	moveWithAttachments,
	setElements,
	setIsDragging,
	setActiveSnapPoint,
	setActiveDropTarget,
	setDragGhosts,
	setLocalStartTime,
	setLocalEndTime,
	setLocalTrackY,
	stopAutoScroll,
	updateAutoScrollFromPosition,
	updateAutoScrollYFromPosition,
	elementRef,
}: UseTimelineElementDndOptions) => {
	const dragRefs = useRef<DragRefs>({
		initialStart: 0,
		initialEnd: 0,
		initialTrack: 0,
		currentStart: element.timeline.start,
		currentEnd: element.timeline.end,
	});
	const dragSelectedIdsRef = useRef<string[]>([]);
	const dragInitialElementsRef = useRef<
		Map<string, { start: number; end: number; trackIndex: number }>
	>(new Map());
	const dragMinStartRef = useRef(0);
	const initialElementsSnapshotRef = useRef<TimelineElement[]>([]);
	const initialGhostsRef = useRef<DragGhostState[]>([]);
	const initialMouseOffsetRef = useRef({ x: 0, y: 0 });
	const initialScrollLeftRef = useRef(0);
	const clonedHtmlRef = useRef("");

	dragRefs.current.currentStart = element.timeline.start;
	dragRefs.current.currentEnd = element.timeline.end;

	const bindLeftDrag = useDrag(
		({ movement: [mx], first, last, event, tap }) => {
			if (tap) return;
			if (first) {
				event?.stopPropagation();
				if (!selectedIds.includes(element.id)) {
					select(element.id);
				}
				setIsDragging(true);
				dragRefs.current.initialStart = dragRefs.current.currentStart;
				dragRefs.current.initialEnd = dragRefs.current.currentEnd;
			}

			const deltaTime = mx / ratio;
			let newStart = Math.max(
				0,
				Math.min(
					dragRefs.current.initialStart + deltaTime,
					dragRefs.current.initialEnd - 0.1,
				),
			);

			if (maxDuration !== undefined) {
				newStart = Math.max(newStart, dragRefs.current.initialEnd - maxDuration);
			}

			let snapPoint = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, element.id);
				const snapped = applySnap(newStart, snapPoints, ratio);
				if (
					snapped.snapPoint &&
					snapped.time >= 0 &&
					snapped.time < dragRefs.current.initialEnd - 0.1
				) {
					newStart = snapped.time;
					snapPoint = snapped.snapPoint;
				}
			}

			if (last) {
				setIsDragging(false);
				setActiveSnapPoint(null);
				if (Math.abs(mx) > 0) {
					updateTimeRange(element.id, newStart, dragRefs.current.initialEnd);
				}
			} else {
				setLocalStartTime(newStart);
				setActiveSnapPoint(snapPoint);
			}
		},
		{ axis: "x", filterTaps: true },
	);

	const bindRightDrag = useDrag(
		({ movement: [mx], first, last, event, tap }) => {
			if (tap) return;
			if (first) {
				event?.stopPropagation();
				setIsDragging(true);
				dragRefs.current.initialStart = dragRefs.current.currentStart;
				dragRefs.current.initialEnd = dragRefs.current.currentEnd;
			}

			const deltaTime = mx / ratio;
			let newEnd = Math.max(
				dragRefs.current.initialStart + 0.1,
				dragRefs.current.initialEnd + deltaTime,
			);

			if (maxDuration !== undefined) {
				newEnd = Math.min(newEnd, dragRefs.current.initialStart + maxDuration);
			}

			let snapPoint = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, element.id);
				const snapped = applySnap(newEnd, snapPoints, ratio);
				if (
					snapped.snapPoint &&
					snapped.time > dragRefs.current.initialStart + 0.1
				) {
					newEnd = snapped.time;
					snapPoint = snapped.snapPoint;
				}
			}

			if (last) {
				setIsDragging(false);
				setActiveSnapPoint(null);
				if (Math.abs(mx) > 0) {
					updateTimeRange(element.id, dragRefs.current.initialStart, newEnd);
				}
			} else {
				setLocalEndTime(newEnd);
				setActiveSnapPoint(snapPoint);
			}
		},
		{ axis: "x", filterTaps: true },
	);

	const bindBodyDrag = useDrag(
		({ movement: [mx, my], first, last, event, tap, xy }) => {
			if (tap) return;
			const currentScrollLeft = useTimelineStore.getState().scrollLeft;
			const maxStoredTrack = Math.max(
				0,
				...elements.map((el) => el.timeline.trackIndex ?? 0),
			);
			const otherTrackCount = Math.max(maxStoredTrack, trackCount - 1, 0);

			if (first) {
				event?.stopPropagation();
				setIsDragging(true);
				const nextSelectedIds = selectedIds.includes(element.id)
					? selectedIds
					: [element.id];
				if (!selectedIds.includes(element.id)) {
					setSelection([element.id], element.id);
				}
				dragSelectedIdsRef.current = nextSelectedIds;

				const initialMap = new Map<
					string,
					{ start: number; end: number; trackIndex: number }
				>();
				let minStart = Infinity;
				for (const el of elements) {
					if (!nextSelectedIds.includes(el.id)) continue;
					const trackIndexValue = el.timeline.trackIndex ?? 0;
					initialMap.set(el.id, {
						start: el.timeline.start,
						end: el.timeline.end,
						trackIndex: trackIndexValue,
					});
					minStart = Math.min(minStart, el.timeline.start);
				}
				dragInitialElementsRef.current = initialMap;
				dragMinStartRef.current = Number.isFinite(minStart) ? minStart : 0;
				initialElementsSnapshotRef.current = elements;

				dragRefs.current.initialStart = dragRefs.current.currentStart;
				dragRefs.current.initialEnd = dragRefs.current.currentEnd;
				dragRefs.current.initialTrack = trackIndex;
				initialScrollLeftRef.current = currentScrollLeft;

				const target = event?.target as HTMLElement;
				const rect = target
					?.closest("[data-timeline-element]")
					?.getBoundingClientRect();
				if (rect) {
					initialMouseOffsetRef.current = {
						x: xy[0] - rect.left,
						y: xy[1] - rect.top,
					};
				}

				const isMultiDrag = nextSelectedIds.length > 1;
				if (!isMultiDrag) {
					if (elementRef.current) {
						const clone = elementRef.current.cloneNode(true) as HTMLElement;
						clone.removeAttribute("data-timeline-element");
						clone.style.position = "relative";
						clone.style.left = "0";
						clone.style.top = "0";
						clone.style.opacity = "1";
						clonedHtmlRef.current = clone.outerHTML;
					}

					const ghostWidth =
						(dragRefs.current.currentEnd - dragRefs.current.currentStart) * ratio;
					setDragGhosts([
						{
							elementId: element.id,
							element,
							screenX: xy[0] - initialMouseOffsetRef.current.x,
							screenY: xy[1] - initialMouseOffsetRef.current.y,
							width: ghostWidth,
							height: DEFAULT_ELEMENT_HEIGHT,
							clonedHtml: clonedHtmlRef.current,
						},
					]);
				} else {
					const ghosts: DragGhostState[] = [];
					for (const selectedId of nextSelectedIds) {
						const ghostSource = document.querySelector<HTMLElement>(
							`[data-element-id="${selectedId}"]`,
						);
						const ghostElement = elements.find((el) => el.id === selectedId);
						if (!ghostSource || !ghostElement) continue;
						ghosts.push(createGhostFromNode(ghostSource, ghostElement));
					}
					initialGhostsRef.current = ghosts;
					setDragGhosts(ghosts);
				}
			}

			const scrollDelta = currentScrollLeft - initialScrollLeftRef.current;
			const adjustedDeltaX = mx + scrollDelta;

			const isMultiDrag =
				dragSelectedIdsRef.current.length > 1 &&
				dragSelectedIdsRef.current.includes(element.id);
			if (isMultiDrag) {
				let deltaTime = adjustedDeltaX / ratio;
				const minStart = dragMinStartRef.current;
				if (deltaTime < -minStart) {
					deltaTime = -minStart;
				}

				let snapPoint = null;
				if (snapEnabled) {
					const baseElements =
						initialElementsSnapshotRef.current.length > 0
							? initialElementsSnapshotRef.current
							: elements;
					let bestDelta = deltaTime;
					let bestSnapPoint: SnapPoint | null = null;
					let bestDistance = Infinity;

					for (const selectedId of dragSelectedIdsRef.current) {
						const initial = dragInitialElementsRef.current.get(selectedId);
						if (!initial) continue;
						const snapPoints = collectSnapPoints(
							baseElements,
							currentTime,
							selectedId,
						);
						const snapped = applySnapForDrag(
							initial.start + deltaTime,
							initial.end + deltaTime,
							snapPoints,
							ratio,
						);
						if (!snapped.snapPoint) continue;
						const snappedDelta = snapped.start - initial.start;
						if (snappedDelta < -minStart) continue;
						const distance = Math.abs(snappedDelta - deltaTime);
						if (distance < bestDistance) {
							bestDistance = distance;
							bestDelta = snappedDelta;
							bestSnapPoint = snapped.snapPoint;
						}
					}

					deltaTime = bestDelta;
					snapPoint = bestSnapPoint;
				}

				const initialMap = dragInitialElementsRef.current;
				const draggedInitial = initialMap.get(element.id);
				const dropTarget = findDropTargetFromScreenPosition(
					xy[0],
					xy[1],
					otherTrackCount,
					trackHeight,
				);
				const baseElements =
					initialElementsSnapshotRef.current.length > 0
						? initialElementsSnapshotRef.current
						: elements;
				const baseStart = draggedInitial?.start ?? dragRefs.current.initialStart;
				const baseEnd = draggedInitial?.end ?? dragRefs.current.initialEnd;
				const nextStart = baseStart + deltaTime;
				const nextEnd = baseEnd + deltaTime;
				const timeRange = { start: nextStart, end: nextEnd };

				const tempElements = baseElements.map((el) => {
					const initial = initialMap.get(el.id);
					if (!initial) return el;
					return {
						...el,
						timeline: {
							...el.timeline,
							start: initial.start + deltaTime,
							end: initial.end + deltaTime,
							trackIndex: initial.trackIndex,
						},
					};
				});

				const finalTrackResult = calculateFinalTrack(
					dropTarget,
					timeRange,
					tempElements,
					element.id,
					draggedInitial?.trackIndex ?? dragRefs.current.initialTrack,
				);
				const trackDelta =
					finalTrackResult.trackIndex -
					(draggedInitial?.trackIndex ?? dragRefs.current.initialTrack);
				const snapShift = deltaTime * ratio - adjustedDeltaX;
				const ghostDeltaX = mx + snapShift;
				const ghostDeltaY = my;

				if (!last) {
					setDragGhosts(
						initialGhostsRef.current.map((ghost) => ({
							...ghost,
							screenX: ghost.screenX + ghostDeltaX,
							screenY: ghost.screenY + ghostDeltaY,
						})),
					);
				}

				if (last) {
					const selectedSet = new Set(dragSelectedIdsRef.current);
					const baseElementMap = new Map(
						baseElements.map((el) => [el.id, el]),
					);
					const movedChildren = new Map<string, { start: number; end: number }>();

					if (autoAttach && deltaTime !== 0) {
						for (const parentId of selectedSet) {
							const parentInitial = initialMap.get(parentId);
							if (!parentInitial) continue;
							const isLeavingMainTrack =
								parentInitial.trackIndex === 0 &&
								trackDelta !== 0 &&
								(dropTarget.type === "gap" ||
									finalTrackResult.trackIndex > 0);
							if (isLeavingMainTrack) continue;
							const childIds = attachments.get(parentId) ?? [];
							for (const childId of childIds) {
								if (selectedSet.has(childId)) continue;
								const childBase = baseElementMap.get(childId);
								if (!childBase) continue;
								const childNewStart = childBase.timeline.start + deltaTime;
								const childNewEnd = childBase.timeline.end + deltaTime;
								if (childNewStart >= 0) {
									movedChildren.set(childId, {
										start: childNewStart,
										end: childNewEnd,
									});
								}
							}
						}
					}

					setElements((prev) =>
						prev.map((el) => {
							if (selectedSet.has(el.id)) {
								const initial = initialMap.get(el.id);
								if (!initial) return el;
								return {
									...el,
									timeline: {
										...el.timeline,
										start: initial.start + deltaTime,
										end: initial.end + deltaTime,
										trackIndex: Math.max(0, initial.trackIndex + trackDelta),
									},
								};
							}

							const childMove = movedChildren.get(el.id);
							if (childMove) {
								return {
									...el,
									timeline: {
										...el.timeline,
										start: childMove.start,
										end: childMove.end,
									},
								};
							}

							return el;
						}),
					);

					setIsDragging(false);
					setActiveSnapPoint(null);
					setActiveDropTarget(null);
					setDragGhosts([]);
					setLocalTrackY(null);
					stopAutoScroll();
				} else {
					setActiveSnapPoint(snapPoint);
					setActiveDropTarget({
						type: finalTrackResult.displayType,
						trackIndex: finalTrackResult.trackIndex,
						elementId: element.id,
						start: timeRange.start,
						end: timeRange.end,
						finalTrackIndex: finalTrackResult.trackIndex,
					});

					const scrollArea = document.querySelector<HTMLElement>(
						"[data-timeline-scroll-area]",
					);
					if (scrollArea) {
						const scrollRect = scrollArea.getBoundingClientRect();
						updateAutoScrollFromPosition(
							xy[0],
							scrollRect.left,
							scrollRect.right,
						);
					}

					const verticalScrollArea = document.querySelector<HTMLElement>(
						"[data-vertical-scroll-area]",
					);
					if (verticalScrollArea) {
						const verticalRect = verticalScrollArea.getBoundingClientRect();
						updateAutoScrollYFromPosition(
							xy[1],
							verticalRect.top,
							verticalRect.bottom,
						);
					}
				}

				return;
			}

			const dragResult = calculateDragResult({
				deltaX: adjustedDeltaX,
				deltaY: my,
				ratio,
				initialStart: dragRefs.current.initialStart,
				initialEnd: dragRefs.current.initialEnd,
				initialTrackY: trackY,
				initialTrackIndex: dragRefs.current.initialTrack,
				trackHeight,
				trackCount,
				elementHeight: DEFAULT_ELEMENT_HEIGHT,
			});

			const dropTarget = findDropTargetFromScreenPosition(
				xy[0],
				xy[1],
				otherTrackCount,
				trackHeight,
			);
			const hasSignificantVerticalMove = dropTarget.trackIndex !== trackIndex;

			let { newStart, newEnd } = dragResult;
			const { newY } = dragResult;

			let snapPoint = null;
			if (snapEnabled) {
				const snapPoints = collectSnapPoints(elements, currentTime, element.id);
				const snapped = applySnapForDrag(newStart, newEnd, snapPoints, ratio);
				newStart = snapped.start;
				newEnd = snapped.end;
				snapPoint = snapped.snapPoint;
			}

			if (last) {
				setIsDragging(false);
				setActiveSnapPoint(null);
				setActiveDropTarget(null);
				setDragGhosts([]);
				setLocalTrackY(null);
				stopAutoScroll();

				if (Math.abs(mx) > 0 || Math.abs(my) > 0) {
					const actualDelta = newStart - dragRefs.current.initialStart;
					const originalTrackIndex = element.timeline.trackIndex ?? 0;
					const isLeavingMainTrack =
						originalTrackIndex === 0 &&
						hasSignificantVerticalMove &&
						(dropTarget.type === "gap" || dropTarget.trackIndex > 0);

					const attachedChildren: { id: string; start: number; end: number }[] =
						[];
					if (autoAttach && actualDelta !== 0 && !isLeavingMainTrack) {
						const childIds = attachments.get(element.id) ?? [];
						for (const childId of childIds) {
							const child = elements.find((el) => el.id === childId);
							if (child) {
								const childNewStart = child.timeline.start + actualDelta;
								const childNewEnd = child.timeline.end + actualDelta;
								if (childNewStart >= 0) {
									attachedChildren.push({
										id: childId,
										start: childNewStart,
										end: childNewEnd,
									});
								}
							}
						}
					}

					moveWithAttachments(
						element.id,
						newStart,
						newEnd,
						dropTarget,
						attachedChildren,
					);
				}
			} else {
				setLocalStartTime(newStart);
				setLocalEndTime(newEnd);
				setLocalTrackY(newY);
				setActiveSnapPoint(snapPoint);

				const ghostWidth = (newEnd - newStart) * ratio;
				setDragGhosts([
					{
						elementId: element.id,
						element,
						screenX: xy[0] - initialMouseOffsetRef.current.x,
						screenY: xy[1] - initialMouseOffsetRef.current.y,
						width: ghostWidth,
						height: DEFAULT_ELEMENT_HEIGHT,
						clonedHtml: clonedHtmlRef.current,
					},
				]);

				const tempElements = elements.map((el) =>
					el.id === element.id
						? { ...el, timeline: { ...el.timeline, start: newStart, end: newEnd } }
						: el,
				);

				const finalTrackResult = calculateFinalTrack(
					dropTarget,
					{ start: newStart, end: newEnd },
					tempElements,
					element.id,
					element.timeline.trackIndex ?? 0,
				);

				setActiveDropTarget({
					type: finalTrackResult.displayType,
					trackIndex:
						finalTrackResult.displayType === "gap"
							? finalTrackResult.trackIndex
							: dropTarget.trackIndex,
					elementId: element.id,
					start: newStart,
					end: newEnd,
					finalTrackIndex: finalTrackResult.trackIndex,
				});

				const scrollArea = document.querySelector<HTMLElement>(
					"[data-timeline-scroll-area]",
				);
				if (scrollArea) {
					const scrollRect = scrollArea.getBoundingClientRect();
					updateAutoScrollFromPosition(
						xy[0],
						scrollRect.left,
						scrollRect.right,
					);
				}

				const verticalScrollArea = document.querySelector<HTMLElement>(
					"[data-vertical-scroll-area]",
				);
				if (verticalScrollArea) {
					const verticalRect = verticalScrollArea.getBoundingClientRect();
					updateAutoScrollYFromPosition(
						xy[1],
						verticalRect.top,
						verticalRect.bottom,
					);
				}
			}
		},
		{ filterTaps: true },
	);

	return { bindLeftDrag, bindRightDrag, bindBodyDrag };
};
