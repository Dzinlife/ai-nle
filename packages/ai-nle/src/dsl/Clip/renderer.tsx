import { useEffect, useRef } from "react";
import { Group, ImageShader, Rect } from "react-skia-lite";
import { useCurrentTime, useTimelineStore } from "@/editor/TimelineContext";
import { useModelSelector } from "../model/registry";
import type { ComponentProps } from "../types";
import { type ClipInternal, type ClipProps, calculateVideoTime } from "./model";

interface ClipRendererProps extends ComponentProps {
	id: string;
}

const ClipRenderer: React.FC<ClipRendererProps> = ({ id, __renderLayout }) => {
	// 从 Timeline context 获取当前时间
	const { currentTime } = useCurrentTime();

	// 直接从 TimelineStore 读取元素的 timeline 数据
	const timeline = useTimelineStore(
		(state) => state.elements.find((el) => el.id === id)?.timeline,
	);

	// 将中心坐标转换为左上角坐标
	const { cx, cy, w: width, h: height, rotation: rotate = 0 } = __renderLayout;
	const x = cx - width / 2;
	const y = cy - height / 2;

	// 订阅需要的状态
	const isLoading = useModelSelector<ClipProps, boolean>(
		id,
		(state) => state.constraints.isLoading ?? false,
	);
	const hasError = useModelSelector<ClipProps, boolean>(
		id,
		(state) => state.constraints.hasError ?? false,
	);
	const currentFrame = useModelSelector<
		ClipProps,
		ClipInternal["currentFrame"]
	>(id, (state) => (state.internal as unknown as ClipInternal).currentFrame);
	const props = useModelSelector<ClipProps, ClipProps>(
		id,
		(state) => state.props,
	);
	const videoDuration = useModelSelector<ClipProps, number>(
		id,
		(state) => (state.internal as unknown as ClipInternal).videoDuration,
	);
	const seekToTime = useModelSelector<ClipProps, ClipInternal["seekToTime"]>(
		id,
		(state) => (state.internal as unknown as ClipInternal).seekToTime,
	);

	// 用于节流 seek 的 refs
	const lastSeekTimeRef = useRef<number | null>(null);
	const animationFrameRef = useRef<number | null>(null);

	// 当 currentTime 变化时，更新显示的帧
	useEffect(() => {
		if (
			isLoading ||
			hasError ||
			!props.uri ||
			videoDuration <= 0 ||
			!timeline
		) {
			return;
		}

		// 从 timeline 读取 start
		const start = timeline.start;

		// 计算实际要 seek 的视频时间
		const videoTime = calculateVideoTime({
			start,
			timelineTime: currentTime,
			videoDuration,
			reversed: props.reversed,
		});

		// 如果时间变化太小，跳过（避免频繁 seek）
		if (
			lastSeekTimeRef.current !== null &&
			Math.abs(lastSeekTimeRef.current - videoTime) < 0.1
		) {
			return;
		}

		// 使用 requestAnimationFrame 节流
		if (animationFrameRef.current !== null) {
			cancelAnimationFrame(animationFrameRef.current);
		}

		animationFrameRef.current = requestAnimationFrame(() => {
			animationFrameRef.current = null;
			lastSeekTimeRef.current = videoTime;
			seekToTime(videoTime);
		});

		return () => {
			if (animationFrameRef.current !== null) {
				cancelAnimationFrame(animationFrameRef.current);
			}
		};
	}, [
		props.uri,
		props.reversed,
		timeline,
		videoDuration,
		isLoading,
		hasError,
		currentTime,
		seekToTime,
	]);

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

export default ClipRenderer;
