import type React from "react";
import type { ReactNode } from "react";
import { useEffect, useMemo } from "react";
import {
	FilterMode,
	Group,
	processUniforms,
	Rect,
	Skia,
	TileMode,
} from "react-skia-lite";
import type { TimelineElement } from "@/dsl/types";
import { useTimelineStore } from "@/editor/contexts/TimelineContext";
import type { TransitionProps } from "./model";
import { useSkPictureFromNode } from "./picture";

interface TransitionRendererProps extends TransitionProps {
	id: string;
	fromNode?: ReactNode;
	toNode?: ReactNode;
	progress?: number;
}

const FADE_SHADER_CODE = `
uniform shader preRoll;
uniform shader afterRoll;
uniform float progress;

half4 main(float2 xy) {
  half4 fromColor = preRoll.eval(xy);
  half4 toColor = afterRoll.eval(xy);
  return mix(fromColor, toColor, progress);
}
`;

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
	progress,
	id,
}) => {
	const currentTimeFrames = useTimelineStore((state) => {
		if (state.isPlaying) {
			return state.currentTime;
		}
		return state.previewTime ?? state.currentTime;
	});
	const transitionElement = useTimelineStore(
		(state) => state.getElementById(id)!,
	);

	const canvasSize = useTimelineStore((state) => state.canvasSize);
	const boundary = transitionElement?.timeline.start ?? 0;
	const transitionDuration = resolveTransitionDuration(transitionElement);
	const head = Math.floor(transitionDuration / 2);
	const start = boundary - head;

	const computedProgress =
		transitionDuration > 0
			? clampProgress((currentTimeFrames - start) / transitionDuration)
			: 0;
	const safeProgress =
		typeof progress === "number" && Number.isFinite(progress)
			? clampProgress(progress)
			: computedProgress;
	const fromOpacity = 1 - safeProgress;
	const toOpacity = safeProgress;

	const shaderSource = useMemo(() => {
		try {
			return Skia.RuntimeEffect.Make(FADE_SHADER_CODE);
		} catch (error) {
			console.error("Failed to create fade shader:", error);
			return null;
		}
	}, []);

	const width = canvasSize.width;
	const height = canvasSize.height;

	const preRollPicture = useSkPictureFromNode(
		fromNode ?? null,
		canvasSize,
		currentTimeFrames,
		{ syncKey: `${id}:from` },
	);
	const afterRollPicture = useSkPictureFromNode(
		toNode ?? null,
		canvasSize,
		currentTimeFrames,
		{ syncKey: `${id}:to` },
	);

	const blendShader = useMemo(() => {
		if (
			!shaderSource ||
			!preRollPicture ||
			!afterRollPicture ||
			width <= 0 ||
			height <= 0
		)
			return null;
		const bounds = { x: 0, y: 0, width, height };
		const fromShader = preRollPicture.makeShader(
			TileMode.Clamp,
			TileMode.Clamp,
			FilterMode.Linear,
			undefined,
			bounds,
		);
		const toShader = afterRollPicture.makeShader(
			TileMode.Clamp,
			TileMode.Clamp,
			FilterMode.Linear,
			undefined,
			bounds,
		);
		const uniforms = processUniforms(shaderSource, { progress: safeProgress });
		const shader = shaderSource.makeShaderWithChildren(uniforms, [
			fromShader,
			toShader,
		]);
		return { shader, children: [fromShader, toShader] };
	}, [
		afterRollPicture,
		preRollPicture,
		safeProgress,
		shaderSource,
		width,
		height,
	]);

	const paintBundle = useMemo(() => {
		if (!blendShader) return null;
		const paint = Skia.Paint();
		paint.setShader(blendShader.shader);
		return {
			paint,
			shader: blendShader.shader,
			children: blendShader.children,
		};
	}, [blendShader]);

	useEffect(() => {
		return () => {
			if (!paintBundle) return;
			paintBundle.shader.dispose();
			paintBundle.children.forEach((child) => child.dispose());
			paintBundle.paint.dispose();
		};
	}, [paintBundle]);

	const renderHardCut = () => {
		return <Group>{currentTimeFrames < boundary ? fromNode : toNode}</Group>;
	};

	if (paintBundle && preRollPicture && afterRollPicture) {
		return (
			<Group>
				<Rect
					x={0}
					y={0}
					width={width}
					height={height}
					paint={paintBundle.paint}
				/>
			</Group>
		);
	}

	return renderHardCut();
};

export default TransitionRenderer;
