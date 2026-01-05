import { CommonMeta, TimelineMeta } from "./types";

const TimelineItemCommonWrapper = ({
	children,
	start,
	end,
	...props
}: CommonMeta & TimelineMeta & { children?: React.ReactNode }) => {
	return (
		<div>
			{children}
			TimelineItem {start} {end}
		</div>
	);
};

export default TimelineItemCommonWrapper;
