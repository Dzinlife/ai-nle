import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { EditorElement } from "@/dsl/types";
import PreviewEditor from "./PreviewEditor";
import PreviewProvider from "./PreviewProvider";
import { TimelineProvider } from "./TimelineContext";
import TimelineEditor from "./TimelineEditor";
import { testTimeline } from "./timeline";

// 从 timeline JSX 中解析出初始状态
function parseTimeline(timelineElement: React.ReactElement): EditorElement[] {
	const elements: EditorElement[] = [];

	const children = (timelineElement.props as { children?: React.ReactNode })
		.children;

	React.Children.forEach(children, (child) => {
		if (React.isValidElement(child)) {
			elements.push(child as EditorElement);
		}
	});

	return elements;
}

const Editor = () => {
	const queryClient = new QueryClient();
	return (
		<QueryClientProvider client={queryClient}>
			<TimelineProvider elements={parseTimeline(testTimeline)}>
				<PreviewProvider>
					<div className="flex flex-col flex-1 min-h-0">
						<div className="flex-2 min-h-24 bg-neutral-900">
							<PreviewEditor />
						</div>
						<div className="flex-1 min-h-16 flex border-t border-neutral-700">
							<TimelineEditor />
						</div>
					</div>
				</PreviewProvider>
			</TimelineProvider>
		</QueryClientProvider>
	);
};

export default Editor;
