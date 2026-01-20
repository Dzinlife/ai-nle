import type { DrawingNodeProps } from "../../dom/types";
import type { SkiaProps } from "../processors";

export const Paint = (props: SkiaProps<DrawingNodeProps>) => {
	return <skPaint {...props} />;
};
