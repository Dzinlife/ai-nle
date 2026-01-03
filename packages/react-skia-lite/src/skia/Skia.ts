import type { Skia as SkiaType } from "./types";
import { JsiSkApi } from "./web";

// export const Skia = JsiSkApi(global.CanvasKit);

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
