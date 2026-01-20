import type { Line2DPathEffectProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors/Animations/Animations";

export const Line2DPathEffect = (props: SkiaProps<Line2DPathEffectProps>) => {
	return <skLine2DPathEffect {...props} />;
};
