import {
	type ComponentProps,
	type ComponentType,
	lazy,
	Suspense,
	useMemo,
} from "react";
import { ckSharedPromise, LoadSkiaWeb } from "./LoadSkiaWeb";

type NonOptionalKeys<T> = {
	[k in keyof T]-?: undefined extends T[k] ? never : k;
}[keyof T];

type WithSkiaProps<TProps> = {
	fallback?: ComponentProps<typeof Suspense>["fallback"];
	getComponent: () => Promise<{ default: ComponentType<TProps> }>;
	opts?: Parameters<typeof LoadSkiaWeb>[0];
} & (NonOptionalKeys<TProps> extends never
	? {
			componentProps?: TProps;
		}
	: {
			componentProps: TProps;
		});

export const WithSkiaWeb = <TProps extends object>({
	getComponent,
	fallback,
	opts,
	componentProps,
}: WithSkiaProps<TProps>) => {
	const Inner = useMemo(
		(): any =>
			lazy(async () => {
				await LoadSkiaWeb(opts);
				return getComponent();
			}),
		// We we to run this only once.
		[],
	);
	return (
		<Suspense fallback={fallback ?? null}>
			<Inner {...componentProps} />
		</Suspense>
	);
};

// const SuspenseSkia = () => {
// 	if (!global.CanvasKit) {
// 		LoadSkiaWeb();
// 		throw ckSharedPromise;
// 	}
// 	return null;
// };

// export const WithSkiaWeb = ({
// 	fallback,
// 	children,
// }: {
// 	fallback?: ComponentProps<typeof Suspense>["fallback"];
// 	children: React.ReactNode;
// }) => {
// 	return (
// 		<Suspense fallback={fallback}>
// 			<SuspenseSkia />
// 			{global.CanvasKit && children}
// 		</Suspense>
// 	);
// };
