import { createContext, useContext, useMemo, useState } from "react";

export const TimelineContext = createContext({
	currentTime: 0,
	setCurrentTime: (_currentTime: number) => {
		// 默认实现，不做任何事
	},
});

export const useTimeline = () => {
	return useContext(TimelineContext);
};

export const TimelineProvider = ({
	children,
	currentTime: initialCurrentTime,
}: {
	children: React.ReactNode;
	currentTime?: number;
}) => {
	const [internalCurrentTime, setCurrentTime] = useState(
		initialCurrentTime ?? 0,
	);

	const defaultValues = useMemo(
		() => ({
			currentTime: initialCurrentTime ?? internalCurrentTime,
			setCurrentTime,
		}),
		[initialCurrentTime, internalCurrentTime, setCurrentTime],
	);

	return (
		<TimelineContext.Provider value={defaultValues}>
			{children}
		</TimelineContext.Provider>
	);
};
