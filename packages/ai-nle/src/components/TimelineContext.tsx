import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";

type TimeSubscriber = (time: number) => void;

/**
 * Create a timeline store that manages time state outside of React.
 * This prevents parent re-renders when time changes.
 */
function createTimelineStore(initialTime: number) {
	let currentTime = initialTime;
	const subscribers = new Set<TimeSubscriber>();

	return {
		getTime: () => currentTime,
		setTime: (time: number) => {
			currentTime = time;
			for (const subscriber of subscribers) {
				subscriber(time);
			}
		},
		subscribe: (callback: TimeSubscriber) => {
			subscribers.add(callback);
			return () => {
				subscribers.delete(callback);
			};
		},
	};
}

type TimelineStore = ReturnType<typeof createTimelineStore>;

/**
 * Context for timeline store - value never changes after mount.
 */
interface TimelineContextValue {
	store: TimelineStore;
	setCurrentTime: (time: number) => void;
	subscribeToTime: (callback: TimeSubscriber) => () => void;
	getCurrentTime: () => number;
}

// Context holds the store - value never changes, so children won't re-render
const TimelineStoreContext = createContext<TimelineContextValue | null>(null);

/**
 * Hook to get timeline state reactively using useSyncExternalStore.
 * This WILL trigger re-renders when time changes.
 */
export const useTimeline = () => {
	const ctx = useContext(TimelineStoreContext);
	if (!ctx) {
		throw new Error("useTimeline must be used within a TimelineProvider");
	}

	const currentTime = useSyncExternalStore(
		ctx.store.subscribe,
		ctx.store.getTime,
		ctx.store.getTime,
	);

	return {
		currentTime,
		setCurrentTime: ctx.setCurrentTime,
		subscribeToTime: ctx.subscribeToTime,
		getCurrentTime: ctx.getCurrentTime,
	};
};

/**
 * Hook to subscribe to timeline changes without triggering re-renders.
 * The callback is called whenever currentTime changes.
 */
export const useTimelineSubscription = (callback: TimeSubscriber) => {
	const ctx = useContext(TimelineStoreContext);
	if (!ctx) {
		throw new Error(
			"useTimelineSubscription must be used within a TimelineProvider",
		);
	}

	useEffect(() => {
		return ctx.subscribeToTime(callback);
	}, [ctx.subscribeToTime, callback]);
};

/**
 * Hook to get timeline functions without subscribing to time changes.
 * This does NOT trigger re-renders when time changes.
 * Use this for performance-critical components that render Skia directly.
 */
export const useTimelineRef = () => {
	const ctx = useContext(TimelineStoreContext);
	if (!ctx) {
		throw new Error("useTimelineRef must be used within a TimelineProvider");
	}

	return {
		getCurrentTime: ctx.getCurrentTime,
		setCurrentTime: ctx.setCurrentTime,
		subscribeToTime: ctx.subscribeToTime,
	};
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
		storeRef.current = createTimelineStore(initialCurrentTime ?? 0);
	}
	const store = storeRef.current;

	// Stable callbacks - never change
	const setCurrentTime = useCallback(
		(time: number) => {
			store.setTime(time);
		},
		[store],
	);

	const subscribeToTime = useCallback(
		(callback: TimeSubscriber) => {
			return store.subscribe(callback);
		},
		[store],
	);

	const getCurrentTime = useCallback(() => {
		return store.getTime();
	}, [store]);

	// Context value - NEVER changes after mount
	const contextValue = useMemo<TimelineContextValue>(
		() => ({
			store,
			setCurrentTime,
			subscribeToTime,
			getCurrentTime,
		}),
		[store, setCurrentTime, subscribeToTime, getCurrentTime],
	);

	return (
		<TimelineStoreContext.Provider value={contextValue}>
			{children}
		</TimelineStoreContext.Provider>
	);
};
