/**
 * Timeline element drag-and-drop behavior (single + multi).
 */

import { useDrag } from "@use-gesture/react";
import { useRef } from "react";
import { TimelineElement } from "@/dsl/types";
import { DragGhostState, useTimelineStore } from "../contexts/TimelineContext";
import {
	finalizeTimelineElements,
	insertElementIntoMainTrack,
	insertElementsIntoMainTrackGroup,
	shiftMainTrackElementsAfter,
} from "../utils/mainTrackMagnet";
import { applySnap, applySnapForDrag, collectSnapPoints } from "../utils/snap";
import {
	getDropTargetFromHeights,
	getElementRole,
	resolveDropTargetForRole,
} from "../utils/trackAssignment";
import {
	calculateDragResult,
	calculateFinalTrack,
	SIGNIFICANT_VERTICAL_MOVE_RATIO,
} from "./index";
import { getElementHeightForTrack } from "./trackConfig";
import { ExtendedDropTarget, SnapPoint } from "./types";

interface UseTimelineElementDndOptions {
	element: TimelineElement;
	trackIndex: number;
	trackY: number;
	ratio: number;
	trackHeight: number;
	trackCount: number;
	trackAssignments: Map<string, number>;
	maxDuration?: number;
	elements: TimelineElement[];
	currentTime: number;
	snapEnabled: boolean;
	autoAttach: boolean;
	mainTrackMagnetEnabled: boolean;
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
	const parseTrackHeights = (value?: string): number[] => {
		if (!value) return [];
		return value
			.split(",")
			.map((part) => parseInt(part, 10))
			.filter((height) => Number.isFinite(height) && height > 0);
	};
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
		const datasetTrackCount = parseInt(otherZone.dataset.trackCount || "0", 10);
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
		const trackHeights = parseTrackHeights(otherZone.dataset.trackHeights);

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
			if (trackHeights.length > 0) {
				const dropTarget = getDropTargetFromHeights(
					contentRelativeY,
					trackHeights,
					otherTrackCount,
				);
				if (dropTarget) {
					const maxTrackIndex =
						dropTarget.type === "gap" ? otherTrackCount + 1 : otherTrackCount;
					const targetTrackIndex = Math.max(
						1,
						Math.min(maxTrackIndex, dropTarget.trackIndex),
					);
					return { ...dropTarget, trackIndex: targetTrackIndex };
				}
			}

