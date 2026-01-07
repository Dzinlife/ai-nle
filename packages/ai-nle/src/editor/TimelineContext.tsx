import {
	createContext,
	useContext,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";

type TimeSubscriber = (time: number) => void;

class TimelineStore {
	private currentTime = 0;
	private listeners = new Set<TimeSubscriber>();

	constructor(initialTime: number = 0) {
		this.currentTime = initialTime;
	}

	setCurrentTime = (time: number) => {
		if (this.currentTime !== time) {
			this.currentTime = time;
			this.listeners.forEach((listener) => listener(time));
		}
	};

	getCurrentTime = () => {
		return this.currentTime;
	};

	subscribe = (callback: TimeSubscriber) => {
		this.listeners.add(callback);
		callback(this.currentTime);
		return () => {
			this.listeners.delete(callback);
		};
	};

	getSnapshot = () => {
		return this.currentTime;
	};
}

export const TimelineStoreContext = createContext<TimelineStore | null>(null);

/**
 * Hook to get timeline state reactively.
 * Triggers re-renders when currentTime changes.
 */
export const useTimeline = () => {
	const store = useContext(TimelineStoreContext);
	if (!store) {
		throw new Error("useTimeline must be used within a TimelineProvider");
	}

	const currentTime = useSyncExternalStore(
		(onStoreChange) => store.subscribe(() => onStoreChange()),
		store.getSnapshot,
	);

	return {
		currentTime,
		setCurrentTime: store.setCurrentTime,
	};
};

/**
 * Hook to get timeline functions without triggering re-renders.
 * Use this for performance-critical components.
 */
export const useTimelineRef = () => {
	const store = useContext(TimelineStoreContext);
	if (!store) {
		throw new Error("useTimelineRef must be used within a TimelineProvider");
	}

	return useMemo(
		() => ({
			getCurrentTime: store.getCurrentTime,
			setCurrentTime: store.setCurrentTime,
			subscribeToTime: store.subscribe,
		}),
		[store],
	);
};

export const TimelineContext = createContext<{
	currentTime: number;
	setCurrentTime: (time: number) => void;
}>({
	currentTime: 0,
	setCurrentTime: () => {},
});

export const TimelineProvider = ({
	children,
	currentTime: initialCurrentTime,
}: {
	children: React.ReactNode;
	currentTime?: number;
}) => {
	const store = useMemo(
		() => new TimelineStore(initialCurrentTime ?? 0),
		[initialCurrentTime],
	);

	return (
		<TimelineStoreContext.Provider value={store}>
			{children}
		</TimelineStoreContext.Provider>
	);
};
