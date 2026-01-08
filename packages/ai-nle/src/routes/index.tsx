import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

export const Route = createFileRoute("/")({
	component: RouteComponent,
	ssr: false,
});

const Editor = lazy(() => import("@/editor/index"));

function RouteComponent() {
	return (
		<div className="flex flex-col flex-1 min-h-0">
			<Suspense fallback={<div>Loading CanvasKit...</div>}>
				<Editor />
			</Suspense>
		</div>
	);
}
