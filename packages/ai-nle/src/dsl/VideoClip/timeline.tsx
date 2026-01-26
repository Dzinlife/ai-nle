import { useCallback, useEffect, useRef } from "react";
import { useFps, useTimelineStore } from "@/editor/contexts/TimelineContext";
import { framesToSeconds, framesToTimecode } from "@/utils/timecode";
import { createModelSelector } from "../model/registry";
import type { TimelineProps } from "../model/types";
import {
	calculateVideoTime,
	type VideoClipInternal,
	type VideoClipProps,
} from "./model";

interface VideoClipTimelineProps extends TimelineProps {
	id: string;
}

const useVideoClipSelector = createModelSelector<
	VideoClipProps,
	VideoClipInternal
>();

export const VideoClipTimeline: React.FC<VideoClipTimelineProps> = ({
	id,
	start,
	end,
}) => {
	const { fps } = useFps();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const isGeneratingRef = useRef(false);

	// 订阅 model 状态
	const uri = useVideoClipSelector(id, (state) => state.props.uri);
	const reversed = useVideoClipSelector(id, (state) => state.props.reversed);
	const maxDuration = useVideoClipSelector(
		id,
		(state) => state.constraints.maxDuration,
	);
	const element = useTimelineStore((state) => state.getElementById(id));

	const isLoading = useVideoClipSelector(
		id,
		(state) => state.constraints.isLoading ?? false,
	);

	// 从 Model 获取 videoSink 和 duration
	const videoSink = useVideoClipSelector(
		id,
		(state) => state.internal.videoSink,
	);
	const videoDuration = useVideoClipSelector(
		id,
		(state) => state.internal.videoDuration,
	);

	const clipDurationRef = useRef(end - start);
	clipDurationRef.current = end - start;
	const clipDurationFrames = clipDurationRef.current;
	const clipDurationSeconds = framesToSeconds(clipDurationFrames, fps);
	const timelineOffsetFrames = useTimelineStore(
		(state) => state.getElementById(id)?.timeline?.offset ?? 0,
	);
	const offsetSeconds = framesToSeconds(timelineOffsetFrames, fps);

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

		let canvasWidth = 0;
		let canvasHeight = 0;
		let pixelRatio = 1;

		try {
			const rect = canvas.getBoundingClientRect();
			canvasWidth = rect.width;
			canvasHeight = rect.height;
			if (canvasWidth <= 0 || canvasHeight <= 0) {
				return;
			}

			pixelRatio = Math.max(1, window.devicePixelRatio || 1);
			canvas.width = Math.max(1, Math.floor(canvasWidth * pixelRatio));
			canvas.height = Math.max(1, Math.floor(canvasHeight * pixelRatio));
			// 兼容高 DPI，绘制仍使用 CSS 像素
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.scale(pixelRatio, pixelRatio);

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

			// 使用素材实际比例计算预览图尺寸
			let sourceAspectRatio = 0;
			if (lastFrameCanvas && lastFrameCanvas.height > 0) {
				sourceAspectRatio = lastFrameCanvas.width / lastFrameCanvas.height;
			}
			if (!sourceAspectRatio || !Number.isFinite(sourceAspectRatio)) {
				try {
					const probeIterator = videoSink.canvases(0);
					const probeFrame = (await probeIterator.next()).value;
					if (probeFrame?.canvas && probeFrame.canvas.height > 0) {
						sourceAspectRatio =
							probeFrame.canvas.width / probeFrame.canvas.height;
					}
					await probeIterator.return();
				} catch (err) {
					console.warn("Failed to probe frame size:", err);
				}
			}
			if (!sourceAspectRatio || !Number.isFinite(sourceAspectRatio)) {
				sourceAspectRatio = 16 / 9;
			}

			const thumbnailHeight = canvasHeight;
			const thumbnailWidth = Math.max(1, thumbnailHeight * sourceAspectRatio);
			const numThumbnails = Math.max(
				1,
				Math.ceil(canvasWidth / thumbnailWidth),
			);
			const previewInterval = clipDurationSeconds / numThumbnails;

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
					offset: offsetSeconds,
					clipDuration: clipDurationSeconds,
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
						const drawWidth = Math.min(thumbnailWidth, canvasWidth - x);
						if (drawWidth <= 0 || frameCanvas.height <= 0) {
							continue;
						}
						const scale = thumbnailHeight / frameCanvas.height;
						const scaledWidth = frameCanvas.width * scale;

						if (scaledWidth > drawWidth) {
							const sourceWidth = drawWidth / scale;
							const sourceX = (frameCanvas.width - sourceWidth) / 2;

							ctx.drawImage(
								frameCanvas,
								sourceX,
								0,
								sourceWidth,
								frameCanvas.height,
								x,
								0,
								drawWidth,
								thumbnailHeight,
							);
						} else {
							const offsetX = (drawWidth - scaledWidth) / 2;
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
				const errorWidth = canvasWidth || canvas.width / pixelRatio;
				const errorHeight = canvasHeight || canvas.height / pixelRatio;
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.scale(pixelRatio, pixelRatio);
				ctx.fillStyle = "#fee2e2";
				ctx.fillRect(0, 0, errorWidth, errorHeight);
				ctx.fillStyle = "#dc2626";
				ctx.font = "12px sans-serif";
				ctx.textAlign = "center";
				ctx.fillText(
					"Video Thumbnails Generation Failed",
					errorWidth / 2,
					errorHeight / 2,
				);
			}
		} finally {
			isGeneratingRef.current = false;
		}
	}, [
		videoSink,
		videoDuration,
		uri,
		reversed,
		clipDurationSeconds,
		offsetSeconds,
	]);

	// 当 videoSink 准备好后生成缩略图
	useEffect(() => {
		if (!isLoading && videoSink && videoDuration > 0) {
			void generateThumbnails();
		}
	}, [isLoading, videoSink, videoDuration, generateThumbnails]);

	return (
		<div className="absolute inset-0 overflow-hidden bg-zinc-700">
			<div className="absolute inset-x-0 top-0 px-1 pt-px items-center truncate leading-none">
				{element?.name}
			</div>

			{/* 最大时长指示器 */}
			{/* {maxDuration !== undefined && clipDurationFrames > maxDuration && (
				<div
					className="absolute top-0 bottom-0 bg-red-500/30 border-l-2 border-red-500 z-10"
					style={{
						left: `${(maxDuration / clipDurationFrames) * 100}%`,
						right: 0,
					}}
				>
					<div className="absolute top-1 right-1 px-1 rounded bg-red-500 text-white text-xs">
						Exceeds max
					</div>
				</div>
			)} */}

			{/* Loading 指示器 */}
			{isLoading && (
				<div className="absolute inset-0 flex items-center justify-center bg-gray-200/50 z-10">
					<div className="text-xs text-gray-500">Loading...</div>
				</div>
			)}

			{/* 缩略图 canvas */}
			<div className="absolute inset-y-4 w-full">
				<canvas ref={canvasRef} className="absolute inset-0 size-full" />
			</div>
			<div className="absolute inset-x-0 bottom-0 h-4 bg-neutral-700/20"></div>
		</div>
	);
};
