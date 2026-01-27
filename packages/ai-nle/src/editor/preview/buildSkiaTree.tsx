import React from "react";
import { Fill, Group as SkiaGroup } from "react-skia-lite";
import { componentRegistry } from "@/dsl/model/componentRegistry";
import type {
	ComponentModelStore,
	RendererPrepareFrameContext,
} from "@/dsl/model/types";
import type { TimelineElement } from "@/dsl/types";
import type { TimelineTrack } from "@/editor/timeline/types";
import {
	getTransitionBoundary,
	isTransitionElement,
} from "@/editor/utils/transitions";
import { computeVisibleElements } from "./utils";

type ActiveTransitionInfo = {
	role: "from" | "to";
	boundary: number;
	transitionId: string;
	transitionComponent: string;
	fromId: string;
	toId: string;
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

const renderElementNode = (target: TimelineElement) => {
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
	return <TargetRenderer id={target.id} {...target.props} />;
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

	const activeTransitionByElementId = new Map<string, ActiveTransitionInfo>();
	const extraVisibleIds = new Set<string>();

	const setActiveTransition = (elementId: string, info: ActiveTransitionInfo) => {
		const current = activeTransitionByElementId.get(elementId);
		if (!current) {
			activeTransitionByElementId.set(elementId, info);
			return;
		}
		const currentDistance = Math.abs(displayTime - current.boundary);
		const nextDistance = Math.abs(displayTime - info.boundary);
		if (nextDistance < currentDistance) {
			activeTransitionByElementId.set(elementId, info);
		}
	};

	for (const element of elements) {
		if (!isTransitionElement(element)) continue;
		const trackIndex = getTrackIndexForElement(element);
		if (tracks[trackIndex]?.hidden) continue;
		const transitionStart = element.timeline.start;
		const transitionEnd = element.timeline.end;
		if (displayTime < transitionStart || displayTime >= transitionEnd) continue;

		const { fromId, toId } = element.transition ?? {};
		if (!fromId || !toId) continue;
		const fromElement = elementsById.get(fromId);
		const toElement = elementsById.get(toId);
		if (!fromElement || !toElement) continue;
		if (isTransitionElement(fromElement) || isTransitionElement(toElement)) {
			continue;
		}

		const boundary = getTransitionBoundary(element);
		const baseInfo = {
			boundary,
			transitionId: element.id,
			transitionComponent: element.component,
			fromId,
			toId,
		};

		setActiveTransition(fromId, { ...baseInfo, role: "from" });
		setActiveTransition(toId, { ...baseInfo, role: "to" });
		extraVisibleIds.add(fromId);
		extraVisibleIds.add(toId);
	}

	const visibleElements = elements.filter((el) => {
		const trackIndex = getTrackIndexForElement(el);
		if (tracks[trackIndex]?.hidden) return false;
		if (isTransitionElement(el)) return false;
		if (extraVisibleIds.has(el.id)) return true;
		const { start = 0, end = Infinity } = el.timeline;
		return displayTime >= start && displayTime < end;
	});

	const orderedElements = sortByTrackIndex(visibleElements);

	const runPrepareRenderFrame = async (
		target: TimelineElement,
		extra?: Partial<RendererPrepareFrameContext>,
	): Promise<void> => {
		if (!isExporting) return;
		const componentDef = componentRegistry.get(target.component);
		if (!componentDef?.prepareRenderFrame) return;
		await componentDef.prepareRenderFrame({
			element: target,
			displayTime,
			fps,
			modelStore: getModelStore?.(target.id),
			getModelStore,
			canvasSize,
			...extra,
		});
	};

	const buildPlainElementPlan = (
		target: TimelineElement,
		options?: {
			opacity?: number;
		},
	): RenderPlan => {
		const content = renderElementNode(target);
		const node = wrapOpacityNode(content, options?.opacity ?? 1);
		const ready = runPrepareRenderFrame(target);
		return { node, ready };
	};

	const buildElementPlan = (
		element: TimelineElement,
	): RenderPlan => {
		const activeTransition = activeTransitionByElementId.get(element.id);
		const baseOpacity = element.render?.opacity ?? 1;

		if (activeTransition) {
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
						opacity: fromOpacity,
					});
					const toPlan = buildPlainElementPlan(toElement, {
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
								runPrepareRenderFrame(transitionElement, {
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
			opacity: baseOpacity,
		});
	};

	const plans = orderedElements.map((el) => buildElementPlan(el));

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
	return sortByTrackIndex(
		visibleElements.filter((element) => !isTransitionElement(element)),
	);
};
