import {
	ALL_FORMATS,
	CanvasSink,
	Input,
	UrlSource,
	WrappedCanvas,
} from "mediabunny";
import { useCallback, useEffect, useRef, useState } from "react";
import TimelineItemCommonWrapper from "./TimelineItemCommonWrapper";
import { CommonMeta, LayoutMeta, TimelineMeta } from "./types";

const ClipTimeline = ({
	children,
	uri,
	start,
	end,
	...props
}: CommonMeta &
	TimelineMeta & { children?: React.ReactNode; uri?: string }) => {
	return (
		<TimelineItemCommonWrapper start={start} end={end} {...props}>
			Clip
		</TimelineItemCommonWrapper>
	);
};

export default ClipTimeline;
