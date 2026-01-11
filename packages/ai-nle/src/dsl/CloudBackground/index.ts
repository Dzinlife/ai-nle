import CloudBackgroundRenderer from "./renderer";
import { CloudBackgroundTimeline } from "./timeline";

export {
	type CloudBackgroundInternal,
	type CloudBackgroundProps,
	createCloudBackgroundModel,
} from "./model";
export { CloudBackgroundTimeline } from "./timeline";

CloudBackgroundRenderer.displayName = "CloudBackground";
CloudBackgroundRenderer.timelineComponent = CloudBackgroundTimeline as any;

export default CloudBackgroundRenderer;
