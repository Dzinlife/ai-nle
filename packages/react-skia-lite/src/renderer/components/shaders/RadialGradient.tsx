import type { RadialGradientProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const RadialGradient = (props: SkiaProps<RadialGradientProps>) => {
	return <skRadialGradient {...props} />;
};
