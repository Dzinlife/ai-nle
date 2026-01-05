import { Rect } from "react-skia-lite";
import { CanvasLayoutMeta, CommonMeta, TimelineMeta } from "./types";

const Group = ({
	children,
	x,
	y,
	w: width,
	h: height,
	r: rotate = 0,
	...props
}: CommonMeta &
	CanvasLayoutMeta &
	Partial<TimelineMeta> & { children?: React.ReactNode }) => {
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

export default Group;
