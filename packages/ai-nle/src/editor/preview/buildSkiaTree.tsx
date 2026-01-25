import React, { useCallback } from "react";
import { Fill, Group as SkiaGroup } from "react-skia-lite";
import { componentRegistry } from "@/dsl/model/componentRegistry";
import type { TimelineElement } from "@/dsl/types";
import { useTimelineStore } from "@/editor/contexts/TimelineContext";
import type { TimelineTrack } from "@/editor/timeline/types";
import { getTransitionDuration, isTransitionElement } from "@/editor/utils/transitions";
import { computeVisibleElements } from "./utils";

const getTransitionRange = (
	boundary: number,
	duration: number,
): { start: number; end: number; duration: number } => {
	const safeDuration = Math.max(0, Math.round(duration));
	const head = Math.floor(safeDuration / 2);
	const tail = safeDuration - head;
	return {
		start: boundary - head,
		end: boundary + tail,
		duration: safeDuration,
	};
};

type TransitionClipInfo = {
	transitionStart: number;
	transitionEnd: number;
	boundary: number;
	duration: number;
	role: "from" | "to";
	transitionId: string;
	transitionComponent: string;
	fromId: string;
	toId: string;
	renderTimeline?: {
		start: number;
		end: number;
		offset: number;
	};
	peerRenderTimeline?: {
		start: number;
		end: number;
		offset: number;
	};
};

const buildTransitionRenderTimeline = (
	element: TimelineElement,
	transitionStart: number,
	transitionEnd: number,
): { start: number; end: number; offset: number } => {
	const baseStart = element.timeline.start ?? 0;
	const baseOffset = element.timeline.offset ?? 0;
	const offset = Math.round(baseOffset + (transitionStart - baseStart));
	return {
		start: transitionStart,
		end: transitionEnd,
		offset,
	};
};

const pickActiveTransition = (
	infos: TransitionClipInfo[] | undefined,
	currentTime: number,
): TransitionClipInfo | null => {
	if (!infos || infos.length === 0) return null;
	let best: TransitionClipInfo | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const info of infos) {
		if (currentTime < info.transitionStart || currentTime >= info.transitionEnd) {
			continue;
		}
		const distance = Math.abs(currentTime - info.boundary);
		if (!best || distance < bestDistance) {
			best = info;
			bestDistance = distance;
		}
	}
	return best;
};

interface TransitionClipLayerProps {
	element: TimelineElement;
	Renderer: React.ComponentType<any>;
	transitionInfos?: TransitionClipInfo[];
	elementsById: Map<string, TimelineElement>;
}

const TransitionClipLayer: React.FC<TransitionClipLayerProps> = ({
	element,
	Renderer,
	transitionInfos,
	elementsById,
}) => {
	const currentTimeFrames = useTimelineStore((state) => {
		if (state.isPlaying) {
			return state.currentTime;
		}
		return state.previewTime ?? state.currentTime;
	});
	const activeTransition = pickActiveTransition(transitionInfos, currentTimeFrames);
	const baseOpacity = element.render?.opacity ?? 1;
	let renderTimeline: TransitionClipInfo["renderTimeline"];
	const renderElement = useCallback(
		(
			target: TimelineElement,
			timeline?: TransitionClipInfo["renderTimeline"],
		) => {
			const componentDef = componentRegistry.get(target.component);
			if (!componentDef) {
				console.warn(
					`[PreviewEditor] Component "${target.component}" not registered`,
				);
				console.warn(
					`[PreviewEditor] Available components:`,
					componentRegistry.getComponentIds(),
				);
				return null;
			}
			const TargetRenderer = componentDef.Renderer;
			return (
				<TargetRenderer
					id={target.id}
					{...target.props}
					{...(target.type === "VideoClip" && timeline
						? { renderTimeline: timeline }
						: {})}
				/>
			);
		},
		[],
	);

	if (activeTransition) {
		renderTimeline = activeTransition.renderTimeline;
		const transitionElement = elementsById.get(activeTransition.transitionId);
		const transitionDef = transitionElement
			? componentRegistry.get(activeTransition.transitionComponent)
			: null;
		if (transitionDef) {
			if (activeTransition.role === "from") {
				return null;
			}
			const fromElement = elementsById.get(activeTransition.fromId);
			const toElement = elementsById.get(activeTransition.toId);
			if (!fromElement || !toElement) return null;
			const fromOpacity = fromElement.render?.opacity ?? 1;
			const toOpacity = toElement.render?.opacity ?? 1;
			const fromContent = renderElement(
				fromElement,
				activeTransition.peerRenderTimeline,
			);
			const toContent = renderElement(
				toElement,
				activeTransition.renderTimeline,
			);
			const fromNode = fromContent ? (
				<SkiaGroup opacity={fromOpacity}>{fromContent}</SkiaGroup>
			) : null;
			const toNode = toContent ? (
				<SkiaGroup opacity={toOpacity}>{toContent}</SkiaGroup>
			) : null;
			const TransitionRenderer = transitionDef.Renderer;
			return (
				<TransitionRenderer
					id={activeTransition.transitionId}
					{...transitionElement?.props}
					fromNode={fromNode}
					toNode={toNode}
				/>
			);
		}
	}

	return (
		<SkiaGroup opacity={baseOpacity}>
			<Renderer
				id={element.id}
				{...element.props}
				{...(element.type === "VideoClip" && renderTimeline
					? { renderTimeline }
					: {})}
			/>
		</SkiaGroup>
	);
};

