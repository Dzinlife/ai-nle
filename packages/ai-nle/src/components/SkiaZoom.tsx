import { useState } from "react";
import {
	Canvas,
	Circle,
	Fill,
	Group,
	Image,
	Mask,
	rect,
	useImage,
} from "react-skia-lite";

interface SkiaZoomProps {
	imageUrl?: string;
	width?: number;
	height?: number;
	magnification?: number;
	radius?: number;
}

export default function SkiaZoom({
	imageUrl = "/photo.jpeg",
	width = 800,
	height = 600,
	magnification = 2,
	radius = 100,
}: SkiaZoomProps) {
	const image = useImage(imageUrl);
	const [mousePos, setMousePos] = useState({ x: width / 2, y: height / 2 });

	// 计算圆形区域的中心位置（跟随鼠标或居中）
	const centerX = mousePos.x;
	const centerY = mousePos.y;

	// 计算放大后的图片位置
	// 放大镜显示的是以鼠标位置为中心的区域，放大 magnification 倍
	const zoomScale = magnification;
	const zoomOffsetX = centerX - centerX * zoomScale;
	const zoomOffsetY = centerY - centerY * zoomScale;

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const y = e.clientY - rect.top;
		setMousePos({ x, y });
	};

	return (
		<div className="canvas-container">
			<h2>Skia 放大镜效果</h2>
			<p style={{ marginBottom: "10px", color: "#666" }}>
				移动鼠标查看放大效果
			</p>
			<div
				onMouseMove={handleMouseMove}
				style={{
					display: "inline-block",
					cursor: "crosshair",
					border: "1px solid #ddd",
					borderRadius: "8px",
					overflow: "hidden",
				}}
			>
				<Canvas style={{ width, height }}>
					<Group>
						{/* 背景图片 */}
						{image && (
							<Image
								image={image}
								rect={rect(0, 0, width, height)}
								fit="cover"
							/>
						)}

						{/* 放大镜效果：使用圆形遮罩 */}
						{image && (
							<Mask
								mask={
									<Circle cx={centerX} cy={centerY} r={radius} color="white" />
								}
							>
								<Group
									transform={[
										{ translate: [zoomOffsetX, zoomOffsetY] },
										{ scale: zoomScale },
									]}
								>
									<Image
										image={image}
										rect={rect(0, 0, width, height)}
										fit="cover"
									/>
								</Group>
							</Mask>
						)}

						{/* 放大镜边框 */}
						<Circle
							cx={centerX}
							cy={centerY}
							r={radius}
							color="rgba(255, 255, 255, 0.8)"
							style="stroke"
							strokeWidth={3}
						/>
						<Circle
							cx={centerX}
							cy={centerY}
							r={radius - 2}
							color="rgba(0, 0, 0, 0.3)"
							style="stroke"
							strokeWidth={1}
						/>
					</Group>
				</Canvas>
			</div>
		</div>
	);
}
