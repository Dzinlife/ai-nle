import { Rect } from "react-skia-lite";
import { converMetaLayoutToCanvasLayout } from "./layout";
import { ICommonProps } from "./types";

const Image = ({ src, ...props }: ICommonProps & { src: string }) => {
	const { x, y, width, height } = converMetaLayoutToCanvasLayout(props);
	return <Rect x={x} y={y} width={width} height={height} color="green" />;
};

export default Image;
