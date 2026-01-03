import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { LoadSkiaWeb, WithSkiaWeb } from "react-skia-lite";
import SkiaNeon from "@/components/SkiaNeon";
import SkiaCircle from "../components/SkiaCircle";

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

function RouteComponent() {
	return (
		<div style={{ padding: "20px" }}>
			<Suspense fallback={<div>Loading CanvasKit...</div>}>
				<LazySkiaVideo />
				{/* <LazySkiaVideo2 /> */}
				<LazySkiaCircle />
				<LazySkiaNeon />
				<LazySkiaShader />
			</Suspense>
		</div>
	);
}
