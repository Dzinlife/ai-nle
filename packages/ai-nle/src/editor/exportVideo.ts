import {
	BufferTarget,
	CanvasSource,
	Mp4OutputFormat,
	Output,
	QUALITY_HIGH,
} from "mediabunny";
import { Skia, SkiaSGRoot, type SkImage } from "react-skia-lite";
import type { TimelineElement } from "@/dsl/types";
import { modelRegistry } from "@/dsl/model/registry";
import { useTimelineStore } from "@/editor/contexts/TimelineContext";
import {
	buildSkiaRenderState,
	pickActiveTransition,
} from "@/editor/preview/buildSkiaTree";

const getTrackIndexForElement = (element: TimelineElement) =>
	element.timeline.trackIndex ?? 0;

const sortByTrackIndex = (items: TimelineElement[]) => {
	return items
		.map((el, index) => ({
			el,
			index,
			trackIndex: getTrackIndexForElement(el),
		}))
		.sort((a, b) => {
			if (a.trackIndex !== b.trackIndex) {
				return a.trackIndex - b.trackIndex;
			}
			return a.index - b.index;
		})
		.map(({ el }) => el);
};

const ensure2DContext = (
	canvas: HTMLCanvasElement | OffscreenCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D => {
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("无法获取导出画布的 2D 上下文");
	}
	return ctx;
};

const drawSkiaImageToCanvas = (
	image: SkImage,
	targetCanvas: HTMLCanvasElement | OffscreenCanvas,
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	reusableImageDataRef: { current: ImageData | null },
	scratchRef: { current: HTMLCanvasElement | OffscreenCanvas | null },
) => {
	const info = image.getImageInfo();
	const pixels = image.readPixels();
	if (!pixels) {
		throw new Error("无法读取 Skia 像素数据");
	}
	const clamped =
		pixels instanceof Uint8ClampedArray
			? pixels
			: new Uint8ClampedArray(pixels);
	if (
		!reusableImageDataRef.current ||
		reusableImageDataRef.current.width !== info.width ||
		reusableImageDataRef.current.height !== info.height
	) {
		reusableImageDataRef.current = new ImageData(info.width, info.height);
	}
	reusableImageDataRef.current.data.set(clamped);

	const targetWidth = targetCanvas.width;
	const targetHeight = targetCanvas.height;
	if (info.width === targetWidth && info.height === targetHeight) {
		ctx.putImageData(reusableImageDataRef.current, 0, 0);
		return;
	}

	if (
		!scratchRef.current ||
		scratchRef.current.width !== info.width ||
		scratchRef.current.height !== info.height
	) {
		scratchRef.current =
			typeof OffscreenCanvas !== "undefined"
				? new OffscreenCanvas(info.width, info.height)
				: (() => {
						const canvas = document.createElement("canvas");
						canvas.width = info.width;
						canvas.height = info.height;
						return canvas;
					})();
	}

	const scratchCtx = ensure2DContext(scratchRef.current);
	scratchCtx.putImageData(reusableImageDataRef.current, 0, 0);
	ctx.clearRect(0, 0, targetWidth, targetHeight);
	ctx.drawImage(scratchRef.current, 0, 0, targetWidth, targetHeight);
};

const downloadBlob = (blob: Blob, filename: string): void => {
	const link = document.createElement("a");
	const url = URL.createObjectURL(blob);
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
};

const waitForStaticModelsReady = async (elements: TimelineElement[]) => {
	const promises: Promise<void>[] = [];
	for (const element of elements) {
		const store = modelRegistry.get(element.id);
		if (!store) continue;
		const state = store.getState();
		if (state.type === "VideoClip") continue;
		if (state.waitForReady) {
			promises.push(state.waitForReady());
		}
	}
	await Promise.all(promises);
};

