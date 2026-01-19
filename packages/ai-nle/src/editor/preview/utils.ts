import type { TimelineElement } from "@/dsl/types";

/**
 * Compute visible elements based on current time.
 * This is a pure function that doesn't trigger React re-renders.
 */
export const computeVisibleElements = (
	elements: TimelineElement[],
	currentTime: number,
): TimelineElement[] => {
	return elements.filter((el) => {
		const { start = 0, end = Infinity } = el.timeline;
		return currentTime >= start && currentTime < end;
	});
};

export type CanvasConvertOptions = {
	picture: { width: number; height: number };
	canvas: { width: number; height: number };
};
