import { Rect } from "react-skia-lite";
import { usePreview } from "@/components/PreviewProvider";
import { converMetaLayoutToCanvasLayout } from "./layout";
import { ICommonProps } from "./types";

const Group = ({
	children,
	...props
}: ICommonProps & { children?: React.ReactNode }) => {
	const { pictureWidth, pictureHeight, canvasWidth, canvasHeight } =
		usePreview();

	const { x, y, width, height, rotation } = converMetaLayoutToCanvasLayout(
		props,
		{
			width: pictureWidth,
			height: pictureHeight,
		},
		{
			width: canvasWidth,
			height: canvasHeight,
		},
		window.devicePixelRatio,
	);

	return (
		<Rect
			x={x}
			y={y}
			width={width}
			height={height}
			color="red"
			transform={[{ rotate: rotation }]}
			origin={{ x, y }}
		>
			{children}
		</Rect>
	);
};

export default Group;
