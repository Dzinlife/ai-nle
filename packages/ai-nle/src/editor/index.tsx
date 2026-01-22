import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModelManager } from "@/dsl/model";
import { TimelineElement, TrackRole } from "@/dsl/types";
import { Toaster } from "@/components/ui/sonner";
import { clampFrame, secondsToFrames } from "@/utils/timecode";
import ElementSettingsPanel from "./components/ElementSettingsPanel";
import PreviewProvider from "./contexts/PreviewProvider";
import {
	TimelineProvider,
	useAttachments,
	useFps,
	useMainTrackMagnet,
	useTimelineStore,
} from "./contexts/TimelineContext";
import MaterialLibrary, { type MaterialItem } from "./MaterialLibrary";
import PreviewEditor from "./PreviewEditor";
import TimelineEditor from "./TimelineEditor";
import type { TimelineTrack } from "./timeline/types";
import timelineData from "./timeline.json";
import { loadTimelineFromObject } from "./timelineLoader";
import {
	finalizeTimelineElements,
	insertElementIntoMainTrack,
} from "./utils/mainTrackMagnet";
import { buildTimelineMeta } from "./utils/timelineTime";
import {
	findAvailableTrack,
	getElementRole,
	getStoredTrackAssignments,
	getTrackCount,
} from "./utils/trackAssignment";
import { isTransitionElement } from "./utils/transitions";

// 导入所有组件以触发注册
import "@/dsl/BackdropZoom";
import "@/dsl/Clip";
import "@/dsl/CloudBackground";
import "@/dsl/ColorFilterLayer";
import "@/dsl/Image";
import "@/dsl/Lottie";
import "@/dsl/SeaWave";
import "@/dsl/Transition";

// 调试：检查组件注册情况
import { componentRegistry } from "@/dsl/model/componentRegistry";

console.log("[Editor] Registered components:", componentRegistry.getTypes());

const getMaterialRole = (item: MaterialItem): TrackRole => {
	switch (item.type) {
		case "audio":
			return "audio";
		case "text":
			return "overlay";
		case "transition":
			return "clip";
		default:
			return "clip";
	}
};

const DEFAULT_TRANSITION_DURATION_FRAMES = 15;

const resolveTransitionDrop = (
	elements: TimelineElement[],
	trackIndex: number,
	boundary: number,
) => {
	if (trackIndex !== 0) return null;
	const clips = elements
		.filter(
			(el) =>
				(el.timeline.trackIndex ?? 0) === 0 &&
				getElementRole(el) === "clip" &&
				!isTransitionElement(el),
		)
		.sort((a, b) => {
			if (a.timeline.start !== b.timeline.start) {
				return a.timeline.start - b.timeline.start;
			}
			if (a.timeline.end !== b.timeline.end) {
				return a.timeline.end - b.timeline.end;
			}
			return a.id.localeCompare(b.id);
		});

	for (let i = 0; i < clips.length - 1; i += 1) {
		const prev = clips[i];
		const next = clips[i + 1];
		if (prev.timeline.end !== next.timeline.start) continue;
		if (prev.timeline.end !== boundary) continue;
		const hasExisting = elements.some(
			(el) =>
				isTransitionElement(el) &&
				(el.timeline.trackIndex ?? 0) === 0 &&
				(el.timeline.start === boundary ||
					(((el.props as { fromId?: string; toId?: string })?.fromId ??
						"") === prev.id &&
						((el.props as { fromId?: string; toId?: string })?.toId ??
							"") === next.id)),
		);
		if (hasExisting) return null;
		return { fromId: prev.id, toId: next.id };
	}

	return null;
};

