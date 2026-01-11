import ImageRenderer from "./renderer";
import { ImageTimeline } from "./timeline";

export { createImageModel, type ImageInternal, type ImageProps } from "./model";

ImageRenderer.displayName = "Image";
ImageRenderer.timelineComponent = ImageTimeline as any;

export default ImageRenderer;
