import {
	ALL_FORMATS,
	CanvasSink,
	Input,
	UrlSource,
	WrappedCanvas,
} from "mediabunny";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, ImageShader, Rect, type SkImage, Skia } from "react-skia-lite";
import { useOffscreenRender } from "@/editor/OffscreenRenderContext";
import { useTimeline } from "@/editor/TimelineContext";
import { parseStartEndSchema } from "./startEndSchema";
import { EditorComponent } from "./types";

// 计算实际要 seek 的视频时间（考虑倒放）
const calculateVideoTime = ({
	start,
	timelineTime,
	videoDuration,
	reversed,
}: {
	start: number;
	timelineTime: number;
	videoDuration: number;
	reversed?: boolean;
}): number => {
	// 计算在 clip 中的相对时间
	const relativeTime = timelineTime - start;

	if (reversed) {
		// 倒放：从视频末尾开始倒推
		// 视频时间 = videoDuration - relativeTime

		return Math.max(0, videoDuration - relativeTime);
	} else {
		// 正放：从 start 开始
		// 视频时间 = start + relativeTime
		return relativeTime;
	}
};

const Clip: EditorComponent<{
	uri?: string;
	reversed?: boolean;
	__currentTime?: number; // 直接渲染时传入的时间
}> = ({
	uri,
	reversed,
	start: startProp,
	end: _endProp, // 保留以备将来使用，倒放时不再需要
	__renderLayout,
	// __currentTime: currentTime = 0,
}) => {
	const { currentTime } = useTimeline();
	const { isOffscreen, registerReadyCallback } = useOffscreenRender();

	const { x, y, w: width, h: height, r: rotate = 0 } = __renderLayout;

	// 解析 start 时间
	const start = parseStartEndSchema(startProp ?? 0);
	// end 在倒放计算中不再需要，因为倒放从视频末尾开始

	const [currentFrameImage, setCurrentFrameImage] = useState<SkImage | null>(
		null,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const videoSinkRef = useRef<CanvasSink | null>(null);
	const inputRef = useRef<Input | null>(null);
	const videoFrameIteratorRef = useRef<AsyncGenerator<
		WrappedCanvas,
		void,
		unknown
	> | null>(null);
	const asyncIdRef = useRef(0);
	const isSeekingRef = useRef(false);
	const lastSeekTimeRef = useRef<number | null>(null);
	const animationFrameRef = useRef<number | null>(null);
	const currentTimeRef = useRef(currentTime);
	const isReadyRef = useRef(false);
	const videoDurationRef = useRef(0);
	const reversedRef = useRef(reversed ?? false);

	// 强引用：保持最近几帧图像和对应的 ImageBitmap 不被 GC 回收
	// 这样可以确保在 Skia 绘制时图像仍然有效
	const imagePoolRef = useRef<{ image: SkImage; bitmap: ImageBitmap }[]>([]);
	const MAX_POOL_SIZE = 3; // 保留最近 3 帧

	useEffect(() => {
		currentTimeRef.current = currentTime;
		reversedRef.current = reversed ?? false;
	}, [currentTime, reversed]);

	// 更新当前帧（复制 canvas 内容避免 mediabunny 复用导致的问题）
	const updateFrame = useCallback(
		async (canvas: HTMLCanvasElement | OffscreenCanvas) => {
			try {
				// 使用 createImageBitmap 来复制 canvas 内容
				// 这样即使 mediabunny 复用原 canvas，我们的数据也是安全的
				const imageBitmap = await createImageBitmap(canvas);
				const skiaImage = Skia.Image.MakeImageFromNativeBuffer(imageBitmap);

				// if (skiaImage) {
				// 	// 将新图像和对应的 ImageBitmap 加入池中
				// 	imagePoolRef.current.push({ image: skiaImage, bitmap: imageBitmap });

				// 	// 如果超出池大小，移除旧的并关闭 ImageBitmap
				// 	while (imagePoolRef.current.length > MAX_POOL_SIZE) {
				// 		const removed = imagePoolRef.current.shift();
				// 		if (removed) {
				// 			// 关闭 ImageBitmap 释放资源
				// 			removed.bitmap.close();
				// 		}
				// 	}
				setCurrentFrameImage(skiaImage);
				isReadyRef.current = true;
				// } else {
				// 	// 如果创建 SkImage 失败，关闭 ImageBitmap
				// 	imageBitmap.close();
				// }
			} catch (err) {
				console.error("更新帧失败:", err);
			}
		},
		[],
	);

	// 待处理的 seek 时间（当 isSeekingRef 为 true 时记录）
	const pendingSeekTimeRef = useRef<number | null>(null);

	// 跳转到指定时间并显示帧
	const seekToTime = useCallback(
		async (seconds: number) => {
			if (!videoSinkRef.current) {
				return;
			}

			// 如果正在 seeking，记录待处理的时间
			if (isSeekingRef.current) {
				pendingSeekTimeRef.current = seconds;
				return;
			}

			// 如果时间没有变化，跳过
			if (lastSeekTimeRef.current === seconds) {
				return;
			}

			isSeekingRef.current = true;
			asyncIdRef.current++;
			const currentAsyncId = asyncIdRef.current;

			let iterator: AsyncGenerator<WrappedCanvas, void, unknown> | null = null;

			try {
				// 清理旧的迭代器
				const oldIterator = videoFrameIteratorRef.current;
				videoFrameIteratorRef.current = null;
				await oldIterator?.return();

				// 检查是否已被新的操作替换
				if (currentAsyncId !== asyncIdRef.current || !videoSinkRef.current) {
					return;
				}

				// 创建新的迭代器，从指定时间开始
				iterator = videoSinkRef.current.canvases(seconds);
				videoFrameIteratorRef.current = iterator;

				if (!iterator) {
					return;
				}

				// 获取第一帧（最接近指定时间的帧）
				const firstFrame = (await iterator.next()).value ?? null;

				// 再次检查是否已被替换
				if (currentAsyncId !== asyncIdRef.current) {
					return;
				}

				if (firstFrame) {
					const canvas = firstFrame.canvas;
					if (
						canvas instanceof HTMLCanvasElement ||
						canvas instanceof OffscreenCanvas
					) {
						await updateFrame(canvas);
						lastSeekTimeRef.current = seconds;
					}
				}

				// 关闭迭代器释放资源
				await iterator.return();
				if (videoFrameIteratorRef.current === iterator) {
					videoFrameIteratorRef.current = null;
				}
			} catch (err) {
				console.warn("跳转到指定时间失败:", err);
				// 出错时也要关闭迭代器
				await iterator?.return();
			} finally {
				isSeekingRef.current = false;

				// 处理待处理的 seek
				// const pendingTime = pendingSeekTimeRef.current;
				// if (pendingTime !== null) {
				// 	pendingSeekTimeRef.current = null;
				// 	// 使用 setTimeout 避免递归调用栈溢出
				// 	setTimeout(() => {
				// 		void seekToTime(pendingTime);
				// 	}, 0);
				// }
			}
		},
		[updateFrame],
	);

	// 初始化媒体播放器
	const initMediaPlayer = useCallback(
		async (resource: string) => {
			asyncIdRef.current++;
			const currentInitId = asyncIdRef.current;

			try {
				setIsLoading(true);
				setError(null);

				// 清理之前的资源
				if (animationFrameRef.current !== null) {
					cancelAnimationFrame(animationFrameRef.current);
					animationFrameRef.current = null;
				}

				// 检查是否已被新的初始化替换
				if (currentInitId !== asyncIdRef.current) {
					setIsLoading(false);
					return;
				}

				// 清理旧的视频 Sink
				videoSinkRef.current = null;
				inputRef.current = null;

				// 清理旧的视频帧迭代器
				try {
					await videoFrameIteratorRef.current?.return();
				} catch (err) {
					console.warn("清理视频帧迭代器时出错:", err);
				}
				videoFrameIteratorRef.current = null;
				lastSeekTimeRef.current = null;

				// 检查是否已被新的初始化替换
				if (currentInitId !== asyncIdRef.current) {
					setIsLoading(false);
					return;
				}

				// 重置状态
				setCurrentFrameImage(null);

				// 创建 Input
				const source = new UrlSource(resource);
				const input = new Input({
					source,
					formats: ALL_FORMATS,
				});
				inputRef.current = input;

				// 获取视频总时长
				const duration = await input.computeDuration();
				videoDurationRef.current = duration;

				// 获取视频轨道
				let videoTrack = await input.getPrimaryVideoTrack();

				let problemMessage = "";

				if (videoTrack) {
					if (videoTrack.codec === null) {
						problemMessage += "不支持的视频编解码器。";
						videoTrack = null;
					} else if (!(await videoTrack.canDecode())) {
						problemMessage += "无法解码视频轨道。";
						videoTrack = null;
					}
				}

				if (!videoTrack) {
					throw new Error(problemMessage || "未找到视频轨道。");
				}

				if (problemMessage) {
					console.warn(problemMessage);
				}

				// 创建视频 Sink
				if (videoTrack) {
					const videoCanBeTransparent = await videoTrack.canBeTransparent();
					videoSinkRef.current = new CanvasSink(videoTrack, {
						poolSize: 2,
						fit: "contain",
						alpha: videoCanBeTransparent,
					});
				}

				// 检查是否已被新的初始化替换
				if (currentInitId !== asyncIdRef.current) {
					setIsLoading(false);
					return;
				}

				setIsLoading(false);

				// 如果没有视频轨道，确保至少显示一个错误提示
				if (!videoSinkRef.current) {
					console.warn("没有可用的视频轨道");
				}

				// 初始化后，根据当前时间显示帧（使用最新的 currentTime）
				if (videoSinkRef.current) {
					// 计算实际要 seek 的视频时间（考虑倒放）
					const videoTime = calculateVideoTime({
						start,
						timelineTime: currentTimeRef.current,
						videoDuration: videoDurationRef.current,
						reversed: reversedRef.current,
					});
					await seekToTime(videoTime);
					// seekToTime 会调用 updateFrame，updateFrame 会设置 isReadyRef.current = true
					// 如果是离屏渲染，额外等待一下确保帧已准备好
					if (isOffscreen && !isReadyRef.current) {
						// 等待 currentFrameImage 不为 null
						let attempts = 0;
						const maxAttempts = 100; // 最多等待 2 秒（20ms * 100）
						while (!isReadyRef.current && attempts < maxAttempts) {
							await new Promise((resolve) => setTimeout(resolve, 20));
							attempts++;
						}
					}
				}
			} catch (err) {
				// 只有在当前初始化仍然有效时才设置错误
				if (currentInitId === asyncIdRef.current) {
					console.error("初始化媒体播放器失败:", err);
					setError(err instanceof Error ? err.message : "未知错误");
					setIsLoading(false);
				}
			}
		},
		[seekToTime],
	);

	// 注册 ready 回调（用于离屏渲染）
	useEffect(() => {
		if (isOffscreen && registerReadyCallback) {
			const readyCallback = async () => {
				if (!uri) {
					return;
				}
				// 如果视频还没有加载，等待加载完成
				if (!videoSinkRef.current || isLoading) {
					let attempts = 0;
					const maxAttempts = 150; // 最多等待 3 秒（20ms * 150）
					while (
						(!videoSinkRef.current || isLoading) &&
						attempts < maxAttempts
					) {
						await new Promise((resolve) => setTimeout(resolve, 20));
						attempts++;
					}
				}
				// 如果视频帧还没有准备好，等待
				if (!isReadyRef.current && videoSinkRef.current) {
					let attempts = 0;
					const maxAttempts = 100; // 最多等待 2 秒（20ms * 100）
					while (!isReadyRef.current && attempts < maxAttempts) {
						await new Promise((resolve) => requestAnimationFrame(resolve));
						attempts++;
					}
				}
			};
			registerReadyCallback(readyCallback);
		}
	}, [isOffscreen, registerReadyCallback, uri, isLoading]);

	// 当 uri 变化时，加载视频
	useEffect(() => {
		if (!uri) {
			isReadyRef.current = false;
			return;
		}

		let isCancelled = false;
		isReadyRef.current = false;

		const loadVideo = async () => {
			await initMediaPlayer(uri);
			if (isCancelled) {
				return;
			}
		};

		void loadVideo();

		return () => {
			isCancelled = true;
			isReadyRef.current = false;
			setIsLoading(false);
			void videoFrameIteratorRef.current?.return();
			videoSinkRef.current = null;
			inputRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [uri]);

	// 当 currentTime 变化时，更新显示的帧
	useEffect(() => {
		if (
			!videoSinkRef.current ||
			!uri ||
			currentTime == null ||
			currentTime < 0
		) {
			return;
		}

		// 计算实际要 seek 的视频时间
		const videoTime = calculateVideoTime({
			start,
			timelineTime: currentTime,
			videoDuration: videoDurationRef.current,
			reversed,
		});

		// 如果时间变化超过 0.1 秒，才更新帧（避免频繁 seek）
		if (
			lastSeekTimeRef.current !== null &&
			Math.abs(lastSeekTimeRef.current - videoTime) < 0.1
		) {
			return;
		}

		// 使用 requestAnimationFrame 来节流更新
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
		}

		animationFrameRef.current = requestAnimationFrame(() => {
			animationFrameRef.current = null;
			void seekToTime(videoTime);
		});

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [currentTime, uri, seekToTime, calculateVideoTime, reversed]);

	// 清理
	// useEffect(() => {
	// 	return () => {
	// 		if (animationFrameRef.current !== null) {
	// 			cancelAnimationFrame(animationFrameRef.current);
	// 		}
	// 		// 清空图像池并关闭所有 ImageBitmap
	// 		for (const item of imagePoolRef.current) {
	// 			try {
	// 				item.bitmap.close();
	// 			} catch {
	// 				// 忽略关闭错误
	// 			}
	// 		}
	// 		imagePoolRef.current = [];
	// 	};
	// }, []);

	// 如果没有视频或正在加载，显示占位符
	if (!uri || isLoading) {
		return (
			<Group>
				<Rect x={x} y={y} width={width} height={height} color="#e5e7eb" />
			</Group>
		);
	}

	// 如果有错误，显示错误提示
	if (error) {
		return (
			<Group>
				<Rect x={x} y={y} width={width} height={height} color="#fee2e2" />
			</Group>
		);
	}

	// 显示视频帧
	return (
		<Group>
			<Rect
				x={x}
				y={y}
				width={width}
				height={height}
				color={currentFrameImage ? undefined : "transparent"}
				transform={[{ rotate }]}
				origin={{ x, y }}
			>
				{currentFrameImage && (
					<ImageShader
						image={currentFrameImage}
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

Clip.displayName = "Clip";
Clip.timelineComponent = ({
	uri,
	start: startProp,
	end: endProp,
	reversed,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const videoSinkRef = useRef<CanvasSink | null>(null);
	const inputRef = useRef<Input | null>(null);
	const isGeneratingRef = useRef(false);

	const start = parseStartEndSchema(startProp);
	const end = parseStartEndSchema(endProp);

	const clipDuration = end - start;

	// 生成预览图
	const generateThumbnails = useCallback(
		async (videoUri: string) => {
			if (!canvasRef.current || !videoUri || isGeneratingRef.current) {
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
				videoSinkRef.current = null;
				inputRef.current = null;

				// 创建 Input
				const source = new UrlSource(videoUri);
				const input = new Input({
					source,
					formats: ALL_FORMATS,
				});
				inputRef.current = input;

				// 获取视频轨道
				const videoTrack = await input.getPrimaryVideoTrack();

				if (!videoTrack) {
					throw new Error("未找到视频轨道");
				}

				if (videoTrack.codec === null || !(await videoTrack.canDecode())) {
					throw new Error("无法解码视频轨道");
				}

				// 创建视频 Sink
				const videoCanBeTransparent = await videoTrack.canBeTransparent();
				const videoSink = new CanvasSink(videoTrack, {
					poolSize: 2,
					fit: "contain",
					alpha: videoCanBeTransparent,
				});
				videoSinkRef.current = videoSink;

				// 获取视频时长
				const duration = await input.computeDuration();

				// 设置 canvas 尺寸
				const canvasWidth = canvas.offsetWidth;
				const canvasHeight = canvas.offsetHeight;
				canvas.width = canvasWidth;
				canvas.height = canvasHeight;

				// 获取最后一帧（用于填充超出视频长度的部分）
				let lastFrameCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
				try {
					const lastFrameTime = Math.max(0, duration - 0.001);
					if (lastFrameTime >= 0 && duration > 0) {
						const lastFrameIterator = videoSink.canvases(lastFrameTime);
						const lastFrame = (await lastFrameIterator.next()).value;
						if (lastFrame?.canvas) {
							// 复制最后一帧的 canvas 内容
							const sourceCanvas = lastFrame.canvas;
							if (sourceCanvas instanceof HTMLCanvasElement) {
								const copyCanvas = document.createElement("canvas");
								copyCanvas.width = sourceCanvas.width;
								copyCanvas.height = sourceCanvas.height;
								const copyCtx = copyCanvas.getContext("2d");
								if (copyCtx) {
									copyCtx.drawImage(sourceCanvas, 0, 0);
									lastFrameCanvas = copyCanvas;
								}
							} else if (sourceCanvas instanceof OffscreenCanvas) {
								// 对于 OffscreenCanvas，创建 ImageBitmap 然后转换
								const imageBitmap = await createImageBitmap(sourceCanvas);
								const copyCanvas = document.createElement("canvas");
								copyCanvas.width = imageBitmap.width;
								copyCanvas.height = imageBitmap.height;
								const copyCtx = copyCanvas.getContext("2d");
								if (copyCtx) {
									copyCtx.drawImage(imageBitmap, 0, 0);
									imageBitmap.close();
									lastFrameCanvas = copyCanvas;
								}
							}
						}
						await lastFrameIterator.return();
					}
				} catch (err) {
					console.warn("获取最后一帧失败:", err);
				}

				// 根据 clipDuration 和 canvas 宽度，计算能放多少个预览图
				// 使用一个合理的预览图宽度估算（基于视频宽高比，但最终会裁切填满）
				// 这里先用一个估算值来计算数量，实际绘制时会填满整个区域
				const estimatedAspectRatio = 16 / 9; // 估算值，实际会裁切
				const estimatedThumbnailWidth = canvasHeight * estimatedAspectRatio;
				const numThumbnails = Math.max(
					1,
					Math.ceil(canvasWidth / estimatedThumbnailWidth),
				);

				// 始终使用 clipDuration 来计算提取间隔
				const previewInterval = clipDuration / numThumbnails;

				// 计算每个预览图的实际宽度（填满整个 canvas 宽度）
				const thumbnailWidth = canvasWidth / numThumbnails;
				const thumbnailHeight = canvasHeight;

				// 清空 canvas
				ctx.fillStyle = "#e5e7eb";
				ctx.fillRect(0, 0, canvasWidth, canvasHeight);

				// 按间隔提取帧并绘制
				for (let i = 0; i < numThumbnails; i++) {
					const relativeTime = i * previewInterval; // 相对于 clip start 的时间

					// 计算视频中的绝对时间（考虑倒放）
					const absoluteTime = calculateVideoTime({
						start: 0,
						timelineTime: relativeTime,
						videoDuration: duration,
						reversed,
					});

					let frameCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

					try {
						// 如果时间在视频范围内，正常提取
						if (absoluteTime >= 0 && absoluteTime < duration) {
							const frameIterator = videoSink.canvases(absoluteTime);
							const frame = (await frameIterator.next()).value;
							if (frame?.canvas) {
								frameCanvas = frame.canvas;
							}
							await frameIterator.return();
						}
						// 如果时间超出视频长度，使用最后一帧
						else if (absoluteTime >= duration && lastFrameCanvas) {
							frameCanvas = lastFrameCanvas;
						}
						// 如果时间小于 0，使用第一帧（这种情况应该很少，但为了安全）
						else if (absoluteTime < 0) {
							const frameIterator = videoSink.canvases(0);
							const frame = (await frameIterator.next()).value;
							if (frame?.canvas) {
								frameCanvas = frame.canvas;
							}
							await frameIterator.return();
						}

						if (frameCanvas) {
							// 计算绘制位置
							// 倒放时：左边显示视频末尾，右边显示视频开头（与时间线方向一致）
							// 正放时：左边显示视频开头，右边显示视频末尾（与时间线方向一致）
							const x = i * thumbnailWidth;

							// 基于高度缩放，确保高度完全适应（不裁切上下）
							const scale = thumbnailHeight / frameCanvas.height;

							// 计算缩放后的宽度
							const scaledWidth = frameCanvas.width * scale;

							// 如果缩放后的宽度大于目标宽度，需要裁切左右
							if (scaledWidth > thumbnailWidth) {
								// 计算需要裁切的左右部分（居中裁切）
								const sourceWidth = thumbnailWidth / scale;
								const sourceX = (frameCanvas.width - sourceWidth) / 2;

								// 绘制帧到 canvas（只裁切左右，保持完整高度）
								ctx.drawImage(
									frameCanvas,
									sourceX,
									0, // 不裁切上下，从顶部开始
									sourceWidth,
									frameCanvas.height, // 完整高度
									x,
									0,
									thumbnailWidth,
									thumbnailHeight,
								);
							} else {
								// 如果缩放后的宽度小于等于目标宽度，居中显示（这种情况应该很少）
								const offsetX = (thumbnailWidth - scaledWidth) / 2;
								ctx.drawImage(
									frameCanvas,
									0,
									0,
									frameCanvas.width,
									frameCanvas.height,
									x + offsetX,
									0,
									scaledWidth,
									thumbnailHeight,
								);
							}
						}
					} catch (err) {
						console.warn(`提取时间 ${absoluteTime} 的帧失败:`, err);
					}
				}
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
						"Video Thumbnails Generation Failed",
						canvas.width / 2,
						canvas.height / 2,
					);
				}
			} finally {
				isGeneratingRef.current = false;
			}
		},
		[start, end, clipDuration, reversed],
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
			videoSinkRef.current = null;
			inputRef.current = null;
		};
	}, [uri, generateThumbnails]);

	return (
		<div className="absolute inset-0 rounded-md overflow-hidden">
			<div className=" absolute top-1 left-1 px-1 rounded bg-white/50 backdrop-blur-sm text-black/80 text-xs">
				{clipDuration} s
			</div>
			<canvas ref={canvasRef} className="size-full" />
		</div>
	);
};

export default Clip;
