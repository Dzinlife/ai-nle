import React from "react";
import { Group as SkiaGroup } from "react-skia-lite";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import { componentRegistry } from "@/dsl/model/componentRegistry";
import type { TimelineElement } from "@/dsl/types";
import { useTimelineStore } from "@/editor/contexts/TimelineContext";
import { prepareSyncPicture } from "./picture";
import type {
	ComponentModel,
	ComponentModelStore,
	PrepareFrameContext,
	ValidationResult,
} from "../model/types";

export interface TransitionProps {
	fromId?: string;
	toId?: string;
}

export type TransitionModelStore = ComponentModelStore<TransitionProps>;

const DEFAULT_TRANSITION_DURATION = 15;

const resolveTransitionDuration = (element: {
	transition?: { duration?: number };
	props?: { duration?: number };
}) => {
	const metaDuration = element.transition?.duration;
	const legacyDuration =
		typeof element.props?.duration === "number"
			? element.props.duration
			: undefined;
	const value = metaDuration ?? legacyDuration ?? DEFAULT_TRANSITION_DURATION;
	if (!Number.isFinite(value)) return DEFAULT_TRANSITION_DURATION;
	return Math.max(0, Math.round(value));
};

const buildTransitionRange = (
	boundary: number,
	duration: number,
): { start: number; end: number } => {
	const safeDuration = Math.max(0, Math.round(duration));
	const head = Math.floor(safeDuration / 2);
	const tail = safeDuration - head;
	return {
		start: boundary - head,
		end: boundary + tail,
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

const renderElementNode = (
	element: TimelineElement,
	renderTimeline?: { start: number; end: number; offset: number },
) => {
	const componentDef = componentRegistry.get(element.component);
	if (!componentDef) {
		console.warn(
			`[Transition] Component "${element.component}" not registered`,
		);
		return null;
	}
	const Renderer = componentDef.Renderer;
	return React.createElement(Renderer, {
		id: element.id,
		...element.props,
		...(element.type === "VideoClip" && renderTimeline
			? { renderTimeline }
			: {}),
	});
};

const wrapOpacityNode = (node: React.ReactNode, opacity: number) => {
	if (!node) return null;
	if (!Number.isFinite(opacity) || opacity >= 1) return node;
	return React.createElement(SkiaGroup, { opacity }, node);
};

const prepareTransitionPictures = async (
	element: TimelineElement,
	displayTime: number,
): Promise<void> => {
	const timelineState = useTimelineStore.getState();
	if (!timelineState.isExporting) return;
	const trackIndex = element.timeline.trackIndex ?? 0;
	if (timelineState.tracks[trackIndex]?.hidden) return;

	const duration = resolveTransitionDuration(element);
	if (duration <= 0) return;
	const boundary = element.timeline.start ?? 0;
	const { start, end } = buildTransitionRange(boundary, duration);
	if (displayTime < start || displayTime >= end) return;

	const { fromId, toId } = (element.props ?? {}) as {
		fromId?: string;
		toId?: string;
	};
	if (!fromId || !toId) return;

	const elementsById = new Map(
		timelineState.elements.map((el) => [el.id, el] as const),
	);
	const fromElement = elementsById.get(fromId);
	const toElement = elementsById.get(toId);
	if (!fromElement || !toElement) return;

	const { width, height } = timelineState.canvasSize;
	if (width <= 0 || height <= 0) return;

	const fromTimeline =
		fromElement.type === "VideoClip"
			? buildTransitionRenderTimeline(fromElement, start, end)
			: undefined;
	const toTimeline =
		toElement.type === "VideoClip"
			? buildTransitionRenderTimeline(toElement, start, end)
			: undefined;
	const fromOpacity = fromElement.render?.opacity ?? 1;
	const toOpacity = toElement.render?.opacity ?? 1;
	const fromNode = wrapOpacityNode(
		renderElementNode(fromElement, fromTimeline),
		fromOpacity,
	);
	const toNode = wrapOpacityNode(
		renderElementNode(toElement, toTimeline),
		toOpacity,
	);
	if (fromNode) {
		await prepareSyncPicture(`${element.id}:from`, displayTime, fromNode, {
			width,
			height,
		});
	}
	if (toNode) {
		await prepareSyncPicture(`${element.id}:to`, displayTime, toNode, {
			width,
			height,
		});
	}
};

export function createTransitionModel(
	id: string,
	initialProps: TransitionProps,
): TransitionModelStore {
	return createStore<ComponentModel<TransitionProps>>()(
		subscribeWithSelector((set, get) => ({
			id,
			type: "Transition",
			props: {
				fromId: initialProps?.fromId,
				toId: initialProps?.toId,
			},
			constraints: {
				canTrimStart: false,
				canTrimEnd: false,
			},
			internal: {},

			setProps: (partial) => {
				set((state) => ({
					...state,
					props: { ...get().props, ...partial },
				}));
				return { valid: true, errors: [] };
			},

			setConstraints: (partial) => {
				set((state) => ({
					...state,
					constraints: { ...state.constraints, ...partial },
				}));
			},

			setInternal: (partial) => {
				set((state) => ({
					...state,
					internal: { ...state.internal, ...partial },
				}));
			},

			validate: (_newProps): ValidationResult => {
				return { valid: true, errors: [] };
			},

			init: () => {},

			dispose: () => {},

			prepareFrame: async (context: PrepareFrameContext) => {
				if (context.phase === "afterRender") return;
				await prepareTransitionPictures(context.element, context.displayTime);
			},
		})),
	);
}
