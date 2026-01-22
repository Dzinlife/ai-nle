import { TimelineElement } from "@/dsl/types";
import { getElementRole, MAIN_TRACK_INDEX } from "./trackAssignment";
import { updateElementTime } from "./timelineTime";

type TransitionProps = {
	duration?: number;
	fromId?: string;
	toId?: string;
};

interface TransitionLink {
	fromId: string;
	toId: string;
	boundary: number;
	trackIndex: number;
	trackId?: string;
}

const DEFAULT_FPS = 30;
const DEFAULT_TRANSITION_DURATION = 15;

const normalizeFps = (value?: number): number => {
	if (!Number.isFinite(value) || value === undefined || value <= 0) {
		return DEFAULT_FPS;
	}
	return Math.round(value);
};

export const TRANSITION_TYPE = "Transition";

export const isTransitionElement = (element: TimelineElement): boolean =>
	element.type === TRANSITION_TYPE;

export const getTransitionDuration = (element: TimelineElement): number => {
	if (!isTransitionElement(element)) return 0;
	const metaDuration = element.transition?.duration;
	const legacyDuration =
		typeof (element.props as { duration?: number } | undefined)?.duration ===
		"number"
			? (element.props as { duration?: number }).duration
			: undefined;
	const value =
		metaDuration ?? legacyDuration ?? DEFAULT_TRANSITION_DURATION;
	if (!Number.isFinite(value)) return DEFAULT_TRANSITION_DURATION;
	return Math.max(0, Math.round(value));
};
const isClipElement = (element: TimelineElement): boolean =>
	getElementRole(element) === "clip" && !isTransitionElement(element);

const sortByTimeline = (a: TimelineElement, b: TimelineElement): number => {
	if (a.timeline.start !== b.timeline.start) {
		return a.timeline.start - b.timeline.start;
	}
	if (a.timeline.end !== b.timeline.end) {
		return a.timeline.end - b.timeline.end;
	}
	return a.id.localeCompare(b.id);
};

const getTransitionLinkFromProps = (
	element: TimelineElement,
): { fromId?: string; toId?: string } => {
	const props = (element.props ?? {}) as TransitionProps;
	const fromId = typeof props.fromId === "string" ? props.fromId : undefined;
	const toId = typeof props.toId === "string" ? props.toId : undefined;
	return { fromId, toId };
};

const resolvePairTrackId = (
	prev: TimelineElement,
	next: TimelineElement,
): string | undefined => {
	const prevId = prev.timeline.trackId;
	const nextId = next.timeline.trackId;
	if (prevId && nextId && prevId !== nextId) return undefined;
	return prevId ?? nextId;
};

const buildClipPairs = (elements: TimelineElement[]) => {
	const clipsByTrack = new Map<number, TimelineElement[]>();
	for (const clip of elements.filter(isClipElement)) {
		const trackIndex = clip.timeline.trackIndex ?? MAIN_TRACK_INDEX;
		const bucket = clipsByTrack.get(trackIndex);
		if (bucket) {
			bucket.push(clip);
		} else {
			clipsByTrack.set(trackIndex, [clip]);
		}
	}

	const pairs: TransitionLink[] = [];
	for (const [trackIndex, clips] of clipsByTrack.entries()) {
		const ordered = clips.slice().sort(sortByTimeline);
		for (let i = 0; i < ordered.length - 1; i += 1) {
			const prev = ordered[i];
			const next = ordered[i + 1];
			if (prev.timeline.end !== next.timeline.start) continue;
			pairs.push({
				fromId: prev.id,
				toId: next.id,
				boundary: prev.timeline.end,
				trackIndex,
				trackId: resolvePairTrackId(prev, next),
			});
		}
	}
	return pairs;
};

const ensureTransitionTimeline = (
	transition: TimelineElement,
	link: TransitionLink,
	fps: number,
): TimelineElement => {
	let next = transition;
	if (
		transition.timeline.start !== link.boundary ||
		transition.timeline.end !== link.boundary
	) {
		next = updateElementTime(transition, link.boundary, link.boundary, fps);
	}

	let timelineChanged = false;
	let updatedTimeline = next.timeline;

	if ((updatedTimeline.trackIndex ?? MAIN_TRACK_INDEX) !== link.trackIndex) {
		updatedTimeline = {
			...updatedTimeline,
			trackIndex: link.trackIndex,
		};
		timelineChanged = true;
	}

	if (link.trackId && updatedTimeline.trackId !== link.trackId) {
		updatedTimeline = {
			...updatedTimeline,
			trackId: link.trackId,
		};
		timelineChanged = true;
	}

	if (updatedTimeline.role !== "clip") {
		updatedTimeline = {
			...updatedTimeline,
			role: "clip",
		};
		timelineChanged = true;
	}

	if (timelineChanged) {
		next = {
			...next,
			timeline: updatedTimeline,
		};
	}

	return next;
};

