import { LoadSkiaWeb } from "../LoadSkiaWeb";
import { JsiSkApi } from "./web";

const CanvasKit = await LoadSkiaWeb();

if (!CanvasKit) {
	throw new Error("CanvasKit is not initialized");
}

export const Skia = JsiSkApi(CanvasKit);
