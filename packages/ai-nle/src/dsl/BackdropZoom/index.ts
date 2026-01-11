import BackdropZoom from "./renderer";
import { BackdropZoomTimeline } from "./timeline";

export { type BackdropZoomProps, createBackdropZoomModel } from "./model";

BackdropZoom.displayName = "BackdropZoom";
BackdropZoom.timelineComponent = BackdropZoomTimeline as any;

export default BackdropZoom;
