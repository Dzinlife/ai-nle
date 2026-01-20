import type { BlurImageFilterProps } from "../../../dom/types";
import type { SkiaDefaultProps } from "../../processors/Animations/Animations";

export const Blur = ({
	mode = "decal",
	...props
}: SkiaDefaultProps<BlurImageFilterProps, "mode">) => {
	return <skBlurImageFilter mode={mode} {...props} />;
};
