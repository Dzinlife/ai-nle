import { useMemo } from "react";
import { BackdropFilter, Group, ImageFilter, Skia } from "react-skia-lite";
import { EditorComponent } from "./types";

const BackdropZoom: EditorComponent<{
	zoom: number;
	shape?: "circle" | "rect";
	size?: { width: number; height: number };
	cornerRadius?: number;
}> = ({ zoom, __renderLayout, shape = "circle", cornerRadius = 16 }) => {
	const { x, y, w: width, h: height } = __renderLayout;
	// 从布局属性计算中心点
	const center = useMemo(
		() => ({
			x: x + width / 2,
			y: y + height / 2,
		}),
		[x, y, width, height],
	);

	// 创建矩阵变换滤镜：先平移到中心点，然后缩放，再平移回来
	const matrixFilter = useMemo(() => {
		const matrix = Skia.Matrix();
		// 计算缩放后的偏移量，使中心点保持不变
		matrix.translate(center.x - center.x * zoom, center.y - center.y * zoom);
		matrix.scale(zoom, zoom);
		return Skia.ImageFilter.MakeMatrixTransform(matrix);
	}, [zoom, center.x, center.y]);

	// 创建裁剪路径
	const clipPath = useMemo(() => {
		const path = Skia.Path.Make();
		// 使用 size 参数或默认使用组件的宽高
		const clipWidth = width;
		const clipHeight = height;

		if (shape === "circle") {
			const radius = Math.min(clipWidth, clipHeight) / 2;
			path.addCircle(center.x, center.y, radius);
		} else {
			path.addRRect({
				rect: {
					x: center.x - clipWidth / 2,
					y: center.y - clipHeight / 2,
					width: clipWidth,
					height: clipHeight,
				},
				rx: cornerRadius,
				ry: cornerRadius,
			});
		}
		return path;
	}, [shape, center.x, center.y, width, height, cornerRadius]);

	return (
		<Group clip={clipPath}>
			<BackdropFilter filter={<ImageFilter filter={matrixFilter} />}>
				{/* 子元素会显示在放大后的背景之上 */}
			</BackdropFilter>
		</Group>
	);
};

BackdropZoom.displayName = "BackdropZoom";

export default BackdropZoom;
