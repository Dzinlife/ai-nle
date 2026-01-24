import { useEffect, useRef } from "react";
import { Group, ImageShader, Rect } from "react-skia-lite";
import {
	useFps,
	usePlaybackControl,
	useTimelineStore,
} from "@/editor/contexts/TimelineContext";
import { createModelSelector } from "../model/registry";
import { useRenderLayout } from "../useRenderLayout";
import {
	type VideoClipInternal,
	type VideoClipProps,
	calculateVideoTime,
} from "./model";
import { framesToSeconds } from "@/utils/timecode";

interface VideoClipRendererProps extends VideoClipProps {
	id: string;
	renderTimeline?: {
		start: number;
		end: number;
		offset?: number;
	};
}

const useVideoClipSelector =
	createModelSelector<VideoClipProps, VideoClipInternal>();

const VideoClipRenderer: React.FC<VideoClipRendererProps> = ({
	id,
	renderTimeline,
}) => {
	// 播放时使用真正的 currentTime，非播放时使用 previewTime ?? currentTime
	const currentTimeFrames = useTimelineStore((state) => {
		if (state.isPlaying) {
			return state.currentTime;
		}
		return state.previewTime ?? state.currentTime;
	});
	const { fps } = useFps();
	const { isPlaying } = usePlaybackControl();
	const forceSeek = renderTimeline !== undefined;

	// 直接从 TimelineStore 读取元素的 timeline 数据
	const timeline = useTimelineStore(
		(state) => state.elements.find((el) => el.id === id)?.timeline,
	);
	const activeTimeline = renderTimeline ?? timeline;

	// 将中心坐标转换为左上角坐标
	const { cx, cy, w: width, h: height, rotation: rotate = 0 } =
		useRenderLayout(id);
	const x = cx - width / 2;
	const y = cy - height / 2;

	// 订阅需要的状态
	const isLoading = useVideoClipSelector(
		id,
		(state) => state.constraints.isLoading ?? false,
	);
	const hasError = useVideoClipSelector(
		id,
		(state) => state.constraints.hasError ?? false,
	);
	const currentFrame = useVideoClipSelector(
		id,
		(state) => state.internal.currentFrame,
	);
	const playbackEpoch = useVideoClipSelector(
		id,
		(state) => state.internal.playbackEpoch ?? 0,
	);
	const props = useVideoClipSelector(id, (state) => state.props);
	const videoDuration = useVideoClipSelector(
		id,
		(state) => state.internal.videoDuration,
	);
	const seekToTime = useVideoClipSelector(
		id,
		(state) => state.internal.seekToTime,
	);
	const startPlayback = useVideoClipSelector(
		id,
		(state) => state.internal.startPlayback,
	);
	const getNextFrame = useVideoClipSelector(
		id,
		(state) => state.internal.getNextFrame,
	);
	const stopPlayback = useVideoClipSelector(
		id,
		(state) => state.internal.stopPlayback,
	);

	// 跟踪播放状态
	const wasPlayingRef = useRef(false);
	const lastVideoTimeRef = useRef<number | null>(null);
	const lastPlaybackTimeRef = useRef<number | null>(null); // 追踪播放时的时间

	useEffect(() => {
		// sink 切换后重置播放状态，确保重新启动流式播放
		wasPlayingRef.current = false;
		lastPlaybackTimeRef.current = null;
		lastVideoTimeRef.current = null;
	}, [playbackEpoch]);

	// 处理播放状态变化
	useEffect(() => {
		if (
			isLoading ||
			hasError ||
			!props.uri ||
			videoDuration <= 0 ||
			!activeTimeline
		) {
			return;
		}

		const safeFps = Number.isFinite(fps) && fps > 0 ? Math.round(fps) : 30;
		const startSeconds =
			renderTimeline !== undefined
				? activeTimeline.start / safeFps
				: framesToSeconds(activeTimeline.start, safeFps);
		const currentSeconds = framesToSeconds(currentTimeFrames, fps);
		const clipDurationSeconds =
			renderTimeline !== undefined
				? (activeTimeline.end - activeTimeline.start) / safeFps
				: framesToSeconds(activeTimeline.end - activeTimeline.start, safeFps);
		const offsetSeconds =
			renderTimeline !== undefined
				? (activeTimeline?.offset ?? 0) / safeFps
				: framesToSeconds(activeTimeline?.offset ?? 0, safeFps);

		// 计算实际要 seek 的视频时间
		const videoTime = calculateVideoTime({
			start: startSeconds,
			timelineTime: currentSeconds,
			videoDuration,
			reversed: props.reversed,
			offset: offsetSeconds,
			clipDuration: clipDurationSeconds,
		});

		// 转场渲染期间强制走 seek，避免流式播放导致闪烁
		if (forceSeek) {
			if (wasPlayingRef.current) {
				wasPlayingRef.current = false;
				lastPlaybackTimeRef.current = null;
				stopPlayback();
			}

			if (
				lastVideoTimeRef.current !== null &&
				Math.abs(lastVideoTimeRef.current - videoTime) < 0.05
			) {
				return;
			}
			lastVideoTimeRef.current = videoTime;
			seekToTime(videoTime);
			return;
		}

		// 播放状态变化：从暂停到播放
		if (isPlaying && !wasPlayingRef.current) {
			wasPlayingRef.current = true;
			lastPlaybackTimeRef.current = videoTime;
			startPlayback(videoTime);
			return;
		}

		// 播放状态变化：从播放到暂停
		if (!isPlaying && wasPlayingRef.current) {
			wasPlayingRef.current = false;
			lastPlaybackTimeRef.current = null;
			stopPlayback();
			return;
		}

		// 播放中：检测是否需要重新 seek（时间跳跃）
		if (isPlaying) {
			const lastTime = lastPlaybackTimeRef.current;
			// 如果时间向后跳跃（seek 到更早的位置），需要重新启动播放
			if (lastTime !== null && videoTime < lastTime - 0.1) {
				// 重新启动播放
				stopPlayback();
				startPlayback(videoTime);
			} else {
				getNextFrame(videoTime);
			}
			lastPlaybackTimeRef.current = videoTime;
			return;
		}

		// 非播放状态：使用 seek（拖动时间轴）
		if (
			lastVideoTimeRef.current !== null &&
			Math.abs(lastVideoTimeRef.current - videoTime) < 0.05
		) {
			return; // 时间变化太小，跳过
		}

		lastVideoTimeRef.current = videoTime;
		seekToTime(videoTime);
	}, [
		props.uri,
		props.reversed,
		activeTimeline,
		forceSeek,
		videoDuration,
		isLoading,
		hasError,
		currentTimeFrames,
		fps,
		isPlaying,
		seekToTime,
		startPlayback,
		getNextFrame,
		stopPlayback,
	]);

	// 组件卸载时停止播放
	useEffect(() => {
		return () => {
			stopPlayback();
		};
	}, [stopPlayback]);

	// Loading 状态
	if (isLoading) {
		return (
			<Group>
				<Rect x={x} y={y} width={width} height={height} color="#e5e7eb" />
			</Group>
		);
	}

	// Error 状态
	if (hasError) {
		return (
			<Group>
				<Rect x={x} y={y} width={width} height={height} color="#fee2e2" />
			</Group>
		);
	}

	// 正常渲染
	return (
		<Group>
			<Rect
				x={x}
				y={y}
				width={width}
				height={height}
				color={currentFrame ? undefined : "transparent"}
				transform={[{ rotate }]}
				origin={{ x, y }}
			>
				{currentFrame && (
					<ImageShader
						image={currentFrame}
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

export default VideoClipRenderer;
