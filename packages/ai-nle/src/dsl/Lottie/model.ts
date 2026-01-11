import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { ComponentModel, ComponentModelStore } from "../model/types";
import type { ComponentProps } from "../types";

export interface LottieProps extends ComponentProps {
	uri?: string;
	loop?: boolean;
	speed?: number;
}

export type LottieModelStore = ComponentModelStore<LottieProps>;

export function createLottieModel(
	id: string,
	initialProps: LottieProps,
): LottieModelStore {
	return createStore<ComponentModel<LottieProps>>()(
		subscribeWithSelector((set, get) => ({
			id,
			type: "Lottie",
			props: {
				loop: true,
				speed: 1.0,
				...initialProps,
			},
			constraints: {
				canTrimStart: true,
				canTrimEnd: true,
			},
			internal: {},

			setProps: (partial) => {
				set((state) => ({
					...state,
					props: { ...state.props, ...partial },
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

			validate: () => ({ valid: true, errors: [] }),

			init: () => {},

			dispose: () => {},
		})),
	);
}
