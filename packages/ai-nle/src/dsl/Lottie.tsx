import JSZip from "jszip";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Group,
	Rect,
	type SkData,
	Skia,
	Skottie,
	type SkSkottieAnimation,
} from "react-skia-lite";
import { useOffscreenRender } from "@/components/OffscreenRenderContext";
import { useTimeline } from "@/components/TimelineContext";
import { parseStartEndSchema } from "./startEndSchema";
import { EditorComponent } from "./types";

const Lottie: EditorComponent<{
	uri?: string;
	speed?: number; // 播放速度倍数，默认 1.0
	loop?: boolean; // 是否循环播放，默认 true
}> = ({
	uri,
	speed = 1.0,
	loop = true,
	start: startProp,
	end: endProp,
	__renderLayout,
}) => {
	const { currentTime } = useTimeline();
	const { registerReadyCallback } = useOffscreenRender();

	const { x, y, w: width, h: height, r: rotate = 0 } = __renderLayout;

	// 解析 start 和 end 时间
	const start = parseStartEndSchema(startProp ?? 0);
	const end = parseStartEndSchema(endProp ?? Infinity);

	const [animation, setAnimation] = useState<SkSkottieAnimation | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const animationRef = useRef<SkSkottieAnimation | null>(null);
	const isReadyRef = useRef(false);
	const readyPromiseRef = useRef<Promise<void> | null>(null);
	const resolveReadyRef = useRef<(() => void) | null>(null);

	// 保持 animationRef 与 animation 同步
	useEffect(() => {
		animationRef.current = animation;
	}, [animation]);

	// 加载 Lottie 动画
	useEffect(() => {
		if (!uri) {
			setAnimation(null);
			setError(null);
			return;
		}

		let cancelled = false;
		setIsLoading(true);
		setError(null);

		const loadAnimation = async () => {
			try {
				// 检测是否是 dotLottie 格式（.lottie 文件扩展名）
				const isDotLottie = uri.toLowerCase().endsWith(".lottie");

				let json: string;
				let assets: Record<string, SkData> | undefined;

				if (isDotLottie) {
					// 处理 dotLottie 格式
					const response = await fetch(uri);
					if (!response.ok) {
						throw new Error(
							`Failed to load dotLottie file: ${response.statusText}`,
						);
					}
					const arrayBuffer = await response.arrayBuffer();

					if (cancelled) return;

					// 使用 JSZip 解压 dotLottie 文件
					const zip = await JSZip.loadAsync(arrayBuffer);

					// 读取 manifest.json
					const manifestFile = zip.file("manifest.json");
					if (!manifestFile) {
						throw new Error("dotLottie file missing manifest.json");
					}

					const manifestText = await manifestFile.async("string");
					const manifest = JSON.parse(manifestText);

					// 获取主动画 ID（从 manifest 中获取，如果没有则使用第一个动画）
					const activeAnimationId =
						manifest.activeAnimationId ||
						(manifest.animations && manifest.animations[0]?.id) ||
						null;

					if (!activeAnimationId) {
						throw new Error("No active animation found in dotLottie file");
					}

					// 查找动画文件（支持 v1.0 的 animations/ 和 v2.0 的 a/ 目录）
					let animationFile =
						zip.file(`animations/${activeAnimationId}.json`) ||
						zip.file(`a/${activeAnimationId}.json`) ||
						zip.file(`${activeAnimationId}.json`);

					// 如果找不到，尝试查找任何 JSON 文件
					if (!animationFile) {
						const jsonFiles = Object.keys(zip.files).filter(
							(name) =>
								name.endsWith(".json") &&
								(name.startsWith("animations/") ||
									name.startsWith("a/") ||
									!name.includes("/")),
						);
						if (jsonFiles.length > 0) {
							animationFile = zip.file(jsonFiles[0]);
						}
					}

					if (!animationFile) {
						throw new Error(
							`Animation file not found for ID: ${activeAnimationId}`,
						);
					}

					json = await animationFile.async("string");

					// 提取资源文件（支持 v1.0 的 images/ 和 v2.0 的 i/ 目录）
					const imageDirName = zip.folder("images")
						? "images"
						: zip.folder("i")
							? "i"
							: null;
					if (imageDirName) {
						assets = {};
						// 遍历所有文件，查找图片目录下的文件
						zip.forEach(async (relativePath, file) => {
							if (!file.dir && relativePath.startsWith(imageDirName + "/")) {
								const imageData = await file.async("uint8array");
								// 使用文件名（不含路径）作为 key
								const fileName = relativePath.split("/").pop() || relativePath;
								assets[fileName] = Skia.Data.fromBytes(imageData);
							}
						});
					}
				} else {
					// 处理普通 Lottie JSON 文件
					const response = await fetch(uri);
					if (!response.ok) {
						throw new Error(
							`Failed to load Lottie file: ${response.statusText}`,
						);
					}
					json = await response.text();
				}

				if (cancelled) return;

				// 使用 Skia 创建 Skottie 动画
				const skottieAnimation = Skia.Skottie.Make(json, assets);
				if (!skottieAnimation) {
					throw new Error("Failed to create Skottie animation");
				}

				if (cancelled) return;

				setAnimation(skottieAnimation);
				isReadyRef.current = true;
				setIsLoading(false);

				// 如果已经有等待的 promise，resolve 它
				if (resolveReadyRef.current) {
					resolveReadyRef.current();
					resolveReadyRef.current = null;
				}

				// 注册 ready 回调
				if (registerReadyCallback) {
					registerReadyCallback(async () => {
						if (isReadyRef.current) {
							return;
						}
						// 如果还没有 ready promise，创建一个
						if (!readyPromiseRef.current) {
							readyPromiseRef.current = new Promise<void>((resolve) => {
								resolveReadyRef.current = resolve;
							});
						}
						await readyPromiseRef.current;
					});
				}
			} catch (err) {
				if (cancelled) return;
				console.error("加载 Lottie 动画失败:", err);
				setError(err instanceof Error ? err.message : "Unknown error");
				setIsLoading(false);
				isReadyRef.current = false;
			}
		};

		loadAnimation();

		return () => {
			cancelled = true;
			// 清理动画资源
			if (animationRef.current) {
				animationRef.current = null;
			}
			// 清理 ready promise
			readyPromiseRef.current = null;
			resolveReadyRef.current = null;
		};
	}, [uri, registerReadyCallback]);

	// 计算当前帧数
	const getCurrentFrame = useCallback(() => {
		if (!animation) return 0;

		// 计算相对于组件开始时间的当前时间
		const relativeTime = Math.max(0, currentTime - start);
		const componentDuration = end - start;
		const totalFrames = animation.duration() * animation.fps();

		// 如果超出结束时间，根据是否循环决定
		if (relativeTime > componentDuration) {
			if (loop) {
				// 循环播放：取模
				const loopedTime = relativeTime % componentDuration;
				const frame = (loopedTime * animation.fps() * speed) % totalFrames;
				return Math.floor(frame);
			} else {
				// 不循环：停留在最后一帧
				return Math.floor(totalFrames - 1);
			}
		}

		// 正常播放：根据时间和速度计算帧数
		const frame = relativeTime * animation.fps() * speed;
		// 确保帧数在有效范围内
		if (loop) {
			return Math.floor(frame % totalFrames);
		} else {
			return Math.min(Math.floor(frame), totalFrames - 1);
		}
	}, [animation, currentTime, start, end, speed, loop]);

	const currentFrame = animation ? getCurrentFrame() : 0;

	// 如果不在可见时间范围内，不渲染
	if (currentTime < start || currentTime > end) {
		return null;
	}

	// 如果正在加载或出错，显示占位符
	if (isLoading || error || !animation) {
		return (
			<Group>
				<Rect
					x={x}
					y={y}
					width={width}
					height={height}
					transform={[{ rotate: rotate ?? 0 }]}
					origin={{ x, y }}
					color={error ? "rgba(255, 0, 0, 0.3)" : "rgba(128, 128, 128, 0.2)"}
				/>
			</Group>
		);
	}

	// 获取动画的原始尺寸
	const animationSize = animation.size();
	const animationWidth = animationSize.width;
	const animationHeight = animationSize.height;

	// 计算缩放比例以适应目标尺寸
	const scaleX = width / animationWidth;
	const scaleY = height / animationHeight;
	const scale = Math.min(scaleX, scaleY); // 保持宽高比

	// 计算居中偏移
	const scaledWidth = animationWidth * scale;
	const scaledHeight = animationHeight * scale;
	const offsetX = (width - scaledWidth) / 2;
	const offsetY = (height - scaledHeight) / 2;

	return (
		<Group>
			<Rect
				x={x}
				y={y}
				width={width}
				height={height}
				transform={[{ rotate: rotate ?? 0 }]}
				color="transparent"
				origin={{ x, y }}
			>
				<Group
					transform={[
						{ translateX: x + offsetX },
						{ translateY: y + offsetY },
						{ scale },
					]}
				>
					<Skottie animation={animation} frame={currentFrame} />
				</Group>
			</Rect>
		</Group>
	);
};

Lottie.displayName = "Lottie";
Lottie.timelineComponent = ({ uri }) => {
	return (
		<div
			className="rounded h-full bg-contain bg-center bg-no-repeat"
			style={{
				backgroundImage: `url(${uri})`,
				backgroundColor: "rgba(128, 128, 128, 0.1)",
			}}
		>
			<div className="flex items-center justify-center h-full text-xs text-gray-400">
				Lottie
			</div>
		</div>
	);
};

export default Lottie;
