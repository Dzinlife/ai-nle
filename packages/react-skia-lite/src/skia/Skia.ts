import { LoadSkiaWeb } from "../LoadSkiaWeb";
import { JsiSkApi } from "./web";

const _CanvasKit = await LoadSkiaWeb();

if (!_CanvasKit) {
	throw new Error("CanvasKit is not initialized");
}

export const CanvasKit = _CanvasKit;

export const Skia = JsiSkApi(CanvasKit);
