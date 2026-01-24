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

		const startSeconds = framesToSeconds(activeTimeline.start, fps);
		const currentSeconds = framesToSeconds(currentTimeFrames, fps);
		const clipDurationSeconds = framesToSeconds(
			activeTimeline.end - activeTimeline.start,
			fps,
		);
		const offsetSeconds = framesToSeconds(activeTimeline?.offset ?? 0, fps);

		// 计算实际要 seek 的视频时间
		const videoTime = calculateVideoTime({
			start: startSeconds,
			timelineTime: currentSeconds,
			videoDuration,
			reversed: props.reversed,
			offset: offsetSeconds,
			clipDuration: clipDurationSeconds,
		});

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
