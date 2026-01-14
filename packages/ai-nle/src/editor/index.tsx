import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useCallback, useEffect, useState } from "react";
import { ModelManager } from "@/dsl/model";
import { TimelineElement } from "@/dsl/types";
import ElementSettingsPanel from "./ElementSettingsPanel";
import MaterialLibrary, { type MaterialItem } from "./MaterialLibrary";
import PreviewEditor from "./PreviewEditor";
import PreviewProvider from "./PreviewProvider";
import { TimelineProvider, useTimelineStore } from "./TimelineContext";
import TimelineEditor from "./TimelineEditor";
import timelineData from "./timeline.json";
import { loadTimelineFromObject } from "./timelineLoader";

// 导入所有组件以触发注册
import "@/dsl/BackdropZoom";
import "@/dsl/Clip";
import "@/dsl/CloudBackground";
import "@/dsl/ColorFilterLayer";
import "@/dsl/Image";
import "@/dsl/Lottie";

// 调试：检查组件注册情况
import { componentRegistry } from "@/dsl/model/componentRegistry";

console.log("[Editor] Registered components:", componentRegistry.getTypes());

// 内部编辑器内容组件（可以使用 hooks）
const EditorContent: React.FC = () => {
	const setElements = useTimelineStore((state) => state.setElements);
	const currentTime = useTimelineStore((state) => state.currentTime);

	// 处理素材库拖拽放置到时间线
	const handleTimelineDrop = useCallback(
		(item: MaterialItem, trackIndex: number, time: number) => {
			const newElement = {
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
				timeline: {
					start: time,
					end: time + 5,
					trackIndex,
				},
				render: {
					zIndex: 0,
					visible: true,
					opacity: 1,
				},
			};

			setElements((prev) => [...prev, newElement]);
		},
		[setElements],
	);

	// 处理素材库拖拽放置到预览画布
	const handlePreviewDrop = useCallback(
		(item: MaterialItem, canvasX: number, canvasY: number) => {
			const elementWidth = item.width ?? 400;
			const elementHeight = item.height ?? 300;

			const newElement = {
				id: `element-${Date.now()}`,
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
				timeline: {
					start: currentTime,
					end: currentTime + 5,
					trackIndex: 1, // 默认放到轨道 1（非主轨道）
				},
				render: {
					zIndex: 0,
					visible: true,
					opacity: 1,
				},
			};

			setElements((prev) => [...prev, newElement]);
		},
		[setElements, currentTime],
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
			<div className="flex-1 min-h-16 flex border-t border-neutral-700">
				<TimelineEditor />
			</div>
		</div>
	);
};

const Editor = () => {
	const [elements, setElements] = useState<TimelineElement[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		try {
			const loadedElements = loadTimelineFromObject(timelineData as any);
			setElements(loadedElements);
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
			<TimelineProvider
				elements={elements}
				canvasSize={{ width: 1920, height: 1080 }}
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
