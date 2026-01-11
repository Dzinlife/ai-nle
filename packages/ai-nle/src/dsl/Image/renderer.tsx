import { Group, ImageShader, Rect } from "react-skia-lite";
import { useModelSelector } from "../model/registry";
import type { ComponentProps } from "../types";
import type { ImageInternal, ImageProps } from "./model";

interface ImageRendererProps extends ComponentProps {
	id: string;
}

const ImageRenderer: React.FC<ImageRendererProps> = ({
	id,
	__renderLayout,
}) => {
	const { x, y, w: width, h: height, r: rotate = 0 } = __renderLayout;

	// 订阅需要的状态
	const isLoading = useModelSelector<ImageProps, boolean>(
		id,
		(state) => state.constraints.isLoading ?? false,
	);
	const hasError = useModelSelector<ImageProps, boolean>(
		id,
		(state) => state.constraints.hasError ?? false,
	);
	const image = useModelSelector<ImageProps, ImageInternal["image"]>(
		id,
		(state) => (state.internal as unknown as ImageInternal).image,
	);

	// Loading 状态
	if (isLoading) {
		return (
			<Group>
				<Rect x={x} y={y} width={width} height={height} color="#e5e7eb" />
			</Group>
		);
	}

	// Error 状态
	if (hasError) {
		return (
			<Group>
				<Rect x={x} y={y} width={width} height={height} color="#fee2e2" />
			</Group>
		);
	}

	// 正常渲染
	return (
		<Group>
			<Rect
				x={x}
				y={y}
				width={width}
				height={height}
				transform={[{ rotate }]}
				origin={{ x, y }}
			>
				{image && (
					<ImageShader
						image={image}
						fit="contain"
						x={x}
						y={y}
						width={width}
						height={height}
					/>
				)}
			</Rect>
		</Group>
	);
};

export default ImageRenderer;
