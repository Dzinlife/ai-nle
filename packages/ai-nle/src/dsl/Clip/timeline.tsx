import { useCallback, useEffect, useRef } from "react";
import { useModelSelector } from "../model/registry";
import type { TimelineProps } from "../model/types";
import { type ClipInternal, type ClipProps, calculateVideoTime } from "./model";

interface ClipTimelineProps extends TimelineProps {
	id: string;
}

export const ClipTimeline: React.FC<ClipTimelineProps> = ({
	id,
	start,
	end,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const isGeneratingRef = useRef(false);

	// 订阅 model 状态
	const uri = useModelSelector<ClipProps, string | undefined>(
		id,
		(state) => state.props.uri,
	);
	const reversed = useModelSelector<ClipProps, boolean | undefined>(
		id,
		(state) => state.props.reversed,
	);
	const maxDuration = useModelSelector<ClipProps, number | undefined>(
		id,
		(state) => state.constraints.maxDuration,
	);
	const isLoading = useModelSelector<ClipProps, boolean>(
		id,
		(state) => state.constraints.isLoading ?? false,
	);

	// 从 Model 获取 videoSink 和 duration
	const videoSink = useModelSelector<ClipProps, ClipInternal["videoSink"]>(
		id,
		(state) => (state.internal as unknown as ClipInternal).videoSink,
	);
	const videoDuration = useModelSelector<ClipProps, number>(
		id,
		(state) => (state.internal as unknown as ClipInternal).videoDuration,
	);

	const clipDurationRef = useRef(end - start);
	clipDurationRef.current = end - start;
	const clipDuration = clipDurationRef.current;

	// 生成预览图（使用 Model 中的 videoSink）
	const generateThumbnails = useCallback(async () => {
		if (
			!canvasRef.current ||
			!videoSink ||
			!uri ||
			isGeneratingRef.current ||
			videoDuration <= 0
		) {
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
			// 设置 canvas 尺寸
			const canvasWidth = canvas.offsetWidth;
			const canvasHeight = canvas.offsetHeight;
			canvas.width = canvasWidth;
			canvas.height = canvasHeight;

			// 获取最后一帧
			let lastFrameCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
			try {
				const lastFrameTime = Math.max(0, videoDuration - 0.001);
				if (lastFrameTime >= 0 && videoDuration > 0) {
					const lastFrameIterator = videoSink.canvases(lastFrameTime);
					const lastFrame = (await lastFrameIterator.next()).value;
					if (lastFrame?.canvas) {
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
				console.warn("Failed to get last frame:", err);
			}

			// 计算预览图数量
			const estimatedAspectRatio = 16 / 9;
			const estimatedThumbnailWidth = canvasHeight * estimatedAspectRatio;
			const numThumbnails = Math.max(
				1,
				Math.ceil(canvasWidth / estimatedThumbnailWidth),
			);

			const previewInterval = clipDuration / numThumbnails;
			const thumbnailWidth = canvasWidth / numThumbnails;
			const thumbnailHeight = canvasHeight;

			// 清空 canvas
			ctx.fillStyle = "#e5e7eb";
			ctx.fillRect(0, 0, canvasWidth, canvasHeight);

			// 按间隔提取帧并绘制
			for (let i = 0; i < numThumbnails; i++) {
				const relativeTime = i * previewInterval;

				const absoluteTime = calculateVideoTime({
					start: 0,
					timelineTime: relativeTime,
					videoDuration: videoDuration,
					reversed,
				});

				let frameCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;

				try {
					if (absoluteTime >= 0 && absoluteTime < videoDuration) {
						const frameIterator = videoSink.canvases(absoluteTime);
						const frame = (await frameIterator.next()).value;
						if (frame?.canvas) {
							frameCanvas = frame.canvas;
						}
						await frameIterator.return();
					} else if (absoluteTime >= videoDuration && lastFrameCanvas) {
						frameCanvas = lastFrameCanvas;
					} else if (absoluteTime < 0) {
						const frameIterator = videoSink.canvases(0);
						const frame = (await frameIterator.next()).value;
						if (frame?.canvas) {
							frameCanvas = frame.canvas;
						}
						await frameIterator.return();
					}

					if (frameCanvas) {
						const x = i * thumbnailWidth;
						const scale = thumbnailHeight / frameCanvas.height;
						const scaledWidth = frameCanvas.width * scale;

						if (scaledWidth > thumbnailWidth) {
							const sourceWidth = thumbnailWidth / scale;
							const sourceX = (frameCanvas.width - sourceWidth) / 2;

							ctx.drawImage(
								frameCanvas,
								sourceX,
								0,
								sourceWidth,
								frameCanvas.height,
								x,
								0,
								thumbnailWidth,
								thumbnailHeight,
							);
						} else {
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
					console.warn(`Failed to extract frame at ${absoluteTime}:`, err);
				}
			}
		} catch (err) {
			console.error("Failed to generate thumbnails:", err);
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
	}, [videoSink, videoDuration, uri, reversed, clipDuration]);

	// 当 videoSink 准备好后生成缩略图
	useEffect(() => {
		if (!isLoading && videoSink && videoDuration > 0) {
			void generateThumbnails();
		}
	}, [isLoading, videoSink, videoDuration, generateThumbnails]);

	return (
		<div className="absolute inset-0 rounded-md overflow-hidden">
			{/* 时长显示 */}
			<div className="absolute top-1 left-1 px-1 rounded bg-white/50 backdrop-blur-sm text-black/80 text-xs z-10">
				{clipDuration.toFixed(1)}s
			</div>

			{/* 最大时长指示器 */}
			{maxDuration && clipDuration > maxDuration + 0.001 && (
				<div
					className="absolute top-0 bottom-0 bg-red-500/30 border-l-2 border-red-500 z-10"
					style={{
						left: `${(maxDuration / clipDuration) * 100}%`,
						right: 0,
					}}
				>
					<div className="absolute top-1 right-1 px-1 rounded bg-red-500 text-white text-xs">
						Exceeds max
					</div>
				</div>
			)}

			{/* Loading 指示器 */}
			{isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-200/50 z-10">
					<div className="text-xs text-gray-500">Loading...</div>
				</div>
			)}

			{/* 缩略图 canvas */}
			<canvas ref={canvasRef} className="absolute inset-y-0 left-0" />
		</div>
	);
};
