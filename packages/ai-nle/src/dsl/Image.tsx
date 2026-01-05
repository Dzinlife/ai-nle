import { Group, ImageShader, Rect, useImage } from "react-skia-lite";
import { EditorComponent } from "./types";

const Image: EditorComponent<{ uri?: string }> = ({ uri, __renderLayout }) => {
	const { x, y, w: width, h: height, r: rotate = 0 } = __renderLayout;
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

Image.displayName = "Image";
Image.timelineComponent = ({ uri }) => {
	return (
		<div
			className="rounded h-full bg-contain bg-repeat"
			style={{
				backgroundImage: `url(${uri})`,
			}}
		/>
	);
};

export default Image;
