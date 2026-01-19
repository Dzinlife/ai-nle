import { useDrag } from "@use-gesture/react";
import { useMemo, useRef } from "react";
import { TimelineElement, TrackRole } from "@/dsl/types";
import { clampFrame, secondsToFrames } from "@/utils/timecode";
import {
	useFps,
	useTimelineScale,
	useTimelineStore,
} from "../contexts/TimelineContext";
import {
	calculateAutoScrollSpeed,
	type DragGhostInfo,
	type DropTargetInfo,
	type MaterialDragData,
	useDragStore,
} from "./dragStore";
import { DEFAULT_TRACK_HEIGHT } from "../timeline/trackConfig";
import { getPixelsPerFrame } from "../utils/timelineScale";
import {
	assignTracks,
	getTrackCount,
	getTrackRoleMap,
	hasOverlapOnTrack,
	isRoleCompatibleWithTrack,
	MAIN_TRACK_INDEX,
} from "../utils/trackAssignment";
import {
	findTimelineDropTargetFromScreenPosition,
	getPreviewDropTargetFromScreenPosition,
	getTimelineDropTimeFromScreenX,
} from "./timelineDropTargets";

export interface MaterialDndItem {
	id: string;
	type: MaterialDragData["type"];
	name: string;
	uri: string;
	thumbnailUrl?: string;
	width?: number;
	height?: number;
	duration?: number;
}

export interface MaterialDndContext {
	fps: number;
	ratio: number;
	defaultDurationFrames: number;
	elements: TimelineElement[];
	trackAssignments: Map<string, number>;
	trackRoleMap: Map<number, TrackRole>;
	trackCount: number;
	mainTrackMagnetEnabled: boolean;
}

export function useMaterialDndContext(): MaterialDndContext {
	const { fps } = useFps();
	const { timelineScale } = useTimelineScale();
	const ratio = getPixelsPerFrame(fps, timelineScale);
	const elements = useTimelineStore((state) => state.elements);
	const mainTrackMagnetEnabled = useTimelineStore(
		(state) => state.mainTrackMagnetEnabled,
	);
	const trackAssignments = useMemo(() => assignTracks(elements), [elements]);
	const trackRoleMap = useMemo(
		() => getTrackRoleMap(elements, trackAssignments),
		[elements, trackAssignments],
	);
	const trackCount = useMemo(
		() => getTrackCount(trackAssignments),
		[trackAssignments],
	);
	const defaultDurationFrames = useMemo(
		() => secondsToFrames(5, fps),
		[fps],
	);

	return {
		fps,
		ratio,
		defaultDurationFrames,
		elements,
		trackAssignments,
		trackRoleMap,
		trackCount,
		mainTrackMagnetEnabled,
	};
}

const defaultMaterialRole = (item: MaterialDndItem): TrackRole => {
	switch (item.type) {
		case "audio":
			return "audio";
		case "text":
			return "overlay";
		default:
			return "clip";
	}
};

const defaultMaterialDurationFrames = (
	item: MaterialDndItem,
	defaultDurationFrames: number,
): number => {
	if (Number.isFinite(item.duration) && (item.duration ?? 0) > 0) {
		return item.duration as number;
	}
	return defaultDurationFrames;
};

const defaultGhostInfo = (
	item: MaterialDndItem,
	position: { screenX: number; screenY: number },
	size: { width: number; height: number },
): DragGhostInfo => ({
	screenX: position.screenX,
	screenY: position.screenY,
	width: size.width,
	height: size.height,
	thumbnailUrl: item.thumbnailUrl,
	label: item.name,
});

export interface UseMaterialDndOptions<T extends MaterialDndItem> {
	item: T;
	context: MaterialDndContext;
	onTimelineDrop?: (
		item: T,
		trackIndex: number,
		time: number,
		dropTargetType?: "track" | "gap",
	) => void;
	onPreviewDrop?: (item: T, canvasX: number, canvasY: number) => void;
	getRole?: (item: T) => TrackRole;
	getDurationFrames?: (item: T, defaultDurationFrames: number) => number;
	getDragData?: (item: T) => MaterialDragData;
	getGhostInfo?: (
		item: T,
		position: { screenX: number; screenY: number },
		size: { width: number; height: number },
	) => DragGhostInfo;
	ghostSize?: { width: number; height: number };
}

