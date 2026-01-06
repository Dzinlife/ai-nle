import { makeAutoObservable, reaction } from "mobx";
import { observer } from "mobx-react-lite";
import { createContext, useContext, useEffect, useMemo, useRef } from "react";

type TimeSubscriber = (time: number) => void;

/**
 * MobX-based Timeline Store
 * - currentTime is observable
 * - Components using observer() will re-render when currentTime changes
 * - Components NOT using observer() won't re-render
 */
class TimelineStore {
	currentTime = 0;

	constructor(initialTime: number = 0) {
		this.currentTime = initialTime;
		makeAutoObservable(this);
	}

	setCurrentTime = (time: number) => {
		this.currentTime = time;
	};

	getCurrentTime = () => {
		return this.currentTime;
	};

	/**
	 * Subscribe to time changes without using MobX reactions in React.
	 * Useful for imperative code that needs to react to time changes.
	 */
	subscribe = (callback: TimeSubscriber): (() => void) => {
		return reaction(
			() => this.currentTime,
			(time) => callback(time),
		);
	};
}

// Context for the store instance
const TimelineStoreContext = createContext<TimelineStore | null>(null);

/**
 * Get the timeline store instance.
 * This does NOT cause re-renders by itself - use with observer() if you need reactivity.
 */
export const useTimelineStore = () => {
	const store = useContext(TimelineStoreContext);
	if (!store) {
		throw new Error("useTimelineStore must be used within a TimelineProvider");
	}
	return store;
};

/**
 * Hook to get timeline state reactively.
 * WARNING: This will trigger re-renders on every time change!
 * The component using this hook should be wrapped with observer() or use useTimelineRef() instead.
 */
export const useTimeline = () => {
	const store = useTimelineStore();
	// Return the store - component must be wrapped with observer() to get reactivity
	return {
		currentTime: store.currentTime,
		setCurrentTime: store.setCurrentTime,
		getCurrentTime: store.getCurrentTime,
		subscribeToTime: store.subscribe,
	};
};

/**
 * Hook to subscribe to timeline changes without triggering re-renders.
 * The callback is called whenever currentTime changes.
 */
export const useTimelineSubscription = (callback: TimeSubscriber) => {
	const store = useTimelineStore();

	useEffect(() => {
		return store.subscribe(callback);
	}, [store, callback]);
};

/**
 * Hook to get timeline functions without subscribing to time changes.
 * This does NOT trigger re-renders when time changes.
 * Use this for performance-critical components that render Skia directly.
 */
export const useTimelineRef = () => {
	const store = useTimelineStore();

	// Return stable references that don't change
	return useMemo(
		() => ({
			getCurrentTime: store.getCurrentTime,
			setCurrentTime: store.setCurrentTime,
			subscribeToTime: store.subscribe,
		}),
		[store],
	);
};

// Legacy context for backward compatibility
export const TimelineContext = createContext<{
	currentTime: number;
	setCurrentTime: (time: number) => void;
	subscribeToTime: (callback: TimeSubscriber) => () => void;
	getCurrentTime: () => number;
}>({
	currentTime: 0,
	setCurrentTime: () => {},
	subscribeToTime: () => () => {},
	getCurrentTime: () => 0,
});

export const TimelineProvider = ({
	children,
	currentTime: initialCurrentTime,
}: {
	children: React.ReactNode;
	currentTime?: number;
}) => {
	// Create store once on mount - never changes
	const storeRef = useRef<TimelineStore | null>(null);
	if (!storeRef.current) {
		storeRef.current = new TimelineStore(initialCurrentTime ?? 0);
	}
	const store = storeRef.current;

	return (
		<TimelineStoreContext.Provider value={store}>
			{children}
		</TimelineStoreContext.Provider>
	);
};

// Re-export observer for convenience
export { observer };
