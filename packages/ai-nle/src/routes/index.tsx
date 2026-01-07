import { createFileRoute } from "@tanstack/react-router";
import React, { lazy, Suspense, useMemo } from "react";
import { LoadSkiaWeb } from "react-skia-lite";
import { EditorElement } from "@/dsl/types";
import PreviewProvider from "@/editor/PreviewProvider";
import { TimelineProvider } from "@/editor/TimelineContext";
import { testTimeline } from "@/editor/timeline";

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

export const Route = createFileRoute("/")({
	component: RouteComponent,
	ssr: false,
});

const LazyLoadComponents = lazy(async () => {
	await LoadSkiaWeb();
	const TimelineEditor = (await import("@/editor/TimelineEditor")).default;
	const Preview = (await import("@/editor/PreviewEditor")).default;

	return {
		default: () => (
			<TimelineProvider elements={parseTimeline(testTimeline)}>
				<PreviewProvider>
					<div className="flex flex-col flex-1 min-h-0">
						<div className="flex-2 min-h-24 bg-neutral-900">
							<Preview />
						</div>
						<div className="flex-1 min-h-16 flex border-t border-neutral-700">
							<TimelineEditor />
						</div>
					</div>
				</PreviewProvider>
			</TimelineProvider>
		),
	};
});

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1 min-h-0">
			<Suspense fallback={<div>Loading CanvasKit...</div>}>
				<LazyLoadComponents />
			</Suspense>
		</div>
	);
}
