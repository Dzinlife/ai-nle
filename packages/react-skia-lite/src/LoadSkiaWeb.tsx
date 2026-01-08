import type {
	CanvasKitInitOptions,
	CanvasKit as CanvasKitType,
} from "canvaskit-wasm";
import CanvasKitInit from "canvaskit-wasm/bin/full/canvaskit";

declare global {
	var CanvasKit: CanvasKitType;
	var global: typeof globalThis;
}

if (typeof global === "undefined") {
	Object.defineProperty(globalThis, "global", {
		value: globalThis,
		writable: true,
		configurable: true,
	});
}

export let ckSharedPromise: Promise<CanvasKitType>;

export const LoadSkiaWeb = async (opts?: CanvasKitInitOptions) => {
	if (global.CanvasKit !== undefined) {
		return;
	}
	ckSharedPromise = ckSharedPromise ?? CanvasKitInit(opts);
	const CanvasKit = await ckSharedPromise;
	// The CanvasKit API is stored on the global object and used
	// to create the JsiSKApi in the Skia.web.ts file.
	global.CanvasKit = CanvasKit;

	return CanvasKit;
};
