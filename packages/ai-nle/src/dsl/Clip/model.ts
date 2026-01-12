import {
	ALL_FORMATS,
	CanvasSink,
	Input,
	UrlSource,
	type WrappedCanvas,
} from "mediabunny";
import { type SkImage, Skia } from "react-skia-lite";
import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type {
	ComponentModel,
	ComponentModelStore,
	ValidationResult,
} from "../model/types";

// Clip Props 类型
export interface ClipProps {
	uri?: string;
	reversed?: boolean;
	start: number;
	end: number;
}

// Clip 内部状态
export interface ClipInternal {
	videoSink: CanvasSink | null;
	input: Input | null;
	currentFrame: SkImage | null;
	videoDuration: number;
	isReady: boolean;
	// 缩略图（用于时间线预览）
	thumbnailCanvas: HTMLCanvasElement | null;
	// 帧缓存
	frameCache: Map<number, SkImage>;
	// seek 方法（用于拖动/跳转）
	seekToTime: (seconds: number) => Promise<void>;
	// 开始流式播放
	startPlayback: (startTime: number) => Promise<void>;
	// 获取下一帧（流式播放时调用）
	getNextFrame: (targetTime: number) => Promise<void>;
	// 停止流式播放
	stopPlayback: () => void;
}

// 计算实际要 seek 的视频时间（考虑倒放）
export const calculateVideoTime = ({
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
	const relativeTime = timelineTime - start;

	if (reversed) {
		return Math.max(0, videoDuration - relativeTime);
	} else {
		return relativeTime;
	}
};

// 创建 Clip Model
export function createClipModel(
	id: string,
	initialProps: ClipProps,
): ComponentModelStore<ClipProps, ClipInternal> {
	// 用于取消异步操作
	let asyncId = 0;
	let isSeekingFlag = false;
	let lastSeekTime: number | null = null;
	let videoFrameIterator: AsyncGenerator<WrappedCanvas, void, unknown> | null =
		null;

	// 流式播放状态
	let isPlaybackActive = false;
	let nextFrame: WrappedCanvas | null = null;

	// 帧缓存配置
	const MAX_CACHE_SIZE = 50;
	const FRAME_INTERVAL = 0.1; // 缓存精度：0.1秒

	// 帧缓存
	const frameCache = new Map<number, SkImage>();
	const cacheAccessOrder: number[] = []; // LRU 顺序

	// 将时间戳对齐到缓存精度
	const alignTime = (time: number): number => {
		return Math.round(time / FRAME_INTERVAL) * FRAME_INTERVAL;
	};

	// 更新 LRU 顺序
	const updateCacheAccess = (key: number) => {
		const index = cacheAccessOrder.indexOf(key);
		if (index > -1) {
			cacheAccessOrder.splice(index, 1);
		}
		cacheAccessOrder.push(key);
	};

	// 清理过期缓存
	const cleanupCache = () => {
		while (frameCache.size > MAX_CACHE_SIZE && cacheAccessOrder.length > 0) {
			const oldestKey = cacheAccessOrder.shift();
			if (oldestKey !== undefined) {
				frameCache.delete(oldestKey);
			}
		}
	};

	// 将 canvas 转换为 SkImage
	const canvasToSkImage = async (
		canvas: HTMLCanvasElement | OffscreenCanvas,
	): Promise<SkImage | null> => {
		try {
			const imageBitmap = await createImageBitmap(canvas);
			return Skia.Image.MakeImageFromNativeBuffer(imageBitmap);
		} catch (err) {
			console.warn("Canvas to SkImage failed:", err);
			return null;
		}
	};

	// 更新当前帧
	const updateCurrentFrame = (skiaImage: SkImage, timestamp?: number) => {
		// 存入缓存
		if (timestamp !== undefined) {
			const alignedTime = alignTime(timestamp);
			if (!frameCache.has(alignedTime)) {
				frameCache.set(alignedTime, skiaImage);
				updateCacheAccess(alignedTime);
				cleanupCache();
			}
		}

		store.setState((state) => ({
			...state,
			internal: {
				...state.internal,
				currentFrame: skiaImage,
				isReady: true,
			},
		}));
	};

	// 开始流式播放
	const startPlayback = async (startTime: number): Promise<void> => {
		const { internal } = store.getState();
		const { videoSink } = internal;

		if (!videoSink || isPlaybackActive) return;

		// 停止之前的迭代器
		await videoFrameIterator?.return?.();

		isPlaybackActive = true;
		asyncId++;
		const currentAsyncId = asyncId;

		try {
			// 创建新的迭代器
			videoFrameIterator = videoSink.canvases(startTime);

			// 获取第一帧
			const firstFrameResult = await videoFrameIterator.next();
			if (currentAsyncId !== asyncId) return;

			const firstFrame = firstFrameResult.value ?? null;
			if (firstFrame) {
				const canvas = firstFrame.canvas;
				if (
					canvas instanceof HTMLCanvasElement ||
					canvas instanceof OffscreenCanvas
				) {
					const skiaImage = await canvasToSkImage(canvas);
					if (skiaImage && currentAsyncId === asyncId) {
						updateCurrentFrame(skiaImage, firstFrame.timestamp);
					}
				}
			}

			// 预读下一帧
			const secondFrameResult = await videoFrameIterator.next();
			if (currentAsyncId !== asyncId) return;
			nextFrame = secondFrameResult.value ?? null;
		} catch (err) {
			console.warn("Start playback failed:", err);
			isPlaybackActive = false;
		}
	};

	// 获取下一帧（流式播放时调用）
	const getNextFrame = async (targetTime: number): Promise<void> => {
		if (!isPlaybackActive || !videoFrameIterator) return;

		const currentAsyncId = asyncId;

		try {
			// 跳过时间戳小于目标时间的帧
			let frameToShow: WrappedCanvas | null = null;

			while (nextFrame && nextFrame.timestamp <= targetTime) {
				frameToShow = nextFrame;

				// 获取下一帧
				const result = await videoFrameIterator.next();
				if (currentAsyncId !== asyncId) return;

				nextFrame = result.value ?? null;
				if (!nextFrame) break; // 迭代器结束
			}

			// 显示找到的帧
			if (frameToShow) {
				const canvas = frameToShow.canvas;
				if (
					canvas instanceof HTMLCanvasElement ||
					canvas instanceof OffscreenCanvas
				) {
					const skiaImage = await canvasToSkImage(canvas);
					if (skiaImage && currentAsyncId === asyncId) {
						updateCurrentFrame(skiaImage, frameToShow.timestamp);
					}
				}
			}
		} catch (err) {
			console.warn("Get next frame failed:", err);
		}
	};

	// 停止流式播放
	const stopPlayback = () => {
		isPlaybackActive = false;
		nextFrame = null;
		videoFrameIterator?.return?.();
		videoFrameIterator = null;
	};

	// Seek 到指定时间的方法（用于拖动/跳转）
	const seekToTime = async (seconds: number): Promise<void> => {
		const { internal } = store.getState();
		const { videoSink } = internal;

		if (!videoSink) return;

		// 如果正在流式播放，先停止
		if (isPlaybackActive) {
			stopPlayback();
		}

		// 防止并发 seek
		if (isSeekingFlag) return;
		if (lastSeekTime === seconds) return;

		const alignedTime = alignTime(seconds);

		// 检查缓存
		const cachedFrame = frameCache.get(alignedTime);
		if (cachedFrame) {
			updateCacheAccess(alignedTime);
			store.setState((state) => ({
				...state,
				internal: {
					...state.internal,
					currentFrame: cachedFrame,
					isReady: true,
				},
			}));
			lastSeekTime = seconds;
			return;
		}

		isSeekingFlag = true;
		asyncId++;
		const currentAsyncId = asyncId;

		try {
			// 创建临时迭代器获取帧
			const iterator = videoSink.canvases(seconds);
			const firstFrame = (await iterator.next()).value ?? null;
			await iterator.return?.();

			if (currentAsyncId !== asyncId) return;

			if (firstFrame) {
				const canvas = firstFrame.canvas;
				if (
					canvas instanceof HTMLCanvasElement ||
					canvas instanceof OffscreenCanvas
				) {
					const skiaImage = await canvasToSkImage(canvas);
					if (skiaImage && currentAsyncId === asyncId) {
						updateCurrentFrame(skiaImage, seconds);
						lastSeekTime = seconds;
					}
				}
			}
		} catch (err) {
			console.warn("Seek failed:", err);
		} finally {
			isSeekingFlag = false;
		}
	};

	const store = createStore<ComponentModel<ClipProps, ClipInternal>>()(
		subscribeWithSelector((set, get) => ({
			id,
			type: "Clip",
			props: initialProps,
			constraints: {
				isLoading: true,
				canTrimStart: true,
				canTrimEnd: true,
			},
			internal: {
				videoSink: null,
				input: null,
				currentFrame: null,
				videoDuration: 0,
				isReady: false,
				thumbnailCanvas: null,
				frameCache,
				seekToTime,
				startPlayback,
				getNextFrame,
				stopPlayback,
			} satisfies ClipInternal,

			setProps: (partial) => {
				const result = get().validate(partial);
				if (result.valid) {
					set((state) => ({
						props: { ...state.props, ...partial },
					}));
				} else if (result.corrected) {
					// 使用修正后的值
					set((state) => ({
						props: { ...state.props, ...result.corrected },
					}));
				}
				return result;
			},

			setConstraints: (partial) => {
				set((state) => ({
					constraints: { ...state.constraints, ...partial },
				}));
			},

			setInternal: (partial) => {
				set((state) => ({
					internal: { ...state.internal, ...partial },
				}));
			},

			validate: (newProps) => {
				const { constraints, props } = get();
				const errors: string[] = [];
				let corrected: Record<string, unknown> | undefined;

				const start = newProps.start ?? props.start;
				const end = newProps.end ?? props.end;

				// 验证 start < end
				if (start >= end) {
					errors.push("Start must be less than end");
				}

				// 验证时长不超过视频原始时长
				if (constraints.maxDuration !== undefined) {
					const duration = end - start;

					if (duration > constraints.maxDuration) {
						errors.push(
							`Duration cannot exceed ${constraints.maxDuration.toFixed(2)}s`,
						);
						// 提供修正值
						corrected = {
							...newProps,
							end: start + constraints.maxDuration,
						};
					}
				}

				return {
					valid: errors.length === 0,
					errors,
					corrected,
				};
			},

			init: async () => {
				const { props } = get();
				const { uri } = props;

				if (!uri) {
					set((state) => ({
						constraints: {
							...state.constraints,
							isLoading: false,
							hasError: true,
							errorMessage: "No URI provided",
						},
					}));
					return;
				}

				asyncId++;
				const currentAsyncId = asyncId;

				try {
					// 创建 Input
					const source = new UrlSource(uri);
					const input = new Input({
						source,
						formats: ALL_FORMATS,
					});

					// 获取视频时长
					const duration = await input.computeDuration();

					// 检查是否被取消
					if (currentAsyncId !== asyncId) return;

					// 获取视频轨道
					let videoTrack = await input.getPrimaryVideoTrack();

					if (videoTrack) {
						if (videoTrack.codec === null) {
							videoTrack = null;
						} else if (!(await videoTrack.canDecode())) {
							videoTrack = null;
						}
					}

					if (!videoTrack) {
						throw new Error("No valid video track found");
					}

					// 检查是否被取消
					if (currentAsyncId !== asyncId) return;

					// 创建视频 Sink
					const videoCanBeTransparent = await videoTrack.canBeTransparent();
					const videoSink = new CanvasSink(videoTrack, {
						poolSize: 2,
						fit: "contain",
						alpha: videoCanBeTransparent,
					});

					// 更新状态
					set((state) => ({
						constraints: {
							...state.constraints,
							isLoading: false,
							maxDuration: duration,
						},
						internal: {
							...state.internal,
							videoSink,
							input,
							videoDuration: duration,
						},
					}));

					// 初始化完成后，seek 到初始位置
					const { start, reversed } = get().props;
					const videoTime = calculateVideoTime({
						start,
						timelineTime: start, // 初始时显示开始位置
						videoDuration: duration,
						reversed,
					});

					await seekToTime(videoTime);
				} catch (error) {
					if (currentAsyncId !== asyncId) return;

					set((state) => ({
						constraints: {
							...state.constraints,
							isLoading: false,
							hasError: true,
							errorMessage:
								error instanceof Error ? error.message : "Unknown error",
						},
					}));
				}
			},

			dispose: () => {
				asyncId++; // 取消所有进行中的异步操作
				const internal = get().internal as ClipInternal;

				// 清理迭代器
				videoFrameIterator?.return?.();
				videoFrameIterator = null;

				// 清理帧缓存
				frameCache.clear();
				cacheAccessOrder.length = 0;

				// 清理资源
				internal.videoSink = null;
				internal.input = null;
			},
		})),
	);

	return store;
}