// 内部编辑器内容组件（可以使用 hooks）
const EditorContent: React.FC = () => {
	const setElements = useTimelineStore((state) => state.setElements);
	const currentTime = useTimelineStore((state) => state.currentTime);
	const { fps } = useFps();
	const { attachments, autoAttach } = useAttachments();
	const { mainTrackMagnetEnabled } = useMainTrackMagnet();

	// Timeline 高度状态和拖拽逻辑
	const [timelineMaxHeight, setTimelineMaxHeight] = useState(300);
	const isDraggingRef = useRef(false);
	const startYRef = useRef(0);
	const startHeightRef = useRef(0);

	const handleResizeMouseDown = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			isDraggingRef.current = true;
			startYRef.current = e.clientY;
			startHeightRef.current = timelineMaxHeight;

			const handleMouseMove = (e: MouseEvent) => {
				if (!isDraggingRef.current) return;
				const delta = startYRef.current - e.clientY;
				const newHeight = Math.max(
					100,
					Math.min(600, startHeightRef.current + delta),
				);
				setTimelineMaxHeight(newHeight);
			};

			const handleMouseUp = () => {
				isDraggingRef.current = false;
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[timelineMaxHeight],
	);

	// 处理素材库拖拽放置到时间线
	const handleTimelineDrop = useCallback(
		(
			item: MaterialItem,
			trackIndex: number,
			time: number,
			dropTargetType: "track" | "gap" = "track",
		) => {
			setElements((prev) => {
				const startFrame = clampFrame(time);

				const postProcessOptions = {
					mainTrackMagnetEnabled,
					attachments,
					autoAttach,
					fps,
				};

				if (item.type === "transition") {
					if (dropTargetType === "gap") return prev;
					const link = resolveTransitionDrop(prev, trackIndex, startFrame);
					if (!link) return prev;
					const durationFrames =
						Number.isFinite(item.duration) && (item.duration ?? 0) > 0
							? (item.duration as number)
							: DEFAULT_TRANSITION_DURATION_FRAMES;
					const newTransition: TimelineElement = {
						id: `transition-${Date.now()}`,
						type: "Transition",
						name: item.name,
						props: {
							fromId: link.fromId,
							toId: link.toId,
						},
						transition: {
							duration: durationFrames,
						},
						transform: {
							centerX: 0,
							centerY: 0,
							width: 1920,
							height: 1080,
							rotation: 0,
						},
						timeline: buildTimelineMeta(
							{
								start: startFrame,
								end: startFrame,
								trackIndex: 0,
								role: "clip",
							},
							fps,
						),
						render: {
							zIndex: 1,
							visible: true,
							opacity: 1,
						},
					};

					return finalizeTimelineElements(
						[...prev, newTransition],
						postProcessOptions,
					);
				}

				const durationFrames = secondsToFrames(5, fps);
				const role = getMaterialRole(item);
				const insertIndex =
					dropTargetType === "gap" ? Math.max(1, trackIndex) : trackIndex;
				const newElement: TimelineElement = {
					id: `element-${Date.now()}`,
					type: "Image" as const,
					name: item.name,
					props: {
						uri: item.uri,
					},
					transform: {
						centerX: 0,
						centerY: 0,
						width: item.width ?? 1920,
						height: item.height ?? 1080,
						rotation: 0,
					},
					timeline: buildTimelineMeta(
						{
							start: startFrame,
							end: startFrame + durationFrames,
							trackIndex: insertIndex,
							role,
						},
						fps,
					),
					render: {
						zIndex: 0,
						visible: true,
						opacity: 1,
					},
				};

				if (dropTargetType === "gap") {
					// gap 投放需要插入新轨道，先整体下移后续轨道索引
					const shifted = prev.map((el) => {
						const currentTrack = el.timeline.trackIndex ?? 0;
						if (currentTrack >= insertIndex) {
							return {
								...el,
								timeline: {
									...el.timeline,
									trackIndex: currentTrack + 1,
								},
							};
						}
						return el;
					});
					return finalizeTimelineElements(
						[...shifted, newElement],
						postProcessOptions,
					);
				}

				// 主轨开启磁吸时，插入逻辑交给主轨处理以保持连续性
				if (mainTrackMagnetEnabled && trackIndex === 0) {
					return insertElementIntoMainTrack(
						prev,
						newElement.id,
						startFrame,
						postProcessOptions,
						newElement,
					);
				}

				return finalizeTimelineElements(
					[...prev, newElement],
					postProcessOptions,
				);
			});
		},
		[setElements, mainTrackMagnetEnabled, attachments, autoAttach, fps],
	);

	// 处理素材库拖拽放置到预览画布
	const handlePreviewDrop = useCallback(
		(item: MaterialItem, canvasX: number, canvasY: number) => {
			const elementWidth = item.width ?? 400;
			const elementHeight = item.height ?? 300;
			const role = getMaterialRole(item);

			setElements((prev) => {
				const durationFrames = secondsToFrames(5, fps);
				const startFrame = clampFrame(currentTime);
				const endFrame = startFrame + durationFrames;
				const newId = `element-${Date.now()}`;
				const trackAssignments = getStoredTrackAssignments(prev);
				const trackCount = getTrackCount(trackAssignments);
				// 预览投放默认落在非主轨，避免主轨磁吸造成意外移动
				const targetTrackIndex = 1; // 预览投放默认非主轨
				const finalTrack = findAvailableTrack(
					startFrame,
					endFrame,
					targetTrackIndex,
					role,
					prev,
					trackAssignments,
					newId,
					trackCount,
				);
				const newElement: TimelineElement = {
					id: newId,
					type: "Image" as const,
					name: item.name,
					props: {
						uri: item.uri,
					},
					transform: {
						centerX: canvasX,
						centerY: canvasY,
						width: elementWidth,
						height: elementHeight,
						rotation: 0,
					},
					timeline: buildTimelineMeta(
						{
							start: startFrame,
							end: endFrame,
							trackIndex: finalTrack,
							role,
						},
						fps,
					),
					render: {
						zIndex: 0,
						visible: true,
						opacity: 1,
					},
				};

				return [...prev, newElement];
			});
		},
		[setElements, currentTime, fps],
	);

	return (
		<div className="relative flex flex-col flex-1 min-h-0">
			{/* 素材库面板 */}
			<MaterialLibrary
				onTimelineDrop={handleTimelineDrop}
				onPreviewDrop={handlePreviewDrop}
			/>
			<ElementSettingsPanel />
			<div className="flex-2 min-h-24 bg-neutral-900">
				<PreviewEditor />
			</div>
			<div
				className="min-h-60 flex flex-col border-t border-neutral-700"
				style={{ height: timelineMaxHeight }}
			>
				{/* 拖拽手柄 */}
				<div
					className="h-1.5 cursor-ns-resize bg-neutral-700 hover:bg-neutral-600 active:bg-blue-500 transition-colors shrink-0"
					onMouseDown={handleResizeMouseDown}
				/>
				<TimelineEditor />
			</div>
		</div>
	);
};

const Editor = () => {
	const [elements, setElements] = useState<TimelineElement[]>([]);
	const [tracks, setTracks] = useState<TimelineTrack[]>([]);
	const [timelineFps, setTimelineFps] = useState(30);
	const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		try {
			const loaded = loadTimelineFromObject(timelineData as any);
			setElements(loaded.elements);
			setTracks(loaded.tracks);
			setTimelineFps(loaded.fps);
			setCanvasSize(loaded.canvas);
		} catch (error) {
			console.error("Failed to load timeline:", error);
		} finally {
			setIsLoading(false);
		}
	}, []);

	const queryClient = new QueryClient();

	if (isLoading) {
		return <div>Loading timeline...</div>;
	}

	return (
		<QueryClientProvider client={queryClient}>
			<Toaster />
			<TimelineProvider
				elements={elements}
				tracks={tracks}
				canvasSize={canvasSize}
				fps={timelineFps}
			>
				<ModelManager>
					<PreviewProvider>
						<EditorContent />
					</PreviewProvider>
				</ModelManager>
			</TimelineProvider>
		</QueryClientProvider>
	);
};

export default Editor;
