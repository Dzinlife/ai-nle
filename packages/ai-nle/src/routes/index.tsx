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
		<div className="flex flex-col flex-1 min-h-0">
			<Suspense fallback={<div>Loading CanvasKit...</div>}>
				<PreviewProvider>
					<TimelineProvider>
						<div className="flex flex-col flex-1 min-h-0">
							<div className="flex-2 min-h-24 bg-neutral-900">
								<LazyPreview />
							</div>
							<div className="flex-1 min-h-16 flex border-t border-neutral-700">
								<LazyTimelineEditor />
							</div>
						</div>
					</TimelineProvider>
				</PreviewProvider>
			</Suspense>
		</div>
	);
}
