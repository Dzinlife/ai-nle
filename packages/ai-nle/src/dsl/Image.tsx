import { Group, ImageShader, Rect, useImage } from "react-skia-lite";
import { converMetaLayoutToCanvasLayout } from "./layout";
import { ICommonProps } from "./types";

const Image = ({ uri, ...props }: ICommonProps & { uri?: string }) => {
	const { x, y, width, height } = converMetaLayoutToCanvasLayout(props);

	const image = useImage(uri);

	return (
		<Group>
			<Rect x={x} y={y} width={width} height={height}>
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
