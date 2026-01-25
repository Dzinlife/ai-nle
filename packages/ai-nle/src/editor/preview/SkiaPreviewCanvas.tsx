import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas, type CanvasRef } from "react-skia-lite";
import type { TimelineElement } from "@/dsl/types";
import { useTimelineStore } from "@/editor/contexts/TimelineContext";
import type { TimelineTrack } from "@/editor/timeline/types";
import { buildSkiaTree } from "./buildSkiaTree";

interface SkiaPreviewCanvasProps {
	canvasWidth: number;
	canvasHeight: number;
	tracks: TimelineTrack[];
	getTrackIndexForElement: (element: TimelineElement) => number;
	sortByTrackIndex: (elements: TimelineElement[]) => TimelineElement[];
	getElements: () => TimelineElement[];
	getDisplayTime: () => number;
	canvasRef?: React.RefObject<CanvasRef | null>;
}

export const SkiaPreviewCanvas: React.FC<SkiaPreviewCanvasProps> = ({
	canvasWidth,
	canvasHeight,
	tracks,
	getTrackIndexForElement,
	sortByTrackIndex,
	getElements,
	getDisplayTime,
	canvasRef,
}) => {
	const internalCanvasRef = useRef<CanvasRef>(null);
	const targetCanvasRef = canvasRef ?? internalCanvasRef;
	const skiaRenderElementsRef = useRef<TimelineElement[]>([]);

	const renderSkia = useCallback(() => {
		const displayTime = getDisplayTime();
		const allElements = getElements();
		const { children, orderedElements: skiaElements } = buildSkiaTree({
			elements: allElements,
			displayTime,
			tracks,
			getTrackIndexForElement,
			sortByTrackIndex,
		});

		const prevSkiaElements = skiaRenderElementsRef.current;
		if (
			prevSkiaElements.length !== skiaElements.length ||
			skiaElements.some((el, i) => prevSkiaElements[i] !== el)
		) {
			skiaRenderElementsRef.current = skiaElements;
			targetCanvasRef.current?.getRoot()?.render(children);
		}
	}, [
		getDisplayTime,
		getElements,
		getTrackIndexForElement,
		sortByTrackIndex,
		tracks,
		targetCanvasRef,
	]);

	useEffect(() => {
		const unsub1 = useTimelineStore.subscribe(
			(state) => state.currentTime,
			renderSkia,
		);
		const unsub2 = useTimelineStore.subscribe(
			(state) => state.previewTime,
			renderSkia,
		);
		return () => {
			unsub1();
			unsub2();
		};
	}, [renderSkia]);

	useEffect(() => {
		return useTimelineStore.subscribe(
			(state) => state.elements,
			(newElements) => {
				const root = targetCanvasRef.current?.getRoot();
				if (!root) return;

				const time = getDisplayTime();
				const { children, orderedElements: skiaElements } = buildSkiaTree({
					elements: newElements,
					displayTime: time,
					tracks,
					getTrackIndexForElement,
					sortByTrackIndex,
				});
				root.render(children);
				skiaRenderElementsRef.current = skiaElements;
			},
			{
				fireImmediately: true,
			},
		);
	}, [
		getDisplayTime,
		getTrackIndexForElement,
		sortByTrackIndex,
		targetCanvasRef,
		tracks,
	]);

	const skiaCanvas = useMemo(() => {
		return (
			<Canvas
				style={{
					width: canvasWidth,
					height: canvasHeight,
					overflow: "hidden",
				}}
				ref={targetCanvasRef}
			/>
		);
	}, [canvasWidth, canvasHeight, targetCanvasRef]);

	return skiaCanvas;
};
