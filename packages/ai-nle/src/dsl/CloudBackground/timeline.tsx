import { useModelSelector } from "../model/registry";
import type { TimelineProps } from "../model/types";
import type { CloudBackgroundProps } from "./model";

interface CloudBackgroundTimelineProps extends TimelineProps {
	id: string;
}

export const CloudBackgroundTimeline: React.FC<
	CloudBackgroundTimelineProps
> = ({ id }) => {
	// 订阅 model 状态

	const name = useModelSelector<CloudBackgroundProps, string | undefined>(
		id,
		(state) => state.props.name,
	);

	return (
		<div className="absolute inset-0 rounded-md overflow-hidden bg-linear-to-b from-sky-800 to-sky-700 border border-sky-700 p-1">
			<div className="flex gap-1">
				<span>{name || "Cloud Background"}</span>
			</div>
		</div>
	);
};
