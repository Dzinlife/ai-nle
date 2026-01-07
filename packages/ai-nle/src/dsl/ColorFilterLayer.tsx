import { useMemo } from "react";
import { BackdropFilter, Group, ImageFilter, Skia } from "react-skia-lite";
import { createColorAdjustMatrix } from "./ColorAdjust";
import { EditorComponent } from "./types";

const ColorFilterLayer: EditorComponent<{
	hue?: number; // 色调调整，范围通常为 -180 到 180
	saturation?: number; // 饱和度调整，范围通常为 -1 到 1
	brightness?: number; // 亮度调整，范围通常为 -1 到 1
	contrast?: number; // 对比度调整，范围通常为 -1 到 1
	shape?: "circle" | "rect";
	cornerRadius?: number;
}> = ({
	hue = 0,
	saturation = 0,
	brightness = 0,
	contrast = 0,
	__renderLayout,
	shape = "rect",
	cornerRadius = 0,
}) => {
	const { x, y, w: width, h: height } = __renderLayout;

	// 计算颜色矩阵
	const colorMatrix = useMemo(
		() => createColorAdjustMatrix(hue, saturation, brightness, contrast),
		[hue, saturation, brightness, contrast],
	);

	// 创建 ColorFilter
	const colorFilter = useMemo(() => {
		return Skia.ColorFilter.MakeMatrix(colorMatrix);
	}, [colorMatrix]);

	// 将 ColorFilter 转换为 ImageFilter（BackdropFilter 需要 ImageFilter）
	const imageFilter = useMemo(() => {
		return Skia.ImageFilter.MakeColorFilter(colorFilter, null);
	}, [colorFilter]);

	// 创建裁剪路径
	const clipPath = useMemo(() => {
		const path = Skia.Path.Make();
		if (shape === "circle") {
			const radius = Math.min(width, height) / 2;
			path.addCircle(x + width / 2, y + height / 2, radius);
		} else {
			path.addRRect({
				rect: {
					x,
					y,
					width,
					height,
				},
				rx: cornerRadius,
				ry: cornerRadius,
			});
		}
		return path;
	}, [shape, x, y, width, height, cornerRadius]);

	// 检查是否有调色配置
	const hasColorAdjust =
		hue !== 0 || saturation !== 0 || brightness !== 0 || contrast !== 0;

	if (!hasColorAdjust) {
		// 如果没有调色配置，返回空的 Group
		return <Group />;
	}

	return (
		<Group clip={clipPath}>
			<BackdropFilter filter={<ImageFilter filter={imageFilter} />}>
				{/* BackdropFilter 会影响它下面的所有内容 */}
			</BackdropFilter>
		</Group>
	);
};

ColorFilterLayer.displayName = "ColorFilterLayer";
ColorFilterLayer.timelineComponent = ({
	name,
	hue = 0,
	saturation = 0,
	brightness = 0,
	contrast = 0,
}) => {
	return (
		<div className="absolute inset-0 rounded-md overflow-hidden bg-linear-to-b from-purple-800 to-purple-700 border border-purple-700 p-1">
			<div className="flex gap-1 items-center">
				<span className="text-xs">🎨</span>
				<span>{name || "ColorFilterLayer"}</span>
				{(hue !== 0 ||
					saturation !== 0 ||
					brightness !== 0 ||
					contrast !== 0) && (
					<span className="text-xs opacity-70">
						{hue !== 0 && `H:${hue.toFixed(0)}`}
						{saturation !== 0 && ` S:${(saturation * 100).toFixed(0)}%`}
						{brightness !== 0 && ` B:${(brightness * 100).toFixed(0)}%`}
						{contrast !== 0 && ` C:${(contrast * 100).toFixed(0)}%`}
					</span>
				)}
			</div>
		</div>
	);
};

export default ColorFilterLayer;
