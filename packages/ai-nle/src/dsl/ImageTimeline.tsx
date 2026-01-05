import { useCallback, useEffect, useRef, useState } from "react";
import TimelineItemCommonWrapper from "./TimelineItemCommonWrapper";
import { CommonMeta, TimelineMeta } from "./types";

const ImageTimeline = ({
	children,
	uri,
	start,
	end,
	...props
}: CommonMeta &
	TimelineMeta & { children?: React.ReactNode; uri?: string }) => {
	return (
		<TimelineItemCommonWrapper start={start} end={end} {...props}>
			Image
		</TimelineItemCommonWrapper>
	);
};

export default ImageTimeline;
