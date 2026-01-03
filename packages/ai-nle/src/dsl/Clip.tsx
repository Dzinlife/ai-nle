import { Rect } from "react-skia-lite";
import { converMetaLayoutToCanvasLayout } from "./layout";
import { ICommonProps } from "./types";

const Clip = ({
	children,
	...props
}: ICommonProps & { children?: React.ReactNode }) => {
	const { x, y, width, height } = converMetaLayoutToCanvasLayout(props);
	return <Rect x={x} y={y} width={width} height={height} color="blue" />;
};

export default Clip;
