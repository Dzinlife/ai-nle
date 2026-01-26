import React from "react";
import { Fill, Group as SkiaGroup } from "react-skia-lite";
import { componentRegistry } from "@/dsl/model/componentRegistry";
import type {
	ComponentModelStore,
	RendererPrepareFrameContext,
} from "@/dsl/model/types";
import type { TimelineElement } from "@/dsl/types";
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

export type TransitionClipInfo = {
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

export const pickActiveTransition = (
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

type RenderPlan = {
	node: React.ReactNode | null;
	ready: Promise<void>;
};

type RenderPrepareOptions = {
	isExporting: boolean;
	fps: number;
	canvasSize: { width: number; height: number };
	getModelStore?: (id: string) => ComponentModelStore | undefined;
};

const renderElementNode = (
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
};

const wrapOpacityNode = (node: React.ReactNode | null, opacity: number) => {
	if (!node) return null;
	return <SkiaGroup opacity={opacity}>{node}</SkiaGroup>;
};

export const buildSkiaRenderState = ({
	elements,
	displayTime,
	tracks,
	getTrackIndexForElement,
	sortByTrackIndex,
	prepare,
}: {
	elements: TimelineElement[];
	displayTime: number;
	tracks: TimelineTrack[];
	getTrackIndexForElement: (element: TimelineElement) => number;
	sortByTrackIndex: (elements: TimelineElement[]) => TimelineElement[];
	prepare?: RenderPrepareOptions;
}) => {
	const elementsById = new Map(elements.map((el) => [el.id, el] as const));
	const isExporting = prepare?.isExporting ?? false;
	const fps = prepare?.fps ?? 0;
	const canvasSize = prepare?.canvasSize;
	const getModelStore = prepare?.getModelStore;

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

	const runPrepareRenderFrame = async (
		target: TimelineElement,
		renderTimeline?: TransitionClipInfo["renderTimeline"],
		extra?: Partial<RendererPrepareFrameContext>,
	): Promise<void> => {
		if (!isExporting) return;
		const componentDef = componentRegistry.get(target.component);
		if (!componentDef?.prepareRenderFrame) return;
		await componentDef.prepareRenderFrame({
			element: target,
			displayTime,
			fps,
			renderTimeline,
			modelStore: getModelStore?.(target.id),
			getModelStore,
			canvasSize,
			...extra,
		});
	};

	const buildPlainElementPlan = (
		target: TimelineElement,
		options?: {
			renderTimeline?: TransitionClipInfo["renderTimeline"];
			opacity?: number;
		},
	): RenderPlan => {
		const content = renderElementNode(target, options?.renderTimeline);
		const node = wrapOpacityNode(content, options?.opacity ?? 1);
		const ready = runPrepareRenderFrame(target, options?.renderTimeline);
		return { node, ready };
	};

	const buildElementPlan = (
		element: TimelineElement,
		transitionInfos?: TransitionClipInfo[],
	): RenderPlan => {
		const activeTransition = pickActiveTransition(transitionInfos, displayTime);
		const baseOpacity = element.render?.opacity ?? 1;
		let renderTimeline: TransitionClipInfo["renderTimeline"];

		if (activeTransition) {
			renderTimeline = activeTransition.renderTimeline;
			const transitionElement = elementsById.get(activeTransition.transitionId);
			if (transitionElement) {
				const transitionDef = componentRegistry.get(
					activeTransition.transitionComponent,
				);
				if (transitionDef) {
					if (activeTransition.role === "from") {
						return { node: null, ready: Promise.resolve() };
					}
					const fromElement = elementsById.get(activeTransition.fromId);
					const toElement = elementsById.get(activeTransition.toId);
					if (!fromElement || !toElement) {
						return { node: null, ready: Promise.resolve() };
					}
					const fromOpacity = fromElement.render?.opacity ?? 1;
					const toOpacity = toElement.render?.opacity ?? 1;
					const fromPlan = buildPlainElementPlan(fromElement, {
						renderTimeline: activeTransition.peerRenderTimeline,
						opacity: fromOpacity,
					});
					const toPlan = buildPlainElementPlan(toElement, {
						renderTimeline: activeTransition.renderTimeline,
						opacity: toOpacity,
					});
					const TransitionRenderer = transitionDef.Renderer;
					const node = (
						<TransitionRenderer
							id={activeTransition.transitionId}
							{...transitionElement.props}
							fromNode={fromPlan.node}
							toNode={toPlan.node}
						/>
					);
					const ready = isExporting
						? Promise.all([fromPlan.ready, toPlan.ready]).then(() =>
								runPrepareRenderFrame(transitionElement, undefined, {
									fromNode: fromPlan.node,
									toNode: toPlan.node,
								}),
							)
						: Promise.resolve();
					return { node, ready };
				}
			}
		}

		return buildPlainElementPlan(element, {
			renderTimeline,
			opacity: baseOpacity,
		});
	};

	const plans = orderedElements.map((el) =>
		buildElementPlan(el, transitionInfosById.get(el.id)),
	);

	const children = (
		<>
			<Fill color="black" />
			{plans.map((plan, index) => (
				<React.Fragment key={orderedElements[index].id}>
					{plan.node}
				</React.Fragment>
			))}
		</>
	);

	const ready = isExporting
		? Promise.all(plans.map((plan) => plan.ready)).then(() => undefined)
		: Promise.resolve();

	return {
		children,
		orderedElements,
		visibleElements,
		transitionInfosById,
		ready,
	};
};

export const buildSkiaTree = (args: {
	elements: TimelineElement[];
	displayTime: number;
	tracks: TimelineTrack[];
	getTrackIndexForElement: (element: TimelineElement) => number;
	sortByTrackIndex: (elements: TimelineElement[]) => TimelineElement[];
}) => {
	const { children, orderedElements } = buildSkiaRenderState(args);
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
