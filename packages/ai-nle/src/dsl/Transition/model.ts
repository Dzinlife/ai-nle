import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
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

// const waitForNextFrame = () =>
// 	new Promise<void>((resolve) => {
// 		if (typeof requestAnimationFrame === "function") {
// 			requestAnimationFrame(() => resolve());
// 		} else {
// 			setTimeout(() => resolve(), 0);
// 		}
// 	});

// const settleTransitionPictures = async () => {
// 	// 等待两帧，保证 useSkPictureFromNode 的异步 effect 完成
// 	await waitForNextFrame();
// 	await waitForNextFrame();
// };

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

			// prepareFrame: async (context: PrepareFrameContext) => {
			// 	if (context.phase !== "afterRender") return;
			// 	if (context.element.type !== "Transition") return;
			// 	const transitionDuration = resolveTransitionDuration({
			// 		transition: context.element.transition,
			// 		props: context.element.props as { duration?: number },
			// 	});
			// 	if (transitionDuration <= 0) return;
			// 	const head = Math.floor(transitionDuration / 2);
			// 	const start = context.element.timeline.start - head;
			// 	const end = start + transitionDuration;
			// 	if (context.displayTime < start || context.displayTime >= end) {
			// 		return;
			// 	}
			// 	await settleTransitionPictures();
			// },
		})),
	);
}