const resolveTransitionLink = (
	element: TimelineElement,
	pairsById: Map<string, TransitionLink>,
	pairsByBoundary: Map<string, TransitionLink[]>,
	pairsByBoundaryOnly: Map<number, TransitionLink[]>,
): TransitionLink | null => {
	const { fromId, toId } = getTransitionLinkFromProps(element);
	if (fromId && toId) {
		return pairsById.get(`${fromId}::${toId}`) ?? null;
	}

	const boundary = element.timeline.start;
	const trackIndex = element.timeline.trackIndex ?? MAIN_TRACK_INDEX;
	const boundaryKey = `${trackIndex}::${boundary}`;
	const byTrack = pairsByBoundary.get(boundaryKey);
	if (byTrack && byTrack.length === 1) {
		return byTrack[0];
	}
	const byBoundary = pairsByBoundaryOnly.get(boundary);
	if (byBoundary && byBoundary.length === 1) {
		return byBoundary[0];
	}
	return null;
};

export const collectLinkedTransitions = (
	elements: TimelineElement[],
	selectedIds: string[],
): string[] => {
	if (selectedIds.length < 2) return selectedIds;

	const selectedSet = new Set(selectedIds);
	const pairs = buildClipPairs(elements);
	const transitions = elements.filter(isTransitionElement);

	if (transitions.length === 0 || pairs.length === 0) {
		return selectedIds;
	}

	const transitionsByPair = new Map<string, TimelineElement[]>();
	const transitionsByBoundary = new Map<string, TimelineElement[]>();

	for (const transition of transitions) {
		const { fromId, toId } = getTransitionLinkFromProps(transition);
		if (fromId && toId) {
			const key = `${fromId}::${toId}`;
			const list = transitionsByPair.get(key) ?? [];
			list.push(transition);
			transitionsByPair.set(key, list);
			continue;
		}
		const boundary = transition.timeline.start;
		const trackIndex = transition.timeline.trackIndex ?? MAIN_TRACK_INDEX;
		const key = `${trackIndex}::${boundary}`;
		const list = transitionsByBoundary.get(key) ?? [];
		list.push(transition);
		transitionsByBoundary.set(key, list);
	}

	const extraIds = new Set<string>();
	for (const pair of pairs) {
		if (!selectedSet.has(pair.fromId) || !selectedSet.has(pair.toId)) {
			continue;
		}
		const key = `${pair.fromId}::${pair.toId}`;
		const matched = transitionsByPair.get(key);
		if (matched && matched.length > 0) {
			for (const transition of matched) {
				extraIds.add(transition.id);
			}
			continue;
		}
		const fallback =
			transitionsByBoundary.get(`${pair.trackIndex}::${pair.boundary}`) ?? [];
		for (const transition of fallback) {
			extraIds.add(transition.id);
		}
	}

	if (extraIds.size === 0) return selectedIds;
	return Array.from(new Set([...selectedIds, ...extraIds]));
};

export const reconcileTransitions = (
	elements: TimelineElement[],
	fps?: number,
): TimelineElement[] => {
	const transitions = elements.filter(isTransitionElement);
	if (transitions.length === 0) return elements;

	const pairs = buildClipPairs(elements);
	if (pairs.length === 0) {
		const filtered = elements.filter((el) => !isTransitionElement(el));
		return filtered.length === elements.length ? elements : filtered;
	}

	const pairsById = new Map<string, TransitionLink>();
	const pairsByBoundary = new Map<string, TransitionLink[]>();
	const pairsByBoundaryOnly = new Map<number, TransitionLink[]>();
	for (const pair of pairs) {
		pairsById.set(`${pair.fromId}::${pair.toId}`, pair);
		const boundaryKey = `${pair.trackIndex}::${pair.boundary}`;
		const boundaryList = pairsByBoundary.get(boundaryKey) ?? [];
		boundaryList.push(pair);
		pairsByBoundary.set(boundaryKey, boundaryList);
		const boundaryOnlyList = pairsByBoundaryOnly.get(pair.boundary) ?? [];
		boundaryOnlyList.push(pair);
		pairsByBoundaryOnly.set(pair.boundary, boundaryOnlyList);
	}

	const fpsValue = normalizeFps(fps);
	const usedPairs = new Set<string>();
	let didChange = false;
	const next: TimelineElement[] = [];

	for (const element of elements) {
		if (!isTransitionElement(element)) {
			next.push(element);
			continue;
		}

		const link = resolveTransitionLink(
			element,
			pairsById,
			pairsByBoundary,
			pairsByBoundaryOnly,
		);
		if (!link) {
			didChange = true;
			continue;
		}

		const pairKey = `${link.fromId}::${link.toId}`;
		if (usedPairs.has(pairKey)) {
			didChange = true;
			continue;
		}
		usedPairs.add(pairKey);

		let updated = element;
		const { fromId, toId } = getTransitionLinkFromProps(element);
		if (fromId !== link.fromId || toId !== link.toId) {
			updated = {
				...updated,
				props: {
					...(updated.props ?? {}),
					fromId: link.fromId,
					toId: link.toId,
				},
			};
			didChange = true;
		}

		const normalized = ensureTransitionTimeline(updated, link, fpsValue);
		if (normalized !== updated) {
			didChange = true;
		}
		next.push(normalized);
	}

	return didChange ? next : elements;
};
