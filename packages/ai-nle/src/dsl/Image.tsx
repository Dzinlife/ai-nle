import { Group, ImageShader, Rect, useImage } from "react-skia-lite";
import { CanvasLayoutMeta, CommonMeta, TimelineMeta } from "./types";

const Image = ({
	uri,
	x,
	y,
	w: width,
	h: height,
	r: rotate,
	...props
}: CommonMeta & CanvasLayoutMeta & TimelineMeta & { uri?: string }) => {
	const image = useImage(uri);

	return (
		<Group>
			<Rect
				x={x}
				y={y}
				width={width}
				height={height}
				transform={[{ rotate: rotate ?? 0 }]}
				origin={{ x, y }}
			>
				<ImageShader
					image={image}
					fit="contain"
					x={x}
					y={y}
					width={width}
					height={height}
				/>
			</Rect>
		</Group>
	);
};

export default Image;