export const exportTimelineAsVideo = async (options?: {
	filename?: string;
	fps?: number;
	startFrame?: number;
	endFrame?: number;
}): Promise<void> => {
	const timelineState = useTimelineStore.getState();
	const elements = timelineState.elements;
	const tracks = timelineState.tracks;
	const fps = Number.isFinite(options?.fps)
		? Math.round(options?.fps as number)
		: Math.round(timelineState.fps || 30);

	const width = Math.round(timelineState.canvasSize.width);
	const height = Math.round(timelineState.canvasSize.height);
	if (!width || !height) {
		throw new Error("导出失败：无法获取画布尺寸");
	}

	const startFrame = Math.max(0, Math.round(options?.startFrame ?? 0));
	const timelineEnd =
		options?.endFrame ??
		elements.reduce(
			(max, el) => Math.max(max, Math.round(el.timeline.end ?? 0)),
			0,
		);
	const endFrame = Math.max(startFrame, Math.round(timelineEnd));
	if (endFrame <= startFrame) {
		throw new Error("导出失败：时间轴为空");
	}

	const previousState = {
		isPlaying: timelineState.isPlaying,
		currentTime: timelineState.currentTime,
		previewTime: timelineState.previewTime,
		previewAxisEnabled: timelineState.previewAxisEnabled,
	};

	// 导出时先停掉播放与 hover 预览
	timelineState.pause();
	timelineState.setPreviewTime(null);

	let root: SkiaSGRoot | null = null;
	let surface: ReturnType<typeof Skia.Surface.MakeOffscreen> | null = null;

	try {
		await waitForStaticModelsReady(elements);

		const target = new BufferTarget();
		const output = new Output({
			format: new Mp4OutputFormat(),
			target,
		});
		const exportCanvas =
			typeof OffscreenCanvas !== "undefined"
				? new OffscreenCanvas(width, height)
				: (() => {
						const canvas = document.createElement("canvas");
						canvas.width = width;
						canvas.height = height;
						return canvas;
					})();
		const videoSource = new CanvasSource(exportCanvas, {
			codec: "avc",
			bitrate: QUALITY_HIGH,
		});
		output.addVideoTrack(videoSource, { frameRate: fps });
		await output.start();

		root = new SkiaSGRoot(Skia);
		surface = Skia.Surface.MakeOffscreen(width, height);
		if (!surface) {
			throw new Error("导出失败：无法创建离屏画布");
		}
		const skiaCanvas = surface.getCanvas();

		const ctx = ensure2DContext(exportCanvas);
		const reusableImageDataRef = { current: null as ImageData | null };
		const scratchCanvasRef = {
			current: null as HTMLCanvasElement | OffscreenCanvas | null,
		};

		for (let frame = startFrame; frame < endFrame; frame += 1) {
			timelineState.setCurrentTime(frame);

			const { children, visibleElements, transitionInfosById } =
				buildSkiaRenderState({
					elements,
					displayTime: frame,
					tracks,
					getTrackIndexForElement,
					sortByTrackIndex,
				});

			for (const element of visibleElements) {
				const store = modelRegistry.get(element.id);
				if (!store) continue;
				const transition = pickActiveTransition(
					transitionInfosById.get(element.id),
					frame,
				);
				await store.getState().prepareFrame?.({
					element,
					displayTime: frame,
					fps,
					renderTimeline: transition?.renderTimeline,
				});
			}

			await root.render(children);

			skiaCanvas.clear(Float32Array.of(0, 0, 0, 0));
			root.drawOnCanvas(skiaCanvas);
			surface.flush();
			const snapshot = surface.makeImageSnapshot();
			const image = snapshot.makeNonTextureImage();
			try {
				drawSkiaImageToCanvas(
					image,
					exportCanvas,
					ctx,
					reusableImageDataRef,
					scratchCanvasRef,
				);
			} finally {
				image.dispose();
				snapshot.dispose();
			}

			await videoSource.add(frame / fps, 1 / fps);
		}

		await output.finalize();
		if (!target.buffer) {
			throw new Error("导出失败：无法获取输出数据");
		}

		const blob = new Blob([target.buffer], { type: "video/mp4" });
		const filename = options?.filename ?? `timeline-${Date.now()}.mp4`;
		downloadBlob(blob, filename);
	} finally {
		// 导出结束后清理离屏资源，避免影响编辑器
		try {
			root?.unmount();
		} catch {}
		try {
			surface?.dispose();
		} catch {}
		if (previousState.isPlaying) {
			timelineState.play();
		} else {
			timelineState.pause();
		}
		timelineState.setPreviewAxisEnabled(previousState.previewAxisEnabled);
		timelineState.setPreviewTime(previousState.previewTime);
		timelineState.setCurrentTime(previousState.currentTime);
	}
};
