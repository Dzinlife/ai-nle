import { TimelineElement, TimelineMeta, TrackRole } from "@/dsl/types";
import { clampFrame, framesToTimecode } from "@/utils/timecode";

export function updateTimelineRange(
	timeline: TimelineMeta,
	start: number,
	end: number,
	fps: number,
): TimelineMeta {
	const nextStart = clampFrame(start);
	const nextEnd = clampFrame(end);
	return {
		...timeline,
		start: nextStart,
		end: nextEnd,
		startTimecode: framesToTimecode(nextStart, fps),
		endTimecode: framesToTimecode(nextEnd, fps),
	};
}

export function updateElementTime(
	element: TimelineElement,
	start: number,
	end: number,
	fps: number,
): TimelineElement {
	const updatedTimeline = updateTimelineRange(element.timeline, start, end, fps);
	if (
		updatedTimeline.start === element.timeline.start &&
		updatedTimeline.end === element.timeline.end &&
		updatedTimeline.startTimecode === element.timeline.startTimecode &&
		updatedTimeline.endTimecode === element.timeline.endTimecode
	) {
		return element;
	}
	return {
		...element,
		timeline: updatedTimeline,
	};
}

export function buildTimelineMeta(
	data: {
		start: number;
		end: number;
		trackIndex?: number;
		role?: TrackRole;
	},
	fps: number,
): TimelineMeta {
	const start = clampFrame(data.start);
	const end = clampFrame(data.end);
	return {
		start,
		end,
		startTimecode: framesToTimecode(start, fps),
		endTimecode: framesToTimecode(end, fps),
		...(data.trackIndex !== undefined ? { trackIndex: data.trackIndex } : {}),
		...(data.role ? { role: data.role } : {}),
	};
}
