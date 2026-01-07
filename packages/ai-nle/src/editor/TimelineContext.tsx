import {
	createContext,
	useContext,
	useMemo,
	useSyncExternalStore,
} from "react";
import { EditorElement } from "@/dsl/types";

type TimeSubscriber = (time: number) => void;
type ElementsSubscriber = (elements: EditorElement[]) => void;

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

class ElementsStore {
	private elements: EditorElement[] = [];
	private listeners = new Set<ElementsSubscriber>();

	constructor(initialElements: EditorElement[] = []) {
		this.elements = initialElements;
	}

	setElements = (
		elements: EditorElement[] | ((prev: EditorElement[]) => EditorElement[]),
	) => {
		const newElements =
			typeof elements === "function" ? elements(this.elements) : elements;
		if (this.elements !== newElements) {
			this.elements = newElements;
			this.listeners.forEach((listener) => listener(newElements));
		}
	};

	getElements = () => {
		return this.elements;
	};

	subscribe = (callback: ElementsSubscriber) => {
		this.listeners.add(callback);
		callback(this.elements);
		return () => {
			this.listeners.delete(callback);
		};
	};

	getSnapshot = () => {
		return this.elements;
	};
}

export const TimelineStoreContext = createContext<TimelineStore | null>(null);
export const ElementsStoreContext = createContext<ElementsStore | null>(null);

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

/**
 * Hook to get elements state reactively.
 * Triggers re-renders when elements change.
 */
export const useElements = () => {
	const store = useContext(ElementsStoreContext);
	if (!store) {
		throw new Error("useElements must be used within a TimelineProvider");
	}

	const elements = useSyncExternalStore(
		(onStoreChange) => store.subscribe(() => onStoreChange()),
		store.getSnapshot,
	);

	return {
		elements,
		setElements: store.setElements,
	};
};

/**
 * Hook to get elements functions without triggering re-renders.
 * Use this for performance-critical components.
 */
export const useElementsRef = () => {
	const store = useContext(ElementsStoreContext);
	if (!store) {
		throw new Error("useElementsRef must be used within a TimelineProvider");
	}

	return useMemo(
		() => ({
			getElements: store.getElements,
			setElements: store.setElements,
			subscribeToElements: store.subscribe,
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
	elements: initialElements,
}: {
	children: React.ReactNode;
	currentTime?: number;
	elements?: EditorElement[];
}) => {
	const timelineStore = useMemo(
		() => new TimelineStore(initialCurrentTime ?? 0),
		[initialCurrentTime],
	);

	const elementsStore = useMemo(
		() => new ElementsStore(initialElements ?? []),
		[initialElements],
	);

	return (
		<TimelineStoreContext.Provider value={timelineStore}>
			<ElementsStoreContext.Provider value={elementsStore}>
				{children}
			</ElementsStoreContext.Provider>
		</TimelineStoreContext.Provider>
	);
};
