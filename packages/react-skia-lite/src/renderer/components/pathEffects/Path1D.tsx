import type { Path1DPathEffectProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors/Animations/Animations";

export const Path1DPathEffect = (props: SkiaProps<Path1DPathEffectProps>) => {
	return <skPath1DPathEffect {...props} />;
};
