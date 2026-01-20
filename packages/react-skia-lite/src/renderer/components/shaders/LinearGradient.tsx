import type { LinearGradientProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors";

export const LinearGradient = (props: SkiaProps<LinearGradientProps>) => {
	return <skLinearGradient {...props} />;
};
