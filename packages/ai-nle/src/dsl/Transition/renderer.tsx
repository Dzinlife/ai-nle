import type React from "react";
import type { ReactNode } from "react";
import { Group } from "react-skia-lite";
import { useTimelineStore } from "@/editor/contexts/TimelineContext";
import type { TimelineElement } from "@/dsl/types";
import type { TransitionProps } from "./model";

interface TransitionRendererProps extends TransitionProps {
	id: string;
	fromNode?: ReactNode;
	toNode?: ReactNode;
	progress?: number;
}

const clampProgress = (value: number): number => {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
};

const DEFAULT_TRANSITION_DURATION = 15;

const resolveTransitionDuration = (
	element: TimelineElement | undefined,
): number => {
	if (!element) return DEFAULT_TRANSITION_DURATION;
	const metaDuration = element.transition?.duration;
	const legacyDuration =
		typeof (element.props as { duration?: number } | undefined)?.duration ===
		"number"
			? (element.props as { duration?: number }).duration
			: undefined;
	const value = metaDuration ?? legacyDuration ?? DEFAULT_TRANSITION_DURATION;
	if (!Number.isFinite(value)) return DEFAULT_TRANSITION_DURATION;
	return Math.max(0, Math.round(value));
};

const TransitionRenderer: React.FC<TransitionRendererProps> = ({
	fromNode,
	toNode,
	progress = 0,
	id,
}) => {
	if (!fromNode && !toNode) return null;
	const currentTimeFrames = useTimelineStore((state) => {
		if (state.isPlaying) {
			return state.currentTime;
		}
		return state.previewTime ?? state.currentTime;
	});
	const transitionElement = useTimelineStore((state) =>
		state.elements.find((el) => el.id === id),
	);
	const boundary = transitionElement?.timeline.start ?? 0;
	const transitionDuration = resolveTransitionDuration(transitionElement);
	const head = Math.floor(transitionDuration / 2);
	const start = boundary - head;
	const safeProgress =
		transitionDuration > 0
			? clampProgress((currentTimeFrames - start) / transitionDuration)
			: clampProgress(progress);
	const fromOpacity = 1 - safeProgress;
	const toOpacity = safeProgress;

	return (
		<Group>
			{fromNode && <Group opacity={fromOpacity}>{fromNode}</Group>}
			{/* 使用 plus 避免叠加时再次衰减底图 */}
			{toNode && (
				<Group opacity={toOpacity} blendMode="plus">
					{toNode}
				</Group>
			)}
		</Group>
	);
};

export default TransitionRenderer;