			if (contentRelativeY < 0) {
				return { trackIndex: otherTrackCount + 1, type: "gap" };
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
	trackAssignments,
	maxDuration,
	elements,
	currentTime,
	snapEnabled,
	autoAttach,
	mainTrackMagnetEnabled,
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
	const elementRole = getElementRole(element);
	const elementHeight = getElementHeightForTrack(trackHeight);
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

	const storedTrackIndex = element.timeline.trackIndex ?? 0;
	const isMainTrackMagnetActive =
		mainTrackMagnetEnabled && storedTrackIndex === 0;

	const getStoredTrackNeighbors = (
		referenceStart: number,
		referenceEnd: number,
	) => {
		let prevEnd: number | null = null;
		let nextStart: number | null = null;
		const epsilon = 1e-4;
		for (const el of elements) {
			if (el.id === element.id) continue;
			const elTrack = el.timeline.trackIndex ?? 0;
			if (elTrack !== storedTrackIndex) continue;
			if (el.timeline.end <= referenceStart + epsilon) {
				prevEnd =
					prevEnd === null
						? el.timeline.end
						: Math.max(prevEnd, el.timeline.end);
			}
			if (el.timeline.start >= referenceEnd - epsilon) {
				nextStart =
					nextStart === null
						? el.timeline.start
						: Math.min(nextStart, el.timeline.start);
			}
		}
		return { prevEnd, nextStart };
	};

	const getMainTrackDropTime = (
		screenX: number,
		screenY: number,
		scrollLeft: number,
	): number | null => {
		const mainZone = document.querySelector<HTMLElement>(
			'[data-track-drop-zone="main"]',
		);
		if (!mainZone) return null;
		const rect = mainZone.getBoundingClientRect();
		if (
			screenY < rect.top ||
			screenY > rect.bottom ||
			screenX < rect.left ||
			screenX > rect.right
		) {
			return null;
		}
		const contentArea = mainZone.querySelector<HTMLElement>(
			'[data-track-content-area="main"]',
		);
		if (!contentArea) return null;
		const contentRect = contentArea.getBoundingClientRect();
		const localX = screenX - contentRect.left + scrollLeft;
		return Math.max(0, localX / ratio);
	};

	const getMainTrackDropStart = (
		screenX: number,
		screenY: number,
		scrollLeft: number,
		offsetX: number,
	): number | null => {
		const dropTime = getMainTrackDropTime(screenX, screenY, scrollLeft);
		if (dropTime === null) return null;
		return Math.max(0, dropTime - offsetX / ratio);
	};

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
			if (isMainTrackMagnetActive) {
				let previewStart = Math.max(
					0,
					Math.min(
						dragRefs.current.initialStart + deltaTime,
						dragRefs.current.initialEnd - 0.1,
					),
				);

				if (maxDuration !== undefined) {
					previewStart = Math.max(
						previewStart,
						dragRefs.current.initialEnd - maxDuration,
					);
				}

				let snapPoint = null;
				if (snapEnabled) {
					const snapPoints = collectSnapPoints(
						elements,
						currentTime,
						element.id,
					);
					const snapped = applySnap(previewStart, snapPoints, ratio);
					if (
						snapped.snapPoint &&
						snapped.time >= 0 &&
						snapped.time < dragRefs.current.initialEnd - 0.1
					) {
						previewStart = snapped.time;
						snapPoint = snapped.snapPoint;
					}
				}

				const effectiveDelta = previewStart - dragRefs.current.initialStart;
				let newEnd = dragRefs.current.initialEnd - effectiveDelta;
				newEnd = Math.max(dragRefs.current.initialStart + 0.1, newEnd);
				if (maxDuration !== undefined) {
					newEnd = Math.min(
						newEnd,
						dragRefs.current.initialStart + maxDuration,
					);
				}

				if (last) {
					setIsDragging(false);
					setActiveSnapPoint(null);
					if (Math.abs(mx) > 0) {
						const delta = newEnd - dragRefs.current.initialEnd;
						setElements((prev) =>
							shiftMainTrackElementsAfter(prev, element.id, newEnd, delta, {
								attachments,
								autoAttach,
							}),
						);
					}
				} else {
					setLocalStartTime(previewStart);
					setActiveSnapPoint(snapPoint);
				}
				return;
			}

			let newStart = Math.max(
				0,
				Math.min(
					dragRefs.current.initialStart + deltaTime,
					dragRefs.current.initialEnd - 0.1,
				),
			);

			if (maxDuration !== undefined) {
				newStart = Math.max(
					newStart,
					dragRefs.current.initialEnd - maxDuration,
				);
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

			let clampedByNeighbor = false;
			if (storedTrackIndex > 0) {
				const { prevEnd } = getStoredTrackNeighbors(
					dragRefs.current.initialStart,
					dragRefs.current.initialEnd,
				);
				if (prevEnd !== null && newStart < prevEnd) {
					newStart = prevEnd;
					clampedByNeighbor = true;
				}
			}

			if (clampedByNeighbor) {
				snapPoint = null;
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
			if (isMainTrackMagnetActive) {
				let newEnd = Math.max(
					dragRefs.current.initialStart + 0.1,
					dragRefs.current.initialEnd + deltaTime,
				);

				if (maxDuration !== undefined) {
					newEnd = Math.min(
						newEnd,
						dragRefs.current.initialStart + maxDuration,
					);
				}

				let snapPoint = null;
				if (snapEnabled) {
					const snapPoints = collectSnapPoints(
						elements,
						currentTime,
						element.id,
					);
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
						const delta = newEnd - dragRefs.current.initialEnd;
						setElements((prev) =>
							shiftMainTrackElementsAfter(prev, element.id, newEnd, delta, {
								attachments,
								autoAttach,
							}),
						);
					}
				} else {
					setLocalEndTime(newEnd);
					setActiveSnapPoint(snapPoint);
				}
				return;
			}

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

			let clampedByNeighbor = false;
			if (storedTrackIndex > 0) {
				const { nextStart } = getStoredTrackNeighbors(
					dragRefs.current.initialStart,
					dragRefs.current.initialEnd,
				);
				if (nextStart !== null && newEnd > nextStart) {
					newEnd = nextStart;
					clampedByNeighbor = true;
				}
			}

			if (clampedByNeighbor) {
				snapPoint = null;
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
						(dragRefs.current.currentEnd - dragRefs.current.currentStart) *
						ratio;
					setDragGhosts([
						{
							elementId: element.id,
							element,
							screenX: xy[0] - initialMouseOffsetRef.current.x,
							screenY: xy[1] - initialMouseOffsetRef.current.y,
							width: ghostWidth,
							height: elementHeight,
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

				const initialMap = dragInitialElementsRef.current;
				const draggedInitial = initialMap.get(element.id);
				const selectedSet = new Set(dragSelectedIdsRef.current);
				const selectedTrackIndices = new Set<number>();
				for (const selectedId of selectedSet) {
					const initial = initialMap.get(selectedId);
					if (initial) {
						selectedTrackIndices.add(initial.trackIndex);
					}
				}
				const isMultiTrackSelection = selectedTrackIndices.size > 1;
				const hasSignificantVerticalMove =
					Math.abs(my) > trackHeight * SIGNIFICANT_VERTICAL_MOVE_RATIO;
				const baseDropTarget = hasSignificantVerticalMove
					? findDropTargetFromScreenPosition(
							xy[0],
							xy[1],
							otherTrackCount,
							trackHeight,
						)
					: {
							trackIndex:
								draggedInitial?.trackIndex ?? dragRefs.current.initialTrack,
							type: "track" as const,
						};
				const mainDropTime = getMainTrackDropTime(
					xy[0],
					xy[1],
					currentScrollLeft,
				);
				const baseDropTargetForRole =
					mainDropTime !== null
						? ({ type: "track", trackIndex: 0 } as const)
						: baseDropTarget;
				let resolvedDropTarget = resolveDropTargetForRole(
					baseDropTargetForRole,
					elementRole,
					elements,
					trackAssignments,
				);
				const dragSelectedIds = dragSelectedIdsRef.current;
				const canDropToMainTrack =
					mainDropTime !== null &&
					dragSelectedIds.every((selectedId) => {
						const selectedElement = elements.find((el) => el.id === selectedId);
						return (
							selectedElement !== undefined &&
							getElementRole(selectedElement) === "clip"
						);
					});
				if (canDropToMainTrack) {
					resolvedDropTarget = { type: "track", trackIndex: 0 };
				}
				const shouldUseMagnetMulti =
					mainTrackMagnetEnabled && canDropToMainTrack;

				let snapPoint = null;
				if (snapEnabled && !shouldUseMagnetMulti) {
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
				const baseElements =
					initialElementsSnapshotRef.current.length > 0
						? initialElementsSnapshotRef.current
						: elements;
				const baseStart =
					draggedInitial?.start ?? dragRefs.current.initialStart;
				const baseEnd = draggedInitial?.end ?? dragRefs.current.initialEnd;
				const nextStart = baseStart + deltaTime;
				const nextEnd = baseEnd + deltaTime;
				const timeRange = { start: nextStart, end: nextEnd };
				let groupSpanStart = Number.POSITIVE_INFINITY;
				let groupSpanEnd = Number.NEGATIVE_INFINITY;
				let groupCompactDuration = 0;
				for (const selectedId of dragSelectedIds) {
					const initial = initialMap.get(selectedId);
					if (!initial) continue;
					const shiftedStart = initial.start + deltaTime;
					const shiftedEnd = initial.end + deltaTime;
					groupSpanStart = Math.min(groupSpanStart, shiftedStart);
					groupSpanEnd = Math.max(groupSpanEnd, shiftedEnd);
					groupCompactDuration += initial.end - initial.start;
				}
				if (!Number.isFinite(groupSpanStart)) {
					groupSpanStart = nextStart;
				}
				if (!Number.isFinite(groupSpanEnd)) {
					groupSpanEnd = nextEnd;
				}

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
					resolvedDropTarget,
					timeRange,
					tempElements,
					element.id,
					draggedInitial?.trackIndex ?? dragRefs.current.initialTrack,
				);
				const draggedBaseTrack =
					draggedInitial?.trackIndex ?? dragRefs.current.initialTrack;
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
					if (shouldUseMagnetMulti) {
						setLocalStartTime(null);
						setLocalEndTime(null);
						const dropStartForMagnet = groupSpanStart;

						setElements((prev) =>
							insertElementsIntoMainTrackGroup(
								prev,
								dragSelectedIds,
								dropStartForMagnet,
								{
									mainTrackMagnetEnabled,
									attachments,
									autoAttach,
								},
							),
						);

						setIsDragging(false);
						setActiveSnapPoint(null);
						setActiveDropTarget(null);
						setDragGhosts([]);
						setLocalTrackY(null);
						stopAutoScroll();
						return;
					}

					const singleTrackSelection = selectedTrackIndices.size === 1;
					const selectedTrackIndex = singleTrackSelection
						? [...selectedTrackIndices][0]
						: null;
					const isFullTrackSelection =
						singleTrackSelection &&
						selectedTrackIndex !== null &&
						baseElements
							.filter(
								(el) => (el.timeline.trackIndex ?? 0) === selectedTrackIndex,
							)
							.every((el) => selectedSet.has(el.id));
					const baseElementMap = new Map(baseElements.map((el) => [el.id, el]));
					const movedChildren = new Map<
						string,
						{ start: number; end: number }
					>();

					if (autoAttach && deltaTime !== 0) {
						for (const parentId of selectedSet) {
							const parentInitial = initialMap.get(parentId);
							if (!parentInitial) continue;
							const isLeavingMainTrack =
								parentInitial.trackIndex === 0 &&
								hasSignificantVerticalMove &&
								(resolvedDropTarget.type === "gap" ||
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

					const selectedTrackList = [...selectedTrackIndices].sort(
						(a, b) => a - b,
					);
					const allTracks = [
						...new Set(
							baseElements
								.map((el) => el.timeline.trackIndex ?? 0)
								.filter((trackIndex) => trackIndex > 0),
						),
					].sort((a, b) => a - b);
					const allTracksFullySelected =
						selectedTrackList.length > 0 &&
						selectedTrackList.every((trackIndex) =>
							baseElements
								.filter((el) => (el.timeline.trackIndex ?? 0) === trackIndex)
								.every((el) => selectedSet.has(el.id)),
						);
					const shouldReorderTrackBlock =
						hasSignificantVerticalMove && allTracksFullySelected;

					if (shouldReorderTrackBlock) {
						const remainingTracks = allTracks.filter(
							(trackIndex) => !selectedTrackIndices.has(trackIndex),
						);
						const rawInsertIndex =
							resolvedDropTarget.type === "gap"
								? resolvedDropTarget.trackIndex
								: resolvedDropTarget.trackIndex;
						const insertTrackIndex = Math.max(1, rawInsertIndex);
						let insertionIndex = remainingTracks.findIndex(
							(trackIndex) => trackIndex >= insertTrackIndex,
						);
						if (insertionIndex < 0) {
							insertionIndex = remainingTracks.length;
						}

						const newTrackOrder = [
							...remainingTracks.slice(0, insertionIndex),
							...selectedTrackList,
							...remainingTracks.slice(insertionIndex),
						];
						const trackMapping = new Map<number, number>();
						newTrackOrder.forEach((oldTrack, index) => {
							trackMapping.set(oldTrack, index + 1);
						});

						setElements((prev) => {
							const updated = prev.map((el) => {
								const baseTrack = el.timeline.trackIndex ?? 0;
								const nextTrack =
									baseTrack > 0
										? (trackMapping.get(baseTrack) ?? baseTrack)
										: 0;

								if (selectedSet.has(el.id)) {
									const initial = initialMap.get(el.id);
									if (!initial) return el;
									return {
										...el,
										timeline: {
											...el.timeline,
											start: initial.start + deltaTime,
											end: initial.end + deltaTime,
											trackIndex: nextTrack,
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
											trackIndex: nextTrack,
										},
									};
								}

								if (nextTrack !== baseTrack) {
									return {
										...el,
										timeline: {
											...el.timeline,
											trackIndex: nextTrack,
										},
									};
								}

								return el;
							});

							return finalizeTimelineElements(updated, {
								mainTrackMagnetEnabled,
								attachments,
								autoAttach,
							});
						});

						setIsDragging(false);
						setActiveSnapPoint(null);
						setActiveDropTarget(null);
						setDragGhosts([]);
						setLocalTrackY(null);
						stopAutoScroll();
						return;
					}

					const maxTrackIndex = Math.max(
						1,
						...baseElements.map((el) => el.timeline.trackIndex ?? 0),
					);
					const rawTargetTrack =
						resolvedDropTarget.type === "gap"
							? resolvedDropTarget.trackIndex - 1
							: resolvedDropTarget.trackIndex;
					const targetTrackIndex = Math.max(
						0,
						Math.min(maxTrackIndex, rawTargetTrack),
					);
					const shouldReorderTracks =
						hasSignificantVerticalMove &&
						isFullTrackSelection &&
						selectedTrackIndex !== null;
					const shouldInsertTrack =
						finalTrackResult.displayType === "gap" && !shouldReorderTracks;
					const insertTrackIndex = shouldInsertTrack
						? finalTrackResult.trackIndex
						: null;
					const shiftForInsert = (trackIndex: number) =>
						insertTrackIndex !== null && trackIndex >= insertTrackIndex
							? trackIndex + 1
							: trackIndex;
					const draggedAfterInsert = shiftForInsert(draggedBaseTrack);
					const trackDelta = finalTrackResult.trackIndex - draggedAfterInsert;
					const remapTrackIndex = (trackIndex: number) => {
						if (!shouldReorderTracks) return trackIndex;
						if (trackIndex === 0) return 0;
						if (selectedTrackIndex === targetTrackIndex) return trackIndex;
						if (trackIndex === selectedTrackIndex) {
							return targetTrackIndex;
						}
						if (targetTrackIndex > selectedTrackIndex) {
							if (
								trackIndex > selectedTrackIndex &&
								trackIndex <= targetTrackIndex
							) {
								return trackIndex - 1;
							}
						} else if (targetTrackIndex < selectedTrackIndex) {
							if (
								trackIndex >= targetTrackIndex &&
								trackIndex < selectedTrackIndex
							) {
								return trackIndex + 1;
							}
						}
						return trackIndex;
					};

					setElements((prev) => {
						const updated = prev.map((el) => {
							const baseTrack = el.timeline.trackIndex ?? 0;
							const shiftedTrack = shouldReorderTracks
								? baseTrack
								: shiftForInsert(baseTrack);
							const nextTrack = shouldReorderTracks
								? remapTrackIndex(baseTrack)
								: shiftedTrack;

							if (selectedSet.has(el.id)) {
								const initial = initialMap.get(el.id);
								if (!initial) return el;
								const selectedBase = shouldReorderTracks
									? initial.trackIndex
									: shiftForInsert(initial.trackIndex);
								return {
									...el,
									timeline: {
										...el.timeline,
										start: initial.start + deltaTime,
										end: initial.end + deltaTime,
										trackIndex: shouldReorderTracks
											? nextTrack
											: Math.max(0, selectedBase + trackDelta),
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
										trackIndex: nextTrack,
									},
								};
							}

							if (nextTrack !== baseTrack) {
								return {
									...el,
									timeline: {
										...el.timeline,
										trackIndex: nextTrack,
									},
								};
							}

							return el;
						});

						return finalizeTimelineElements(updated, {
							mainTrackMagnetEnabled,
							attachments,
							autoAttach,
						});
					});

					setIsDragging(false);
					setActiveSnapPoint(null);
					setActiveDropTarget(null);
					setDragGhosts([]);
					setLocalTrackY(null);
					stopAutoScroll();
				} else {
					if (isMultiTrackSelection) {
						if (resolvedDropTarget.type === "gap") {
							setActiveDropTarget({
								type: "gap",
								trackIndex: resolvedDropTarget.trackIndex,
								elementId: element.id,
								start: groupSpanStart,
								end: groupSpanEnd,
								finalTrackIndex: resolvedDropTarget.trackIndex,
							});
						} else {
							setActiveDropTarget(null);
						}
						setActiveSnapPoint(snapPoint);
					} else if (shouldUseMagnetMulti) {
						const dropStartForMagnet = groupSpanStart;
						setActiveSnapPoint(null);
						setActiveDropTarget({
							type: "track",
							trackIndex: 0,
							elementId: element.id,
							start: dropStartForMagnet,
							end: dropStartForMagnet + groupCompactDuration,
							finalTrackIndex: 0,
						});
					} else {
						setActiveSnapPoint(snapPoint);
						setActiveDropTarget({
							type: finalTrackResult.displayType,
							trackIndex: finalTrackResult.trackIndex,
							elementId: element.id,
							start: groupSpanStart,
							end: groupSpanEnd,
							finalTrackIndex: finalTrackResult.trackIndex,
						});
					}

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
				elementHeight,
			});

			const hasSignificantVerticalMove =
				Math.abs(my) > trackHeight * SIGNIFICANT_VERTICAL_MOVE_RATIO;
			const baseDropTarget = hasSignificantVerticalMove
				? findDropTargetFromScreenPosition(
						xy[0],
						xy[1],
						otherTrackCount,
						trackHeight,
					)
				: { trackIndex, type: "track" as const };
			const resolvedDropTarget = resolveDropTargetForRole(
				baseDropTarget,
				elementRole,
				elements,
				trackAssignments,
			);
			const shouldUseMagnet =
				mainTrackMagnetEnabled &&
				resolvedDropTarget.type === "track" &&
				resolvedDropTarget.trackIndex === 0;

			let { newStart, newEnd } = dragResult;
			const { newY } = dragResult;

			let snapPoint = null;
			if (snapEnabled && !shouldUseMagnet) {
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

				if (shouldUseMagnet) {
					setLocalStartTime(null);
					setLocalEndTime(null);
					if (Math.abs(mx) > 0 || Math.abs(my) > 0) {
						const dropStartForMagnet =
							getMainTrackDropStart(
								xy[0],
								xy[1],
								currentScrollLeft,
								initialMouseOffsetRef.current.x,
							) ?? newStart;
						setElements((prev) =>
							insertElementIntoMainTrack(prev, element.id, dropStartForMagnet, {
								attachments,
								autoAttach,
							}),
						);
					}
					return;
				}

				if (Math.abs(mx) > 0 || Math.abs(my) > 0) {
					const actualDelta = newStart - dragRefs.current.initialStart;
					const originalTrackIndex = element.timeline.trackIndex ?? 0;
					const isLeavingMainTrack =
						originalTrackIndex === 0 &&
						hasSignificantVerticalMove &&
						(resolvedDropTarget.type === "gap" ||
							resolvedDropTarget.trackIndex > 0);

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
						resolvedDropTarget,
						attachedChildren,
					);
				}
			} else {
				setLocalStartTime(newStart);
				setLocalEndTime(newEnd);
				setLocalTrackY(newY);
				setActiveSnapPoint(shouldUseMagnet ? null : snapPoint);

				const ghostWidth = (newEnd - newStart) * ratio;
				setDragGhosts([
					{
						elementId: element.id,
						element,
						screenX: xy[0] - initialMouseOffsetRef.current.x,
						screenY: xy[1] - initialMouseOffsetRef.current.y,
						width: ghostWidth,
						height: elementHeight,
						clonedHtml: clonedHtmlRef.current,
					},
				]);

				if (shouldUseMagnet) {
					const dropStartForMagnet =
						getMainTrackDropStart(
							xy[0],
							xy[1],
							currentScrollLeft,
							initialMouseOffsetRef.current.x,
						) ?? newStart;
					setActiveDropTarget({
						type: "track",
						trackIndex: 0,
						elementId: element.id,
						start: dropStartForMagnet,
						end: dropStartForMagnet + (newEnd - newStart),
						finalTrackIndex: 0,
					});
				} else {
					const tempElements = elements.map((el) =>
						el.id === element.id
							? {
									...el,
									timeline: { ...el.timeline, start: newStart, end: newEnd },
								}
							: el,
					);

					const finalTrackResult = calculateFinalTrack(
						resolvedDropTarget,
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
								: resolvedDropTarget.trackIndex,
						elementId: element.id,
						start: newStart,
						end: newEnd,
						finalTrackIndex: finalTrackResult.trackIndex,
					});
				}

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
