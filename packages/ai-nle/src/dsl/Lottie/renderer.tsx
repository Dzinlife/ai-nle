import { useQuery } from "@tanstack/react-query";
import JSZip from "jszip";
import { useCallback, useEffect, useRef } from "react";
import {
	Group,
	Rect,
	type SkData,
	Skia,
	Skottie,
	type SkSkottieAnimation,
} from "react-skia-lite";
import { LottieIcon } from "@/components/icons";
import { useOffscreenRender } from "@/editor/OffscreenRenderContext";
import { useCurrentTime, useTimelineStore } from "@/editor/TimelineContext";
import type { ComponentProps } from "../types";

// 加载 Lottie 动画的辅助函数（用于 timelineComponent）
async function loadLottieAnimation(
	uri: string,
): Promise<SkSkottieAnimation | null> {
	// 检测是否是 dotLottie 格式（.lottie 文件扩展名）
	const isDotLottie = uri.toLowerCase().endsWith(".lottie");

	let json: string;
	let assets: Record<string, SkData> | undefined;

	if (isDotLottie) {
		// 处理 dotLottie 格式
		const response = await fetch(uri);
		if (!response.ok) {
			throw new Error(`Failed to load dotLottie file: ${response.statusText}`);
		}
		const arrayBuffer = await response.arrayBuffer();

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
			throw new Error(`Animation file not found for ID: ${activeAnimationId}`);
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
			const assetPromises: Promise<void>[] = [];
			zip.forEach((relativePath, file) => {
				if (!file.dir && relativePath.startsWith(imageDirName + "/")) {
					assetPromises.push(
						(async () => {
							const imageData = await file.async("uint8array");
							// 使用文件名（不含路径）作为 key
							const fileName = relativePath.split("/").pop() || relativePath;
							if (assets) {
								assets[fileName] = Skia.Data.fromBytes(imageData);
							}
						})(),
					);
				}
			});
			await Promise.all(assetPromises);
		}
	} else {
		// 处理普通 Lottie JSON 文件
		const response = await fetch(uri);
		if (!response.ok) {
			throw new Error(`Failed to load Lottie file: ${response.statusText}`);
		}
		json = await response.text();

		// 解析 JSON 以提取 assets 信息
		try {
			const lottieData = JSON.parse(json);
			if (lottieData.assets && Array.isArray(lottieData.assets)) {
				assets = {};
				const baseUrl = new URL(uri);
				const basePath = baseUrl.pathname.substring(
					0,
					baseUrl.pathname.lastIndexOf("/") + 1,
				);

				// 加载所有 assets
				const assetPromises: Promise<void>[] = [];
				for (const asset of lottieData.assets) {
					if (asset.p || asset.u) {
						// 获取资源路径
						const assetPath = asset.p || asset.u;
						if (!assetPath) continue;

						// 如果是相对路径，需要基于 JSON 文件的路径解析
						let assetUrl: string;
						if (
							assetPath.startsWith("http://") ||
							assetPath.startsWith("https://")
						) {
							// 绝对 URL
							assetUrl = assetPath;
						} else if (assetPath.startsWith("/")) {
							// 绝对路径，使用 origin
							assetUrl = `${baseUrl.origin}${assetPath}`;
						} else {
							// 相对路径，基于 JSON 文件的目录
							assetUrl = `${baseUrl.origin}${basePath}${assetPath}`;
						}

						// 使用文件名作为 key（与 dotLottie 格式保持一致）
						const fileName = assetPath.split("/").pop() || assetPath;

						assetPromises.push(
							(async () => {
								try {
									const assetResponse = await fetch(assetUrl);
									if (assetResponse.ok) {
										const arrayBuffer = await assetResponse.arrayBuffer();
										const uint8Array = new Uint8Array(arrayBuffer);
										if (assets) {
											assets[fileName] = Skia.Data.fromBytes(uint8Array);
										}
									}
								} catch (err) {
									console.warn(`Failed to load asset ${assetUrl}:`, err);
								}
							})(),
						);
					}
				}
				await Promise.all(assetPromises);
			}
		} catch (err) {
			// JSON 解析失败不影响主流程，只是无法加载 assets
			console.warn("Failed to parse Lottie JSON for assets:", err);
		}
	}

	// 使用 Skia 创建 Skottie 动画
	const skottieAnimation = Skia.Skottie.Make(json, assets);
	if (!skottieAnimation) {
		throw new Error("Failed to create Skottie animation");
	}

	return skottieAnimation;
}

interface LottieRendererProps extends ComponentProps {
	id: string;
	uri?: string;
	speed?: number;
	loop?: boolean;
}

const Lottie: React.FC<LottieRendererProps> = ({
	id,
	uri,
	speed = 1.0,
	loop = true,
	__renderLayout,
}) => {
	const { currentTime } = useCurrentTime();
	const { registerReadyCallback } = useOffscreenRender();

	// 直接从 TimelineStore 读取元素的 timeline 数据
	const timeline = useTimelineStore(
		(state) => state.elements.find((el) => el.id === id)?.timeline,
	);

	// 将中心坐标转换为左上角坐标
	const { cx, cy, w: width, h: height, rotation: rotate = 0 } = __renderLayout;
	const x = cx - width / 2;
	const y = cy - height / 2;

	const animationRef = useRef<SkSkottieAnimation | null | undefined>(null);
	const isReadyRef = useRef(false);
	const readyPromiseRef = useRef<Promise<void> | null>(null);
	const resolveReadyRef = useRef<(() => void) | null>(null);

	// 使用 useQuery 管理 Lottie 动画加载，避免重复加载和解析
	const {
		data: animation,
		isLoading,
		error: queryError,
	} = useQuery({
		queryKey: ["lottie-animation", uri],
		queryFn: () => {
			if (!uri) return null;
			return loadLottieAnimation(uri);
		},
		enabled: !!uri,
		staleTime: Infinity, // 动画资源不会过期，避免重复加载
		gcTime: Infinity, // 永远不清理缓存，避免重复解析
	});

	const error = queryError
		? queryError instanceof Error
			? queryError.message
			: "Unknown error"
		: null;

	// 保持 animationRef 与 animation 同步
	useEffect(() => {
		animationRef.current = animation;
	}, [animation]);

	// 处理 ready 状态和回调
	useEffect(() => {
		if (animation) {
			isReadyRef.current = true;
			// 如果已经有等待的 promise，resolve 它
			if (resolveReadyRef.current) {
				resolveReadyRef.current();
				resolveReadyRef.current = null;
			}
		} else {
			isReadyRef.current = false;
		}
	}, [animation]);

	// 注册 ready 回调
	useEffect(() => {
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
	}, [registerReadyCallback]);

	// 计算当前帧数
	const getCurrentFrame = useCallback(() => {
		if (!animation || !timeline) return 0;

		// 计算相对于组件开始时间的当前时间
		const start = timeline.start;
		const end = timeline.end;
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
	}, [animation, currentTime, timeline, speed, loop]);

	const currentFrame = animation ? getCurrentFrame() : 0;

	// 如果不在可见时间范围内，不渲染
	if (
		timeline &&
		(currentTime < timeline.start || currentTime > timeline.end)
	) {
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
					color={error ? "rgba(255, 0, 0, 0.3)" : "transparent"}
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

export default Lottie;
