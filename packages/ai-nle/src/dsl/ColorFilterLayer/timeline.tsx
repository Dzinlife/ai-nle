import type { TimelineProps } from "../model/types";

interface ColorFilterLayerTimelineProps extends TimelineProps {
	id: string;
}

export const ColorFilterLayerTimeline: React.FC<ColorFilterLayerTimelineProps> = () => {
	return (
		<div className="absolute inset-0 rounded-md overflow-hidden bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs">
			Color Filter
		</div>
	);
};
