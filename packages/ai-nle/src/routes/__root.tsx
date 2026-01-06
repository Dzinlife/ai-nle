import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import Header from "../components/Header";

import appCss from "../styles.css?url";

// Lazy load devtools to prevent syntax errors from breaking the app
const TanStackDevtools = lazy(() =>
	import("@tanstack/react-devtools").then((mod) => ({
		default: mod.TanStackDevtools,
	})),
);

const TanStackRouterDevtoolsPanel = lazy(() =>
	import("@tanstack/react-router-devtools").then((mod) => ({
		default: mod.TanStackRouterDevtoolsPanel,
	})),
);

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content:
					"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
			},
			{
				title: "TanStack Start Starter",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
				<meta
					name="viewport"
					content="width=device-width, initial-scale=1, user-scalable=no"
				/>
			</head>
			<body
				style={{
					touchAction: "none",
					userSelect: "none",
					WebkitUserSelect: "none",
				}}
			>
				<Header />
				{children}
				{import.meta.env.DEV && (
					<Suspense fallback={null}>
						<TanStackDevtools
							config={{
								position: "bottom-right",
							}}
							plugins={[
								{
									name: "Tanstack Router",
									render: (
										<Suspense fallback={null}>
											<TanStackRouterDevtoolsPanel />
										</Suspense>
									),
								},
							]}
						/>
					</Suspense>
				)}
				<Scripts />
			</body>
		</html>
	);
}
