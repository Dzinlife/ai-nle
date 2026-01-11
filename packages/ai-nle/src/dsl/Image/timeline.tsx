import { useModelSelector } from "../model/registry";
import type { TimelineProps } from "../model/types";
import type { ImageProps } from "./model";

interface ImageTimelineProps extends TimelineProps {
	id: string;
}

export const ImageTimeline: React.FC<ImageTimelineProps> = ({ id }) => {
	// 订阅 model 状态
	const uri = useModelSelector<ImageProps, string | undefined>(
		id,
		(state) => state.props.uri,
	);
	const name = useModelSelector<ImageProps, string | undefined>(
		id,
		(state) => state.props.name,
	);

	return (
		<div className="absolute inset-0 rounded-md overflow-hidden bg-linear-to-b from-indigo-800 to-indigo-700 border border-indigo-700 p-1">
			<div className="flex gap-1">
				{uri && (
					<div
						className="rounded size-4 bg-cover"
						style={{
							backgroundImage: `url(${uri})`,
						}}
					/>
				)}
				<span>{name || "Image"}</span>
			</div>
		</div>
	);
};
