import { LoadSkiaWeb } from "../LoadSkiaWeb";
import type { Skia as SkiaType } from "./types";
import { JsiSkApi } from "./web";

if (typeof global !== "undefined" && !global.CanvasKit) {
	await LoadSkiaWeb();
}

export const Skia = new Proxy({} as SkiaType, {
	get(_target, prop) {
		const skia = JsiSkApi(global.CanvasKit);
		const value = skia[prop as keyof SkiaType];
		// If it's a function, bind it to maintain 'this' context
		if (typeof value === "function") {
			return value.bind(skia);
		}
		return value;
	},
}) as SkiaType;
