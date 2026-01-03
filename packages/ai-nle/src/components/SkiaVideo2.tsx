import { useCallback, useEffect, useRef, useState } from "react";
import {
	Canvas,
	Group,
	Image,
	rect,
	type SkImage,
	Skia,
	type Video,
} from "react-skia-lite";

export default function SkiaVideo2() {
	const [video, setVideo] = useState<Video | null>(null);
	const [currentFrame, setCurrentFrame] = useState<SkImage | null>(null);
	const [duration, setDuration] = useState(0);
	const animationFrameRef = useRef<number | null>(null);
	const videoFrameCallbackRef = useRef<number | null>(null);
	const currentFrameRef = useRef<SkImage | null>(null);
	const pendingDisposeRef = useRef<SkImage | null>(null);
	const videoElementRef = useRef<HTMLVideoElement | null>(null);
	const canvasContainerRef = useRef<HTMLDivElement | null>(null);
	const mouseMoveRafRef = useRef<number | null>(null);
	const pendingSeekTimeRef = useRef<number | null>(null);

	useEffect(() => {
		const videoPromise = Skia.Video("/intro.mp4") as Promise<Video>;
		videoPromise.then((v) => {
			setVideo(v);
			videoElementRef.current = v.videoElement;
			// 获取视频时长
			const videoDuration = v.duration();
			setDuration(videoDuration);
			// 开始播放视频
			v.play();
		});
	}, []);

	// 动画循环，持续更新视频帧
	useEffect(() => {
		if (!video || !videoElementRef.current) {
			return;
		}

		const videoElement = videoElementRef.current;
		const supportsVideoFrameCallback =
			typeof videoElement.requestVideoFrameCallback === "function";

		const updateFrame = () => {
			// 先 dispose 上一帧标记为待处理的图像
			if (pendingDisposeRef.current) {
				try {
					pendingDisposeRef.current.dispose();
				} catch {
					// 忽略已经 dispose 的错误
				}
				pendingDisposeRef.current = null;
			}

			const nextImage = video.nextImage();
			if (nextImage) {
				// 保存旧图像，标记为待处理（在下一帧 dispose）
				const oldImage = currentFrameRef.current;
				if (oldImage && oldImage !== nextImage) {
					pendingDisposeRef.current = oldImage;
				}

				// 更新 ref 和状态
				currentFrameRef.current = nextImage;
				setCurrentFrame(nextImage);
			}
		};

		if (supportsVideoFrameCallback) {
			// 使用 requestVideoFrameCallback 优化（与视频帧率同步）
			const callback = () => {
				updateFrame();
				// 继续请求下一帧
				videoFrameCallbackRef.current =
					videoElement.requestVideoFrameCallback(callback);
			};
			videoFrameCallbackRef.current =
				videoElement.requestVideoFrameCallback(callback);
		} else {
			// 回退到 requestAnimationFrame
			const animate = () => {
				updateFrame();
				animationFrameRef.current = requestAnimationFrame(animate);
			};
			animationFrameRef.current = requestAnimationFrame(animate);
		}

		// 清理函数
		return () => {
			// 清理 requestVideoFrameCallback
			if (
				videoFrameCallbackRef.current !== null &&
				videoElement &&
				typeof videoElement.cancelVideoFrameCallback === "function"
			) {
				videoElement.cancelVideoFrameCallback(videoFrameCallbackRef.current);
				videoFrameCallbackRef.current = null;
			}
			// 清理 requestAnimationFrame
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
				animationFrameRef.current = null;
			}
			// 清理待处理的图像
			if (pendingDisposeRef.current) {
				try {
					pendingDisposeRef.current.dispose();
				} catch {
					// 忽略已经 dispose 的错误
				}
				pendingDisposeRef.current = null;
			}
			// 清理当前帧
			if (currentFrameRef.current) {
				try {
					currentFrameRef.current.dispose();
				} catch {
					// 忽略已经 dispose 的错误
				}
				currentFrameRef.current = null;
			}
		};
	}, [video]);

	// 处理鼠标移动，根据横向百分比 seek 视频位置
	const handleMouseMove = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if (!canvasContainerRef.current || !video || !duration) {
				return;
			}

			const rect = canvasContainerRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const percentage = Math.max(0, Math.min(1, x / rect.width));
			const targetTime = percentage * duration;

			// 保存待处理的 seek 时间
			pendingSeekTimeRef.current = targetTime;

			// 如果已经有待处理的 RAF，取消它
			if (mouseMoveRafRef.current !== null) {
				cancelAnimationFrame(mouseMoveRafRef.current);
			}

			// 使用 requestAnimationFrame 节流，确保跟手操作流畅
			mouseMoveRafRef.current = requestAnimationFrame(() => {
				mouseMoveRafRef.current = null;
				const timeToSeek = pendingSeekTimeRef.current;
				if (timeToSeek !== null && video) {
					pendingSeekTimeRef.current = null;
					video.seek(timeToSeek);
				}
			});
		},
		[duration, video],
	);

	// 清理 RAF
	useEffect(() => {
		return () => {
			if (mouseMoveRafRef.current !== null) {
				cancelAnimationFrame(mouseMoveRafRef.current);
			}
		};
	}, []);

	return (
		<div className="canvas-container">
			<h2>Skia Canvas Demo</h2>
			<div
				ref={canvasContainerRef}
				onMouseMove={handleMouseMove}
				style={{ display: "inline-block", cursor: "pointer" }}
			>
				<Canvas style={{ width: 800, height: 450 }}>
					<Group>
						{currentFrame && (
							<Image image={currentFrame} rect={rect(0, 0, 800, 450)} />
						)}
					</Group>
				</Canvas>
			</div>
		</div>
	);
}
