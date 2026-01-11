import Lottie from "./renderer";
import { LottieTimeline } from "./timeline";

export { createLottieModel, type LottieProps } from "./model";

Lottie.displayName = "Lottie";
Lottie.timelineComponent = LottieTimeline as any;

export default Lottie;
