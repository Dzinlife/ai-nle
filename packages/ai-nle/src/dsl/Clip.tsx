import {
	ALL_FORMATS,
	CanvasSink,
	Input,
	UrlSource,
	WrappedCanvas,
} from "mediabunny";
import { useCallback, useEffect, useRef, useState } from "react";
import { Group, ImageShader, Rect, type SkImage, Skia } from "react-skia-lite";
import { usePreview } from "@/components/PreviewProvider";
import { converMetaLayoutToCanvasLayout } from "./layout";
import { ICommonProps } from "./types";

// TODO, 获取当前帧数据，待 provider 实现
const useTimeline = () => {
	return {
		currentTime: 0,
		playState: "paused" as "paused" | "playing" | "ended",
	};
};

const Clip = ({
	children,
	uri,
	...props
}: ICommonProps & { children?: React.ReactNode; uri?: string }) => {
	const { pictureWidth, pictureHeight, canvasWidth, canvasHeight } =
		usePreview();

	const { x, y, width, height, rotation } = converMetaLayoutToCanvasLayout(
		props,
		{
			width: pictureWidth,
			height: pictureHeight,
		},
		{
			width: canvasWidth,
			height: canvasHeight,
		},
		window.devicePixelRatio,
	);

	const { currentTime } = useTimeline();

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

	// 保持 currentTimeRef 与 currentTime 同步
	useEffect(() => {
		currentTimeRef.current = currentTime;
	}, [currentTime]);

	// 更新当前帧
	const updateFrame = useCallback(
		(canvas: HTMLCanvasElement | OffscreenCanvas) => {
			try {
				const skiaImage = Skia.Image.MakeImageFromNativeBuffer(canvas);
				if (skiaImage) {
					setCurrentFrameImage(skiaImage);
				}
			} catch (err) {
				console.error("更新帧失败:", err);
			}
		},
		[],
	);

	// 跳转到指定时间并显示帧
	const seekToTime = useCallback(
		async (seconds: number) => {
			if (!videoSinkRef.current || isSeekingRef.current) {
				return;
			}

			// 如果时间没有变化，跳过
			if (lastSeekTimeRef.current === seconds) {
				return;
			}

			isSeekingRef.current = true;
			asyncIdRef.current++;
			const currentAsyncId = asyncIdRef.current;

			try {
				// 清理旧的迭代器
				await videoFrameIteratorRef.current?.return();

				// 检查是否已被新的操作替换
				if (currentAsyncId !== asyncIdRef.current || !videoSinkRef.current) {
					isSeekingRef.current = false;
					return;
				}

				// 创建新的迭代器，从指定时间开始
				videoFrameIteratorRef.current = videoSinkRef.current.canvases(seconds);

				if (!videoFrameIteratorRef.current) {
					isSeekingRef.current = false;
					return;
				}

				// 获取第一帧（最接近指定时间的帧）
				const firstFrame =
					(await videoFrameIteratorRef.current.next()).value ?? null;

				// 再次检查是否已被替换
				if (
					currentAsyncId !== asyncIdRef.current ||
					!videoFrameIteratorRef.current
				) {
					isSeekingRef.current = false;
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
			} catch (err) {
				console.warn("跳转到指定时间失败:", err);
			} finally {
				isSeekingRef.current = false;
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
						currentTimeRef.current >= 0 ? currentTimeRef.current : 0;
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
		if (!videoSinkRef.current || !uri || currentTime < 0) {
			return;
		}

		// 如果时间变化超过 0.1 秒，才更新帧（避免频繁 seek）
		if (
			lastSeekTimeRef.current !== null &&
			Math.abs(lastSeekTimeRef.current - currentTime) < 0.1
		) {
			return;
		}

		// 使用 requestAnimationFrame 来节流更新
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
		}

		animationFrameRef.current = requestAnimationFrame(() => {
			animationFrameRef.current = null;
			void seekToTime(currentTime);
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
				transform={[{ rotate: rotation }]}
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

export default Clip;
