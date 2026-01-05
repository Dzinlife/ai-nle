import {
	ALL_FORMATS,
	CanvasSink,
	Input,
	UrlSource,
	WrappedCanvas,
} from "mediabunny";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, ImageShader, Rect, type SkImage, Skia } from "react-skia-lite";
import { useTimeline } from "@/components/TimelineContext";
import ClipTimeline from "./ClipTimeline";
import { EditorComponent } from "./types";

const Clip: EditorComponent<{
	uri?: string;
}> = ({ uri, __renderLayout }) => {
	const { currentTime } = useTimeline();

	const { x, y, w: width, h: height, r: rotate = 0 } = __renderLayout;

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

	// 强引用：保持最近几帧图像和对应的 ImageBitmap 不被 GC 回收
	// 这样可以确保在 Skia 绘制时图像仍然有效
	const imagePoolRef = useRef<{ image: SkImage; bitmap: ImageBitmap }[]>([]);
	const MAX_POOL_SIZE = 3; // 保留最近 3 帧

	// 保持 currentTimeRef 与 currentTime 同步
	useEffect(() => {
		currentTimeRef.current = currentTime;
	}, [currentTime]);

	// 更新当前帧（复制 canvas 内容避免 mediabunny 复用导致的问题）
	const updateFrame = useCallback(
		async (canvas: HTMLCanvasElement | OffscreenCanvas) => {
			try {
				// 使用 createImageBitmap 来复制 canvas 内容
				// 这样即使 mediabunny 复用原 canvas，我们的数据也是安全的
				const imageBitmap = await createImageBitmap(canvas);
				const skiaImage = Skia.Image.MakeImageFromNativeBuffer(imageBitmap);

				if (skiaImage) {
					// 将新图像和对应的 ImageBitmap 加入池中
					imagePoolRef.current.push({ image: skiaImage, bitmap: imageBitmap });

					// 如果超出池大小，移除旧的并关闭 ImageBitmap
					while (imagePoolRef.current.length > MAX_POOL_SIZE) {
						const removed = imagePoolRef.current.shift();
						if (removed) {
							// 关闭 ImageBitmap 释放资源
							removed.bitmap.close();
						}
					}
					setCurrentFrameImage(skiaImage);
				} else {
					// 如果创建 SkImage 失败，关闭 ImageBitmap
					imageBitmap.close();
				}
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
						updateFrame(canvas);
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
				const pendingTime = pendingSeekTimeRef.current;
				if (pendingTime !== null) {
					pendingSeekTimeRef.current = null;
					// 使用 setTimeout 避免递归调用栈溢出
					setTimeout(() => {
						void seekToTime(pendingTime);
					}, 0);
				}
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
					const timeToSeek =
						currentTimeRef.current != null && currentTimeRef.current >= 0
							? currentTimeRef.current
							: 0;
					await seekToTime(timeToSeek);
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

	// 当 uri 变化时，加载视频
	useEffect(() => {
		if (!uri) {
			return;
		}

		let isCancelled = false;

		const loadVideo = async () => {
			await initMediaPlayer(uri);
			if (isCancelled) {
				return;
			}
		};

		void loadVideo();

		return () => {
			isCancelled = true;
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

		// 如果时间变化超过 0.1 秒，才更新帧（避免频繁 seek）
		if (
			lastSeekTimeRef.current !== null &&
			Math.abs(lastSeekTimeRef.current - currentTime) < 0.1
		) {
			return;
		}

		const targetTime = currentTime;

		// 使用 requestAnimationFrame 来节流更新
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
		}

		animationFrameRef.current = requestAnimationFrame(() => {
			animationFrameRef.current = null;
			void seekToTime(targetTime);
		});

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [currentTime, uri, seekToTime]);

	// 清理
	useEffect(() => {
		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
			// 清空图像池并关闭所有 ImageBitmap
			for (const item of imagePoolRef.current) {
				try {
					item.bitmap.close();
				} catch {
					// 忽略关闭错误
				}
			}
			imagePoolRef.current = [];
		};
	}, []);

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
Clip.timelineComponent = ClipTimeline;

export default Clip;
