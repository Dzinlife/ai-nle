import ClipRenderer from "./renderer";
import { ClipTimeline } from "./timeline";

export { type ClipInternal, type ClipProps, createClipModel } from "./model";
export { ClipTimeline } from "./timeline";

ClipRenderer.displayName = "Clip";
ClipRenderer.timelineComponent = ClipTimeline as any;

export default ClipRenderer;
