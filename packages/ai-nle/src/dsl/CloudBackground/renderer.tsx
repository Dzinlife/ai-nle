import { useMemo } from "react";
import { Fill, Group, Rect, Shader, Skia } from "react-skia-lite";
import { useCurrentTime, useTimelineStore } from "@/editor/TimelineContext";
import { useModelSelector } from "../model/registry";
import { parseStartEndSchema } from "../startEndSchema";
import type { ComponentProps } from "../types";
import type {
	CloudBackgroundInternal,
	CloudBackgroundModelStore,
	CloudBackgroundProps,
} from "./model";

interface CloudBackgroundRendererProps extends ComponentProps {
	id: string;
	store: CloudBackgroundModelStore;
}

const CloudBackgroundRenderer: React.FC<CloudBackgroundRendererProps> = ({
	id,
	__renderLayout,
}) => {
	const { currentTime } = useCurrentTime();

	// 直接从 TimelineStore 读取元素的 timeline 数据
	const timeline = useTimelineStore(
		(state) => state.elements.find((el) => el.id === id)?.timeline,
	);

	const { cx, cy, w: width, h: height, rotation: rotate = 0 } = __renderLayout;
	const x = cx - width / 2;
	const y = cy - height / 2;

	// 订阅状态
	const props = useModelSelector<CloudBackgroundProps, CloudBackgroundProps>(
		id,
		(state) => state.props,
	);
	const shaderSource = useModelSelector<
		CloudBackgroundProps,
		CloudBackgroundInternal["shaderSource"]
	>(
		id,
		(state) =>
			(state.internal as unknown as CloudBackgroundInternal).shaderSource,
	);
	const hasError = useModelSelector<CloudBackgroundProps, boolean>(
		id,
		(state) => state.constraints.hasError ?? false,
	);

	const {
		speed = 1.0,
		cloudDensity = 1.0,
		skyColor = "#87CEEB",
		cloudColor = "#FFFFFF",
	} = props;

	// 解析开始时间（从 __timeline 获取）
	const start = parseStartEndSchema(timeline?.start ?? 0);
	const relativeTime = Math.max(0, currentTime - start) * speed;

	// 解析颜色
	const parseColor = (color: string) => {
		const hex = color.replace("#", "");
		const r = parseInt(hex.substring(0, 2), 16) / 255;
		const g = parseInt(hex.substring(2, 4), 16) / 255;
		const b = parseInt(hex.substring(4, 6), 16) / 255;
		return { r, g, b };
	};

	const sky = parseColor(skyColor);
	const cloud = parseColor(cloudColor);

	// 创建裁剪路径
	const clipPath = useMemo(() => {
		const path = Skia.Path.Make();
		path.addRect({ x, y, width, height });
		return path;
	}, [x, y, width, height]);

	// Error 状态或 shader 未加载
	if (hasError || !shaderSource) {
		return (
			<Group>
				<Rect
					x={x}
					y={y}
					width={width}
					height={height}
					color={hasError ? "#fee2e2" : skyColor}
					transform={[{ rotate }]}
				/>
			</Group>
		);
	}

	return (
		<Group clip={clipPath} transform={[{ rotate }]} origin={{ x, y }}>
			<Fill>
				<Shader
					source={shaderSource}
					uniforms={{
						iTime: relativeTime,
						iResolution: [width, height],
						cloudDensity,
						skyColor: [sky.r, sky.g, sky.b],
						cloudColor: [cloud.r, cloud.g, cloud.b],
					}}
				/>
			</Fill>
		</Group>
	);
};

export default CloudBackgroundRenderer;
