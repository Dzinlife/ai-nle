import type { Path2DPathEffectProps } from "../../../dom/types";
import type { SkiaProps } from "../../processors/Animations/Animations";

export const Path2DPathEffect = (props: SkiaProps<Path2DPathEffectProps>) => {
	return <skPath2DPathEffect {...props} />;
};
