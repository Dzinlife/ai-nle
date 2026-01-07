import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LoadSkiaWeb } from "react-skia-lite";
import PreviewProvider from "@/editor/PreviewProvider";
import { TimelineProvider } from "@/editor/TimelineContext";

export const Route = createFileRoute("/")({
	component: RouteComponent,
	ssr: false,
});

const LazyLoadComponents = lazy(async () => {
	await LoadSkiaWeb();
	const TimelineEditor = (await import("@/editor/TimelineEditor")).default;
	const Preview = (await import("@/editor/Preview")).default;
	return {
		default: () => (
			<div className="flex flex-col flex-1 min-h-0">
				<div className="flex-2 min-h-24 bg-neutral-900">
					<Preview />
				</div>
				<div className="flex-1 min-h-16 flex border-t border-neutral-700">
					<TimelineEditor />
				</div>
			</div>
		),
	};
});

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1 min-h-0">
			<Suspense fallback={<div>Loading CanvasKit...</div>}>
				<PreviewProvider>
					<TimelineProvider>
						<LazyLoadComponents />
					</TimelineProvider>
				</PreviewProvider>
			</Suspense>
		</div>
	);
}
