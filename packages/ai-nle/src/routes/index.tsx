import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LoadSkiaWeb } from "react-skia-lite";
import PreviewProvider from "@/components/PreviewProvider";
import { TimelineProvider } from "@/components/TimelineContext";

export const Route = createFileRoute("/")({
	component: RouteComponent,
	ssr: false,
});
const LazyPreview = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/Preview")).default,
	};
});

const LazyTimelineEditor = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/TimelineEditor")).default,
	};
});

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1">
			<Suspense fallback={<div>Loading CanvasKit...</div>}>
				<PreviewProvider>
					<TimelineProvider>
						<div className="flex flex-col flex-1">
							<LazyPreview />
							<LazyTimelineEditor />
						</div>
					</TimelineProvider>
				</PreviewProvider>
			</Suspense>
		</div>
	);
}