export const buildSkiaTree = ({
	elements,
	displayTime,
	tracks,
	getTrackIndexForElement,
	sortByTrackIndex,
}: {
	elements: TimelineElement[];
	displayTime: number;
	tracks: TimelineTrack[];
	getTrackIndexForElement: (element: TimelineElement) => number;
	sortByTrackIndex: (elements: TimelineElement[]) => TimelineElement[];
}) => {
	const elementsById = new Map(elements.map((el) => [el.id, el] as const));

	const transitionInfosById = new Map<string, TransitionClipInfo[]>();

	for (const element of elements) {
		if (!isTransitionElement(element)) continue;
		const trackIndex = getTrackIndexForElement(element);
		if (tracks[trackIndex]?.hidden) continue;
		const transitionDuration = getTransitionDuration(element);
		if (transitionDuration <= 0) continue;

		const { start, end, duration } = getTransitionRange(
			element.timeline.start,
			transitionDuration,
		);
		if (displayTime < start || displayTime >= end) continue;

		const { fromId, toId } = (element.props ?? {}) as {
			fromId?: string;
			toId?: string;
		};
		if (!fromId || !toId) continue;
		const fromElement = elementsById.get(fromId);
		const toElement = elementsById.get(toId);
		if (!fromElement || !toElement) continue;
		if (isTransitionElement(fromElement) || isTransitionElement(toElement)) {
			continue;
		}

		const fromRenderTimeline =
			fromElement.type === "VideoClip"
				? buildTransitionRenderTimeline(fromElement, start, end)
				: undefined;
		const toRenderTimeline =
			toElement.type === "VideoClip"
				? buildTransitionRenderTimeline(toElement, start, end)
				: undefined;
		const baseTransitionInfo = {
			transitionStart: start,
			transitionEnd: end,
			boundary: element.timeline.start,
			duration,
			transitionId: element.id,
			transitionComponent: element.component,
			fromId,
			toId,
		};

		const fromInfo: TransitionClipInfo = {
			...baseTransitionInfo,
			role: "from",
			renderTimeline: fromRenderTimeline,
			peerRenderTimeline: toRenderTimeline,
		};
		const toInfo: TransitionClipInfo = {
			...baseTransitionInfo,
			role: "to",
			renderTimeline: toRenderTimeline,
			peerRenderTimeline: fromRenderTimeline,
		};

		const fromList = transitionInfosById.get(fromId) ?? [];
		fromList.push(fromInfo);
		transitionInfosById.set(fromId, fromList);

		const toList = transitionInfosById.get(toId) ?? [];
		toList.push(toInfo);
		transitionInfosById.set(toId, toList);
	}

	const visibleElements = elements.filter((el) => {
		const trackIndex = getTrackIndexForElement(el);
		if (tracks[trackIndex]?.hidden) return false;
		if (isTransitionElement(el)) return false;
		const transitionInfos = transitionInfosById.get(el.id);
		if (
			transitionInfos?.some(
				(info) =>
					displayTime >= info.transitionStart &&
					displayTime < info.transitionEnd,
			)
		) {
			return true;
		}
		const { start = 0, end = Infinity } = el.timeline;
		return displayTime >= start && displayTime < end;
	});

	const orderedElements = sortByTrackIndex(visibleElements);

	const children = (
		<>
			<Fill color="black" />
			{orderedElements.map((el) => {
				const componentDef = componentRegistry.get(el.component);
				if (!componentDef) {
					console.warn(
						`[PreviewEditor] Component "${el.component}" not registered`,
					);
					console.warn(
						`[PreviewEditor] Available components:`,
						componentRegistry.getComponentIds(),
					);
					return null;
				}

				const Renderer = componentDef.Renderer;

				return (
					<TransitionClipLayer
						key={el.id}
						element={el}
						Renderer={Renderer}
						transitionInfos={transitionInfosById.get(el.id)}
						elementsById={elementsById}
					/>
				);
			})}
		</>
	);

	return { children, orderedElements };
};

export const buildKonvaTree = ({
	elements,
	displayTime,
	tracks,
	sortByTrackIndex,
}: {
	elements: TimelineElement[];
	displayTime: number;
	tracks: TimelineTrack[];
	sortByTrackIndex: (elements: TimelineElement[]) => TimelineElement[];
}) => {
	const visibleElements = computeVisibleElements(elements, displayTime, tracks);
	return sortByTrackIndex(visibleElements);
};
