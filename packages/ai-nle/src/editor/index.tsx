import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { ModelManager } from "@/dsl/model";
import { TimelineElement } from "@/dsl/types";
import PlaybackToolbar from "./PlaybackToolbar";
import PreviewEditor from "./PreviewEditor";
import PreviewProvider from "./PreviewProvider";
import { TimelineProvider } from "./TimelineContext";
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
						<div className="flex flex-col flex-1 min-h-0">
							<div className="flex-2 min-h-24 bg-neutral-900">
								<PreviewEditor />
							</div>
							<PlaybackToolbar />
							<div className="flex-1 min-h-16 flex border-t border-neutral-700">
								<TimelineEditor />
							</div>
						</div>
					</PreviewProvider>
				</ModelManager>
			</TimelineProvider>
		</QueryClientProvider>
	);
};

export default Editor;
