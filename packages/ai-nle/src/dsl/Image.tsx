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
Image.timelineComponent = ({ uri, name }) => {
	return (
		<div className="absolute inset-0 rounded-md overflow-hidden bg-linear-to-b from-indigo-800 to-indigo-700 border border-indigo-700 p-1">
			<div className="flex gap-1">
				<div
					className="rounded size-4 bg-cover"
					style={{
						backgroundImage: `url(${uri})`,
					}}
				/>
				<span>{name || "Image"}</span>
			</div>
		</div>
	);
};

export default Image;
