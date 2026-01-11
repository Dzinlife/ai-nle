import { useMemo } from "react";
import {
	BackdropFilter,
	Blur,
	BlurMask,
	Fill,
	Group,
	ImageFilter,
	Mask,
	Paint,
	Path,
	Skia,
} from "react-skia-lite";
import { EditorComponent } from "./types";

// 生成颜色调整矩阵
const createColorAdjustMatrix = (
	hue: number = 0,
	saturation: number = 0,
	brightness: number = 0,
	contrast: number = 0,
): number[] => {
	// 初始化为单位矩阵
	let matrix: number[] = [
		1,
		0,
		0,
		0,
		0, // R
		0,
		1,
		0,
		0,
		0, // G
		0,
		0,
		1,
		0,
		0, // B
		0,
		0,
		0,
		1,
		0, // A
	];

	// 矩阵乘法：a * b
	const multiplyMatrix = (a: number[], b: number[]): number[] => {
		const result: number[] = [];
		for (let i = 0; i < 4; i++) {
			for (let j = 0; j < 5; j++) {
				let sum = 0;
				for (let k = 0; k < 4; k++) {
					sum += a[i * 5 + k] * b[k * 5 + j];
				}
				// 添加平移项
				if (j === 4) {
					sum += a[i * 5 + 4];
				}
				result[i * 5 + j] = sum;
			}
		}
		return result;
	};

	// 应用对比度 (在亮度之前应用)
	if (Math.abs(contrast) > 0.001) {
		const c = 1 + contrast;
		const t = (1 - c) / 2;
		const contrastMatrix = [
			c,
			0,
			0,
			0,
			t,
			0,
			c,
			0,
			0,
			t,
			0,
			0,
			c,
			0,
			t,
			0,
			0,
			0,
			1,
			0,
		];
		matrix = multiplyMatrix(matrix, contrastMatrix);
	}

	// 应用亮度
	if (Math.abs(brightness) > 0.001) {
		const brightnessMatrix = [
			1,
			0,
			0,
			0,
			brightness,
			0,
			1,
			0,
			0,
			brightness,
			0,
			0,
			1,
			0,
			brightness,
			0,
			0,
			0,
			1,
			0,
		];
		matrix = multiplyMatrix(matrix, brightnessMatrix);
	}

	// 应用饱和度
	if (Math.abs(saturation) > 0.001) {
		const s = 1 + saturation;
		// RGB to Luminance weights (ITU-R BT.709)
		const rw = 0.2126;
		const gw = 0.7152;
		const bw = 0.0722;
		const saturationMatrix = [
			rw * (1 - s) + s,
			gw * (1 - s),
			bw * (1 - s),
			0,
			0,
			rw * (1 - s),
			gw * (1 - s) + s,
			bw * (1 - s),
			0,
			0,
			rw * (1 - s),
			gw * (1 - s),
			bw * (1 - s) + s,
			0,
			0,
			0,
			0,
			0,
			1,
			0,
		];
		matrix = multiplyMatrix(matrix, saturationMatrix);
	}

	// 应用色调旋转
	if (Math.abs(hue) > 0.001) {
		const hueRad = (hue * Math.PI) / 180;
		const cosHue = Math.cos(hueRad);
		const sinHue = Math.sin(hueRad);
		// 色调旋转矩阵（在 RGB 空间中，基于 Luminance 保持）
		const rw = 0.2126;
		const gw = 0.7152;
		const bw = 0.0722;
		const hueMatrix = [
			rw + cosHue * (1 - rw) + sinHue * -rw,
			gw + cosHue * -gw + sinHue * -gw,
			bw + cosHue * -bw + sinHue * (1 - bw),
			0,
			0,
			rw + cosHue * -rw + sinHue * 0.143,
			gw + cosHue * (1 - gw) + sinHue * 0.14,
			bw + cosHue * -bw + sinHue * -0.283,
			0,
			0,
			rw + cosHue * -rw + sinHue * -(1 - rw),
			gw + cosHue * -gw + sinHue * gw,
			bw + cosHue * (1 - bw) + sinHue * bw,
			0,
			0,
			0,
			0,
			0,
			1,
			0,
		];
		matrix = multiplyMatrix(matrix, hueMatrix);
	}

	return matrix;
};

const ColorFilterLayer: EditorComponent<{
	hue?: number; // 色调调整，范围通常为 -180 到 180
	saturation?: number; // 饱和度调整，范围通常为 -1 到 1
	brightness?: number; // 亮度调整，范围通常为 -1 到 1
	contrast?: number; // 对比度调整，范围通常为 -1 到 1
	shape?: "circle" | "rect";
	cornerRadius?: number;
	feather?: number; // 羽化半径，单位：像素
}> = ({
	hue = 0,
	saturation = 0,
	brightness = 0,
	contrast = 0,
	__renderLayout,
	shape = "rect",
	cornerRadius = 0,
	feather = 0,
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

	// 如果没有羽化，直接使用 clip 裁剪
	if (feather <= 0) {
		return (
			<BackdropFilter
				filter={<ImageFilter filter={imageFilter} />}
				clip={clipPath}
			/>
		);
	}

	// BackdropFilter 在外层直接执行（读取原始画布）
	// 然后用 dstIn 混合绘制羽化 mask，直接作用于画布
	return (
		<BackdropFilter filter={<ImageFilter filter={imageFilter} />}>
			<Group
				layer={
					<Paint blendMode="dstIn">
						<Blur blur={feather} />
					</Paint>
				}
			>
				<Path path={clipPath} />
			</Group>
		</BackdropFilter>
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
