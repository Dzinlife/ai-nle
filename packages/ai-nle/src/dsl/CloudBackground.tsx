import { useMemo } from "react";
import { Fill, Group, Rect, Shader, Skia } from "react-skia-lite";
import { useTimeline } from "@/components/TimelineContext";
import { parseStartEndSchema } from "./startEndSchema";
import { EditorComponent } from "./types";

// 云彩背景动画组件
const CloudBackground: EditorComponent<{
	speed?: number; // 动画速度，默认 1.0
	cloudDensity?: number; // 云朵密度，默认 1.0
	skyColor?: string; // 天空颜色，默认 "#87CEEB"
	cloudColor?: string; // 云朵颜色，默认 "#FFFFFF"
	__currentTime?: number; // 直接渲染时传入的时间
}> = ({
	start: startProp,
	end: _endProp,
	__renderLayout,
	speed = 1.0,
	cloudDensity = 1.0,
	skyColor = "#87CEEB",
	cloudColor = "#FFFFFF",
}) => {
	const { currentTime } = useTimeline();
	const { x, y, w: width, h: height, r: rotate = 0 } = __renderLayout;

	// 解析开始时间
	const start = parseStartEndSchema(startProp ?? 0);

	// 计算相对于动画开始的时间
	const relativeTime = Math.max(0, currentTime - start) * speed;

	// 解析颜色为 RGB
	const parseColor = (color: string) => {
		const hex = color.replace("#", "");
		const r = parseInt(hex.substring(0, 2), 16) / 255;
		const g = parseInt(hex.substring(2, 4), 16) / 255;
		const b = parseInt(hex.substring(4, 6), 16) / 255;
		return { r, g, b };
	};

	const sky = parseColor(skyColor);
	const cloud = parseColor(cloudColor);

	// Shader 代码 - 创建程序化云彩效果
	const shaderCode = `
uniform float iTime;
uniform vec2 iResolution;
uniform float cloudDensity;
uniform vec3 skyColor;
uniform vec3 cloudColor;

// 伪随机函数
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 噪声函数 - 使用分形布朗运动 (fBm)
float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 分形布朗运动 - 多层噪声叠加
float fbm(vec2 st) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 0.0;
  
  // 多层噪声叠加，创建更自然的云朵形状
  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(st);
    st *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// 云朵形状函数
float cloudShape(vec2 uv, vec2 offset, float scale, float speed) {
  vec2 cloudUV = (uv + offset) * scale + vec2(iTime * speed, iTime * speed * 0.3);
  float cloud = fbm(cloudUV);
  
  // 使用平滑步函数创建更清晰的云朵边缘
  cloud = smoothstep(0.3, 0.7, cloud);
  
  // 添加垂直渐变，使云朵底部更厚
  float verticalGradient = 1.0 - uv.y * 0.3;
  cloud *= verticalGradient;
  
  return cloud;
}

vec4 main(vec2 pos) {
  // 归一化坐标 (0.0 到 1.0)，pos 已经是相对于组件区域的坐标
  vec2 uv = pos / iResolution;
  
  // 创建多层云朵，不同大小、速度和位置
  float clouds = 0.0;
  
  // 第一层：大云朵，慢速移动
  float cloud1 = cloudShape(uv, vec2(0.0, 0.2), 0.8, 0.1);
  clouds = max(clouds, cloud1 * 0.8);
  
  // 第二层：中等云朵，中速移动
  float cloud2 = cloudShape(uv, vec2(0.3, 0.4), 1.2, 0.15);
  clouds = max(clouds, cloud2 * 0.7);
  
  // 第三层：小云朵，快速移动
  float cloud3 = cloudShape(uv, vec2(0.6, 0.1), 1.8, 0.2);
  clouds = max(clouds, cloud3 * 0.6);
  
  // 第四层：远景云朵，非常慢
  float cloud4 = cloudShape(uv, vec2(-0.2, 0.5), 0.5, 0.05);
  clouds = max(clouds, cloud4 * 0.5);
  
  // 第五层：细节云朵
  float cloud5 = cloudShape(uv, vec2(0.8, 0.3), 2.5, 0.25);
  clouds = max(clouds, cloud5 * 0.4);
  
  // 应用云朵密度
  clouds *= cloudDensity;
  clouds = clamp(clouds, 0.0, 1.0);
  
  // 混合天空色和云朵色
  vec3 color = mix(skyColor, cloudColor, clouds);
  
  // 添加一些大气散射效果（顶部更亮）
  float atmosphere = 1.0 - uv.y * 0.2;
  color *= atmosphere;
  
  // 添加轻微的色调变化，使云朵更有层次
  vec3 cloudTint = mix(cloudColor, vec3(0.95, 0.95, 1.0), 0.3);
  color = mix(color, cloudTint, clouds * 0.2);
  
  return vec4(color, 1.0);
}`;

	// 创建 shader source
	const shaderSource = useMemo(() => {
		try {
			return Skia.RuntimeEffect.Make(shaderCode);
		} catch (error) {
			console.error("Failed to create cloud shader:", error);
			return null;
		}
	}, []);

	// 创建裁剪路径
	const clipPath = useMemo(() => {
		const path = Skia.Path.Make();
		path.addRect({ x, y, width, height });
		return path;
	}, [x, y, width, height]);

	// 如果 shader 创建失败，返回简单的背景
	if (!shaderSource) {
		return (
			<Group>
				<Rect
					x={x}
					y={y}
					width={width}
					height={height}
					color={skyColor}
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

CloudBackground.displayName = "CloudBackground";

export default CloudBackground;
