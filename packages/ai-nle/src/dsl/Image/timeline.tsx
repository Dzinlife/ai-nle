import { useTimelineStore } from "@/editor/contexts/TimelineContext";
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
	const name = useTimelineStore(
		(state) => state.elements.find((el) => el.id === id)?.name,
	);

	return (
		<div className="absolute inset-0 p-1 bg-indigo-700">
			<div className="flex gap-1">
				{uri && (
					<div
						className="rounded-xs size-4.5 bg-cover"
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
