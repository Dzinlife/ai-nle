import { createContext, useContext, useMemo, useState } from "react";

const TimelineContext = createContext({
	currentTime: 0,
	setCurrentTime: (currentTime: number) => {},
});

export const useTimeline = () => {
	return useContext(TimelineContext);
};

export const TimelineProvider = ({
	children,
}: {
	children: React.ReactNode;
}) => {
	const [currentTime, setCurrentTime] = useState(0);

	const defaultValues = useMemo(
		() => ({
			currentTime,
			setCurrentTime,
		}),
		[currentTime],
	);

	return (
		<TimelineContext.Provider value={defaultValues}>
			{children}
		</TimelineContext.Provider>
	);
};
