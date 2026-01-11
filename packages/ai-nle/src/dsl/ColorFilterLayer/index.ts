import ColorFilterLayer from "./renderer";
import { ColorFilterLayerTimeline } from "./timeline";

export {
	type ColorFilterLayerProps,
	createColorFilterLayerModel,
} from "./model";

ColorFilterLayer.displayName = "ColorFilterLayer";
ColorFilterLayer.timelineComponent = ColorFilterLayerTimeline as any;

export default ColorFilterLayer;
