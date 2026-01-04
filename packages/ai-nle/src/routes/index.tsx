import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LoadSkiaWeb, WithSkiaWeb } from "react-skia-lite";
import PreviewProvider, { usePreview } from "@/components/PreviewProvider";

export const Route = createFileRoute("/")({
	component: RouteComponent,
	ssr: false,
});

const LazySkiaNeon = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/SkiaNeon")).default,
	};
});

const LazySkiaCircle = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/SkiaCircle")).default,
	};
});

const LazySkiaShader = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/SkiaShader")).default,
	};
});

const LazySkiaVideo = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/SkiaVideo")).default,
	};
});

// const LazySkiaVideo2 = lazy(async () => {
// 	await LoadSkiaWeb();
// 	return {
// 		default: (await import("@/components/SkiaVideo2")).default,
// 	};
// });

const LazySkiaFont = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/SkiaFont")).default,
	};
});

const LazySkiaDnd = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/SkiaDnd")).default,
	};
});

const LazySkiaZoom = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/SkiaZoom")).default,
	};
});

const LazyPreview = lazy(async () => {
	await LoadSkiaWeb();
	return {
		default: (await import("@/components/Preview")).default,
	};
});
function RouteComponent() {
	return (
		<div style={{ padding: "20px" }}>
			<Suspense fallback={<div>Loading CanvasKit...</div>}>
				<PreviewProvider>
					<LazyPreview />
				</PreviewProvider>
				<LazySkiaZoom />
				<LazySkiaDnd />
				<LazySkiaFont />
				<LazySkiaVideo />
				{/* <LazySkiaVideo2 /> */}
				<LazySkiaCircle />
				<LazySkiaNeon />
				<LazySkiaShader />
			</Suspense>
		</div>
	);
}
