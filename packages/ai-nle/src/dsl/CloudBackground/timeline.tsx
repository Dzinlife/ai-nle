import { useTimelineStore } from "@/editor/contexts/TimelineContext";
import type { TimelineProps } from "../model/types";

interface CloudBackgroundTimelineProps extends TimelineProps {
	id: string;
}

export const CloudBackgroundTimeline: React.FC<
	CloudBackgroundTimelineProps
> = ({ id }) => {
	const name = useTimelineStore(
		(state) => state.elements.find((el) => el.id === id)?.name,
	);

	return (
		<div className="absolute inset-0 rounded-md overflow-hidden bg-linear-to-b from-sky-800 to-sky-700 border border-sky-700 p-1">
			<div className="flex gap-1">
				<span>{name || "Cloud Background"}</span>
			</div>
		</div>
	);
};
