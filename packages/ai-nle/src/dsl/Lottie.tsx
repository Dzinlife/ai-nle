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
import { useOffscreenRender } from "@/editor/OffscreenRenderContext";
import { useTimeline } from "@/editor/TimelineContext";
import { parseStartEndSchema } from "./startEndSchema";
import { EditorComponent } from "./types";

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
						const assetPromises: Promise<void>[] = [];
						zip.forEach((relativePath, file) => {
							if (!file.dir && relativePath.startsWith(imageDirName + "/")) {
								assetPromises.push(
									(async () => {
										const imageData = await file.async("uint8array");
										// 使用文件名（不含路径）作为 key
										const fileName =
											relativePath.split("/").pop() || relativePath;
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
						throw new Error(
							`Failed to load Lottie file: ${response.statusText}`,
						);
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

Lottie.displayName = "Lottie";
Lottie.timelineComponent = ({
	uri,
	start: startProp,
	end: endProp,
	speed = 1.0,
	loop = true,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animationRef = useRef<SkSkottieAnimation | null>(null);
	const isGeneratingRef = useRef(false);

	const start = parseStartEndSchema(startProp ?? 0);
	const end = parseStartEndSchema(endProp ?? Infinity);
	const componentDuration = end - start;

	// 生成预览图
	const generateThumbnails = useCallback(
		async (lottieUri: string) => {
			if (!canvasRef.current || !lottieUri || isGeneratingRef.current) {
				return;
			}

			isGeneratingRef.current = true;
			const canvas = canvasRef.current;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				isGeneratingRef.current = false;
				return;
			}

			try {
				// 清理之前的资源
				animationRef.current = null;

				// 加载 Lottie 动画
				const animation = await loadLottieAnimation(lottieUri);
				if (!animation) {
					throw new Error("Failed to load Lottie animation");
				}
				animationRef.current = animation;

				// 获取动画信息
				const animationSize = animation.size();
				const animationWidth = animationSize.width;
				const animationHeight = animationSize.height;
				const animationDuration = animation.duration();
				const animationFps = animation.fps();
				const totalFrames = animationDuration * animationFps;

				// 设置 canvas 尺寸
				const canvasWidth = canvas.offsetWidth;
				const canvasHeight = canvas.offsetHeight;
				canvas.width = canvasWidth;
				canvas.height = canvasHeight;

				// 根据 componentDuration 和 canvas 宽度，计算能放多少个预览图
				// 使用一个合理的预览图宽度估算（基于动画宽高比，但最终会裁切填满）
				const estimatedAspectRatio = animationWidth / animationHeight;
				const estimatedThumbnailWidth = canvasHeight * estimatedAspectRatio;
				const numThumbnails = Math.max(
					1,
					Math.ceil(canvasWidth / estimatedThumbnailWidth),
				);

				// 始终使用 componentDuration 来计算提取间隔
				const previewInterval = componentDuration / numThumbnails;

				// 计算每个预览图的实际宽度（填满整个 canvas 宽度）
				const thumbnailWidth = canvasWidth / numThumbnails;
				const thumbnailHeight = canvasHeight;

				// 清空 canvas（保持透明背景）
				ctx.clearRect(0, 0, canvasWidth, canvasHeight);

				// 创建离屏 Surface 用于渲染动画帧
				const surface = Skia.Surface.MakeOffscreen(
					animationWidth,
					animationHeight,
				);
				if (!surface) {
					throw new Error("Failed to create offscreen surface");
				}

				// 按间隔提取帧并绘制
				for (let i = 0; i < numThumbnails; i++) {
					const relativeTime = i * previewInterval; // 相对于组件 start 的时间

					// 计算动画中的帧数（考虑 speed 和 loop）
					let frame: number;
					if (loop) {
						// 循环播放：取模
						const frameTime =
							(relativeTime * animationFps * speed) % totalFrames;
						frame = Math.floor(frameTime);
					} else {
						// 不循环：限制在最后一帧
						const frameTime = relativeTime * animationFps * speed;
						frame = Math.min(Math.floor(frameTime), totalFrames - 1);
					}

					// 确保帧数在有效范围内
					frame = Math.max(0, Math.min(frame, totalFrames - 1));

					try {
						// 渲染动画帧到离屏 Surface
						const skiaCanvas = surface.getCanvas();
						skiaCanvas.clear(Float32Array.of(0, 0, 0, 0));
						animation.seekFrame(frame);
						animation.render(skiaCanvas);
						surface.flush();

						// 获取渲染后的图像
						const skImage = surface.makeImageSnapshot();
						if (!skImage) {
							continue;
						}

						// 读取像素数据
						const imageInfo = skImage.getImageInfo();
						const pixels = skImage.readPixels();
						if (!pixels) {
							continue;
						}

						// 创建 ImageData 并绘制到 canvas
						const imageData = new ImageData(
							new Uint8ClampedArray(pixels),
							imageInfo.width,
							imageInfo.height,
						);

						// 创建临时 canvas 来绘制图像
						const tempCanvas = document.createElement("canvas");
						tempCanvas.width = imageInfo.width;
						tempCanvas.height = imageInfo.height;
						const tempCtx = tempCanvas.getContext("2d");
						if (!tempCtx) {
							continue;
						}
						tempCtx.putImageData(imageData, 0, 0);

						// 计算绘制位置
						const x = i * thumbnailWidth;

						// 基于高度缩放，确保高度完全适应（不裁切上下）
						const scale = thumbnailHeight / tempCanvas.height;

						// 计算缩放后的宽度
						const scaledWidth = tempCanvas.width * scale;

						// 如果缩放后的宽度大于目标宽度，需要裁切左右
						if (scaledWidth > thumbnailWidth) {
							// 计算需要裁切的左右部分（居中裁切）
							const sourceWidth = thumbnailWidth / scale;
							const sourceX = (tempCanvas.width - sourceWidth) / 2;

							// 绘制帧到 canvas（只裁切左右，保持完整高度）
							ctx.drawImage(
								tempCanvas,
								sourceX,
								0, // 不裁切上下，从顶部开始
								sourceWidth,
								tempCanvas.height, // 完整高度
								x,
								0,
								thumbnailWidth,
								thumbnailHeight,
							);
						} else {
							// 如果缩放后的宽度小于等于目标宽度，居中显示
							const offsetX = (thumbnailWidth - scaledWidth) / 2;
							ctx.drawImage(
								tempCanvas,
								0,
								0,
								tempCanvas.width,
								tempCanvas.height,
								x + offsetX,
								0,
								scaledWidth,
								thumbnailHeight,
							);
						}
					} catch (err) {
						console.warn(`提取帧 ${frame} 失败:`, err);
					}
				}

				// 清理 Surface
				surface.dispose();
			} catch (err) {
				console.error("生成预览图失败:", err);
				// 绘制错误提示
				if (ctx) {
					ctx.fillStyle = "#fee2e2";
					ctx.fillRect(0, 0, canvas.width, canvas.height);
					ctx.fillStyle = "#dc2626";
					ctx.font = "12px sans-serif";
					ctx.textAlign = "center";
					ctx.fillText(
						"Lottie Thumbnails Generation Failed",
						canvas.width / 2,
						canvas.height / 2,
					);
				}
			} finally {
				isGeneratingRef.current = false;
			}
		},
		[start, end, componentDuration, speed, loop],
	);

	// 当 uri 变化时，生成预览图
	useEffect(() => {
		if (!uri) {
			return;
		}

		void generateThumbnails(uri);

		return () => {
			// 清理资源
			isGeneratingRef.current = false;
			animationRef.current = null;
		};
	}, [uri, generateThumbnails]);

	return (
		<div className="absolute inset-0 rounded-md overflow-hidden">
			<canvas ref={canvasRef} className="size-full" />
		</div>
	);
};

export default Lottie;
