import { LottieIcon } from "@/components/icons";
import { useModelSelector } from "../model/registry";
import type { TimelineProps } from "../model/types";
import type { LottieProps } from "./model";

interface LottieTimelineProps extends TimelineProps {
	id: string;
}

export const LottieTimeline: React.FC<LottieTimelineProps> = ({ id }) => {
	// 订阅 model 状态

	const name = useModelSelector<LottieProps, string | undefined>(
		id,
		(state) => state.props.name,
	);

	return (
		<div className="absolute inset-0 rounded-md overflow-hidden bg-linear-to-b from-teal-800 to-teal-700 border border-teal-700 p-1">
			<div className="flex gap-1">
				<div className="rounded size-4 overflow-clip">
					<LottieIcon className="size-full" />
				</div>
				<span>{name || "Lottie"}</span>
			</div>
		</div>
	);
};