export function useMaterialDnd<T extends MaterialDndItem>({
	item,
	context,
	onTimelineDrop,
	onPreviewDrop,
	getRole = defaultMaterialRole,
	getDurationFrames = defaultMaterialDurationFrames,
	getDragData = (target) => ({
		type: target.type,
		uri: target.uri,
		name: target.name,
		thumbnailUrl: target.thumbnailUrl,
		width: target.width,
		height: target.height,
		duration: target.duration,
	}),
	getGhostInfo = defaultGhostInfo,
	ghostSize = { width: 120, height: 80 },
}: UseMaterialDndOptions<T>) {
	const {
		startDrag,
		updateGhost,
		updateDropTarget,
		endDrag,
		isDragging,
		ghostInfo,
		dragSource,
		setAutoScrollSpeedX,
		setAutoScrollSpeedY,
		stopAutoScroll,
	} = useDragStore();
	const dragRef = useRef<HTMLElement | null>(null);
	const initialOffsetRef = useRef({ x: 0, y: 0 });
	const materialRole = getRole(item);
	const materialDurationFrames = getDurationFrames(
		item,
		context.defaultDurationFrames,
	);

	const resolveTrackRole = (trackIndex: number): TrackRole => {
		if (trackIndex === MAIN_TRACK_INDEX) return "clip";
		return context.trackRoleMap.get(trackIndex) ?? "overlay";
	};

	const shouldForceGapInsert = (
		trackIndex: number,
		start: number,
		end: number,
	): boolean => {
		if (!isRoleCompatibleWithTrack(materialRole, trackIndex)) return true;
		if (resolveTrackRole(trackIndex) !== materialRole) return true;
		if (trackIndex === MAIN_TRACK_INDEX && context.mainTrackMagnetEnabled) {
			return false;
		}
		return hasOverlapOnTrack(
			start,
			end,
			trackIndex,
			context.elements,
			context.trackAssignments,
		);
	};

	const normalizeGapIndex = (trackIndex: number): number =>
		Math.max(MAIN_TRACK_INDEX + 1, trackIndex);

	const detectDropTarget = (mouseX: number, mouseY: number): DropTargetInfo | null => {
		const previewTarget = getPreviewDropTargetFromScreenPosition(mouseX, mouseY);
		if (previewTarget) return previewTarget;

		const otherTrackCountFallback = Math.max(context.trackCount - 1, 0);
		const baseDropTarget = findTimelineDropTargetFromScreenPosition(
			mouseX,
			mouseY,
			otherTrackCountFallback,
			DEFAULT_TRACK_HEIGHT,
			false,
		);
		if (!baseDropTarget) return null;

		const scrollLeft = useDragStore.getState().timelineScrollLeft;
		const rawTime = getTimelineDropTimeFromScreenX(
			mouseX,
			baseDropTarget.trackIndex,
			context.ratio,
			scrollLeft,
		);
		if (rawTime === null) return null;
		const time = clampFrame(rawTime);
		const dropEnd = time + materialDurationFrames;

		let resolvedDropTarget =
			baseDropTarget.type === "gap"
				? {
						...baseDropTarget,
						trackIndex: normalizeGapIndex(baseDropTarget.trackIndex),
					}
				: baseDropTarget;

		if (
			resolvedDropTarget.type === "track" &&
			shouldForceGapInsert(resolvedDropTarget.trackIndex, time, dropEnd)
		) {
			resolvedDropTarget = {
				type: "gap",
				trackIndex: normalizeGapIndex(resolvedDropTarget.trackIndex),
			};
		}

		return {
			zone: "timeline",
			type: resolvedDropTarget.type,
			trackIndex: resolvedDropTarget.trackIndex,
			time,
			canDrop: true,
		};
	};

	const bindDrag = useDrag(
		({ xy, first, last, event }) => {
			if (first) {
				event?.preventDefault();
				event?.stopPropagation();

				const target =
					dragRef.current ??
					(event?.currentTarget instanceof HTMLElement
						? event.currentTarget
						: null);
				if (target) {
					const rect = target.getBoundingClientRect();
					initialOffsetRef.current = {
						x: xy[0] - rect.left,
						y: xy[1] - rect.top,
					};
				}

				const dragData = getDragData(item);
				const ghost = getGhostInfo(
					item,
					{
						screenX: xy[0] - initialOffsetRef.current.x,
						screenY: xy[1] - initialOffsetRef.current.y,
					},
					ghostSize,
				);

				startDrag("material-library", dragData, ghost);
				return;
			}

			if (last) {
				stopAutoScroll();
				const currentDropTarget = useDragStore.getState().dropTarget;
				if (currentDropTarget?.canDrop) {
					if (
						currentDropTarget.zone === "timeline" &&
						currentDropTarget.time !== undefined &&
						currentDropTarget.trackIndex !== undefined
					) {
						onTimelineDrop?.(
							item,
							currentDropTarget.trackIndex,
							currentDropTarget.time,
							currentDropTarget.type ?? "track",
						);
					} else if (
						currentDropTarget.zone === "preview" &&
						currentDropTarget.canvasX !== undefined &&
						currentDropTarget.canvasY !== undefined
					) {
						onPreviewDrop?.(
							item,
							currentDropTarget.canvasX,
							currentDropTarget.canvasY,
						);
					}
				}
				endDrag();
				return;
			}

			updateGhost({
				screenX: xy[0] - initialOffsetRef.current.x,
				screenY: xy[1] - initialOffsetRef.current.y,
			});

			const dropTarget = detectDropTarget(xy[0], xy[1]);
			updateDropTarget(dropTarget);

			const scrollArea = document.querySelector<HTMLElement>(
				"[data-timeline-scroll-area]",
			);
			if (scrollArea) {
				const scrollRect = scrollArea.getBoundingClientRect();
				const speedX = calculateAutoScrollSpeed(
					xy[0],
					scrollRect.left,
					scrollRect.right,
				);
				setAutoScrollSpeedX(speedX);
			}

			const verticalScrollArea = document.querySelector<HTMLElement>(
				"[data-vertical-scroll-area]",
			);
			if (verticalScrollArea) {
				const verticalRect = verticalScrollArea.getBoundingClientRect();
				const speedY = calculateAutoScrollSpeed(
					xy[1],
					verticalRect.top,
					verticalRect.bottom,
				);
				setAutoScrollSpeedY(speedY);
			}
		},
		{ filterTaps: true },
	);

	const isBeingDragged =
		isDragging && dragSource === "material-library" && ghostInfo !== null;

	return { bindDrag, dragRef, isBeingDragged };
}
