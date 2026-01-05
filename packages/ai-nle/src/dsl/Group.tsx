import { Rect } from "react-skia-lite";
import GroupTimeline from "./GroupTimeline";
import { EditorComponent } from "./types";

const Group: EditorComponent<{ children?: React.ReactNode }> = ({
	children,
	__renderLayout,
}) => {
	const { x, y, w: width, h: height, r: rotate = 0 } = __renderLayout;
	return (
		<Rect
			x={x}
			y={y}
			width={width}
			height={height}
			color="red"
			transform={[{ rotate }]}
			origin={{ x, y }}
		>
			{children}
		</Rect>
	);
};

Group.displayName = "Group";
Group.timelineComponent = GroupTimeline;

export default Group;
