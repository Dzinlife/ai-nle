import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import {
	ALL_FORMATS,
	CanvasSink,
	Input,
	UrlSource,
	type WrappedCanvas,
} from "mediabunny";
import { Skia, type SkImage } from "react-skia-lite";
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
): ComponentModelStore<ClipProps> {
	// 用于取消异步操作
	let asyncId = 0;
	let isSeekingFlag = false;
	let lastSeekTime: number | null = null;
	let videoFrameIterator: AsyncGenerator<WrappedCanvas, void, unknown> | null =
		null;

	const store = createStore<ComponentModel<ClipProps>>()(
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
			} as ClipInternal,

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
						} as ClipInternal,
					}));

					// 初始化完成后，seek 到初始位置
					const { start, reversed } = get().props;
					const videoTime = calculateVideoTime({
						start,
						timelineTime: start, // 初始时显示开始位置
						videoDuration: duration,
						reversed,
					});

					await seekToTime(get, set, videoTime);
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

				// 清理资源
				internal.videoSink = null;
				internal.input = null;
			},
		})),
	);

	// Seek 到指定时间的辅助函数
	async function seekToTime(
		get: () => ComponentModel<ClipProps>,
		set: (
			fn: (state: ComponentModel<ClipProps>) => Partial<ComponentModel<ClipProps>>,
		) => void,
		seconds: number,
	): Promise<void> {
		const internal = get().internal as ClipInternal;
		const { videoSink } = internal;

		if (!videoSink) return;

		// 防止并发 seek
		if (isSeekingFlag) return;
		if (lastSeekTime === seconds) return;

		isSeekingFlag = true;
		asyncId++;
		const currentAsyncId = asyncId;

		try {
			// 清理旧的迭代器
			const oldIterator = videoFrameIterator;
			videoFrameIterator = null;
			await oldIterator?.return?.();

			if (currentAsyncId !== asyncId) return;

			// 创建新的迭代器
			const iterator = videoSink.canvases(seconds);
			videoFrameIterator = iterator;

			// 获取第一帧
			const firstFrame = (await iterator.next()).value ?? null;

			if (currentAsyncId !== asyncId) return;

			if (firstFrame) {
				const canvas = firstFrame.canvas;
				if (
					canvas instanceof HTMLCanvasElement ||
					canvas instanceof OffscreenCanvas
				) {
					// 复制 canvas 内容
					const imageBitmap = await createImageBitmap(canvas);
					const skiaImage = Skia.Image.MakeImageFromNativeBuffer(imageBitmap);

					if (skiaImage) {
						set((state) => ({
							internal: {
								...state.internal,
								currentFrame: skiaImage,
								isReady: true,
							} as ClipInternal,
						}));
					}

					lastSeekTime = seconds;
				}
			}

			// 关闭迭代器
			await iterator.return?.();
			if (videoFrameIterator === iterator) {
				videoFrameIterator = null;
			}
		} catch (err) {
			console.warn("Seek failed:", err);
		} finally {
			isSeekingFlag = false;
		}
	}

	// 暴露 seekToTime 方法（挂载到 store 上）
	(store as any).seekToTime = (seconds: number) =>
		seekToTime(store.getState, store.setState, seconds);

	return store;
}

// 扩展 store 类型以包含 seekToTime
export type ClipModelStore = ComponentModelStore<ClipProps> & {
	seekToTime: (seconds: number) => Promise<void>;
};
